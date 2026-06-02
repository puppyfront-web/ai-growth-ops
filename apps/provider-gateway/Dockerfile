FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/providers/package.json packages/providers/
COPY apps/provider-gateway/package.json apps/provider-gateway/
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/provider-gateway/node_modules ./apps/provider-gateway/node_modules
COPY tsconfig.base.json tsup.config.ts ./
COPY packages/providers/ ./packages/providers/
RUN pnpm --filter @ai-growth-ops/providers build && \
    pnpm --filter @ai-growth-ops/provider-gateway build

FROM base AS production
ENV NODE_ENV=production
COPY --from=build /app/apps/provider-gateway/dist ./apps/provider-gateway/dist
COPY --from=build /app/apps/provider-gateway/package.json ./apps/provider-gateway/
COPY --from=build /app/packages ./packages
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/provider-gateway/node_modules ./apps/provider-gateway/node_modules

EXPOSE 3300
CMD ["node", "apps/provider-gateway/dist/index.js"]
