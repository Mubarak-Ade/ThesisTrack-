import app from './app.js';
import { env } from './config/env.js';

const server = app.listen(env.PORT, () => {
  console.log(`API server running on http://localhost:${env.PORT}`);
  console.log(`Environment: ${env.NODE_ENV}`);
});

const shutdown = () => {
  console.log('Shutting down...');
  server.close(() => process.exit(0));
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
