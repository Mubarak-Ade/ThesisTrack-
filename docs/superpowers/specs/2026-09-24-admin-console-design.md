# Admin Console — Shell + Five Screens Design Spec

**Date:** 2026-09-24
**Status:** approved design, pending spec review
**Scope:** `apps/web/src/**` (new code) — five console screens from the supplied
mockups, wired to existing API endpoints where they exist and to mock data
where they don't, behind a change-isolating adapter layer.

## 1. Intent & decisions

Build the admin/coordinator console shown in the five mockups: a new app shell
(sidebar + top search + session header + footer) wrapping **Coordinator
Dashboard, All Users, Create User Account, User Profile, Import Users** —
navigable, visually faithful, on the existing stack (React + Tailwind v4 +
shadcn, feature-sliced layout, boundary lint).

| Question | Decision |
|---|---|
| Data wiring | Wire existing endpoints; mock the rest; isolate both so API changes cannot ripple into screens |
| Routing | `/dashboard` becomes the Coordinator Dashboard (DashboardStub deleted); console section = `/users`, `/users/new`, `/users/:id`, `/users/import` wrapped by the new shell |
| Access control | Any signed-in user (existing `RequireAuth` only; no role gating) |
| Data-layer approach | **A — repository/adapter layer** (stable internal types, one mapper per API shape, mock fixtures, read-fallback) |

Success: full gate green (typecheck/lint/build/tests), browser flows pass
(create → visible in list → profile → import), all five screens have no
horizontal overflow at 375/768/1280, and boundary lint still holds.

## 2. Structure & routes

```
src/app/layouts/
  ConsoleLayout.tsx                 NEW — console shell, renders <Outlet/>
  console/
    Sidebar.tsx                     nav + placeholder items + user footer + Sign Out
    Topbar.tsx                      search (decorative) + session header
    ConsoleFooter.tsx               console footer strip
src/features/dashboard/
  screens/CoordinatorDashboard.tsx
  data/{types.ts, dashboardRepo.ts, dashboardRepo.test.ts, mock/…}
src/features/users/
  screens/{UserList,UserCreate,UserProfile,UserImport}.tsx
  components/…                      UsersTable, StatCards, AccountPreview,
                                    RoleBadge, AuditLogs, ActivityFeed,
                                    ImportWizard, … (feature-internal)
  data/{types.ts, usersRepo.ts, usersRepo.test.ts, mock/…}
```

Routes (in `app/router/App.tsx`; static routes ranked before the param route):

```tsx
<Route element={<RequireAuth><ConsoleLayout /></RequireAuth>}>
  <Route path="/dashboard" element={<CoordinatorDashboard />} />
  <Route path="/users" element={<UserList />} />
  <Route path="/users/new" element={<UserCreate />} />
  <Route path="/users/import" element={<UserImport />} />
  <Route path="/users/:userId" element={<UserProfile />} />
</Route>
```

- `pages/DashboardStub.tsx` is **deleted**; `pages/` is left with only `Home.tsx`.
- Auth screens/routes keep their current layouts; `/` landing untouched.
- Shell code lives in `app/` (unrestricted layer); it links to screens via plain
  `NavLink`s — no `app → features` component imports, boundary lint unaffected.
- New feature code obeys the existing rules: features import own-feature code
  relatively and never `@/features/*`, `@/pages`, each other.

## 3. Shell behavior

- **Sidebar:** Dashboard → `/dashboard`; Faculty, Students, Departments,
  Settings → click shows a "… is not available yet" toast (placeholders).
  Bottom: real signed-in user — initials avatar, name, role title
  (administrator→Administrator, supervisor→Supervisor, student→Student), and a
  **working Sign Out** that replicates DashboardStub's exact logic
  (`setExitTo('/login') → clear() → navigate('/login')`, comment preserved) so
  the session-expired/sign-out flows keep passing.
