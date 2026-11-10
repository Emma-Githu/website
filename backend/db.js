/* ============================================================
 * 海贸智联 · SQLite 数据库初始化模块
 * ------------------------------------------------------------
 * 使用 Node.js v22.5+ 内置 node:sqlite 模块（零原生依赖）
 * 创建 10 张业务表，统一关联字段：customer_id / order_id / agent_task_id
 * ============================================================ */

"use strict";

// 加载 node:sqlite（Node v22.5+ 内置，Node 22.x 需 --experimental-sqlite 标志）
let DatabaseSync;
try {
  ({ DatabaseSync } = require("node:sqlite"));
} catch (e) {
  console.error("============================================================");
  console.error("[db] node:sqlite 加载失败：" + e.message);
  console.error("[db] 需要 Node >= 22.5，且 Node 22.x 必须加 --experimental-sqlite 标志");
  console.error("[db] 当前 Node 版本：" + process.version);
  console.error("============================================================");
  process.exit(1);
}

const path = require("path");
const fs = require("fs");

// 数据库文件路径（backend/data/haimao.db）
const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
const DB_PATH = path.join(DATA_DIR, "haimao.db");

// 创建/打开数据库连接
const db = new DatabaseSync(DB_PATH);

// 开启 WAL 模式（提升并发读性能）+ 外键约束
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

// ---------- 建表语句（IF NOT EXISTS，支持重复启动） ----------
const CREATE_TABLES = `
-- 1. 客户表
CREATE TABLE IF NOT EXISTS customers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  company       TEXT DEFAULT '',
  country       TEXT DEFAULT '',
  website       TEXT DEFAULT '',
  source        TEXT DEFAULT '',
  level         TEXT DEFAULT '',
  status        TEXT DEFAULT '',
  tags          TEXT DEFAULT '[]',
  contact_name  TEXT DEFAULT '',
  contact_title TEXT DEFAULT '',
  email         TEXT DEFAULT '',
  phone         TEXT DEFAULT '',
  whatsapp      TEXT DEFAULT '',
  main_products TEXT DEFAULT '',
  interest_categories TEXT DEFAULT '',
  purchase_qty  TEXT DEFAULT '',
  target_price  TEXT DEFAULT '',
  currency      TEXT DEFAULT '',
  target_market TEXT DEFAULT '',
  payment_pref  TEXT DEFAULT '',
  trade_terms   TEXT DEFAULT '',
  comm_lang     TEXT DEFAULT '',
  email_tone    TEXT DEFAULT '',
  comm_habit    TEXT DEFAULT '',
  notes         TEXT DEFAULT '',
  records       TEXT DEFAULT '[]',
  memories      TEXT DEFAULT '[]',
  created_at    TEXT DEFAULT (datetime('now','localtime')),
  updated_at    TEXT DEFAULT (datetime('now','localtime'))
);

-- 2. 订单表
CREATE TABLE IF NOT EXISTS orders (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  no            TEXT NOT NULL,
  customer_id   INTEGER,
  customer_name TEXT DEFAULT '',
  amount        TEXT DEFAULT '',
  currency      TEXT DEFAULT 'USD',
  delivery_date TEXT DEFAULT '',
  status        TEXT DEFAULT '待确认',
  progress      INTEGER DEFAULT 0,
  source        TEXT DEFAULT 'manual',
  agent_task_id INTEGER,
  created_at    TEXT DEFAULT (datetime('now','localtime')),
  updated_at    TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

-- 3. 订单产品明细表
CREATE TABLE IF NOT EXISTS order_products (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id   INTEGER NOT NULL,
  sku        TEXT DEFAULT '',
  name       TEXT DEFAULT '',
  qty        TEXT DEFAULT '',
  unit_price TEXT DEFAULT '',
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

-- 4. 订单跟进记录表
CREATE TABLE IF NOT EXISTS order_records (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id   INTEGER NOT NULL,
  content    TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

-- 5. 待办表
CREATE TABLE IF NOT EXISTS todos (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  task         TEXT NOT NULL,
  owner        TEXT DEFAULT '',
  deadline     TEXT DEFAULT '',
  priority     TEXT DEFAULT '中',
  order_id     INTEGER,
  customer_id  INTEGER,
  done         INTEGER DEFAULT 0,
  source       TEXT DEFAULT 'manual',
  completed_at TEXT,
  created_at   TEXT DEFAULT (datetime('now','localtime')),
  updated_at   TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

-- 6. 知识库表
CREATE TABLE IF NOT EXISTS kb_entries (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  category   TEXT NOT NULL,
  tags       TEXT DEFAULT '[]',
  content    TEXT NOT NULL,
  source     TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 7. 审核记录表
CREATE TABLE IF NOT EXISTS reviews (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  no              TEXT NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  source_module   TEXT NOT NULL,
  result_type     TEXT DEFAULT '',
  content         TEXT DEFAULT '',
  structured_data TEXT DEFAULT '',
  action_type     TEXT DEFAULT '',
  target_module   TEXT DEFAULT '',
  customer_id     INTEGER,
  order_id        INTEGER,
  agent_task_id   INTEGER,
  status          TEXT DEFAULT '待审核',
  submit_time     TEXT DEFAULT '',
  logs            TEXT DEFAULT '[]',
  created_at      TEXT DEFAULT (datetime('now','localtime')),
  updated_at      TEXT DEFAULT (datetime('now','localtime'))
);

-- 8. 审核日志表
CREATE TABLE IF NOT EXISTS review_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  review_id  INTEGER NOT NULL,
  action     TEXT NOT NULL,
  reviewer   TEXT DEFAULT '',
  comment    TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE
);

-- 9. Agent 会话表
CREATE TABLE IF NOT EXISTS agent_sessions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT DEFAULT '新对话',
  status     TEXT DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);

-- 10. Agent 消息表
CREATE TABLE IF NOT EXISTS agent_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  role       TEXT NOT NULL,
  text       TEXT DEFAULT '',
  files      TEXT DEFAULT '[]',
  exec_steps TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE
);
`;

db.exec(CREATE_TABLES);

// ---------- 通用辅助函数 ----------

/** 将数据库行中的 JSON 文本字段解析为对象/数组 */
function parseJsonFields(row, fields) {
  if (!row) return row;
  const out = Object.assign({}, row);
  fields.forEach(function (f) {
    if (typeof out[f] === "string" && out[f] !== "") {
      try { out[f] = JSON.parse(out[f]); } catch (e) { out[f] = []; }
    } else if (out[f] === undefined || out[f] === "") {
      out[f] = Array.isArray(out[f]) ? out[f] : [];
    }
  });
  return out;
}

/** 将对象/数组字段序列化为 JSON 文本（供写入数据库） */
function stringifyJsonFields(obj, fields) {
  const out = Object.assign({}, obj);
  fields.forEach(function (f) {
    if (out[f] !== undefined && out[f] !== null && typeof out[f] === "object") {
      out[f] = JSON.stringify(out[f]);
    } else if (out[f] === undefined) {
      out[f] = "[]";
    }
  });
  return out;
}

/** 生成审核编号 RV-YYYYMMDD-XXXX */
function generateReviewNo(seq) {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return "RV-" + y + m + d + "-" + String(seq).padStart(4, "0");
}

module.exports = {
  db,
  DB_PATH,
  parseJsonFields,
  stringifyJsonFields,
  generateReviewNo
};