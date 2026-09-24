# Frontend Restructure — Feature-Sliced Layout

**Date:** 2026-09-24
**Status:** approved design, pending spec review
**Scope:** `apps/web/src/**` — structure only, zero behavior change

## 1. Intent

Restructure the frontend from the current flat layout
(`components/`, `pages/`, `providers/`, `lib/`, `stores/`) into a
feature-sliced architecture: shared infrastructure under `app/`, shared
primitives under `components/`, feature-owned code under `features/`, and
dependency-free utilities under `lib/`. The seven product domains beyond
auth (projects, proposals, milestones, submissions, reviews, feedback,
notifications) will be added as real features later; the structure must
welcome them without rework.

Two target diagrams were reconciled during questioning:

| Decision | Answer |
|---|---|
| Conflicting diagrams | Merge: variant 1's `app/` + `lib/` + `components/` subdivisions, keeping `pages/`, `hooks/`, `stores/` as top-level folders |
| Screen ownership | Features own the route screens; `pages/` shrinks to `Home` + `DashboardStub` |
| Empty folders | Only create folders that have code — `features/auth/` now, the rest lazily (same rule for `hooks/` and `types/`) |
| Approach | Pure moves (no file-content refactors, no barrels) + ESLint boundary rules to keep features isolated |

Success criterion: `pnpm -r typecheck && pnpm lint && pnpm build && pnpm test`
green (33/33), the Phase 5 live-API browser harness passes unchanged, and
`git` records the change as renames.

## 2. Target tree

Every current file maps to exactly one destination. File names are
preserved; only folders change.

```
src/
├── main.tsx                      (stays; imports App from ./app/router/App)
├── index.css                     (stays — Tailwind v4 entry)
├── app/
│   ├── router/
│   │   ├── App.tsx               ← src/App.tsx (route table only)
│   │   ├── App.test.tsx          ← src/App.test.tsx
│   │   └── RequireAuth.tsx       ← src/components/RequireAuth.tsx
│   ├── providers/
│   │   ├── AuthProvider.tsx      ← src/providers/AuthProvider.tsx
│   │   └── AuthProvider.test.tsx ← src/providers/AuthProvider.test.tsx
│   └── layouts/
│       ├── AuthLayout.tsx        ← src/components/AuthLayout.tsx
│       └── StatusLayout.tsx      ← src/components/StatusLayout.tsx
├── features/
│   └── auth/
│       ├── screens/              ← all 14 auth route screens from src/pages/
│       │   ├── Login.tsx (+ Login.test.tsx)
│       │   ├── ForgotPassword.tsx
│       │   ├── PasswordResetEmailSent.tsx
│       │   ├── ResetPassword.tsx
│       │   ├── PasswordResetSuccess.tsx
│       │   ├── InviteWelcome.tsx
│       │   ├── InviteConfirm.tsx
│       │   ├── InviteActivate.tsx
│       │   ├── InviteSuccess.tsx
│       │   ├── InviteAlreadyActivated.tsx
│       │   ├── InviteInvalid.tsx
│       │   ├── SessionExpired.tsx
│       │   ├── Unauthorized.tsx
│       │   └── Forbidden.tsx
│       ├── components/
│       │   ├── InvitationFlow.tsx    ← src/components/InvitationFlow.tsx
│       │   └── InviteTokenGuard.tsx  ← src/components/InviteTokenGuard.tsx
│       └── hooks/
│           └── invitations.ts        ← src/lib/invitations.ts
├── pages/                        (shrunk)
│   ├── Home.tsx                  (stays)
│   └── DashboardStub.tsx         (stays)
├── components/
│   ├── ui/                       (9 shadcn primitives — unchanged)
│   │   alert, badge, button, card, form, input, label, progress, separator
│   ├── forms/
│   │   ├── PasswordField.tsx         ← src/components/PasswordField.tsx
│   │   ├── PasswordStrengthMeter.tsx ← src/components/PasswordStrengthMeter.tsx
│   │   └── FormMessage.tsx           ← src/components/FormMessage.tsx
│   ├── feedback/
│   │   └── Callout.tsx               ← src/components/Callout.tsx
│   └── navigation/
│       ├── AuthHeader.tsx            ← src/components/AuthHeader.tsx
│       ├── AuthFooter.tsx            ← src/components/AuthFooter.tsx
│       └── BrandMark.tsx             ← src/components/BrandMark.tsx
├── lib/
│   ├── api/
│   │   ├── http.ts               ← src/lib/http.ts
│   │   └── http.test.ts          ← src/lib/http.test.ts
│   ├── validation/
│   │   ├── password-rules.ts     ← src/lib/password-rules.ts
│   │   └── password-rules.test.ts← src/lib/password-rules.test.ts
│   └── utils/
│       └── index.ts              ← src/lib/utils.ts
├── stores/                       (unchanged: auth.ts + auth.test.ts)
└── test/                         (unchanged: setup.ts, smoke.test.tsx)
```

