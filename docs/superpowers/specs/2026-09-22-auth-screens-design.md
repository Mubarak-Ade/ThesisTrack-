# ThesisTrack — Auth & Account Lifecycle Screens (Design Spec)

**Date:** 2026-09-22
**Status:** Approved (conversational design) — pending written-spec review
**Scope:** 15 frontend screens + backend invite-preview endpoint + auth wiring. Dashboards excluded (stub only).

## 1. Goal

Build all non-dashboard screens from the Visily mockups
(`/home/aim/Downloads/visily-multiscreens/*.webp`) in `apps/web` and wire each
screen to the real API in `apps/api`. No mocked data anywhere in the 15 screens.

**Success criteria:** a user can complete sign-in, forgot/reset password, and
invitation activation end-to-end against the real PostgreSQL-backed API; every
error/status screen is reachable from real backend states; `pnpm typecheck`,
`pnpm lint`, and `pnpm build` pass.

**Explicitly out of scope:** student/supervisor dashboards (replaced by a stub),
real email delivery (existing dev-token console logging stays), admin
invite-issuing UI, i18n, E2E browser tests, backend test harness.

## 2. Constraints & decisions (from user)

- **Imagery:** CC0/Unsplash-style stock photos committed to
  `apps/web/public/images/` with alt text and CSS gradient fallbacks.
- **UI stack:** Tailwind CSS **v4** (CSS-first `@theme` config) + **shadcn/ui**
  (New York, brand-green primary). Custom components layer on shadcn
  primitives.
- **HTTP client:** **axios** (not raw fetch) with interceptor-based refresh.
- **Fidelity:** faithful to mockups, responsive/mobile-friendly; normalize
  mockup inconsistencies (two login variants, differing footer links) into one
  coherent system.
- **Post-login destination:** placeholder stub page (dashboards later).
- **Architecture:** Approach A — typed axios client + TanStack Query for data,
  zustand for auth user, react-hook-form + zod for forms.

## 3. Routes & screen inventory

All screens use a shared `AuthLayout` (logo bar, left illustration column,
right content column, footer) except where a mockup uses the image-hero
variant (`StatusLayout`).

| Route | Screen | Backend dependency |
|---|---|---|
| `/login` | Sign in | `POST /auth/login` |
| `/login` (error state) | Sign in + "Authentication failed" alert | same — inline on 401 |
| `/forgot-password` | Forgot password form | `POST /auth/forgot-password` |
| `/forgot-password/sent` | "Check your email" + Resend | `POST /auth/forgot-password` (resend) |
| `/reset-password?token=…` | Create new password + strength meter | `POST /auth/reset-password` |
| `/reset-password/success` | "Password updated" | — (post-submit) |
| `/invite?token=…` | "Welcome to ThesisTrack" | `GET /auth/invitation/:token` (**new**) |
| `/invite/confirm?token=…` | Confirm academic identity | same new endpoint |
| `/invite/activate?token=…` | Set security credentials (create password) | `POST /auth/activate` |
| `/invite/activate/success` | "Your account is ready" | — (post-submit) |
| `/invite/already-activated` | Account already activated | invite-preview `status` |
| `/invite/invalid` | Invitation link unavailable | invite-preview `status` |
| `/session-expired` | Session expired | — |
| `/unauthorized` | Sign in required (401) | — |
| `/forbidden` | Access restricted (403) | — |
| `/`, `/dashboard` | **Stub:** "Signed in as {name}" + sign out | `GET /auth/me` |

### Routing behavior

- `/invite/confirm` (and `/invite/activate`) redirect based on the preview
  endpoint's `status`: `invalid` → `/invite/invalid`,
  `already_activated` → `/invite/already-activated`, `valid` → render.
- Any `/invite/*` route visited without a `token` param → `/login`.
- `RequireAuth` guard: `anonymous` → `/unauthorized` (preserving
  `state.from`); `unknown` (boot refresh in flight) → minimal loading state,
  no redirect flicker.
- `/login?next=…` restores the intended destination after sign-in.
- Global client handlers: 401 (after failed refresh retry) → `/session-expired`
  when initiated from a protected route, otherwise `/unauthorized`; 403 →
  `/forbidden`.

