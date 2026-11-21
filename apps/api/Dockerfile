# syntax=docker/dockerfile:1.7
FROM node:24-alpine AS base
RUN apk add --no-cache openssl libc6-compat && corepack enable
WORKDIR /app
ENV PNPM_HOME=/pnpm CI=true

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter @partner/api...
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @partner/shared build \
  && pnpm --filter @partner/api exec prisma generate \
  && pnpm --filter @partner/api build

FROM base AS runtime
ENV NODE_ENV=production
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --prod --filter @partner/api...
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/api/dist apps/api/dist
COPY apps/api/prisma apps/api/prisma
RUN pnpm --filter @partner/api exec prisma generate \
  && mkdir -p /data/wa-sessions && chown -R node:node /data /app/apps/api
USER node
WORKDIR /app/apps/api
EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && exec node dist/index.js"]
