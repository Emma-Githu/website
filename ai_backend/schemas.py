"""
海贸智联 AI 后端 - 请求/响应数据模型（Pydantic）
统一 /api/chat 的入参出参结构，业务模块无需关心底层模型差异。
"""
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field


# ===== 允许的业务动作白名单 =====
ALLOWED_ACTIONS = {
    'generate',       # 生成商务邮件
    'polish',         # 邮件润色
    'rewrite',        # 邮件改写
    'translate_en',   # 中译英
    'translate_zh',   # 英译中
    'chat',           # 通用对话（P2 AI智能工作台）
}

# ===== 允许的业务模块白名单 =====
ALLOWED_MODULES = {
    'email',      # P3 邮件与询盘助手
    'workspace',  # P2 AI智能工作台
}

# ===== 模块与动作对应关系（模块仅允许调用其声明的动作） =====
MODULE_ACTION_MAP = {
    'email': {
        'generate',       # 生成商务邮件
        'polish',         # 邮件润色
        'rewrite',        # 邮件改写
        'translate_en',   # 中译英
        'translate_zh',   # 英译中
    },
    'workspace': {
        'chat',           # 通用对话
    },
}


class ChatRequest(BaseModel):
    """POST /api/chat 请求体"""
    action: str = Field(..., description="业务动作：generate/polish/rewrite/translate_en/translate_zh/chat")
    module: str = Field(default='email', description="业务模块，当前支持 email / workspace")
    data: Dict[str, Any] = Field(default_factory=dict, description="业务数据（询盘内容、邮件类型、语气、对话历史等）")


class ChatResponse(BaseModel):
    """POST /api/chat 响应体"""
    ok: bool
    action: Optional[str] = None
    module: Optional[str] = None
    subject: Optional[str] = None
    body: Optional[str] = None
    error: Optional[str] = None
    error_code: Optional[str] = None


class HealthResponse(BaseModel):
    """GET /api/health 响应体"""
    status: str
    ai_configured: bool
    provider: str
    model: str