import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { and, eq, lte } from 'drizzle-orm';
import type { Request, Response } from 'express';

import { db } from '../config/db.js';
import { asyncHandler } from '../lib/async-handler.js';
import { ConflictError, ValidationError } from '../errors/index.js';
import { idempotencyKeys } from '../schema/index.js';

/**
 * §11.12 — `Idempotency-Key` replay protection (ADR-07), honoured on the five
 * POSTs: proposals, submissions, submission versions, users, users/import.
 *
 * The header is OPTIONAL — an absent (or empty) header bypasses this
 * middleware entirely, so clients that never send it get today's behaviour
 * plus the natural guards (unique constraints, all-or-nothing import).
 *
 * The algorithm follows §11.12 literally:
 *
 *   1. INSERT idempotency_keys (key, user_id, endpoint, request_hash,
 *      expires_at = now() + 24 h) ON CONFLICT (key, user_id, endpoint)
 *      DO NOTHING.
 *   2. No row inserted (already seen):
 *        a. request_hash differs → 409 "key reused with a different payload"
 *        b. still in-flight (response_status IS NULL) → 409 "request in progress"
 *        c. completed → REPLAY stored response_status + response_body verbatim
 *   3. Row inserted → run the handler, store response_status +
 *      response_body, i.e. the claim commits BEFORE the handler runs.
 *
 * Two deliberate readings of the spec, recorded in the Phase 8 results:
 *
 *  - **Verbatim replay.** The column stores `{ raw: <response bytes> }` —
 *    the wrapper, not the bare text: drizzle's jsonb mapper `JSON.stringify`s
 *    on write and `JSON.parse`s on read, so plain JSON text would round-trip
 *    back into an object (losing the exact bytes), while a wrapper object
 *    survives untouched. Replay `send()`s `raw` (byte-identical to the
 *    original response, status included).
 *  - **Every response is stored**, success or error (§11.12 step 4 says
 *    "store response_status + response_body" without discriminating). A retry
 *    after a failure therefore replays the same response rather than
 *    re-running the handler; a client that wants a fresh attempt after a
 *    failure uses a NEW key. The key row is only rolled back when the
 *    handler *crashes without responding* — impossible here, since the error
 *    middleware answers with JSON too.
 *
 * The response body is persisted BEFORE the bytes leave the socket, so a
 * client that already holds the response can always replay it.
 *
 * An `expires_at` in the past means the key is forgotten (§11.12's sweep is
 * only opportunistic — plan 8.3 piggybacks it on the session cleanup at
 * login), so a stale row is deleted and the claim retried rather than
 * replaying a 24-hour-old body.
 */

const HEADER = 'Idempotency-Key';
const KEY_TTL_MS = 24 * 60 * 60 * 1000; // §11.12: expires_at = now() + 24h
const MAX_KEY_LENGTH = 255; // idempotency_keys.key is varchar(255)
const CLAIM_ATTEMPTS = 3; // conflict → (swept | expired) → retry headroom

/** `POST /api/v1/proposals` — query stripped, trailing slashes trimmed. */
function endpointOf(req: Request): string {
  const path = (req.originalUrl.split('?')[0] ?? '').replace(/\/+$/, '');
  return `${req.method} ${path}`;
}

/** Recursively sort object keys so payload identity ignores key order. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(source)
        .sort()
        .map((key) => [key, canonicalize(source[key])]),
    );
  }
  return value;
}

function sha256(text: string | Buffer): string {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * The payload identity stored in `request_hash`: the canonicalised body plus,
 * for multipart uploads, the file's own bytes (fields alone cannot tell two
 * different uploads apart).
 */
export function hashPayload(body: unknown, file?: { bytes: Buffer }): string {
  let payload = JSON.stringify(canonicalize(body)) ?? 'null';
  if (file) payload += `|file:${sha256(file.bytes)}`;
  return sha256(payload);
}

function hashRequest(req: Request): string {
  return hashPayload(
    req.body,
    req.file ? { bytes: readFileSync(req.file.path) } : undefined,
  );
}

/**
 * §11.12's `expires_at` sweep — piggybacked on the session cleanup at login
 * (plan 8.3): expired keys are forgotten, unswept-but-expired keys are also
 * reclaimed inline by the middleware, so both paths agree on semantics.
 */
export async function purgeExpiredIdempotencyKeys(): Promise<void> {
  await db
    .delete(idempotencyKeys)
    .where(lte(idempotencyKeys.expiresAt, new Date()));
}

