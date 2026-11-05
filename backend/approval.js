/* ============================================================
 * 海贸智联 · 统一业务操作审批中心（第四阶段第一部分）
 * ------------------------------------------------------------
 * 职责：
 *   集中管理 AI Agent 提出的所有业务写操作，未经人工批准
 *   一律不得执行。审批记录由后端统一管理，前端只做展示。
 *
 * 安全规则（全部在后端强制校验，前端按钮状态不作为权限依据）：
 *   1. 未经批准的操作不能执行（execute 仅允许 approved 状态）
 *   2. 每个审批编号只能批准一次
 *   3. 已批准 / 已拒绝 / 已取消的审批不能重复操作
 *   4. 不允许 AI 自己批准自己提出的操作（proposedBy=ai 时 operator 不能为 ai）
 *   5. 本阶段不执行任何真实业务写入（不发邮件、不改订单、不存客户记忆）
 *
 * 数据结构（每个待审批操作）：
 *   approvalId   唯一审批编号（APR-YYYYMMDD-XXXX）
 *   actionType   操作类型（如 email_send / order_update / customer_memory_save）
 *   module       所属模块（八模块之一）
 *   targetId     操作对象 ID
 *   description  操作说明
 *   beforeData   修改前的数据
 *   proposedData AI 建议修改的数据
 *   riskLevel    风险等级（low / medium / high）
 *   status       pending / approved / rejected / expired
 *   createdAt    创建时间（ISO 字符串）
 *   approvedAt   审批时间（ISO 字符串，未审批为 null）
 *   result       执行结果（本阶段恒为提示语，不执行真实写入）
 *   proposedBy   提出方（ai / human）
 *   operator     审批操作人（批准/拒绝/取消时记录）
 *   comment      审批意见
 *   logs         操作日志数组
 * ============================================================ */

"use strict";

// ---------- 审批记录存储（后端内存管理，进程生命周期内有效） ----------
// 说明：本阶段审批记录由后端统一管理（安全要求第3条），不落 localStorage。
// 进程重启后记录清空属于预期行为，后续阶段可接入持久化数据库。
const approvalStore = [];

// ---------- 审批编号自增序列 ----------
let approvalSeq = 0;

// ---------- 允许的操作类型与模块白名单 ----------
const ACTION_TYPES = [
  "email_send",          // 发送邮件
  "email_draft_save",    // 保存邮件草稿
  "order_create",        // 创建订单
  "order_update",        // 修改订单
  "order_delete",        // 删除订单
  "todo_create",         // 创建待办
  "todo_update",         // 修改待办
  "customer_create",     // 新建客户
  "customer_update",     // 修改客户
  "customer_memory_save",// 保存客户记忆
  "review_status_change",// 变更审核状态
  "kb_entry_save"        // 保存知识库条目
];

const APPROVAL_MODULES = [
  "workspace", "email", "parse", "order",
  "check", "knowledge", "customer", "review"
];

const RISK_LEVELS = ["low", "medium", "high"];
const VALID_STATUSES = ["pending", "approved", "rejected", "expired"];

// ---------- 审批错误类型 ----------
const APPROVAL_ERROR_TYPES = {
  NOT_FOUND: "APPROVAL_NOT_FOUND",        // 审批记录不存在
  INVALID_STATUS: "APPROVAL_INVALID_STATUS", // 状态不允许该操作
  ALREADY_PROCESSED: "APPROVAL_ALREADY_PROCESSED", // 已处理过（重复批准/拒绝）
  SELF_APPROVAL: "APPROVAL_SELF_APPROVAL", // AI 批准自己提出的操作
  NOT_APPROVED: "APPROVAL_NOT_APPROVED",   // 未批准即尝试执行
  PARAM_ERROR: "APPROVAL_PARAM_ERROR"      // 参数校验失败
};

class ApprovalError extends Error {
  constructor(type, message, status) {
    super(message);
    this.name = "ApprovalError";
    this.type = type;
    this.status = status || 400;
  }
}

// ---------- 工具：生成审批编号 ----------
function generateApprovalId() {
  approvalSeq++;
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return "APR-" + y + m + d + "-" + String(approvalSeq).padStart(4, "0");
}

// ---------- 工具：深拷贝（避免外部引用篡改存储内对象） ----------
function deepClone(obj) {
  if (obj === null || typeof obj !== "object") return obj;
  return JSON.parse(JSON.stringify(obj));
}

