# Admin Console — Mockup Parity Design Spec

**Date:** 2026-09-26
**Status:** approved design, pending spec review
**Supersedes:** visual sections of `2026-09-24-admin-console-design.md` (routing, data
layer, and verification rules from that spec remain in force where restated here)
**Scope:** `apps/web/src/**` — restyle the console shell and all existing screens to
match the user's v0 mockups exactly, and build the two mockup screens that are still
placeholders (Faculty Supervisors, Student Management).

## 1. Intent & decisions

The v0 mockups pasted on 2026-09-26 are the visual source of truth. The current
build differs structurally (green sidebar, different table columns, rails in the
wrong positions, one fixed footer), so a visual-fidelity pass rebuilds the
presentation layer while the approved data layer stays untouched.

| Question | Decision |
|---|---|
| Scope | **All 6 mockup pages + shell**: Dashboard, All Users, Create User, User Profile restyled; Faculty Supervisors + Student Management built as new screens; Import Users keeps its current design, re-skinned by the new shell only |
| Approach | **B — rebuild presentation, keep data layer**: `features/*/data` repos, mappers, routes, API isolation untouched; screen component trees rewritten so components map 1:1 to mockup sections |
| Sidebar nav | **Exact mockup**: Dashboard, Faculty, Students, Departments, Settings — **no Users item**; `/users*` reached via Dashboard links and breadcrumb links |
| Avatars | **Gray silhouette** everywhere (no photos exist; mockup photos unreproducible) |
| ID codes | **`USR-` + first 4 hex digits of the UUID**, display-only; fixtures pass their existing codes through; real UUID stays canonical for routes/API |
| Session line | **Dynamic role** (`ADMINISTRATOR SESSION` etc.) — not hardcoded "SUPERVISOR SESSION" as in the mockup persona |
| Footer | **Per-page variants** — each mockup has its own © line and link trio |
| Data rule | Unchanged: wire existing endpoints, mock the rest, mappers isolate; live rows show em-dash for fields the API lacks (department, last login) |
| Access control | Unchanged: `RequireAuth` only, any signed-in user; `apps/api/**` untouched |

Success: full gate green, all harnesses green, every screen screenshot-reviewed
against its mockup, one feature commit.

## 2. Structure & routes

```
src/app/layouts/console/
  Sidebar.tsx                     RESTYLE — white panel, 5 mockup nav items
  Topbar.tsx                      RESTYLE — long search, bell + red dot, session line
  ConsoleFooter.tsx               REWORK — per-page variant prop
src/features/faculty/             NEW feature
  screens/SupervisorList.tsx
  data/{types.ts, facultyRepo.ts, facultyRepo.test.ts, mock/fixtures.ts, index.ts}
src/features/students/            NEW feature
  screens/StudentList.tsx
  data/{types.ts, studentsRepo.ts, studentsRepo.test.ts, mock/fixtures.ts, index.ts}
src/features/dashboard/           RESTYLE screen + components (data untouched)
src/features/users/               RESTYLE screens/components (data += code field)
```

Routes (inside the existing `<RequireAuth><ConsoleLayout/></RequireAuth>` block;
static routes before `:userId`):

```tsx
<Route path="/dashboard" element={<CoordinatorDashboard />} />
<Route path="/faculty"   element={<SupervisorList />} />   NEW
<Route path="/students"  element={<StudentList />} />      NEW
<Route path="/users" … /> <Route path="/users/new" … />
<Route path="/users/import" … /> <Route path="/users/:userId" … />
```

- `DashboardStub` stays deleted; boundary lint holds — features import only their
  own data barrel; the shell links via plain `NavLink` paths (no `app → features`
  component imports).
- Departments / Settings remain placeholder toasts.

## 3. Shell design

**Sidebar (white):** white panel, hairline right border; green rounded logo tile +
dark "ThesisTrack" wordmark; **no MENU kicker**. Nav items exactly: Dashboard,
Faculty, Students, Departments, Settings. Active item = light-green pill + green
text/icon; inactive = slate. Persona block: **gray silhouette avatar** + real
signed-in user's name + role title (administrator→Administrator, supervisor→
Supervisor, student→Student) + decorative chevron; **red Sign Out** keeping the
exact current logic (`setExitTo('/login') → clear() → navigate('/login')`, comment
preserved). Responsive unchanged: fixed ≥1025px; off-canvas drawer + hamburger
≤1024px, same aria labels (`Open navigation`, `Sidebar`) — harnesses depend on them.

