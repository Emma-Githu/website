"""
OpenAI 兼容 API 服务商实现
适用于所有提供 /v1/chat/completions 接口的服务：
OpenAI 官方、DeepSeek、Moonshot（Kimi）、通义千问、Azure OpenAI 等。
切换服务商只需修改 .env 中的 AI_BASE_URL / AI_MODEL / AI_API_KEY。
"""
import httpx

from config import settings
from .base import AIProvider


class OpenAICompatibleProvider(AIProvider):
    """通过 OpenAI 兼容接口调用 AI 服务"""

    def __init__(self):
        self._base_url = settings.AI_BASE_URL.rstrip('/')
        self._model = settings.AI_MODEL
        self._api_key = settings.AI_API_KEY
        self._timeout = settings.AI_TIMEOUT

    def provider_name(self) -> str:
        return 'openai_compatible'

    def model_name(self) -> str:
        return self._model

    async def chat(self, system_prompt: str, user_prompt: str) -> str:
        url = f'{self._base_url}/chat/completions'
        headers = {
            'Authorization': f'Bearer {self._api_key}',
            'Content-Type': 'application/json',
        }
        payload = {
            'model': self._model,
            'messages': [
                {'role': 'system', 'content': system_prompt},
                {'role': 'user', 'content': user_prompt},
            ],
            'max_tokens': settings.AI_MAX_TOKENS,
            'temperature': settings.AI_TEMPERATURE,
        }
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            resp = await client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()
            # 标准 OpenAI 响应结构
            return data['choices'][0]['message']['content']