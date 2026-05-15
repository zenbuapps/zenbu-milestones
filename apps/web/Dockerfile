# 改用 Amazon ECR 的 docker hub 鏡像（無匿名 pull 速率限制），避開 GH Actions
# 共用 IP 一直撞 docker.io 429 toomanyrequests。內容與 docker.io 同源。
FROM public.ecr.aws/docker/library/node:22-slim AS build
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

COPY packages/shared/ packages/shared/
COPY apps/web/ apps/web/

ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN pnpm build:shared && pnpm build:web

FROM public.ecr.aws/docker/library/nginx:alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
