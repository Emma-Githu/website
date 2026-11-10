/**
 * 海贸智联 - 前端交互脚本
 * 职责：
 *   1. 竞赛评委演示登录（前端演示账号验证，非真实生产环境认证）
 *   2. 登录状态管理与访问权限控制（sessionStorage 保留当前标签页登录态，刷新免登录）
 *   3. 左侧导航菜单切换、顶部标题同步、首页功能模块卡片跳转
 * 说明：AI 能力为后续阶段接入，当前所有 AI 功能均标注「待接入真实模型」
 * 注意：演示账号密码集中配置在下方 DEMO_ACCOUNTS，正式部署必须替换为后端认证服务
 */

(function () {
  'use strict';

  /* ==================== 数据迁移：首次加载自动迁移 localStorage 到后端 ==================== */
  // 启动时立即发起迁移（仅首次执行，后续被标志位拦截），各模块 init 会 await 此 Promise
  var hmMigrateReady = HM_API.autoMigrate().catch(function (e) { console.error('数据迁移失败:', e); });

  /* ==================== 页面配置 ==================== */
  // 菜单标识 -> 顶部标题 + 页面区域 id
  var PAGE_MAP = {
    home:     { title: '首页',             pageId: 'page-home' },
    workspace:{ title: 'AI智能工作台',     pageId: 'page-workspace' },
    email:    { title: '邮件与询盘助手',   pageId: 'page-email' },
    parse:    { title: '订单智能解析',     pageId: 'page-parse' },
    order:    { title: '订单与待办管理',   pageId: 'page-order' },
    spec:     { title: '订单异常核对',     pageId: 'page-spec' },
    kb:       { title: '外贸知识库',       pageId: 'page-kb' },
    customer: { title: '客户档案与AI记忆', pageId: 'page-customer' },
    review:   { title: 'AI结果审核中心',   pageId: 'page-review' }
  };

  /* ==================== 竞赛演示账号配置 ==================== */
  // ⚠ 竞赛演示专用：账号密码集中配置于此，方便后续修改。
  //    这不是真实生产环境认证，正式部署时必须替换为后端认证服务。
  var DEMO_ACCOUNTS = [
    { username: 'judge', password: 'demo123',  user: { name: '评审评委',   role: 'reviewer' } },
    { username: 'admin', password: 'admin123', user: { name: '演示管理员', role: 'admin' } }
  ];

  /* ==================== DOM 引用 ==================== */
  var navLinks    = document.querySelectorAll('.nav-menu a[data-page]');
  var featureCards= document.querySelectorAll('.feature-card[data-page]');
  var pages       = document.querySelectorAll('.page');
  var topbarTitle = document.getElementById('topbar-title');

  var loginForm    = document.getElementById('login-form');
  var loginUsername= document.getElementById('login-username');
  var loginPassword= document.getElementById('login-password');
  var loginBtn     = document.getElementById('login-btn');
  var loginMsg     = document.getElementById('login-msg');
  var logoutBtn    = document.getElementById('logout-btn');
  var userNameEl   = document.getElementById('user-name');
  var userAvatarEl = document.getElementById('user-avatar');

  /* ==================== 登录状态管理（竞赛演示） ==================== */
  // 竞赛演示登录状态：使用 sessionStorage 保留当前浏览器标签页的登录态，
  // 刷新页面无需重新登录；关闭标签页后自动失效。
  // 注意：sessionStorage 仅用于演示便利，不构成真实安全认证。
  var SESSION_KEY = 'haimao_demo_session';
  var session = { loggedIn: false, user: null };

  /**
   * 竞赛演示登录验证（前端本地校验）
   * 仅用于竞赛评委演示，账号密码配置在上方 DEMO_ACCOUNTS 中。
   * 正式部署时必须替换为后端认证服务。
   * @param {string} username
   * @param {string} password
   * @returns {{success:boolean, user?:{name:string, role:string}, message?:string}}
   */
  function demoLogin(username, password) {
    for (var i = 0; i < DEMO_ACCOUNTS.length; i++) {
      var acc = DEMO_ACCOUNTS[i];
      if (acc.username === username && acc.password === password) {
        return { success: true, user: acc.user };
      }
    }
    return { success: false, message: '演示账号或密码错误，请核对后重试' };
  }

  /** 登录成功：建立演示会话，写入 sessionStorage，进入首页 */
  function setLoggedIn(user) {
    session.loggedIn = true;
    session.user = user || { name: '评审评委', role: 'reviewer' };
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session.user));
    } catch (e) { /* 隐私模式等场景忽略 */ }
    document.body.classList.add('logged-in');
    if (userNameEl)   userNameEl.textContent = session.user.name || '评审评委';
    if (userAvatarEl) userAvatarEl.textContent = (session.user.name || '评').charAt(0);
    switchTo('home');
  }

  /** 退出登录：清除演示会话与 sessionStorage，返回登录页 */
  function logout() {
    session.loggedIn = false;
    session.user = null;
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch (e) { /* 忽略 */ }
    document.body.classList.remove('logged-in');
    if (loginForm)    loginForm.reset();
    if (loginMsg)     loginMsg.textContent = '';
    if (loginPassword)loginPassword.value = '';
  }

  /* ==================== 页面切换（含访问权限控制） ==================== */
  /**
   * 切换到指定页面
   * @param {string} key - PAGE_MAP 中的页面标识
   */
  function switchTo(key) {
    // 访问权限控制：未登录状态下禁止切换任何业务页面
    if (!session.loggedIn) return;

    var config = PAGE_MAP[key];
    if (!config) return;

    // 1. 显示对应页面区域，隐藏其余页面
    for (var i = 0; i < pages.length; i++) {
      pages[i].classList.toggle('active', pages[i].id === config.pageId);
    }

    // 2. 同步顶部标题栏
    if (topbarTitle) {
      topbarTitle.textContent = config.title;
    }

    // 3. 更新左侧导航蓝色高亮
    for (var j = 0; j < navLinks.length; j++) {
      navLinks[j].classList.toggle('active', navLinks[j].getAttribute('data-page') === key);
    }

    // P10：页面切换时刷新跨模块联动数据
    if (key === 'home' && typeof hmRefreshStats === 'function') hmRefreshStats();
    if (key === 'spec' && typeof ckUpdateOrderSelect === 'function') ckUpdateOrderSelect();
  }

  /** P10：跨模块跳转知识库查询（带关键词自动搜索） */
  function hmSearchKb(keyword) {
    switchTo('kb');
    var kw = (keyword || '').trim();
    if (kw) {
      kbFilters.keyword = kw;
      if (kbEls.searchInput) kbEls.searchInput.value = kw;
    }
    kbRenderList();
  }

  /** P10：刷新首页业务数据概览（从各模块真实数据动态读取） */
  function hmRefreshStats() {
    var elOrders = document.getElementById('hm-stat-orders');
    var elOrdersTrend = document.getElementById('hm-stat-orders-trend');
    var elInq = document.getElementById('hm-stat-inquiries');
    var elInqTrend = document.getElementById('hm-stat-inquiries-trend');
    var elTodos = document.getElementById('hm-stat-todos');
    var elTodosTrend = document.getElementById('hm-stat-todos-trend');
    var elReviews = document.getElementById('hm-stat-reviews');
    var elReviewsTrend = document.getElementById('hm-stat-reviews-trend');
    if (!elOrders) return;

    // 进行中订单：状态非「已完成」且非「已取消」
    var activeOrders = odOrders.filter(function (o) {
      return o.status !== '已完成' && o.status !== '已取消';
    });
    elOrders.textContent = String(activeOrders.length);
    elOrdersTrend.textContent = '共 ' + odOrders.length + ' 笔订单在册';

    // 待跟进询盘：潜在客户数
    var potential = crmCustomers.filter(function (c) { return c.status === '潜在客户'; });
    elInq.textContent = String(potential.length);
    elInqTrend.textContent = '共 ' + crmCustomers.length + ' 个客户档案';

    // 今日待办：截止日期为今天且未完成
    var today = new Date();
    var todayStr = today.getFullYear() + '-' +
      (today.getMonth() + 1 < 10 ? '0' + (today.getMonth() + 1) : today.getMonth() + 1) + '-' +
      (today.getDate() < 10 ? '0' + today.getDate() : today.getDate());
    var todayTodos = odTodos.filter(function (t) {
      return !t.done && t.deadline === todayStr;
    });
    var overdue = odTodos.filter(function (t) { return odIsOverdue(t); });
    elTodos.textContent = String(todayTodos.length);
    elTodosTrend.textContent = overdue.length > 0
      ? '另有 ' + overdue.length + ' 条已逾期待办'
      : '共 ' + odTodos.length + ' 条待办在册';

    // 待审核结果：状态为「待审核」
    var pendingReviews = rvRecords.filter(function (r) { return r.status === '待审核'; });
    elReviews.textContent = String(pendingReviews.length);
    elReviewsTrend.textContent = '共 ' + rvRecords.length + ' 条审核记录';
  }

  /* ==================== 事件绑定 ==================== */

  // 登录表单提交：竞赛演示本地验证
  if (loginForm) {
    loginForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var username = loginUsername.value.trim();
      var password = loginPassword.value;

      if (!username || !password) {
        loginMsg.textContent = '请输入账号和密码';
        loginMsg.className = 'login-msg error';
        return;
      }

      loginBtn.disabled = true;
      loginMsg.textContent = '正在验证…';
      loginMsg.className = 'login-msg';

      // 竞赛演示本地验证（同步），正式部署时替换为后端认证服务
      var result = demoLogin(username, password);

      if (result.success) {
        loginMsg.textContent = '';
        setLoggedIn(result.user);
      } else {
        loginMsg.textContent = result.message || '演示账号或密码错误';
        loginMsg.className = 'login-msg error';
      }

      loginBtn.disabled = false;
      loginPassword.value = '';
    });
  }

  // 退出登录
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function () {
      logout();
    });
  }

  // 左侧导航菜单点击
  for (var n = 0; n < navLinks.length; n++) {
    navLinks[n].addEventListener('click', function (e) {
      e.preventDefault();
      switchTo(e.currentTarget.getAttribute('data-page'));
    });
  }

  // 首页功能入口卡片点击（跳转至对应功能页）
  for (var c = 0; c < featureCards.length; c++) {
    featureCards[c].addEventListener('click', function (e) {
      switchTo(e.currentTarget.getAttribute('data-page'));
    });
  }

  // 首页业务流程步骤点击（跳转至对应业务模块）
  var flowSteps = document.querySelectorAll('.flow-step[data-page]');
  for (var fs = 0; fs < flowSteps.length; fs++) {
    flowSteps[fs].addEventListener('click', function (e) {
      switchTo(e.currentTarget.getAttribute('data-page'));
    });
  }

  // 首页欢迎区快捷操作点击（事件委托：点击 .home-action-btn[data-page] 即跳转）
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.home-action-btn[data-page]');
    if (btn) {
      e.preventDefault();
      switchTo(btn.getAttribute('data-page'));
    }
  });

  /* ==================== AI智能工作台 ==================== */
  // 工作台数据仅保存在内存中：会话、消息、文件均为当前页面临时数据，刷新即清空。
  // 真实大模型 API、Agent 调度、RAG、文件解析暂不接入；发送消息后仅记录任务并给出明确提示。

  var WS_QUICK_TASKS = [
    { name: '分析客户询盘', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>', text: '请帮我分析以下客户询盘，提取客户需求、目标产品、采购数量与交期要求：\n\n（请粘贴询盘内容）' },
    { name: '撰写商务邮件', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>', text: '请帮我撰写一封英文商务邮件，向客户介绍我司产品并回复询盘：\n\n（请补充客户与产品背景）' },
    { name: '解析订单文件', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><circle cx="11" cy="15" r="2.5"/><path d="M13 17l2 2"/></svg>', text: '请解析我上传的订单文件，提取订单号、产品明细、数量、单价与交期信息。' },
    { name: '核对技术规格', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="14" r="5.5"/><path d="M14.5 9.5L20 4"/><path d="M17 4h3v3"/><path d="M8 14l1.5 1.5L12 13"/></svg>', text: '请帮我核对以下技术规格参数，检查是否存在遗漏、矛盾或不一致：\n\n（请粘贴规格参数）' },
    { name: '查询外贸知识', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19a2 2 0 0 1 2-2h13"/><path d="M9 7h6M9 11h4"/></svg>', text: '请查询以下外贸知识点，提供实务操作指引与注意事项：\n\n（请输入查询主题）' },
    { name: '生成跟单任务', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="M9 10h6M9 14h6M9 18h3"/></svg>', text: '请根据以下订单信息，生成跟单待办任务清单与关键时间节点：\n\n（请补充订单信息）' }
  ];

  // Agent 执行阶段定义（预留：真实模型接入后由后端返回各阶段实际执行结果）
  var WS_EXEC_STEPS = [
    { name: '意图识别', desc: '解析用户输入，识别业务意图与关键实体' },
    { name: '任务拆解', desc: '将意图拆解为可执行的子任务序列' },
    { name: '工具调用', desc: '调度邮件、解析、规格核对等业务模块' },
    { name: '执行状态', desc: '汇总各子任务执行结果，等待人工审核' }
  ];

  var ws = {
    sessions: [],    // 会话列表 { id, title, messages, createdAt }
    currentId: null, // 当前会话 id
    files: [],       // 已选择待发送文件 { name, size, sizeText, ext }
    seq: 0           // 会话自增 id
  };

  var wsEls = {
    newChat:     document.getElementById('ws-new-chat'),
    sessionList: document.getElementById('ws-session-list'),
    sessionEmpty:document.getElementById('ws-session-empty'),
    chat:        document.getElementById('ws-chat'),
    welcome:     document.getElementById('ws-welcome'),
    messages:    document.getElementById('ws-messages'),
    quickGrid:   document.getElementById('ws-quick-grid'),
    input:       document.getElementById('ws-input'),
    sendBtn:     document.getElementById('ws-send-btn'),
    fileBtn:     document.getElementById('ws-file-btn'),
    fileInput:   document.getElementById('ws-file-input'),
    files:       document.getElementById('ws-files'),
    currentTask: document.getElementById('ws-current-task'),
    execEmpty:   document.getElementById('ws-exec-empty'),
    execSteps:   document.getElementById('ws-exec-steps')
  };

  /** 补零格式化时间 HH:MM */
  function wsFormatTime(d) {
    function p(n) { return n < 10 ? '0' + n : '' + n; }
    return p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /** 文件大小格式化 */
  function wsFormatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  }

  /** 提取文件扩展名（小写） */
  function wsGetExt(name) {
    var idx = name.lastIndexOf('.');
    return idx === -1 ? '' : name.slice(idx + 1).toLowerCase();
  }

  /** 获取当前会话对象 */
  function wsGetCurrent() {
    for (var i = 0; i < ws.sessions.length; i++) {
      if (ws.sessions[i].id === ws.currentId) return ws.sessions[i];
    }
    return null;
  }

  /** 新建对话 */
  function wsNewSession() {
    var s = { id: ++ws.seq, title: '新对话', messages: [], createdAt: new Date() };
    ws.sessions.unshift(s);
    ws.currentId = s.id;
    wsRenderSessions();
    wsRenderChat();
    wsEls.input.focus();
  }

  /** 渲染左侧会话列表 */
  function wsRenderSessions() {
    wsEls.sessionList.innerHTML = '';
    if (ws.sessions.length === 0) {
      wsEls.sessionEmpty.style.display = '';
      return;
    }
    wsEls.sessionEmpty.style.display = 'none';
    ws.sessions.forEach(function (s) {
      var item = document.createElement('div');
      item.className = 'ws-session-item' + (s.id === ws.currentId ? ' active' : '');
      item.setAttribute('data-id', s.id);
      var info = document.createElement('div');
      info.className = 'ws-session-info';
      var title = document.createElement('div');
      title.className = 'ws-session-title';
      title.textContent = s.title;
      var meta = document.createElement('div');
      meta.className = 'ws-session-meta';
      meta.textContent = wsFormatTime(s.createdAt) + ' · ' + s.messages.length + ' 条消息';
      info.appendChild(title);
      info.appendChild(meta);
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'ws-session-del';
      del.title = '删除对话';
      del.setAttribute('data-id', s.id);
      del.innerHTML = '&#10005;';
      item.appendChild(info);
      item.appendChild(del);
      wsEls.sessionList.appendChild(item);
    });
  }

  /** 切换会话 */
  function wsSwitchSession(id) {
    if (ws.currentId === id) return;
    ws.currentId = id;
    wsRenderSessions();
    wsRenderChat();
  }

  /** 删除会话 */
  function wsDeleteSession(id) {
    ws.sessions = ws.sessions.filter(function (s) { return s.id !== id; });
    if (ws.currentId === id) {
      ws.currentId = ws.sessions.length > 0 ? ws.sessions[0].id : null;
    }
    wsRenderSessions();
    wsRenderChat();
  }

  /** 渲染聊天区：无消息显示欢迎区，有消息显示消息列表 */
  function wsRenderChat() {
    var s = wsGetCurrent();
    if (!s || s.messages.length === 0) {
      wsEls.welcome.style.display = '';
      wsEls.messages.style.display = 'none';
      wsEls.messages.innerHTML = '';
      wsUpdateCurrentTask(null);
      wsRenderExecRecord(null);
      return;
    }
    wsEls.welcome.style.display = 'none';
    wsEls.messages.style.display = '';
    wsEls.messages.innerHTML = '';
    s.messages.forEach(function (m) {
      wsEls.messages.appendChild(wsBuildMessage(m));
    });
    wsEls.chat.scrollTop = wsEls.chat.scrollHeight;
    wsUpdateCurrentTask(s);
    wsRenderExecRecord(s);
  }

  /** 构建单条消息 DOM（用户消息蓝色气泡，AI 提示消息黄色提示气泡） */
  function wsBuildMessage(m) {
    var wrap = document.createElement('div');
    wrap.className = 'ws-msg ' + (m.role === 'user' ? 'ws-msg-user' : 'ws-msg-ai');
    var avatar = document.createElement('div');
    avatar.className = 'ws-msg-avatar';
    avatar.innerHTML = m.role === 'user' ? '&#128100;' : '&#129302;';
    var content = document.createElement('div');
    content.className = 'ws-msg-content';
    var bubble = document.createElement('div');
    bubble.className = 'ws-msg-bubble';
    // 去除 Markdown 加粗符号 **
    var displayText = (m.text || '').replace(/\*\*/g, '');
    if (m.role === 'user') {
      var text = document.createElement('div');
      text.className = 'ws-msg-text';
      text.textContent = displayText;
      bubble.appendChild(text);
      if (m.files && m.files.length > 0) {
        var fl = document.createElement('div');
        fl.className = 'ws-msg-files';
        m.files.forEach(function (f) {
          var chip = document.createElement('span');
          chip.className = 'ws-file-chip';
          chip.textContent = f.ext.toUpperCase() + ' · ' + f.name + '（' + f.sizeText + '）';
          fl.appendChild(chip);
        });
        bubble.appendChild(fl);
      }
    } else {
      // AI 消息：根据 type 区分样式
      if (m.type === 'answer') {
        // 真实 AI 回答：白色气泡，支持换行
        bubble.classList.add('ws-msg-answer');
        bubble.style.whiteSpace = 'pre-wrap';
        bubble.textContent = displayText;
      } else if (m.type === 'loading') {
        bubble.classList.add('ws-msg-loading');
        bubble.textContent = displayText;
      } else if (m.type === 'error') {
        bubble.classList.add('ws-msg-error');
        bubble.textContent = displayText;
      } else {
        bubble.classList.add('ws-msg-notice');
        bubble.textContent = displayText;
      }
    }
    var time = document.createElement('div');
    time.className = 'ws-msg-time';
    time.textContent = wsFormatTime(m.time);
    content.appendChild(bubble);
    content.appendChild(time);
    wrap.appendChild(avatar);
    wrap.appendChild(content);
    return wrap;
  }

  /** 更新右侧"当前任务"说明 */
  function wsUpdateCurrentTask(s) {
    if (!s || s.messages.length === 0) {
      wsEls.currentTask.textContent = '暂无进行中的任务。发送消息后，任务说明将显示在此处。';
      return;
    }
    var lastUser = null;
    for (var i = s.messages.length - 1; i >= 0; i--) {
      if (s.messages[i].role === 'user') { lastUser = s.messages[i]; break; }
    }
    if (lastUser) {
      var brief = lastUser.text.length > 40 ? lastUser.text.slice(0, 40) + '…' : lastUser.text;
      wsEls.currentTask.textContent = '当前会话：' + brief;
    }
  }

  /**
   * 渲染任务执行记录（真实 Agent 执行链路）
   * 无任务时显示空状态；有任务时展示 4 个阶段的真实执行状态。
   */
  var WS_EXEC_STATUS_TEXT = { pending: '待执行', running: '执行中', done: '已完成', error: '失败' };
  var WS_EXEC_STATUS_CLASS = {
    pending: 'ws-exec-badge',
    running: 'ws-exec-badge ws-exec-running',
    done:    'ws-exec-badge ws-exec-done',
    error:   'ws-exec-badge ws-exec-error'
  };

  function wsRenderExecRecord(s) {
    if (!wsEls.execSteps) return;
    wsEls.execSteps.innerHTML = '';
    var hasTask = s && s.messages.length > 0;
    wsEls.execEmpty.style.display = hasTask ? 'none' : '';
    wsEls.execSteps.style.display = hasTask ? '' : 'none';
    if (!hasTask) return;

    // 取当前会话首条用户消息时间作为任务发起时间
    var startTime = null;
    for (var i = 0; i < s.messages.length; i++) {
      if (s.messages[i].role === 'user') { startTime = s.messages[i].time; break; }
    }

    // 使用会话中存储的真实执行步骤，无则用默认待执行状态
    var steps = s.execSteps || WS_EXEC_STEPS.map(function (step) {
      return { name: step.name, desc: step.desc, status: 'pending', detail: '' };
    });

    steps.forEach(function (step, idx) {
      var st = step.status || 'pending';
      var item = document.createElement('div');
      item.className = 'ws-exec-step';

      var dot = document.createElement('span');
      dot.className = 'ws-exec-dot' + (st === 'done' ? ' ws-exec-dot-done' : st === 'error' ? ' ws-exec-dot-error' : st === 'running' ? ' ws-exec-dot-running' : '');
      dot.textContent = st === 'done' ? '\u2713' : st === 'error' ? '\u2717' : (idx + 1);

      var body = document.createElement('div');
      body.className = 'ws-exec-body';

      var head = document.createElement('div');
      head.className = 'ws-exec-head';
      var name = document.createElement('span');
      name.className = 'ws-exec-name';
      name.textContent = step.name;
      var badge = document.createElement('span');
      badge.className = WS_EXEC_STATUS_CLASS[st] || WS_EXEC_STATUS_CLASS.pending;
      badge.textContent = WS_EXEC_STATUS_TEXT[st] || '待执行';
      head.appendChild(name);
      head.appendChild(badge);

      var desc = document.createElement('p');
      desc.className = 'ws-exec-desc';
      desc.textContent = step.detail || step.desc;

      var time = document.createElement('span');
      time.className = 'ws-exec-time';
      time.textContent = startTime ? '发起于 ' + wsFormatTime(startTime) : '';

      body.appendChild(head);
      body.appendChild(desc);
      body.appendChild(time);
      item.appendChild(dot);
      item.appendChild(body);
      wsEls.execSteps.appendChild(item);
    });
  }

  /** 发送消息（真实 AI 对话：意图识别 → 模块调度 → 返回结果） */
  async function wsSend() {
    var text = wsEls.input.value.trim();
    if (!text && ws.files.length === 0) return;
    var s = wsGetCurrent();
    if (!s) {
      wsNewSession();
      s = wsGetCurrent();
    }
    s.messages.push({
      role: 'user',
      text: text || '（仅文件，无文字描述）',
      files: ws.files.slice(),
      time: new Date()
    });
    if (s.title === '新对话' && text) {
      s.title = text.length > 16 ? text.slice(0, 16) + '…' : text;
    }
    // 插入 AI 加载中消息
    var loadingMsg = { role: 'ai', type: 'loading', text: 'AI 正在思考中，请稍候…', time: new Date() };
    s.messages.push(loadingMsg);
    ws.files = [];
    wsRenderFiles();
    wsEls.input.value = '';
    wsAutoResize();
    wsRenderSessions();
    wsRenderChat();

    // 初始化执行步骤状态
    s.execSteps = WS_EXEC_STEPS.map(function (step) {
      return { name: step.name, desc: step.desc, status: 'pending', detail: '' };
    });
    wsRenderExecRecord(s);

    try {
      // 阶段一：意图识别
      s.execSteps[0].status = 'running';
      wsRenderExecRecord(s);
      var targetModule = 'workspace';
      var intentLabel = '通用咨询';
      try {
        var intentResp = await HM_API.ai.intent(text);
        if (intentResp && intentResp.intent) {
          targetModule = intentResp.intent.targetModule || 'workspace';
          intentLabel = intentResp.intent.intent || '通用咨询';
        }
        s.execSteps[0].status = 'done';
        s.execSteps[0].detail = '意图：' + intentLabel + ' → 调度模块：' + targetModule;
      } catch (ie) {
        s.execSteps[0].status = 'done';
        s.execSteps[0].detail = '意图识别降级为通用工作台（' + (ie.message || '异常') + '）';
      }
      wsRenderExecRecord(s);

      // 阶段二：任务拆解（单任务直接执行）
      s.execSteps[1].status = 'done';
      s.execSteps[1].detail = '单任务直接调度执行';
      wsRenderExecRecord(s);

      // 阶段三：模块调用
      s.execSteps[2].status = 'running';
      s.execSteps[2].detail = '正在调用「' + targetModule + '」模块…';
      wsRenderExecRecord(s);

      var aiResp = await HM_API.ai.ask(targetModule, 'chat', { message: text });

      s.execSteps[2].status = 'done';
      s.execSteps[2].detail = '模块「' + targetModule + '」执行完成';
      s.execSteps[3].status = 'done';
      s.execSteps[3].detail = 'AI 结果已生成';
      wsRenderExecRecord(s);

      // 替换加载中消息为真实回答
      loadingMsg.type = 'answer';
      loadingMsg.text = aiResp.answer || '（AI 未返回内容）';
      loadingMsg.time = new Date();
      wsRenderChat();
    } catch (error) {
      loadingMsg.type = 'error';
      loadingMsg.text = 'AI 处理失败：' + (error.message || '未知错误') + '。请检查后端 AI 配置或稍后重试。';
      loadingMsg.time = new Date();
      s.execSteps.forEach(function (step) {
        if (step.status === 'running' || step.status === 'pending') {
          step.status = 'error';
          step.detail = step.detail || '执行中断';
        }
      });
      wsRenderExecRecord(s);
      wsRenderChat();
    }
  }

  /** 处理文件选择（仅接受 PDF / Excel） */
  function wsHandleFiles(fileList) {
    var allowed = ['pdf', 'xlsx', 'xls', 'csv'];
    for (var i = 0; i < fileList.length; i++) {
      var f = fileList[i];
      var ext = wsGetExt(f.name);
      if (allowed.indexOf(ext) === -1) continue;
      ws.files.push({ name: f.name, size: f.size, sizeText: wsFormatSize(f.size), ext: ext });
    }
    wsRenderFiles();
    wsEls.fileInput.value = '';
  }

  /** 渲染已选文件列表（显示格式、名称、大小，支持单个移除） */
  function wsRenderFiles() {
    wsEls.files.innerHTML = '';
    if (ws.files.length === 0) {
      wsEls.files.style.display = 'none';
      return;
    }
    wsEls.files.style.display = '';
    ws.files.forEach(function (f, idx) {
      var item = document.createElement('div');
      item.className = 'ws-file-item';
      var ext = document.createElement('span');
      ext.className = 'ws-file-ext';
      ext.textContent = f.ext.toUpperCase();
      var name = document.createElement('span');
      name.className = 'ws-file-name';
      name.textContent = f.name;
      name.title = f.name;
      var size = document.createElement('span');
      size.className = 'ws-file-size';
      size.textContent = f.sizeText;
      var rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'ws-file-remove';
      rm.title = '移除文件';
      rm.setAttribute('data-idx', idx);
      rm.innerHTML = '&#10005;';
      item.appendChild(ext);
      item.appendChild(name);
      item.appendChild(size);
      item.appendChild(rm);
      wsEls.files.appendChild(item);
    });
  }

  /** 渲染快捷任务卡片 */
  function wsRenderQuickTasks() {
    wsEls.quickGrid.innerHTML = '';
    WS_QUICK_TASKS.forEach(function (t, idx) {
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'ws-quick-card';
      card.setAttribute('data-idx', idx);
      card.innerHTML = '<span class="ws-quick-icon">' + t.icon + '</span><span class="ws-quick-name"></span>';
      card.querySelector('.ws-quick-name').textContent = t.name;
      wsEls.quickGrid.appendChild(card);
    });
  }

  /** 输入框高度自适应（最高 120px） */
  function wsAutoResize() {
    wsEls.input.style.height = 'auto';
    wsEls.input.style.height = Math.min(wsEls.input.scrollHeight, 120) + 'px';
  }

  /** 工作台初始化：绑定事件 + 首次渲染 */
  function wsInit() {
    if (!wsEls.chat) return; // 工作台元素不存在时跳过
    wsRenderQuickTasks();
    wsRenderSessions();
    wsRenderChat();
    wsRenderFiles();

    wsEls.newChat.addEventListener('click', wsNewSession);
    wsEls.sendBtn.addEventListener('click', wsSend);
    wsEls.fileBtn.addEventListener('click', function () { wsEls.fileInput.click(); });
    wsEls.fileInput.addEventListener('change', function () { wsHandleFiles(this.files); });
    wsEls.input.addEventListener('input', wsAutoResize);
    wsEls.input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); wsSend(); }
    });

    // 会话列表事件委托：删除 / 切换
    wsEls.sessionList.addEventListener('click', function (e) {
      var del = e.target.closest('.ws-session-del');
      if (del) {
        e.stopPropagation();
        wsDeleteSession(parseInt(del.getAttribute('data-id'), 10));
        return;
      }
      var item = e.target.closest('.ws-session-item');
      if (item) wsSwitchSession(parseInt(item.getAttribute('data-id'), 10));
    });

    // 快捷任务点击：填充输入框并聚焦
    wsEls.quickGrid.addEventListener('click', function (e) {
      var card = e.target.closest('.ws-quick-card');
      if (!card) return;
      var t = WS_QUICK_TASKS[parseInt(card.getAttribute('data-idx'), 10)];
      wsEls.input.value = t.text;
      wsAutoResize();
      wsEls.input.focus();
    });

    // 已选文件移除（事件委托）
    wsEls.files.addEventListener('click', function (e) {
      var rm = e.target.closest('.ws-file-remove');
      if (rm) {
        ws.files.splice(parseInt(rm.getAttribute('data-idx'), 10), 1);
        wsRenderFiles();
      }
    });
  }

  wsInit();

  /* ==================== 邮件与询盘助手 ==================== */
  // 邮件助手为纯前端交互：表单选择与文本编辑完全可用；
  // 生成/润色/改写/翻译等大模型操作在接口未接入时明确提示，不伪造 AI 结果。

  var emEls = {
    inquiry:    document.getElementById('em-inquiry'),
    type:       document.getElementById('em-type'),
    lang:       document.getElementById('em-lang'),
    tone:       document.getElementById('em-tone'),
    context:    document.getElementById('em-context'),
    subject:    document.getElementById('em-subject'),
    body:       document.getElementById('em-body'),
    generate:   document.getElementById('em-generate'),
    polish:     document.getElementById('em-polish'),
    rewrite:    document.getElementById('em-rewrite'),
    translateEn:document.getElementById('em-translate-en'),
    translateZh:document.getElementById('em-translate-zh'),
    copy:       document.getElementById('em-copy'),
    clear:      document.getElementById('em-clear'),
    status:     document.getElementById('em-status'),
    kbBtn:      document.getElementById('em-kb-btn'), // P10：查询知识库
    reviewBtn:  document.getElementById('em-review-btn') // P10：提交审核
  };

  var emStatusTimer = null;

  /** 显示状态提示（3 秒后自动隐藏） */
  function emShowStatus(msg, type) {
    if (!emEls.status) return;
    emEls.status.textContent = msg;
    emEls.status.className = 'em-status ' + (type || 'notice');
    if (emStatusTimer) clearTimeout(emStatusTimer);
    emStatusTimer = setTimeout(function () {
      emEls.status.className = 'em-status';
    }, 3000);
  }

  /** AI 邮件操作（真实调用智谱 GLM，按 task 区分生成/润色/改写/翻译） */
  var emAiBusy = false;
  async function emHandleAIAction(actionName, task) {
    if (emAiBusy) { emShowStatus('AI 正在处理中，请等待当前操作完成。', 'notice'); return; }

    var typeMap = { 'inquiry-reply': '询盘回复', 'quotation': '报价邮件', 'order-followup': '订单跟进', 'aftersales': '售后邮件' };
    var langMap = { zh: '中文', en: '英文', ja: '日语', ko: '韩语', de: '德语', fr: '法语', es: '西班牙语', ru: '俄语', ar: '阿拉伯语' };
    var toneMap = { formal: '正式专业', friendly: '友好礼貌', concise: '简洁直接' };

    var inquiry = emEls.inquiry.value.trim();
    var body = emEls.body.value.trim();
    var subject = emEls.subject.value.trim();

    // 按任务类型校验必要输入
    if (task === 'generate' && !inquiry) {
      emShowStatus('请先粘贴客户原始询盘内容，再生成邮件。', 'error');
      return;
    }
    if ((task === 'polish' || task === 'rewrite') && !body) {
      emShowStatus('邮件正文为空，请先输入或生成内容。', 'error');
      return;
    }
    if (task === 'translate_en' && !body) {
      emShowStatus('邮件正文为空，请先输入需要翻译的内容。', 'error');
      return;
    }
    if (task === 'translate_zh' && !body) {
      emShowStatus('邮件正文为空，请先输入需要翻译的内容。', 'error');
      return;
    }

    // 构造上下文
    var context = {
      message: task === 'generate' ? inquiry : body,
      emailType: typeMap[emEls.type.value] || emEls.type.value,
      targetLang: langMap[emEls.lang.value] || emEls.lang.value,
      tone: toneMap[emEls.tone.value] || emEls.tone.value,
      background: emEls.context.value.trim() || '无'
    };
    if (task === 'generate') {
      context.outputFormat = '请按以下格式输出：第一行为【主题】邮件主题，换行后为【正文】邮件正文。不要输出其他说明文字。';
    } else if (task === 'translate_en') {
      context.message = (subject ? '主题：' + subject + '\n' : '') + body;
      context.outputFormat = '请将内容翻译为英文。如包含主题行，请保持【主题】格式，换行后为正文。';
    } else if (task === 'translate_zh') {
      context.message = (subject ? '主题：' + subject + '\n' : '') + body;
      context.outputFormat = '请将内容翻译为中文。如包含主题行，请保持【主题】格式，换行后为正文。';
    }

    // 禁用按钮，显示处理中
    emAiBusy = true;
    emShowStatus(actionName + '：AI 正在处理中，请稍候…', 'notice');

    try {
      var resp = await HM_API.ai.ask('email', task, context);
      var answer = (resp && resp.answer) ? resp.answer : '';

      // 解析【主题】和【正文】
      var subjectMatch = answer.match(/【主题】\s*(.+)/);
      var bodyMatch = answer.match(/【正文】\s*([\s\S]*)/);
      if (subjectMatch) {
        emEls.subject.value = subjectMatch[1].trim();
        emEls.body.value = bodyMatch ? bodyMatch[1].trim() : '';
      } else {
        // 无主题标记时，整体填入正文
        emEls.body.value = answer.trim();
      }
      emShowStatus(actionName + ' 完成，请核对内容。', 'success');
    } catch (error) {
      emShowStatus(actionName + ' 失败：' + (error.message || '未知错误'), 'error');
    } finally {
      emAiBusy = false;
    }
  }

  /** 复制降级方案（旧浏览器或不支持 Clipboard API 时） */
  function emFallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      emShowStatus('邮件内容已复制到剪贴板。', 'success');
    } catch (e) {
      emShowStatus('复制失败，请手动选择文本复制。', 'error');
    }
    document.body.removeChild(ta);
  }

  /** 复制当前邮件主题与正文到剪贴板 */
  function emCopy() {
    var subject = emEls.subject.value.trim();
    var body = emEls.body.value.trim();
    if (!subject && !body) {
      emShowStatus('邮件主题与正文均为空，无内容可复制。', 'error');
      return;
    }
    var text = subject ? '主题：' + subject + '\n\n' + body : body;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        emShowStatus('邮件内容已复制到剪贴板。', 'success');
      }).catch(function () {
        emFallbackCopy(text);
      });
    } else {
      emFallbackCopy(text);
    }
  }

  /** 清空邮件主题与正文 */
  function emClear() {
    emEls.subject.value = '';
    emEls.body.value = '';
    emShowStatus('邮件主题与正文已清空。', 'success');
  }

  /** 邮件助手初始化：绑定事件 */
  function emInit() {
    if (!emEls.subject) return; // 邮件页元素不存在时跳过
    emEls.generate.addEventListener('click', function () { emHandleAIAction('生成商务邮件', 'generate'); });
    emEls.polish.addEventListener('click', function () { emHandleAIAction('邮件润色', 'polish'); });
    emEls.rewrite.addEventListener('click', function () { emHandleAIAction('邮件改写', 'rewrite'); });
    emEls.translateEn.addEventListener('click', function () { emHandleAIAction('中译英', 'translate_en'); });
    emEls.translateZh.addEventListener('click', function () { emHandleAIAction('英译中', 'translate_zh'); });
    emEls.copy.addEventListener('click', emCopy);
    emEls.clear.addEventListener('click', emClear);
    // P10：跨模块查询知识库（以邮件类型为关键词）
    if (emEls.kbBtn) {
      emEls.kbBtn.addEventListener('click', function () {
        var typeMap = { 'inquiry-reply': '询盘', 'quotation': '报价', 'order-followup': '订单跟进', 'aftersales': '售后' };
        hmSearchKb(typeMap[emEls.type.value] || '');
      });
    }
    // P10：将邮件内容提交至 P9 审核中心（仅提交真实内容，空内容明确提示）
    if (emEls.reviewBtn) {
      emEls.reviewBtn.addEventListener('click', function () {
        var subject = emEls.subject.value.trim();
        var body = emEls.body.value.trim();
        if (!subject && !body) {
          emShowStatus('邮件主题与正文均为空，无内容可提交审核。', 'error');
          return;
        }
        var rec = window.haimaoSubmitReview({
          title: subject || '商务邮件（无主题）',
          sourceModule: '邮件与询盘助手',
          resultType: '商务邮件',
          content: (subject ? '主题：' + subject + '\n\n' : '') + body,
          structuredData: JSON.stringify({
            type: emEls.type.value,
            lang: emEls.lang.value,
            tone: emEls.tone.value,
            subject: subject,
            bodyLength: body.length
          })
        });
        if (rec) {
          emShowStatus('邮件已提交至审核中心，任务编号 ' + rec.no + '。', 'success');
        } else {
          emShowStatus('提交审核失败，请检查内容后重试。', 'error');
        }
      });
    }
  }

  emInit();

  /* ==================== 订单智能解析 ==================== */
  // 文件上传、格式校验、列表管理为真实前端交互；
  // AI 解析已接入（parse 模块 · 智谱 GLM），从粘贴的订单原文提取结构化字段。

  var opEls = {
    dropzone:  document.getElementById('op-dropzone'),
    fileInput: document.getElementById('op-file-input'),
    fileList:  document.getElementById('op-file-list'),
    parseBtn:  document.getElementById('op-parse-btn'),
    clearBtn:  document.getElementById('op-clear-btn'),
    exportBtn: document.getElementById('op-export-btn'),
    status:    document.getElementById('op-status'),
    tableWrap: document.getElementById('op-table-wrap'),
    tableBody: document.getElementById('op-table-body'),
    empty:     document.getElementById('op-empty'),
    statFiles: document.getElementById('op-stat-files'),
    statStatus:document.getElementById('op-stat-status'),
    statFields:document.getElementById('op-stat-fields'),
    statExcep: document.getElementById('op-stat-exceptions'),
    transferBtn: document.getElementById('op-transfer-btn'), // P10：转入订单管理
    reviewBtn:   document.getElementById('op-review-btn'),   // P10：提交审核
    orderText:   document.getElementById('op-order-text')    // AI 文本解析输入
  };

  var opFiles = []; // 已选择文件 { name, size, sizeText, ext }
  var opResults = []; // P10：解析结果（解析服务接入后填充，用于转入订单/提交审核）
  var opStatusTimer = null;
  var OP_ALLOWED = ['pdf', 'xlsx', 'xls', 'csv'];

  /** 显示状态提示（3 秒后自动隐藏） */
  function opShowStatus(msg, type) {
    if (!opEls.status) return;
    opEls.status.textContent = msg;
    opEls.status.className = 'em-status ' + (type || 'notice');
    if (opStatusTimer) clearTimeout(opStatusTimer);
    opStatusTimer = setTimeout(function () {
      opEls.status.className = 'em-status';
    }, 3000);
  }

  /** 文件大小格式化 */
  function opFormatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  }

  /** 提取文件扩展名（小写） */
  function opGetExt(name) {
    var idx = name.lastIndexOf('.');
    return idx === -1 ? '' : name.slice(idx + 1).toLowerCase();
  }

  /** 处理文件选择：校验格式，仅接受 PDF/Excel/CSV */
  function opHandleFiles(fileList) {
    var rejected = [];
    for (var i = 0; i < fileList.length; i++) {
      var f = fileList[i];
      var ext = opGetExt(f.name);
      if (OP_ALLOWED.indexOf(ext) === -1) {
        rejected.push(f.name);
        continue;
      }
      opFiles.push({ name: f.name, size: f.size, sizeText: opFormatSize(f.size), ext: ext });
    }
    opRenderFiles();
    opUpdateStats();
    opEls.fileInput.value = '';
    if (rejected.length > 0) {
      opShowStatus('以下文件格式不支持，已忽略：' + rejected.join('、') + '（仅支持 PDF、XLSX、XLS、CSV）', 'error');
    } else if (fileList.length > 0) {
      opShowStatus('已添加 ' + fileList.length + ' 个文件。', 'success');
    }
  }

  /** 渲染文件列表 */
  function opRenderFiles() {
    opEls.fileList.innerHTML = '';
    if (opFiles.length === 0) return;
    opFiles.forEach(function (f, idx) {
      var item = document.createElement('div');
      item.className = 'op-file-item';
      var ext = document.createElement('span');
      ext.className = 'op-file-ext';
      ext.textContent = f.ext.toUpperCase();
      var info = document.createElement('div');
      info.className = 'op-file-info';
      var name = document.createElement('div');
      name.className = 'op-file-name';
      name.textContent = f.name;
      name.title = f.name;
      var meta = document.createElement('div');
      meta.className = 'op-file-meta';
      meta.textContent = f.sizeText;
      info.appendChild(name);
      info.appendChild(meta);
      var rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'op-file-remove';
      rm.title = '移除文件';
      rm.setAttribute('data-idx', idx);
      rm.innerHTML = '&#10005;';
      item.appendChild(ext);
      item.appendChild(info);
      item.appendChild(rm);
      opEls.fileList.appendChild(item);
    });
  }

  /** 更新状态统计卡片（文件数量为真实数据，其余待解析服务接入） */
  function opUpdateStats() {
    opEls.statFiles.textContent = opFiles.length > 0 ? String(opFiles.length) : '\u2014';
    opEls.statStatus.textContent = opFiles.length > 0 ? '待解析' : '\u2014';
    opEls.statFields.textContent = '\u2014';
    opEls.statExcep.textContent = '\u2014';
  }

  /** 清空全部文件与解析结果 */
  function opClearFiles() {
    if (opFiles.length === 0 && opResults.length === 0 && (!opEls.orderText || !opEls.orderText.value.trim())) {
      opShowStatus('当前没有已选择的文件或解析结果。', 'notice');
      return;
    }
    opFiles = [];
    opResults = [];
    if (opEls.orderText) opEls.orderText.value = '';
    opRenderFiles();
    opRenderResults();
    opUpdateStats();
    if (opEls.exportBtn) opEls.exportBtn.disabled = true;
    opShowStatus('已清空全部文件与解析结果。', 'success');
  }

  /** 渲染解析结果表格 */
  function opRenderResults() {
    opEls.tableBody.innerHTML = '';
    if (opResults.length === 0) {
      opEls.tableWrap.style.display = 'none';
      opEls.empty.style.display = '';
      return;
    }
    opEls.empty.style.display = 'none';
    opEls.tableWrap.style.display = '';
    opResults.forEach(function (r) {
      var tr = document.createElement('tr');
      [r.customer, r.no, r.itemNo, r.itemName, r.qty, r.unitPrice, r.amount, r.currency, r.delivery, r.volume].forEach(function (val) {
        var td = document.createElement('td');
        td.textContent = val || '—';
        tr.appendChild(td);
      });
      opEls.tableBody.appendChild(tr);
    });
    if (opEls.exportBtn) opEls.exportBtn.disabled = false;
  }

  /** 从 AI 回答中安全提取 JSON（数组或对象） */
  function opExtractJSON(text) {
    if (!text) return null;
    var t = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    var arr = t.match(/\[[\s\S]*\]/);
    if (arr) { try { return JSON.parse(arr[0]); } catch (e) {} }
    var obj = t.match(/\{[\s\S]*\}/);
    if (obj) { try { var o = JSON.parse(obj[0]); return o.items || o.results || o.rows || [o]; } catch (e) {} }
    return null;
  }

  var opParsing = false; // 解析并发锁

  /** 开始解析：调用 AI（parse 模块）提取订单结构化字段 */
  async function opParse() {
    if (opParsing) return;
    var text = opEls.orderText ? opEls.orderText.value.trim() : '';
    if (!text && opFiles.length === 0) {
      opShowStatus('请先粘贴订单原文，或上传至少一个订单文件。', 'error');
      return;
    }
    // CSV 文件尝试读取文本内容；PDF/Excel 引导用户粘贴原文
    var fileHint = opFiles.map(function (f) { return f.name; }).join('、');
    if (!text) {
      opShowStatus('PDF/Excel 文件暂不支持直接解析内容，请将订单原文粘贴到文本框后重试（已选文件：' + fileHint + '）。', 'error');
      return;
    }
    opParsing = true;
    opEls.parseBtn.disabled = true;
    opShowStatus('AI 解析中，请稍候…', 'notice');
    try {
      var context = {
        message: text,
        outputFormat: '请仅输出一个 JSON 数组，不要输出任何其他文字。数组每个元素代表一行订单明细，字段如下：' +
          'customer(客户名称)、no(订单编号)、itemNo(产品货号)、itemName(产品名称)、qty(订单数量)、' +
          'unitPrice(单价)、amount(订单金额)、currency(币种)、delivery(交货日期)、volume(货量/体积)。' +
          '文本中未提及的字段填空字符串""。'
      };
      var resp = await HM_API.ai.ask('parse', 'parse', context);
      if (!resp || !resp.success) {
        opShowStatus('AI 解析失败：' + (resp && resp.error ? resp.error : '服务异常'), 'error');
        return;
      }
      var items = opExtractJSON(resp.answer);
      if (!items || !items.length) {
        opShowStatus('AI 返回内容无法解析为订单字段，请检查原文格式后重试。', 'error');
        return;
      }
      opResults = items;
      opRenderResults();
      opEls.statFields.textContent = String(items.length * 10);
      opEls.statStatus.textContent = '解析完成';
      opEls.statExcep.textContent = '0';
      opShowStatus('解析完成，共提取 ' + items.length + ' 条订单明细，请核对结果。', 'success');
    } catch (err) {
      opShowStatus('AI 解析出错：' + (err && err.message ? err.message : '网络异常'), 'error');
    } finally {
      opParsing = false;
      opEls.parseBtn.disabled = false;
    }
  }

  /** P10：将解析结果转入订单管理（无结果时明确提示，不伪造数据） */
  function opTransferToOrder() {
    if (opResults.length === 0) {
      opShowStatus('暂无解析结果。解析服务接入后，提取的订单信息可转入订单管理。', 'notice');
      return;
    }
    var r = opResults[0];
    switchTo('order');
    odEditId = null;
    odEls.orderForm.reset();
    odUpdateCustomerSelect();
    odEls.formNo.value = r.no || '';
    odEls.formCustomer.value = r.customer || '';
    odEls.formAmount.value = r.amount || '';
    odEls.formCurrency.value = r.currency || 'USD';
    odEls.formDelivery.value = r.delivery || '';
    odEls.orderModal.querySelector('.od-modal-title').textContent = '新建订单（来自解析结果）';
    odOpenModal('od-order-modal');
    opShowStatus('已提取解析结果并打开订单表单，请核对后保存。', 'success');
  }

  /** 订单解析初始化 */
  function opInit() {
    if (!opEls.dropzone) return; // 解析页元素不存在时跳过
    opUpdateStats();

    // 点击上传区触发文件选择
    opEls.dropzone.addEventListener('click', function () { opEls.fileInput.click(); });
    opEls.fileInput.addEventListener('change', function () { opHandleFiles(this.files); });

    // 拖拽上传
    opEls.dropzone.addEventListener('dragover', function (e) {
      e.preventDefault();
      opEls.dropzone.classList.add('dragover');
    });
    opEls.dropzone.addEventListener('dragleave', function () {
      opEls.dropzone.classList.remove('dragover');
    });
    opEls.dropzone.addEventListener('drop', function (e) {
      e.preventDefault();
      opEls.dropzone.classList.remove('dragover');
      if (e.dataTransfer && e.dataTransfer.files) opHandleFiles(e.dataTransfer.files);
    });

    // 操作按钮
    opEls.parseBtn.addEventListener('click', opParse);
    opEls.clearBtn.addEventListener('click', opClearFiles);
    if (opEls.transferBtn) opEls.transferBtn.addEventListener('click', opTransferToOrder); // P10
    // P10：将解析结果提交至 P9 审核中心（无结果时明确提示，不伪造）
    if (opEls.reviewBtn) {
      opEls.reviewBtn.addEventListener('click', function () {
        if (opResults.length === 0) {
          opShowStatus('暂无解析结果。解析服务接入后，提取的订单信息可提交至审核中心。', 'notice');
          return;
        }
        var r = opResults[0];
        var rec = window.haimaoSubmitReview({
          title: '订单解析结果：' + (r.no || '未命名'),
          sourceModule: '订单智能解析',
          resultType: '解析结果',
          content: '客户：' + (r.customer || '—') + '\n订单编号：' + (r.no || '—') +
            '\n金额：' + (r.amount || '—') + ' ' + (r.currency || '') +
            '\n交货日期：' + (r.delivery || '—'),
          structuredData: JSON.stringify(r)
        });
        if (rec) {
          opShowStatus('解析结果已提交至审核中心，任务编号 ' + rec.no + '。', 'success');
        } else {
          opShowStatus('提交审核失败，请检查解析结果后重试。', 'error');
        }
      });
    }

    // 文件移除（事件委托）
    opEls.fileList.addEventListener('click', function (e) {
      var rm = e.target.closest('.op-file-remove');
      if (rm) {
        opFiles.splice(parseInt(rm.getAttribute('data-idx'), 10), 1);
        opRenderFiles();
        opUpdateStats();
      }
    });
  }

  opInit();

  /* ==================== 订单与待办管理 ==================== */
  // 订单与待办均为用户手动新建的真实数据，仅保存在当前会话内存中；
  // 业务数据接口未接入，不虚构订单统计或 AI 自动提醒。

  var OD_PROGRESS_STEPS = ['询盘确认', '合同签订', '生产备货', '验货出运', '报关发货', '收款结算'];
  var OD_STATUS_CLASS = {
    '待确认': 'od-status-s0', '生产中': 'od-status-s1', '待发货': 'od-status-s2',
    '运输中': 'od-status-s3', '已完成': 'od-status-s4', '已取消': 'od-status-s5'
  };

  var odOrders = [];   // { id, no, customer, customerId, amount, currency, delivery, status, products:[], records:[], progress }
  var odTodos = [];    // { id, task, owner, deadline, priority, relateOrderId, done }
  var odSeq = 0, odTodoSeq = 0;
  var odDetailId = null;
  var odEditId = null;   // 编辑模式下的订单 id（null 表示新建模式）

  // P10：订单与待办持久化存储键（独立于其他模块，刷新后保留）
  var OD_ORDER_STORAGE_KEY = 'haimao_order_records_v1';
  var OD_TODO_STORAGE_KEY = 'haimao_todo_records_v1';

  var odEls = {
    orderBody:   document.getElementById('od-order-body'),
    newOrder:    document.getElementById('od-new-order'),
    detail:      document.getElementById('od-detail'),
    detailName:  document.getElementById('od-detail-name'),
    detailClose: document.getElementById('od-detail-close'),
    productBody: document.getElementById('od-product-body'),
    productEmpty:document.getElementById('od-product-empty'),
    productAdd:  document.getElementById('od-product-add'),
    productSku:  document.getElementById('od-product-sku'),
    productName: document.getElementById('od-product-name'),
    productQty:  document.getElementById('od-product-qty'),
    productPrice:document.getElementById('od-product-price'),
    progress:    document.getElementById('od-progress'),
    progressAdvance: document.getElementById('od-progress-advance'),
    progressHint:document.getElementById('od-progress-hint'),
    records:     document.getElementById('od-records'),
    recordsEmpty:document.getElementById('od-records-empty'),
    recordInput: document.getElementById('od-record-input'),
    recordAdd:   document.getElementById('od-record-add'),
    relatedBody: document.getElementById('od-related-todo-body'),
    relatedEmpty:document.getElementById('od-related-empty'),
    todoBody:    document.getElementById('od-todo-body'),
    newTodo:     document.getElementById('od-new-todo'),
    orderModal:  document.getElementById('od-order-modal'),
    todoModal:   document.getElementById('od-todo-modal'),
    orderForm:   document.getElementById('od-order-form'),
    todoForm:    document.getElementById('od-todo-form'),
    formNo:      document.getElementById('od-form-no'),
    formCustomer:document.getElementById('od-form-customer'),
    formAmount:  document.getElementById('od-form-amount'),
    formCurrency:document.getElementById('od-form-currency'),
    formDelivery:document.getElementById('od-form-delivery'),
    formStatus:  document.getElementById('od-form-status'),
    formTask:    document.getElementById('od-form-task'),
    formOwner:   document.getElementById('od-form-owner'),
    formDeadline:document.getElementById('od-form-deadline'),
    formPriority:document.getElementById('od-form-priority'),
    formRelate:  document.getElementById('od-form-relate'),
    formCustomerSelect: document.getElementById('od-form-customer-select') // P10：关联客户下拉
  };

  /* ---------- P10：订单/待办 localStorage 持久化 ---------- */

  /** 从后端 API 加载订单列表（逐条结构校验，异常降级为空数组） */
  async function odLoadOrders() {
    try {
      var data = await HM_API.orders.list();
      if (!Array.isArray(data)) return [];
      var maxId = 0;
      for (var i = 0; i < data.length; i++) {
        var o = data[i];
        if (!o || typeof o.id !== 'number' || typeof o.no !== 'string' || typeof o.customer !== 'string') continue;
        if (o.id > maxId) maxId = o.id;
        if (typeof o.amount !== 'string') o.amount = '';
        if (typeof o.currency !== 'string') o.currency = 'USD';
        if (typeof o.delivery !== 'string') o.delivery = '';
        if (typeof o.status !== 'string') o.status = '待确认';
        if (typeof o.customerId !== 'number') o.customerId = null;
        if (!Array.isArray(o.products)) o.products = [];
        if (!Array.isArray(o.records)) o.records = [];
        if (typeof o.progress !== 'number') o.progress = 0;
      }
      odSeq = maxId;
      return data;
    } catch (err) {
      console.error('订单加载失败:', err);
      return [];
    }
  }

  /** 订单列表持久化（阶段一：已通过 API 单条同步，此处保留兼容） */
  function odSaveOrders() {
    /* 阶段一：数据通过 HM_API.orders 单条同步至后端 SQLite，无需全量写入 */
  }

  /** 从后端 API 加载待办列表（逐条结构校验，异常降级为空数组） */
  async function odLoadTodos() {
    try {
      var data = await HM_API.todos.list();
      if (!Array.isArray(data)) return [];
      var maxId = 0;
      for (var i = 0; i < data.length; i++) {
        var t = data[i];
        if (!t || typeof t.id !== 'number' || typeof t.task !== 'string') continue;
        if (t.id > maxId) maxId = t.id;
        if (typeof t.owner !== 'string') t.owner = '';
        if (typeof t.deadline !== 'string') t.deadline = '';
        if (typeof t.priority !== 'string') t.priority = '中';
        if (typeof t.relateOrderId !== 'number') t.relateOrderId = null;
        if (typeof t.done !== 'boolean') t.done = false;
      }
      odTodoSeq = maxId;
      return data;
    } catch (err) {
      console.error('待办加载失败:', err);
      return [];
    }
  }

  /** 待办列表持久化（阶段一：已通过 API 单条同步，此处保留兼容） */
  function odSaveTodos() {
    /* 阶段一：数据通过 HM_API.todos 单条同步至后端 SQLite，无需全量写入 */
  }

  /** P10：刷新订单表单中的关联客户下拉（读取 CRM 客户列表） */
  function odUpdateCustomerSelect() {
    if (!odEls.formCustomerSelect) return;
    var current = odEls.formCustomerSelect.value;
    var html = '<option value="">不关联（手动输入）</option>';
    if (Array.isArray(crmCustomers)) {
      for (var i = 0; i < crmCustomers.length; i++) {
        var c = crmCustomers[i];
        if (!c || typeof c.id !== 'number') continue;
        html += '<option value="' + c.id + '">' + odEsc(c.name) + '</option>';
      }
    }
    odEls.formCustomerSelect.innerHTML = html;
    if (current) odEls.formCustomerSelect.value = current;
  }

  /** 获取订单对象 */
  function odGetOrder(id) {
    for (var i = 0; i < odOrders.length; i++) {
      if (odOrders[i].id === id) return odOrders[i];
    }
    return null;
  }

  /** 优先级样式类 */
  function odPriorityClass(p) {
    if (p === '高') return 'od-priority-high';
    if (p === '低') return 'od-priority-low';
    return 'od-priority-mid';
  }

  /** 判断待办是否逾期：有截止日期、未完成、且已过截止日 */
  function odIsOverdue(t) {
    if (t.done || !t.deadline) return false;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var dl = new Date(t.deadline + 'T23:59:59');
    return dl < today;
  }

  /** 待办状态文本与样式类 */
  function odTodoStatus(t) {
    if (t.done) return { text: '已完成', cls: 'od-status-s4' };
    if (odIsOverdue(t)) return { text: '已逾期', cls: 'od-status-overdue' };
    return { text: '进行中', cls: 'od-status-s1' };
  }

  /** 渲染订单列表 */
  function odRenderOrders() {
    odEls.orderBody.innerHTML = '';
    if (odOrders.length === 0) {
      odEls.orderBody.innerHTML =
        '<tr class="od-empty-row"><td colspan="7">' +
          '<div class="od-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="M9 10h6M9 14h6M9 18h3"/></svg></div>' +
          '<p class="od-empty-text">暂无订单数据</p>' +
          '<p class="od-empty-sub">点击右上角「新建订单」手动添加订单，数据自动保存到本地</p>' +
        '</td></tr>';
      odUpdateRelateSelect();
      return;
    }
    odOrders.forEach(function (o) {
      var tr = document.createElement('tr');
      tr.setAttribute('data-id', o.id);
      tr.innerHTML =
        '<td>' + odEsc(o.no) + '</td>' +
        '<td>' + odEsc(o.customer) + '</td>' +
        '<td>' + odEsc(o.amount || '—') + '</td>' +
        '<td>' + odEsc(o.currency || '—') + '</td>' +
        '<td>' + odEsc(o.delivery || '—') + '</td>' +
        '<td><span class="od-status ' + (OD_STATUS_CLASS[o.status] || 'od-status-s0') + '">' + odEsc(o.status) + '</span></td>' +
        '<td>' +
          '<button type="button" class="od-row-btn" data-act="detail">详情</button>' +
          '<button type="button" class="od-row-btn" data-act="edit">编辑</button>' +
          '<button type="button" class="od-row-btn danger" data-act="delete">删除</button>' +
        '</td>';
      odEls.orderBody.appendChild(tr);
    });
    odUpdateRelateSelect();
  }

  /** 渲染待办列表 */
  function odRenderTodos() {
    odEls.todoBody.innerHTML = '';
    if (odTodos.length === 0) {
      odEls.todoBody.innerHTML =
        '<tr class="od-empty-row"><td colspan="7">' +
          '<div class="od-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg></div>' +
          '<p class="od-empty-text">暂无待办事项</p>' +
          '<p class="od-empty-sub">点击右上角「新建待办」添加任务，可选择关联已有订单</p>' +
        '</td></tr>';
      if (odDetailId !== null) odRenderRelatedTodos();
      return;
    }
    odTodos.forEach(function (t) {
      var tr = document.createElement('tr');
      tr.setAttribute('data-id', t.id);
      if (odIsOverdue(t)) tr.className = 'od-row-overdue';
      var relateName = '—';
      if (t.relateOrderId) {
        var ro = odGetOrder(t.relateOrderId);
        if (ro) relateName = ro.no;
      }
      var st = odTodoStatus(t);
      tr.innerHTML =
        '<td class="' + (t.done ? 'od-todo-done' : '') + '">' + odEsc(t.task) + '</td>' +
        '<td>' + odEsc(t.owner || '—') + '</td>' +
        '<td>' + odEsc(t.deadline || '—') + '</td>' +
        '<td><span class="od-priority ' + odPriorityClass(t.priority) + '">' + odEsc(t.priority) + '</span></td>' +
        '<td>' + odEsc(relateName) + '</td>' +
        '<td><span class="od-status ' + st.cls + '">' + st.text + '</span></td>' +
        '<td>' +
          '<input type="checkbox" class="od-check" data-act="toggle"' + (t.done ? ' checked' : '') + '>' +
          '<button type="button" class="od-row-btn danger" data-act="delete">删除</button>' +
        '</td>';
      odEls.todoBody.appendChild(tr);
    });
    if (odDetailId !== null) odRenderRelatedTodos();
  }

  /** 更新建待办表单的关联订单下拉 */
  function odUpdateRelateSelect() {
    if (!odEls.formRelate) return;
    var current = odEls.formRelate.value;
    odEls.formRelate.innerHTML = '<option value="">不关联</option>';
    odOrders.forEach(function (o) {
      var opt = document.createElement('option');
      opt.value = o.id;
      opt.textContent = o.no;
      odEls.formRelate.appendChild(opt);
    });
    if (current) odEls.formRelate.value = current;
  }

  /** HTML 转义（防止用户输入注入） */
  function odEsc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /** 打开订单详情 */
  function odOpenDetail(id) {
    var o = odGetOrder(id);
    if (!o) return;
    odDetailId = id;
    odEls.detailName.textContent = o.no + ' · ' + o.customer;
    odEls.detail.style.display = '';
    odRenderDetail();
    odEls.detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /** 关闭订单详情 */
  function odCloseDetail() {
    odDetailId = null;
    odEls.detail.style.display = 'none';
  }

  /** 渲染订单详情全部内容 */
  function odRenderDetail() {
    var o = odGetOrder(odDetailId);
    if (!o) { odCloseDetail(); return; }
    odEls.detailName.textContent = o.no + ' · ' + o.customer;
    odRenderProducts(o);
    odRenderProgress(o);
    odRenderRecords(o);
    odRenderRelatedTodos();
  }

  /** 渲染产品信息 */
  function odRenderProducts(o) {
    odEls.productBody.innerHTML = '';
    var has = o.products.length > 0;
    odEls.productEmpty.style.display = has ? 'none' : '';
    odEls.productBody.parentElement.style.display = has ? '' : 'none';
    o.products.forEach(function (p) {
      var tr = document.createElement('tr');
      tr.innerHTML = '<td>' + odEsc(p.sku) + '</td><td>' + odEsc(p.name) + '</td><td>' + odEsc(p.qty) + '</td><td>' + odEsc(p.price) + '</td>';
      odEls.productBody.appendChild(tr);
    });
  }

  /** 渲染订单进度时间线 */
  function odRenderProgress(o) {
    odEls.progress.innerHTML = '';
    OD_PROGRESS_STEPS.forEach(function (name, idx) {
      var step = document.createElement('div');
      step.className = 'od-progress-step';
      if (idx < o.progress) step.classList.add('done');
      else if (idx === o.progress) step.classList.add('current');
      if (idx < OD_PROGRESS_STEPS.length - 1) {
        var line = document.createElement('span');
        line.className = 'od-progress-line';
        step.appendChild(line);
      }
      var dot = document.createElement('span');
      dot.className = 'od-progress-dot';
      dot.textContent = idx < o.progress ? '\u2713' : (idx + 1);
      var nm = document.createElement('span');
      nm.className = 'od-progress-name';
      nm.textContent = name;
      step.appendChild(dot);
      step.appendChild(nm);
      odEls.progress.appendChild(step);
    });
    // 推进按钮与提示
    if (o.progress >= OD_PROGRESS_STEPS.length) {
      odEls.progressAdvance.disabled = true;
      odEls.progressHint.textContent = '订单流程已全部完成。';
    } else {
      odEls.progressAdvance.disabled = false;
      odEls.progressHint.textContent = '当前阶段：' + OD_PROGRESS_STEPS[o.progress] + '，下一阶段：' + OD_PROGRESS_STEPS[o.progress + 1];
    }
  }

  /** 渲染业务记录 */
  function odRenderRecords(o) {
    odEls.records.innerHTML = '';
    var has = o.records.length > 0;
    odEls.recordsEmpty.style.display = has ? 'none' : '';
    odEls.records.style.display = has ? '' : 'none';
    for (var i = o.records.length - 1; i >= 0; i--) {
      var r = o.records[i];
      var item = document.createElement('div');
      item.className = 'od-record';
      var dot = document.createElement('span');
      dot.className = 'od-record-dot';
      var content = document.createElement('div');
      content.className = 'od-record-content';
      var text = document.createElement('div');
      text.className = 'od-record-text';
      text.textContent = r.text;
      var time = document.createElement('div');
      time.className = 'od-record-time';
      time.textContent = r.time;
      content.appendChild(text);
      content.appendChild(time);
      item.appendChild(dot);
      item.appendChild(content);
      odEls.records.appendChild(item);
    }
  }

  /** 渲染关联待办（详情面板内） */
  function odRenderRelatedTodos() {
    if (!odEls.relatedBody) return;
    odEls.relatedBody.innerHTML = '';
    var related = odTodos.filter(function (t) { return t.relateOrderId === odDetailId; });
    var has = related.length > 0;
    odEls.relatedEmpty.style.display = has ? 'none' : '';
    odEls.relatedBody.parentElement.style.display = has ? '' : 'none';
    related.forEach(function (t) {
      var tr = document.createElement('tr');
      var st = odTodoStatus(t);
      tr.innerHTML =
        '<td class="' + (t.done ? 'od-todo-done' : '') + '">' + odEsc(t.task) + '</td>' +
        '<td>' + odEsc(t.owner || '—') + '</td>' +
        '<td>' + odEsc(t.deadline || '—') + '</td>' +
        '<td><span class="od-priority ' + odPriorityClass(t.priority) + '">' + odEsc(t.priority) + '</span></td>' +
        '<td><span class="od-status ' + st.cls + '">' + st.text + '</span></td>';
      odEls.relatedBody.appendChild(tr);
    });
  }

  /** 添加产品 */
  function odAddProduct() {
    var o = odGetOrder(odDetailId);
    if (!o) return;
    var sku = odEls.productSku.value.trim();
    var name = odEls.productName.value.trim();
    var qty = odEls.productQty.value.trim();
    var price = odEls.productPrice.value.trim();
    if (!sku && !name) return;
    o.products.push({ sku: sku, name: name, qty: qty, price: price });
    odEls.productSku.value = '';
    odEls.productName.value = '';
    odEls.productQty.value = '';
    odEls.productPrice.value = '';
    odSaveOrders();
    HM_API.orders.update(o.id, { products: o.products }).catch(function (e) { console.error('产品同步失败:', e); });
    odRenderProducts(o);
  }

  /** 添加业务记录 */
  function odAddRecord() {
    var o = odGetOrder(odDetailId);
    if (!o) return;
    var text = odEls.recordInput.value.trim();
    if (!text) return;
    var d = new Date();
    function p(n) { return n < 10 ? '0' + n : '' + n; }
    o.records.push({ text: text, time: d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) });
    odEls.recordInput.value = '';
    odSaveOrders();
    HM_API.orders.update(o.id, { records: o.records }).catch(function (e) { console.error('记录同步失败:', e); });
    odRenderRecords(o);
  }

  /** 推进订单进度 */
  function odAdvanceProgress() {
    var o = odGetOrder(odDetailId);
    if (!o) return;
    if (o.progress >= OD_PROGRESS_STEPS.length) return;
    o.progress++;
    odRenderProgress(o);
    // 同步订单状态（进度与状态联动：进度推进后自动更新订单状态）
    if (o.progress <= 1) o.status = '待确认';        // 询盘确认/合同签订阶段
    else if (o.progress === 2) o.status = '生产中';   // 生产备货阶段
    else if (o.progress === 3) o.status = '待发货';   // 验货出运阶段
    else if (o.progress <= 5) o.status = '运输中';    // 报关发货/收款结算阶段
    else o.status = '已完成';                         // 全部完成
    odSaveOrders();
    HM_API.orders.update(o.id, { progress: o.progress, status: o.status }).catch(function (e) { console.error('进度同步失败:', e); });
    odRenderOrders();
  }

  /** 打开/关闭模态框 */
  function odOpenModal(key) {
    var m = document.getElementById(key);
    if (m) m.classList.add('open');
  }

  function odCloseModal(key) {
    var m = document.getElementById(key);
    if (m) m.classList.remove('open');
  }

  /** 打开新建订单模态框 */
  function odOpenOrderModal() {
    odEditId = null;
    odEls.orderForm.reset();
    odUpdateCustomerSelect();
    odEls.orderModal.querySelector('.od-modal-title').textContent = '新建订单';
    odOpenModal('od-order-modal');
  }

  /** 打开编辑订单模态框（预填订单基本信息） */
  function odEditOrder(id) {
    var o = odGetOrder(id);
    if (!o) return;
    odEditId = id;
    odUpdateCustomerSelect();
    odEls.formNo.value = o.no;
    odEls.formCustomer.value = o.customer;
    if (odEls.formCustomerSelect && o.customerId !== null && o.customerId !== undefined) {
      odEls.formCustomerSelect.value = String(o.customerId);
    }
    odEls.formAmount.value = o.amount || '';
    odEls.formCurrency.value = o.currency || 'USD';
    odEls.formDelivery.value = o.delivery || '';
    odEls.formStatus.value = o.status || '待确认';
    odEls.orderModal.querySelector('.od-modal-title').textContent = '编辑订单';
    odOpenModal('od-order-modal');
  }

  /** 订单表单提交（区分新建与编辑模式，P10：支持客户关联 + API 持久化） */
  async function odSubmitOrder(e) {
    e.preventDefault();
    var no = odEls.formNo.value.trim();
    var customer = odEls.formCustomer.value.trim();
    if (!no || !customer) return;
    var customerId = odEls.formCustomerSelect && odEls.formCustomerSelect.value
      ? parseInt(odEls.formCustomerSelect.value, 10) : null;
    if (odEditId !== null) {
      // 编辑模式：更新现有订单基本信息，保留产品/记录/进度不变
      var o = odGetOrder(odEditId);
      if (o) {
        o.no = no;
        o.customer = customer;
        o.customerId = customerId;
        o.amount = odEls.formAmount.value.trim();
        o.currency = odEls.formCurrency.value;
        o.delivery = odEls.formDelivery.value;
        o.status = odEls.formStatus.value;
        // 异步同步至后端
        HM_API.orders.update(o.id, {
          no: o.no, customer: o.customer, customerId: o.customerId,
          amount: o.amount, currency: o.currency, delivery: o.delivery, status: o.status
        }).catch(function (e) { console.error('订单更新同步失败:', e); });
      }
      odEditId = null;
    } else {
      // 新建模式：先调 API 获取后端 id，再更新内存
      try {
        var created = await HM_API.orders.create({
          no: no,
          customer: customer,
          customerId: customerId,
          amount: odEls.formAmount.value.trim(),
          currency: odEls.formCurrency.value,
          delivery: odEls.formDelivery.value,
          status: odEls.formStatus.value,
          products: [],
          records: [],
          progress: 0
        });
        odOrders.push(created);
        if (created.id > odSeq) odSeq = created.id;
      } catch (e) {
        console.error('订单创建失败:', e);
        alert('订单创建失败: ' + e.message);
      }
    }
    odEls.orderForm.reset();
    odCloseModal('od-order-modal');
    odSaveOrders();
    odRenderOrders();
    odRenderTodos(); // 订单编号可能变更，同步刷新待办关联名称
    if (odDetailId !== null) odRenderDetail();
  }

  /** 新建待办提交 */
  async function odSubmitTodo(e) {
    e.preventDefault();
    var task = odEls.formTask.value.trim();
    if (!task) return;
    var relateId = odEls.formRelate.value ? parseInt(odEls.formRelate.value, 10) : null;
    try {
      var created = await HM_API.todos.create({
        task: task,
        owner: odEls.formOwner.value.trim(),
        deadline: odEls.formDeadline.value,
        priority: odEls.formPriority.value,
        relateOrderId: relateId,
        done: false
      });
      odTodos.push(created);
      if (created.id > odTodoSeq) odTodoSeq = created.id;
    } catch (e) {
      console.error('待办创建失败:', e);
      alert('待办创建失败: ' + e.message);
    }
    odEls.todoForm.reset();
    odCloseModal('od-todo-modal');
    odSaveTodos();
    odRenderTodos();
  }

  /** 删除订单（二次确认：明确提示关联待办将解除关联） */
  function odDeleteOrder(id) {
    var o = odGetOrder(id);
    if (!o) return;
    var relatedCount = odTodos.filter(function (t) { return t.relateOrderId === id; }).length;
    var msg = '确定要删除订单「' + o.no + '」吗？';
    if (relatedCount > 0) {
      msg += '\n该订单关联了 ' + relatedCount + ' 条待办事项，删除后关联关系将自动解除（待办事项本身不会被删除）。';
    }
    if (!confirm(msg)) return;
    odOrders = odOrders.filter(function (oo) { return oo.id !== id; });
    // 同步清除关联待办的关联关系
    odTodos.forEach(function (t) {
      if (t.relateOrderId === id) {
        t.relateOrderId = null;
        HM_API.todos.update(t.id, { relateOrderId: null }).catch(function (e) { console.error('待办关联解除同步失败:', e); });
      }
    });
    if (odDetailId === id) odCloseDetail();
    odSaveOrders();
    odSaveTodos();
    HM_API.orders.remove(id).catch(function (e) { console.error('订单删除同步失败:', e); });
    odRenderOrders();
    odRenderTodos();
  }

  /** 删除待办 */
  function odDeleteTodo(id) {
    odTodos = odTodos.filter(function (t) { return t.id !== id; });
    odSaveTodos();
    HM_API.todos.remove(id).catch(function (e) { console.error('待办删除同步失败:', e); });
    odRenderTodos();
  }

  /** 切换待办完成状态 */
  function odToggleTodo(id) {
    odTodos.forEach(function (t) {
      if (t.id === id) {
        t.done = !t.done;
        HM_API.todos.update(t.id, { done: t.done }).catch(function (e) { console.error('待办状态同步失败:', e); });
      }
    });
    odSaveTodos();
    odRenderTodos();
  }

  /** 订单与待办初始化 */
  async function odInit() {
    if (!odEls.orderBody) return; // 订单页元素不存在时跳过
    await hmMigrateReady; // 确保首次迁移完成后再加载
    // 从后端 API 加载订单与待办数据
    odOrders = await odLoadOrders();
    odTodos = await odLoadTodos();
    odRenderOrders();
    odRenderTodos();

    // 新建按钮
    odEls.newOrder.addEventListener('click', odOpenOrderModal);
    odEls.newTodo.addEventListener('click', function () { odOpenModal('od-todo-modal'); });

    // P10：关联客户选择后自动填充客户名称
    if (odEls.formCustomerSelect) {
      odEls.formCustomerSelect.addEventListener('change', function () {
        var cid = this.value ? parseInt(this.value, 10) : null;
        if (cid !== null && Array.isArray(crmCustomers)) {
          for (var i = 0; i < crmCustomers.length; i++) {
            if (crmCustomers[i].id === cid) {
              odEls.formCustomer.value = crmCustomers[i].name;
              break;
            }
          }
        }
      });
    }

    // 模态框关闭（含遮罩点击与取消按钮）
    document.querySelectorAll('.od-modal-close, .od-modal [data-close]').forEach(function (btn) {
      btn.addEventListener('click', function () { odCloseModal(btn.getAttribute('data-close')); });
    });
    document.querySelectorAll('.od-modal').forEach(function (m) {
      m.addEventListener('click', function (e) {
        if (e.target === m) m.classList.remove('open');
      });
    });

    // 表单提交
    odEls.orderForm.addEventListener('submit', odSubmitOrder);
    odEls.todoForm.addEventListener('submit', odSubmitTodo);

    // 详情面板
    odEls.detailClose.addEventListener('click', odCloseDetail);
    odEls.productAdd.addEventListener('click', odAddProduct);
    odEls.recordAdd.addEventListener('click', odAddRecord);
    odEls.progressAdvance.addEventListener('click', odAdvanceProgress);
    odEls.recordInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); odAddRecord(); }
    });

    // 订单列表操作（事件委托）
    odEls.orderBody.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act]');
      if (!btn) return;
      var tr = btn.closest('tr');
      var id = parseInt(tr.getAttribute('data-id'), 10);
      var act = btn.getAttribute('data-act');
      if (act === 'detail') odOpenDetail(id);
      else if (act === 'edit') odEditOrder(id);
      else if (act === 'delete') odDeleteOrder(id);
    });

    // 待办列表操作（事件委托）
    odEls.todoBody.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act="delete"]');
      if (btn) {
        var tr = btn.closest('tr');
        odDeleteTodo(parseInt(tr.getAttribute('data-id'), 10));
        return;
      }
      var chk = e.target.closest('[data-act="toggle"]');
      if (chk) {
        var tr2 = chk.closest('tr');
        odToggleTodo(parseInt(tr2.getAttribute('data-id'), 10));
      }
    });
  }

  odInit();

  /* ==================== P6：订单异常核对 ==================== */

  // 核对字段定义（订单基准与单证数据逐项比较的字段清单）
  var CK_FIELDS = [
    { key: 'no',       name: '订单编号', type: 'text'    },
    { key: 'customer', name: '客户名称', type: 'text'    },
    { key: 'sku',      name: '产品货号', type: 'text'    },
    { key: 'pname',    name: '产品名称', type: 'text'    },
    { key: 'qty',      name: '订单数量', type: 'number'  },
    { key: 'price',    name: '单价',     type: 'decimal' },
    { key: 'amount',   name: '订单金额', type: 'decimal' },
    { key: 'currency', name: '币种',     type: 'text'    },
    { key: 'delivery', name: '交货日期', type: 'date'    }
  ];

  // 异常处理建议规则（按字段配置，非大模型生成）
  var CK_ADVICE_MAP = {
    no:       '建议核对单证关联的订单编号是否一致。',
    customer: '建议确认客户主体信息是否一致。',
    sku:      '建议核对产品货号是否一致。',
    pname:    '建议确认产品描述与名称是否一致。',
    qty:      '建议重新确认订单数量。',
    price:    '建议核对单价是否发生变更。',
    amount:   '建议核对单价、数量及金额计算。',
    currency: '建议确认结算币种。',
    delivery: '建议与客户确认最终交期。'
  };

  var ckResults = [];   // 最近一次核对结果缓存
  var ckHasResult = false;

  var ckEls = {
    docType:    document.getElementById('ck-doc-type'),
    checkBtn:   document.getElementById('ck-check-btn'),
    recheckBtn: document.getElementById('ck-recheck-btn'),
    clearBtn:   document.getElementById('ck-clear-btn'),
    exportBtn:  document.getElementById('ck-export-btn'),
    statTotal:  document.getElementById('ck-stat-total'),
    statOk:     document.getElementById('ck-stat-ok'),
    statDiff:   document.getElementById('ck-stat-diff'),
    statMissing:document.getElementById('ck-stat-missing'),
    resultBody: document.getElementById('ck-result-body'),
    adviceEmpty:document.getElementById('ck-advice-empty'),
    adviceList: document.getElementById('ck-advice-list'),
    orderSelect: document.getElementById('ck-order-select'),   // P10：订单选择下拉
    loadOrderBtn:document.getElementById('ck-load-order-btn'), // P10：加载基准按钮
    kbBtn:       document.getElementById('ck-kb-btn'),         // P10：查询知识库
    reviewBtn:   document.getElementById('ck-review-btn'),     // P10：提交审核
    aiBtn:       document.getElementById('ck-ai-btn'),         // AI 智能分析
    aiResult:    document.getElementById('ck-ai-result'),      // AI 结果容器
    aiContent:   document.getElementById('ck-ai-result-content'), // AI 结果正文
    aiClose:     document.getElementById('ck-ai-result-close')    // 收起按钮
  };
  CK_FIELDS.forEach(function (f) {
    ckEls['base_' + f.key] = document.getElementById('ck-base-' + f.key);
    ckEls['doc_'  + f.key] = document.getElementById('ck-doc-'  + f.key);
  });

  /** P10：刷新核对页的订单选择下拉（读取 P5 odOrders） */
  function ckUpdateOrderSelect() {
    if (!ckEls.orderSelect) return;
    var current = ckEls.orderSelect.value;
    ckEls.orderSelect.innerHTML = '<option value="">从订单管理加载…</option>';
    odOrders.forEach(function (o) {
      var opt = document.createElement('option');
      opt.value = o.id;
      opt.textContent = o.no + ' · ' + o.customer;
      ckEls.orderSelect.appendChild(opt);
    });
    if (current) ckEls.orderSelect.value = current;
  }

  /** P10：从选中的 P5 订单加载基准数据（自动填充左栏，产品取第一项） */
  function ckLoadOrder() {
    if (!ckEls.orderSelect) return;
    var oid = ckEls.orderSelect.value ? parseInt(ckEls.orderSelect.value, 10) : null;
    if (oid === null) {
      alert('请先在下拉列表中选择一个订单。');
      return;
    }
    var o = null;
    for (var i = 0; i < odOrders.length; i++) {
      if (odOrders[i].id === oid) { o = odOrders[i]; break; }
    }
    if (!o) return;
    ckEls.base_no.value = o.no || '';
    ckEls.base_customer.value = o.customer || '';
    ckEls.base_amount.value = o.amount || '';
    ckEls.base_currency.value = o.currency || '';
    ckEls.base_delivery.value = o.delivery || '';
    var p0 = o.products && o.products.length > 0 ? o.products[0] : null;
    ckEls.base_sku.value = p0 ? (p0.sku || '') : '';
    ckEls.base_pname.value = p0 ? (p0.name || '') : '';
    ckEls.base_qty.value = p0 ? (p0.qty || '') : '';
    ckEls.base_price.value = p0 ? (p0.price || '') : '';
  }

  /** 执行核对：读取两组数据并逐字段比较 */
  function ckRunCheck() {
    // 至少需要录入一项数据才执行核对
    var hasAny = false;
    CK_FIELDS.forEach(function (f) {
      if ((ckEls['base_' + f.key].value || '').trim() || (ckEls['doc_' + f.key].value || '').trim()) hasAny = true;
    });
    if (!hasAny) {
      alert('请先录入订单基准信息或单证数据，再进行核对。');
      return;
    }
    ckResults = CK_FIELDS.map(function (f) {
      var baseVal = (ckEls['base_' + f.key].value || '').trim();
      var docVal  = (ckEls['doc_'  + f.key].value || '').trim();
      var r = ckCompare(f, baseVal, docVal);
      return { key: f.key, name: f.name, baseVal: baseVal, docVal: docVal, status: r.status, note: r.note };
    });
    ckHasResult = true;
    ckRenderResults();
  }

  /** 单字段比较（确定性规则，非 AI 推断） */
  function ckCompare(field, base, doc) {
    // 两边均未填写 → 待补充
    if (!base && !doc) return { status: 'missing', note: '订单基准与单证数据均未填写' };
    // 单边缺失 → 待补充（关键字段缺失）
    if (!base) return { status: 'missing', note: '订单基准信息缺失' };
    if (!doc)  return { status: 'missing', note: '单证数据缺失' };

    if (field.type === 'number') {
      // 数量：精确比较（支持小数数量，按业务精度 2 位小数取整后精确比对，无宽松容差）
      if (!ckIsNumber(base) || !ckIsNumber(doc)) return ckInvalidNumber(base, doc);
      var bn = parseFloat(base), dn = parseFloat(doc);
      if (ckRound2(bn) === ckRound2(dn)) return { status: 'ok', note: '' };
      return { status: 'diff', note: '订单基准为 ' + bn + '，单证为 ' + dn };
    }
    if (field.type === 'decimal') {
      // 金额/单价：按业务精度 2 位小数精确比对
      if (!ckIsNumber(base) || !ckIsNumber(doc)) return ckInvalidNumber(base, doc);
      var bd = parseFloat(base), dd = parseFloat(doc);
      if (ckRound2(bd) === ckRound2(dd)) return { status: 'ok', note: '' };
      return { status: 'diff', note: '订单基准为 ' + bd + '，单证为 ' + dd };
    }
    if (field.type === 'date') {
      // 日期：统一格式后比较（支持 YYYY-MM-DD / YYYY/M/D / YYYY.M.D）
      var nb = ckNormalizeDate(base), nd = ckNormalizeDate(doc);
      if (nb && nd) {
        if (nb === nd) return { status: 'ok', note: '' };
        return { status: 'diff', note: '订单基准为 ' + nb + '，单证为 ' + nd };
      }
      // 无法解析为日期时按文本比较
      return ckCompareText(field, base, doc);
    }
    // 文本：trim 后不区分大小写比较
    return ckCompareText(field, base, doc);
  }

  /** 数值有效性校验：整个字符串必须为合法数字（整数或小数，允许负号） */
  function ckIsNumber(s) {
    return /^-?\d+(\.\d+)?$/.test(s);
  }

  /** 数值字段无效输入提示（不回退文本比较，直接判异常） */
  function ckInvalidNumber(base, doc) {
    var parts = [];
    if (!ckIsNumber(base)) parts.push('订单基准值「' + base + '」不是有效数字');
    if (!ckIsNumber(doc))  parts.push('单证数据「' + doc + '」不是有效数字');
    return { status: 'diff', note: parts.join('；') };
  }

  /** 按业务精度取整到 2 位小数（消除浮点表示误差，如 5000 与 5000.00 视为一致） */
  function ckRound2(n) {
    return Math.round(n * 100) / 100;
  }

  /** 日期格式统一：支持 YYYY-MM-DD / YYYY/M/D / YYYY.M.D，输出 YYYY-MM-DD；无法解析返回 null */
  function ckNormalizeDate(s) {
    var m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/);
    if (!m) return null;
    function p(n) { return n.length < 2 ? '0' + n : n; }
    return m[1] + '-' + p(m[2]) + '-' + p(m[3]);
  }

  function ckCompareText(field, base, doc) {
    if (base.toUpperCase() !== doc.toUpperCase()) {
      return { status: 'diff', note: '订单基准为「' + base + '」，单证为「' + doc + '」' };
    }
    return { status: 'ok', note: '' };
  }

  /** 渲染核对结果：统计卡片 + 结果表格 + 处理建议 */
  function ckRenderResults() {
    var ok = 0, diff = 0, missing = 0;
    ckResults.forEach(function (r) {
      if (r.status === 'ok') ok++;
      else if (r.status === 'diff') diff++;
      else missing++;
    });
    ckEls.statTotal.textContent   = ckResults.length;
    ckEls.statOk.textContent      = ok;
    ckEls.statDiff.textContent    = diff;
    ckEls.statMissing.textContent = missing;

    // 结果表格
    ckEls.resultBody.innerHTML = '';
    ckResults.forEach(function (r) {
      var tr = document.createElement('tr');
      if (r.status === 'diff') tr.className = 'ck-row-diff';
      var statusText = r.status === 'ok' ? '一致' : r.status === 'diff' ? '异常' : '待补充';
      tr.innerHTML =
        '<td>' + odEsc(r.name) + '</td>' +
        '<td>' + odEsc(r.baseVal || '—') + '</td>' +
        '<td>' + odEsc(r.docVal || '—') + '</td>' +
        '<td><span class="ck-result ck-result-' + r.status + '">' + statusText + '</span></td>' +
        '<td>' + odEsc(r.note || '—') + '</td>';
      ckEls.resultBody.appendChild(tr);
    });

    ckRenderAdvice(diff, missing);
    ckEls.exportBtn.disabled = false;
  }

  /** 渲染异常处理建议（基于实际检测到的异常规则生成） */
  function ckRenderAdvice(diffCount, missingCount) {
    ckEls.adviceList.innerHTML = '';
    var hasAdvice = false;
    ckResults.forEach(function (r) {
      if (r.status === 'ok') return;
      hasAdvice = true;
      var li = document.createElement('li');
      li.className = 'ck-advice-item ' + r.status;
      var icon = document.createElement('span');
      icon.className = 'ck-advice-icon';
      icon.innerHTML = r.status === 'diff'
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>';
      var text = document.createElement('div');
      text.className = 'ck-advice-text';
      var strong = document.createElement('strong');
      strong.textContent = r.status === 'diff' ? (r.name + '不一致：') : (r.name + '待补充：');
      text.appendChild(strong);
      var advice = r.status === 'diff'
        ? (CK_ADVICE_MAP[r.key] || '建议核对该字段。')
        : '建议补充对应单证信息。';
      text.appendChild(document.createTextNode(r.note + '。' + advice));
      li.appendChild(icon);
      li.appendChild(text);
      ckEls.adviceList.appendChild(li);
    });
    if (hasAdvice) {
      ckEls.adviceEmpty.style.display = 'none';
      ckEls.adviceList.style.display = '';
    } else {
      // 全部一致
      ckEls.adviceEmpty.style.display = '';
      ckEls.adviceEmpty.querySelector('.ck-advice-empty-text').textContent =
        '全部 ' + ckResults.length + ' 个核对字段均一致，未发现异常。';
      ckEls.adviceList.style.display = 'none';
    }
  }

  /** 渲染初始空状态（未核对时） */
  function ckRenderEmpty() {
    ckEls.statTotal.textContent   = '—';
    ckEls.statOk.textContent      = '—';
    ckEls.statDiff.textContent    = '—';
    ckEls.statMissing.textContent = '—';
    ckEls.resultBody.innerHTML =
      '<tr class="ck-empty-row"><td colspan="5">' +
        '<div class="od-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg></div>' +
        '<p class="od-empty-text">暂无核对结果</p>' +
        '<p class="od-empty-sub">录入订单基准信息与单证数据后，点击「开始核对」查看字段比对结果</p>' +
      '</td></tr>';
    ckEls.adviceEmpty.style.display = '';
    ckEls.adviceEmpty.querySelector('.ck-advice-empty-text').textContent =
      '暂无核对结果。录入订单基准信息与单证数据后，点击「开始核对」将根据检测到的异常生成处理建议。';
    ckEls.adviceList.style.display = 'none';
    ckEls.adviceList.innerHTML = '';
    ckEls.exportBtn.disabled = true;
  }

  /** 导出核对报告（CSV，含 BOM 头确保 Excel 中文正常） */
  function ckExportCSV() {
    if (!ckHasResult) return;
    var docType = ckEls.docType ? ckEls.docType.value : '';
    var rows = [
      ['订单异常核对报告'],
      ['单证类型', docType],
      ['核对时间', ckNowStr()],
      [],
      ['字段名称', '订单基准值', '单证数据', '核对结果', '异常说明']
    ];
    ckResults.forEach(function (r) {
      var statusText = r.status === 'ok' ? '一致' : r.status === 'diff' ? '异常' : '待补充';
      rows.push([r.name, r.baseVal || '', r.docVal || '', statusText, r.note || '']);
    });
    var csv = '\uFEFF' + rows.map(function (row) {
      return row.map(function (cell) {
        var s = String(cell);
        if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
        return s;
      }).join(',');
    }).join('\r\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = '订单异常核对报告.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /** 当前时间字符串（报告用） */
  function ckNowStr() {
    var d = new Date();
    function p(n) { return n < 10 ? '0' + n : '' + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /** 清空全部数据并重置为初始状态 */
  function ckClearAll() {
    CK_FIELDS.forEach(function (f) {
      ckEls['base_' + f.key].value = '';
      ckEls['doc_'  + f.key].value = '';
    });
    if (ckEls.docType) ckEls.docType.selectedIndex = 0;
    ckResults = [];
    ckHasResult = false;
    ckRenderEmpty();
  }

  var ckAiBusy = false; // AI 分析并发锁

  /** AI 智能分析：基于当前核对结果调用 check 模块生成解释与建议 */
  async function ckAiAnalyze() {
    if (ckAiBusy) return;
    if (!ckHasResult || ckResults.length === 0) {
      alert('请先点击「开始核对」生成核对结果，再使用 AI 分析。');
      return;
    }
    ckAiBusy = true;
    ckEls.aiBtn.disabled = true;
    ckEls.aiResult.style.display = '';
    ckEls.aiContent.textContent = 'AI 分析中，请稍候…';
    try {
      var summary = ckResults.map(function (r) {
        return r.name + '：订单基准「' + (r.baseVal || '未填写') + '」，单证数据「' + (r.docVal || '未填写') + '」，核对结果「' +
          (r.status === 'ok' ? '一致' : r.status === 'diff' ? '异常' : '待补充') + '」' + (r.note ? '（' + r.note + '）' : '');
      }).join('\n');
      var docType = ckEls.docType ? ckEls.docType.value : '';
      var context = {
        message: '请对以下订单与单证核对结果进行综合分析',
        docType: docType,
        checkResults: summary,
        outputFormat: '请用中文分点输出：1) 整体一致性评估；2) 各异常字段的风险解读与可能原因；3) 针对性处理建议与沟通话术要点；4) 需人工确认的事项清单。'
      };
      var resp = await HM_API.ai.ask('check', 'advise', context);
      if (!resp || !resp.success) {
        ckEls.aiContent.textContent = 'AI 分析失败：' + (resp && resp.error ? resp.error : '服务异常');
        return;
      }
      ckEls.aiContent.textContent = resp.answer;
    } catch (err) {
      ckEls.aiContent.textContent = 'AI 分析出错：' + (err && err.message ? err.message : '网络异常');
    } finally {
      ckAiBusy = false;
      ckEls.aiBtn.disabled = false;
    }
  }

  /** 订单异常核对初始化 */
  function ckInit() {
    if (!ckEls.resultBody) return; // 页面元素不存在时跳过
    ckRenderEmpty();
    ckUpdateOrderSelect(); // P10：初始填充订单下拉
    ckEls.checkBtn.addEventListener('click', ckRunCheck);
    ckEls.recheckBtn.addEventListener('click', ckRunCheck);
    ckEls.clearBtn.addEventListener('click', ckClearAll);
    ckEls.exportBtn.addEventListener('click', ckExportCSV);
    if (ckEls.loadOrderBtn) ckEls.loadOrderBtn.addEventListener('click', ckLoadOrder); // P10
    // AI 智能分析（基于真实核对结果，仅生成建议不修改数据）
    if (ckEls.aiBtn) ckEls.aiBtn.addEventListener('click', ckAiAnalyze);
    if (ckEls.aiClose) ckEls.aiClose.addEventListener('click', function () { ckEls.aiResult.style.display = 'none'; });
    // P10：跨模块查询知识库（以单证类型为关键词）
    if (ckEls.kbBtn) {
      ckEls.kbBtn.addEventListener('click', function () {
        hmSearchKb(ckEls.docType ? ckEls.docType.value : '');
      });
    }
    // P10：将核对报告提交至 P9 审核中心（仅提交真实核对结果）
    if (ckEls.reviewBtn) {
      ckEls.reviewBtn.addEventListener('click', function () {
        if (!ckHasResult) {
          alert('请先录入数据并点击「开始核对」，生成核对报告后再提交审核。');
          return;
        }
        var diffs = 0, missing = 0, ok = 0;
        var lines = [];
        ckResults.forEach(function (r) {
          if (r.status === 'diff') diffs++;
          else if (r.status === 'missing') missing++;
          else ok++;
          lines.push(r.name + '：基准[' + r.baseVal + '] / 单证[' + r.docVal + '] → ' +
            (r.status === 'ok' ? '一致' : r.status === 'diff' ? '异常 - ' + r.note : '待补充 - ' + r.note));
        });
        var rec = window.haimaoSubmitReview({
          title: '订单核对报告：' + (ckEls.base_no.value || '未填编号'),
          sourceModule: '订单异常核对',
          resultType: '核对报告',
          content: '单证类型：' + (ckEls.docType ? ckEls.docType.value : '—') +
            '\n一致 ' + ok + ' 项，异常 ' + diffs + ' 项，待补充 ' + missing + ' 项。\n\n' + lines.join('\n'),
          structuredData: JSON.stringify({
            docType: ckEls.docType ? ckEls.docType.value : '',
            orderNo: ckEls.base_no.value,
            total: ckResults.length,
            ok: ok,
            diff: diffs,
            missing: missing,
            details: ckResults
          })
        });
        if (rec) {
          alert('核对报告已提交至审核中心，任务编号 ' + rec.no + '。');
        } else {
          alert('提交审核失败，请检查核对结果后重试。');
        }
      });
    }
  }

  ckInit();

  /* ==================== P7：外贸知识库 ==================== */

  // 知识条目数据（localStorage 持久化存储；后续可替换为后端知识库接口）
  // { id, title, category, tags:[], content, source, createdAt, updatedAt }
  var KB_STORAGE_KEY = 'haimao_kb_entries_v1';  // 独立存储键，带版本号便于后续数据迁移
  var kbEntries = [];
  var kbSeq = 0;
  var kbEditId = null;     // 编辑模式下的知识 id（null 表示新建）
  var kbDetailId = null;   // 当前查看详情的知识 id
  var kbFilters = { keyword: '', category: '', tag: '' };

  /** 从后端 API 加载知识数据（失败时安全降级为空数组，不崩溃） */
  async function kbLoad() {
    try {
      var data = await HM_API.kb.list();
      if (!Array.isArray(data)) return [];
      var valid = [];
      var maxId = 0;
      data.forEach(function (e) {
        if (e && typeof e.id === 'number' && typeof e.title === 'string' &&
            typeof e.category === 'string' && typeof e.content === 'string') {
          if (!Array.isArray(e.tags)) e.tags = [];
          if (typeof e.source !== 'string') e.source = '';
          if (typeof e.createdAt !== 'string') e.createdAt = '';
          if (typeof e.updatedAt !== 'string') e.updatedAt = e.createdAt;
          valid.push(e);
          if (e.id > maxId) maxId = e.id;
        }
      });
      kbSeq = maxId;
      return valid;
    } catch (err) {
      console.error('知识库加载失败:', err);
      return [];
    }
  }

  /** 保存知识数据（API 模式下为空操作：数据通过单条 API 同步） */
  function kbSave() {
    // API 模式：新增/编辑/删除均通过 HM_API.kb 单条同步，无需批量保存
  }

  var kbEls = {
    statTotal:   document.getElementById('kb-stat-total'),
    statCats:    document.getElementById('kb-stat-cats'),
    statLatest:  document.getElementById('kb-stat-latest'),
    statFiltered:document.getElementById('kb-stat-filtered'),
    searchInput: document.getElementById('kb-search-input'),
    filterCat:   document.getElementById('kb-filter-category'),
    filterTag:   document.getElementById('kb-filter-tag'),
    searchBtn:   document.getElementById('kb-search-btn'),
    resetBtn:    document.getElementById('kb-reset-btn'),
    newBtn:      document.getElementById('kb-new-btn'),
    listBody:    document.getElementById('kb-list-body'),
    detail:      document.getElementById('kb-detail'),
    detailTitle: document.getElementById('kb-detail-title'),
    detailCat:   document.getElementById('kb-detail-cat'),
    detailTime:  document.getElementById('kb-detail-time'),
    detailTags:  document.getElementById('kb-detail-tags'),
    detailContent: document.getElementById('kb-detail-content'),
    detailSource:  document.getElementById('kb-detail-source'),
    detailClose:  document.getElementById('kb-detail-close'),
    modal:       document.getElementById('kb-modal'),
    modalTitle:  document.getElementById('kb-modal-title'),
    form:        document.getElementById('kb-form'),
    formTitle:   document.getElementById('kb-form-title'),
    formCategory:document.getElementById('kb-form-category'),
    formTags:    document.getElementById('kb-form-tags'),
    formContent: document.getElementById('kb-form-content'),
    formSource:  document.getElementById('kb-form-source'),
    qaInput:     document.getElementById('kb-qa-input'),
    qaBtn:       document.getElementById('kb-qa-btn'),
    qaStatus:    document.getElementById('kb-qa-status'),
    qaResult:    document.getElementById('kb-qa-result'),
    qaContent:   document.getElementById('kb-qa-result-content'),
    qaClose:     document.getElementById('kb-qa-result-close')
  };

  /** 获取知识对象 */
  function kbGetEntry(id) {
    for (var i = 0; i < kbEntries.length; i++) {
      if (kbEntries[i].id === id) return kbEntries[i];
    }
    return null;
  }

  /** 应用搜索与筛选，返回过滤后的条目数组 */
  function kbGetFiltered() {
    var kw = kbFilters.keyword.toLowerCase();
    return kbEntries.filter(function (e) {
      if (kbFilters.category && e.category !== kbFilters.category) return false;
      if (kbFilters.tag && e.tags.indexOf(kbFilters.tag) === -1) return false;
      if (kw) {
        var inTitle = e.title.toLowerCase().indexOf(kw) !== -1;
        var inContent = e.content.toLowerCase().indexOf(kw) !== -1;
        if (!inTitle && !inContent) return false;
      }
      return true;
    });
  }

  /** 渲染知识列表（含空状态） */
  function kbRenderList() {
    var filtered = kbGetFiltered();
    kbEls.listBody.innerHTML = '';
    if (filtered.length === 0) {
      var hasEntries = kbEntries.length > 0;
      kbEls.listBody.innerHTML =
        '<tr class="kb-empty-row"><td colspan="5">' +
          '<div class="od-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19a2 2 0 0 1 2-2h13"/><path d="M9 7h6M9 11h4"/></svg></div>' +
          '<p class="od-empty-text">' + (hasEntries ? '未找到匹配的知识条目' : '暂无知识条目') + '</p>' +
          '<p class="od-empty-sub">' + (hasEntries ? '尝试调整搜索关键词或筛选条件，或点击「重置」查看全部知识' : '点击右上角「新建知识」添加知识条目，数据自动保存到浏览器本地存储') + '</p>' +
        '</td></tr>';
    } else {
      filtered.forEach(function (e) {
        var tr = document.createElement('tr');
        tr.setAttribute('data-id', e.id);
        var tagsText = e.tags.length > 0 ? e.tags.join('、') : '—';
        tr.innerHTML =
          '<td>' + odEsc(e.title) + '</td>' +
          '<td>' + odEsc(e.category) + '</td>' +
          '<td>' + odEsc(tagsText) + '</td>' +
          '<td>' + odEsc(e.updatedAt) + '</td>' +
          '<td>' +
            '<button type="button" class="od-row-btn" data-act="detail">查看</button>' +
            '<button type="button" class="od-row-btn" data-act="edit">编辑</button>' +
            '<button type="button" class="od-row-btn danger" data-act="delete">删除</button>' +
          '</td>';
        kbEls.listBody.appendChild(tr);
      });
    }
    kbUpdateStats(filtered);
  }

  /** 更新统计指标 */
  function kbUpdateStats(filtered) {
    kbEls.statTotal.textContent = kbEntries.length;
    var cats = {};
    kbEntries.forEach(function (e) { cats[e.category] = true; });
    kbEls.statCats.textContent = Object.keys(cats).length;
    var latest = '';
    kbEntries.forEach(function (e) {
      if (!latest || e.updatedAt > latest) latest = e.updatedAt;
    });
    kbEls.statLatest.textContent = latest || '—';
    kbEls.statFiltered.textContent = filtered.length;
  }

  /** 从全部条目中提取标签，更新标签筛选下拉 */
  function kbUpdateTagSelect() {
    var current = kbEls.filterTag.value;
    var tags = {};
    kbEntries.forEach(function (e) {
      e.tags.forEach(function (t) { tags[t] = true; });
    });
    kbEls.filterTag.innerHTML = '<option value="">全部标签</option>';
    Object.keys(tags).sort().forEach(function (t) {
      var opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      kbEls.filterTag.appendChild(opt);
    });
    if (current && tags[current]) kbEls.filterTag.value = current;
  }

  /** 打开知识详情 */
  function kbOpenDetail(id) {
    var e = kbGetEntry(id);
    if (!e) return;
    kbDetailId = id;
    kbEls.detailTitle.textContent = e.title;
    kbEls.detail.style.display = '';
    kbRenderDetail();
    kbEls.detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /** 关闭知识详情 */
  function kbCloseDetail() {
    kbDetailId = null;
    kbEls.detail.style.display = 'none';
  }

  /** 渲染知识详情内容 */
  function kbRenderDetail() {
    var e = kbGetEntry(kbDetailId);
    if (!e) { kbCloseDetail(); return; }
    kbEls.detailTitle.textContent = e.title;
    kbEls.detailCat.textContent = e.category;
    kbEls.detailTime.textContent = '创建时间：' + e.createdAt + ' ｜ 更新时间：' + e.updatedAt;
    kbEls.detailTags.innerHTML = '';
    if (e.tags.length === 0) {
      kbEls.detailTags.innerHTML = '<span class="kb-detail-time">暂无标签</span>';
    } else {
      e.tags.forEach(function (t) {
        var span = document.createElement('span');
        span.className = 'kb-tag';
        span.textContent = t;
        kbEls.detailTags.appendChild(span);
      });
    }
    kbEls.detailContent.textContent = e.content;
    if (e.source) {
      kbEls.detailSource.innerHTML = '<strong>来源与参考资料：</strong>';
      kbEls.detailSource.appendChild(document.createTextNode(e.source));
    } else {
      kbEls.detailSource.innerHTML = '<strong>来源与参考资料：</strong>未填写';
    }
  }

  /** 打开新建知识模态框 */
  function kbOpenModal() {
    kbEditId = null;
    kbEls.form.reset();
    kbEls.modalTitle.textContent = '新建知识';
    odOpenModal('kb-modal');
  }

  /** 打开编辑知识模态框（预填内容） */
  function kbEditEntry(id) {
    var e = kbGetEntry(id);
    if (!e) return;
    kbEditId = id;
    kbEls.formTitle.value = e.title;
    kbEls.formCategory.value = e.category;
    kbEls.formTags.value = e.tags.join('，');
    kbEls.formContent.value = e.content;
    kbEls.formSource.value = e.source || '';
    kbEls.modalTitle.textContent = '编辑知识';
    odOpenModal('kb-modal');
  }

  /** 解析标签输入（支持中英文逗号分隔，去重去空） */
  function kbParseTags(s) {
    var parts = s.split(/[,，]/);
    var tags = [];
    parts.forEach(function (p) {
      var t = p.trim();
      if (t && tags.indexOf(t) === -1) tags.push(t);
    });
    return tags;
  }

  /** 知识表单提交（区分新建与编辑模式，API 持久化） */
  async function kbSubmitEntry(e) {
    e.preventDefault();
    var title = kbEls.formTitle.value.trim();
    var category = kbEls.formCategory.value;
    var content = kbEls.formContent.value.trim();
    if (!title || !category || !content) return;
    var tags = kbParseTags(kbEls.formTags.value);
    var source = kbEls.formSource.value.trim();
    var now = ckNowStr();
    if (kbEditId !== null) {
      var entry = kbGetEntry(kbEditId);
      if (entry) {
        entry.title = title;
        entry.category = category;
        entry.tags = tags;
        entry.content = content;
        entry.source = source;
        entry.updatedAt = now;
        HM_API.kb.update(entry.id, { title: title, category: category, tags: tags, content: content, source: source, updatedAt: now }).catch(function (err) { console.error('知识更新同步失败:', err); });
      }
      kbEditId = null;
    } else {
      try {
        var created = await HM_API.kb.create({ title: title, category: category, tags: tags, content: content, source: source, createdAt: now, updatedAt: now });
        kbEntries.push(created);
        if (created.id > kbSeq) kbSeq = created.id;
      } catch (err) {
        console.error('知识创建失败:', err);
        alert('知识创建失败：' + (err && err.message ? err.message : '网络错误'));
        return;
      }
    }
    kbEls.form.reset();
    odCloseModal('kb-modal');
    kbUpdateTagSelect();
    kbRenderList();
    if (kbDetailId !== null) kbRenderDetail();
  }

  /** 删除知识（二次确认，API 持久化） */
  function kbDeleteEntry(id) {
    var e = kbGetEntry(id);
    if (!e) return;
    if (!confirm('确定要删除知识「' + e.title + '」吗？删除后不可恢复。')) return;
    kbEntries = kbEntries.filter(function (en) { return en.id !== id; });
    if (kbDetailId === id) kbCloseDetail();
    kbUpdateTagSelect();
    kbRenderList();
    HM_API.kb.remove(id).catch(function (err) { console.error('知识删除同步失败:', err); });
  }

  /** 重置搜索与筛选条件 */
  function kbResetFilters() {
    kbFilters.keyword = '';
    kbFilters.category = '';
    kbFilters.tag = '';
    kbEls.searchInput.value = '';
    kbEls.filterCat.value = '';
    kbEls.filterTag.value = '';
    kbRenderList();
  }

  var kbQaBusy = false; // AI 问答并发锁

  /** AI 问答：优先检索本地知识库相关条目作为上下文，调用 knowledge 模块作答 */
  async function kbAskAi() {
    if (kbQaBusy) return;
    var question = kbEls.qaInput ? kbEls.qaInput.value.trim() : '';
    if (!question) {
      if (kbEls.qaStatus) { kbEls.qaStatus.textContent = '请输入您的问题。'; kbEls.qaStatus.className = 'em-status error'; }
      return;
    }
    kbQaBusy = true;
    kbEls.qaBtn.disabled = true;
    if (kbEls.qaStatus) { kbEls.qaStatus.textContent = 'AI 检索知识库并生成回答中，请稍候…'; kbEls.qaStatus.className = 'em-status notice'; }
    kbEls.qaResult.style.display = '';
    kbEls.qaContent.textContent = '思考中…';
    try {
      // 本地关键词检索：取与问题最相关的知识条目（最多5条）作为附加上下文
      var kws = question.replace(/[？?，,。.、！!]/g, ' ').split(/\s+/).filter(function (w) { return w.length > 1; });
      var related = kbEntries.filter(function (e) {
        var text = (e.title + ' ' + e.content + ' ' + e.tags.join(' ')).toLowerCase();
        return kws.some(function (w) { return text.indexOf(w.toLowerCase()) !== -1; });
      }).slice(0, 5);
      var kbContext = related.map(function (e) {
        return '【' + e.title + '】（分类：' + e.category + '）\n' + e.content;
      }).join('\n---\n');
      var context = {
        message: question,
        kbContext: kbContext || '（本地知识库未检索到直接相关条目，请基于外贸专业知识作答）',
        outputFormat: '请用中文回答，条理清晰；若引用了知识库条目请注明出处标题；若问题超出外贸领域请礼貌说明。'
      };
      var resp = await HM_API.ai.ask('knowledge', 'chat', context);
      if (!resp || !resp.success) {
        kbEls.qaContent.textContent = 'AI 问答失败：' + (resp && resp.error ? resp.error : '服务异常');
        if (kbEls.qaStatus) { kbEls.qaStatus.textContent = ''; kbEls.qaStatus.className = 'em-status'; }
        return;
      }
      kbEls.qaContent.textContent = resp.answer;
      if (kbEls.qaStatus) {
        kbEls.qaStatus.textContent = related.length > 0 ? '已参考 ' + related.length + ' 条本地知识库条目作答。' : '已基于外贸专业知识作答。';
        kbEls.qaStatus.className = 'em-status success';
      }
    } catch (err) {
      kbEls.qaContent.textContent = 'AI 问答出错：' + (err && err.message ? err.message : '网络异常');
      if (kbEls.qaStatus) { kbEls.qaStatus.textContent = ''; kbEls.qaStatus.className = 'em-status'; }
    } finally {
      kbQaBusy = false;
      kbEls.qaBtn.disabled = false;
    }
  }

  /** 外贸知识库初始化 */
  async function kbInit() {
    if (!kbEls.listBody) return; // 页面元素不存在时跳过
    await hmMigrateReady; // 确保首次迁移完成后再加载
    kbEntries = await kbLoad();        // 从后端 API 加载持久化数据，再渲染列表与统计
    kbRenderList();

    // 新建按钮
    kbEls.newBtn.addEventListener('click', kbOpenModal);

    // 搜索与筛选
    kbEls.searchBtn.addEventListener('click', function () {
      kbFilters.keyword = kbEls.searchInput.value.trim();
      kbRenderList();
    });
    kbEls.searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        kbFilters.keyword = kbEls.searchInput.value.trim();
        kbRenderList();
      }
    });
    kbEls.filterCat.addEventListener('change', function () {
      kbFilters.category = kbEls.filterCat.value;
      kbRenderList();
    });
    kbEls.filterTag.addEventListener('change', function () {
      kbFilters.tag = kbEls.filterTag.value;
      kbRenderList();
    });
    kbEls.resetBtn.addEventListener('click', kbResetFilters);

    // AI 问答
    if (kbEls.qaBtn) kbEls.qaBtn.addEventListener('click', kbAskAi);
    if (kbEls.qaInput) kbEls.qaInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); kbAskAi(); }
    });
    if (kbEls.qaClose) kbEls.qaClose.addEventListener('click', function () { kbEls.qaResult.style.display = 'none'; });

    // 详情面板关闭
    kbEls.detailClose.addEventListener('click', kbCloseDetail);

    // 表单提交
    kbEls.form.addEventListener('submit', kbSubmitEntry);

    // 知识列表操作（事件委托）
    kbEls.listBody.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act]');
      if (!btn) return;
      var tr = btn.closest('tr');
      var id = parseInt(tr.getAttribute('data-id'), 10);
      if (isNaN(id)) return;
      var act = btn.getAttribute('data-act');
      if (act === 'detail') kbOpenDetail(id);
      else if (act === 'edit') kbEditEntry(id);
      else if (act === 'delete') kbDeleteEntry(id);
    });
  }

  kbInit();

  /* ==================== P8：客户档案与AI记忆 ==================== */

  // 客户数据（localStorage 持久化；后续可替换为后端 CRM API）
  // 数据分层：客户主档 crmCustomers，每条客户内嵌 records[]（沟通记录）与 memories[]（AI客户记忆）
  // 客户主档字段：{ id, name, company, country, website, source, level, status,
  //   contactName, contactTitle, email, phone, whatsapp,
  //   mainProducts, interestCategories, purchaseQty, targetPrice, currency, targetMarket,
  //   paymentPref, tradeTerms, commLang, emailTone, commHabit, notes,
  //   tags:[], records:[], memories:[], createdAt, updatedAt }
  // 沟通记录：{ id, time, type, content, feedback, nextStep }
  // 客户记忆：{ id, dimension, content, source('manual'|'ai'), createdAt, updatedAt }
  var CRM_STORAGE_KEY = 'haimao_customer_records_v1';  // 独立存储键，不影响 P7 知识库
  var crmCustomers = [];
  var crmSeq = 0;
  var crmEditId = null;       // 编辑模式下的客户 id（null 表示新建）
  var crmDetailId = null;     // 当前查看详情的客户 id
  var crmEditMemoryId = null; // 编辑模式下的记忆 id（null 表示新建）
  var crmFilters = { keyword: '', country: '', level: '', status: '' };

  /** 从后端 API 加载客户数据（失败时安全降级为空数组） */
  async function crmLoad() {
    try {
      var data = await HM_API.customers.list();
      if (!Array.isArray(data)) return [];
      var valid = [];
      var maxId = 0;
      var strFields = ['company','country','website','source','level','status','contactName',
        'contactTitle','email','phone','whatsapp','mainProducts','interestCategories','purchaseQty',
        'targetPrice','currency','targetMarket','paymentPref','tradeTerms','commLang','emailTone',
        'commHabit','notes','createdAt','updatedAt'];
      data.forEach(function (c) {
        if (c && typeof c.id === 'number' && typeof c.name === 'string') {
          strFields.forEach(function (f) { if (typeof c[f] !== 'string') c[f] = ''; });
          if (!Array.isArray(c.tags)) c.tags = [];
          if (!Array.isArray(c.records)) c.records = [];
          if (!Array.isArray(c.memories)) c.memories = [];
          // 校验内嵌沟通记录与记忆结构，过滤损坏条目
          c.records = c.records.filter(function (r) {
            return r && typeof r.id === 'number' && typeof r.time === 'string' && typeof r.content === 'string';
          });
          c.memories = c.memories.filter(function (m) {
            return m && typeof m.id === 'number' && typeof m.dimension === 'string' && typeof m.content === 'string';
          });
          c.memories.forEach(function (m) {
            if (typeof m.source !== 'string') m.source = 'manual';
            if (typeof m.createdAt !== 'string') m.createdAt = '';
            if (typeof m.updatedAt !== 'string') m.updatedAt = m.createdAt;
          });
          valid.push(c);
          if (c.id > maxId) maxId = c.id;
        }
      });
      crmSeq = maxId;
      return valid;
    } catch (err) {
      console.error('客户数据加载失败:', err);
      return [];
    }
  }

  /** 保存客户数据（API 模式下为空操作：数据通过单条 API 同步） */
  function crmSave() {
    // API 模式：新增/编辑/删除均通过 HM_API.customers 单条同步，无需批量保存
  }

  var crmEls = {
    statTotal:     document.getElementById('crm-stat-total'),
    statActive:    document.getElementById('crm-stat-active'),
    statPotential: document.getElementById('crm-stat-potential'),
    statLevelA:    document.getElementById('crm-stat-levela'),
    searchInput:   document.getElementById('crm-search-input'),
    filterCountry: document.getElementById('crm-filter-country'),
    filterLevel:   document.getElementById('crm-filter-level'),
    filterStatus:  document.getElementById('crm-filter-status'),
    searchBtn:     document.getElementById('crm-search-btn'),
    resetBtn:      document.getElementById('crm-reset-btn'),
    newBtn:        document.getElementById('crm-new-btn'),
    listBody:      document.getElementById('crm-list-body'),
    detail:        document.getElementById('crm-detail'),
    detailTitle:   document.getElementById('crm-detail-title'),
    detailBadges:  document.getElementById('crm-detail-badges'),
    detailInfo:    document.getElementById('crm-detail-info'),
    detailOrders:  document.getElementById('crm-detail-orders'), // P10：关联订单容器
    detailRecords: document.getElementById('crm-detail-records'),
    detailMemories:document.getElementById('crm-detail-memories'),
    detailClose:   document.getElementById('crm-detail-close'),
    recordAddBtn:  document.getElementById('crm-record-add-btn'),
    memoryAddBtn:  document.getElementById('crm-memory-add-btn'),
    modal:         document.getElementById('crm-modal'),
    modalTitle:    document.getElementById('crm-modal-title'),
    form:          document.getElementById('crm-form'),
    formName:      document.getElementById('crm-form-name'),
    formCompany:   document.getElementById('crm-form-company'),
    formCountry:   document.getElementById('crm-form-country'),
    formWebsite:   document.getElementById('crm-form-website'),
    formSource:    document.getElementById('crm-form-source'),
    formLevel:     document.getElementById('crm-form-level'),
    formStatus:    document.getElementById('crm-form-status'),
    formTags:      document.getElementById('crm-form-tags'),
    formContactName:  document.getElementById('crm-form-contact-name'),
    formContactTitle: document.getElementById('crm-form-contact-title'),
    formEmail:     document.getElementById('crm-form-email'),
    formPhone:     document.getElementById('crm-form-phone'),
    formWhatsapp:  document.getElementById('crm-form-whatsapp'),
    formMainProducts: document.getElementById('crm-form-main-products'),
    formInterest:  document.getElementById('crm-form-interest'),
    formQty:       document.getElementById('crm-form-qty'),
    formPrice:     document.getElementById('crm-form-price'),
    formCurrency:  document.getElementById('crm-form-currency'),
    formMarket:    document.getElementById('crm-form-market'),
    formPayment:   document.getElementById('crm-form-payment'),
    formTerms:     document.getElementById('crm-form-terms'),
    formLang:      document.getElementById('crm-form-lang'),
    formTone:      document.getElementById('crm-form-tone'),
    formHabit:     document.getElementById('crm-form-habit'),
    formNotes:     document.getElementById('crm-form-notes'),
    recordModal:   document.getElementById('crm-record-modal'),
    recordForm:    document.getElementById('crm-record-form'),
    recordFormTime:    document.getElementById('crm-record-form-time'),
    recordFormType:    document.getElementById('crm-record-form-type'),
    recordFormContent: document.getElementById('crm-record-form-content'),
    recordFormFeedback:document.getElementById('crm-record-form-feedback'),
    recordFormNext:    document.getElementById('crm-record-form-next'),
    memoryModal:       document.getElementById('crm-memory-modal'),
    memoryModalTitle:  document.getElementById('crm-memory-modal-title'),
    memoryForm:        document.getElementById('crm-memory-form'),
    memoryFormDimension: document.getElementById('crm-memory-form-dimension'),
    memoryFormContent: document.getElementById('crm-memory-form-content'),
    aiAction:      document.getElementById('crm-ai-action'),
    aiBtn:         document.getElementById('crm-ai-btn'),
    aiStatus:      document.getElementById('crm-ai-status'),
    aiResult:      document.getElementById('crm-ai-result'),
    aiText:        document.getElementById('crm-ai-text'),
    aiHide:        document.getElementById('crm-ai-hide'),
    aiMemSuggest:  document.getElementById('crm-ai-mem-suggest'),
    aiMemList:     document.getElementById('crm-ai-mem-list')
  };

  /** 获取客户对象 */
  function crmGetCustomer(id) {
    for (var i = 0; i < crmCustomers.length; i++) {
      if (crmCustomers[i].id === id) return crmCustomers[i];
    }
    return null;
  }

  /** 应用搜索与筛选，返回过滤后的客户数组 */
  function crmGetFiltered() {
    var kw = crmFilters.keyword.toLowerCase();
    return crmCustomers.filter(function (c) {
      if (crmFilters.country && c.country !== crmFilters.country) return false;
      if (crmFilters.level && c.level !== crmFilters.level) return false;
      if (crmFilters.status && c.status !== crmFilters.status) return false;
      if (kw) {
        var hay = [c.name, c.company, c.country, c.contactName, c.mainProducts, c.interestCategories].join(' ').toLowerCase();
        if (hay.indexOf(kw) === -1) return false;
      }
      return true;
    });
  }

  /** 更新统计指标（客户总数 / 合作客户数 / 潜在客户数 / A类客户数） */
  function crmUpdateStats() {
    var total = crmCustomers.length, active = 0, potential = 0, levelA = 0;
    crmCustomers.forEach(function (c) {
      if (c.status === '合作中') active++;
      if (c.status === '潜在客户') potential++;
      if (c.level === 'A') levelA++;
    });
    if (crmEls.statTotal) crmEls.statTotal.textContent = total;
    if (crmEls.statActive) crmEls.statActive.textContent = active;
    if (crmEls.statPotential) crmEls.statPotential.textContent = potential;
    if (crmEls.statLevelA) crmEls.statLevelA.textContent = levelA;
  }

  /** 根据现有客户数据刷新国家/地区筛选下拉（保留当前选中项） */
  function crmUpdateCountryFilter() {
    if (!crmEls.filterCountry) return;
    var current = crmEls.filterCountry.value;
    var countries = [];
    crmCustomers.forEach(function (c) {
      if (c.country && countries.indexOf(c.country) === -1) countries.push(c.country);
    });
    countries.sort();
    crmEls.filterCountry.innerHTML = '<option value="">全部国家/地区</option>';
    countries.forEach(function (cty) {
      var opt = document.createElement('option');
      opt.value = cty; opt.textContent = cty;
      crmEls.filterCountry.appendChild(opt);
    });
    if (current) crmEls.filterCountry.value = current;
  }

  /** 解析标签输入（支持中英文逗号分隔） */
  function crmParseTags(raw) {
    if (!raw) return [];
    return raw.split(/[,，]/).map(function (t) { return t.trim(); })
      .filter(function (t) { return t.length > 0; });
  }

  /** 当前时间字符串（YYYY-MM-DD HH:mm） */
  function crmNow() {
    var d = new Date();
    function p(n) { return n < 10 ? '0' + n : '' + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /** 渲染客户列表（含空状态行） */
  function crmRenderList() {
    if (!crmEls.listBody) return;
    var filtered = crmGetFiltered();
    crmEls.listBody.innerHTML = '';
    if (filtered.length === 0) {
      var hasData = crmCustomers.length > 0;
      crmEls.listBody.innerHTML =
        '<tr class="crm-empty-row"><td colspan="7">' +
          '<div class="od-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>' +
          '<p class="od-empty-text">' + (hasData ? '未找到匹配的客户' : '暂无客户档案') + '</p>' +
          '<p class="od-empty-sub">' + (hasData ? '尝试调整搜索关键词或筛选条件，或点击「重置」查看全部客户' : '点击右上角「新建客户」添加客户资料，数据自动保存到浏览器本地存储') + '</p>' +
        '</td></tr>';
    } else {
      filtered.forEach(function (c) {
        var tr = document.createElement('tr');
        tr.setAttribute('data-id', c.id);
        var lvHtml = '—';
        if (c.level) {
          var lvClass = c.level === 'A' ? 'lv-a' : (c.level === 'B' ? 'lv-b' : 'lv-c');
          lvHtml = '<span class="crm-level-badge ' + lvClass + '">' + odEsc(c.level) + '类</span>';
        }
        var stHtml = odEsc(c.status || '—');
        if (c.status) {
          var stClass = c.status === '合作中' ? 'st-active' : (c.status === '潜在客户' ? 'st-potential' : 'st-paused');
          stHtml = '<span class="crm-status-badge ' + stClass + '">' + odEsc(c.status) + '</span>';
        }
        var tagsHtml = c.tags.length > 0
          ? c.tags.map(function (t) { return '<span class="crm-tag">' + odEsc(t) + '</span>'; }).join(' ')
          : '—';
        tr.innerHTML =
          '<td>' + odEsc(c.name) + '</td>' +
          '<td>' + odEsc(c.country || '—') + '</td>' +
          '<td>' + lvHtml + '</td>' +
          '<td>' + stHtml + '</td>' +
          '<td>' + tagsHtml + '</td>' +
          '<td>' + odEsc(c.updatedAt || '—') + '</td>' +
          '<td>' +
            '<button type="button" class="od-row-btn" data-act="detail">详情</button>' +
            '<button type="button" class="od-row-btn" data-act="edit">编辑</button>' +
            '<button type="button" class="od-row-btn danger" data-act="delete">删除</button>' +
          '</td>';
        crmEls.listBody.appendChild(tr);
      });
    }
  }

  /** 打开新建客户模态框 */
  function crmOpenModal() {
    crmEditId = null;
    crmEls.modalTitle.textContent = '新建客户';
    crmEls.form.reset();
    crmEls.formStatus.value = '潜在客户';
    odOpenModal('crm-modal');
  }

  /** 打开编辑客户模态框并回填表单 */
  function crmEditCustomer(id) {
    var c = crmGetCustomer(id);
    if (!c) return;
    crmEditId = id;
    crmEls.modalTitle.textContent = '编辑客户';
    crmEls.formName.value = c.name;
    crmEls.formCompany.value = c.company;
    crmEls.formCountry.value = c.country;
    crmEls.formWebsite.value = c.website;
    crmEls.formSource.value = c.source;
    crmEls.formLevel.value = c.level;
    crmEls.formStatus.value = c.status || '潜在客户';
    crmEls.formTags.value = c.tags.join(',');
    crmEls.formContactName.value = c.contactName;
    crmEls.formContactTitle.value = c.contactTitle;
    crmEls.formEmail.value = c.email;
    crmEls.formPhone.value = c.phone;
    crmEls.formWhatsapp.value = c.whatsapp;
    crmEls.formMainProducts.value = c.mainProducts;
    crmEls.formInterest.value = c.interestCategories;
    crmEls.formQty.value = c.purchaseQty;
    crmEls.formPrice.value = c.targetPrice;
    crmEls.formCurrency.value = c.currency;
    crmEls.formMarket.value = c.targetMarket;
    crmEls.formPayment.value = c.paymentPref;
    crmEls.formTerms.value = c.tradeTerms;
    crmEls.formLang.value = c.commLang;
    crmEls.formTone.value = c.emailTone;
    crmEls.formHabit.value = c.commHabit;
    crmEls.formNotes.value = c.notes;
    odOpenModal('crm-modal');
  }

  /** 提交客户表单（新建或编辑），API 持久化 */
  async function crmSubmitCustomer(e) {
    e.preventDefault();
    var name = crmEls.formName.value.trim();
    if (!name) return;
    var now = crmNow();
    var data = {
      name: name,
      company: crmEls.formCompany.value.trim(),
      country: crmEls.formCountry.value.trim(),
      website: crmEls.formWebsite.value.trim(),
      source: crmEls.formSource.value,
      level: crmEls.formLevel.value,
      status: crmEls.formStatus.value,
      tags: crmParseTags(crmEls.formTags.value),
      contactName: crmEls.formContactName.value.trim(),
      contactTitle: crmEls.formContactTitle.value.trim(),
      email: crmEls.formEmail.value.trim(),
      phone: crmEls.formPhone.value.trim(),
      whatsapp: crmEls.formWhatsapp.value.trim(),
      mainProducts: crmEls.formMainProducts.value.trim(),
      interestCategories: crmEls.formInterest.value.trim(),
      purchaseQty: crmEls.formQty.value.trim(),
      targetPrice: crmEls.formPrice.value.trim(),
      currency: crmEls.formCurrency.value,
      targetMarket: crmEls.formMarket.value.trim(),
      paymentPref: crmEls.formPayment.value,
      tradeTerms: crmEls.formTerms.value,
      commLang: crmEls.formLang.value,
      emailTone: crmEls.formTone.value,
      commHabit: crmEls.formHabit.value.trim(),
      notes: crmEls.formNotes.value.trim()
    };
    if (crmEditId !== null) {
      var c = crmGetCustomer(crmEditId);
      if (!c) { crmEditId = null; return; }
      for (var k in data) { if (data.hasOwnProperty(k)) c[k] = data[k]; }
      c.updatedAt = now;
      HM_API.customers.update(c.id, data).catch(function (err) { console.error('客户更新同步失败:', err); });
    } else {
      try {
        data.records = [];
        data.memories = [];
        data.createdAt = now;
        data.updatedAt = now;
        var created = await HM_API.customers.create(data);
        crmCustomers.push(created);
        if (created.id > crmSeq) crmSeq = created.id;
      } catch (err) {
        console.error('客户创建失败:', err);
        alert('客户创建失败：' + (err && err.message ? err.message : '网络错误'));
        return;
      }
    }
    odCloseModal('crm-modal');
    crmUpdateCountryFilter();
    crmRenderList();
    crmUpdateStats();
    // 若正在查看被编辑客户的详情，同步刷新详情面板
    if (crmEditId !== null && crmEditId === crmDetailId) crmRenderDetail();
    crmEditId = null;
  }

  /** 删除客户（二次确认，沟通记录与记忆一并删除，API 持久化） */
  function crmDeleteCustomer(id) {
    var c = crmGetCustomer(id);
    if (!c) return;
    if (!confirm('确定删除客户「' + c.name + '」吗？\n该客户的沟通记录与AI记忆将一并删除，删除后不可恢复。')) return;
    crmCustomers = crmCustomers.filter(function (x) { return x.id !== id; });
    HM_API.customers.remove(id).catch(function (err) { console.error('客户删除同步失败:', err); });
    if (crmDetailId === id) crmCloseDetail();
    crmUpdateCountryFilter();
    crmRenderList();
    crmUpdateStats();
  }

  /** 重置搜索与筛选条件 */
  function crmResetFilters() {
    crmFilters = { keyword: '', country: '', level: '', status: '' };
    crmEls.searchInput.value = '';
    crmEls.filterCountry.value = '';
    crmEls.filterLevel.value = '';
    crmEls.filterStatus.value = '';
    crmRenderList();
  }

  /** 构建单个信息项 HTML（空值显示 —） */
  function crmInfoItem(label, value) {
    return '<div class="crm-info-item"><span class="crm-info-label">' + odEsc(label) +
      '</span><span class="crm-info-value">' + (value ? odEsc(value) : '—') + '</span></div>';
  }

  /** 构建信息分组 HTML（标题图标 + 三列网格） */
  function crmInfoGroup(title, svgInner, items) {
    return '<div class="crm-info-group">' +
      '<h4 class="crm-info-group-title"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + svgInner + '</svg>' + odEsc(title) + '</h4>' +
      '<div class="crm-info-grid">' + items.join('') + '</div></div>';
  }

  /** 打开客户详情面板 */
  function crmOpenDetail(id) {
    var c = crmGetCustomer(id);
    if (!c) return;
    crmDetailId = id;
    crmRenderDetail();
    crmEls.detail.style.display = '';
    crmEls.detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /** 关闭客户详情面板 */
  function crmCloseDetail() {
    crmDetailId = null;
    if (crmEls.detail) crmEls.detail.style.display = 'none';
  }

  /** 渲染客户详情（徽章 + 四组资料 + 沟通记录 + AI记忆） */
  function crmRenderDetail() {
    var c = crmGetCustomer(crmDetailId);
    if (!c) { crmCloseDetail(); return; }
    crmEls.detailTitle.textContent = c.name;
    // 顶部徽章：等级 / 状态 / 国家 / 标签
    var badges = '';
    if (c.level) {
      var lvClass = c.level === 'A' ? 'lv-a' : (c.level === 'B' ? 'lv-b' : 'lv-c');
      badges += '<span class="crm-level-badge ' + lvClass + '">' + odEsc(c.level) + '类客户</span>';
    }
    if (c.status) {
      var stClass = c.status === '合作中' ? 'st-active' : (c.status === '潜在客户' ? 'st-potential' : 'st-paused');
      badges += '<span class="crm-status-badge ' + stClass + '">' + odEsc(c.status) + '</span>';
    }
    if (c.country) badges += '<span class="crm-tag">' + odEsc(c.country) + '</span>';
    c.tags.forEach(function (t) { badges += '<span class="crm-tag">' + odEsc(t) + '</span>'; });
    crmEls.detailBadges.innerHTML = badges;
    // 四组资料
    var groups = '';
    groups += crmInfoGroup('基本信息', '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>', [
      crmInfoItem('客户名称', c.name),
      crmInfoItem('公司名称', c.company),
      crmInfoItem('国家/地区', c.country),
      crmInfoItem('客户官网', c.website),
      crmInfoItem('客户来源', c.source),
      crmInfoItem('创建时间', c.createdAt)
    ]);
    groups += crmInfoGroup('联系人信息', '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>', [
      crmInfoItem('联系人姓名', c.contactName),
      crmInfoItem('职务', c.contactTitle),
      crmInfoItem('邮箱', c.email),
      crmInfoItem('电话', c.phone),
      crmInfoItem('WhatsApp', c.whatsapp)
    ]);
    groups += crmInfoGroup('业务信息', '<rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>', [
      crmInfoItem('主要采购产品', c.mainProducts),
      crmInfoItem('感兴趣的产品类别', c.interestCategories),
      crmInfoItem('常用采购数量', c.purchaseQty),
      crmInfoItem('目标采购价格', c.targetPrice),
      crmInfoItem('常用币种', c.currency),
      crmInfoItem('目标市场', c.targetMarket),
      crmInfoItem('付款偏好', c.paymentPref),
      crmInfoItem('常用贸易术语', c.tradeTerms)
    ]);
    groups += crmInfoGroup('沟通偏好', '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>', [
      crmInfoItem('首选沟通语言', c.commLang),
      crmInfoItem('商务邮件语气', c.emailTone),
      crmInfoItem('客户沟通习惯', c.commHabit),
      crmInfoItem('特别注意事项', c.notes)
    ]);
    crmEls.detailInfo.innerHTML = groups;
    crmRenderRelatedOrders(c); // P10：渲染关联订单
    crmRenderRecords(c);
    crmRenderMemories(c);
  }

  /** P10：渲染客户关联订单（读取 P5 odOrders 按 customerId 过滤，点击可跳转订单详情） */
  function crmRenderRelatedOrders(c) {
    if (!crmEls.detailOrders) return;
    var related = odOrders.filter(function (o) { return o.customerId === c.id; });
    if (!related.length) {
      crmEls.detailOrders.innerHTML = '<div class="crm-empty-block">暂无关联订单。在「订单与待办管理」新建订单时选择本客户即可自动关联。</div>';
      return;
    }
    var html = '<div class="op-table-wrap od-inner-table"><table class="op-table"><thead><tr>' +
      '<th>订单编号</th><th>订单金额</th><th>币种</th><th>交货日期</th><th>订单状态</th>' +
      '</tr></thead><tbody>';
    related.forEach(function (o) {
      var stCls = OD_STATUS_CLASS[o.status] || 'od-status-s0';
      html += '<tr class="crm-related-order-row" data-oid="' + o.id + '">' +
        '<td><span class="crm-order-link">' + odEsc(o.no) + '</span></td>' +
        '<td>' + odEsc(o.amount || '—') + '</td>' +
        '<td>' + odEsc(o.currency || '—') + '</td>' +
        '<td>' + odEsc(o.delivery || '—') + '</td>' +
        '<td><span class="od-status ' + stCls + '">' + odEsc(o.status) + '</span></td>' +
        '</tr>';
    });
    html += '</tbody></table></div>';
    crmEls.detailOrders.innerHTML = html;
  }

  /** 渲染沟通记录时间线（按时间倒序） */
  function crmRenderRecords(c) {
    if (!crmEls.detailRecords) return;
    if (!c.records.length) {
      crmEls.detailRecords.innerHTML = '<div class="crm-empty-block">暂无沟通记录，点击右上角「添加沟通记录」记录每次客户沟通。</div>';
      return;
    }
    var sorted = c.records.slice().sort(function (a, b) { return b.time.localeCompare(a.time); });
    crmEls.detailRecords.innerHTML = '<div class="crm-timeline">' + sorted.map(function (r) {
      var extra = '';
      if (r.feedback) extra += '<div class="crm-record-extra"><strong>客户反馈：</strong>' + odEsc(r.feedback) + '</div>';
      if (r.nextStep) extra += '<div class="crm-record-extra"><strong>下一步计划：</strong>' + odEsc(r.nextStep) + '</div>';
      return '<div class="crm-timeline-item">' +
        '<div class="crm-timeline-head">' +
          '<span class="crm-record-type">' + odEsc(r.type || '日常跟进') + '</span>' +
          '<span class="crm-record-time">' + odEsc(r.time) + '</span>' +
          '<button type="button" class="crm-record-del" data-rec-id="' + r.id + '" title="删除该记录">删除</button>' +
        '</div>' +
        '<div class="crm-record-content">' + odEsc(r.content) + '</div>' + extra +
      '</div>';
    }).join('') + '</div>';
  }

  /** 打开添加沟通记录模态框（预填当前时间） */
  function crmOpenRecordModal() {
    if (crmDetailId === null) return;
    crmEls.recordForm.reset();
    crmEls.recordFormTime.value = crmNow();
    odOpenModal('crm-record-modal');
  }

  /** 提交沟通记录（添加到当前客户，自动保存） */
  function crmSubmitRecord(e) {
    e.preventDefault();
    var c = crmGetCustomer(crmDetailId);
    if (!c) return;
    var time = crmEls.recordFormTime.value.trim();
    var content = crmEls.recordFormContent.value.trim();
    if (!time || !content) return;
    c.records.push({
      id: Date.now(),
      time: time,
      type: crmEls.recordFormType.value || '日常跟进',
      content: content,
      feedback: crmEls.recordFormFeedback.value.trim(),
      nextStep: crmEls.recordFormNext.value.trim()
    });
    c.updatedAt = crmNow();
    HM_API.customers.update(c.id, { records: c.records, updatedAt: c.updatedAt }).catch(function (err) { console.error('沟通记录同步失败:', err); });
    odCloseModal('crm-record-modal');
    crmRenderRecords(c);
  }

  /** 删除一条沟通记录（二次确认，API 持久化） */
  function crmDeleteRecord(recId) {
    var c = crmGetCustomer(crmDetailId);
    if (!c) return;
    if (!confirm('确定删除该沟通记录吗？')) return;
    c.records = c.records.filter(function (r) { return r.id !== recId; });
    HM_API.customers.update(c.id, { records: c.records }).catch(function (err) { console.error('沟通记录删除同步失败:', err); });
    crmRenderRecords(c);
  }

  /** 渲染AI客户记忆列表（人工维护与 AI 提取以徽章区分） */
  function crmRenderMemories(c) {
    if (!crmEls.detailMemories) return;
    if (!c.memories.length) {
      crmEls.detailMemories.innerHTML = '<div class="crm-empty-block">暂无客户记忆，点击右上角「添加记忆」沉淀客户长期偏好与特殊要求。</div>';
      return;
    }
    crmEls.detailMemories.innerHTML = '<div class="crm-memory-list">' + c.memories.map(function (m) {
      var srcLabel = m.source === 'ai' ? 'AI提取' : '人工维护';
      var srcClass = m.source === 'ai' ? 'src-ai' : 'src-manual';
      return '<div class="crm-memory-card">' +
        '<div class="crm-memory-head">' +
          '<span class="crm-memory-dimension">' + odEsc(m.dimension) + '</span>' +
          '<span class="crm-memory-source ' + srcClass + '">' + srcLabel + '</span>' +
          '<span class="crm-memory-time">更新于 ' + odEsc(m.updatedAt || m.createdAt || '—') + '</span>' +
          '<span class="crm-memory-actions">' +
            '<button type="button" data-mem-act="edit" data-mem-id="' + m.id + '">修改</button>' +
            '<button type="button" class="mem-del" data-mem-act="delete" data-mem-id="' + m.id + '">删除</button>' +
          '</span>' +
        '</div>' +
        '<div class="crm-memory-content">' + odEsc(m.content) + '</div>' +
      '</div>';
    }).join('') + '</div>';
  }

  /** 打开添加客户记忆模态框 */
  function crmOpenMemoryModal() {
    if (crmDetailId === null) return;
    crmEditMemoryId = null;
    crmEls.memoryModalTitle.textContent = '添加客户记忆';
    crmEls.memoryForm.reset();
    odOpenModal('crm-memory-modal');
  }

  /** 打开编辑客户记忆模态框并回填 */
  function crmEditMemory(memId) {
    var c = crmGetCustomer(crmDetailId);
    if (!c) return;
    var m = null;
    for (var i = 0; i < c.memories.length; i++) {
      if (c.memories[i].id === memId) { m = c.memories[i]; break; }
    }
    if (!m) return;
    crmEditMemoryId = memId;
    crmEls.memoryModalTitle.textContent = '修改客户记忆';
    crmEls.memoryFormDimension.value = m.dimension;
    crmEls.memoryFormContent.value = m.content;
    odOpenModal('crm-memory-modal');
  }

  /** 提交客户记忆（新建或修改；人工操作固定 source='manual'，AI 自动提取的记忆未来标记为 'ai'） */
  function crmSubmitMemory(e) {
    e.preventDefault();
    var c = crmGetCustomer(crmDetailId);
    if (!c) return;
    var dimension = crmEls.memoryFormDimension.value;
    var content = crmEls.memoryFormContent.value.trim();
    if (!dimension || !content) return;
    var now = crmNow();
    if (crmEditMemoryId !== null) {
      for (var i = 0; i < c.memories.length; i++) {
        if (c.memories[i].id === crmEditMemoryId) {
          c.memories[i].dimension = dimension;
          c.memories[i].content = content;
          c.memories[i].updatedAt = now;
          break;
        }
      }
    } else {
      c.memories.push({
        id: Date.now(),
        dimension: dimension,
        content: content,
        source: 'manual',  // 人工维护；与未来 AI 自动提取的记忆明确区分
        createdAt: now,
        updatedAt: now
      });
    }
    c.updatedAt = now;
    HM_API.customers.update(c.id, { memories: c.memories, updatedAt: now }).catch(function (err) { console.error('客户记忆同步失败:', err); });
    odCloseModal('crm-memory-modal');
    crmRenderMemories(c);
    crmEditMemoryId = null;
  }

  /** 删除一条客户记忆（二次确认，API 持久化） */
  function crmDeleteMemory(memId) {
    var c = crmGetCustomer(crmDetailId);
    if (!c) return;
    if (!confirm('确定删除该客户记忆吗？')) return;
    c.memories = c.memories.filter(function (m) { return m.id !== memId; });
    HM_API.customers.update(c.id, { memories: c.memories }).catch(function (err) { console.error('客户记忆删除同步失败:', err); });
    crmRenderMemories(c);
  }

  /**
   * 【AI Agent 接口预留】获取指定客户的记忆列表，供未来 AI Agent 自动读取客户长期偏好。
   * 接入真实模型后，AI Agent 可通过此接口获取记忆用于邮件生成、跟进建议、客户画像等场景。
   * @param {number} customerId - 客户 id
   * @param {string} [dimension] - 可选，按记忆维度过滤
   * @returns {Array} 记忆数组副本（不暴露内部引用）
   */
  function crmGetMemoriesForAI(customerId, dimension) {
    var c = crmGetCustomer(customerId);
    if (!c) return [];
    return c.memories.filter(function (m) {
      return !dimension || m.dimension === dimension;
    }).map(function (m) {
      return { dimension: m.dimension, content: m.content, source: m.source, updatedAt: m.updatedAt };
    });
  }

  var crmAiBusy = false; // AI 分析并发锁

  /** AI 客户分析：基于当前客户真实档案/沟通记录/记忆调用 customer 模块 */
  async function crmRunAiAnalysis() {
    if (crmAiBusy) return;
    if (crmDetailId === null) return;
    var c = crmGetCustomer(crmDetailId);
    if (!c) return;
    var action = crmEls.aiAction ? crmEls.aiAction.value : 'customer_profile';
    var actionMap = {
      customer_profile: { task: 'analyze', desc: '客户画像分析' },
      comm_summary:     { task: 'analyze', desc: '沟通记录总结' },
      need_preference:   { task: 'analyze', desc: '需求与偏好分析' },
      followup_advice:   { task: 'advise',  desc: '客户跟进建议' },
      memory_suggest:    { task: 'analyze', desc: '新客户记忆建议' }
    };
    var cfg = actionMap[action] || actionMap.customer_profile;
    crmAiBusy = true;
    crmEls.aiBtn.disabled = true;
    crmEls.aiStatus.style.display = '';
    crmEls.aiStatus.textContent = 'AI ' + cfg.desc + '中，请稍候…';
    crmEls.aiStatus.className = 'em-status notice';
    crmEls.aiResult.style.display = '';
    crmEls.aiMemSuggest.style.display = 'none';
    crmEls.aiText.textContent = '思考中…';
    try {
      // 构造客户画像上下文
      var profile = '客户名称：' + c.name + '\n公司：' + (c.company || '未填写') + '\n国家/地区：' + (c.country || '未填写') +
        '\n等级：' + c.level + '｜状态：' + (c.status || '潜在客户') + '\n来源：' + (c.source || '未填写') +
        '\n联系人：' + (c.contactName || '未填写') + '（' + (c.contactTitle || '') + '）' +
        '\n主营产品：' + (c.mainProducts || '未填写') + '\n兴趣品类：' + (c.interestCategories || '未填写') +
        '\n采购量级：' + (c.purchaseQty || '未填写') + '\n目标价格：' + (c.targetPrice || '未填写') + ' ' + (c.currency || '') +
        '\n目标市场：' + (c.targetMarket || '未填写') + '\n付款偏好：' + (c.paymentPref || '未填写') +
        '\n贸易术语：' + (c.tradeTerms || '未填写') + '\n沟通语言：' + (c.commLang || '未填写') +
        '\n邮件语气：' + (c.emailTone || '未填写') + '\n沟通习惯：' + (c.commHabit || '未填写') +
        '\n备注：' + (c.notes || '无');
      var records = (c.records || []).map(function (r) {
        return '[' + r.time + '] ' + r.type + '：' + r.content + (r.feedback ? '（反馈：' + r.feedback + '）' : '') + (r.nextStep ? '【下一步：' + r.nextStep + '】' : '');
      }).join('\n');
      var memories = (c.memories || []).map(function (m) {
        return '[' + m.dimension + '] ' + m.content;
      }).join('\n');
      var context = {
        message: cfg.desc,
        customerProfile: profile,
        commRecords: records || '（暂无沟通记录）',
        existingMemories: memories || '（暂无客户记忆）',
        analysisType: action
      };
      if (action === 'memory_suggest') {
        context.outputFormat = '请仅输出一个 JSON 数组，不要输出其他文字。每个元素包含 dimension（维度，从以下选择：产品偏好/价格敏感度/沟通偏好/付款习惯/交期要求/品质关注/文化禁忌/其他）和 content（记忆内容，一句话）两个字段。建议 3-5 条。';
      } else {
        context.outputFormat = '请用中文分点输出，条理清晰，基于客户真实数据分析，不虚构信息。';
      }
      var resp = await HM_API.ai.ask('customer', cfg.task, context);
      if (!resp || !resp.success) {
        crmEls.aiText.textContent = 'AI 分析失败：' + (resp && resp.error ? resp.error : '服务异常');
        crmEls.aiStatus.style.display = 'none';
        return;
      }
      crmEls.aiText.textContent = resp.answer;
      crmEls.aiStatus.textContent = cfg.desc + '完成。';
      crmEls.aiStatus.className = 'em-status success';
      // 记忆建议：解析 JSON 并渲染确认列表
      if (action === 'memory_suggest') {
        var items = opExtractJSON(resp.answer);
        if (items && items.length) {
          crmEls.aiMemList.innerHTML = '';
          items.forEach(function (m) {
            var row = document.createElement('div');
            row.style.cssText = 'display:flex;gap:8px;align-items:flex-start;margin:6px 0;padding:8px;border:1px solid #e2e8f0;border-radius:6px;background:#fffbeb;';
            var tag = document.createElement('span');
            tag.style.cssText = 'flex-shrink:0;font-size:12px;color:#b45309;background:#fef3c7;padding:2px 8px;border-radius:4px;';
            tag.textContent = m.dimension || '其他';
            var txt = document.createElement('span');
            txt.style.cssText = 'flex:1;font-size:13px;line-height:1.6;';
            txt.textContent = m.content || '';
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'em-btn primary';
            btn.style.cssText = 'flex-shrink:0;padding:2px 12px;font-size:12px;';
            btn.textContent = '确认保存';
            btn.addEventListener('click', function () {
              var now = crmNow();
              c.memories.push({ id: Date.now(), dimension: m.dimension || '其他', content: m.content || '', source: 'ai', createdAt: now, updatedAt: now });
              c.updatedAt = now;
              HM_API.customers.update(c.id, { memories: c.memories, updatedAt: now }).catch(function (err) { console.error('AI记忆同步失败:', err); });
              crmRenderMemories(c);
              row.remove();
              crmEls.aiStatus.textContent = '已保存 1 条 AI 提取记忆。';
              crmEls.aiStatus.className = 'em-status success';
            });
            row.appendChild(tag); row.appendChild(txt); row.appendChild(btn);
            crmEls.aiMemList.appendChild(row);
          });
          crmEls.aiMemSuggest.style.display = '';
        }
      }
    } catch (err) {
      crmEls.aiText.textContent = 'AI 分析出错：' + (err && err.message ? err.message : '网络异常');
      crmEls.aiStatus.style.display = 'none';
    } finally {
      crmAiBusy = false;
      crmEls.aiBtn.disabled = false;
    }
  }

  /** 客户档案与AI记忆初始化 */
  async function crmInit() {
    if (!crmEls.listBody) return; // 页面元素不存在时跳过
    await hmMigrateReady; // 确保首次迁移完成后再加载
    crmCustomers = await crmLoad();     // 从后端 API 加载持久化数据，再渲染列表与统计
    crmUpdateCountryFilter();
    crmRenderList();
    crmUpdateStats();

    // 新建客户
    crmEls.newBtn.addEventListener('click', crmOpenModal);

    // 搜索与筛选
    crmEls.searchBtn.addEventListener('click', function () {
      crmFilters.keyword = crmEls.searchInput.value.trim();
      crmRenderList();
    });
    crmEls.searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        crmFilters.keyword = crmEls.searchInput.value.trim();
        crmRenderList();
      }
    });
    crmEls.filterCountry.addEventListener('change', function () {
      crmFilters.country = crmEls.filterCountry.value;
      crmRenderList();
    });
    crmEls.filterLevel.addEventListener('change', function () {
      crmFilters.level = crmEls.filterLevel.value;
      crmRenderList();
    });
    crmEls.filterStatus.addEventListener('change', function () {
      crmFilters.status = crmEls.filterStatus.value;
      crmRenderList();
    });
    crmEls.resetBtn.addEventListener('click', crmResetFilters);

    // 详情面板关闭
    crmEls.detailClose.addEventListener('click', crmCloseDetail);

    // P10：关联订单点击跳转（切换到订单页并打开对应订单详情）
    if (crmEls.detailOrders) {
      crmEls.detailOrders.addEventListener('click', function (e) {
        var row = e.target.closest('.crm-related-order-row');
        if (!row) return;
        var oid = parseInt(row.getAttribute('data-oid'), 10);
        if (isNaN(oid)) return;
        switchTo('order');
        odOpenDetail(oid);
      });
    }

    // 客户表单提交
    crmEls.form.addEventListener('submit', crmSubmitCustomer);

    // 沟通记录
    crmEls.recordAddBtn.addEventListener('click', crmOpenRecordModal);
    crmEls.recordForm.addEventListener('submit', crmSubmitRecord);

    // 客户记忆
    crmEls.memoryAddBtn.addEventListener('click', crmOpenMemoryModal);
    crmEls.memoryForm.addEventListener('submit', crmSubmitMemory);

    // AI 客户分析（5 种分析类型 + 关闭结果）
    if (crmEls.aiBtn) crmEls.aiBtn.addEventListener('click', crmRunAiAnalysis);
    if (crmEls.aiHide) crmEls.aiHide.addEventListener('click', function () {
      crmEls.aiResult.style.display = 'none';
      crmEls.aiMemSuggest.style.display = 'none';
    });

    // 客户列表操作（事件委托：详情/编辑/删除）
    crmEls.listBody.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act]');
      if (!btn) return;
      var tr = btn.closest('tr');
      var id = parseInt(tr.getAttribute('data-id'), 10);
      if (isNaN(id)) return;
      var act = btn.getAttribute('data-act');
      if (act === 'detail') crmOpenDetail(id);
      else if (act === 'edit') crmEditCustomer(id);
      else if (act === 'delete') crmDeleteCustomer(id);
    });

    // 沟通记录删除（事件委托）
    crmEls.detailRecords.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-rec-id]');
      if (!btn) return;
      crmDeleteRecord(parseInt(btn.getAttribute('data-rec-id'), 10));
    });

    // 客户记忆操作（事件委托：修改/删除）
    crmEls.detailMemories.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-mem-act]');
      if (!btn) return;
      var memId = parseInt(btn.getAttribute('data-mem-id'), 10);
      if (isNaN(memId)) return;
      var act = btn.getAttribute('data-mem-act');
      if (act === 'edit') crmEditMemory(memId);
      else if (act === 'delete') crmDeleteMemory(memId);
    });
  }

  crmInit();

  /* ==================== P9：AI结果审核中心 ==================== */

  // 审核任务数据（localStorage 持久化；后续可替换为后端审核 API）
  // 数据结构：{ id, no, title, sourceModule, resultType, content, structuredData,
  //   status('待审核'|'已通过'|'已退回'|'已拒绝'), logs:[], submitTime, createdAt, updatedAt }
  // 日志条目：{ action('submitted'|'approved'|'returned'|'rejected'), time, reviewer, comment }
  var RV_STORAGE_KEY = 'haimao_ai_review_records_v1';  // 独立存储键，不影响 P7 知识库与 P8 客户档案
  var rvRecords = [];
  var rvSeq = 0;
  var rvDetailId = null;
  var rvActionType = null;  // 当前审核操作类型：'approved' | 'returned' | 'rejected'
  var rvFilters = { keyword: '', source: '', type: '', status: '' };

  /** 从后端 API 加载审核数据（失败时安全降级为空数组） */
  async function rvLoad() {
    try {
      var data = await HM_API.reviews.list();
      if (!Array.isArray(data)) return [];
      var valid = [];
      var maxId = 0;
      data.forEach(function (r) {
        if (r && typeof r.id === 'number' && typeof r.title === 'string' && typeof r.content === 'string') {
          if (typeof r.no !== 'string') r.no = 'RV-' + r.id;
          if (typeof r.sourceModule !== 'string') r.sourceModule = '手动提交';
          if (typeof r.resultType !== 'string') r.resultType = '其他';
          if (typeof r.structuredData !== 'string') r.structuredData = '';
          if (typeof r.status !== 'string') r.status = '待审核';
          if (!Array.isArray(r.logs)) r.logs = [];
          // 校验日志条目结构，过滤损坏项
          r.logs = r.logs.filter(function (lg) {
            return lg && typeof lg.action === 'string' && typeof lg.time === 'string';
          });
          r.logs.forEach(function (lg) {
            if (typeof lg.reviewer !== 'string') lg.reviewer = '';
            if (typeof lg.comment !== 'string') lg.comment = '';
          });
          if (typeof r.submitTime !== 'string') r.submitTime = '';
          if (typeof r.createdAt !== 'string') r.createdAt = r.submitTime;
          if (typeof r.updatedAt !== 'string') r.updatedAt = r.createdAt;
          valid.push(r);
          if (r.id > maxId) maxId = r.id;
        }
      });
      rvSeq = maxId;
      return valid;
    } catch (err) {
      console.error('审核数据加载失败:', err);
      return [];
    }
  }

  /** 保存审核数据（API 模式下为空操作：数据通过单条 API 同步） */
  function rvSave() {
    // API 模式：新增/审核操作均通过 HM_API.reviews 单条同步，无需批量保存
  }

  var rvEls = {
    statTotal:    document.getElementById('rv-stat-total'),
    statPending:  document.getElementById('rv-stat-pending'),
    statApproved: document.getElementById('rv-stat-approved'),
    statReturned: document.getElementById('rv-stat-returned'),
    statRejected: document.getElementById('rv-stat-rejected'),
    searchInput:  document.getElementById('rv-search-input'),
    filterSource: document.getElementById('rv-filter-source'),
    filterType:   document.getElementById('rv-filter-type'),
    filterStatus: document.getElementById('rv-filter-status'),
    searchBtn:    document.getElementById('rv-search-btn'),
    resetBtn:     document.getElementById('rv-reset-btn'),
    newBtn:       document.getElementById('rv-new-btn'),
    exportBtn:    document.getElementById('rv-export-btn'),
    listBody:     document.getElementById('rv-list-body'),
    detail:       document.getElementById('rv-detail'),
    detailTitle:  document.getElementById('rv-detail-title'),
    detailBadges: document.getElementById('rv-detail-badges'),
    detailInfo:   document.getElementById('rv-detail-info'),
    detailContent:document.getElementById('rv-detail-content'),
    detailStructuredSection: document.getElementById('rv-detail-structured-section'),
    detailStructured: document.getElementById('rv-detail-structured'),
    detailLogs:   document.getElementById('rv-detail-logs'),
    detailActionsSection: document.getElementById('rv-detail-actions-section'),
    actionBtns:   document.getElementById('rv-action-btns'),
    detailClose:  document.getElementById('rv-detail-close'),
    modal:        document.getElementById('rv-modal'),
    form:         document.getElementById('rv-form'),
    formTitle:    document.getElementById('rv-form-title'),
    formSource:   document.getElementById('rv-form-source'),
    formType:     document.getElementById('rv-form-type'),
    formContent:  document.getElementById('rv-form-content'),
    formStructured: document.getElementById('rv-form-structured'),
    actionModal:  document.getElementById('rv-action-modal'),
    actionModalTitle: document.getElementById('rv-action-modal-title'),
    actionForm:   document.getElementById('rv-action-form'),
    actionReviewer: document.getElementById('rv-action-reviewer'),
    actionComment: document.getElementById('rv-action-comment'),
    actionCommentLabel: document.getElementById('rv-action-comment-label'),
    actionWarning: document.getElementById('rv-action-warning'),
    actionSubmitBtn: document.getElementById('rv-action-submit-btn')
  };

  /** 获取审核记录对象 */
  function rvGetRecord(id) {
    for (var i = 0; i < rvRecords.length; i++) {
      if (rvRecords[i].id === id) return rvRecords[i];
    }
    return null;
  }

  /** 应用搜索与筛选，返回过滤后的记录数组 */
  function rvGetFiltered() {
    var kw = rvFilters.keyword.toLowerCase();
    return rvRecords.filter(function (r) {
      if (rvFilters.source && r.sourceModule !== rvFilters.source) return false;
      if (rvFilters.type && r.resultType !== rvFilters.type) return false;
      if (rvFilters.status && r.status !== rvFilters.status) return false;
      if (kw) {
        var hay = (r.no + ' ' + r.title).toLowerCase();
        if (hay.indexOf(kw) === -1) return false;
      }
      return true;
    });
  }

  /** 更新五项统计指标（全部基于真实本地数据动态计算） */
  function rvUpdateStats() {
    var total = 0, pending = 0, approved = 0, returned = 0, rejected = 0;
    rvRecords.forEach(function (r) {
      total++;
      if (r.status === '待审核') pending++;
      else if (r.status === '已通过') approved++;
      else if (r.status === '已退回') returned++;
      else if (r.status === '已拒绝') rejected++;
    });
    if (rvEls.statTotal) rvEls.statTotal.textContent = total;
    if (rvEls.statPending) rvEls.statPending.textContent = pending;
    if (rvEls.statApproved) rvEls.statApproved.textContent = approved;
    if (rvEls.statReturned) rvEls.statReturned.textContent = returned;
    if (rvEls.statRejected) rvEls.statRejected.textContent = rejected;
  }

  /** 状态徽章 HTML */
  function rvStatusBadge(status) {
    var cls = 'st-pending';
    if (status === '已通过') cls = 'st-approved';
    else if (status === '已退回') cls = 'st-returned';
    else if (status === '已拒绝') cls = 'st-rejected';
    return '<span class="rv-status-badge ' + cls + '">' + odEsc(status) + '</span>';
  }

  /** 渲染审核任务列表（含空状态行） */
  function rvRenderList() {
    if (!rvEls.listBody) return;
    var filtered = rvGetFiltered();
    rvEls.listBody.innerHTML = '';
    if (filtered.length === 0) {
      var hasData = rvRecords.length > 0;
      rvEls.listBody.innerHTML =
        '<tr class="rv-empty-row"><td colspan="7">' +
          '<div class="od-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg></div>' +
          '<p class="od-empty-text">' + (hasData ? '未找到匹配的审核任务' : '暂无审核任务') + '</p>' +
          '<p class="od-empty-sub">' + (hasData ? '尝试调整搜索关键词或筛选条件，或点击「重置」查看全部任务' : '点击右上角「手动提交审核」将业务结果提交至审核队列，未来各 AI 模块生成结果后将自动进入此处') + '</p>' +
        '</td></tr>';
    } else {
      filtered.forEach(function (r) {
        var tr = document.createElement('tr');
        tr.setAttribute('data-id', r.id);
        // 待审核才显示「审核」按钮，其他状态只显示「详情」与「删除」
        var actBtn = r.status === '待审核'
          ? '<button type="button" class="od-row-btn" data-act="review">审核</button>'
          : '';
        tr.innerHTML =
          '<td>' + odEsc(r.no) + '</td>' +
          '<td>' + odEsc(r.title) + '</td>' +
          '<td>' + odEsc(r.sourceModule) + '</td>' +
          '<td>' + odEsc(r.resultType) + '</td>' +
          '<td>' + odEsc(r.submitTime || '—') + '</td>' +
          '<td>' + rvStatusBadge(r.status) + '</td>' +
          '<td>' +
            '<button type="button" class="od-row-btn" data-act="detail">详情</button>' +
            actBtn +
            '<button type="button" class="od-row-btn danger" data-act="delete">删除</button>' +
          '</td>';
        rvEls.listBody.appendChild(tr);
      });
    }
  }

  /** 当前时间字符串（YYYY-MM-DD HH:mm） */
  function rvNow() {
    var d = new Date();
    function p(n) { return n < 10 ? '0' + n : '' + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /** 内部创建审核任务（手动提交与 haimaoSubmitReview 共用，API 持久化） */
  async function rvCreateRecord(payload) {
    var now = rvNow();
    var rec = {
      title: String(payload.title || '').trim(),
      sourceModule: String(payload.sourceModule || '手动提交'),
      resultType: String(payload.resultType || '其他'),
      content: String(payload.content || ''),
      structuredData: payload.structuredData ? String(payload.structuredData) : '',
      status: '待审核',
      logs: [{
        action: 'submitted',
        time: now,
        reviewer: String(payload.reviewer || ''),
        comment: '任务提交至审核队列'
      }],
      submitTime: now,
      createdAt: now,
      updatedAt: now
    };
    if (!rec.title || !rec.content) return null;
    try {
      var created = await HM_API.reviews.create(rec);
      rvRecords.push(created);
      if (created.id > rvSeq) rvSeq = created.id;
    } catch (err) {
      console.error('审核任务创建失败:', err);
      return null;
    }
    rvRenderList();
    rvUpdateStats();
    return rvRecords[rvRecords.length - 1];
  }

  /** 打开手动提交审核模态框 */
  function rvOpenModal() {
    rvEls.form.reset();
    rvEls.formSource.value = '手动提交';
    odOpenModal('rv-modal');
  }

  /** 提交手动审核任务表单 */
  async function rvSubmitTask(e) {
    e.preventDefault();
    var title = rvEls.formTitle.value.trim();
    var content = rvEls.formContent.value.trim();
    if (!title || !content) return;
    // 结构化数据：若填写则校验 JSON 格式
    var structured = rvEls.formStructured.value.trim();
    if (structured) {
      try { JSON.parse(structured); }
      catch (err) {
        alert('结构化数据不是合法的 JSON 格式，请检查后重试。\n错误信息：' + err.message);
        return;
      }
    }
    var rec = await rvCreateRecord({
      title: title,
      sourceModule: rvEls.formSource.value,
      resultType: rvEls.formType.value,
      content: content,
      structuredData: structured
    });
    if (!rec) return;
    odCloseModal('rv-modal');
  }

  /**
   * 【统一审核提交入口】供 P2/P3/P4/P6/P8 等业务模块提交真实 AI 生成结果进入审核队列。
   * 挂载到 window，未来接入真实 AI 服务后各模块可直接调用，无需修改审核模块代码。
   * @param {Object} payload - { title, sourceModule, resultType, content, structuredData, reviewer }
   * @returns {Object|null} 创建的审核记录（含 id 与 no），失败返回 null
   */
  window.haimaoSubmitReview = function (payload) {
    if (!payload || typeof payload !== 'object') return Promise.resolve(null);
    return rvCreateRecord(payload);
  };

  /** 打开审核详情面板 */
  function rvOpenDetail(id) {
    var r = rvGetRecord(id);
    if (!r) return;
    rvDetailId = id;
    rvRenderDetail();
    rvEls.detail.style.display = '';
    rvEls.detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /** 关闭审核详情面板 */
  function rvCloseDetail() {
    rvDetailId = null;
    if (rvEls.detail) rvEls.detail.style.display = 'none';
  }

  /** 构建单个信息项 HTML（空值显示 —） */
  function rvInfoItem(label, value) {
    return '<div class="crm-info-item"><span class="crm-info-label">' + odEsc(label) +
      '</span><span class="crm-info-value">' + (value ? odEsc(value) : '—') + '</span></div>';
  }

  /** 渲染审核详情面板 */
  function rvRenderDetail() {
    var r = rvGetRecord(rvDetailId);
    if (!r) { rvCloseDetail(); return; }
    rvEls.detailTitle.textContent = r.no + ' · ' + r.title;
    // 顶部徽章：状态 / 来源模块 / 结果类型
    rvEls.detailBadges.innerHTML =
      rvStatusBadge(r.status) +
      '<span class="crm-tag">' + odEsc(r.sourceModule) + '</span>' +
      '<span class="kb-detail-cat">' + odEsc(r.resultType) + '</span>';
    // 基本信息（复用 crm-info-grid 三列网格）
    rvEls.detailInfo.innerHTML =
      '<div class="crm-info-group">' +
        '<div class="crm-info-grid">' +
          rvInfoItem('任务编号', r.no) +
          rvInfoItem('来源模块', r.sourceModule) +
          rvInfoItem('结果类型', r.resultType) +
          rvInfoItem('提交时间', r.submitTime) +
          rvInfoItem('创建时间', r.createdAt) +
          rvInfoItem('最近更新', r.updatedAt) +
        '</div>' +
      '</div>';
    // 原始生成结果（使用 textContent 安全展示，防止 HTML 注入，保留原始换行）
    rvEls.detailContent.textContent = r.content || '（无内容）';
    // 结构化数据（如有）
    if (r.structuredData) {
      rvEls.detailStructuredSection.style.display = '';
      rvEls.detailStructured.textContent = r.structuredData;
    } else {
      rvEls.detailStructuredSection.style.display = 'none';
    }
    // 历史审核记录
    rvRenderLogs(r);
    // 审核操作按钮（仅待审核状态显示，其他状态隐藏操作区）
    if (r.status === '待审核') {
      rvEls.detailActionsSection.style.display = '';
      rvEls.actionBtns.innerHTML =
        '<button type="button" class="em-btn rv-btn-approve" data-rv-act="approved">审核通过</button>' +
        '<button type="button" class="em-btn primary rv-btn-return" data-rv-act="returned">退回修改</button>' +
        '<button type="button" class="em-btn rv-btn-reject" data-rv-act="rejected">拒绝</button>';
    } else {
      rvEls.detailActionsSection.style.display = 'none';
    }
  }

  /** 渲染历史审核记录时间线 */
  function rvRenderLogs(r) {
    if (!rvEls.detailLogs) return;
    if (!r.logs.length) {
      rvEls.detailLogs.innerHTML = '<div class="rv-empty-block">暂无审核记录。</div>';
      return;
    }
    var labels = { submitted: '提交', approved: '通过', returned: '退回', rejected: '拒绝' };
    rvEls.detailLogs.innerHTML = '<div class="crm-timeline">' + r.logs.map(function (lg) {
      var itemCls = 'rv-log-item' + (lg.action !== 'submitted' ? ' log-' + lg.action : '');
      var actCls = 'rv-log-action act-' + lg.action;
      var actLabel = labels[lg.action] || lg.action;
      var commentHtml = lg.comment
        ? '<div class="rv-log-comment">' + odEsc(lg.comment) + '</div>'
        : '';
      var reviewerHtml = lg.reviewer ? ' · ' + odEsc(lg.reviewer) : '';
      return '<div class="' + itemCls + '">' +
        '<div class="rv-log-head">' +
          '<span class="' + actCls + '">' + actLabel + '</span>' +
          '<span class="rv-log-meta">' + odEsc(lg.time) + reviewerHtml + '</span>' +
        '</div>' + commentHtml +
      '</div>';
    }).join('') + '</div>';
  }

  /** 打开审核操作模态框（通过/退回/拒绝共用） */
  function rvOpenAction(action) {
    if (rvDetailId === null) return;
    rvActionType = action;
    var titles = { approved: '审核通过', returned: '退回修改', rejected: '拒绝' };
    rvEls.actionModalTitle.textContent = titles[action] || '审核操作';
    rvEls.actionForm.reset();
    if (action === 'approved') {
      rvEls.actionCommentLabel.textContent = '审核意见（可选）';
      rvEls.actionComment.placeholder = '填写审核意见，如：内容准确，确认通过';
      rvEls.actionWarning.style.display = 'none';
      rvEls.actionSubmitBtn.textContent = '确认通过';
      rvEls.actionSubmitBtn.className = 'em-btn rv-btn-approve';
    } else if (action === 'returned') {
      rvEls.actionCommentLabel.innerHTML = '退回原因 <span class="od-required">*</span>';
      rvEls.actionComment.placeholder = '必须填写退回原因，如：报价金额需与客户确认后修改';
      rvEls.actionWarning.style.display = '';
      rvEls.actionWarning.textContent = '退回修改必须填写退回原因，退回后任务状态变为「已退回」，历史审核记录将保留。';
      rvEls.actionSubmitBtn.textContent = '确认退回';
      rvEls.actionSubmitBtn.className = 'em-btn primary rv-btn-return';
    } else {
      rvEls.actionCommentLabel.innerHTML = '拒绝原因 <span class="od-required">*</span>';
      rvEls.actionComment.placeholder = '必须填写拒绝原因，如：内容与客户需求严重不符';
      rvEls.actionWarning.style.display = '';
      rvEls.actionWarning.textContent = '拒绝必须填写拒绝原因，拒绝后任务状态变为「已拒绝」，历史审核记录将保留。';
      rvEls.actionSubmitBtn.textContent = '确认拒绝';
      rvEls.actionSubmitBtn.className = 'em-btn rv-btn-reject';
    }
    odOpenModal('rv-action-modal');
  }

  /** 提交审核操作（真实更新数据状态与日志，自动保存） */
  function rvSubmitAction(e) {
    e.preventDefault();
    var r = rvGetRecord(rvDetailId);
    if (!r || !rvActionType) return;
    var reviewer = rvEls.actionReviewer.value.trim();
    var comment = rvEls.actionComment.value.trim();
    if (!reviewer) return;
    // 退回与拒绝必须填写原因
    if ((rvActionType === 'returned' || rvActionType === 'rejected') && !comment) {
      alert(rvActionType === 'returned' ? '请填写退回原因后再提交。' : '请填写拒绝原因后再提交。');
      return;
    }
    var now = rvNow();
    var statusMap = { approved: '已通过', returned: '已退回', rejected: '已拒绝' };
    r.status = statusMap[rvActionType];
    r.logs.push({
      action: rvActionType,
      time: now,
      reviewer: reviewer,
      comment: comment
    });
    r.updatedAt = now;
    HM_API.reviews.update(r.id, { status: r.status, updatedAt: now }).catch(function (err) { console.error('审核状态同步失败:', err); });
    HM_API.reviews.addLog(r.id, { action: rvActionType, time: now, reviewer: reviewer, comment: comment }).catch(function (err) { console.error('审核日志同步失败:', err); });
    odCloseModal('rv-action-modal');
    rvRenderDetail();
    rvRenderList();
    rvUpdateStats();
    rvActionType = null;
  }

  /** 删除审核任务（二次确认，历史记录一并删除，API 持久化） */
  function rvDelete(id) {
    var r = rvGetRecord(id);
    if (!r) return;
    if (!confirm('确定删除审核任务「' + r.no + ' ' + r.title + '」吗？\n该任务的历史审核记录将一并删除，删除后不可恢复。')) return;
    rvRecords = rvRecords.filter(function (x) { return x.id !== id; });
    HM_API.reviews.remove(id).catch(function (err) { console.error('审核任务删除同步失败:', err); });
    if (rvDetailId === id) rvCloseDetail();
    rvRenderList();
    rvUpdateStats();
  }

  /** 导出审核记录 CSV（含 BOM 头，Excel 中文不乱码） */
  function rvExportCSV() {
    if (rvRecords.length === 0) {
      alert('当前无审核记录可导出。');
      return;
    }
    function csvCell(s) {
      s = String(s === null || s === undefined ? '' : s);
      if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
      return s;
    }
    var header = ['任务编号', '结果标题', '来源模块', '结果类型', '提交时间', '审核状态', '审核次数', '最近审核人', '最近审核意见'];
    var rows = rvRecords.map(function (r) {
      var lastLog = r.logs.length > 0 ? r.logs[r.logs.length - 1] : null;
      var reviewCount = r.logs.filter(function (lg) { return lg.action !== 'submitted'; }).length;
      return [
        r.no, r.title, r.sourceModule, r.resultType, r.submitTime, r.status,
        reviewCount,
        lastLog ? lastLog.reviewer : '',
        lastLog ? lastLog.comment : ''
      ].map(csvCell).join(',');
    });
    var csv = '\uFEFF' + header.map(csvCell).join(',') + '\r\n' + rows.join('\r\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'ai_review_records.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /** 重置搜索与筛选条件 */
  function rvResetFilters() {
    rvFilters = { keyword: '', source: '', type: '', status: '' };
    rvEls.searchInput.value = '';
    rvEls.filterSource.value = '';
    rvEls.filterType.value = '';
    rvEls.filterStatus.value = '';
    rvRenderList();
  }

  /** AI结果审核中心初始化 */
  async function rvInit() {
    if (!rvEls.listBody) return; // 页面元素不存在时跳过
    await hmMigrateReady; // 确保首次迁移完成后再加载
    rvRecords = await rvLoad();        // 从后端 API 加载持久化数据，再渲染列表与统计
    rvRenderList();
    rvUpdateStats();

    // 手动提交与导出
    rvEls.newBtn.addEventListener('click', rvOpenModal);
    rvEls.exportBtn.addEventListener('click', rvExportCSV);
    rvEls.form.addEventListener('submit', rvSubmitTask);

    // 搜索与筛选
    rvEls.searchBtn.addEventListener('click', function () {
      rvFilters.keyword = rvEls.searchInput.value.trim();
      rvRenderList();
    });
    rvEls.searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        rvFilters.keyword = rvEls.searchInput.value.trim();
        rvRenderList();
      }
    });
    rvEls.filterSource.addEventListener('change', function () {
      rvFilters.source = rvEls.filterSource.value;
      rvRenderList();
    });
    rvEls.filterType.addEventListener('change', function () {
      rvFilters.type = rvEls.filterType.value;
      rvRenderList();
    });
    rvEls.filterStatus.addEventListener('change', function () {
      rvFilters.status = rvEls.filterStatus.value;
      rvRenderList();
    });
    rvEls.resetBtn.addEventListener('click', rvResetFilters);

    // 详情面板关闭
    rvEls.detailClose.addEventListener('click', rvCloseDetail);

    // 审核操作表单提交
    rvEls.actionForm.addEventListener('submit', rvSubmitAction);

    // 审核任务列表操作（事件委托：详情/审核/删除）
    rvEls.listBody.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act]');
      if (!btn) return;
      var tr = btn.closest('tr');
      var id = parseInt(tr.getAttribute('data-id'), 10);
      if (isNaN(id)) return;
      var act = btn.getAttribute('data-act');
      if (act === 'detail') rvOpenDetail(id);
      else if (act === 'review') rvOpenDetail(id); // 审核按钮也打开详情面板（含操作区）
      else if (act === 'delete') rvDelete(id);
    });

    // 详情面板审核操作按钮（事件委托）
    rvEls.actionBtns.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-rv-act]');
      if (!btn) return;
      rvOpenAction(btn.getAttribute('data-rv-act'));
    });
  }

  rvInit();

  /* ==================== 侧边栏折叠（按钮 + Ctrl+B 快捷键） ==================== */
  var SIDEBAR_KEY = 'haimao_sidebar_collapsed';
  var sbToggleBtn = document.getElementById('sidebar-toggle');

  /** 应用折叠/展开状态到 body 类与按钮提示 */
  function sbApply(collapsed) {
    document.body.classList.toggle('sidebar-collapsed', collapsed);
    if (sbToggleBtn) {
      sbToggleBtn.title = collapsed ? '展开侧边栏 (Ctrl+B)' : '收起侧边栏 (Ctrl+B)';
      sbToggleBtn.setAttribute('aria-label', collapsed ? '展开侧边栏' : '收起侧边栏');
    }
  }

  /** 切换折叠状态并持久化到 sessionStorage（刷新保持） */
  function sbToggle() {
    var collapsed = !document.body.classList.contains('sidebar-collapsed');
    sbApply(collapsed);
    try {
      if (collapsed) sessionStorage.setItem(SIDEBAR_KEY, '1');
      else sessionStorage.removeItem(SIDEBAR_KEY);
    } catch (e) { /* 隐私模式忽略 */ }
  }

  // 初始化：恢复上次折叠状态
  try {
    if (sessionStorage.getItem(SIDEBAR_KEY) === '1') sbApply(true);
  } catch (e) { /* 忽略 */ }

  // 折叠按钮点击
  if (sbToggleBtn) sbToggleBtn.addEventListener('click', sbToggle);

  // 快捷键 Ctrl+B（输入框/文本域内不触发，避免影响正常录入）
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey && !e.altKey && !e.shiftKey && (e.key === 'b' || e.key === 'B')) {
      var tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;
      e.preventDefault();
      sbToggle();
    }
  });

  /* ==================== P10：全系统数据备份与恢复 ==================== */
  var HM_BACKUP_KEYS = [OD_ORDER_STORAGE_KEY, OD_TODO_STORAGE_KEY, KB_STORAGE_KEY, CRM_STORAGE_KEY, RV_STORAGE_KEY];

  /** 全系统数据备份（从后端 API 导出 JSON 文件，含版本号与导出时间） */
  async function hmBackupData() {
    var data = { version: '2.0', exportTime: new Date().toISOString(), keys: {} };
    try {
      data.keys[OD_ORDER_STORAGE_KEY] = await HM_API.orders.list();
      data.keys[OD_TODO_STORAGE_KEY] = await HM_API.todos.list();
      data.keys[KB_STORAGE_KEY] = await HM_API.kb.list();
      data.keys[CRM_STORAGE_KEY] = await HM_API.customers.list();
      data.keys[RV_STORAGE_KEY] = await HM_API.reviews.list();
    } catch (err) {
      alert('备份数据获取失败：' + (err && err.message ? err.message : '网络错误'));
      return;
    }
    var json = JSON.stringify(data, null, 2);
    var blob = new Blob(['\uFEFF' + json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'haimao-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /** 全系统数据恢复（从 JSON 文件导入，通过迁移 API 写入后端并刷新全部模块） */
  function hmRestoreData(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = async function (ev) {
      try {
        var data = JSON.parse(ev.target.result);
        if (!data || !data.keys || typeof data.keys !== 'object') {
          alert('备份文件格式不正确：缺少 keys 字段。\n请确认选择的是海贸智联数据备份文件。');
          return;
        }
        var restored = 0;
        HM_BACKUP_KEYS.forEach(function (k) {
          if (Object.prototype.hasOwnProperty.call(data.keys, k)) restored++;
        });
        if (restored === 0) {
          alert('备份文件中未包含有效的业务数据键，恢复中止。');
          return;
        }
        // 通过迁移 API 将备份数据写入后端（INSERT OR IGNORE 保留现有数据）
        await HM_API.migrate.run(data.keys);
        // 重新加载所有模块数据并刷新渲染
        odOrders = await odLoadOrders();
        odTodos = await odLoadTodos();
        kbEntries = await kbLoad();
        crmCustomers = await crmLoad();
        rvRecords = await rvLoad();
        odRenderOrders();
        odRenderTodos();
        kbRenderList();
        kbUpdateStats();
        crmRenderList();
        crmUpdateStats();
        rvRenderList();
        rvUpdateStats();
        hmRefreshStats();
        alert('数据恢复完成，共恢复 ' + restored + ' 个数据模块，页面已自动刷新。');
      } catch (err) {
        alert('数据恢复失败：' + (err && err.message ? err.message : '未知错误') + '\n请确认选择的是有效的 JSON 备份文件。');
      }
    };
    reader.readAsText(file);
  }

  // 绑定备份与恢复按钮
  var hmBackupBtn = document.getElementById('hm-backup-btn');
  var hmRestoreBtn = document.getElementById('hm-restore-btn');
  var hmRestoreInput = document.getElementById('hm-restore-input');
  if (hmBackupBtn) hmBackupBtn.addEventListener('click', hmBackupData);
  if (hmRestoreBtn && hmRestoreInput) {
    hmRestoreBtn.addEventListener('click', function () { hmRestoreInput.click(); });
    hmRestoreInput.addEventListener('change', function () {
      if (this.files && this.files.length > 0) {
        if (confirm('确定要恢复数据吗？这将覆盖现有的订单、待办、客户、知识库与审核记录。')) {
          hmRestoreData(this.files[0]);
        }
        this.value = '';
      }
    });
  }

  /* ==================== 页面加载：自动登录（免账号密码） ==================== */
  // 竞赛演示场景：自动以评审评委身份登录，无需输入账号密码
  try {
    var saved = sessionStorage.getItem(SESSION_KEY);
    if (saved) {
      var savedUser = JSON.parse(saved);
      if (savedUser && savedUser.name) {
        setLoggedIn(savedUser);
      }
    } else {
      setLoggedIn({ name: '评审评委', role: 'reviewer' });
    }
  } catch (e) {
    setLoggedIn({ name: '评审评委', role: 'reviewer' });
  }

  /* ==================== 多标签页数据同步（API 模式：监听 storage 触发后端刷新） ==================== */
  // API 模式下数据存于后端，localStorage 不再写入业务数据，此监听器保留兼容旧版备份恢复场景
  window.addEventListener('storage', async function (e) {
    if (!e.key) return;
    switch (e.key) {
      case OD_ORDER_STORAGE_KEY:
        odOrders = await odLoadOrders();
        odRenderOrders();
        if (odDetailId !== null) odRenderDetail();
        break;
      case OD_TODO_STORAGE_KEY:
        odTodos = await odLoadTodos();
        odRenderTodos();
        break;
      case KB_STORAGE_KEY:
        kbEntries = await kbLoad();
        kbRenderList();
        kbUpdateStats();
        break;
      case CRM_STORAGE_KEY:
        crmCustomers = await crmLoad();
        crmRenderList();
        crmUpdateStats();
        if (crmDetailId !== null) crmRenderDetail();
        break;
      case RV_STORAGE_KEY:
        rvRecords = await rvLoad();
        rvRenderList();
        rvUpdateStats();
        break;
    }
    // 同步后刷新首页统计
    hmRefreshStats();
  });
})();