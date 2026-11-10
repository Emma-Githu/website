/* ============================================================
 * 客户 CRUD 路由
 * GET    /api/customers        列表（支持 keyword 搜索）
 * GET    /api/customers/:id    详情
 * POST   /api/customers        新建
 * PUT    /api/customers/:id    更新
 * DELETE /api/customers/:id    删除
 * 字段映射：前端驼峰 ⇄ 数据库下划线
 * ============================================================ */

"use strict";

const express = require("express");
const { db, parseJsonFields, stringifyJsonFields } = require("../db");

const router = express.Router();

// 前端驼峰字段 → 数据库下划线字段
const FIELD_MAP = {
  name: "name", company: "company", country: "country", website: "website",
  source: "source", level: "level", status: "status", tags: "tags",
  contactName: "contact_name", contactTitle: "contact_title",
  email: "email", phone: "phone", whatsapp: "whatsapp",
  mainProducts: "main_products", interestCategories: "interest_categories",
  purchaseQty: "purchase_qty", targetPrice: "target_price",
  currency: "currency", targetMarket: "target_market",
  paymentPref: "payment_pref", tradeTerms: "trade_terms",
  commLang: "comm_lang", emailTone: "email_tone",
  commHabit: "comm_habit", notes: "notes",
  records: "records", memories: "memories"
};
const JSON_FIELDS = ["tags", "records", "memories"];

/** 数据库行 → 前端对象（下划线转驼峰 + JSON解析） */
function rowToClient(row) {
  if (!row) return null;
  const r = parseJsonFields(row, JSON_FIELDS);
  return {
    id: r.id,
    name: r.name, company: r.company, country: r.country, website: r.website,
    source: r.source, level: r.level, status: r.status, tags: r.tags || [],
    contactName: r.contact_name, contactTitle: r.contact_title,
    email: r.email, phone: r.phone, whatsapp: r.whatsapp,
    mainProducts: r.main_products, interestCategories: r.interest_categories,
    purchaseQty: r.purchase_qty, targetPrice: r.target_price,
    currency: r.currency, targetMarket: r.target_market,
    paymentPref: r.payment_pref, tradeTerms: r.trade_terms,
    commLang: r.comm_lang, emailTone: r.email_tone,
    commHabit: r.comm_habit, notes: r.notes,
    records: r.records || [], memories: r.memories || [],
    createdAt: r.created_at, updatedAt: r.updated_at
  };
}

/** 前端对象 → 数据库可写字段（驼峰转下划线 + JSON序列化） */
function clientToDb(body) {
  const out = {};
  Object.keys(FIELD_MAP).forEach(function (camel) {
    if (body[camel] !== undefined) {
      out[FIELD_MAP[camel]] = body[camel];
    }
  });
  return stringifyJsonFields(out, JSON_FIELDS);
}

// 列表
router.get("/", function (req, res) {
  const kw = (req.query.keyword || "").trim();
  let rows;
  if (kw) {
    const like = "%" + kw + "%";
    rows = db.prepare(
      "SELECT * FROM customers WHERE name LIKE ? OR company LIKE ? OR country LIKE ? OR email LIKE ? ORDER BY id DESC"
    ).all(like, like, like, like);
  } else {
    rows = db.prepare("SELECT * FROM customers ORDER BY id DESC").all();
  }
  res.json({ success: true, data: rows.map(rowToClient) });
});

// 详情
router.get("/:id", function (req, res) {
  const row = db.prepare("SELECT * FROM customers WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ success: false, error: "客户不存在" });
  res.json({ success: true, data: rowToClient(row) });
});

// 新建
router.post("/", function (req, res) {
  const body = req.body || {};
  if (!body.name || !String(body.name).trim()) {
    return res.status(400).json({ success: false, error: "客户名称不能为空" });
  }
  const fields = clientToDb(body);
  const cols = Object.keys(fields);
  const vals = cols.map(function (c) { return fields[c]; });
  if (cols.length === 0) return res.status(400).json({ success: false, error: "无有效字段" });
  const sql = "INSERT INTO customers (" + cols.join(", ") + ") VALUES (" + cols.map(function () { return "?"; }).join(", ") + ")";
  const info = db.prepare(sql).run(...vals);
  const row = db.prepare("SELECT * FROM customers WHERE id = ?").get(info.lastInsertRowid);
  res.json({ success: true, data: rowToClient(row) });
});

// 更新
router.put("/:id", function (req, res) {
  const exists = db.prepare("SELECT id FROM customers WHERE id = ?").get(req.params.id);
  if (!exists) return res.status(404).json({ success: false, error: "客户不存在" });
  const fields = clientToDb(req.body || {});
  const cols = Object.keys(fields);
  if (cols.length === 0) return res.json({ success: true, data: null });
  const sets = cols.map(function (c) { return c + " = ?"; }).join(", ");
  const vals = cols.map(function (c) { return fields[c]; });
  vals.push(req.params.id);
  db.prepare("UPDATE customers SET " + sets + ", updated_at = datetime('now','localtime') WHERE id = ?").run(...vals);
  const row = db.prepare("SELECT * FROM customers WHERE id = ?").get(req.params.id);
  res.json({ success: true, data: rowToClient(row) });
});

// 删除
router.delete("/:id", function (req, res) {
  const exists = db.prepare("SELECT id FROM customers WHERE id = ?").get(req.params.id);
  if (!exists) return res.status(404).json({ success: false, error: "客户不存在" });
  db.prepare("DELETE FROM customers WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

module.exports = router;