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
- `pnpm build` - Build all packages
- `pnpm lint` - Lint all packages
- `pnpm db:push` - Push schema to database
- `pnpm db:studio` - Open Drizzle Studio
# ThesisTrack-
