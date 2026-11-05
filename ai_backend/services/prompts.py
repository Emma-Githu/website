"""
P3 邮件与询盘助手 + P2 AI智能工作台 - 提示词构建模块
根据业务动作（生成/润色/改写/翻译/通用对话）组装 system + user 提示词。

核心设计原则（真实性优先）：
1. 严禁编造价格、交期、付款方式等未经用户确认的商业信息。
2. 信息缺失时使用占位符或专业的不作承诺表达，绝不自行填写数字。
3. 邮件简洁专业，正文控制在 100-180 个英文单词左右。
4. 润色/改写/翻译不得擅自改变原文的金额、数量、日期、贸易条款或业务含义。
5. 通用对话（P2工作台）严格基于用户提供的上下文回答，不确定时明确说明。

输出格式约定：模型按固定标记返回主题与正文，便于解析：
  [主题] 邮件主题
  [正文] 邮件正文
"""
from typing import Dict, Any, Tuple

# ===== 邮件类型中文名映射 =====
TYPE_NAMES = {
    'inquiry-reply': '询盘回复',
    'quotation': '报价邮件',
    'order-followup': '订单跟进',
    'aftersales': '售后邮件',
}

# ===== 目标语言映射 =====
LANG_NAMES = {
    'zh': '中文', 'en': '英文', 'ja': '日语', 'ko': '韩语',
    'de': '德语', 'fr': '法语', 'es': '西班牙语', 'ru': '俄语', 'ar': '阿拉伯语',
}

# ===== 商务语气映射 =====
TONE_NAMES = {
    'formal': '正式专业',
    'friendly': '友好礼貌',
    'concise': '简洁直接',
}

SYSTEM_BASE = (
    '你是一名资深跨境 B2B 外贸商务邮件助手，精通国际贸易实务、'
    '产品报价、订单跟进、售后服务等场景的商务沟通。'
    '你撰写的邮件必须专业、得体、符合外贸商务惯例。\n\n'
    '【核心原则：真实性优先】\n'
    '你必须严格依据用户提供的客户询盘、客户背景和已确认信息生成邮件，'
    '严禁自行编造或承诺以下内容：\n'
    '1. 产品价格、币种、折扣、报价有效期。\n'
    '2. 库存数量、生产周期、交货日期。\n'
    '3. FOB、CIF、EXW 等贸易条款。\n'
    '4. 付款方式、账期、信用条件。\n'
    '5. 产品规格、认证、质量保证。\n'
    '6. 样品是否免费、样品费用及运费。\n'
    '7. 附件、产品目录、报价单已发送或已附上。\n'
    '8. 公司名称、联系人、联系电话、邮箱。\n'
    '9. 任何未经用户确认的商业承诺。\n\n'
    '【信息缺失时的处理】\n'
    '如果用户没有提供价格、交期或其他关键业务信息：\n'
    '- 不得自行填写任何具体数字。\n'
    '- 优先使用自然、专业、不作承诺的商务表达。'
    '例如客户询问价格但用户未提供报价时，可以写 '
    '"Thank you for your inquiry. We are reviewing the pricing and delivery schedule '
    'and will provide a quotation once the details are confirmed."\n'
    '- 如必须填写具体信息，使用明确的占位符，'
    '例如 [Price to be confirmed]、[Lead time to be confirmed]。\n'
    '- 不得将占位符解释为已确认的信息。\n'
    '- 不得声称已经附上用户未提供的文件。\n\n'
    '【邮件质量】\n'
    '1. 邮件必须专业、自然、礼貌，符合真实 B2B 外贸沟通习惯。\n'
    '2. 优先简洁，避免冗长套话和重复表达。\n'
    '3. 邮件正文结构清晰，正常情况下控制在 100-180 个英文单词左右'
    '（其他语言按同等信息量控制）；复杂业务可适当增加。\n'
    '4. 不使用虚构的姓名、公司或签名信息。\n'
    '5. 不确定的信息必须明确区分为待确认事项。'
)

# 润色/改写/翻译的保真约束：业务数据不可变，未提及信息不可添加
FIDELITY_RULE = (
    '\n\n【保真要求】\n'
    '你不得擅自改变原文的金额、数量、日期、贸易条款、付款方式或任何业务含义。'
    '原文中未提及的商业信息（如价格、交期、折扣、附件等）不得添加。'
    '原文中的待确认占位符（如 [Price to be confirmed]）必须原样保留，不得替换为具体数值。'
)

