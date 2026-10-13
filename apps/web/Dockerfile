# syntax=docker/dockerfile:1
# ── ThesisTrack web image (spec §18.3, plan 15.2) ──────────────────────────
# Stage 1: vite production build. Stage 2: nginx serving dist/ with the SPA
# fallback (try_files → /index.html) and /api proxied to the api container —
# same-origin in production, so the HTTP-only refresh cookie just works.

FROM node:20-alpine AS base
ENV PNPM_HOME=/pnpm PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@12.5.1 --activate
WORKDIR /repo

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @thesistrack/web...

FROM deps AS build
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @thesistrack/shared build \
 && pnpm --filter @thesistrack/web build

FROM nginx:1.27-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
