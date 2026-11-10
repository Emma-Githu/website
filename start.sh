#!/bin/bash
# 海贸智联 - JoyCode 云端启动脚本
set -e
cd "$(dirname "$0")"

# 安装依赖（云端首次启动时 node_modules 不存在）
if [ ! -d "node_modules" ]; then
  echo "[start.sh] 安装依赖..."
  npm install --production --no-audit --no-fund
fi

# 启动服务
# --experimental-sqlite：node:sqlite 在 Node 22.x 需此标志（Node 24+ 兼容）
# 端口 8080 / 监听 0.0.0.0：JoyCode 云端仅暴露容器 8080 端口
echo "[start.sh] 启动海贸智联..."
exec node --experimental-sqlite backend/server.js