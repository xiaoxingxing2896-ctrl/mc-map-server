# mc-map-server 生产镜像（Cloudflare Tunnel 部署用）
# 说明：node:20-slim 为 Debian glibc，sqlite3 使用官方预编译二进制，无需编译工具链
FROM node:20-slim

ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/app/data/mcmap.db \
    TILES_DIR=/app/data/tiles

WORKDIR /app

# 先复制依赖清单，利用 Docker 层缓存
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# 再复制应用代码（node_modules 已由 .dockerignore 排除，镜像内重新安装 Linux 版依赖）
COPY . .

# 数据目录（SQLite + 瓦片），由 docker-compose 卷挂载实现持久化
RUN mkdir -p /app/data/tiles

EXPOSE 3000

# 非 root 运行（安全加固）
RUN useradd -m appuser && chown -R appuser:appuser /app
USER appuser

CMD ["node", "server.js"]