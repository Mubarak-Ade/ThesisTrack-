import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';

import { env } from '../config/env.js';
import { BusinessRuleError, ValidationError } from '../errors/index.js';
import { isValidUuid } from './uuid.js';

declare global {
  namespace Express {
    interface Request {
      /** Absolute path of the file multer is writing (§14.4 abort/error cleanup). */
      uploadTempPath?: string;
    }
  }
}

/** Absolute uploads root — `UPLOAD_DIR` (spec §18.6), resolved against cwd. */
export const UPLOADS_ROOT = path.resolve(process.cwd(), env.UPLOAD_DIR);

/** Spec §14.4 allowed MIME — the fileFilter gate, nothing else is written. */
export const ALLOWED_UPLOAD_MIME = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/zip',
  'text/plain',
  'text/csv',
  'image/png',
  'image/jpeg',
] as const;

const ALLOWED_MIME: ReadonlySet<string> = new Set<string>(ALLOWED_UPLOAD_MIME);

/**
 * Canonical extension per accepted MIME. The filename is derived from THIS
 * map only, so no client string ever reaches the filesystem (§14.4 — the
 * original name is kept for display, never for storage).
 */
const MIME_EXTENSIONS: Record<string, string> = {
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/zip': '.zip',
  'text/plain': '.txt',
  'text/csv': '.csv',
  'image/png': '.png',
  'image/jpeg': '.jpg',
};

function extensionFor(mimeType: string): string {
  return MIME_EXTENSIONS[mimeType] ?? '.bin'; // unreachable via fileFilter
}

const proposalStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const proposalId = typeof req.params.proposalId === 'string' ? req.params.proposalId : '';
    // Unreachable with a bad id: validate(params) + requireProposalAccess ran
    // first (§9.4). Kept so the destination is UUID-derived even if wiring
    // changes — spec §14.4: destination from ids, never from user input.
    if (!isValidUuid(proposalId)) {
      cb(new ValidationError('Invalid proposal id', [{ path: 'proposalId', message: 'Invalid proposal id' }]), '');
      return;
    }
    const dir = path.join(UPLOADS_ROOT, 'proposals', proposalId);
    fs.mkdir(dir, { recursive: true }, (err) => {
      if (err) {
        cb(err, '');
        return;
      }
      cb(null, dir);
    });
  },
  filename: (req, file, cb) => {
    const proposal = req.proposal;
    if (!proposal) {
      // A missing guard is a wiring bug: fail loudly (500) rather than write
      // a file whose version tag cannot be trusted.
      cb(new Error('proposal context is required before accepting an upload'), '');
      return;
    }
    // §14.3/§14.4 — fully server-generated `v<version>-<uuid>.<ext>`; the
    // version comes from the authorized row, the uuid from the server, the
    // extension from the MIME map above.
    const name = `v${proposal.version}-${randomUUID()}${extensionFor(file.mimetype)}`;
    req.uploadTempPath = path.join(UPLOADS_ROOT, 'proposals', proposal.id, name);
    cb(null, name);
  },
});

const fileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  if (ALLOWED_MIME.has(file.mimetype)) {
    cb(null, true);
    return;
  }
  // Single-arg callback = the error overload: multer forwards the AppError
  // unchanged, and the error handler serializes it as the usual 422.
  cb(
    new BusinessRuleError('File type not allowed', [
      { path: 'file', message: `Allowed types: ${ALLOWED_UPLOAD_MIME.join(', ')}` },
    ]),
  );
};

const uploadSingle = multer({
  storage: proposalStorage,
  limits: { fileSize: env.UPLOAD_MAX_BYTES },
  fileFilter,
}).single('file');

/**
 * Uploads whose row exists — their bytes belong to the database now and must
 * not be unlinked by the failure/abort cleanup below.
 */
const committedUploads = new WeakSet<Request>();

/** Called by the controller once `POST …/attachments` persisted its row. */
export function commitUpload(req: Request): void {
  committedUploads.add(req);
}

/**
 * Route middleware: multipart field `file`, ≤ `UPLOAD_MAX_BYTES`, MIME-gated,
 * written under `uploads/proposals/<proposalId>/` with a server-derived name.
 *
 * Spec §14.4 — an unwritten temp file is removed on error and on request
 * abort: `close` fires after success, failure and abort alike, and only
 * uploads the controller never committed are unlinked (ENOENT ignored).
 * Multer's own error path (size limit, bad MIME) also refuses the write.
 */
export function uploadProposalDocument(req: Request, res: Response, next: NextFunction): void {
  res.on('close', () => {
    const pending = req.uploadTempPath;
    if (pending && !committedUploads.has(req)) {
      void removeFileQuietly(pending);
    }
  });

  uploadSingle(req, res, (err) => {
    if (err) {
      next(err);
      return;
    }
    next();
  });
}

/** Best-effort unlink: a missing file is the happy case for cleanup paths. */
export async function removeFileQuietly(absolutePath: string): Promise<void> {
  try {
    await fs.promises.unlink(absolutePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error(`[uploads] failed to remove ${absolutePath}`, err);
    }
  }
}

/**
 * `storage_key` (relative, DB-held) → absolute path, refusing anything that
 * escapes the uploads root. The key is never concatenated with client input
 * (§14.4); this containment check is the belt to that braces — a key with
 * `..` in it means corruption, not a client error, so it surfaces as 500.
 */
export function resolveStorageKey(storageKey: string): string {
  const absolute = path.resolve(UPLOADS_ROOT, storageKey);
  if (absolute !== UPLOADS_ROOT && !absolute.startsWith(UPLOADS_ROOT + path.sep)) {
    throw new Error('storage key escapes the uploads root');
  }
  return absolute;
}

/**
 * §14.5 download header: an ASCII `filename` fallback plus the RFC 5987
 * `filename*` form, so any original name (accents, spaces, CJK) round-trips.
 */
export function attachmentDisposition(originalFilename: string): string {
  // The quoted fallback must be printable ASCII — Node refuses control and
  // non-ASCII bytes in header values — so anything else becomes `_`; the
  // unmodified name travels in `filename*`.
  const ascii = originalFilename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(originalFilename).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
