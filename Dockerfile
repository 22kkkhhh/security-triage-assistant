# syntax=docker/dockerfile:1
# Security Triage Assistant — single-node production image (v1.12-M2)
# Reuses M1 `npm start` gate (env → filesystem → migrate → ready → next start).
# Image intentionally retains Prisma CLI / tsx tooling required by that gate.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
# postinstall runs `prisma generate` — schema/config must be present for npm ci.
COPY prisma ./prisma
COPY prisma.config.ts ./
# prisma.config.ts requires DATABASE_URL at generate time; build-only placeholder (not runtime).
ENV DATABASE_URL=file:./prisma/build-placeholder.db
RUN npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time dummy values for Next compile only — NOT production runtime secrets.
# These are overwritten/ignored at runtime; containers without real env fail closed via M1 gate.
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    BETTER_AUTH_SECRET=build-time-dummy-secret-not-for-runtime-use-32 \
    BETTER_AUTH_URL=http://127.0.0.1:3000 \
    DATABASE_URL=file:./prisma/build-placeholder.db

RUN npx prisma generate \
  && npm run build \
  && rm -f prisma/build-placeholder.db prisma/build-placeholder.db-*

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Clear any build-time dummy auth/db values from the final image environment.
ENV BETTER_AUTH_SECRET= \
    BETTER_AUTH_URL= \
    DATABASE_URL=

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 10001 sta \
  && useradd --system --uid 10001 --gid sta --home-dir /app --shell /usr/sbin/nologin sta \
  && mkdir -p /data /backup \
  && chown -R sta:sta /data /backup

# Full tree required by current npm start (tsx + Prisma migrate deploy).
COPY --from=builder --chown=sta:sta /app /app

USER sta
EXPOSE 3000
VOLUME ["/data", "/backup"]

# Prefer readiness (schema/DB) over liveness-only.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

# Single SoT: M1 production start gate (must not bypass to next start).
CMD ["npm", "start"]
