# ThesisTrack — Admin Console Mockup Parity Implementation Plan

**Spec:** `docs/superpowers/specs/2026-09-26-admin-console-mockup-parity-design.md`
**Date:** 2026-09-26

Each phase is independently verifiable. Do not start a phase before the
prior phase's checkpoint passes (`pnpm -r typecheck && pnpm lint` clean, plus
the phase-specific check). All failures are fix-forward to the owning task.
Phases are verification units — **one feature commit at the end** (spec §6.5).

**Pre-flight:** baseline green (`pnpm -r typecheck && pnpm lint && pnpm build
&& pnpm test` → 83/83). Dev servers may be down after a machine restart: start
API (`:3001`) + web (`:5173`) as background processes and poll
`/api/v1/health` + `:5173` before any browser phase. Harness scripts live in
`/tmp/opencode/` (wiped every restart — recreate from spec §6; puppeteer-core
reinstalls in seconds from npm cache with `--prefer-offline`).
Never stage `apps/api/**`, `pnpm-workspace.yaml`, `.claude/`,
`package-lock.json`, or `apps/web/tsconfig.tsbuildinfo`.

**Rules for every phase:**
- Verbatim mockup strings live in **spec §5** — reference them; never copy
  them into this plan (single source of truth).
- Data layer (`features/*/data` repos, mappers, `toCreateBody`, fallback
  behavior) changes **only** where spec §4 says (`usrCode` field, new
  fixture features). Everything else is presentation.
- Screens import only their own feature's data barrel; shell links via plain
  `NavLink` paths; boundary lint must hold after every phase.

---

## Phase 0 — Groundwork (shared primitives)

### 0.1 `usrCode` in the users data layer
- Add `code` to `ConsoleUser`/`UserDetail` per spec §4
  (`'USR-' + id.replace(/-/g,'').slice(0,4).toUpperCase()`, fixture codes pass
  through, malformed fallback).
- Extend `mappers.test.ts`: live UUID → derived code, fixture passthrough,
  short/malformed id fallback.

### 0.2 Shared silhouette `Avatar`
- New component under `src/components/` (shared layer — shell and every
  feature use it; no new npm dependency, inline SVG person icon; size
  variants for table rows / header card / sidebar persona).

### 0.3 Primitive inventory (read-only)
- Check `src/components/ui/` for an existing Checkbox primitive. **Pinned
  decision:** native `<input type="checkbox">` styled to the mockup — no new
  npm dependencies (shadcn checkbox would pull Radix).
- Note current breadcrumb/section-header helpers, if any, for reuse.