Notes:

- `lib/utils/index.ts` is deliberate: `@/lib/utils` keeps resolving, so
  `cn` imports need no edit.
- `features/auth/hooks/` is feature-internal; a top-level `hooks/` folder
  appears only when a genuinely shared hook exists.
- `types/` is deferred: every current type is owned by `lib/api/http.ts`,
  and extracting them would be content surgery, which this restructure
  forbids. Create `types/` when a type appears that neither the API client
  nor a feature owns.

## 3. Import rewrites

All imports are `@/`-absolute or folder-relative; rewrites are mechanical
and typecheck-verified. Two categories:

**Path updates** (every occurrence):

| Old | New |
|---|---|
| `@/components/Callout` | `@/components/feedback/Callout` |
| `@/components/{PasswordField,PasswordStrengthMeter,FormMessage}` | `@/components/forms/…` |
| `@/components/{AuthHeader,AuthFooter,BrandMark}` | `@/components/navigation/…` |
| `@/components/AuthLayout` | `@/app/layouts/AuthLayout` |
| `@/components/StatusLayout` | `@/app/layouts/StatusLayout` |
| `@/components/RequireAuth` | `@/app/router/RequireAuth` |
| `@/components/InvitationFlow` | `@/features/auth/components/InvitationFlow` |
| `@/components/InviteTokenGuard` | `@/features/auth/components/InviteTokenGuard` |
| `@/lib/http` | `@/lib/api/http` |
| `@/lib/password-rules` | `@/lib/validation/password-rules` |
| `@/lib/invitations` | `@/features/auth/hooks/invitations` |
| `@/providers/AuthProvider` | `@/app/providers/AuthProvider` |
| `@/pages/<auth screen>` (14 screens) | `@/features/auth/screens/<name>` |
| `@/components/ui/*`, `@/lib/utils`, `@/stores/auth`, `@/pages/Home`, `@/pages/DashboardStub` | unchanged |

**Relative imports that now cross a folder boundary** become `@/`
absolute, e.g. inside `app/layouts/AuthLayout.tsx`: `./AuthHeader` →
`@/components/navigation/AuthHeader`. Tests move with their subjects, so
their intra-folder relatives (`./Login`) stay valid.

No config changes: `@/* → src/*` (tsconfig + vite) and vitest's
`test/setup.ts` path remain correct.

## 4. Boundary lint

Added to the root `eslint.config.js`, scoped to `apps/web/src/**` globs so
the API and shared packages are unaffected:

1. In `features/**`: no `@/features/*` imports (own-feature code is
   imported relatively, so any absolute `@/features/…` is cross-feature)
   and no `@/pages` imports.
2. In `lib/**` and `components/**`: no `@/features`, `@/app`, or `@/pages`
   imports — shared layers never depend on features or the app shell.

These rules hold for the post-move tree: `lib` imports only stores/deps;
`components` only components/lib; screens reach shared code one-way.

## 5. Verification

1. `pnpm -r typecheck && pnpm lint && pnpm build && pnpm test` — 33/33;
   test files change only in import lines.
2. Browser harness against the live API: `phase5b.js` (10 flow checks —
   sign-in/out, forgot→reset, 403→forbidden, 401→session-expired,
   anonymous→unauthorized) plus `mobile.js` (390px overflow pass).
3. `git add -A`, confirm renames with `--stat -M`, review the diff.
4. Single commit: `refactor(web): feature-sliced structure`, scoped to
   `apps/web/src/**` + `eslint.config.js`. The in-flight API refactor in
   the working tree stays untouched; `apps/web/tsconfig.tsbuildinfo`
   excluded as usual.

## 6. Out of scope

- Behavior, styling, copy, or route changes of any kind.
- Splitting `http.ts`, adding `index.ts` barrels, or extracting types.
- Creating empty feature/hook/type folders.
- All `apps/api/**` work (a separate, in-flight refactor).
- Dashboard screens (out of scope for this project phase).

## 7. Risks

| Risk | Mitigation |
|---|---|
| Missed import after a move | typecheck fails loudly; fix-forward |
| Layering violation introduced later | new ESLint boundary rules |
| Hidden runtime difference | Phase 5 harness re-run before commit |
| Watch-server churn during moves | cosmetic; vite/vitest reload |
