"""
海贸智联 AI 后端 - 配置模块
所有敏感配置通过环境变量读取，严禁硬编码密钥。
"""
import os

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    # python-dotenv 未安装时仍可运行（依赖系统环境变量）
    pass


def _split_origins(raw: str):
    """将逗号分隔的来源字符串转为列表，去除空白。"""
    return [o.strip() for o in raw.split(',') if o.strip()]


class Settings:
    """全局配置（从环境变量 / .env 文件读取）"""

    # ===== AI 服务商配置 =====
    # 服务商标识：openai_compatible（未来可扩展 anthropic、自建模型等）
    AI_PROVIDER: str = os.getenv('AI_PROVIDER', 'openai_compatible')
    AI_API_KEY: str = os.getenv('AI_API_KEY', '')
    AI_BASE_URL: str = os.getenv('AI_BASE_URL', 'https://api.openai.com/v1')
    AI_MODEL: str = os.getenv('AI_MODEL', 'gpt-4o-mini')

    # ===== 调用参数 =====
    AI_TIMEOUT: int = int(os.getenv('AI_TIMEOUT', '60'))          # 上游请求超时（秒）
    AI_MAX_TOKENS: int = int(os.getenv('AI_MAX_TOKENS', '2000'))  # 最大生成 token 数
    AI_TEMPERATURE: float = float(os.getenv('AI_TEMPERATURE', '0.7'))

    # ===== 跨域配置（仅允许可信前端来源） =====
    CORS_ORIGINS: list = _split_origins(
        os.getenv('CORS_ORIGINS', 'http://localhost:5500,http://127.0.0.1:5500')
    )

    # ===== 基本限流 =====
    RATE_LIMIT_MAX: int = int(os.getenv('RATE_LIMIT_MAX', '20'))      # 窗口内最大请求数
    RATE_LIMIT_WINDOW: int = int(os.getenv('RATE_LIMIT_WINDOW', '60'))  # 窗口时长（秒）

    @property
    def ai_configured(self) -> bool:
        """AI 服务是否已配置（以 API Key 是否存在为准）"""
        return bool(self.AI_API_KEY and self.AI_API_KEY.strip())


settings = Settings()