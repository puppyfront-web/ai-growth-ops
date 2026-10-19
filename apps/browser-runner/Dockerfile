# Playwright 官方镜像：浏览器与系统依赖预装（版本与 package.json 的 1.62.0 精确匹配），
# 无需 playwright install 层——该层曾在 CI 反复超时（run #16/#19/#20）。
# mcr.microsoft.com 在 GitHub runner 所在网络拉取很快。
FROM mcr.microsoft.com/playwright:v1.62.0-jammy AS build
# 国内网络无法直连 binaries.prisma.sh，统一走 npmmirror 的引擎镜像
ENV PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma
WORKDIR /app
RUN npm install --global pnpm@10.33.0 --registry=https://registry.npmmirror.com && \
    pnpm config set registry https://registry.npmmirror.com

# 只拷贝 workspace 清单（package.json/锁文件）：依赖层只随依赖变化，
# 业务源码变更不会打掉 pnpm install 层。
# 新增 workspace 包时必须在这里补一行，否则 install 会因 workspace 不完整而失败。
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY apps/browser-runner/package.json apps/browser-runner/
COPY packages/ai/package.json packages/ai/
COPY packages/ai-tools/package.json packages/ai-tools/
COPY packages/capability-schema/package.json packages/capability-schema/
COPY packages/connectors/package.json packages/connectors/
COPY packages/database/package.json packages/database/
COPY packages/email/package.json packages/email/
COPY packages/growth-ops-agent/package.json packages/growth-ops-agent/
COPY packages/lead-sinks/package.json packages/lead-sinks/
COPY packages/observability/package.json packages/observability/
COPY packages/providers/package.json packages/providers/
COPY packages/runtime/package.json packages/runtime/
COPY packages/runtime-mcp/package.json packages/runtime-mcp/
COPY packages/shared/package.json packages/shared/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/skills/package.json packages/skills/
RUN --mount=type=cache,id=pnpm-store-br,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# 源码与构建配置最后进入，变更只影响构建层
COPY tsconfig.base.json tsup.config.ts ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm --filter @ai-growth-ops/database db:generate && \
    pnpm --filter "@ai-growth-ops/browser-runner..." build

# 生产依赖：只装 dependencies + 定向移除 web 的运行时专属包
# （hoisted 模式下 pnpm --filter 对 install 不生效，故用显式清单）
FROM mcr.microsoft.com/playwright:v1.62.0-jammy AS prod-deps
ENV PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma
WORKDIR /app
RUN npm install --global pnpm@10.33.0 --registry=https://registry.npmmirror.com
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY apps/browser-runner/package.json apps/browser-runner/
COPY packages/ai/package.json packages/ai/
COPY packages/ai-tools/package.json packages/ai-tools/
COPY packages/capability-schema/package.json packages/capability-schema/
COPY packages/connectors/package.json packages/connectors/
COPY packages/database/package.json packages/database/
COPY packages/email/package.json packages/email/
COPY packages/growth-ops-agent/package.json packages/growth-ops-agent/
COPY packages/lead-sinks/package.json packages/lead-sinks/
COPY packages/observability/package.json packages/observability/
COPY packages/providers/package.json packages/providers/
COPY packages/runtime/package.json packages/runtime/
COPY packages/runtime-mcp/package.json packages/runtime-mcp/
COPY packages/shared/package.json packages/shared/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/skills/package.json packages/skills/
COPY packages/database/prisma packages/database/prisma/
RUN --mount=type=cache,id=pnpm-store-br-prod,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod && \
    rm -rf node_modules/next node_modules/@next \
           node_modules/lucide-react node_modules/@assistant-ui \
           node_modules/@playwright && \
    pnpm prisma generate --schema packages/database/prisma/schema.prisma

# Production：底座自带 /ms-playwright 浏览器，无需任何拷贝
FROM mcr.microsoft.com/playwright:v1.62.0-jammy AS production
ENV NODE_ENV=production
WORKDIR /app
# 以 root 运行（与 api/worker 一致；chromium 启动参数已含 --no-sandbox）。
# mcr 官方镜像没有 node 用户，USER node 会导致容器无法启动（run #25）。
COPY --from=prod-deps /app/package.json ./package.json
COPY --from=build /app/apps/browser-runner/dist ./apps/browser-runner/dist
COPY --from=build /app/apps/browser-runner/package.json ./apps/browser-runner/
COPY --from=build /app/packages ./packages
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/apps/browser-runner/node_modules ./apps/browser-runner/node_modules
COPY packages/database/prisma ./packages/database/prisma

EXPOSE 3200
CMD ["node", "apps/browser-runner/dist/index.js"]
