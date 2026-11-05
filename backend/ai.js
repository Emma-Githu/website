const OpenAI = require("openai");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

/* ============================================================
 * 海贸智联 · 智谱 GLM AI 统一调用层
 * ------------------------------------------------------------
 * 对外暴露：
 *   askAI(message)                     —— 兼容旧接口 /api/chat
 *   askModuleAI(module, task, context)  —— 统一模块化接口 /api/ai
 *   SUPPORTED_MODULES                   —— 支持的模块列表
 *   AIError / ERROR_TYPES               —— 错误类型定义
 * ============================================================ */

// ---------- 错误类型 ----------
const ERROR_TYPES = {
  CONFIG: "CONFIG",     // 配置错误：缺少 API Key / 模型名称
  MODEL: "MODEL",       // 模型请求失败：网络、鉴权、限流、模型不可用等
  INTERNAL: "INTERNAL"  // 服务器内部错误
};

// 连通性测试专用错误类型（仅供 /api/ai/test 使用，更细粒度区分失败原因）
const TEST_ERROR_TYPES = {
  CONFIG_ERROR: "CONFIG_ERROR",    // 环境变量未读取或缺失
  AUTH_ERROR: "AUTH_ERROR",        // API Key 鉴权失败
  MODEL_ERROR: "MODEL_ERROR",      // 模型名称错误或账号无模型权限
  QUOTA_ERROR: "QUOTA_ERROR",      // 额度、余额或限流问题
  NETWORK_ERROR: "NETWORK_ERROR",  // 网络连接或超时问题
  INTERNAL_ERROR: "INTERNAL_ERROR" // 其他后端错误
};

class AIError extends Error {
  constructor(type, message, status) {
    super(message);
    this.name = "AIError";
    this.type = type;
    this.status = status || 500;
  }
}

// ---------- 八大模块系统指令 ----------
const MODULE_PROMPTS = {
  workspace:
    "你是「海贸智联·工作台助手」，服务于跨境B2B外贸业务人员的日常工作台。" +
    "职责：1) 帮助用户梳理和规划外贸日常工作与待办事项；2) 对跨模块的业务问题给出指引，告诉用户应使用哪个功能模块（邮件、单据解析、订单、合规查验、知识库、客户、复盘）；3) 对综合性业务问题给出条理清晰的行动建议。" +
    "回答风格：简洁、分点、可执行；涉及不确定的业务数据时明确说明“需以实际数据为准”，不得编造数字。",

  email:
    "你是「海贸智联·邮件助手」，专注外贸商务邮件场景。" +
    "职责：1) 撰写外贸开发信、询盘回复、报价跟进、催款与致歉邮件；2) 对现有邮件进行润色、语气调整与纠错；3) 提供中英等多语言互译并符合外贸商务表达习惯。" +
    "要求：邮件需包含清晰的主题、称呼、正文、行动号召与落款；语气专业礼貌；不得虚构收件人信息或订单细节。",

  parse:
    "你是「海贸智联·单据解析助手」，负责从外贸文本中提取结构化信息。" +
    "职责：从询盘、报价单、销售合同、形式发票、装箱单等文本中提取关键字段，如：买卖双方、产品名称与规格、数量、单价与总价、贸易术语（Incoterms）、付款方式、交期、港口等。" +
    "要求：以清晰的字段列表或 JSON 形式输出；文本中未提及的字段标注“未提及”，严禁推断或编造；对模糊表述给出提示。",

  order:
    "你是「海贸智联·订单助手」，服务于外贸订单管理场景。" +
    "职责：1) 协助订单跟进要点梳理与节点提醒；2) 提供报价核算思路（成本、利润、汇率影响）；3) 评估交期与产能风险；4) 对订单异常情况给出处理建议。" +
    "要求：所有金额、汇率、交期等数字如由用户提供则原样引用，否则明确标注“示例”并提示以实际数据为准。",

  check:
    "你是「海贸智联·合规查验助手」，专注外贸合规与单证核对。" +
    "职责：1) 核对单证一致性（合同、发票、装箱单、提单之间的品名、数量、金额等是否一致）；2) 提示常见贸易合规风险（出口管制、制裁名单、报关要素缺失）；3) 给出单证完善建议。" +
    "要求：以清单形式逐项核对并标注“一致/不一致/无法判断”；合规提示属于一般性建议，涉及具体法律法规时提示用户咨询专业机构。",

  knowledge:
    "你是「海贸智联·外贸知识助手」，负责外贸专业知识问答。" +
    "职责：解答外贸术语（如 FOB、CIF、L/C）、业务流程（询盘—报价—签约—生产—报关—物流—收汇）、国际结算、贸易政策与惯例等问题。" +
    "要求：解释准确、通俗易懂，必要时举例说明；对政策类信息提示以官方最新发布为准。",

  customer:
    "你是「海贸智联·客户助手」，服务于外贸客户分析与跟进。" +
    "职责：1) 根据用户提供的客户信息协助整理客户画像（地区、行业、采购规模、合作阶段）；2) 制定客户跟进策略与沟通话术；3) 对客户邮件/询盘背后的意图给出分析建议。" +
    "要求：分析基于用户已提供的信息，未提供的信息不得臆测；建议具体可落地。",

  review:
    "你是「海贸智联·审核与复盘助手」，服务于AI结果审核与外贸业务复盘。" +
    "职责：1) 对用户提交的AI生成结果进行可靠性审核：评估内容是否有事实依据、是否存在信息缺失与逻辑问题、识别风险点并提示需人工核实之处，仅提供审核意见，最终审核决定由人工做出；2) 对用户提供的业务数据（订单量、转化率、客户结构等）进行归纳与趋势分析；3) 诊断业务问题并输出改进建议与下一阶段行动要点。" +
    "要求：结论必须有用户提供的数据支撑，未提供数据时明确请求补充，不得编造数据或趋势。"
};

