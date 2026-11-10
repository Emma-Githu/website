/* ============================================================
 * 订单 CRUD 路由（含产品明细/跟进记录子表 + 自动跟单待办）
 * GET    /api/orders            列表
 * GET    /api/orders/:id        详情（含 products/records）
 * POST   /api/orders            新建（自动生成跟单待办）
 * PUT    /api/orders/:id        更新（同步子表）
 * DELETE /api/orders/:id        删除（级联删子表）
 * ============================================================ */

"use strict";

const express = require("express");
const { db } = require("../db");

const router = express.Router();

/** 数据库行 → 前端订单对象（含子表） */
function rowToClient(row, withChildren) {
  if (!row) return null;
  const out = {
    id: row.id,
    no: row.no,
    customer: row.customer_name,
    customerId: row.customer_id,
    amount: row.amount,
    currency: row.currency,
    delivery: row.delivery_date,
    status: row.status,
    progress: row.progress,
    source: row.source,
    agentTaskId: row.agent_task_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
  if (withChildren) {
    const products = db.prepare("SELECT * FROM order_products WHERE order_id = ? ORDER BY id").all(row.id);
    out.products = products.map(function (p) {
      return { sku: p.sku, name: p.name, qty: p.qty, price: p.unit_price };
    });
    const records = db.prepare("SELECT * FROM order_records WHERE order_id = ? ORDER BY id").all(row.id);
    out.records = records.map(function (r) {
      return { text: r.content, time: r.created_at };
    });
  }
  return out;
}

/** 同步产品子表（先删后插） */
function syncProducts(orderId, products) {
  db.prepare("DELETE FROM order_products WHERE order_id = ?").run(orderId);
  if (!Array.isArray(products)) return;
  const stmt = db.prepare("INSERT INTO order_products (order_id, sku, name, qty, unit_price) VALUES (?, ?, ?, ?, ?)");
  products.forEach(function (p) {
    if (!p) return;
    stmt.run(orderId, p.sku || "", p.name || "", String(p.qty || ""), String(p.price || p.unitPrice || p.unit_price || ""));
  });
}

/** 同步记录子表（先删后插） */
function syncRecords(orderId, records) {
  db.prepare("DELETE FROM order_records WHERE order_id = ?").run(orderId);
  if (!Array.isArray(records)) return;
  const stmt = db.prepare("INSERT INTO order_records (order_id, content) VALUES (?, ?)");
  records.forEach(function (r) {
    if (!r) return;
    const content = r.content || r.text || "";
    if (!content) return;
    stmt.run(orderId, String(content));
  });
}

/** 生成订单编号 PO-YYYYMMDD-XXXX */
function generateOrderNo() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const count = db.prepare("SELECT count(*) c FROM orders WHERE date(created_at) = date('now','localtime')").get();
  const seq = (count.c || 0) + 1;
  return "PO-" + y + m + d + "-" + String(seq).padStart(4, "0");
}

// 列表
router.get("/", function (req, res) {
  const rows = db.prepare("SELECT * FROM orders ORDER BY id DESC").all();
  res.json({ success: true, data: rows.map(function (r) { return rowToClient(r, false); }) });
});

// 详情
router.get("/:id", function (req, res) {
  const row = db.prepare("SELECT * FROM orders WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ success: false, error: "订单不存在" });
  res.json({ success: true, data: rowToClient(row, true) });
});

// 新建
router.post("/", function (req, res) {
  const body = req.body || {};
  const no = body.no && String(body.no).trim() ? String(body.no).trim() : generateOrderNo();
  const info = db.prepare(
    "INSERT INTO orders (no, customer_id, customer_name, amount, currency, delivery_date, status, progress, source, agent_task_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    no,
    body.customerId || null,
    body.customer || "",
    String(body.amount || ""),
    body.currency || "USD",
    body.delivery || "",
    body.status || "待确认",
    body.progress || 0,
    body.source || "manual",
    body.agentTaskId || null
  );
  const orderId = info.lastInsertRowid;
  // 同步子表
  if (body.products) syncProducts(orderId, body.products);
  if (body.records) syncRecords(orderId, body.records);
  // 自动生成跟单待办
  try {
    db.prepare(
      "INSERT INTO todos (task, owner, deadline, priority, order_id, customer_id, done, source) VALUES (?, ?, ?, ?, ?, ?, 0, 'auto_order')"
    ).run(
      "跟进订单 " + no + (body.customer ? " - " + body.customer : ""),
      body.owner || "",
      body.delivery || "",
      "高",
      orderId,
      body.customerId || null
    );
  } catch (e) { /* 待办生成失败不影响订单创建 */ }
  const row = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
  res.json({ success: true, data: rowToClient(row, true) });
});

// 更新
router.put("/:id", function (req, res) {
  const exists = db.prepare("SELECT id FROM orders WHERE id = ?").get(req.params.id);
  if (!exists) return res.status(404).json({ success: false, error: "订单不存在" });
  const body = req.body || {};
  const sets = [];
  const vals = [];
  if (body.no !== undefined) { sets.push("no = ?"); vals.push(String(body.no)); }
  if (body.customerId !== undefined) { sets.push("customer_id = ?"); vals.push(body.customerId || null); }
  if (body.customer !== undefined) { sets.push("customer_name = ?"); vals.push(String(body.customer)); }
  if (body.amount !== undefined) { sets.push("amount = ?"); vals.push(String(body.amount)); }
  if (body.currency !== undefined) { sets.push("currency = ?"); vals.push(body.currency); }
  if (body.delivery !== undefined) { sets.push("delivery_date = ?"); vals.push(body.delivery); }
  if (body.status !== undefined) { sets.push("status = ?"); vals.push(body.status); }
  if (body.progress !== undefined) { sets.push("progress = ?"); vals.push(body.progress); }
  if (body.source !== undefined) { sets.push("source = ?"); vals.push(body.source); }
  if (body.agentTaskId !== undefined) { sets.push("agent_task_id = ?"); vals.push(body.agentTaskId || null); }
  if (sets.length > 0) {
    sets.push("updated_at = datetime('now','localtime')");
    vals.push(req.params.id);
    db.prepare("UPDATE orders SET " + sets.join(", ") + " WHERE id = ?").run(...vals);
  }
  if (body.products) syncProducts(req.params.id, body.products);
  if (body.records) syncRecords(req.params.id, body.records);
  const row = db.prepare("SELECT * FROM orders WHERE id = ?").get(req.params.id);
  res.json({ success: true, data: rowToClient(row, true) });
});

// 删除
router.delete("/:id", function (req, res) {
  const exists = db.prepare("SELECT id FROM orders WHERE id = ?").get(req.params.id);
  if (!exists) return res.status(404).json({ success: false, error: "订单不存在" });
  db.prepare("DELETE FROM orders WHERE id = ?").run(req.params.id); // 子表级联删除
  res.json({ success: true });
});

module.exports = router;