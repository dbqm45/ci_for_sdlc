# syntax=docker/dockerfile:1
# One image for every environment: built once in CI, run locally with docker compose
# and later promoted unchanged. Secrets come from environment variables, never from the image.

ARG NODE_VERSION=22

# ---- build: the web UI (Vite) ----
FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
COPY packages/sandbox/package.json packages/sandbox/
COPY packages/mcp/package.json packages/mcp/
RUN npm ci --no-audit --no-fund
COPY tsconfig.base.json ./
COPY scripts scripts
COPY packages packages
RUN npm run build

# ---- runtime: server dependencies only ----
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4317 \
    CI_DATA_DIR=/data
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
COPY packages/sandbox/package.json packages/sandbox/
COPY packages/mcp/package.json packages/mcp/
RUN npm ci --omit=dev --no-audit --no-fund -w @ci/server -w @ci/core --include-workspace-root=false \
 && npm cache clean --force
COPY packages/core/src packages/core/src
COPY packages/server/src packages/server/src
COPY --from=build /app/packages/web/dist packages/web/dist
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 4317
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4317)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "--import", "tsx", "packages/server/src/index.ts"]