type ClaimOutcome =
  | { kind: 'claimed'; id: string }
  | { kind: 'seen'; row: typeof idempotencyKeys.$inferSelect }
  | { kind: 'vanished' };

async function tryClaim(
  key: string,
  userId: string,
  endpoint: string,
  requestHash: string,
): Promise<ClaimOutcome> {
  for (let attempt = 0; attempt < CLAIM_ATTEMPTS; attempt++) {
    const [claimed] = await db
      .insert(idempotencyKeys)
      .values({
        key,
        userId,
        endpoint,
        requestHash,
        expiresAt: new Date(Date.now() + KEY_TTL_MS),
      })
      .onConflictDoNothing()
      .returning({ id: idempotencyKeys.id });
    if (claimed) return { kind: 'claimed', id: claimed.id };

    // Already seen — §11.12 step 3.
    const existing = await db.query.idempotencyKeys.findFirst({
      where: and(
        eq(idempotencyKeys.key, key),
        eq(idempotencyKeys.userId, userId),
        eq(idempotencyKeys.endpoint, endpoint),
      ),
    });
    if (!existing) continue; // swept between insert and read — claim again
    if (existing.expiresAt.getTime() <= Date.now()) {
      // Expired = forgotten: drop the row and re-claim instead of replaying
      // a body older than the window.
      await db
        .delete(idempotencyKeys)
        .where(eq(idempotencyKeys.id, existing.id));
      continue;
    }
    return { kind: 'seen', row: existing };
  }
  return { kind: 'vanished' };
}

/**
 * Persist the handler's response against the claim, deferring the socket send
 * until the row lands — that ordering is what makes a completed request
 * immediately replayable.
 */
function attachCapture(id: string, res: Response): void {
  const original = res.json.bind(res);
  let persisted = false;
  res.json = ((body: unknown) => {
    if (persisted) return original(body);
    persisted = true;
    const raw = JSON.stringify(body);
    const status = res.statusCode;
    void db
      .update(idempotencyKeys)
      .set({ responseStatus: status, responseBody: { raw } })
      .where(eq(idempotencyKeys.id, id))
      .then(
        () => original(body),
        () => original(body), // never hold the response hostage to bookkeeping
      );
    return res;
  }) as Response['json'];
}

/**
 * Router-level guard: place it after authentication, role guards, validation
 * and resource guards, immediately before the controller — the claim should
 * only ever be spent by a request that is allowed to run.
 */
export const idempotency = asyncHandler(async (req, res, next) => {
  const raw = req.get(HEADER);
  if (raw === undefined) return next(); // optional header — bypass entirely
  const key = raw.trim();
  if (key === '') return next();
  if (key.length > MAX_KEY_LENGTH) {
    throw new ValidationError('Invalid Idempotency-Key', [
      { path: HEADER, message: `must be at most ${MAX_KEY_LENGTH} characters` },
    ]);
  }

  const userId = req.user!.id; // the five routes authenticate first (§9.4)
  const endpoint = endpointOf(req);
  const requestHash = hashRequest(req);

  const outcome = await tryClaim(key, userId, endpoint, requestHash);
  if (outcome.kind === 'claimed') {
    attachCapture(outcome.id, res);
    return next();
  }
  if (outcome.kind === 'vanished') {
    // The row kept vanishing between insert and read — only reachable past
    // the 24 h window (the sweep runs concurrently); stay in §11.12's
    // vocabulary rather than inventing a new status.
    throw new ConflictError('request in progress');
  }

  const { row } = outcome;
  if (row.requestHash !== requestHash) {
    // §11.12 3a — checked before anything else: the key names a different payload.
    throw new ConflictError('key reused with a different payload');
  }
  if (row.responseStatus === null) {
    // §11.12 3b — claimed, handler still running.
    throw new ConflictError('request in progress');
  }
  // §11.12 3c — replay the stored response verbatim: same status, same bytes.
  // Written as `{ raw }` (see the class comment); a bare string or a bare
  // object would only arise from a row written by something other than this
  // middleware, and either still replays as valid JSON.
  const stored = row.responseBody as { raw?: string } | string | null | undefined;
  const replayBody =
    typeof stored === 'string' ? stored : stored?.raw ?? JSON.stringify(stored);
  res.status(row.responseStatus);
  res.set('Content-Type', 'application/json; charset=utf-8');
  res.send(replayBody);
  return undefined;
});