**Topbar:** long decorative search `Search students, theses, or submissions…`;
**bell icon with red dot** (decorative); right side `${role.toUpperCase()} SESSION`
+ "Department of Informatics".

**Breadcrumbs** (uppercase, `›` separators), verbatim per page:

| Page | Breadcrumb | Parent link |
|---|---|---|
| Dashboard | `ADMIN › DASHBOARD` | — |
| All Users | `ADMINISTRATION › USER MANAGEMENT` | — |
| Create | `USER MANAGEMENT › ADD NEW USER` | → `/users` |
| Profile | `ADMIN › USERS › USER DETAILS` | `USERS` → `/users` |
| Faculty | `ADMIN › USERS › SUPERVISORS` | `USERS` → `/users` |
| Students | `USERS › STUDENT DIRECTORY` | `USERS` → `/users` |
| Import | keeps current `Home / Users / Import` | (design frozen) |

**Footer variants** (left © line, right link trio):

| Page | © line | Links |
|---|---|---|
| Dashboard | `© 2024 ThesisTrack University Management System. All rights reserved.` | Support Portal · Institution Policy · Privacy Center |
| All Users | `© 2024 ThesisTrack University Management System • Institutional Access Level: ADMIN` | PRIVACY CENTER · AUDIT LOGS · SYSTEM SUPPORT |
| Create | `© 2024 THESISTRACK UNIVERSITY MANAGEMENT SYSTEM • ADMINISTRATIVE CONSOLE` | Documentation · Privacy Center · System Support |
| Profile | `© 2024 ThesisTrack University Management System • Administrative Console` | PRIVACY POLICY · SECURITY AUDIT · HELP DESK |
| Faculty | `© 2024 THESISTRACK UNIVERSITY MANAGEMENT SYSTEM • INSTITUTIONAL ADMINISTRATIVE EDITION` | PRIVACY CENTER · FACULTY HANDBOOK · SUPPORT |
| Students | `© 2024 THESISTRACK INSTITUTIONAL EDITION • ADMINISTRATIVE CONTROL CENTER` | PRIVACY SHIELD · SYSTEM HEALTH · IT SERVICE DESK |
| Import | keeps current `ThesisTrack · Department of Informatics & AI` / `Coordinator Console · © 2026` | — |

**Navigation wiring (no Users nav item):** Dashboard "View Full Directory ›" and
"Assign Students" → `/users`; "Add User" → `/users/new`; All Users header
"Create User" → `/users/new`; Bulk Enrollment "SELECT FILE" → `/users/import`;
breadcrumb `USERS` / `USER MANAGEMENT` → `/users`; profile/faculty back arrows →
`/users`. Placeholder toasts keep sonner.

## 4. Shared primitives & data additions

- **`usrCode`** (in `features/users/data/mappers.ts`, one place): live mappers add
  `code = 'USR-' + id.replace(/-/g, '').slice(0, 4).toUpperCase()`; fixtures pass
  existing codes (`USR-8821`) through unchanged. Rendered under row names and as
  `ID: USR-1E98` on profile. Malformed/short ids fall back to showing the code
  only when it is at least 4 characters, else the id itself.
- **`<Avatar />` silhouette**: gray-100 circle + gray person icon (inline SVG);
  used in sidebar persona, users table, profile header, faculty and students tables.
- **`features/faculty/data`** and **`features/students/data`**: pure fixture repos
  (dashboardRepo pattern — no network attempt, `await repo()` shape so a future
  endpoint drops in behind one function). Screens import only their data barrel.
- **Create form:** `Toggle` switches → **checkbox cards**, both default-checked;
  "Enforce Immediate Password Change" stays UI-only (still stripped by
  `toCreateBody`); dev-note copy ("UI ONLY" tag, "spec §4" helper) removed from UI.
- No new npm dependencies (checkbox = native/shadcn primitive, avatar = inline SVG).

## 5. The six screens

Verbatim strings below are binding — screenshots are checked against them.

### 5.1 Coordinator Dashboard (`/dashboard`)

- Header: breadcrumb + "Coordinator Dashboard" (no subtitle); **Export Data**
  (CSV blob of workspace rows) + **+ New Project** (toast).