// ---------- 工具：按编号查找记录（内部引用） ----------
function findById(approvalId) {
  for (let i = 0; i < approvalStore.length; i++) {
    if (approvalStore[i].approvalId === approvalId) return approvalStore[i];
  }
  return null;
}

// ---------- 工具：追加操作日志 ----------
function appendLog(record, action, operator, comment) {
  record.logs.push({
    action: action,
    operator: operator || "",
    comment: comment || "",
    time: new Date().toISOString()
  });
}

/* ============================================================
 * 核心操作函数
 * ============================================================ */

/**
 * 新建审批记录（AI 或人工提出一个待审批的业务操作）
 * @param {object} params
 * @returns {object} 新建的审批记录（脱去内部引用的副本）
 */
function createApproval(params) {
  const p = params || {};
  const actionType = String(p.actionType || "").trim();
  const module = String(p.module || "").trim();
  const targetId = String(p.targetId || "").trim();
  const description = String(p.description || "").trim();
  const riskLevel = String(p.riskLevel || "medium").trim().toLowerCase();
  const proposedBy = String(p.proposedBy || "ai").trim().toLowerCase();

  // --- 参数校验 ---
  if (!actionType) {
    throw new ApprovalError(APPROVAL_ERROR_TYPES.PARAM_ERROR, "actionType 不能为空", 400);
  }
  if (!ACTION_TYPES.includes(actionType)) {
    throw new ApprovalError(
      APPROVAL_ERROR_TYPES.PARAM_ERROR,
      "不支持的操作类型：" + actionType + "，允许：" + ACTION_TYPES.join("、"),
      400
    );
  }
  if (!module || !APPROVAL_MODULES.includes(module)) {
    throw new ApprovalError(
      APPROVAL_ERROR_TYPES.PARAM_ERROR,
      "module 必须为八大模块之一：" + APPROVAL_MODULES.join("、"),
      400
    );
  }
  if (!description) {
    throw new ApprovalError(APPROVAL_ERROR_TYPES.PARAM_ERROR, "description 不能为空", 400);
  }
  if (!RISK_LEVELS.includes(riskLevel)) {
    throw new ApprovalError(
      APPROVAL_ERROR_TYPES.PARAM_ERROR,
      "riskLevel 必须为 low / medium / high",
      400
    );
  }
  if (proposedBy !== "ai" && proposedBy !== "human") {
    throw new ApprovalError(APPROVAL_ERROR_TYPES.PARAM_ERROR, "proposedBy 必须为 ai 或 human", 400);
  }

  const now = new Date().toISOString();
  const record = {
    approvalId: generateApprovalId(),
    actionType: actionType,
    module: module,
    targetId: targetId || "(未指定)",
    description: description,
    beforeData: p.beforeData !== undefined ? deepClone(p.beforeData) : null,
    proposedData: p.proposedData !== undefined ? deepClone(p.proposedData) : null,
    riskLevel: riskLevel,
    status: "pending",
    createdAt: now,
    approvedAt: null,
    result: null,
    proposedBy: proposedBy,
    operator: null,
    comment: "",
    logs: []
  };
  appendLog(record, "created", proposedBy, "审批记录已创建，等待人工审批");
  approvalStore.push(record);

  console.log("[approval] 新建审批记录：" + record.approvalId +
    " | " + actionType + " | " + module + " | 风险：" + riskLevel);

  return toPublic(record);
}

/**
 * 查询审批记录列表（可按状态筛选），并附带统计信息
 * @param {string} statusFilter - 可选状态筛选
 * @returns {{ list: object[], stats: object }}
 */
function listApprovals(statusFilter) {
  const filter = statusFilter && VALID_STATUSES.includes(statusFilter) ? statusFilter : null;
  const list = [];
  const stats = { total: 0, pending: 0, approved: 0, rejected: 0, expired: 0 };

  for (let i = approvalStore.length - 1; i >= 0; i--) {
    const r = approvalStore[i];
    stats.total++;
    if (r.status === "pending") stats.pending++;
    else if (r.status === "approved") stats.approved++;
    else if (r.status === "rejected") stats.rejected++;
    else if (r.status === "expired") stats.expired++;
    if (!filter || r.status === filter) {
      list.push(toPublic(r));
    }
  }
  return { list: list, stats: stats };
}

