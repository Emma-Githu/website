"""
健康检查路由
GET /api/health - 返回后端与 AI 服务配置状态（不暴露密钥）
"""
import logging

from fastapi import APIRouter

from config import settings
from schemas import HealthResponse

router = APIRouter(prefix='/api', tags=['health'])
logger = logging.getLogger('haimao_ai.health')


@router.get('/health', response_model=HealthResponse)
async def health_check():
    """
    健康检查：报告后端存活状态与 AI 服务配置情况。
    注意：仅返回是否已配置，不返回密钥本身。
    """
    return HealthResponse(
        status='ok',
        ai_configured=settings.ai_configured,
        provider='openai_compatible',
        model=settings.AI_MODEL,
    )