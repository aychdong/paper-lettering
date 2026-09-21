# 连接自己的 ChatGPT / Codex

离线排版、示例方案和图片导出无需账号。只有点击 AI 排版或配色才会请求模型。

1. 安装 Python 3.9+。用 [OpenAI 官方说明](https://learn.chatgpt.com/docs/codex/cli) 安装 Codex CLI，确认 `codex --version` 可以运行。
2. 双击下载包内「连接自己的ChatGPT.command」（Mac）或「连接自己的ChatGPT.cmd」（Windows）。工具检查已有登录；尚未登录时，它运行官方 `codex login`，由你在官方浏览器页面登录。Linux 可运行 `python3 ai/setup.py --login`。
3. 双击「启用AI助手」，等待页面显示绿色「AI 已连接 · ChatGPT」。以后直接用这个启动器即可。

也可以手动运行 `codex login`，然后 `python3 ai/bridge.py --html 纸上文字.html --open`。仅在网页 ChatGPT 中登录，不等于本机 Codex 已登录。已有桌面版/CLI 登录能否被找到，以本机检查结果为准。

每个人使用自己的账号、额度和组织策略。发布包没有作者的凭据，不复制网页 cookie，也不收集密码。运行组件需要单独安装；本项目不捆绑或分发 Codex 可执行文件。离线打开 HTML 不会启动 Python AI 服务。

## 目前支持范围

| 接入方式 | 状态 |
| --- | --- |
| 本机官方 Codex App Server + ChatGPT 登录 | 已实现，在 macOS Chrome 实测 |
| 已生成的示例方案 / 手工编辑 | 离线可用 |
| 任意 OpenAI-compatible Base URL / API Key | 未实现 |
| Anthropic、Gemini、Ollama 等服务商 | 未实现 |

这是 Codex 登录适配器，不是跨服务商的通用 AI 网关。账号是否具备模型访问权限以及可用额度由服务端决定。不要把 ChatGPT 登录令牌填写到第三方 API 服务。

编辑器与提供方代码分开：`app.js` 只调用本机桥接，`ai/codex_client.py` 对接官方 App Server。可以在未来增加其他适配器，但还需要服务商配置、密钥存储、看图能力与结构化结果测试；不能只替换 URL 就宣称兼容。内部协议见 [AI-API.md](AI-API.md)。

## 诊断

- 没找到组件：确认 Codex 已安装。程序查找 PATH、用户 `.local/bin`、常见 Homebrew 位置和 Mac 桌面版资源；自定义安装可用 `PAPER_CODEX_BIN` 指向你自己的可执行文件。
- 需要登录：使用上述登录启动器；它不会退出或替换检测到的其他认证方式。
- 显示离线：使用 AI 启动器新打开的页面，避免继续操作旧 HTML 标签页。
- 浏览器询问本地网络权限：允许连接本机 127.0.0.1。服务只监听回环地址，并要求随机连接令牌。
- 版本不兼容：更新官方 Codex，再重启启动器。本轮验证版本为 `0.155.0-alpha.9.2`；其他版本尚无完整兼容矩阵。
- 无网、额度或登录失效：继续离线编辑；连接恢复后再请求。自动连接只检查状态，不自动发送图片。

官方依据：[身份验证](https://learn.chatgpt.com/docs/auth)、[Codex CLI](https://learn.chatgpt.com/docs/codex/cli)、[App Server](https://learn.chatgpt.com/docs/app-server)。
