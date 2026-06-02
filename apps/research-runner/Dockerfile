FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/database/package.json packages/database/
COPY packages/shared/package.json packages/shared/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/skills/package.json packages/skills/
COPY apps/research-runner/package.json apps/research-runner/
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/research-runner/node_modules ./apps/research-runner/node_modules
COPY tsconfig.base.json tsup.config.ts ./
COPY packages/ ./packages/
RUN pnpm --filter @ai-growth-ops/database generate && \
    pnpm --filter @ai-growth-ops/shared build && \
    pnpm --filter @ai-growth-ops/shared-types build && \
    pnpm --filter @ai-growth-ops/skills build && \
    pnpm --filter @ai-growth-ops/research-runner build

FROM base AS production
ENV NODE_ENV=production
COPY --from=build /app/apps/research-runner/dist ./apps/research-runner/dist
COPY --from=build /app/apps/research-runner/package.json ./apps/research-runner/
COPY --from=build /app/packages ./packages
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/research-runner/node_modules ./apps/research-runner/node_modules
COPY packages/database/prisma ./packages/database/prisma

EXPOSE 3400
CMD ["node", "apps/research-runner/dist/index.js"]
