# ThesisTrack

Thesis management platform built with React, Node.js, and PostgreSQL.

## Tech Stack

- **Frontend:** React, TypeScript, Vite, Tailwind CSS, TanStack Query, Zustand
- **Backend:** Node.js, Express, TypeScript, Zod, Drizzle ORM
- **Database:** PostgreSQL
- **Monorepo:** pnpm workspaces

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- PostgreSQL

### Setup

```bash
# Install dependencies
pnpm install

# Set up environment
cp apps/api/.env.example apps/api/.env

# Start development servers
pnpm dev
```

### Available Scripts

- `pnpm dev` - Start API and web servers concurrently
- `pnpm dev:api` - Start API server only
- `pnpm dev:web` - Start web server only
- `pnpm build` - Build all packages (shared, api, web)
- `pnpm lint` - Lint all packages
- `pnpm -r typecheck` - Type-check all packages
- `pnpm test` - API unit + integration tests (vitest) and UI tests (vitest)
- `pnpm db:generate` - Generate migrations from the Drizzle schema
- `pnpm db:migrate` - Apply generated migrations
- `pnpm db:push` - Push the schema straight to the database
- `pnpm db:drift` - Verify schema and migrations agree (exit 0 = clean)
- `pnpm db:studio` - Open Drizzle Studio
- `pnpm seed:admin` - Create/reuse the first administrator (in `apps/api`)
- `pnpm seed:workflows` - Seed the default workflows
- `pnpm seed:templates` - Seed default milestone templates

### Testing

- `pnpm test` runs the vitest suites (API unit + integration, UI).
- The five bash system suites live in `apps/api/tests/*.sh` and
  `apps/api/tests/system/workflow.sh`; they need a running dev server and a
  seeded admin:

  ```bash
  pnpm dev
  cd apps/api && pnpm seed:admin
  ADMIN_EMAIL=admin@… ADMIN_PASSWORD=… bash tests/auth-flow.sh   # etc.
  ```

- `pnpm --filter @thesistrack/api authz:selftest` checks the authorization
  matrix directly against the database.

## Deployment

See **`docs/deployment.md`** — single-host docker compose stack
(`docker compose up -d --build`), HTTPS via the optional caddy profile,
logging/monitoring, and the rehearsed backup-restore procedure (spec §18).
`apps/api/.env.example` documents every API environment variable.