const SUPPORTED_MODULES = Object.keys(MODULE_PROMPTS);

// ---------- 配置读取 ----------
function getConfig() {
  // 优先读取 ZHIPU_API_KEY；为兼容旧配置，回退读取 OPENAI_API_KEY
  const apiKey = process.env.ZHIPU_API_KEY || process.env.OPENAI_API_KEY;
  // 模型名称一律从 ZHIPU_MODEL 读取，不硬编码，不假设账户支持的模型
  const model = process.env.ZHIPU_MODEL;
  return { apiKey, model };
}

// ---------- 智谱 API 地址（OpenAI SDK 兼容接口） ----------
const ZHIPU_BASE_URL = "https://open.bigmodel.cn/api/paas/v4";

// ---------- OpenAI 兼容客户端（惰性单例） ----------
let clientInstance = null;
function getClient(apiKey) {
  if (!clientInstance) {
    clientInstance = new OpenAI({
      apiKey: apiKey,
      baseURL: ZHIPU_BASE_URL
    });
  }
  return clientInstance;
}

// ---------- 配置诊断（供 /api/ai/health 使用，绝不返回密钥本身/长度/片段） ----------
function getDiagnosticInfo() {
  const { apiKey, model } = getConfig();
  return {
    apiKeyConfigured: !!apiKey,
    modelConfigured: !!model,
    modelName: model || null,
    baseURL: ZHIPU_BASE_URL,
    sdkInitialized: !!clientInstance
  };
}

// ---------- 真实连通性测试（供 /api/ai/test 使用，仅本地开发测试） ----------
// 真正向智谱 API 发起一次最小请求，返回真实模型响应；失败时按原因分类
async function testConnection() {
  const { apiKey, model } = getConfig();

  if (!apiKey) {
    throw new AIError(TEST_ERROR_TYPES.CONFIG_ERROR,
      "环境变量 ZHIPU_API_KEY 未读取或缺失，请检查 backend/.env 是否存在且 dotenv 已加载", 503);
  }
  if (!model) {
    throw new AIError(TEST_ERROR_TYPES.CONFIG_ERROR,
      "环境变量 ZHIPU_MODEL 未读取或缺失，请检查 backend/.env 是否存在且 dotenv 已加载", 503);
  }

  const client = getClient(apiKey);

  try {
    const response = await client.chat.completions.create({
      model: model,
      messages: [{ role: "user", content: "请回复四个字：连接成功" }],
      max_tokens: 16
    });
    return {
      success: true,
      modelName: model,
      reply: response.choices[0].message.content
    };
  } catch (error) {
    // 分类失败原因；错误消息只透传上游描述，不含密钥与完整请求体
    const status = error.status || error.statusCode || 0;
    const msg = String(error.message || "未知错误");
    let type = TEST_ERROR_TYPES.INTERNAL_ERROR;

    if (status === 401 || status === 403) {
      type = TEST_ERROR_TYPES.AUTH_ERROR;
    } else if (status === 429) {
      type = TEST_ERROR_TYPES.QUOTA_ERROR;
    } else if (status === 404 ||
               /模型.*不存在|model.*not.*found|no.*such.*model|无权限.*模型|没有.*模型.*权限/i.test(msg)) {
      type = TEST_ERROR_TYPES.MODEL_ERROR;
    } else if (status === 0 &&
               (/timeout|etimedout|econnrefused|econnreset|enotfound|socket|network|fetch.*failed/i.test(msg) ||
                error.code)) {
      type = TEST_ERROR_TYPES.NETWORK_ERROR;
    } else if (/余额|额度|欠费|insufficient.*balance|quota.*exceeded/i.test(msg)) {
      type = TEST_ERROR_TYPES.QUOTA_ERROR;
    }

    const statusMap = {
      CONFIG_ERROR: 503,
      AUTH_ERROR: 502,
      MODEL_ERROR: 502,
      QUOTA_ERROR: 429,
      NETWORK_ERROR: 504,
      INTERNAL_ERROR: 500
    };
    throw new AIError(type, "智谱连通性测试失败：" + msg, statusMap[type] || 500);
  }
}

