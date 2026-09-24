# ThesisTrack — Admin Console Implementation Plan

**Spec:** `docs/superpowers/specs/2026-09-24-admin-console-design.md`
**Date:** 2026-09-24

Each phase is independently verifiable. Do not start a phase before the
prior phase's checkpoint passes (`pnpm -r typecheck && pnpm lint` clean,
plus the phase-specific check). All failures are fix-forward to the owning
task. Phases are verification units — **one feature commit at the end**
(spec §6.5).

**Pre-flight:** baseline green (`pnpm -r typecheck && pnpm lint && pnpm
build && pnpm test` → 33/33). Dev servers may be down (both were cancelled
by a machine restart): start API + web as background processes and poll
`/api/v1/health` + `:5173` before any browser phase. Harness scripts live in
`/tmp/opencode/` (`phase5b.js`, `mobile.js`); recreate from spec §6 if wiped.
Never stage `apps/api/**`, `pnpm-workspace.yaml`, `.claude/`,
`package-lock.json`, or `apps/web/tsconfig.tsbuildinfo`.

**Execution note (uncommitted API):** Phase 0 pins the users schemas; if
`apps/api/src/modules/users/{schema,controller}.ts` change while this plan
executes, re-pin — the adapters are the only code allowed to care.

---

## Phase 0 — Groundwork

### 0.1 Pin the API contract (read-only)
- Read `apps/api/src/modules/users/schema.ts` — record exact accepted fields
  for `createUserSchema`, `importUsersSchema`, `listUsersQuerySchema`,
  `updateUserSchema`, and the role enum.
- Read `apps/api/src/modules/users/controller.ts` + `service.ts` — record the
  `GET /users` list envelope (items/total shape), `GET /users/:id` detail
  fields, `POST /users/import` request/response shape, invite response.
- Write the findings into this plan as a short appendix (§A) so mappers are
  written against pinned facts, not guesses.

### 0.2 Toast dependency
- `pnpm --filter @thesistrack/web add sonner` (spec §4 transient feedback).

**Check:** `pnpm -r typecheck && pnpm --filter @thesistrack/web build`.

---

## Phase 1 — Data layer (no UI yet)

### 1.1 `features/users/data/`
- `types.ts`: `ConsoleUser`, `UsersPage`, `UserDetail`, `CreateUserInput`,
  `ImportRow`, `Role` (API enum), `UserStatus = 'ACTIVE'|'INVITED'|'INACTIVE'`.
- `mappers.ts` (defensive, spec Rule 2): `mapUserDto`, `mapUsersPage`
  (envelope per §A), `mapUserDetail` (status per spec §4 derivation; unknown
  fields ignored, missing defaulted), `toCreateBody` (drops fields §A shows
  the schema rejects), `toImportPayload`.
- `mock/users.ts`: fixture rows (the 6 mockup users + 6+ extras for paging),
  `mockStats`, `mockSecurityLogs`, `mockContactExtras` (by id), `DEPARTMENTS`
  const.
- `usersRepo.ts`: `listUsers({q, role, status, page, limit})`,
  `getUser(id)`, `createUser(input)`, `sendInvite(id)`,
  `importUsers(rows)` — reads try live then mock-fallback (`console.warn`,
  `usedFallback` flag for the banner); writes surface errors (Rule 3).
- `usersRepo.test.ts` + `mappers.test.ts`: happy live shape, drifted/missing
  fields, fallback path (axios rejected → fixtures + flag), `toCreateBody`
  drops unknown fields.

### 1.2 `features/dashboard/data/`
- `types.ts`, `mock/` (progress cards, workspace rows, tasks, activity,
  quick-action figures), `dashboardRepo.ts` + test (returns fixtures; typed).

**Check:** `pnpm -r typecheck && pnpm lint && pnpm --filter @thesistrack/web
test` green (existing 33 + new data tests).

---

## Phase 2 — Shell + routing

### 2.1 Shell components
- `app/layouts/console/Sidebar.tsx`: nav (`/dashboard`, `/users` real;
  Faculty/Students/Departments/Settings → `toast.info('… is not available
  yet')`), user footer (initials avatar, real name, role title map, **Sign
  Out** copying DashboardStub's exact exitTo/clear/navigate block with its
  comment), off-canvas drawer ≤1024px.
- `app/layouts/console/Topbar.tsx`: decorative search input, session header
  `${role.toUpperCase()} SESSION` + static department line, hamburger ≤1024px.
- `app/layouts/console/ConsoleFooter.tsx`.
- `app/layouts/ConsoleLayout.tsx`: grid + `<Outlet/>` + mount
  `<Toaster richColors position="top-right" />` (sonner).

### 2.2 Routes + stubs
- Create placeholder screens
  `features/{dashboard/users}/screens/*.tsx` (minimal heading divs) so routes
  compile; wire the layout route + 5 paths in `app/router/App.tsx` (static
  before `:userId`).
- **Delete `pages/DashboardStub.tsx`**; fix every reference.

### 2.3 Test fallout
- Update `App.test.tsx` (and any other test) that referenced DashboardStub or
  its texts; keep assertions meaningful for the console routes.