/**
 * 查看审批详情
 * @param {string} approvalId
 * @returns {object} 审批记录（公开副本）
 */
function getApprovalDetail(approvalId) {
  const record = findById(approvalId);
  if (!record) {
    throw new ApprovalError(
      APPROVAL_ERROR_TYPES.NOT_FOUND,
      "审批记录不存在：" + approvalId,
      404
    );
  }
  return toPublic(record);
}

/**
 * 批准操作（安全规则：只能批准 pending 状态；每个编号只能批准一次；
 * AI 不能批准自己提出的操作）
 * @param {string} approvalId
 * @param {object} params - { operator, comment }
 * @returns {object} 更新后的审批记录
 */
function approveApproval(approvalId, params) {
  const p = params || {};
  const operator = String(p.operator || "").trim().toLowerCase();
  const comment = String(p.comment || "").trim();

  if (!operator) {
    throw new ApprovalError(APPROVAL_ERROR_TYPES.PARAM_ERROR, "operator（审批操作人）不能为空", 400);
  }

  const record = findById(approvalId);
  if (!record) {
    throw new ApprovalError(APPROVAL_ERROR_TYPES.NOT_FOUND, "审批记录不存在：" + approvalId, 404);
  }

  // 规则6：不允许 AI 自己批准自己提出的操作
  if (record.proposedBy === "ai" && operator === "ai") {
    appendLog(record, "approve_blocked", operator, "拒绝：AI 不能批准自己提出的操作");
    throw new ApprovalError(
      APPROVAL_ERROR_TYPES.SELF_APPROVAL,
      "安全规则拦截：AI 不能批准自己提出的操作（proposedBy=ai，operator=ai）",
      403
    );
  }

  // 规则2+3：每个审批编号只能批准一次；已处理的记录不能重复操作
  if (record.status === "approved") {
    throw new ApprovalError(
      APPROVAL_ERROR_TYPES.ALREADY_PROCESSED,
      "审批编号 " + approvalId + " 已批准，不能重复批准",
      409
    );
  }
  if (record.status === "rejected") {
    throw new ApprovalError(
      APPROVAL_ERROR_TYPES.ALREADY_PROCESSED,
      "审批编号 " + approvalId + " 已拒绝，不能再批准",
      409
    );
  }
  if (record.status === "expired") {
    throw new ApprovalError(
      APPROVAL_ERROR_TYPES.ALREADY_PROCESSED,
      "审批编号 " + approvalId + " 已取消，不能再批准",
      409
    );
  }
  if (record.status !== "pending") {
    throw new ApprovalError(
      APPROVAL_ERROR_TYPES.INVALID_STATUS,
      "当前状态为 " + record.status + "，只有 pending 状态可以批准",
      409
    );
  }

  // 执行批准：本阶段只变更审批记录状态，不执行真实业务修改（规则1+8）
  record.status = "approved";
  record.approvedAt = new Date().toISOString();
  record.operator = operator;
  record.comment = comment;
  record.result = "本阶段仅记录审批通过，未执行真实业务写入（第四阶段第一部分：不接入邮件发送/订单修改/客户记忆保存/审核状态变更）";
  appendLog(record, "approved", operator, comment || "审批通过（未执行真实业务写入）");

  console.log("[approval] 批准操作：" + approvalId + " | 操作人：" + operator);
  return toPublic(record);
}

/**
 * 拒绝操作（安全规则：只能拒绝 pending 状态；已拒绝不能再次操作）
 * @param {string} approvalId
 * @param {object} params - { operator, comment }
 * @returns {object} 更新后的审批记录
 */
function rejectApproval(approvalId, params) {
  const p = params || {};
  const operator = String(p.operator || "").trim().toLowerCase();
  const comment = String(p.comment || "").trim();

  if (!operator) {
    throw new ApprovalError(APPROVAL_ERROR_TYPES.PARAM_ERROR, "operator（审批操作人）不能为空", 400);
  }

  const record = findById(approvalId);
  if (!record) {
    throw new ApprovalError(APPROVAL_ERROR_TYPES.NOT_FOUND, "审批记录不存在：" + approvalId, 404);
  }

  if (record.status !== "pending") {
    throw new ApprovalError(
      APPROVAL_ERROR_TYPES.ALREADY_PROCESSED,
      "审批编号 " + approvalId + " 当前状态为 " + record.status + "，只有 pending 状态可以拒绝",
      409
    );
  }

  record.status = "rejected";
  record.approvedAt = new Date().toISOString();
  record.operator = operator;
  record.comment = comment;
  record.result = "操作已被拒绝，不会执行任何业务修改";
  appendLog(record, "rejected", operator, comment || "拒绝操作");

  console.log("[approval] 拒绝操作：" + approvalId + " | 操作人：" + operator);
  return toPublic(record);
}