- Stat cards: *Project Progress* / `AGGREGATE THESIS STATUS` — TOTAL **86**,
  ACTIVE 71 (green), COMPLETED 9 (green), AT RISK 6 (red); *Department Progress* /
  `STUDENT ALLOCATION OVERVIEW` — STUDENTS **120**, ASSIGNED 112 (green),
  UNASSIGNED 8 (red). Fixtures updated to these values.
- Left card **Primary Workspace** ("Departmental oversight & active research
  projects", decorative "All Departments" chip): table STUDENT (silhouette + name +
  `TH-2024-001`) · PROJECT DETAILS (title + phase) · STATUS (pill badges) ·
  SUPERVISOR · ⋮; footer "Showing 5 of 212 projects" + **View Full Directory ›** →
  `/users`.
- Right rail **Tasks & Deadlines**: `UPCOMING` (Review Ibrahim Musa's submission /
  Received 2 hours ago) → `ACTION REQUIRED` (Submit Chapter One · Due in 3 days;
  Respond to feedback · Due tomorrow) → `OVERDUE` red block (Ethical Approval Form
  + red **URGENT** pill) → **Critical Deadline** red card ("Faculty allocation for
  Fall 2024 Semester must be finalized by **Oct 30th**. 14 students are currently
  unassigned." + **Assign Faculty Now →** → `/faculty`).
- Bottom row: **Recent Activity** / "Departmental audit trail" (3 fixture items) |
  **Quick Actions** / "Administrative workflows" — 2×2 tiles: Add User →
  `/users/new` (Enroll student/faculty), Assign Students → `/users` (Link students
  to mentors), View Projects → `/users` (Browse active research), Generate Report →
  CSV blob (Export progress summary); inner strip `Session: <real name>
  (Informatics)` · `v1.2.4-stable`.

### 5.2 All Users (`/users`)

- Header: "All Users" + "Manage institutional accounts, permissions, and
  department assignments."; **Export CSV** + **Create User** (green → `/users/new`).
- Stat cards: TOTAL ACCOUNTS — **live** `pagination.total`, sub "+12 this month"
  (fixture); ACTIVE STUDENTS **842** "92% engagement"; FACULTY MEMBERS **156**
  "12 departments"; SYSTEM ALERTS **04** "Pending verification" (red).
- Toolbar: search `Search by name, email, or user ID…` (`q`) + **Filters**
  popover (role/status); right **`Show: [20 Rows]`** → `limit` (10/20/50).
- Table: **checkbox** column (select-all + rows; selection state only, no bulk
  actions); USER (silhouette + name + code, email below); ROLE & DEPT (badge +
  dept line, `—` for live users); STATUS (green/gray/amber **dot** + title-case
  label Active/Inactive/Invited); LAST LOGIN (clock + relative for fixtures, `—`
  for live; **visible at every breakpoint**); ⋮ menu (View → profile); sortable
  USER ↔ / ROLE & DEPT ↔ / STATUS ↔ (client-side, existing pattern).
- Pagination: `Showing 1–20 of 65 users` + **numbered** `‹ Prev [1] 2 3 … N Next ›`
  (current = green square); real API pages only — no phantom numbers.
- Below, full-width 2-col: **Recent Security Logs** / "Administrative audit trail
  for user actions" + "Full Audit Log" (toast); 4 dot entries with right-aligned
  timestamps | **Bulk Enrollment** / "Institutional onboarding tools"; dashed box
  (doc icon, "Import Users via CSV", **SELECT FILE** → `/users/import`);
  `ADMINISTRATIVE GUIDES` rows "User Role Matrix ›" / "Permission Protocols ›"
  (toasts).
- Sample-data fallback banner and inline write errors unchanged.

### 5.3 Create User Account (`/users/new`)

- Header: circular back arrow → `/users`; "Create User Account" + "Register new
  students, faculty, or staff into the ThesisTrack portal."; top-right **✕ Cancel**
  (→ `/users`) + **Add User** (submit).
- Sections = icon + bold title + uppercase kicker **beneath** + hairline rule:
  1. `Identity & Contact` / `BASIC ORGANIZATIONAL INFORMATION` — First Name,
     Last Name, Institutional Email (envelope prefix) + italic helper "Verification
     email and portal invitation will be sent to this address."
  2. `Role & Permissions` / `SYSTEM ACCESS CONFIGURATION` — System Role +
     Academic Department selects (API-valid roles; mock department list).
  3. `Account Onboarding` / `AUTOMATION SETTINGS` — two **checkbox cards**,
     default-checked: "Send Invitation Email Immediately" ("User will receive a
     secure magic link to set their initial password and access the dashboard.") and
     "Enforce Immediate Password Change" ("For security, users will be required to
     update their temporary credentials upon their first successful login.").
- Bottom: italic "System logs will record this creation event under Coordinator
  profile for institutional audit purposes." + **Discard Changes** (text →
  `/users`) + **Create User Profile** (submit). Top and bottom buttons share
  handlers. Zod validation, inline errors, `POST /users` (+ invite per toggle),
  success toast → `/users/:id` all unchanged.
- Right rail: solid sage banner block → large silhouette avatar → **Account
  Preview** + live email → pills `UNASSIGNED ROLE` (→ selected-role badge) /
  `PENDING INVITE` → rows DEPARTMENT "Not Selected" · ENROLLMENT ID "TBD" ·
  STATUS amber-dot "Awaiting Setup" → "ⓘ Changes reflect in real-time" → green
  **Administrative Tip** callout ("Ensure the user's role matches their official
  university contract. Assigning a Supervisor role gives them power to grade and
  review student theses.") → **Creation Log** (Auto-save enabled · SSL Encrypted
  Transfer).

### 5.4 User Profile (`/users/:userId`)

- Header: back arrow → `/users`; "User Profile" + `ID: USR-1E98` (derived code);
  top-right **Reset Password** (outline, live `POST /users/:id/invite` + toast),
  **Edit User** (green → toast), **⋯** (toast menu).
- Header card: silhouette avatar + name + green **ACTIVE** pill + "Student •
  Informatics & AI" (role + static dept fallback) + right counters **THESES 02** |
  **MILESTONES 14** (fixture).
- Left column: **Thesis Assignments** header + "ADD PROJECT ›" (toast); two cards
  side-by-side (green code + status pill + Supervisor / Last updated rows) →
  **Audit Logs** (`SECURITY` kicker; ACTION / IP / WHEN / OUTCOME; SUCCESS/WARNING
  pills; "View Full Audit History ↗" toast) → **Recent Activity** (`TIMELINE`
  kicker; 3 items).
- Right rail: **Contact Information** (`DETAILS` kicker; rows Email, Phone,
  Office/Address, Portal Language, **Member Since** = live `createdAt`; `—`
  fallbacks) + **Send Direct Message** (toast) → **Admin Oversight**
  (`GOVERNANCE`: Last login, Account created by "Admin Portal", Permissions
  "Standard User", Registration no. `—`).
- Not-found inline state with back link unchanged.

### 5.5 Faculty Supervisors (`/faculty`, new)

- Header: "Faculty Supervisors" + "Manage thesis supervision workloads and
  department assignments."; **Export CSV** (blob of loaded rows) + **Add
  Supervisor** → `/users/new`.
- Stat cards: TOTAL SUPERTORS **42** "+2 THIS TERM"; ACTIVE STUDENTS **212**
  "+15% FROM LAST YEAR"; AVG. LOAD / FACULTY **5.2** "OPTIMAL RANGE" (green);
  PENDING ALLOCATIONS **14** "NEEDS ATTENTION" (red).
- Toolbar: local search `Search by name, email, or department…` + **All
  Departments** / **Load Status** (decorative → toast).
- Table: SUPERVISOR DETAILS (silhouette + name + `FAC-8821`) · DEPARTMENT ·
  WORKLOAD ("8 Students" + `CURRENT LOAD`) · AVG. PROGRESS (mini bar + %) · STATUS
  (MAX LOAD red / ACTIVE green / ON LEAVE gray pills) · LAST ACTIVITY · ⋮.
  Fixture provides **8 rows**, page size 5 → footer "Showing 5 of 8 faculty
  supervisors" + **PREV/NEXT** with real page 2 (3 rows); disabled at bounds —
  no phantom pages. Stat card keeps the branded total 42.
- Bottom 3-col: **Departmental Distribution** (Informatics 12 / Architecture 8 /
  Cyber Security 10 / Philosophy 12, green bars) · **Load Capacity Alerts**
  (Dr. Alistair Vance red: "Workload exceeded (12/10). Re-allocation of 2 students
  required immediately."; Dr. Elena Rossi amber: "Approaching max capacity (8/10).
  Review allocation for next semester.") · **Administrative Tools**: BULK ASSIGN
  STUDENTS → `/users/import`, UPDATE FACULTY ROLES → toast, COMMUNICATE ALL →
  toast + green **SYSTEM NOTICE** ("The 2024 Fall Allocation window is open. Ensure
  all faculty supervisors have updated their research interests.").

### 5.6 Student Management (`/students`, new)

- Header: "Student Management" + "Manage institutional enrollment, departmental
  assignments, and thesis progress."; **Export CSV** + **Enroll Student** →
  `/users/new`.
- Stat cards: TOTAL STUDENTS **1,240** "+12% from last term" (green); POSTGRADUATES
  **412** "33% of total enrollment"; THESIS ACTIVE **856** "71 students pending
  review"; RISK ALERTS **14** "Delayed or stalled projects" (red).
- Section header "Student Directory" / "Full database of registered students and
  their academic standing." + local search `Search by name, ID or email…` + **All
  Programs** / **All Depts** (toast).
- Table: STUDENT IDENTITY (silhouette + name + `STU-2024-001` + email) · ACADEMIC
  GROUP (level + dept w/ icon) · THESIS STATUS (pill + clock `ENROLLED 2023`) ·
  PRIMARY SUPERVISOR (green dot + name) · ACTIONS ⋮. Fixture provides **12
  rows**, page size 5 → numbered pager with 3 real pages; footer "Showing 5 of
  12 students" (**counts real fixture rows**, never the branded 1,240 — that
  lives only in the stat card). Shared pager component with All Users.
- Bottom 3 cards: **AUDIT TRAIL** "VIEW LOGS →" (toast, green) · **BULK
  OPERATIONS** "IMPORT TOOL →" `/users/import` (blue, per mockup) · **STUDENT
  PORTAL** "PREVIEW PORTAL →" (toast, green).

### 5.7 Import Users (`/users/import`, frozen)

Wizard markup, steps, CSV parser, buttons all unchanged; inherits white shell.
Keeps current breadcrumb and footer text.

## 6. Verification

1. `pnpm -r typecheck && pnpm lint && pnpm build && pnpm test`; boundary lint intact.
2. Unit tests: extended `mappers.test` (`code` derivation: live UUID → `USR-XXXX`,
   fixture passthrough, malformed fallback); updated `UserCreate`/`UserList`/
   `UserProfile` DOM tests; new `facultyRepo`/`studentsRepo` shape tests. CSV
   parser, `usersRepo`, dashboard tests untouched.
3. Browser harnesses (in `/tmp/opencode`, recreated when wiped): `shell.js`
   (white sidebar, exactly 5 nav items, bell, silhouette persona, red Sign Out,
   breadcrumbs/footers, 375 drawer), `flow.js` (sign in → View Full Directory →
   create → derived ID on profile → import CSV → faculty/students fixtures →
   sign out + API cleanup), `mobile.js` (7 screens × 375/768/1280, no overflow),
   `fidelity.js` (verbatim labels, column headers, stat-card numbers, and shell
   © footer strings per screen; table footers assert row counts, not mockup
   totals).
4. Full-page screenshots of all 7 at 1280 reviewed against the pasted mockups;
   residual deltas fixed pre-commit.
5. Single commit `feat(web): admin console mockup parity`; never stage
   `apps/api/**`, `.claude/`, `package-lock.json`, `pnpm-workspace.yaml`,
   `tsconfig.tsbuildinfo`.

## 7. Risks

| Risk | Mitigation |
|---|---|
| Live users lack department / last-login | em-dash fallback (same honesty rule as ContactCard); fixtures show full data |
| Fixture pagination could render phantom pages | pager is data-driven everywhere; disabled at bounds |
| DOM tests brittle against rewritten markup | update selectors in the same commit; data-layer tests untouched |
| `/tmp` wiped on environment restart | harnesses recreated from spec §6 when missing |
| Mockup footer/breadcrumb strings drift from memory | strings are verbatim in this spec; `fidelity.js` asserts them |

## 8. Out of scope

- Photo avatars, real global search, bell notifications, checkbox bulk actions.
- Departments / Settings screens (placeholders stay).
- Role-based gating, `apps/api/**` changes, `.xls` parsing, new npm dependencies.
- Import wizard redesign (frozen by decision).
