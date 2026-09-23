FROM node:22-alpine AS base
RUN apk add --no-cache openssl
# 国内网络无法直连 binaries.prisma.sh，统一走 npmmirror 的引擎镜像
ENV PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma
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
ARG API_BASE_URL=http://api:3100
ENV API_BASE_URL=$API_BASE_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN mkdir -p apps/web/public
RUN pnpm --filter @ai-growth-ops/database db:generate && \
    pnpm --filter "@ai-growth-ops/web..." build

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