### 0.4 Test-fallout survey
- Read `UserCreate.test`, `UserList.test`, `UserProfile.test`, `App.test`;
  list the selectors each will need when its phase lands (kept here so
  phases don't rediscover them).

**0.3 findings:** no Checkbox primitive exists (`ui/` = button, input,
progress, alert, separator, form, badge, card, label) → native input
confirmed; `progress` primitive available for faculty avg-progress bars; no
breadcrumb/section-header helper — screens render their own breadcrumb
markup.

**0.4 findings (test → owning phase):**
- `App.test` "console shell renders for the real user" → **Phase 2** (nav
  items / sidebar / footer assertions).
- `UserCreate.test` — field ids `uc-first/uc-last/uc-email/uc-role`, submit
  label, preview copy, inline error text → **Phase 5** (labels + checkbox
  cards change; keep field ids and error assertions).
- `UserList.test` — row rendering + sample-banner queries → **Phase 4**
  (columns/status/pager change; keep banner + row-email queries).
- `UserProfile.test` — detail merge, not-found back link, Reset Password
  toasts → **Phase 6** (header/rails restructure; reset label + back link
  stay stable).
- `mappers.test` extended here in 0.1 (code derivation cases) ✓.

**Check:** `pnpm -r typecheck && pnpm lint && pnpm --filter @thesistrack/web
test` green (83 + new mapper cases).

---

## Phase 1 — Fixture features (data only, no UI)

### 1.1 `features/faculty/data/`
- `types.ts`: `SupervisorRow` (name, code, department, workloadStudents,
  capacity, avgProgress, status, lastActivity), `FacultyStats`,
  `DeptDistributionEntry`, `LoadAlert`, `FacultySnapshot`.
- `mock/fixtures.ts`: **8 supervisor rows** (spec §5.5), stats
  (42 / 212 / 5.2 / 14 with their captions), distribution
  (Informatics 12, Architecture 8, Cyber Security 10, Philosophy 12), the
  two load alerts, system-notice copy.
- `facultyRepo.ts` + test: `getFaculty()` returns the snapshot (pure
  fixtures, no network — dashboardRepo pattern); `index.ts` barrel.

### 1.2 `features/students/data/`
- `types.ts`, `mock/fixtures.ts`: **12 student rows** (spec §5.6), stats
  (1,240 / 412 / 856 / 14), bottom info-card copy; `studentsRepo.ts` +
  test + barrel.

**Check:** gate green; web tests 83 + ~4.

---

## Phase 2 — Shell restyle + routes

### 2.1 `Sidebar.tsx` (white)
- White panel, hairline border, green logo tile + "ThesisTrack"; **no MENU
  kicker**; exactly 5 items: Dashboard → `/dashboard`, Faculty → `/faculty`,
  Students → `/students`, Departments/Settings → placeholder toast. Active =
  light-green pill + green text/icon. Persona: silhouette avatar + real
  signed-in name + role title map + chevron; **red Sign Out** with the exact
  exitTo/clear/navigate block and its comment preserved. Off-canvas drawer
  ≤1024px, keep aria labels `Open navigation` / `Sidebar`.

### 2.2 `Topbar.tsx`
- Long search placeholder `Search students, theses, or submissions…`
  (decorative), bell + red dot (decorative), right `${role.toUpperCase()}
  SESSION` + "Department of Informatics", hamburger ≤1024px.

### 2.3 `ConsoleFooter.tsx` variants
- Derive variant from `location.pathname` (shell-side map, no
  `app → features` imports): per spec §3 table, all © lines + link trios
  verbatim; `/users/import` keeps current text; unmatched path → Dashboard
  variant.

### 2.4 Routes
- Add `/faculty`, `/students` inside the console layout route pointing at
  **temporary placeholder screens** (real screens land in Phase 7); static
  routes before `:userId`.

### 2.5 Test fallout
- Update `App.test.tsx` / shell-touching tests (green sidebar, nav item
  count, footer strings, Users nav item no longer present).

**Check:** gate green; new `shell.js` harness green (white sidebar, exactly
5 nav items, bell, silhouette persona, red Sign Out, footer variants per
page, 375px drawer open/settle, Departments toast).

---

## Phase 3 — Coordinator Dashboard (spec §5.1)

- `dashboardRepo` fixtures → mockup values (86/71/9/6, 120/112/8), workspace
  rows with supervisor column + `TH-####` codes, tasks content
  (UPCOMING / ACTION REQUIRED / OVERDUE+URGENT / Critical Deadline copy),
  activity items, quick-action tile copy, session strip values; update
  `dashboardRepo.test` expectations.
- Rebuild screen tree: header (`ADMIN › DASHBOARD`, Export Data blob, +
  New Project toast) · two stat column-cards · grid: Primary Workspace
  (columns STUDENT / PROJECT DETAILS / STATUS / SUPERVISOR / ⋮, footer
  "Showing 5 of 212 projects" + View Full Directory → `/users`) | Tasks
  rail (Assign Faculty Now → `/faculty`) · bottom: Recent Activity |
  Quick Actions (2×2 tiles + `Session: <name> (Informatics)` ·
  `v1.2.4-stable`).

**Check:** gate green (incl. dashboardRepo test); browser render matches
spec §5.1 layout at 1280.

---

## Phase 4 — All Users (spec §5.2)

- Restyle `StatCards` (icon top-right; TOTAL ACCOUNTS live total + fixture
  sub), `UsersToolbar` (new placeholder, Filters, `Show: [20 Rows]` →
  `limit`, default 20), `UsersTable` (checkbox column — selection state
  only; avatar + name + code + email; ROLE & DEPT with `—` fallback;
  dot statuses; LAST LOGIN visible at **all** breakpoints with `—` for
  live; sort keys USER/ROLE & DEPT/STATUS; ⋮ View → profile), numbered
  `Pagination` (prev/next + real page numbers, green current square;
  shared component — Phase 7 reuses it), header (`ADMINISTRATION › USER
  MANAGEMENT`, Export CSV, Create User → `/users/new`).
- Rebuild below-grid: Recent Security Logs card + Bulk Enrollment card
  (SELECT FILE → `/users/import`) + Administrative Guides rows (toasts);
  retire the old right-rail arrangement.
- Update `UserList.test` selectors (checkbox column, dot status, pager).

**Check:** gate green; browser `/users` renders live data in new structure,
search/`Show:`/sort/pager wired to `GET /users`, sample-data banner intact.

---

## Phase 5 — Create User Account (spec §5.3)

- Rebuild `UserCreate`: header (circular back → `/users`, title + subtitle,
  top **✕ Cancel** + **Add User**) · three sections (icon + title + kicker
  beneath + hairline rule; email envelope prefix + italic helper) ·
  checkbox cards (native inputs, both default-checked; Enforce UI-only —
  `toCreateBody` untouched) · bottom italic note + **Discard Changes** +
  **Create User Profile** (top and bottom buttons share handlers) · right
  rail (sage banner, large silhouette, Account Preview + live email, pills,
  DEPARTMENT/ENROLLMENT ID/STATUS rows, "Changes reflect in real-time",
  Administrative Tip callout, Creation Log).
- Validation, `POST /users` (+ invite per toggle), toast → `/users/:id`,
  inline errors unchanged.
- Update `UserCreate.test` (checkbox semantics, both submit buttons).

**Check:** gate green; browser create → lands on profile + toast; cleanup
(created user deactivated via admin PATCH).

---

## Phase 6 — User Profile (spec §5.4)

- Rebuild `UserProfile`: header (back → `/users`, `ID: <derived code>`,
  Reset Password outline/live re-invite + toast, Edit User green → toast,
  ⋯ → toast) · header card (silhouette, green ACTIVE pill, "Student •
  Informatics & AI", THESES/MILESTONES counters) · left column (Thesis
  Assignments 2-up cards + ADD PROJECT toast, Audit Logs table + View Full
  Audit History toast, Recent Activity `TIMELINE`) · right rail (Contact
  rows incl. Member Since from `createdAt`, `—` fallbacks, Send Direct
  Message toast, Admin Oversight `GOVERNANCE`). Not-found state unchanged.
- Update `UserProfile.test`.

**Check:** gate green; browser: profile of a freshly created user shows
derived code + em-dashes for live-missing fields.

---

## Phase 7 — Faculty + Students screens (spec §5.5, §5.6)

### 7.1 `features/faculty/screens/SupervisorList.tsx`
Header (+ Export CSV blob, Add Supervisor → `/users/new`) · 4 stat cards ·
toolbar (local search filters fixtures; buttons → toast) · table (progress
bars, status pills) · shared Pagination with **PREV/NEXT over 8 fixture
rows (page size 5, page 2 real, disabled at bounds)** · footer "Showing 5
of 8 faculty supervisors" · bottom 3-col (distribution / alerts /
tools + SYSTEM NOTICE).

