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
# "...": 同时构建目标包的全部工作区依赖，避免运行时缺少子包 dist
RUN pnpm --filter @ai-growth-ops/database db:generate && \
    pnpm --filter "@ai-growth-ops/worker..." build

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
