// @testing-library/jest-dom/vitest extends the `expect` it imports from
// 'vitest' — but jest-dom does NOT declare vitest as a peer dependency, so
// from its location in the store that import resolves to whichever vitest is
// hoisted into `node_modules/.pnpm/node_modules` (today: the API's 5.x), not
// to this app's runner (2.x). The matchers then land on a different chai
// instance than the tests assert with, and every `toBeInTheDocument()` dies
// with "Invalid Chai property". Which version wins that incidental hoist
// changes whenever the lockfile is touched, so do not rely on it: register
// the matchers here, on THIS runner's expect. The /vitest import stays for
// its type augmentation (tsconfig `types` + setup.ts put it in the program).
import '@testing-library/jest-dom/vitest';

import { expect } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';

expect.extend(matchers);
