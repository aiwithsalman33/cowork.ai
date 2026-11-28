# CoWork AI — single production image (API + web in one container).
# Normally built by GitHub Actions (.github/workflows/ci.yml, job "image") and pulled by the VPS.
# Strictly sequential (one npm install, no parallel stages) so it can also build on 1 vCPU.
FROM node:24-alpine AS build
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app
ENV CI=true NPM_CONFIG_UPDATE_NOTIFIER=false NPM_CONFIG_FUND=false NPM_CONFIG_AUDIT=false \
    NEXT_TELEMETRY_DISABLED=1 PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --include-workspace-root --no-audit --no-fund
COPY packages/shared packages/shared
COPY apps/api apps/api
COPY apps/web apps/web
# browser error tracking is baked in at build time (CI build-arg; empty = off)
ARG NEXT_PUBLIC_SENTRY_DSN=
ENV NEXT_PUBLIC_SENTRY_DSN=${NEXT_PUBLIC_SENTRY_DSN}
ENV NODE_OPTIONS=--max-old-space-size=1024 LOW_MEMORY_BUILD=1 API_INTERNAL_URL=http://127.0.0.1:4000
RUN npm run build -w @cowork/shared \
 && cd apps/api && npx prisma generate && npm run build \
 && cd /app && npm run build -w @cowork/web \
 && npm prune --omit=dev --no-audit --no-fund \
 && rm -rf apps/web/.next/cache /root/.npm

# ---------- runtime (only copies files: no install, no parallel work) ----------
FROM node:24-alpine AS runtime
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app
# git sha of this build (CI build-arg): shown on /health and used as the Sentry release
ARG SENTRY_RELEASE=dev
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 APP_RELEASE=${SENTRY_RELEASE}
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared/package.json packages/shared/
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/api/package.json apps/api/
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/prisma apps/api/prisma
COPY --from=build /app/apps/web/.next/standalone /app/web
COPY --from=build /app/apps/web/.next/static /app/web/apps/web/.next/static
COPY --from=build /app/apps/web/public /app/web/apps/web/public
COPY docker/start.mjs /app/start.mjs
RUN mkdir -p /data/wa-sessions && chown -R node:node /data /app/apps/api /app/node_modules/.prisma
USER node
EXPOSE 3000 4000
HEALTHCHECK --interval=20s --timeout=8s --start-period=180s --retries=6 \
  CMD node -e "Promise.all(['http://127.0.0.1:4000/health/ready','http://127.0.0.1:3000/api/health'].map(u=>fetch(u).then(r=>{if(!r.ok)throw 0}))).then(()=>process.exit(0)).catch(()=>process.exit(1))"
CMD ["node", "/app/start.mjs"]
