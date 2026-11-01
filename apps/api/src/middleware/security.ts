import { Router } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { env } from '../config/env.js';

/**
 * Security stage of the middleware chain:
 *   logger → **security** → JSON parser → authentication → route → error handler
 *
 * - `helmet` sets hardened HTTP headers.
 * - `cors` allows the configured web app origin(s), credentials enabled.
 *
 * WEB_ORIGIN accepts a comma-separated list (spec §18.4 delta, 2026-10-25) so
 * a split-origin deployment can allow production, Vercel preview deploys and
 * local dev against the same API without a redeploy per environment:
 *   WEB_ORIGIN=https://thesistrack.vercel.app,http://localhost:5173
 * Requests without an Origin header (curl, same-origin navigations) pass
 * through untouched.
 */
const security = Router();

const allowedOrigins = env.WEB_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

security.use(helmet());
security.use(
  cors({
    origin: (origin, callback) => {
      const allowed = !origin || allowedOrigins.includes(origin);
      // A rejected origin is otherwise invisible in production: the browser
      // only says "CORS error" and the server log looks clean. One warn line
      // names the exact origin to fix in WEB_ORIGIN.
      if (!allowed) {
        console.warn(
          `CORS: origin rejected — ${origin} (WEB_ORIGIN allows: ${allowedOrigins.join(', ')})`,
        );
      }
      callback(null, allowed);
    },
    credentials: true,
  }),
);

export { security };
