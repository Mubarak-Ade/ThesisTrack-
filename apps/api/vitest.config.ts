import { defineConfig } from 'vitest/config';

// Vitest runs the API's TypeScript directly, so this config only has to respect
// the constraints apps/api already has:
//
//   * ESM / NodeNext — source imports carry explicit `.js` extensions
//     (`./service.js`); Vite resolves them back to the `.ts` source.
//   * `src/**/*.test.ts` is reserved for colocated unit tests; integration tests
//     live under `tests/integration/` and may need `NODE_ENV=test`.
//   * The four bash suites in `tests/*.sh` are system tests that drive a live
//     server — vitest must not pick them up (the `.test.ts` glob excludes them).
//
// Environment: `node`. These are Express/Drizzle modules; a DOM would hide
// missing Node APIs until runtime.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'dist/**'],
    // Phase 2+ integration tests share one database; keep them serial by
    // default so parallel file execution cannot interleave transactions.
    fileParallelism: false,
    passWithNoTests: false,
  },
});
