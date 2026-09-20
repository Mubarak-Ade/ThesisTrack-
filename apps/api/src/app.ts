import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import { logger } from './middleware/logger.js';
import { errorHandler } from './middleware/error.js';
import { notFoundHandler } from './middleware/not-found.js';
import v1Routes from './routes/v1/index.js';

const app = express();

app.use(logger);
app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(express.json());

app.use('/api/v1', v1Routes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
