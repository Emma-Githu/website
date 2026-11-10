/* ============================================================
 * 审核记录 CRUD 路由（含审核日志子表）
 * GET    /api/reviews              列表
 * GET    /api/reviews/:id          详情（含 logs）
 * POST   /api/reviews              新建（自动生成编号 RV-YYYYMMDD-XXXX）
 * PUT    /api/reviews/:id          更新
 * DELETE /api/reviews/:id          删除
 * POST   /api/reviews/:id/logs     添加审核日志
 * ============================================================ */

"use strict";

const express = require("express");
const { db, parseJsonFields, generateReviewNo } = require("../db");

const router = express.Router();

const JSON_FIELDS = ["logs", "structuredData"];

function rowToClient(row, withLogs) {
  if (!row) return null;
  const r = parseJsonFields(row, ["logs", "structured_data"]);
  const out = {
    id: r.id,
    no: r.no,
    title: r.title,
    sourceModule: r.source_module,
    resultType: r.result_type,
    content: r.content,
    structuredData: r.structured_data || {},
    actionType: r.action_type,
    targetModule: r.target_module,
    customerId: r.customer_id,
    orderId: r.order_id,
    agentTaskId: r.agent_task_id,
    status: r.status,
    submitTime: r.submit_time,
    logs: r.logs || [],
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
  if (withLogs) {
    const logRows = db.prepare("SELECT * FROM review_logs WHERE review_id = ? ORDER BY id").all(r.id);
    out.auditLogs = logRows.map(function (l) {
      return { id: l.id, action: l.action, reviewer: l.reviewer, comment: l.comment, createdAt: l.created_at };
    });
  }
  return out;
}

// 列表
router.get("/", function (req, res) {
  const rows = db.prepare("SELECT * FROM reviews ORDER BY id DESC").all();
  res.json({ success: true, data: rows.map(function (r) { return rowToClient(r, false); }) });
});

// 详情
router.get("/:id", function (req, res) {
  const row = db.prepare("SELECT * FROM reviews WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ success: false, error: "审核记录不存在" });
  res.json({ success: true, data: rowToClient(row, true) });
});

// 新建
router.post("/", function (req, res) {
  const body = req.body || {};
  if (!body.title || !String(body.title).trim()) {
    return res.status(400).json({ success: false, error: "标题不能为空" });
  }
  if (!body.sourceModule || !String(body.sourceModule).trim()) {
    return res.status(400).json({ success: false, error: "来源模块不能为空" });
  }
  // 生成唯一编号
  let no = body.no && String(body.no).trim() ? String(body.no).trim() : "";
  if (!no) {
    const count = db.prepare("SELECT count(*) c FROM reviews WHERE date(created_at) = date('now','localtime')").get();
    no = generateReviewNo((count.c || 0) + 1);
    // 确保唯一
    while (db.prepare("SELECT id FROM reviews WHERE no = ?").get(no)) {
      no = generateReviewNo(Math.floor(Math.random() * 9000) + 1000);
    }
  }
  const info = db.prepare(
    "INSERT INTO reviews (no, title, source_module, result_type, content, structured_data, action_type, target_module, customer_id, order_id, agent_task_id, status, submit_time, logs) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    no,
    String(body.title).trim(),
    String(body.sourceModule).trim(),
    body.resultType || "",
    String(body.content || ""),
    JSON.stringify(body.structuredData || {}),
    body.actionType || "",
    body.targetModule || "",
    body.customerId || null,
    body.orderId || null,
    body.agentTaskId || null,
    body.status || "待审核",
    body.submitTime || new Date().toISOString(),
    JSON.stringify(body.logs || [])
  );
  const row = db.prepare("SELECT * FROM reviews WHERE id = ?").get(info.lastInsertRowid);
  res.json({ success: true, data: rowToClient(row, false) });
});

// 更新
router.put("/:id", function (req, res) {
  const exists = db.prepare("SELECT id FROM reviews WHERE id = ?").get(req.params.id);
  if (!exists) return res.status(404).json({ success: false, error: "审核记录不存在" });
  const body = req.body || {};
  const sets = [];
  const vals = [];
  if (body.title !== undefined) { sets.push("title = ?"); vals.push(String(body.title).trim()); }
  if (body.sourceModule !== undefined) { sets.push("source_module = ?"); vals.push(String(body.sourceModule)); }
  if (body.resultType !== undefined) { sets.push("result_type = ?"); vals.push(body.resultType); }
  if (body.content !== undefined) { sets.push("content = ?"); vals.push(String(body.content)); }
  if (body.structuredData !== undefined) { sets.push("structured_data = ?"); vals.push(JSON.stringify(body.structuredData || {})); }
  if (body.actionType !== undefined) { sets.push("action_type = ?"); vals.push(body.actionType); }
  if (body.targetModule !== undefined) { sets.push("target_module = ?"); vals.push(body.targetModule); }
  if (body.customerId !== undefined) { sets.push("customer_id = ?"); vals.push(body.customerId || null); }
  if (body.orderId !== undefined) { sets.push("order_id = ?"); vals.push(body.orderId || null); }
  if (body.agentTaskId !== undefined) { sets.push("agent_task_id = ?"); vals.push(body.agentTaskId || null); }
  if (body.status !== undefined) { sets.push("status = ?"); vals.push(body.status); }
  if (body.submitTime !== undefined) { sets.push("submit_time = ?"); vals.push(body.submitTime); }
  if (body.logs !== undefined) { sets.push("logs = ?"); vals.push(JSON.stringify(body.logs || [])); }
  if (sets.length > 0) {
    sets.push("updated_at = datetime('now','localtime')");
    vals.push(req.params.id);
    db.prepare("UPDATE reviews SET " + sets.join(", ") + " WHERE id = ?").run(...vals);
  }
  const row = db.prepare("SELECT * FROM reviews WHERE id = ?").get(req.params.id);
  res.json({ success: true, data: rowToClient(row, false) });
});

// 删除
router.delete("/:id", function (req, res) {
  const exists = db.prepare("SELECT id FROM reviews WHERE id = ?").get(req.params.id);
  if (!exists) return res.status(404).json({ success: false, error: "审核记录不存在" });
  db.prepare("DELETE FROM reviews WHERE id = ?").run(req.params.id); // 日志级联删除
  res.json({ success: true });
});

// 添加审核日志（同时写入 review_logs 表和 reviews.logs JSON 列，确保前端刷新后日志不丢失）
router.post("/:id/logs", function (req, res) {
  const exists = db.prepare("SELECT id FROM reviews WHERE id = ?").get(req.params.id);
  if (!exists) return res.status(404).json({ success: false, error: "审核记录不存在" });
  const body = req.body || {};
  if (!body.action || !String(body.action).trim()) {
    return res.status(400).json({ success: false, error: "日志动作不能为空" });
  }
  const action = String(body.action).trim();
  const reviewer = body.reviewer || "";
  const comment = body.comment || "";
  const time = body.time || new Date().toLocaleString("sv-SE", { hour12: false }).slice(0, 16);
  // 1. 写入 review_logs 表
  const info = db.prepare(
    "INSERT INTO review_logs (review_id, action, reviewer, comment) VALUES (?, ?, ?, ?)"
  ).run(req.params.id, action, reviewer, comment);
  // 2. 追加到 reviews.logs JSON 列（前端读取的数据源）
  const row = db.prepare("SELECT logs FROM reviews WHERE id = ?").get(req.params.id);
  let logs = [];
  try { logs = JSON.parse(row.logs || "[]"); } catch (e) { logs = []; }
  if (!Array.isArray(logs)) logs = [];
  logs.push({ action: action, time: time, reviewer: reviewer, comment: comment });
  db.prepare("UPDATE reviews SET logs = ?, updated_at = datetime('now','localtime') WHERE id = ?")
    .run(JSON.stringify(logs), req.params.id);
  const log = db.prepare("SELECT * FROM review_logs WHERE id = ?").get(info.lastInsertRowid);
  res.json({ success: true, data: { id: log.id, action: log.action, reviewer: log.reviewer, comment: log.comment, createdAt: log.created_at } });
});

module.exports = router;