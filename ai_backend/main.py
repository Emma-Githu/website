"""
海贸智联 - 统一 AI 后端服务（FastAPI 入口）

职责：
  1. 提供统一 POST /api/chat 接口，供前端各业务模块调用 AI 能力
  2. 提供 GET /api/health 健康检查接口
  3. 通过 services 层抽象 AI 服务商，未来切换模型/服务商无需改动业务路由
安全：
  - 密钥仅从环境变量读取，不写入代码
  - 日志仅记录调用元数据（动作、模块、耗时、状态），不记录业务内容与密钥
  - CORS 仅允许可信前端来源
"""
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from routers import chat, health

# 日志配置：INFO 级别，仅输出调用元数据
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s [%(name)s] %(message)s',
)
logger = logging.getLogger('haimao_ai')
logger.info('AI 后端启动中… 已配置=%s 模型=%s', settings.ai_configured, settings.AI_MODEL)

app = FastAPI(
    title='海贸智联 AI 后端',
    description='统一 AI 接口服务 - 支持切换不同 AI 服务商与模型',
    version='1.0.0',
)

# CORS：仅允许配置中的可信前端来源（默认 localhost:5500）
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=['GET', 'POST'],
    allow_headers=['Content-Type'],
)

app.include_router(health.router)
app.include_router(chat.router)