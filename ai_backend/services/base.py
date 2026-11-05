"""
AI 服务商抽象基类
未来接入新服务商（如 Anthropic、自建模型等）时，只需实现本接口并注册到 registry，
业务路由与前端无需任何改动。
"""
from abc import ABC, abstractmethod


class AIProvider(ABC):
    """统一 AI 服务商接口"""

    @abstractmethod
    def provider_name(self) -> str:
        """返回服务商标识（用于 /api/health 展示）"""
        ...

    @abstractmethod
    def model_name(self) -> str:
        """返回当前使用的模型名称"""
        ...

    @abstractmethod
    async def chat(self, system_prompt: str, user_prompt: str) -> str:
        """
        发送对话请求，返回模型生成的纯文本。
        子类自行处理认证、超时与上游错误，异常向上抛出。
        """
        ...