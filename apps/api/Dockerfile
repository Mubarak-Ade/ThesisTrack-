# syntax=docker/dockerfile:1
# ── ThesisTrack API image (spec §18.3, plan 15.2) ──────────────────────────
# Multi-stage: manifest-only workspace install (cached) → build shared + api
# → slim non-root runtime assembled by `pnpm deploy` (prod deps only, the
# @thesistrack/shared workspace dependency bundled in as plain JS).

FROM node:20-alpine AS base
ENV PNPM_HOME=/pnpm PATH=$PNPM_HOME:$PATH
# Pin to the version the project develops with (reproducible installs).
RUN corepack enable && corepack prepare pnpm@12.5.1 --activate
WORKDIR /repo

FROM base AS deps
# Manifests only — this layer stays cached until the lockfile changes.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @thesistrack/api...

FROM deps AS build
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @thesistrack/shared build \
 && pnpm --filter @thesistrack/api build \
 && pnpm --filter @thesistrack/api --prod deploy --legacy /out

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
# §14.7: uploads live on a named volume; compose mounts it at /app/uploads.
RUN mkdir -p uploads && chown node:node uploads
USER node
EXPOSE 3001
# §18.7 probe — the same endpoint the compose healthcheck polls.
HEALTHCHECK --interval=30s --timeout=3s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3001/api/v1/health || exit 1
# server.ts reads PORT/DATABASE_URL/etc. from the environment (config/env.ts);
# no .env file is baked into the image.
CMD ["node", "dist/src/server.js"]