- **Topbar:** decorative search input (focusable, no behavior) + session header
  showing `${role.toUpperCase()} SESSION` and "Department of Informatics"
  (static — API users have no department).
- **Responsive:** ≥1025px fixed sidebar; ≤1024px sidebar collapses to an
  off-canvas drawer toggled by a hamburger in the topbar. Footer stacks.

## 4. Data layer (approach A)

**Rule 1 — screens import only their feature's `data/` repo and internal
types; they never see raw DTOs.** Each repo exposes functions returning
stable internal types (`ConsoleUser`, `UsersPage`, `UserDetail`, …).

**Rule 2 — one `map*()` translator per API shape.** Mappers are defensive:
known fields picked explicitly, unknown fields ignored, missing fields
defaulted. An API change means editing one mapper.

**Rule 3 — reads fall back, writes surface.** Read functions try live, and on
any error/shape drift `console.warn` + return the repo's mock snapshot; list
UIs show a subtle "showing sample data" banner while in fallback. Write
functions (create, invite, import) **never fake success** — errors render
inline in the form.

### Wire-vs-mock matrix

| Concern | Source | Endpoint / notes |
|---|---|---|
| Users table, search `q`, role/status filters, paging | LIVE | `GET /users` (schema supports `q`, `role`, `isActive`, paging) |
| Total-accounts stat | LIVE total if envelope has it, else mock | `GET /users` |
| Other stat cards (students/faculty/alerts) | MOCK | no aggregate endpoint |
| Create account | LIVE | `POST /users`; adapter sends only schema-accepted fields (plan phase reads `createUserSchema` to pin the list) |
| "Send Invitation Email" toggle | LIVE | create → `POST /users/:id/invite`; toggle off = skip |
| "Enforce Immediate Password Change" | MOCK/UI-only | stored nowhere (API has no such flag) |
| Profile core (name, email, role, status, id, created) | LIVE | `GET /users/:id` |
| Contact extras (phone, address, language) | MOCK | merged under live fields by user id |
| Reset Password button | LIVE (re-invite) | `POST /users/:id/invite` + success toast |
| Edit User, Send Direct Message, row-menu actions (except View) | Toast placeholder | YAGNI |
| Bulk import finalize | LIVE | `POST /users/import` (plan phase reads `importUsersSchema`) |
| Coordinator Dashboard (all cards/table/tasks/activity) | MOCK | no endpoints |
| Audit logs, security logs, activity feeds, thesis cards, oversight card | MOCK | fixtures |
| Department selects/filter options | MOCK constants | no departments endpoint |
| Export CSV / Download Template / Sample Excel | Client blob | generated CSV download (labels kept from mockup; file is `.csv` — deliberate) |

**Profile id display:** routes and API use real UUIDs; the ID line shows the
real id. Mockup-style `USR-2024-####` codes appear only inside mock fixtures.

**Status derivation:** mapper uses the API's `status` field when present,
else `isActive ? 'ACTIVE' : 'INVITED'`; the `'INACTIVE'` badge appears only
in mock fixtures. `RoleBadge` renders whatever string it receives, so
fixtures may use display-only labels (e.g. Coordinator) that the API cannot
produce.

**Transient feedback:** the repo has no toast system — the design adds
`sonner` (standard shadcn toast) for toasts (placeholder notices, re-invite
success, import summary); form/validation errors stay inline via the existing
`Callout`/`FormMessage` components.

## 5. The five screens

All faithful to the mockups: existing green tokens, `font-display` headings,
uppercase section kickers, badge/pill styles, table styles, shadcn primitives
reused (`Button, Card, Input, Label, Badge, Separator, Callout, FormMessage`).

1. **Coordinator Dashboard** (`/dashboard`) — breadcrumb, Project Progress and
   Department Progress stat cards, Primary Workspace table (mock rows, filter
   chip decorative), Tasks & Deadlines rail incl. Critical Deadline card,
   Recent Activity, Quick Actions (Add User → `/users/new`; Assign Students /
   View Projects → `/users`; Generate Report → CSV blob or toast). All figures
   mock (dashboardRepo).