- Update `/tmp/opencode/phase5b.js` check 1: assert the Coordinator Dashboard
  heading instead of `Signed in as` (stub text is gone); checks 2/9 keep
  using the sidebar's `Sign Out` text (unchanged).

**Check:** typecheck + lint + build + all tests green; browser: sign in →
console shell renders at `/dashboard`, off-canvas works at 375px, sidebar
Sign Out → `/login`, placeholder toast fires.

---

## Phase 3 — Coordinator Dashboard

- `CoordinatorDashboard.tsx` composed from feature components
  (progress cards, workspace table, tasks rail, activity, quick actions);
  data via `dashboardRepo`; Add User/Assign Students → `/users/new`/`/users`,
  Generate Report → CSV blob, others per spec §5.1.
- Match mockup typography/kickers/badges using existing tokens.

**Check:** static gate green; browser render at 1280 matches mockup layout.

---

## Phase 4 — All Users

- Components: `StatCards`, `UsersTable` (client sort of loaded page, status
  badges, row menu → `/users/:id`), filters popover (role/status → repo
  params), pagination (API total, page-size 10/20/50), security-log rail,
  bulk-enrollment card → `/users/import`, guide links decorative, Export CSV
  blob of loaded rows, "showing sample data" banner when
  `usedFallback`.
- `UserList.tsx` wires search (debounced) → `listUsers`.
- Tests: `UserList` renders rows from a mocked repo; fallback banner shown
  when flagged.

**Check:** static gate green; browser: `/users` loads **live** rows from the
API (fall back cleanly when the API is down).

---

## Phase 5 — Create User Account

- `UserCreate.tsx` + form sections per spec §5.3: zod schema mirroring §A
  constraints, `react-hook-form` (auth-screen pattern), `AccountPreview`
  right rail driven by `form.watch`, role options = API enum, department =
  mock list, onboarding toggles (invite wired, password-change flag UI-only).
- Submit → `createUser` (+ `sendInvite` when toggled) → toast → navigate
  `/users/:id`; inline errors on write failure; Cancel/Discard → `/users`.
- Tests: validation messages, preview updates on input, submit calls repo
  with `toCreateBody`-mapped payload (`vi.mock` repo).

**Check:** static gate green; browser: create `console-e2e@test.local`
(Student) via UI → toast → lands on profile; row appears in `/users`.
**Cleanup:** admin PATCH `isActive:false` on the created user.

---

## Phase 6 — User Profile

- `UserProfile.tsx`: `getUser` core (avatar initials, name, RoleBadge,
  status, real id line, created date) over `mockContactExtras` merge; rails
  (theses, audit, activity, oversight) from mock constants; **Reset Password**
  → `sendInvite` + success toast; Edit User / Send Message / extra menu →
  toasts; not-found → inline state + back link.
- Test: renders live detail from mocked repo; not-found state.

**Check:** static gate green; browser: open the Phase 5 user's profile.

---

## Phase 7 — Import Users wizard

- `components/import/`: `csvParser.ts` (hand-rolled, quotes/commas/newlines,
  no new deps) + `csvParser.test.ts`; `ImportWizard` steps
  ①upload (real file input, CSV-only hint, template/sample downloads as CSV
  blobs) ②map columns (auto-guess + remap selects, required flagged)
  ③validate (email/role/required rules, per-row errors)
  ④finalize (`importUsers` → counts or inline API errors + retry).
- `UserImport.tsx` hosts step state machine + mockup stepper UI.

**Check:** static gate green; browser: download template, import a generated
sample CSV end-to-end → success summary.

---

## Phase 8 — Responsive + full verification + commit

### 8.1 Responsive harness
- Extend `/tmp/opencode` script: one session, 5 console screens ×
  {375, 768, 1280} no horizontal overflow (login once, reuse cookies;
  sidebar-drawer open state checked at 375).

### 8.2 End-to-end
- Full gate: `pnpm -r typecheck && pnpm lint && pnpm build && pnpm test`.
- Updated `phase5b.js` (10 checks) + `mobile.js` still pass.
- Console flow script: sign in → dashboard → `/users` live → create →
  profile → import sample → sidebar sign-out → `/login`.

### 8.3 Commit
- `git add -A apps/web/src apps/web/package.json pnpm-lock.yaml` (eslint
  shouldn't change; if it does, stage it too); review
  `git diff --cached --stat`; confirm no `apps/api/**` or junk staged
  (`package-lock.json`, `pnpm-workspace.yaml`, `.claude/`, `tsbuildinfo`).
- Single commit: `feat(web): admin console shell + screens` (body: spec
  reference, live-vs-mock summary).

**Check:** commit lands; `git status` shows only pre-existing out-of-scope
entries; full gate + all harnesses green.

---

## Appendix §A — Pinned API contract

(Filled in during Phase 0.1 from the current, possibly uncommitted,
`apps/api/src/modules/users/schema.ts` + `controller.ts` + `service.ts`:
create fields, import payload, list envelope, detail fields, role enum,
invite response, error envelope.)
