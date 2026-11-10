/* ============================================================
 * 知识库 CRUD 路由
 * GET    /api/kb              列表（支持 keyword 搜索）
 * GET    /api/kb/:id          详情
 * POST   /api/kb              新建
 * PUT    /api/kb/:id          更新
 * DELETE /api/kb/:id          删除
 * ============================================================ */

"use strict";

const express = require("express");
const { db, parseJsonFields, stringifyJsonFields } = require("../db");

const router = express.Router();

const JSON_FIELDS = ["tags"];

function rowToClient(row) {
  if (!row) return null;
  const r = parseJsonFields(row, JSON_FIELDS);
  return {
    id: r.id,
    title: r.title,
    category: r.category,
    tags: r.tags || [],
    content: r.content,
    source: r.source,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}

// 列表
router.get("/", function (req, res) {
  const kw = (req.query.keyword || "").trim();
  let rows;
  if (kw) {
    const like = "%" + kw + "%";
    rows = db.prepare(
      "SELECT * FROM kb_entries WHERE title LIKE ? OR content LIKE ? OR category LIKE ? ORDER BY id DESC"
    ).all(like, like, like);
  } else {
    rows = db.prepare("SELECT * FROM kb_entries ORDER BY id DESC").all();
  }
  res.json({ success: true, data: rows.map(rowToClient) });
});

// 详情
router.get("/:id", function (req, res) {
  const row = db.prepare("SELECT * FROM kb_entries WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ success: false, error: "知识条目不存在" });
  res.json({ success: true, data: rowToClient(row) });
});

// 新建
router.post("/", function (req, res) {
  const body = req.body || {};
  if (!body.title || !String(body.title).trim()) {
    return res.status(400).json({ success: false, error: "标题不能为空" });
  }
  if (!body.category || !String(body.category).trim()) {
    return res.status(400).json({ success: false, error: "分类不能为空" });
  }
  const f = stringifyJsonFields({
    title: String(body.title).trim(),
    category: String(body.category).trim(),
    tags: body.tags || [],
    content: String(body.content || ""),
    source: body.source || ""
  }, JSON_FIELDS);
  const info = db.prepare(
    "INSERT INTO kb_entries (title, category, tags, content, source) VALUES (?, ?, ?, ?, ?)"
  ).run(f.title, f.category, f.tags, f.content, f.source);
  const row = db.prepare("SELECT * FROM kb_entries WHERE id = ?").get(info.lastInsertRowid);
  res.json({ success: true, data: rowToClient(row) });
});

// 更新
router.put("/:id", function (req, res) {
  const exists = db.prepare("SELECT id FROM kb_entries WHERE id = ?").get(req.params.id);
  if (!exists) return res.status(404).json({ success: false, error: "知识条目不存在" });
  const body = req.body || {};
  const sets = [];
  const vals = [];
  if (body.title !== undefined) { sets.push("title = ?"); vals.push(String(body.title).trim()); }
  if (body.category !== undefined) { sets.push("category = ?"); vals.push(String(body.category).trim()); }
  if (body.tags !== undefined) { sets.push("tags = ?"); vals.push(JSON.stringify(body.tags || [])); }
  if (body.content !== undefined) { sets.push("content = ?"); vals.push(String(body.content)); }
  if (body.source !== undefined) { sets.push("source = ?"); vals.push(body.source); }
  if (sets.length > 0) {
    sets.push("updated_at = datetime('now','localtime')");
    vals.push(req.params.id);
    db.prepare("UPDATE kb_entries SET " + sets.join(", ") + " WHERE id = ?").run(...vals);
  }
  const row = db.prepare("SELECT * FROM kb_entries WHERE id = ?").get(req.params.id);
  res.json({ success: true, data: rowToClient(row) });
});

// 删除
router.delete("/:id", function (req, res) {
  const exists = db.prepare("SELECT id FROM kb_entries WHERE id = ?").get(req.params.id);
  if (!exists) return res.status(404).json({ success: false, error: "知识条目不存在" });
  db.prepare("DELETE FROM kb_entries WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

module.exports = router;