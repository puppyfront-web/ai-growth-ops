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
COPY packages/providers/package.json packages/providers/
COPY packages/skills/package.json packages/skills/
COPY packages/connectors/package.json packages/connectors/
COPY apps/worker/package.json apps/worker/
RUN pnpm install --frozen-lockfile

# Build
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/worker/node_modules ./apps/worker/node_modules
COPY tsconfig.base.json tsup.config.ts ./
COPY packages/ ./packages/
RUN pnpm --filter @ai-growth-ops/database generate && \
    pnpm --filter @ai-growth-ops/shared build && \
    pnpm --filter @ai-growth-ops/shared-types build && \
    pnpm --filter @ai-growth-ops/observability build && \
    pnpm --filter @ai-growth-ops/providers build && \
    pnpm --filter @ai-growth-ops/skills build && \
    pnpm --filter @ai-growth-ops/connectors build && \
    pnpm --filter @ai-growth-ops/worker build

# Production
FROM base AS production
ENV NODE_ENV=production
COPY --from=build /app/apps/worker/dist ./apps/worker/dist
COPY --from=build /app/apps/worker/package.json ./apps/worker/
COPY --from=build /app/packages ./packages
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/worker/node_modules ./apps/worker/node_modules
COPY packages/database/prisma ./packages/database/prisma

CMD ["node", "apps/worker/dist/index.js"]