## 4. Shared components & visual system

### Design tokens (Tailwind v4 `@theme` in `index.css`)

- `--primary`: deep institutional green (~`#0F6B3E`; dark button variant
  ~`#0A4D2C`) — exact hexes extracted from mockups at implementation time.
- `--surface`: warm off-white (~`#FAFAF8`); headings near-black.
- `--danger`: error red for alerts; soft green tint for info/success callouts.
- Fonts: serif display (Fraunces or Source Serif 4) as `--font-display` for
  the mockups' serif headlines; Inter as `--font-sans` for UI/body.
- shadcn CSS variables (`--background`, `--primary`, `--destructive`, …)
  mapped onto these brand tokens; New York style, base color chosen to match
  mockup neutrals.

### Stack setup

- Upgrade `tailwindcss ^3.4.16` → **v4**; use `@tailwindcss/vite` plugin;
  remove PostCSS/autoprefixer config and `tailwind.config.js` (CSS-first).
- Initialize **shadcn/ui** in `apps/web`; components: `button`, `input`,
  `label`, `card`, `alert`, `badge`, `separator`, `progress`, `form` (plus
  others only if a screen requires them).
- **lucide-react** as the icon set (shadcn default).
- Vite dev proxy: **already configured** in `apps/web/vite.config.ts`
  (`/api` → `http://localhost:5000`, port 5173) — verified, no change needed.

### Component inventory (`apps/web/src/components/`)

- `AuthLayout` — logo bar, left illustration column (library photo + serif
  headline + subcopy), right content column, footer
  (© 2026 · Contact IT Help · Privacy Policy · Terms of Service).
- `StatusLayout` — image-hero variant: hero image slot with optional
  check-badge overlay, serif heading, callout box, actions.
- `PasswordField` — thin wrapper over shadcn `Input`: lock icon, show/hide
  eye toggle, label. Used by login, reset, activate.
- `PasswordStrengthMeter` — checklist + progress bar + status pill
  ("Not set / Weak / Fair / Strong"). Two rule sets via `variant` prop:
  - `reset`: min 8 chars, one uppercase, one lowercase, one number.
  - `activate`: min 10 chars, uppercase, one number, special character,
    passwords match exactly.
- `Callout` — icon + title + body; variants `info` (green tint),
  `danger` (red tint), `neutral` (gray). Backs "IMPORTANT NOTE",
  "AUTHENTICATION FAILED", "NEXT STEPS", "security protocol" boxes.
- `FormMessage` — inline API error/success banner from mutation errors.
- `BrandMark` — green rounded-square book icon + "ThesisTrack" wordmark
  (inline SVG, redrawn).
- `RequireAuth` — route guard (§3).

### Imagery (`apps/web/public/images/`)

CC0/Unsplash-style photos, committed to the repo, each with `alt` and a CSS
gradient fallback behind it:

- library/study scene — all left panels
- graduation cap + certificate — activation success, already-activated
- red graduation/diploma — invitation welcome
- envelope — check your email
- 3D-style thumbs-up (or equivalent) — session expired, create-password panel
- abstract green gradient — forbidden panel

## 5. Backend additions (`apps/api`)

Three changes, all in the existing auth module:

### 5.1 `GET /auth/invitation/:token` (new)

Looks up the hashed token (existing `findAccountTokenByHash`) **without
consuming it**, joins the user row, and always returns HTTP 200 with a
discriminator so the frontend routes on one field:

```json
{
  "status": "valid" | "already_activated" | "invalid",
  "invitation": {
    "name": "Benjamin S. Thompson",
    "email": "…",
    "role": "student" | "supervisor" | "admin",
    "registrationNumber": "UG/2024/RES-0842" | null
  } | null
}
```

- `valid` + payload: unused, unexpired `activation` token.
- `already_activated`: token exists but `usedAt` set, **or** the user is
  already `ACTIVE`.
