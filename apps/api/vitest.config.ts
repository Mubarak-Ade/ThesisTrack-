import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { defineConfig } from 'vitest/config';

// Vitest runs the API's TypeScript directly, so this config only has to respect
// the constraints apps/api already has:
//
//   * ESM / NodeNext — source imports carry explicit `.js` extensions
//     (`./service.js`); Vite resolves them back to the `.ts` source.
//   * `src/**/*.test.ts` is reserved for colocated unit tests; integration tests
//     live under `tests/integration/` and may need `NODE_ENV=test`.
//   * The bash suites in `tests/*.sh` are system tests that drive a live
//     server — vitest must not pick them up (the `.test.ts` glob excludes them).
//
// Environment: `node`. These are Express/Drizzle modules; a DOM would hide
// missing Node APIs until runtime.

// Database pin — tests never touch the primary. `.env.test` sits next to this
// config and holds a DATABASE_URL aimed at the throwaway test database; it is
// set here (before any test file imports `config/env.js`) so it lands on
// process.env ahead of dotenv's `.env` load, which never overrides an existing
// key. Deleting the file is an error, not a silent fall-through to the primary.
const envTestPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '.env.test');
if (!fs.existsSync(envTestPath)) {
  throw new Error(
    `apps/api/.env.test is missing — it pins every test run to the test database. ` +
      `Restore it (see .env.example) so tests cannot reach the primary DATABASE_URL.`,
  );
}
loadDotenv({ path: envTestPath, override: false });

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'dist/**'],
    // Hermetic mail config: force BOTH mail transports off regardless of the
    // developer's local `.env`. `lib/mailer.ts` has a no-network
    // `skipped:'unconfigured'` path that the suite relies on; a local
    // SMTP_HOST or BREVO_API_KEY would otherwise make real-env tests open a
    // live socket/fetch and hang. Configured-path tests set these explicitly
    // via `vi.mock(env)`, which replaces this module entirely.
    env: {
      SMTP_HOST: '',
      BREVO_API_KEY: '',
      // The database pin itself (§.env.test): override the dev `.env` value
      // for every test worker, so `pnpm --filter @thesistrack/api test`
      // structurally cannot write to the primary database.
      DATABASE_URL: process.env.DATABASE_URL,
    },
    // Phase 2+ integration tests share one database; keep them serial by
    // default so parallel file execution cannot interleave transactions.
    fileParallelism: false,
    passWithNoTests: false,
  },
});
