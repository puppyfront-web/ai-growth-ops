FROM node:22-bookworm AS build

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
# 国内网络无法直连 binaries.prisma.sh，统一走 npmmirror 的引擎镜像
ENV PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma
WORKDIR /app

RUN npm install --global pnpm@10.33.0 --registry=https://registry.npmmirror.com && \
    pnpm config set registry https://registry.npmmirror.com
RUN sed -i 's|http://deb.debian.org/debian|https://mirrors.aliyun.com/debian|g; s|http://deb.debian.org/debian-security|https://mirrors.aliyun.com/debian-security|g' \
    /etc/apt/sources.list.d/debian.sources

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
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# Playwright/Chromium（~200MB 下载 + apt 系统依赖）独立成层：
# 只要依赖不变，源码变更不再触发浏览器重装
RUN pnpm --filter @ai-growth-ops/browser-runner exec playwright install --with-deps chromium

# 源码与构建配置最后进入，变更只影响构建层
COPY tsconfig.base.json tsup.config.ts ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm --filter @ai-growth-ops/database db:generate && \
    pnpm --filter "@ai-growth-ops/browser-runner..." build

# 生产依赖：只装 dependencies（排除 typescript/tsup 等仅构建需要的包），
# 生产镜像的 node_modules 取自这一层
FROM node:22-bookworm AS prod-deps
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma
WORKDIR /app
RUN npm install --global pnpm@10.33.0 --registry=https://registry.npmmirror.com && \
    pnpm config set registry https://registry.npmmirror.com
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
RUN --mount=type=cache,id=pnpm-store-prod,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod && \
    # hoisted 模式下 pnpm --filter 对 install 不生效，这里显式移除 web 的
    # 运行时专属包（browser-runner 自身的 playwright 系保留）。
    rm -rf node_modules/next node_modules/@next \
           node_modules/lucide-react node_modules/@assistant-ui \
           node_modules/@playwright && \
    pnpm prisma generate --schema packages/database/prisma/schema.prisma

# Production
FROM node:22-bookworm AS production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV NODE_ENV=production
WORKDIR /app
# 全部 COPY 直接带 --chown，避免额外的 chown 层复制整个 /app
COPY --from=prod-deps --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/apps/browser-runner/dist ./apps/browser-runner/dist
COPY --from=build --chown=node:node /app/apps/browser-runner/package.json ./apps/browser-runner/
COPY --from=build --chown=node:node /app/packages ./packages
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=prod-deps --chown=node:node /app/apps/browser-runner/node_modules ./apps/browser-runner/node_modules
COPY --chown=node:node packages/database/prisma ./packages/database/prisma
COPY --from=build --chown=node:node /ms-playwright /ms-playwright

USER node
EXPOSE 3200
CMD ["node", "apps/browser-runner/dist/index.js"]
