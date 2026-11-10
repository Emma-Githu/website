const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const {
  askAI,
  askModuleAI,
  getDiagnosticInfo,
  testConnection,
  recognizeIntent,
  decomposeTask,
  SUPPORTED_MODULES,
  AIError,
  ERROR_TYPES
} = require("./ai");


const app = express();

app.use(cors());
app.use(express.json());

// ---------- CRUD 路由（阶段一：SQLite 数据层） ----------
const customersRouter = require("./routes/customers");
const ordersRouter = require("./routes/orders");
const todosRouter = require("./routes/todos");
const kbRouter = require("./routes/kb");
const reviewsRouter = require("./routes/reviews");
const migrateRouter = require("./routes/migrate");

app.use("/api/customers", customersRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/todos", todosRouter);
app.use("/api/kb", kbRouter);
app.use("/api/reviews", reviewsRouter);
app.use("/api/migrate", migrateRouter);

// ---------- 静态文件服务（前端页面） ----------
// 项目根目录位于 backend 的上一级
app.use(express.static(path.join(__dirname, "..")));

// 支持的任务类型：覆盖八大模块的全部 AI 操作
const SUPPORTED_TASKS = [
  "chat",         // 通用问答/对话
  "generate",     // 生成（邮件草稿、开发信等）
  "polish",       // 润色
  "rewrite",      // 改写
  "translate_en", // 中译英
  "translate_zh", // 英译中
  "parse",        // 单据/文本解析提取
  "check",        // 合规核对
  "analyze",      // 客户/业务分析
  "advise"        // 建议/复盘
];

// ---------- 健康检查 ----------
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "海贸智联 AI 后端服务已启动！"
  });
});

// ---------- 配置诊断接口（安全：只返回布尔值/模型名/地址，绝不返回密钥本身、长度或片段） ----------
app.get("/api/ai/health", (req, res) => {
  const info = getDiagnosticInfo();
  res.json({
    success: true,
    serverRunning: true,
    apiKeyConfigured: info.apiKeyConfigured,
    modelConfigured: info.modelConfigured,
    modelName: info.modelName,
    baseURL: info.baseURL,
    sdkInitialized: info.sdkInitialized
  });
});

// ---------- 真实连通性测试接口（仅供本地开发测试，真实请求智谱 API，不用模拟数据） ----------
// 失败时按 CONFIG_ERROR / AUTH_ERROR / MODEL_ERROR / QUOTA_ERROR / NETWORK_ERROR / INTERNAL_ERROR 分类
app.post("/api/ai/test", async (req, res) => {
  console.log("[/api/ai/test] 发起真实智谱连通性测试");
  try {
    const result = await testConnection();
    res.json(result);
  } catch (error) {
    handleError(res, error, "/api/ai/test");
  }
});

// ---------- 统一 AI 接口（八大模块） ----------
// 请求格式：{ "module": "workspace", "task": "chat", "context": { "message": "..." } }
app.post("/api/ai", async (req, res) => {
  const { module, task, context } = req.body || {};

  // --- 基础输入校验 ---
  if (!module || typeof module !== "string") {
    return res.status(400).json({ success: false, message: "缺少有效参数：module" });
  }
  if (!task || typeof task !== "string") {
    return res.status(400).json({ success: false, message: "缺少有效参数：task" });
  }
  if (!context || typeof context !== "object" || Array.isArray(context)) {
    return res.status(400).json({ success: false, message: "缺少有效参数：context" });
  }
  if (!SUPPORTED_MODULES.includes(module)) {
    return res.status(400).json({
      success: false,
      message: "不支持的模块：" + module + "，当前支持：" + SUPPORTED_MODULES.join("、")
    });
  }
  if (!SUPPORTED_TASKS.includes(task)) {
    return res.status(400).json({
      success: false,
      message: "暂不支持的任务：" + task + "，当前支持：" + SUPPORTED_TASKS.join("、")
    });
  }
  if (!context.message || typeof context.message !== "string" || !context.message.trim()) {
    return res.status(400).json({ success: false, message: "context.message 不能为空" });
  }

  // 只记录模块与任务，不记录 context 内容（避免打印客户隐私数据）
  console.log("[/api/ai] 收到请求：module =", module, "| task =", task);

  try {
    const answer = await askModuleAI(module, task, context);
    res.json({ success: true, module: module, task: task, answer: answer });
  } catch (error) {
    handleError(res, error, "/api/ai");
  }
});

// ---------- Agent 意图识别接口（第一阶段：真实调用智谱 GLM，返回结构化 JSON） ----------
// 请求格式：{ "message": "用户输入" }
app.post("/api/agent/intent", async (req, res) => {
  const { message } = req.body || {};

  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ success: false, message: "message 不能为空" });
  }

  console.log("[/api/agent/intent] 收到意图识别请求");
  try {
    const intent = await recognizeIntent(message);
    res.json({ success: true, intent: intent });
  } catch (error) {
    handleError(res, error, "/api/agent/intent");
  }
});

// ---------- Agent 任务拆解接口（第一阶段：真实调用智谱 GLM，返回有序子任务计划） ----------
// 请求格式：{ "message": "用户输入", "intent": { 意图识别返回的对象 } }
app.post("/api/agent/decompose", async (req, res) => {
  const { message, intent } = req.body || {};

  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ success: false, message: "message 不能为空" });
  }
  if (!intent || typeof intent !== "object" || Array.isArray(intent)) {
    return res.status(400).json({ success: false, message: "intent 不能为空，需为意图识别返回的对象" });
  }

  console.log("[/api/agent/decompose] 收到任务拆解请求");
  try {
    const plan = await decomposeTask(message, intent);
    res.json({ success: true, plan: plan });
  } catch (error) {
    handleError(res, error, "/api/agent/decompose");
  }
});

// ---------- 兼容旧接口（前端 js/api.js 仍在使用 /api/chat） ----------
app.post("/api/chat", async (req, res) => {
  const { message } = req.body || {};

  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ success: false, message: "请输入问题" });
  }

  try {
    const answer = await askAI(message);
    res.json({ success: true, answer: answer });
  } catch (error) {
    handleError(res, error, "/api/chat");
  }
});

// ---------- 统一错误处理 ----------
// 区分：CONFIG（配置错误）| MODEL（模型请求失败）| INTERNAL（服务器内部错误）
function handleError(res, error, route) {
  if (error instanceof AIError) {
    console.error("[" + route + "] " + error.type + "：" + error.message);
    return res.status(error.status).json({
      success: false,
      type: error.type,
      message: error.message
    });
  }
  // 未预期错误：只记录错误消息，不打印可能含敏感信息的完整堆栈
  console.error("[" + route + "] INTERNAL：", error.message || "未知错误");
  return res.status(500).json({
    success: false,
    type: ERROR_TYPES.INTERNAL,
    message: "服务器内部错误，请稍后重试"
  });
}

// ---------- 启动服务 ----------
const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, () => {
  console.log("海贸智联后端已启动:http://" + HOST + ":" + PORT);
});