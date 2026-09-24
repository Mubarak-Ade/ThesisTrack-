# ThesisTrack — Frontend Restructure Implementation Plan

**Spec:** `docs/superpowers/specs/2026-09-24-frontend-structure-design.md`
**Date:** 2026-09-24

Each phase is independently verifiable. Do not start a phase before the
prior phase's checkpoint passes (`pnpm -r typecheck && pnpm lint` clean,
plus the task-specific check noted). All moves use `git mv` so renames are
tracked; import fixes are exact-string rewrites verified by typecheck.
One commit at the end (spec §5) — phases are verification units, not
commits.

**Fix-forward:** any failure returns to the owning task.

**Pre-flight:** record baseline — `pnpm -r typecheck && pnpm lint && pnpm
build && pnpm test` green (33/33). Dev servers may stay running; vite
reloads through the moves (restart `@thesistrack/web dev` only if it
stalls).

---

## Phase 1 — Zero-churn foundation move

### 1.1 `lib/utils.ts` → `lib/utils/index.ts`
- `mkdir -p apps/web/src/lib/utils && git mv apps/web/src/lib/utils.ts apps/web/src/lib/utils/index.ts`
- No import edits: `@/lib/utils` now resolves to the directory index.

**Check:** `pnpm -r typecheck && pnpm --filter @thesistrack/web test` green.

---

## Phase 2 — `lib/` subdivision

### 2.1 Move files
- `git mv src/lib/http.ts src/lib/http.test.ts → src/lib/api/`
- `git mv src/lib/password-rules.ts src/lib/password-rules.test.ts → src/lib/validation/`

### 2.2 Rewrite importers (exact string, all occurrences)
| Old | New |
|---|---|
| `@/lib/http` | `@/lib/api/http` |
| `@/lib/password-rules` | `@/lib/validation/password-rules` |

(`@/lib/invitations` deliberately untouched — it moves with the feature
in Phase 5. Beware: rewrite `@/lib/http` before any hypothetical
longer match; these strings have no prefix collisions in the repo —
verify with `grep -r "@/lib/http" src/` first.)

**Check:** `pnpm -r typecheck && pnpm lint && pnpm --filter @thesistrack/web test`
green.

---

## Phase 3 — Shared component regroup (`feedback/`, `forms/`, `navigation/`)

### 3.1 Move files
- `git mv components/Callout.tsx → components/feedback/`
- `git mv components/{PasswordField,PasswordStrengthMeter,FormMessage}.tsx → components/forms/`
- `git mv components/{AuthHeader,AuthFooter,BrandMark}.tsx → components/navigation/`
- `components/ui/**` untouched.

### 3.2 Rewrite importers
| Old | New |
|---|---|
| `@/components/Callout` | `@/components/feedback/Callout` |
| `@/components/PasswordField` | `@/components/forms/PasswordField` |
| `@/components/PasswordStrengthMeter` | `@/components/forms/PasswordStrengthMeter` |
| `@/components/FormMessage` | `@/components/forms/FormMessage` |
| `@/components/AuthHeader` | `@/components/navigation/AuthHeader` |
| `@/components/AuthFooter` | `@/components/navigation/AuthFooter` |
| `@/components/BrandMark` | `@/components/navigation/BrandMark` |

### 3.3 Fix cross-folder relative imports
Run typecheck; the layouts (still at `components/`) import the moved files
relatively today (`./AuthHeader`, `./AuthFooter`, `./BrandMark`, possibly
`./Callout`). Rewrite each to its new `@/` path.

**Check:** `pnpm -r typecheck && pnpm lint && pnpm --filter @thesistrack/web test`
green.

---

## Phase 4 — `app/` shell (layouts, providers, router)

### 4.1 Move files
- `git mv components/{AuthLayout,StatusLayout}.tsx → app/layouts/`
- `git mv components/RequireAuth.tsx → app/router/`
- `git mv providers/{AuthProvider,AuthProvider.test}.tsx → app/providers/` (then remove empty `providers/`)
- `git mv App.tsx App.test.tsx → app/router/`

### 4.2 Rewrite importers
| Old | New |
|---|---|
| `@/components/AuthLayout` | `@/app/layouts/AuthLayout` |
| `@/components/StatusLayout` | `@/app/layouts/StatusLayout` |
| `@/components/RequireAuth` | `@/app/router/RequireAuth` |
| `@/providers/AuthProvider` | `@/app/providers/AuthProvider` |
| `./providers/AuthProvider` (main.tsx) | `./app/providers/AuthProvider` |
| `./App` (main.tsx) | `./app/router/App` |

### 4.3 Fix `app/router/App.tsx` internal imports
Its `./pages/…` and `./components/…` relatives now resolve wrong. Rewrite
against the **current** tree (screens are still in `pages/`):
- `./components/RequireAuth` → `./RequireAuth` (co-located),
- `./components/StatusLayout` → `@/app/layouts/StatusLayout`,
- `./pages/<all screens + Home + DashboardStub>` → `@/pages/…`,
- `./components/InviteTokenGuard` → `@/components/InviteTokenGuard`
  (still current; moves in Phase 5).
