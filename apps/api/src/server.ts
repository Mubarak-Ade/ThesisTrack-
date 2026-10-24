import app from './app.js';
import { env } from './config/env.js';

// Startup guard (mailer design §10/G4): in production the invitation and
// password-reset flows are now the ONLY way users get their tokens. If no SMTP
// relay is configured those emails are silently skipped (`sendMail` opens no
// socket), so a mis-deployed production would let admins "send" invites that
// never arrive. Warn loudly at boot so it's caught immediately. Warn-only by
// default; a strict fail-fast mode (`MAIL_REQUIRED`) is a deferred ops decision.
if (env.NODE_ENV === 'production' && !env.SMTP_HOST) {
  console.warn(
    '[mailer] WARNING: SMTP_HOST is not set in production. Invitation and ' +
      'password-reset emails will NOT be delivered (tokens are only returned ' +
      'in non-production responses). Configure SMTP_HOST/SMTP_PASS/MAIL_FROM, ' +
      'or set NODE_ENV to a non-production value for local testing.',
  );
}

const server = app.listen(env.PORT, () => {
  console.log(`API server running on http://localhost:${env.PORT}`);
  console.log(`Environment: ${env.NODE_ENV}`);
});

server.on('error', (err) => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});

let shuttingDown = false;

const shutdown = (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down...`);

  server.close(() => process.exit(0));

  // Force-exit if open connections keep the server alive.
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
