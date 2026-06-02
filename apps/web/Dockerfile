FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/database/package.json packages/database/
COPY packages/shared/package.json packages/shared/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/observability/package.json packages/observability/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

# Build
FROM base AS build
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY tsconfig.base.json ./
COPY packages/ ./packages/
COPY apps/web/ ./apps/web/
RUN pnpm --filter @ai-growth-ops/database generate && \
    pnpm --filter @ai-growth-ops/shared build && \
    pnpm --filter @ai-growth-ops/shared-types build && \
    pnpm --filter @ai-growth-ops/observability build && \
    pnpm --filter @ai-growth-ops/web build

# Production
FROM base AS production
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=build /app/apps/web/public ./apps/web/public
COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME="0.0.0.0"
CMD ["node", "apps/web/server.js"]
