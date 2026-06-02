FROM mcr.microsoft.com/playwright:v1.44.0-jammy AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/browser-runner/package.json apps/browser-runner/
RUN pnpm install --frozen-lockfile

# Build
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/browser-runner/node_modules ./apps/browser-runner/node_modules
COPY tsconfig.base.json tsup.config.ts ./
COPY packages/shared/ ./packages/shared/
RUN pnpm --filter @ai-growth-ops/shared build && \
    pnpm --filter @ai-growth-ops/browser-runner build

# Production
FROM base AS production
ENV NODE_ENV=production
COPY --from=build /app/apps/browser-runner/dist ./apps/browser-runner/dist
COPY --from=build /app/apps/browser-runner/package.json ./apps/browser-runner/
COPY --from=build /app/packages ./packages
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/browser-runner/node_modules ./apps/browser-runner/node_modules

EXPOSE 3200
CMD ["node", "apps/browser-runner/dist/index.js"]
