/* ============================================================
 * 海贸智联 · 前端统一 API 请求层
 * ------------------------------------------------------------
 * 所有后端交互经此模块，统一错误处理 + 超时 + JSON 解析
 * 首次加载时自动检测并迁移 localStorage 历史数据
 * ============================================================ */

"use strict";

const HM_API = (function () {

  const BASE = "";  // 同源部署（后端 express.static 托管前端），无需跨域前缀
  const TIMEOUT = 15000;

  /** 核心请求函数 */
  async function request(method, url, body) {
    const opts = {
      method: method,
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(TIMEOUT)
    };
    if (body !== undefined && body !== null) {
      opts.body = JSON.stringify(body);
    }
    let resp;
    try {
      resp = await fetch(BASE + url, opts);
    } catch (e) {
      if (e.name === "TimeoutError") throw new Error("请求超时，请检查网络或后端服务");
      throw new Error("无法连接后端服务: " + (e.message || e));
    }
    let data;
    try {
      data = await resp.json();
    } catch (e) {
      throw new Error("后端返回格式异常 (HTTP " + resp.status + ")");
    }
    if (!resp.ok || data.success === false) {
      throw new Error(data.error || data.message || "请求失败 (HTTP " + resp.status + ")");
    }
    return data.data !== undefined ? data.data : data;
  }

  const get = function (url) { return request("GET", url); };
  const post = function (url, body) { return request("POST", url, body); };
  const put = function (url, body) { return request("PUT", url, body); };
  const del = function (url) { return request("DELETE", url); };

  // ---------- 客户 ----------
  const customers = {
    list: function (keyword) { return get("/api/customers" + (keyword ? "?keyword=" + encodeURIComponent(keyword) : "")); },
    get: function (id) { return get("/api/customers/" + id); },
    create: function (data) { return post("/api/customers", data); },
    update: function (id, data) { return put("/api/customers/" + id, data); },
    remove: function (id) { return del("/api/customers/" + id); }
  };

  // ---------- 订单 ----------
  const orders = {
    list: function () { return get("/api/orders"); },
    get: function (id) { return get("/api/orders/" + id); },
    create: function (data) { return post("/api/orders", data); },
    update: function (id, data) { return put("/api/orders/" + id, data); },
    remove: function (id) { return del("/api/orders/" + id); }
  };

  // ---------- 待办 ----------
  const todos = {
    list: function (done) {
      const q = (done === 0 || done === 1) ? "?done=" + done : "";
      return get("/api/todos" + q);
    },
    get: function (id) { return get("/api/todos/" + id); },
    create: function (data) { return post("/api/todos", data); },
    update: function (id, data) { return put("/api/todos/" + id, data); },
    remove: function (id) { return del("/api/todos/" + id); }
  };

  // ---------- 知识库 ----------
  const kb = {
    list: function (keyword) { return get("/api/kb" + (keyword ? "?keyword=" + encodeURIComponent(keyword) : "")); },
    get: function (id) { return get("/api/kb/" + id); },
    create: function (data) { return post("/api/kb", data); },
    update: function (id, data) { return put("/api/kb/" + id, data); },
    remove: function (id) { return del("/api/kb/" + id); }
  };

  // ---------- 审核记录 ----------
  const reviews = {
    list: function () { return get("/api/reviews"); },
    get: function (id) { return get("/api/reviews/" + id); },
    create: function (data) { return post("/api/reviews", data); },
    update: function (id, data) { return put("/api/reviews/" + id, data); },
    remove: function (id) { return del("/api/reviews/" + id); },
    addLog: function (id, data) { return post("/api/reviews/" + id + "/logs", data); }
  };

  // ---------- 迁移 ----------
  const migrate = {
    status: function () { return get("/api/migrate/status"); },
    run: function (data) { return post("/api/migrate", data); }
  };

  // ---------- AI（大模型请求超时放宽至 60 秒） ----------
  const AI_TIMEOUT = 60000;
  async function aiRequest(method, url, body) {
    const opts = {
      method: method,
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(AI_TIMEOUT)
    };
    if (body !== undefined && body !== null) opts.body = JSON.stringify(body);
    let resp;
    try {
      resp = await fetch(BASE + url, opts);
    } catch (e) {
      if (e.name === "TimeoutError") throw new Error("AI 响应超时，请稍后重试");
      throw new Error("无法连接 AI 服务: " + (e.message || e));
    }
    let data;
    try {
      data = await resp.json();
    } catch (e) {
      throw new Error("AI 服务返回格式异常 (HTTP " + resp.status + ")");
    }
    if (!resp.ok || data.success === false) {
      throw new Error(data.message || "AI 请求失败 (HTTP " + resp.status + ")");
    }
    return data;
  }

  const ai = {
    /** 健康检查（配置诊断，不消耗模型额度） */
    health: function () { return get("/api/ai/health"); },
    /** 真实连通性测试（消耗一次最小模型请求） */
    test: function () { return aiRequest("POST", "/api/ai/test"); },
    /** 统一模块化 AI 调用：module + task + context */
    ask: function (module, task, context) {
      return aiRequest("POST", "/api/ai", { module: module, task: task, context: context || {} });
    },
    /** 兼容旧接口：纯问答 */
    chat: function (message) {
      return aiRequest("POST", "/api/chat", { message: message });
    },
    /** Agent 意图识别 */
    intent: function (message) {
      return aiRequest("POST", "/api/agent/intent", { message: message });
    },
    /** Agent 任务拆解 */
    decompose: function (message, intent) {
      return aiRequest("POST", "/api/agent/decompose", { message: message, intent: intent });
    }
  };

  // ---------- localStorage 历史数据自动迁移 ----------
  const LS_KEYS = {
    customers: "haimao_customer_records_v1",
    orders: "haimao_order_records_v1",
    todos: "haimao_todo_records_v1",
    kb: "haimao_kb_entries_v1",
    reviews: "haimao_ai_review_records_v1"
  };
  const MIGRATE_FLAG = "haimao_migrated_to_server_v1";

  /** 读取 localStorage 中的历史数据并迁移到后端 */
  async function autoMigrate() {
    // 已迁移过则跳过
    if (localStorage.getItem(MIGRATE_FLAG)) return null;
    // 后端无数据 且 localStorage 有数据 → 触发迁移
    let status;
    try {
      status = await migrate.status();
    } catch (e) { return null; } // 后端不可用则跳过
    const hasServerData = status.customers > 0 || status.orders > 0 || status.todos > 0 || status.kb > 0 || status.reviews > 0;
    if (hasServerData) {
      localStorage.setItem(MIGRATE_FLAG, "1");
      return null;
    }
    // 收集 localStorage 数据
    const payload = {};
    let hasAny = false;
    Object.keys(LS_KEYS).forEach(function (mod) {
      try {
        const raw = localStorage.getItem(LS_KEYS[mod]);
        if (raw) {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr) && arr.length > 0) {
            payload[mod] = arr;
            hasAny = true;
          }
        }
      } catch (e) { /* 忽略损坏数据 */ }
    });
    if (!hasAny) {
      localStorage.setItem(MIGRATE_FLAG, "1");
      return null;
    }
    // 执行迁移
    const stats = await migrate.run(payload);
    localStorage.setItem(MIGRATE_FLAG, "1");
    console.log("[海贸智联] localStorage 数据已迁移至服务器:", stats);
    return stats;
  }

  return {
    request, get, post, put, del,
    customers, orders, todos, kb, reviews, migrate, ai,
    autoMigrate
  };
})();