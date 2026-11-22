# CoWork AI — single production image (API + web in one container).
# Built once with one `npm ci`, tuned to build and run on a 1 vCPU / ~2 GB VPS.
#   docker compose -f docker-compose.prod.yml up -d --build
FROM node:24-alpine AS base
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app
ENV CI=true NPM_CONFIG_UPDATE_NOTIFIER=false NPM_CONFIG_FUND=false NPM_CONFIG_AUDIT=false \
    NEXT_TELEMETRY_DISABLED=1

# ---------- build ----------
FROM base AS build
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,target=/root/.npm npm ci --include-workspace-root
COPY packages/shared packages/shared
COPY apps/api apps/api
COPY apps/web apps/web
# cap memory so the build fits a small VPS; single Next.js worker (see next.config.ts)
ENV NODE_OPTIONS=--max-old-space-size=1024 LOW_MEMORY_BUILD=1 API_INTERNAL_URL=http://127.0.0.1:4000
RUN npm run build -w @cowork/shared \
 && cd apps/api && npx prisma generate && npm run build \
 && cd /app && npm run build -w @cowork/web

# ---------- runtime ----------
FROM base AS runtime
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev -w @cowork/shared -w @cowork/api \
 && npm cache clean --force
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/api/dist apps/api/dist
COPY apps/api/prisma apps/api/prisma
# Next.js standalone server (has its own trimmed node_modules)
COPY --from=build /app/apps/web/.next/standalone /app/web
COPY --from=build /app/apps/web/.next/static /app/web/apps/web/.next/static
COPY --from=build /app/apps/web/public /app/web/apps/web/public
COPY docker/start.mjs /app/start.mjs
RUN cd apps/api && npx prisma generate \
 && mkdir -p /data/wa-sessions && chown -R node:node /data /app
USER node
EXPOSE 3000 4000
HEALTHCHECK --interval=20s --timeout=8s --start-period=180s --retries=6 \
  CMD node -e "Promise.all(['http://127.0.0.1:4000/health/ready','http://127.0.0.1:3000/api/health'].map(u=>fetch(u).then(r=>{if(!r.ok)throw 0}))).then(()=>process.exit(0)).catch(()=>process.exit(1))"
CMD ["node", "/app/start.mjs"]
