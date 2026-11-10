/* ============================================================
 * localStorage 数据迁移路由
 * POST /api/migrate  一次性导入前端5个localStorage键的数据
 *   请求体: { customers:[], orders:[], todos:[], kb:[], reviews:[] }
 *   保留原 id（维护跨模块关联），跳过已存在的记录
 *   返回: { success, stats: { customers, orders, todos, kb, reviews } }
 * GET  /api/migrate/status  查询各表记录数（前端判断是否需要迁移）
 * ============================================================ */

"use strict";

const express = require("express");
const { db, stringifyJsonFields } = require("../db");

const router = express.Router();

// 查询各表记录数
router.get("/status", function (req, res) {
  const counts = {
    customers: db.prepare("SELECT count(*) c FROM customers").get().c,
    orders: db.prepare("SELECT count(*) c FROM orders").get().c,
    todos: db.prepare("SELECT count(*) c FROM todos").get().c,
    kb: db.prepare("SELECT count(*) c FROM kb_entries").get().c,
    reviews: db.prepare("SELECT count(*) c FROM reviews").get().c
  };
  res.json({ success: true, data: counts });
});

// 导入客户
function migrateCustomers(list) {
  let n = 0;
  const stmt = db.prepare(
    "INSERT OR IGNORE INTO customers (id, name, company, country, website, source, level, status, tags, contact_name, contact_title, email, phone, whatsapp, main_products, interest_categories, purchase_qty, target_price, currency, target_market, payment_pref, trade_terms, comm_lang, email_tone, comm_habit, notes, records, memories) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  list.forEach(function (c) {
    const f = stringifyJsonFields({
      tags: c.tags || "[]", records: c.records || "[]", memories: c.memories || "[]"
    }, ["tags", "records", "memories"]);
    const info = stmt.run(
      c.id || null, c.name || "未命名", c.company || "", c.country || "", c.website || "",
      c.source || "", c.level || "", c.status || "", f.tags,
      c.contactName || "", c.contactTitle || "", c.email || "", c.phone || "", c.whatsapp || "",
      c.mainProducts || "", c.interestCategories || "", c.purchaseQty || "", c.targetPrice || "",
      c.currency || "", c.targetMarket || "", c.paymentPref || "", c.tradeTerms || "",
      c.commLang || "", c.emailTone || "", c.commHabit || "", c.notes || "", f.records, f.memories
    );
    if (info.changes > 0) n++;
  });
  return n;
}

// 导入订单（含子表）
function migrateOrders(list) {
  let n = 0;
  const stmt = db.prepare(
    "INSERT OR IGNORE INTO orders (id, no, customer_id, customer_name, amount, currency, delivery_date, status, progress, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  const pStmt = db.prepare("INSERT INTO order_products (order_id, sku, name, qty, unit_price) VALUES (?, ?, ?, ?, ?)");
  const rStmt = db.prepare("INSERT INTO order_records (order_id, content) VALUES (?, ?)");
  list.forEach(function (o) {
    const info = stmt.run(
      o.id || null, o.no || "", o.customerId || null, o.customer || "",
      String(o.amount || ""), o.currency || "USD", o.delivery || "",
      o.status || "待确认", o.progress || 0, o.source || "migrated"
    );
    if (info.changes > 0) {
      n++;
      const orderId = info.lastInsertRowid;
      (o.products || []).forEach(function (p) {
        pStmt.run(orderId, p.sku || "", p.name || "", String(p.qty || ""), String(p.unitPrice || p.unit_price || ""));
      });
      (o.records || []).forEach(function (r) {
        if (r && r.content) rStmt.run(orderId, String(r.content));
      });
    }
  });
  return n;
}

// 导入待办
function migrateTodos(list) {
  let n = 0;
  const stmt = db.prepare(
    "INSERT OR IGNORE INTO todos (id, task, owner, deadline, priority, order_id, customer_id, done, source, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  list.forEach(function (t) {
    const info = stmt.run(
      t.id || null, t.task || "（空待办）", t.owner || "", t.deadline || "",
      t.priority || "中", t.relateOrderId || null, t.customerId || null,
      t.done ? 1 : 0, t.source || "migrated", t.completedAt || null
    );
    if (info.changes > 0) n++;
  });
  return n;
}

// 导入知识库
function migrateKb(list) {
  let n = 0;
  const stmt = db.prepare(
    "INSERT OR IGNORE INTO kb_entries (id, title, category, tags, content, source) VALUES (?, ?, ?, ?, ?, ?)"
  );
  list.forEach(function (k) {
    const info = stmt.run(
      k.id || null, k.title || "（无标题）", k.category || "未分类",
      JSON.stringify(k.tags || []), k.content || "", k.source || "migrated"
    );
    if (info.changes > 0) n++;
  });
  return n;
}

// 导入审核记录
function migrateReviews(list) {
  let n = 0;
  const stmt = db.prepare(
    "INSERT OR IGNORE INTO reviews (id, no, title, source_module, result_type, content, structured_data, action_type, target_module, customer_id, order_id, agent_task_id, status, submit_time, logs) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  list.forEach(function (r) {
    const no = r.no || ("RV-MIG-" + (r.id || Math.floor(Math.random() * 90000) + 10000));
    const info = stmt.run(
      r.id || null, no, r.title || "（无标题）", r.sourceModule || "unknown",
      r.resultType || "", String(r.content || ""), JSON.stringify(r.structuredData || {}),
      r.actionType || "", r.targetModule || "", r.customerId || null,
      r.orderId || null, r.agentTaskId || null, r.status || "待审核",
      r.submitTime || "", JSON.stringify(r.logs || [])
    );
    if (info.changes > 0) n++;
  });
  return n;
}

// 执行迁移
router.post("/", function (req, res) {
  const body = req.body || {};
  const stats = { customers: 0, orders: 0, todos: 0, kb: 0, reviews: 0 };
  try {
    db.exec("BEGIN");
    if (Array.isArray(body.customers)) stats.customers = migrateCustomers(body.customers);
    if (Array.isArray(body.orders)) stats.orders = migrateOrders(body.orders);
    if (Array.isArray(body.todos)) stats.todos = migrateTodos(body.todos);
    if (Array.isArray(body.kb)) stats.kb = migrateKb(body.kb);
    if (Array.isArray(body.reviews)) stats.reviews = migrateReviews(body.reviews);
    db.exec("COMMIT");
    res.json({ success: true, data: stats });
  } catch (e) {
    try { db.exec("ROLLBACK"); } catch (e2) {}
    res.status(500).json({ success: false, error: "迁移失败: " + e.message });
  }
});

module.exports = router;