OUTPUT_FORMAT = (
    '\n\n输出要求：\n'
    '1. 必须严格按照以下格式输出，不要输出任何其他内容：\n'
    '[主题] 邮件主题（不含方括号标记本身）\n'
    '[正文] 邮件正文（可多段，不含方括号标记本身）\n'
    '2. 主题简洁明确，正文段落清晰，篇幅简洁（正文约 100-180 个英文单词，'
    '其他语言按同等信息量控制），避免冗长套话。'
)


def _safe_get(data: Dict[str, Any], key: str) -> str:
    """安全取值，统一转为非空字符串"""
    val = data.get(key, '')
    return str(val).strip() if val else ''


def build_prompts(action: str, data: Dict[str, Any]) -> Tuple[str, str]:
    """
    根据动作与业务数据构建 (system_prompt, user_prompt)。
    action: generate / polish / rewrite / translate_en / translate_zh
    data:   前端提交的业务字段
    """
    action = (action or '').strip()

    if action == 'generate':
        return _build_generate(data)
    if action == 'polish':
        return _build_polish(data)
    if action == 'rewrite':
        return _build_rewrite(data)
    if action == 'translate_en':
        return _build_translate(data, '英文')
    if action == 'translate_zh':
        return _build_translate(data, '中文')
    if action == 'chat':
        return _build_chat(data)

    raise ValueError(f'不支持的动作: {action}')


def _build_generate(data: Dict[str, Any]) -> Tuple[str, str]:
    """生成商务邮件"""
    inquiry = _safe_get(data, 'inquiry')
    email_type = TYPE_NAMES.get(_safe_get(data, 'type'), '询盘回复')
    lang = LANG_NAMES.get(_safe_get(data, 'lang'), '英文')
    tone = TONE_NAMES.get(_safe_get(data, 'tone'), '正式专业')
    context = _safe_get(data, 'context')

    system = (
        SYSTEM_BASE
        + f'\n\n当前任务：根据客户询盘撰写{email_type}，语气{tone}，使用{lang}撰写。'
        + OUTPUT_FORMAT
    )

    user = (
        f'请根据以下信息撰写一封{email_type}：\n\n'
        f'【邮件类型】{email_type}\n'
        f'【目标语言】{lang}\n'
        f'【商务语气】{tone}'
    )
    if inquiry:
        user += f'\n\n【客户原始询盘】\n{inquiry}'
    if context:
        user += f'\n\n【客户背景与历史沟通】\n{context}'
    user += (
        '\n\n请严格依据以上信息撰写一封完整的商务邮件，直接回应客户需求。'
        '以上信息中未提供的商业数据（价格、交期、付款方式、贸易条款、库存、'
        '样品费用、附件等）一律不得编造，按信息缺失规则处理。'
    )
    return system, user


def _build_polish(data: Dict[str, Any]) -> Tuple[str, str]:
    """邮件润色：在保留原意与业务数据的前提下优化表达"""
    subject = _safe_get(data, 'subject')
    body = _safe_get(data, 'body')
    tone = TONE_NAMES.get(_safe_get(data, 'tone'), '正式专业')
    lang = LANG_NAMES.get(_safe_get(data, 'lang'), '英文')

    system = (
        SYSTEM_BASE
        + f'\n\n当前任务：润色已有邮件，使其更加{tone}，保持{lang}。'
        '保留原文核心意思，优化措辞、语法与结构。'
        + FIDELITY_RULE
        + OUTPUT_FORMAT
    )

    user = (
        f'请润色以下邮件，使其更加{tone}：\n\n'
        f'【当前主题】\n{subject or "（无）"}\n\n'
        f'【当前正文】\n{body or "（无）"}'
    )
    return system, user


def _build_rewrite(data: Dict[str, Any]) -> Tuple[str, str]:
    """邮件改写：重新组织内容与结构，但业务数据不可变"""
    subject = _safe_get(data, 'subject')
    body = _safe_get(data, 'body')
    tone = TONE_NAMES.get(_safe_get(data, 'tone'), '正式专业')
    lang = LANG_NAMES.get(_safe_get(data, 'lang'), '英文')

    system = (
        SYSTEM_BASE
        + f'\n\n当前任务：改写已有邮件，以不同角度与结构重新表达，语气{tone}，使用{lang}。'
        + FIDELITY_RULE
        + OUTPUT_FORMAT
    )

    user = (
        f'请改写以下邮件，调整表达角度与结构，使其更具说服力：\n\n'
        f'【当前主题】\n{subject or "（无）"}\n\n'
        f'【当前正文】\n{body or "（无）"}'
    )
    return system, user