// ---------- 用户消息构造 ----------
function buildUserContent(task, context) {
  const message = String(context.message || "").trim();
  const extraEntries = Object.entries(context).filter(
    ([key]) => key !== "message" && context[key] !== undefined && context[key] !== null
  );
  const parts = [];
  parts.push("【当前任务】" + task);
  if (message) {
    parts.push("【用户输入】\n" + message);
  }
  if (extraEntries.length > 0) {
    parts.push("【附加上下文】\n" + JSON.stringify(Object.fromEntries(extraEntries), null, 2));
  }
  return parts.join("\n\n");
}

// ---------- 底层模型请求 ----------
async function requestModel(messages) {
  const { apiKey, model } = getConfig();

  if (!apiKey) {
    throw new AIError(ERROR_TYPES.CONFIG, "尚未配置智谱 API Key", 503);
  }
  if (!model) {
    throw new AIError(ERROR_TYPES.CONFIG, "尚未配置智谱模型名称（ZHIPU_MODEL），请在 backend/.env 中配置", 503);
  }

  const client = getClient(apiKey);

  try {
    const response = await client.chat.completions.create({
      model: model,
      messages: messages
    });
    return response.choices[0].message.content;
  } catch (error) {
    // 不打印请求体与密钥，仅透传上游错误描述
    throw new AIError(
      ERROR_TYPES.MODEL,
      "智谱模型请求失败：" + (error.message || "未知错误"),
      502
    );
  }
}

// ---------- 统一模块化调用（供 /api/ai 使用） ----------
async function askModuleAI(moduleName, task, context) {
  const systemPrompt = MODULE_PROMPTS[moduleName];
  if (!systemPrompt) {
    throw new AIError(ERROR_TYPES.INTERNAL, "未知的业务模块：" + moduleName, 400);
  }
  const userContent = buildUserContent(task, context);
  return requestModel([
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ]);
}

// ---------- 兼容旧调用（供 /api/chat 使用，保持纯问答行为） ----------
async function askAI(message) {
  if (!message || !String(message).trim()) {
    throw new AIError(ERROR_TYPES.INTERNAL, "请输入问题", 400);
  }
  return requestModel([{ role: "user", content: String(message) }]);
}

/* ============================================================
 * Agent 任务执行引擎 · 第一阶段：意图识别 + 任务拆解
 * ------------------------------------------------------------
 * 复用 requestModel 底层链路（智谱 GLM），新增两个编排步骤：
 *   recognizeIntent(userInput)              —— 意图识别，返回结构化 JSON
 *   decomposeTask(userInput, intentResult)  —— 任务拆解，返回有序子任务计划
 * 两个步骤均要求模型仅输出 JSON，经 extractJSON 安全解析后返回。
 * 本阶段不执行子任务、不写入业务数据。
 * ============================================================ */

// ---------- 意图识别系统提示词 ----------
const INTENT_PROMPT =
  "你是「海贸智联·意图识别器」，负责分析用户输入并识别业务意图。" +
  "可选业务模块：workspace（工作台通用）、email（邮件助手）、parse（单据解析）、order（订单助手）、check（合规查验）、knowledge（外贸知识）、customer（客户助手）、review（审核复盘）。" +
  "输出要求：仅输出一个 JSON 对象，不要包含 markdown 代码块标记或任何其他文字。" +
  "JSON 字段：" +
  "intent（意图名称，中文短语）；" +
  "intentType（意图类型，从以下选择：email_draft/document_parse/order_management/compliance_check/knowledge_query/customer_analysis/review_audit/compound_task/general_chat）；" +
  "targetModule（最匹配的单个模块名，compound_task 时填主要模块）；" +
  "confidence（置信度，0 到 1 的数字）；" +
  "entities（关键实体对象，如 product/quantity/amount/customer/language 等，用户未提及的字段不要编造，没有则为空对象 {}）；" +
  "summary（一句话意图概述）。" +
  "判断规则：1) 闲聊、问候或无需调用特定业务模块的通用问题，intentType 为 general_chat，targetModule 为 workspace；" +
  "2) 涉及多个业务模块的复合任务，intentType 为 compound_task；" +
  "3) 不得编造用户未提及的实体。";

