"""
统一 AI 对话路由
POST /api/chat - 业务模块统一 AI 调用入口

处理流程：配置检查 → 限流 → 动作/模块白名单 → 模块-动作对应校验 → 输入校验 → 构建提示词 → 调用 AI → 解析响应
安全：日志仅记录动作、模块、耗时、状态，不记录业务内容与密钥。
"""
import logging
import time

import httpx
from fastapi import APIRouter, Request

from config import settings
from schemas import ChatRequest, ChatResponse, ALLOWED_ACTIONS, ALLOWED_MODULES, MODULE_ACTION_MAP
from services import get_provider, build_prompts, parse_ai_response, rate_limiter

router = APIRouter(prefix='/api', tags=['chat'])
logger = logging.getLogger('haimao_ai.chat')


def _validate_input(action: str, data: dict):
    """
    业务输入校验，返回错误消息（None 表示通过）。
    generate 需要询盘或背景；polish/rewrite/translate 需要已有邮件内容。
    """
    def _non_empty(key):
        v = data.get(key, '')
        return bool(str(v).strip()) if v else False

    if action == 'generate':
        if not _non_empty('inquiry') and not _non_empty('context'):
            return '生成邮件需要提供客户原始询盘或客户背景信息'
    elif action == 'chat':
        if not _non_empty('message'):
            return '对话消息不能为空'
    else:
        if not _non_empty('subject') and not _non_empty('body'):
            return '邮件主题与正文均为空，请先输入内容'
    return None


@router.post('/chat', response_model=ChatResponse)
async def chat(req: ChatRequest, request: Request):
    start = time.time()

    # 1. AI 服务配置检查（未配置 Key 时明确提示，不伪造结果）
    if not settings.ai_configured:
        logger.info('action=%s module=%s status=not_configured', req.action, req.module)
        return ChatResponse(
            ok=False, action=req.action, module=req.module,
            error='尚未配置 AI 服务，请在后端 .env 中设置 AI_API_KEY',
            error_code='AI_NOT_CONFIGURED',
        )

    # 2. 基本限流（按客户端 IP 滑动窗口计数）
    client_ip = request.client.host if request.client else 'unknown'
    if not rate_limiter.check(client_ip):
        logger.info('action=%s module=%s ip=%s status=rate_limited', req.action, req.module, client_ip)
        return ChatResponse(
            ok=False, action=req.action, module=req.module,
            error='请求过于频繁，请稍后再试',
            error_code='RATE_LIMITED',
        )

    # 3. 动作白名单校验
    if req.action not in ALLOWED_ACTIONS:
        logger.info('action=%s module=%s status=invalid_action', req.action, req.module)
        return ChatResponse(
            ok=False, action=req.action, module=req.module,
            error='不支持的动作: %s' % req.action,
            error_code='INVALID_ACTION',
        )

    # 4. 模块白名单校验（当前开放 email / workspace）
    if req.module not in ALLOWED_MODULES:
        logger.info('action=%s module=%s status=invalid_module', req.action, req.module)
        return ChatResponse(
            ok=False, action=req.action, module=req.module,
            error='不支持的模块: %s' % req.module,
            error_code='INVALID_MODULE',
        )

    # 5. 模块与动作对应校验（workspace 仅允许 chat；email 仅允许五项邮件动作）
    allowed_actions = MODULE_ACTION_MAP.get(req.module, set())
    if req.action not in allowed_actions:
        logger.info('action=%s module=%s status=invalid_module_action', req.action, req.module)
        return ChatResponse(
            ok=False, action=req.action, module=req.module,
            error='模块「%s」不支持动作「%s」，该模块允许的动作: %s' % (
                req.module, req.action, '、'.join(sorted(allowed_actions))),
            error_code='INVALID_MODULE_ACTION',
        )

    # 6. 业务输入校验
    err = _validate_input(req.action, req.data)
    if err:
        logger.info('action=%s module=%s status=invalid_input', req.action, req.module)
        return ChatResponse(
            ok=False, action=req.action, module=req.module,
            error=err, error_code='INVALID_INPUT',
        )

    # 7. 构建提示词并调用 AI 服务商
    try:
        system_prompt, user_prompt = build_prompts(req.action, req.data)
        provider = get_provider()
        raw = await provider.chat(system_prompt, user_prompt)
    except httpx.TimeoutException:
        elapsed = round(time.time() - start, 2)
        logger.info('action=%s module=%s elapsed=%ss status=timeout', req.action, req.module, elapsed)
        return ChatResponse(
            ok=False, action=req.action, module=req.module,
            error='AI 服务响应超时，请稍后重试',
            error_code='AI_TIMEOUT',
        )
    except httpx.HTTPStatusError as e:
        elapsed = round(time.time() - start, 2)
        # 不向上暴露上游错误详情，仅记录状态码
        logger.info('action=%s module=%s elapsed=%ss status=upstream_error code=%s',
                     req.action, req.module, elapsed, e.response.status_code)
        return ChatResponse(
            ok=False, action=req.action, module=req.module,
            error='AI 服务返回错误，请检查配置或稍后重试',
            error_code='AI_UPSTREAM_ERROR',
        )
    except RuntimeError as e:
        # 服务商注册表错误（如 AI_PROVIDER 配置了未注册的商标识）
        elapsed = round(time.time() - start, 2)
        logger.info('action=%s module=%s elapsed=%ss status=provider_error', req.action, req.module, elapsed)
        return ChatResponse(
            ok=False, action=req.action, module=req.module,
            error=str(e),
            error_code='AI_PROVIDER_ERROR',
        )
    except Exception:
        elapsed = round(time.time() - start, 2)
        logger.exception('action=%s module=%s elapsed=%ss status=error', req.action, req.module, elapsed)
        return ChatResponse(
            ok=False, action=req.action, module=req.module,
            error='AI 调用失败，请稍后重试',
            error_code='AI_ERROR',
        )

    # 8. 解析模型响应（按模块区分：workspace 直接返回原文，email 解析主题+正文）
    if req.module == 'workspace':
        subject = None
        body = raw.strip() if raw else ''
    else:
        subject, body = parse_ai_response(raw)
    elapsed = round(time.time() - start, 2)
    logger.info('action=%s module=%s elapsed=%ss status=ok len=%d',
                 req.action, req.module, elapsed, len(raw))

    return ChatResponse(
        ok=True, action=req.action, module=req.module,
        subject=subject, body=body,
    )