/**
 * 取消待审批操作（安全规则：只能取消 pending 状态）
 * @param {string} approvalId
 * @param {object} params - { operator, comment }
 * @returns {object} 更新后的审批记录
 */
function cancelApproval(approvalId, params) {
  const p = params || {};
  const operator = String(p.operator || "").trim().toLowerCase();
  const comment = String(p.comment || "").trim();

  const record = findById(approvalId);
  if (!record) {
    throw new ApprovalError(APPROVAL_ERROR_TYPES.NOT_FOUND, "审批记录不存在：" + approvalId, 404);
  }

  if (record.status !== "pending") {
    throw new ApprovalError(
      APPROVAL_ERROR_TYPES.ALREADY_PROCESSED,
      "审批编号 " + approvalId + " 当前状态为 " + record.status + "，只有 pending 状态可以取消",
      409
    );
  }

  record.status = "expired";
  record.operator = operator || "human";
  record.comment = comment;
  record.result = "待审批操作已被取消，不会执行";
  appendLog(record, "cancelled", operator || "human", comment || "取消待审批操作");

  console.log("[approval] 取消操作：" + approvalId + " | 操作人：" + (operator || "human"));
  return toPublic(record);
}

/**
 * 尝试执行操作（安全规则：只有 approved 状态才允许执行；
 * 本阶段恒不执行真实业务写入，仅返回提示）
 * @param {string} approvalId
 * @returns {object} { executed: false, reason, record }
 */
function executeApproval(approvalId) {
  const record = findById(approvalId);
  if (!record) {
    throw new ApprovalError(APPROVAL_ERROR_TYPES.NOT_FOUND, "审批记录不存在：" + approvalId, 404);
  }

  // 规则1：未经批准的操作不能执行
  if (record.status === "pending") {
    appendLog(record, "execute_blocked", "system", "拦截：未审批操作不能执行");
    throw new ApprovalError(
      APPROVAL_ERROR_TYPES.NOT_APPROVED,
      "安全规则拦截：审批编号 " + approvalId + " 尚未批准，不能执行",
      403
    );
  }
  if (record.status === "rejected") {
    throw new ApprovalError(
      APPROVAL_ERROR_TYPES.NOT_APPROVED,
      "审批编号 " + approvalId + " 已被拒绝，不能执行",
      403
    );
  }
  if (record.status === "expired") {
    throw new ApprovalError(
      APPROVAL_ERROR_TYPES.NOT_APPROVED,
      "审批编号 " + approvalId + " 已被取消，不能执行",
      403
    );
  }
  if (record.status !== "approved") {
    throw new ApprovalError(
      APPROVAL_ERROR_TYPES.INVALID_STATUS,
      "当前状态为 " + record.status + "，只有 approved 状态可以执行",
      409
    );
  }

  // 本阶段：已批准也不执行真实业务写入（规则7+8）
  appendLog(record, "execute_simulated", "system", "第四阶段第一部分：仅模拟执行，未写入真实业务数据");
  console.log("[approval] 模拟执行（不写入真实业务）：" + approvalId);

  return {
    executed: false,
    reason: "第四阶段第一部分：审批已通过，但本阶段不接入真实业务写入操作（邮件发送/订单修改/客户记忆保存/审核状态变更均未执行）",
    record: toPublic(record)
  };
}

/**
 * 输出公开副本（深拷贝，避免外部篡改内部存储）
 */
function toPublic(record) {
  return deepClone(record);
}

module.exports = {
  createApproval,
  listApprovals,
  getApprovalDetail,
  approveApproval,
  rejectApproval,
  cancelApproval,
  executeApproval,
  ACTION_TYPES,
  APPROVAL_MODULES,
  RISK_LEVELS,
  VALID_STATUSES,
  APPROVAL_ERROR_TYPES,
  ApprovalError
};