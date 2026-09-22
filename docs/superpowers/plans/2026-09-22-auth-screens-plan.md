# ThesisTrack — Auth Screens Implementation Plan

**Spec:** `docs/superpowers/specs/2026-09-22-auth-screens-design.md`
**Date:** 2026-09-22

Each task is independently verifiable. Do not start a phase before the prior
phase's checkpoint passes (`pnpm typecheck && pnpm lint` clean, plus the
task-specific check noted at each checkpoint).

---

## Phase 0 — Tooling & stack setup

### 0.1 Upgrade Tailwind to v4
- `apps/web/package.json`: remove `tailwindcss@^3.4.16`, `postcss`,
  `autoprefixer`; add `tailwindcss@^4` and `@tailwindcss/vite@^4`.
- `apps/web/vite.config.ts`: add `tailwindcss()` plugin after `react()`.
- Delete `apps/web/postcss.config.*` and `apps/web/tailwind.config.*` if
  present.
- `apps/web/src/index.css`: replace `@tailwind` directives with
  `@import "tailwindcss";` and add the `@theme` token block from spec §4
  (`--color-primary`, `--font-display`, `--font-sans`, brand hexes extracted
  from mockups).

**Check:** `pnpm --filter @thesistrack/web dev` serves `Home.tsx` with
Tailwind utilities working.

### 0.2 shadcn/ui + deps
- Init shadcn in `apps/web` (New York style, RSC=false, `src/components/ui`,
  CSS variables path `src/index.css`).
- Base color: neutral tuned to mockup surface (`#FAFAF8` family).
- Add components: `button`, `input`, `label`, `card`, `alert`, `badge`,
  `separator`, `progress`, `form`.
- Confirm `lucide-react`, `class-variance-authority`, `clsx`,
  `tailwind-merge` landed in `apps/web/package.json`.
- Map shadcn `--primary` / `--destructive` CSS vars to brand tokens.

**Check:** `pnpm --filter @thesistrack/web build` passes; a `<Button>` renders
in `Home.tsx`.

### 0.3 axios + Vitest
- `apps/web`: add `axios`; dev deps `vitest`, `@testing-library/react`,
  `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`.
- `apps/web/package.json`: `"test": "vitest run"`; `vitest.config.ts` (or
  `test` block in vite config) with `environment: 'jsdom'`, setup file
  importing `@testing-library/jest-dom`.
- Root `package.json`: add `"test": "pnpm --filter @thesistrack/web test"`.

**Check:** an empty/smoke test passes via `pnpm --filter @thesistrack/web test`.

### Phase 0 checkpoint
`pnpm typecheck && pnpm lint && pnpm build` clean; smoke test passes.

---

## Phase 1 — Backend: invite preview + registration number

### 1.1 Schema
- `apps/api/src/schema/users.ts`: add
  `registrationNumber: varchar('registration_number', { length: 32 })`
  (nullable, no default).
- Run `pnpm db:generate` → new migration in `apps/api/drizzle/`;
  `pnpm db:migrate` against dev DB.

**Check:** migration applies; `pnpm --filter @thesistrack/api typecheck`.

### 1.2 Repository
- `apps/api/src/modules/auth/repository.ts`: extend
  `findAccountTokenByHash` (or add `findInvitationByTokenHash`) to select
  the joined user (`users` relation already exists on `accountTokens`):
  `firstName, lastName, email, role, isActive, registrationNumber`.
- Return type: token row + user fields, or `undefined`.

**Check:** typecheck.

### 1.3 Service
- `apps/api/src/modules/auth/service.ts`: add
  ```ts
  previewInvitation(token: string): Promise<{
    status: 'valid' | 'already_activated' | 'invalid';
    invitation: { name; email; role; registrationNumber } | null;
  }>
  ```
  Logic (spec §5.1): lookup by `hashToken(token)`; not found / wrong type
  (`type !== 'activation'`) / expired → `invalid`; `usedAt !== null` OR
  `user.isActive && user.passwordHash` → `already_activated`; else `valid`
  with payload (`name = \`${firstName} ${lastName}\``). No token consumed,
  no errors thrown — always resolves with a status.

