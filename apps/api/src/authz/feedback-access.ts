import type { Request, RequestHandler } from 'express';

import { AuthorizationError, NotFoundError } from '../errors/index.js';
import { asyncHandler } from '../lib/async-handler.js';
import { isValidUuid } from '../lib/uuid.js';
import { getFeedbackRow } from '../modules/feedback/service.js';
import type { FeedbackWithAuthor } from '../modules/feedback/types.js';
import { requireUser } from './guards.js';

declare global {
  namespace Express {
    interface Request {
      /** The feedback loaded by `requireFeedbackAccess` — cached. */
      feedback?: FeedbackWithAuthor;
    }
  }
}

/** Who may pass: the author, an administrator, or both (§4.5, §11.7). */
export type FeedbackAccess = 'author' | 'admin';

export interface FeedbackGuardOptions {
  /** Route param holding the feedback id (default: 'feedbackId'). */
  param?: string;
  /** Access levels permitted through (default: author only). */
  allow?: readonly FeedbackAccess[];
}

/**
 * Layer 2 — resource authorization for `/feedback/:feedbackId`.
 *
 * Loads the row (404 for a malformed or unknown id, §13.5 / Phase 3's
 * validate-first convention) and applies §11.7's authorship rules:
 *
 *   PATCH  → `{ allow: ['author'] }` — §4.5 "Feedback — edit … own": even an
 *            administrator may edit only rows they authored.
 *   DELETE → `{ allow: ['author', 'admin'] }` — §4.5 "delete own" + "delete
 *            any": the author or an administrator.
 *
 * An existing row the caller may not touch answers 403 — existence is never
 * masked by a permission failure (§13.5).
 */
export function requireFeedbackAccess(options: FeedbackGuardOptions = {}): RequestHandler {
  const param = options.param ?? 'feedbackId';
  const allow = options.allow ?? ['author'];

  return asyncHandler(async (req, _res, next) => {
    const user = requireUser(req);

    const raw = req.params[param];
    const id = typeof raw === 'string' ? raw : undefined;
    const feedback = id && isValidUuid(id) ? await getFeedbackRow(id) : undefined;
    if (!feedback) {
      throw new NotFoundError('Feedback');
    }
    req.feedback ??= feedback;

    const isAuthor = feedback.authorId === user.id;
    const isAdmin = user.role === 'administrator';
    const permitted =
      (isAuthor && allow.includes('author')) || (isAdmin && allow.includes('admin'));
    if (!permitted) {
      throw new AuthorizationError('You do not have permission to modify this feedback');
    }

    next();
  });
}

/** Typed accessor for handlers running behind `requireFeedbackAccess`. */
export function getFeedback(req: Request): FeedbackWithAuthor {
  if (!req.feedback) {
    throw new NotFoundError('Feedback'); // guard should have loaded it
  }
  return req.feedback;
}
