"""
AI 服务层包初始化 + 服务商注册表

当前注册：OpenAI 兼容服务商（第一种接入方案）。
未来接入新服务商时：
  1. 在本目录新增 provider 实现文件（继承 base.AIProvider）
  2. 在下方 PROVIDER_REGISTRY 注册
  3. 通过 .env 的 AI_PROVIDER 环境变量切换
业务路由与前端代码无需任何改动。
"""
from config import settings
from .base import AIProvider
from .openai_compatible import OpenAICompatibleProvider
from .prompts import build_prompts, parse_ai_response
from .rate_limiter import rate_limiter

# ===== 服务商注册表 =====
PROVIDER_REGISTRY = {
    'openai_compatible': OpenAICompatibleProvider,
}


def get_provider() -> AIProvider:
    """
    获取当前 AI 服务商实例。
    从 settings.AI_PROVIDER 读取服务商标识，默认 openai_compatible；
    未来可通过 .env 的 AI_PROVIDER 切换，无需改动业务代码。
    """
    provider_key = settings.AI_PROVIDER
    cls = PROVIDER_REGISTRY.get(provider_key)
    if cls is None:
        available = '、'.join(PROVIDER_REGISTRY.keys())
        raise RuntimeError(
            f'未注册的 AI 服务商: "{provider_key}"。'
            f'当前已注册: {available}。'
            f'请检查 .env 中 AI_PROVIDER 配置。'
        )
    return cls()