def _build_translate(data: Dict[str, Any], target_lang: str) -> Tuple[str, str]:
    """翻译邮件主题与正文（忠实原文，业务数据不可变）"""
    subject = _safe_get(data, 'subject')
    body = _safe_get(data, 'body')

    system = (
        '你是一名专业商务翻译，精通国际贸易领域的商务文书翻译。'
        f'当前任务：将邮件翻译为{target_lang}，保持商务语气与专业术语准确。'
        + FIDELITY_RULE
        + OUTPUT_FORMAT
    )

    user = (
        f'请将以下邮件翻译为{target_lang}：\n\n'
        f'【当前主题】\n{subject or "（无）"}\n\n'
        f'【当前正文】\n{body or "（无）"}'
    )
    return system, user


# ===== P2 AI智能工作台：通用对话 =====

WS_SYSTEM_BASE = (
    '你是「海贸智联 AI 外贸助手」，服务于跨境 B2B 外贸业务员与跟单员。'
    '你可以协助用户分析客户询盘、提供商务邮件撰写建议、解答外贸知识与贸易术语、'
    '梳理订单跟进流程、核对技术规格要点、生成跟单任务建议等。\n\n'
    '【核心原则：真实性优先】\n'
    '1. 严格基于用户提供的上下文回答问题，不确定的信息必须明确说明"该信息需要您确认"或"建议核实"。'
    '2. 严禁编造价格、交期、库存、付款方式、贸易条款、产品规格等未经用户确认的商业数据。'
    '3. 不编造法律法规、政策要求；涉及合规问题时建议用户咨询专业机构。'
    '4. 回答简洁实用，优先给出可操作的建议与步骤，避免冗长空泛的套话。'
    '5. 使用中文回答（除非用户明确要求其他语言）。'
    '6. 如果用户上传了文件但文件解析能力尚未接入，如实告知用户当前无法读取文件内容，'
    '请用户以文字形式提供关键信息，不假装已读取文件。\n\n'
    '【输出格式】\n'
    '必须严格按照以下格式输出，不要输出任何其他内容：\n'
    '[正文] 你的回复内容（可多段，不含方括号标记本身）'
)


def _build_chat(data: Dict[str, Any]) -> Tuple[str, str]:
    """
    P2 AI智能工作台通用对话。
    data 字段：
      message: str  - 当前用户消息（必填）
      history: list - 历史对话 [{role: 'user'|'assistant', content: str}]，可选
    """
    message = _safe_get(data, 'message')
    history = data.get('history', [])
    if not isinstance(history, list):
        history = []

    system = WS_SYSTEM_BASE

    user_parts = []
    # 拼入历史对话（最多取最近 10 轮，避免超出上下文）
    recent = history[-10:] if len(history) > 10 else history
    if recent:
        user_parts.append('【历史对话】')
        for h in recent:
            if not isinstance(h, dict):
                continue
            role = h.get('role', '')
            content = str(h.get('content', '')).strip()
            if not content:
                continue
            if role == 'user':
                user_parts.append(f'用户：{content}')
            elif role == 'assistant':
                user_parts.append(f'助手：{content}')
        user_parts.append('')

    user_parts.append(f'【当前用户消息】\n{message}')
    user_parts.append('')
    user_parts.append('请根据以上信息回答用户问题。信息不足时明确告知需要补充哪些信息，不要编造。')

    return system, '\n'.join(user_parts)


def parse_ai_response(raw: str) -> Tuple[str, str]:
    """
    解析模型返回的固定格式文本，提取主题与正文。
    格式：[主题] xxx\n[正文] xxx
    若格式不符则将全文作为正文、主题留空。
    """
    if not raw:
        return '', ''
    text = raw.strip()

    subject = ''
    body = text

    # 尝试按标记切分
    if '[主题]' in text and '[正文]' in text:
        s_idx = text.index('[主题]') + len('[主题]')
        b_idx = text.index('[正文]')
        subject = text[s_idx:b_idx].strip()
        body = text[b_idx + len('[正文]'):].strip()
    elif '[主题]' in text:
        s_idx = text.index('[主题]') + len('[主题]')
        subject = text[s_idx:].strip()
        body = ''
    elif '[正文]' in text:
        b_idx = text.index('[正文]') + len('[正文]')
        body = text[b_idx:].strip()

    return subject, body