# 海贸智联 AI 后端 - Windows 本地启动说明

## 一、环境要求

- Windows 10/11
- Python 3.9 及以上（命令行执行 `python --version` 确认）
- pip（Python 自带）

## 二、安装依赖

打开命令提示符（cmd）或 PowerShell，进入后端目录：

```bat
cd c:\Users\Emma\Desktop\haimao-zhilian\ai_backend
```

创建虚拟环境（推荐，避免污染系统 Python）：

```bat
python -m venv .venv
.venv\Scripts\activate
```

安装依赖：

```bat
pip install -r requirements.txt
```

## 三、配置环境变量

复制配置模板为 `.env`：

```bat
copy .env.example .env
```

用记事本打开 `.env`，填入你的 AI 服务配置：

```ini
AI_PROVIDER=openai_compatible
AI_API_KEY=sk-xxxxxxxxxxxxxxxx
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4o-mini
```

常见兼容服务商示例（任选其一，改三行即可切换）：

| 服务商 | AI_BASE_URL | AI_MODEL 示例 |
|--------|-------------|---------------|
| OpenAI | https://api.openai.com/v1 | gpt-4o-mini |
| DeepSeek | https://api.deepseek.com/v1 | deepseek-chat |
| Moonshot(Kimi) | https://api.moonshot.cn/v1 | moonshot-v1-8k |
| 通义千问 | https://dashscope.aliyuncs.com/compatible-mode/v1 | qwen-plus |

> 注意：`AI_API_KEY` 留空时后端不会伪造结果，前端会明确提示"尚未配置 AI 服务"。

## 四、启动后端

```bat
cd c:\Users\Emma\Desktop\haimao-zhilian\ai_backend
.venv\Scripts\activate
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

看到如下输出即启动成功：

```
INFO:     Uvicorn running on http://127.0.0.1:8000
INFO:     Application startup complete.
```

验证健康检查（另开一个命令行窗口）：

```bat
curl http://127.0.0.1:8000/api/health
```

返回示例（已配置 Key）：
```json
{"status":"ok","ai_configured":true,"provider":"openai_compatible","model":"gpt-4o-mini"}
```

返回示例（未配置 Key）：
```json
{"status":"ok","ai_configured":false,"provider":"openai_compatible","model":"gpt-4o-mini"}
```

## 五、启动前端

前端为纯静态页面，用任意静态服务器在 5500 端口启动即可（与后端 CORS 配置匹配）。

方式 A - VS Code Live Server 插件（推荐）：
1. 用 VS Code 打开项目根目录
2. 右键 `index.html` → Open with Live Server
3. 浏览器自动打开 http://localhost:5500

方式 B - Python 内置静态服务器：

```bat
cd c:\Users\Emma\Desktop\haimao-zhilian
python -m http.server 5500
```

然后浏览器访问 http://localhost:5500

## 六、功能验证

1. 登录后进入"邮件与询盘助手"页面
2. 查看右上角徽标状态：
   - 绿色"AI 已连接" = 后端已启动且已配置 Key
   - 黄色"尚未配置 AI 服务" = 后端已启动但未配置 Key
   - 黄色"AI 后端未启动" = 后端未运行
3. 在"客户原始询盘"中粘贴询盘内容，点击"生成商务邮件"
4. AI 结果自动填入右侧编辑区，可手动修改
5. 点击"提交审核"可进入 P9 人工审核中心（原有联动保留）

## 七、安全说明

- API Key 仅存在后端 `.env` 文件中，前端代码不含任何密钥
- `.env` 已被 `.gitignore` 忽略，不会提交到代码仓库
- CORS 仅允许 localhost:5500 和 127.0.0.1:5500，不开放公网
- 后端日志只记录动作、模块、耗时、状态码，不记录客户业务资料
- 限流：同一 IP 每分钟最多 20 次请求（可在 .env 调整）

## 八、常见问题

**Q: 启动报错 ModuleNotFoundError**
A: 确认已激活虚拟环境（`.venv\Scripts\activate`）并执行了 `pip install -r requirements.txt`。

**Q: 前端提示"无法连接 AI 后端"**
A: 确认后端窗口仍在运行，且端口为 8000。执行 `curl http://127.0.0.1:8000/api/health` 测试。

**Q: 前端提示"尚未配置 AI 服务"**
A: 这是正常的安全行为。在 `ai_backend\.env` 中填入 `AI_API_KEY` 后重启后端。

**Q: AI 请求超时**
A: 默认超时 60 秒，可在 `.env` 中调大 `AI_TIMEOUT`；也请检查网络是否能访问 AI 服务商地址。

**Q: 想换一个 AI 模型**
A: 只需修改 `.env` 中 `AI_BASE_URL`、`AI_MODEL`、`AI_API_KEY` 三行，重启后端即可，前端无需改动。