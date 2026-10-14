FROM node:22-bookworm

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
    pnpm --filter "@ai-growth-ops/browser-runner..." build && \
    chown -R node:node /app /ms-playwright

ENV NODE_ENV=production
USER node
EXPOSE 3200
CMD ["node", "apps/browser-runner/dist/index.js"]