- `App.test.tsx` co-moved: keep `./App`; fix any other relatives via
  typecheck.

**Check:** `pnpm -r typecheck && pnpm lint && pnpm build && pnpm --filter
@thesistrack/web test` green.

---

## Phase 5 — `features/auth/` (screens, feature components, hook)

### 5.1 Move files
- 14 screens + `Login.test.tsx`: `git mv pages/<name> → features/auth/screens/`
  (Login, ForgotPassword, PasswordResetEmailSent, ResetPassword,
  PasswordResetSuccess, InviteWelcome, InviteConfirm, InviteActivate,
  InviteSuccess, InviteAlreadyActivated, InviteInvalid, SessionExpired,
  Unauthorized, Forbidden).
- `git mv components/{InvitationFlow,InviteTokenGuard}.tsx → features/auth/components/`
- `git mv lib/invitations.ts → features/auth/hooks/`
- `pages/` must contain exactly `Home.tsx`, `DashboardStub.tsx` afterwards.

### 5.2 Rewrite importers
| Old | New |
|---|---|
| `@/pages/<14 screens>` | `@/features/auth/screens/<name>` |
| `@/components/InvitationFlow` | `@/features/auth/components/InvitationFlow` |
| `@/components/InviteTokenGuard` | `@/features/auth/components/InviteTokenGuard` |
| `@/lib/invitations` | `@/features/auth/hooks/invitations` |
| `./components/InviteTokenGuard` (in App.tsx) | `@/features/auth/components/InviteTokenGuard` |

`@/pages/Home` and `@/pages/DashboardStub` (from App.tsx) stay unchanged.
Intra-screen relatives (`./Login` inside `Login.test.tsx`) survive the
co-move — verify via typecheck for anything else that crossed a boundary.

**Check:** `pnpm -r typecheck && pnpm lint && pnpm build && pnpm --filter
@thesistrack/web test` green (33/33).

---

## Phase 6 — Boundary lint

### 6.1 Add to root `eslint.config.js` (flat config), scoped to web only
```js
{
  files: ['apps/web/src/features/**/*.{ts,tsx}'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        { group: ['@/features', '@/features/*', '@/features/**'],
          message: 'Import own-feature code relatively; no cross-feature imports.' },
        { group: ['@/pages', '@/pages/*', '@/pages/**'],
          message: 'Features must not import pages.' },
      ],
    }],
  },
},
{
  files: [
    'apps/web/src/lib/**/*.{ts,tsx}',
    'apps/web/src/components/**/*.{ts,tsx}',
  ],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        { group: ['@/features', '@/features/*', '@/features/**'],
          message: 'Shared layers must not import features.' },
        { group: ['@/app', '@/app/*', '@/app/**'],
          message: 'Shared layers must not import app.' },
        { group: ['@/pages', '@/pages/*', '@/pages/**'],
          message: 'Shared layers must not import pages.' },
      ],
    }],
  },
},
```
(Both bare and glob forms listed because `*` vs `**` matching varies by
ESLint version — the negative test below proves which fires.)

### 6.2 Negative test
Temporarily add `import '@/features/auth/screens/Login'` to
`lib/utils/index.ts` → `pnpm lint` **must** fail with the boundary
message → revert; repeat for one `@/app` import in
`components/feedback/Callout.tsx` → fail → revert.

**Check:** `pnpm lint` green after reverts; both negative tests observed
failing.

---

## Phase 7 — Full verification + commit

### 7.1 Static
`pnpm -r typecheck && pnpm lint && pnpm build && pnpm test` → 33/33.

### 7.2 Runtime (live API on :3001, vite on :5173)
- `node /tmp/opencode/phase5b.js` → ALL FLOWS PASS (10 checks).
- `node /tmp/opencode/mobile.js` → MOBILE OK (13 routes @390px).
- (If `/tmp/opencode` was wiped, recreate from the harness recipes in the
  session summary — small puppeteer scripts, ~10 min.)

### 7.3 Diff review + commit
- `git add -A apps/web/src eslint.config.js`
- `git status` → expect renames (`R` entries), no content drift beyond
  import lines: inspect `git diff --cached -M --stat` and spot-check
  `git diff --cached -M` (moves should show 100% similarity except
  import-line files).
- Exclude `apps/web/tsconfig.tsbuildinfo`; do not touch `apps/api/**`,
  `pnpm-workspace.yaml`, `.claude/`, `package-lock.json`.
- Commit: `refactor(web): feature-sliced structure` (body: spec reference +
  summary of the three layering rules).

**Check:** commit lands; `git status` shows only the pre-existing
out-of-scope entries.
