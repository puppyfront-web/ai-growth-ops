FROM node:22-bookworm

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
# 国内网络无法直连 binaries.prisma.sh，统一走 npmmirror 的引擎镜像
ENV PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma
WORKDIR /app

RUN npm install --global pnpm@10.33.0 --registry=https://registry.npmmirror.com && \
    pnpm config set registry https://registry.npmmirror.com
RUN sed -i 's|http://deb.debian.org/debian|https://mirrors.aliyun.com/debian|g; s|http://deb.debian.org/debian-security|https://mirrors.aliyun.com/debian-security|g' \
    /etc/apt/sources.list.d/debian.sources

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY .npmrc ./
COPY tsconfig.base.json tsup.config.ts ./
COPY apps ./apps
COPY packages ./packages

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile && \
    pnpm --filter @ai-growth-ops/database db:generate && \
    pnpm --filter "@ai-growth-ops/browser-runner..." build && \
    pnpm --filter @ai-growth-ops/browser-runner exec playwright install --with-deps chromium && \
    chown -R node:node /app /ms-playwright

ENV NODE_ENV=production
USER node
EXPOSE 3200
CMD ["node", "apps/browser-runner/dist/index.js"]
