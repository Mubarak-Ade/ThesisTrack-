import { Router } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { env } from '../config/env.js';

/**
 * Security stage of the middleware chain:
 *   logger → **security** → JSON parser → authentication → route → error handler
 *
 * - `helmet` sets hardened HTTP headers.
 * - `cors` only allows the web app origin, with credentials enabled.
 */
const security = Router();

security.use(helmet());
security.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));

export { security };