### 1.4 Controller + route
- `apps/api/src/modules/auth/controller.ts`: `previewInvitation` handler →
  `respond(res, 200, { status, invitation })`.
- `apps/api/src/modules/auth/routes.ts`:
  `router.get('/invitation/:token', controller.previewInvitation)` with a
  `z.string().min(1)` param check via existing `validate` middleware or inline.
- No auth middleware (public by design; returns only non-sensitive preview
  fields).

**Check:** with dev server running and a seeded INVITED user (use existing
`seed-rbac`/provisioning path or insert one), curl all three branches:
`valid`, then activate it → `already_activated`, then a random token →
`invalid`. Response is 200 in all cases.

### Phase 1 checkpoint
`pnpm typecheck && pnpm lint && pnpm build` clean; curl branches verified.

---

## Phase 2 — Frontend auth core

### 2.1 API client (`apps/web/src/lib/http.ts`)
- `axios.create({ baseURL: '/api/v1', withCredentials: true })`.
- Types: `ApiError { status: number; code: string; message: string }`,
  `LoginResponse { accessToken; expiresIn; user }`,
  `InvitationPreview { status; invitation }` (spec §3/§5 payloads).
- Request interceptor: attach `Authorization: Bearer` from
  `authStore.getState().accessToken` when present.
- Response interceptor (spec §6):
  - Success pass-through; errors normalized to `ApiError`
    (`error.response.data?.error ?? data?.message ?? fallback`).
  - 401 + not already retried + not the refresh call: acquire shared
    refresh-promise (`POST /auth/refresh`), on success set new token in
    store and replay original request (`error.config.headers.Authorization`);
    on failure `clear()` auth + redirect per §3 rules
    (protected context → `/session-expired`, else `/unauthorized`).
  - Concurrent 401s await the same in-flight refresh promise.
  - 403 → `clear()` optional, redirect `/forbidden`.
  - Exclude `/auth/login` from redirect-on-401 (login failure must render
    inline, not navigate) — login 401 just rejects to the form.
- Export `api.get/post` helpers typed like the current `lib/api.ts`
  (replace that file).

**Unit tests:** `ApiError` normalization; refresh-replay logic (mock axios
adapter or interceptors); login-401 exclusion.

### 2.2 Auth store (`apps/web/src/stores/auth.ts`)
- Extend to spec §6: `{ user: PublicUser | null;
  status: 'unknown' | 'anonymous' | 'authenticated';
  accessToken: string | null; setSession(user, token); clear() }`.
- Token **not** persisted (no localStorage).
- `AuthProvider` (`apps/web/src/providers/AuthProvider.tsx`): on mount
  `POST /auth/refresh` → `setSession` on success, `clear()` on failure, then
  set `status`; expose `useAuth()` hook.

**Check:** unit test — initial `unknown` → refresh success/failure transitions.

### 2.3 Route wiring (`App.tsx`, `main.tsx`)
- Wrap app with `AuthProvider`.
- Routes per spec §3 (all 16 paths incl. stub `/dashboard`).
- `RequireAuth` component: `unknown` → spinner; `anonymous` →
  `<Navigate to="/unauthorized" state={{ from }} replace />`;
  `authenticated` → children.
- Stub page (`pages/DashboardStub.tsx`): "Signed in as {firstName
  lastName}" + Sign Out button calling `POST /auth/logout` + `clear()` +
  navigate `/login`.
- Keep existing `Home.tsx` → redirect `/` to `/dashboard` (guard handles
  the rest).

**Check:** manually — visiting `/dashboard` while logged out lands on
`/unauthorized`; after login (once Phase 3 exists) returns to `next`.

### Phase 2 checkpoint
`pnpm typecheck && pnpm lint && pnpm build && pnpm test` clean.