- `invalid`: unknown, expired, or non-activation token type.
- Never returns an invitation payload unless `type === 'activation'`.
- `name` is derived server-side as `` `${firstName} ${lastName}` `` (the
  `users` table stores names split; there is no single `name` column).

### 5.2 Schema addition: `registrationNumber`

The mockup's "REGISTRATION NUMBER" (UG/2024/RES-0842) has **no backing
column** in `schema/users.ts` (verified: only email/firstName/lastName/
passwordHash/role/isActive/timestamps). Therefore:

- Add a nullable `registrationNumber: varchar('registration_number', { length: 32 })`
  to the `users` table, with a Drizzle migration (`pnpm db:generate` +
  `pnpm db:migrate`). Nullable — existing rows and supervisors/admins have
  none.
- Extend `modules/auth/repository.ts` token lookup to join `users` and read
  `firstName`, `lastName`, `role`, `isActive`, `registrationNumber`.
- The confirm-identity screen renders `registrationNumber` when present;
  when `null` it shows "Not on file — contact your department" in muted
  text (never a fake value).

### 5.3 Public user

`PublicUser` (`modules/users/types.ts`) is **not** changed; the invitation
payload is assembled only inside the new endpoint.

### 5.4 `POST /auth/activate`

No change — already returns the public user consumed by the activation-success
screen.

No new middleware: existing 401/403 envelopes from `errors/index.ts` are what
the client keys its redirects on. Login, forgot, reset, refresh, logout, me
are consumed as-is.

## 6. Frontend auth & data wiring

### Axios client (`apps/web/src/lib/http.ts`)

- `axios.create({ baseURL: '/api/v1', withCredentials: true })`.
- **Request interceptor:** injects `Authorization: Bearer <accessToken>` from
  the in-memory store. Access token lives **in memory only** (never
  localStorage); the refresh cookie is the source of truth.
- **Response interceptor (401 refresh queue):** on 401 (excluding the refresh
  call itself to prevent loops), pause the failed request in a promise queue,
  run one `POST /auth/refresh`, replay queued requests with the new token.
  Refresh failure → clear auth state + redirect per §3. Concurrent requests
  share the single in-flight refresh.
- **403:** redirect `/forbidden`.
- **Error normalization:** convert axios errors into
  `ApiError { status, code, message }` from the API's error envelope so
  screens branch on codes (login "Authentication failed" vs "Account is not
  active").

### Auth store (`stores/auth.ts`, extended)

`{ user, status: 'unknown' | 'anonymous' | 'authenticated', accessToken,
setSession(), clear() }`. An `AuthProvider` wrapper performs boot-time
`POST /auth/refresh` + `GET /auth/me` once, then exposes the store.

### Data & forms

- **TanStack Query:** one query — `GET /auth/invitation/:token` on
  invite/confirm screens (enables status branching + refetch). Everything
  else is mutations.
- **react-hook-form + zod:** schemas per form; `.refine` for
  confirm-password match; submit via mutation; API errors → `FormMessage`;
  field-level 422s → `FormState.errors` via resolver.
- Status/success screens render from route state; `already-activated` and
  `invalid` are only reachable through the real invite-preview status.
- **Logout** (stub page): clear store + `POST /auth/logout` → `/login`.

## 7. Testing & verification

**Runner:** Vitest added to `apps/web` (none exists today).

- Unit: strength-meter rule evaluation; `ApiError` normalization from axios
  errors; invite-status → route mapping; zod schemas incl. confirm-password
  refine.
- Component: login and activate forms — submit→success, submit→API error
  rendering, disabled states.
- Backend: existing `pnpm typecheck` + `pnpm lint`; manual end-to-end
  verification against a seeded dev DB (`seed-admin`, `seed-rbac`).

**Verification loop:** `pnpm typecheck`, `pnpm lint`, `pnpm build` clean for
both apps; then walk all 15 screens in the browser against the real API,
including invalid / already-activated / expired invite branches (dev `devToken`
response + seed scripts).

## 8. Documentation & delivery

- This spec: `docs/superpowers/specs/2026-09-22-auth-screens-design.md`,
  committed.
- Next step after spec approval: writing-plans skill → implementation plan,
  then implementation.
