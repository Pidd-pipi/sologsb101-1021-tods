# ---------- 构建阶段：node:20-alpine 安装依赖并执行 svelte-check + 生产构建 ----------
FROM node:20-alpine AS builder

WORKDIR /app

# 先只拷贝依赖清单，利用 Docker 层缓存
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi

# 拷贝源码与构建配置（node_modules / dist 由 .dockerignore 排除）
COPY . .

# npm run build = svelte-check --threshold error && vite build（零错误、类型检查通过）
RUN npm run build

# ---------- 运行阶段：nginx:alpine 托管静态产物 ----------
FROM nginx:alpine AS runner

# 自定义 nginx 配置：SPA fallback + gzip
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 覆盖默认站点产物（容器无状态，不挂载数据卷）
RUN rm -rf /usr/share/nginx/html/*
COPY --from=builder /app/dist /usr/share/nginx/html

# 权限归一化：COPY 会原样保留宿主文件权限位，若 public/favicon.svg 等源文件为 0600，
# nginx worker（uid=101 nginx）读不到会返回 403，必须显式放开读权限与目录遍历权限。
RUN chmod -R a+rX /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
