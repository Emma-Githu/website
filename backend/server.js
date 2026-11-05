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

// 第四阶段第一部分：统一业务操作审批中心
const {
  createApproval,
  listApprovals,
  getApprovalDetail,
  approveApproval,
  rejectApproval,
  cancelApproval,
  executeApproval,
  ApprovalError
} = require("./approval");

const app = express();

app.use(cors());
app.use(express.json());

// 当前支持的任务类型（后续可随模块能力扩展逐步放开）
const SUPPORTED_TASKS = ["chat"];

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

/* ============================================================
 * 第四阶段第一部分：统一业务操作审批中心接口
 * ------------------------------------------------------------
 * 安全说明：
 *   - 审批记录由后端统一管理（内存存储），前端只做展示与发起请求
 *   - 所有状态校验在后端强制执行，前端按钮状态不作为权限依据
 *   - 本阶段点击批准只变更审批记录状态，不执行真实业务修改
 *   - 不接入真实邮件发送、订单修改、客户记忆保存和审核状态变更
 * ============================================================ */

// 新建审批记录（AI Agent 提出业务操作时调用）
// 请求格式：{ actionType, module, targetId, description, beforeData, proposedData, riskLevel, proposedBy }
app.post("/api/approval/create", (req, res) => {
  try {
    const record = createApproval(req.body || {});
    res.json({ success: true, record: record });
  } catch (error) {
    handleApprovalError(res, error, "/api/approval/create");
  }
});

// 查询审批记录列表（可按状态筛选），附带统计信息
// 请求格式：GET /api/approval/list?status=pending
app.get("/api/approval/list", (req, res) => {
  try {
    const status = req.query && req.query.status ? String(req.query.status) : null;
    const data = listApprovals(status);
    res.json({ success: true, list: data.list, stats: data.stats });
  } catch (error) {
    handleApprovalError(res, error, "/api/approval/list");
  }
});

// 查看审批详情
// 请求格式：GET /api/approval/detail/:approvalId
app.get("/api/approval/detail/:approvalId", (req, res) => {
  try {
    const record = getApprovalDetail(req.params.approvalId);
    res.json({ success: true, record: record });
  } catch (error) {
    handleApprovalError(res, error, "/api/approval/detail");
  }
});

// 批准操作（每个编号只能批准一次；AI 不能批准自己提出的操作）
// 请求格式：{ approvalId, operator, comment }
app.post("/api/approval/approve", (req, res) => {
  const { approvalId, operator, comment } = req.body || {};
  if (!approvalId || typeof approvalId !== "string") {
    return res.status(400).json({ success: false, message: "缺少有效参数：approvalId" });
  }
  try {
    const record = approveApproval(approvalId, { operator: operator, comment: comment });
    res.json({ success: true, record: record });
  } catch (error) {
    handleApprovalError(res, error, "/api/approval/approve");
  }
});

// 拒绝操作（只能拒绝 pending 状态）
// 请求格式：{ approvalId, operator, comment }
app.post("/api/approval/reject", (req, res) => {
  const { approvalId, operator, comment } = req.body || {};
  if (!approvalId || typeof approvalId !== "string") {
    return res.status(400).json({ success: false, message: "缺少有效参数：approvalId" });
  }
  try {
    const record = rejectApproval(approvalId, { operator: operator, comment: comment });
    res.json({ success: true, record: record });
  } catch (error) {
    handleApprovalError(res, error, "/api/approval/reject");
  }
});

// 取消待审批操作（只能取消 pending 状态）
// 请求格式：{ approvalId, operator, comment }
app.post("/api/approval/cancel", (req, res) => {
  const { approvalId, operator, comment } = req.body || {};
  if (!approvalId || typeof approvalId !== "string") {
    return res.status(400).json({ success: false, message: "缺少有效参数：approvalId" });
  }
  try {
    const record = cancelApproval(approvalId, { operator: operator, comment: comment });
    res.json({ success: true, record: record });
  } catch (error) {
    handleApprovalError(res, error, "/api/approval/cancel");
  }
});

// 尝试执行操作（只有 approved 状态才放行；本阶段不执行真实业务写入）
// 请求格式：{ approvalId }
app.post("/api/approval/execute", (req, res) => {
  const { approvalId } = req.body || {};
  if (!approvalId || typeof approvalId !== "string") {
    return res.status(400).json({ success: false, message: "缺少有效参数：approvalId" });
  }
  try {
    const result = executeApproval(approvalId);
    res.json({ success: true, executed: result.executed, reason: result.reason, record: result.record });
  } catch (error) {
    handleApprovalError(res, error, "/api/approval/execute");
  }
});

// ---------- 审批中心统一错误处理 ----------
function handleApprovalError(res, error, route) {
  if (error instanceof ApprovalError) {
    console.error("[" + route + "] " + error.type + "：" + error.message);
    return res.status(error.status).json({
      success: false,
      type: error.type,
      message: error.message
    });
  }
  console.error("[" + route + "] INTERNAL：", error.message || "未知错误");
  return res.status(500).json({
    success: false,
    type: "INTERNAL",
    message: "服务器内部错误，请稍后重试"
  });
}

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
const PORT = 3000;
app.listen(PORT, () => {
  console.log("海贸智联后端已启动:http://localhost:" + PORT);
});