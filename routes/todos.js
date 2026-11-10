/* ============================================================
 * 待办 CRUD 路由
 * GET    /api/todos             列表（支持 ?done=0/1 过滤）
 * GET    /api/todos/:id         详情
 * POST   /api/todos             新建
 * PUT    /api/todos/:id         更新（done切换自动记录completed_at）
 * DELETE /api/todos/:id         删除
 * ============================================================ */

"use strict";

const express = require("express");
const { db } = require("../db");

const router = express.Router();

function rowToClient(row) {
  if (!row) return null;
  return {
    id: row.id,
    task: row.task,
    owner: row.owner,
    deadline: row.deadline,
    priority: row.priority,
    relateOrderId: row.order_id,
    customerId: row.customer_id,
    done: !!row.done,
    source: row.source,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// 列表
router.get("/", function (req, res) {
  let rows;
  if (req.query.done === "0" || req.query.done === "1") {
    rows = db.prepare("SELECT * FROM todos WHERE done = ? ORDER BY done ASC, id DESC").all(Number(req.query.done));
  } else {
    rows = db.prepare("SELECT * FROM todos ORDER BY done ASC, id DESC").all();
  }
  res.json({ success: true, data: rows.map(rowToClient) });
});

// 详情
router.get("/:id", function (req, res) {
  const row = db.prepare("SELECT * FROM todos WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ success: false, error: "待办不存在" });
  res.json({ success: true, data: rowToClient(row) });
});

// 新建
router.post("/", function (req, res) {
  const body = req.body || {};
  if (!body.task || !String(body.task).trim()) {
    return res.status(400).json({ success: false, error: "待办内容不能为空" });
  }
  const info = db.prepare(
    "INSERT INTO todos (task, owner, deadline, priority, order_id, customer_id, done, source) VALUES (?, ?, ?, ?, ?, ?, 0, ?)"
  ).run(
    String(body.task).trim(),
    body.owner || "",
    body.deadline || "",
    body.priority || "中",
    body.relateOrderId || null,
    body.customerId || null,
    body.source || "manual"
  );
  const row = db.prepare("SELECT * FROM todos WHERE id = ?").get(info.lastInsertRowid);
  res.json({ success: true, data: rowToClient(row) });
});

// 更新
router.put("/:id", function (req, res) {
  const exists = db.prepare("SELECT id FROM todos WHERE id = ?").get(req.params.id);
  if (!exists) return res.status(404).json({ success: false, error: "待办不存在" });
  const body = req.body || {};
  const sets = [];
  const vals = [];
  if (body.task !== undefined) { sets.push("task = ?"); vals.push(String(body.task)); }
  if (body.owner !== undefined) { sets.push("owner = ?"); vals.push(body.owner); }
  if (body.deadline !== undefined) { sets.push("deadline = ?"); vals.push(body.deadline); }
  if (body.priority !== undefined) { sets.push("priority = ?"); vals.push(body.priority); }
  if (body.relateOrderId !== undefined) { sets.push("order_id = ?"); vals.push(body.relateOrderId || null); }
  if (body.customerId !== undefined) { sets.push("customer_id = ?"); vals.push(body.customerId || null); }
  if (body.source !== undefined) { sets.push("source = ?"); vals.push(body.source); }
  if (body.done !== undefined) {
    sets.push("done = ?"); vals.push(body.done ? 1 : 0);
    sets.push("completed_at = ?"); vals.push(body.done ? new Date().toISOString() : null);
  }
  if (sets.length > 0) {
    sets.push("updated_at = datetime('now','localtime')");
    vals.push(req.params.id);
    db.prepare("UPDATE todos SET " + sets.join(", ") + " WHERE id = ?").run(...vals);
  }
  const row = db.prepare("SELECT * FROM todos WHERE id = ?").get(req.params.id);
  res.json({ success: true, data: rowToClient(row) });
});

// 删除
router.delete("/:id", function (req, res) {
  const exists = db.prepare("SELECT id FROM todos WHERE id = ?").get(req.params.id);
  if (!exists) return res.status(404).json({ success: false, error: "待办不存在" });
  db.prepare("DELETE FROM todos WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

module.exports = router;