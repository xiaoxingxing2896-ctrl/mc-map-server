#!/usr/bin/env bash
# 一次性初始化 Cloudflare 资源（Linux/macOS 版）
# 前置：已安装 wrangler 并 wrangler login
# 用法：bash scripts/cf-init.sh
set -e
cd "$(dirname "$0")/../worker"

echo "==> 1/5 创建 D1 数据库"
OUT=$(wrangler d1 create mc-map-db 2>&1 || true)
echo "$OUT"
ID=$(echo "$OUT" | grep -o 'database_id = "[^"]*"' | head -1 | cut -d'"' -f2 || true)
if [ -n "$ID" ]; then
  sed -i "s/REPLACE_WITH_D1_DATABASE_ID/$ID/" wrangler.toml
  echo "database_id 已写入 wrangler.toml: $ID"
else
  echo "D1 已存在或创建失败，请手动把 database_id 填入 worker/wrangler.toml"
fi

echo "==> 2/5 建表（幂等）"
wrangler d1 execute mc-map-db --remote --file=schema.sql

echo "==> 3/5 导入现有数据（如存在 mcmap.db）"
if [ -f ../mcmap.db ]; then
  node ../scripts/export-d1-sql.js > /tmp/migrate.sql
  wrangler d1 execute mc-map-db --remote --file=/tmp/migrate.sql
  echo "数据已导入 D1"
else
  echo "未找到 mcmap.db，跳过数据导入"
fi

echo "==> 4/5 创建 R2 桶（已存在则跳过）"
wrangler r2 bucket create mc-map-tiles 2>/dev/null || true
echo "R2 桶就绪"

echo "==> 5/5 设置 JWT_SECRET"
JWT="${JWT_SECRET:-$(openssl rand -base64 48)}"
echo "$JWT" | wrangler secret put JWT_SECRET --name mc-map-server

echo ""
echo "✅ 初始化完成！现在可以把代码推送到 GitHub，push 即自动部署。"
echo "建议把 JWT_SECRET 同时添加到 GitHub Secrets（JWT_SECRET）"