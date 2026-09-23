FROM node:20-alpine AS base
RUN apk add --no-cache openssl
RUN npm install --global pnpm@10.33.0 --registry=https://registry.npmmirror.com && \
    pnpm config set registry https://registry.npmmirror.com
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY .npmrc ./
COPY tsconfig.base.json tsup.config.ts ./
COPY apps ./apps
COPY packages ./packages
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

FROM deps AS build
RUN pnpm --filter @ai-growth-ops/database db:generate && \
    pnpm --filter @ai-growth-ops/shared build && \
    pnpm --filter @ai-growth-ops/shared-types build && \
    pnpm --filter @ai-growth-ops/observability build && \
    pnpm --filter @ai-growth-ops/providers build && \
    pnpm --filter @ai-growth-ops/skills build && \
    pnpm --filter @ai-growth-ops/connectors build && \
    pnpm --filter @ai-growth-ops/email build && \
    pnpm --filter @ai-growth-ops/api build

# Production
FROM base AS production
ENV NODE_ENV=production
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/
COPY --from=build /app/packages ./packages
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY packages/database/prisma ./packages/database/prisma

EXPOSE 3100
CMD ["node", "apps/api/dist/index.js"]