---

## Phase 3 — Shared UI components

### 3.1 `BrandMark`
Inline SVG book glyph in green rounded square + "ThesisTrack" wordmark
(match mockup proportions).

### 3.2 `AuthLayout`
- Top bar: `BrandMark`, bottom border.
- Body: two columns (md+), stacked on mobile: left = image card
  (`images/library.svg`→jpg with gradient fallback via CSS background),
  serif `Simplify Your Research Journey` headline + subcopy; right =
  `children` centered, max-w.
- Footer: `© 2026 ThesisTrack. All rights reserved.` + Contact IT Help /
  Privacy Policy / Terms of Service (lucide icons), matches mockups.
- Props: `illustration?: boolean` (the password-updated mockup hides the
  image card — support `variant: 'plain'` left column).

### 3.3 `StatusLayout`
Image-hero variant: hero image (optional `badge: 'success' | 'danger'`
overlay circle), serif heading, optional subcopy, `children` (callout +
actions), shares top bar/footer with `AuthLayout` — implement as a variant
of `AuthLayout` or sibling sharing `AuthHeader`/`AuthFooter` subcomponents.

### 3.4 `PasswordField`
shadcn `Input` + left lock icon + eye/eye-off toggle button (`lucide`),
`type` switching, forwards `React.forwardRef` for react-hook-form.

### 3.5 `PasswordStrengthMeter`
- `variant: 'reset' | 'activate'` rule sets (spec §4).
- Rules evaluated by pure function `evaluatePasswordRules(password,
  variant): { label; passed }[]` + derived score → label
  (`Not set | Weak | Fair | Strong`) for the `Badge` and `Progress` value.
- Renders: header row (shield icon, "Password Strength", status Badge),
  Progress bar, 2-column checklist with check/x icons.

**Unit tests:** rule sets (both variants), score thresholds, empty password →
`Not set`.

### 3.6 `Callout`
`variant: 'info' | 'danger' | 'neutral'`; icon + uppercase title + body;
tailwind classes matching mockup tints (green/red/gray).

### 3.7 `FormMessage`
Alert wrapper for mutation errors (`role="alert"`).

### Phase 3 checkpoint
`pnpm typecheck && pnpm lint && pnpm build && pnpm test` clean. Visual spot
check: render a kitchen-sink page temporarily (or Storybook-free harness)
confirming components match mockups, then remove.

---

## Phase 4 — Screens (ordered by flow)

Each screen task: page component in `apps/web/src/pages/`, route wired,
responsive check, form via react-hook-form + zod.

