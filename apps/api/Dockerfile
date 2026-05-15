# 改用 Amazon ECR 的 docker hub 鏡像（無匿名 pull 速率限制），避開 GH Actions 共用 IP
# 一直撞 docker.io 429 toomanyrequests。內容與 docker.io/library/node:22-slim 同源。
FROM public.ecr.aws/docker/library/node:22-slim
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
WORKDIR /app

# Install dependencies (cached unless package files change)
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY packages/shared/ packages/shared/
COPY apps/api/ apps/api/
RUN pnpm build:shared \
    && cd apps/api && pnpm exec prisma generate \
    && cd ../.. && pnpm build:api

ENV NODE_ENV=production
EXPOSE 3000
WORKDIR /app/apps/api
CMD ["node", "dist/main.js"]
