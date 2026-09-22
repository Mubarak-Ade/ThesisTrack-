import express from 'express';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { logger } from './middleware/logger.js';
import { security } from './middleware/security.js';
import { authenticate } from './middleware/auth.js';
import { notFoundHandler } from './middleware/not-found.js';
import { errorHandler } from './middleware/error.js';
import routes from './routes.js';

const app = express();

if (env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// 1. Request logger
app.use(logger);

// 2. Security (helmet headers + CORS)
app.use(security);

// 3. Parsers — HTTP-only refresh cookie + JSON body
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));

// 4. Authentication — verifies the access-token JWT; public paths pass through
app.use(authenticate);

// 5. Authorization — role checks are route-scoped via authorize(...roles),
//    applied inside the routers between authentication and the handler.

// 6. Routes
app.use(routes);

// 7. Error handling — unmatched routes become 404s, then the central handler
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