// ---------- 任务拆解系统提示词 ----------
const DECOMPOSE_PROMPT =
  "你是「海贸智联·任务拆解器」，负责将用户任务拆解为有序的子任务序列。" +
  "可选业务模块（工具）：workspace（工作台通用）、email（邮件助手）、parse（单据解析）、order（订单助手）、check（合规查验）、knowledge（外贸知识）、customer（客户助手）、review（审核复盘）。" +
  "输出要求：仅输出一个 JSON 对象，不要包含 markdown 代码块标记或任何其他文字。" +
  "JSON 结构：{ \"planSummary\": \"计划概述\", \"subtasks\": [ { \"id\": 1, \"module\": \"模块名\", \"title\": \"子任务标题\", \"instruction\": \"明确的执行指令\", \"needsConfirmation\": false } ] }。" +
  "拆解规则：" +
  "1) 每个子任务的 module 必须是上述八个模块之一；" +
  "2) 子任务数量 1 到 5 个，按执行顺序排列，id 从 1 递增；" +
  "3) instruction 必须包含足够信息让对应模块独立执行，需引用用户原文中的关键内容，不得省略；" +
  "4) 涉及创建、修改、删除订单/客户记录/待办/审核结果等写入操作时 needsConfirmation 为 true，仅查询、分析、生成建议、撰写草稿类为 false；" +
  "5) 不得编造用户未提供的数据；" +
  "6) planSummary 用一句话概括整体执行计划。";

// ---------- JSON 安全提取（模型可能返回 markdown 代码块或多余文字） ----------
function extractJSON(text) {
  if (!text) return null;
  let str = String(text).trim();
  // 去除 markdown 代码块标记
  if (str.startsWith("```")) {
    str = str.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  }
  // 截取第一个 { 到最后一个 }
  const start = str.indexOf("{");
  const end = str.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  str = str.slice(start, end + 1);
  try {
    return JSON.parse(str);
  } catch (e) {
    return null;
  }
}

// ---------- 意图识别（真实调用智谱 GLM，返回结构化 JSON） ----------
async function recognizeIntent(userInput) {
  const message = String(userInput || "").trim();
  if (!message) {
    throw new AIError(ERROR_TYPES.INTERNAL, "意图识别输入不能为空", 400);
  }
  const raw = await requestModel([
    { role: "system", content: INTENT_PROMPT },
    { role: "user", content: "【用户输入】\n" + message }
  ]);
  const result = extractJSON(raw);
  if (!result || !result.intentType) {
    throw new AIError(
      ERROR_TYPES.MODEL,
      "意图识别返回内容无法解析为有效 JSON（缺少 intentType 字段）",
      502
    );
  }
  return result;
}

// ---------- 任务拆解（真实调用智谱 GLM，返回有序子任务计划） ----------
async function decomposeTask(userInput, intentResult) {
  const message = String(userInput || "").trim();
  if (!message) {
    throw new AIError(ERROR_TYPES.INTERNAL, "任务拆解输入不能为空", 400);
  }
  if (!intentResult || typeof intentResult !== "object" || Array.isArray(intentResult)) {
    throw new AIError(ERROR_TYPES.INTERNAL, "任务拆解需要有效的意图识别结果", 400);
  }
  const raw = await requestModel([
    { role: "system", content: DECOMPOSE_PROMPT },
    {
      role: "user",
      content:
        "【用户输入】\n" + message +
        "\n\n【意图识别结果】\n" + JSON.stringify(intentResult, null, 2)
    }
  ]);
  const result = extractJSON(raw);
  if (!result || !Array.isArray(result.subtasks) || result.subtasks.length === 0) {
    throw new AIError(
      ERROR_TYPES.MODEL,
      "任务拆解返回内容无法解析为有效 JSON（缺少 subtasks 数组）",
      502
    );
  }
  return result;
}

module.exports = {
  askAI,
  askModuleAI,
  getDiagnosticInfo,
  testConnection,
  recognizeIntent,
  decomposeTask,
  SUPPORTED_MODULES,
  MODULE_PROMPTS,
  AIError,
  ERROR_TYPES,
  TEST_ERROR_TYPES
};