### 4.1 Login (`pages/Login.tsx`) → `/login`
- `AuthLayout`, card with "Sign In", subcopy, `Callout info` ("IMPORTANT
  NOTE…"), email `Input` (mail icon, `e.g. j.doe@university.edu`),
  `PasswordField` + "FORGOT PASSWORD?" link, primary `Sign in` button,
  divider + "New student or faculty member? **Activate your invitation**"
  (links `/invite` — note: requires token; link text per mockup, route
  without token bounces to `/login` per spec, so instead link to
  `/forgot-password`? **No** — keep mockup copy; `/invite` without token
  redirects as specced), footer note "Authorized Academic Personnel Only".
- On submit: `POST /auth/login` → `setSession(user, accessToken)` →
  navigate `next ?? '/dashboard'`.
- 401 → inline `Callout danger` "AUTHENTICATION FAILED…" (this is the
  `login-error` mockup state — same page, error branch), values preserved.
- Account-not-active code → same callout with that message.
- Unit/component test: success navigates; 401 renders danger callout;
  submit disabled while pending.

### 4.2 Forgot password (`pages/ForgotPassword.tsx`) → `/forgot-password`
- Form: institutional email, `Send reset link`, secondary `Back to sign in`,
  divider + departmental IT note.
- Submit → `POST /auth/forgot-password` → navigate
  `/forgot-password/sent`.

### 4.3 Email sent (`pages/PasswordResetEmailSent.tsx`) → `/forgot-password/sent`
- `StatusLayout` with envelope image, "Check your email", `Callout neutral`
  NEXT STEPS box, `Resend email` (re-calls forgot-password with stored email
  from navigation state — if state missing, email field hidden fallback:
  button links back to `/forgot-password`), `Back to sign in`.

### 4.4 Reset password (`pages/ResetPassword.tsx`) → `/reset-password?token=…`
- Reads `token` query param; missing → `/forgot-password`.
- `Create a new password` serif heading, `PasswordField` +
  `PasswordStrengthMeter variant="reset"`, confirm `PasswordField` +
  "Passwords must match" hint, neutral info callout, `Reset password`
  button **disabled** until: all rules pass + match (per mockup disabled
  state) — enable react-hook-form `isValid`.
- Submit → `POST /auth/reset-password { token, password }` →
  `/reset-password/success`.
- Invalid/expired token (422 from API) → `FormMessage` with link to
  `/forgot-password`.

### 4.5 Reset success (`pages/PasswordResetSuccess.tsx`) → `/reset-password/success`
- `StatusLayout` (no left illustration per mockup — `variant='plain'`),
  graduation image + success badge, "Password updated", primary `Sign in →`,
  `SECURITY PROTOCOL` callout.
- Static/route-state screen.

### 4.6 Invite welcome (`pages/InviteWelcome.tsx`) → `/invite?token=…`
- `useQuery(['invitation', token], …)` → `GET /auth/invitation/:token`.
- `invalid` → `<Navigate to="/invite/invalid" replace>`;
  `already_activated` → `/invite/already-activated`;
  loading → spinner; no token → `/login`.
- Valid: red graduation image, "Welcome to ThesisTrack", `Callout info`
  "institutional access granted", `CONTINUE TO ACCOUNT →` →
  `/invite/confirm?token=…`, terms microcopy.

### 4.7 Confirm identity (`pages/InviteConfirm.tsx`) → `/invite/confirm?token=…`
- Same query + redirects as 4.6 (share a `useInvitation(token)` hook in
  `lib/invitations.ts`).
- Hero illustration, "Confirm your identity", verified card (badge
  `IDENTITY VERIFIED`, name from payload, "Institutional credentials found
  in the University Registry."), detail rows: REGISTRATION NUMBER
  (`invitation.registrationNumber ?? 'Not on file — contact your
  department'`), ACADEMIC EMAIL, ACCOUNT ROLE; discrepancy warning callout;
  `Confirm & Continue →` → `/invite/activate?token=…`; `Contact Department`;
  footer badge "Institutional Security Protocol Active".

### 4.8 Set credentials (`pages/InviteActivate.tsx`) → `/invite/activate?token=…`
- Same invitation hook/redirects.
- `ACCOUNT SECURITY` badge, "Set your security credentials", create +
  confirm `PasswordField`s, `PasswordStrengthMeter variant="activate"`
  (incl. "Passwords match exactly" rule), `ACADEMIC POLICY` callout,
  `Activate account →` disabled until valid (mockup shows disabled state),
  ISO/GDPR microcopy.
- Submit → `POST /auth/activate { token, password }` →
  `/invite/activate/success`.

### 4.9 Activation success (`pages/InviteSuccess.tsx`) → `/invite/activate/success`
- Graduation photo + success badge, "Your account is ready",
  INSTITUTIONAL ACCESS / NEXT STEPS rows, `CONTINUE TO DASHBOARD →` →
  `/login` (account is active but not yet signed in; if a session exists
  from activation, prefer `/dashboard` — implementation: attempt
  `POST /auth/refresh`; success → `/dashboard`, else `/login`),
  "Contact Department Coordinator" link.

### 4.10 Already activated (`pages/InviteAlreadyActivated.tsx`) → `/invite/already-activated`
- StatusLayout, image + check badge, "Account already activated",
  `Callout info` ACCESS IS ACTIVE box + nested forgot-password hint,
  `Sign in to your account →` → `/login`, `Contact departmental IT help`.

### 4.11 Invalid invitation (`pages/InviteInvalid.tsx`) → `/invite/invalid`
- StatusLayout, danger-tinted image + eye-off badge, "Invitation link
  unavailable", `Why did this happen?` card + security policy nested box,
  `RETURN TO SIGN IN` (primary) → `/login`, `Request a new link` (secondary)
  → `/forgot-password`, coordinator note.

### 4.12 Session expired (`pages/SessionExpired.tsx`) → `/session-expired`
- StatusLayout, hero image, "Your session has expired",
  `SECURITY PROTOCOL` callout, `SIGN IN TO CONTINUE` → `/login`,
  "Contact IT Support" link.

### 4.13 Unauthorized (`pages/Unauthorized.tsx`) → `/unauthorized`
- StatusLayout, image + `ACCESS RESTRICTED` danger badge, "Sign in
  required", `PROTECTED ACADEMIC DATA` callout, `Sign in to ThesisTrack →`
  → `/login?next={from}` , `Contact Department Support` secondary,
  "Verified Institutional Access Gateway" footnote.

### 4.14 Forbidden (`pages/Forbidden.tsx`) → `/forbidden`
- Two-panel layout per mockup: left = abstract green gradient panel +
  `Restricted Area` serif heading + copy; right = `SECURITY PROTOCOL 403`
  red label, "Access restricted", `REASON FOR RESTRICTION` card + nested
  error note, `GO TO DASHBOARD` + `RETURN TO SAFETY` buttons,
  Compliance ID footnote.
- Implement as own layout (not `AuthLayout`) but reuse `AuthHeader`/
  `AuthFooter`.

### Phase 4 checkpoint
`pnpm typecheck && pnpm lint && pnpm build && pnpm test` clean.

---

## Phase 5 — End-to-end verification (spec §7)

1. `pnpm dev` (API :5000 + web :5173), dev DB migrated + seeded.
2. Walk each flow in the browser:
   - login success → stub → sign out; login failure → inline alert;
     inactive account message.
   - forgot → sent (resend) → reset via devToken link → success → login
     with new password (old password rejected).
   - invitation: provision an INVITED user (seed/provision path) →
     welcome → confirm → activate (all 5 rules) → success → login;
     reuse the same link → `already-activated`;
     garbage token → `invalid`; expired token (manipulate DB) → `invalid`.
   - direct hits: `/session-expired`, `/unauthorized`, `/forbidden` render;
     `/dashboard` logged-out redirects to `/unauthorized`;
     refresh cookie cleared → next API call lands on `/session-expired`.
3. Responsive pass at 375px / 768px / 1280px on all 15 screens.
4. `pnpm build` for production; `pnpm test` green.

**Fix-forward:** any failure returns to the owning phase's task.

---

## Phase 6 — Commit

- Logical commits per phase (`feat(web): tailwind v4 + shadcn setup`,
  `feat(api): invitation preview endpoint`, `feat(web): auth core`,
  `feat(web): shared auth UI`, `feat(web): auth screens`).
- No unrelated refactoring; README note only if setup steps change
  (Tailwind v4 removes postcss config — add a line to README if it
  documents it).

---

## Notes / risks

- **Refresh race:** two parallel 401s must share one refresh call — covered
  by shared promise in 2.1; test it.
- **Login 401 must not trigger the global redirect** (would bounce users off
  the login page) — explicit exclusion in 2.1 + test.
- **Mockup inconsistencies** (two login variants, footer link differences)
  normalized per spec: single login page with error branch; standard footer.
- **shadcn init may reformat `index.css`** — re-apply `@theme` brand tokens
  after init (0.2 before 0.1's token block order matters: do tokens last).
- **Drizzle migration** must be generated once (1.1) — no other schema
  changes in this plan.