2. **All Users** (`/users`) — 4 stat cards; search + Filters popover (role,
   status) wired to `GET /users` params; sortable table (client-side sort of
   the loaded page — works for live and mock); status badges; row ⋮ menu
   (View → profile); pagination from API total with page-size select
   (10/20/50 → `limit`); Export CSV (blob of loaded rows); Recent Security Logs
   (mock); Bulk Enrollment card → `/users/import`; guide links decorative.
3. **Create User Account** (`/users/new`) — Identity & Contact, Role &
   Permissions (role options = API-valid: Student, Supervisor, Administrator;
   department = mock list), Account Onboarding toggles; right rail Account
   Preview updates live from form state (name, email, badges, Not Selected /
   TBD / Awaiting Setup); zod validation mirroring API constraints; submit →
   `POST /users` (+ invite if toggled) → success toast → `/users/:id`;
   Cancel/Discard → `/users`. Loading/error inline per Rule 3.
4. **User Profile** (`/users/:userId`) — `GET /users/:id` drives header card
   (avatar initials, name, role badge, dept fallback, status) + Contact
   Information (live fields over mock extras); Thesis Assignments, Audit logs,
   Recent Activity, Admin Oversight = mock rails; Reset Password = live
   re-invite; not-found → inline state with "back to users" link (no redirect
   loop).
5. **Import Users** (`/users/import`) — 4-step wizard (local state): ① Upload
   — real file input, hand-rolled CSV parser (quotes/commas/newlines; **no new
   dependency**, unit-tested), Sample/Template buttons download a generated
   CSV; ② Map Columns — auto-guess header mapping, remappable selects,
   required columns flagged; ③ Validate Data — client rules (email format,
   API-valid role, required names) with per-row errors; ④ Finalize —
   `POST /users/import` via adapter, success summary (counts if the envelope
   provides them) or inline row errors with retry. Non-CSV files → friendly
   "export as CSV" hint (the mockup's `.xls` copy stays, parser is CSV-only).

## 6. Verification

1. `pnpm -r typecheck && pnpm lint && pnpm build && pnpm test` green;
   boundary lint intact.
2. New unit tests: mappers (live / drifted / fallback), CSV parser,
   `UserCreate` (validation, preview updates, submit → repo called with mapped
   body via `vi.mock`), `UserList` (rows + fallback banner).
3. Browser harness (extend the phase5 style): sign in → dashboard renders →
   `/users` live list → create user via UI → appears in list → open profile →
   import a generated sample CSV → success; sidebar Sign Out → `/login`.
4. 5 screens × {375, 768, 1280} no horizontal overflow.
5. Single feature commit at the end: `feat(web): admin console shell + screens`
   (plan may split if size demands); never staging `apps/api/**`, junk files,
   or `tsconfig.tsbuildinfo`.

## 7. Risks

| Risk | Mitigation |
|---|---|
| API schemas are mid-refactor (uncommitted) | adapters isolate shape; plan phase reads current `users/schema.ts` to pin fields before wiring |
| Read shapes drift after build | defensive mappers + mock fallback keep screens rendering; tests pin mapper behavior |
| Desktop-first mockups vs small screens | off-canvas drawer + stacked grids; overflow harness at 3 breakpoints |
| Mock fixtures drift from live rendering paths | fixtures flow through the same mappers/types as live data |
| Import schema mismatch | adapter is the single mapping point; wizard surfaces API rejections inline |

## 8. Out of scope

- Faculty / Students / Departments / Settings screens (placeholders only).
- Real global search, role-based gating, notifications, websockets.
- `.xls` parsing, CSV export server-side, real audit/activity endpoints.
- Any `apps/api/**` changes.