### 7.2 `features/students/screens/StudentList.tsx`
Header (+ Export CSV, Enroll Student → `/users/new`) · 4 stat cards ·
Student Directory section (local search; buttons → toast) · table ·
shared numbered pager over 12 fixture rows (page size 5 → 3 pages, footer
"Showing 5 of 12 students") · bottom 3 cards (VIEW LOGS toast green,
IMPORT TOOL → `/users/import` blue, PREVIEW PORTAL toast green).

### 7.3 Routes
Replace Phase 2 placeholders with the real screens.

**Check:** gate green; browser: sidebar Faculty/Students render fixtures;
local search filters; pager page 2 works on both.

---

## Phase 8 — Import re-skin + navigation audit (spec §5.7, §3)

- Import: verify frozen design now sits inside the white shell with its own
  breadcrumb/footer (change nothing else).
- Sweep every navigation edge from spec §3 wiring: dashboard links,
  breadcrumb parents, back arrows, quick actions, Bulk Enrollment,
  Administrative Tools, guides/toasts — one scripted pass (goes into
  `flow.js`).

**Check:** extended `flow.js` journey green end-to-end (sign in → View Full
Directory → create → derived ID profile → import sample CSV → faculty →
students → sign out + API cleanup).

---

## Phase 9 — Full verification (spec §6)

1. Harnesses, all green: `shell.js`, `flow.js`, `mobile.js` (**7 screens ×
   {375, 768, 1280}**, no horizontal overflow), `fidelity.js` (verbatim
   labels, column headers, stat-card numbers, shell © footer strings; table
   footers assert real row counts).
2. Full gate: `pnpm -r typecheck && pnpm lint && pnpm build && pnpm test`.
3. Visual pass: full-page screenshots ×7 at 1280 reviewed against the
   pasted mockups; fix residual deltas; re-shoot until clean.

**Check:** everything green, screenshot review clean.

---

## Phase 10 — Commit

- Single feature commit **`feat(web): admin console mockup parity`**:
  all `apps/web/src/**` changes + any harness-note updates to this plan.
- Stage nothing else — `git status` must show only the known out-of-scope
  leftovers (`apps/api/**`, `.claude/`, `package-lock.json`,
  `pnpm-workspace.yaml`, `tsconfig.tsbuildinfo`).

**Check:** `git show --stat` = web sources only; working tree audit passes.
