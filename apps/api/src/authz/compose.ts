import { RequestHandler } from 'express';
import { AuthorizationError, NotFoundError } from '../errors/index.js';

/**
 * Combinator: passes if **any** of the given guards passes.
 *
 *   anyOf(requireProjectOwner(), requireAdmin())
 *
 * Semantics:
 * - first guard that does not fail wins; if all fail, a403 is produced
 * - a404 from any guard short-circuits immediately: whether the resource
 *   exists is objective and must not be masked by later403s
 * - guards must never send a response themselves — only `next()` / `next(err)`
 */
export function anyOf(...guards: RequestHandler[]): RequestHandler {
  return (req, res, next) => {
    let index = 0;
    let lastError: unknown;

    const run = (): void => {
      if (index >= guards.length) {
        next(lastError instanceof AuthorizationError ? lastError : new AuthorizationError());
        return;
      }

      const guard = guards[index++];

      guard(req, res, (err?: unknown) => {
        if (err === undefined) {
          next(); // authorized by this guard
          return;
        }
        if (err instanceof NotFoundError) {
          next(err); // resource missing — objective, stop now
          return;
        }
        lastError = err;
        run(); // try the next guard
      });
    };

    run();
  };
}
