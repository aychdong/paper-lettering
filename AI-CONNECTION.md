# 连接自己的 ChatGPT / Codex

离线排版、示例方案和图片导出无需账号。只有点击 AI 排版或配色才会请求模型。

1. 安装 Python 3.9+。用 [OpenAI 官方说明](https://learn.chatgpt.com/docs/codex/cli) 安装 Codex CLI，确认 `codex --version` 可以运行。
2. 双击下载包内「连接自己的ChatGPT.command」（Mac，首次安全提示见下节）或「连接自己的ChatGPT.cmd」（Windows）。工具检查已有登录；尚未登录时，它运行官方 `codex login`，由你在官方浏览器页面登录。Linux 可运行 `python3 ai/setup.py --login`。
3. 双击「启用AI助手」，等待页面显示绿色「AI 已连接 · ChatGPT」。以后直接用这个启动器即可。

也可以手动运行 `codex login`，然后 `python3 ai/bridge.py --html 纸上文字.html --open`。仅在网页 ChatGPT 中登录，不等于本机 Codex 已登录。已有桌面版/CLI 登录能否被找到，以本机检查结果为准。

每个人使用自己的账号、额度和组织策略。发布包没有作者的凭据，不复制网页 cookie，也不收集密码。运行组件需要单独安装；本项目不捆绑或分发 Codex 可执行文件。离线打开 HTML 不会启动 Python AI 服务。

## Mac 首次使用

**当前 `.command` AI 启动脚本尚未经过 Developer ID 签名和 Apple 公证。** 通过浏览器下载并解压后，macOS 会给文件加下载隔离标记，Finder 可能显示“Apple 无法验证……是否包含可能危害 Mac 安全或泄漏隐私的恶意软件”。这一步发生在脚本运行前，尚未进入 ChatGPT 登录。

如果你确认下载来自本仓库并且文件未被改动，按 [Apple 官方说明](https://support.apple.com/zh-cn/102445) 操作：

1. 在警告窗口点「完成」。
2. 打开「系统设置 → 隐私与安全性」，向下找到刚被阻止的脚本及「仍要打开」。
3. 核对提示中的文件名，点击「仍要打开」，按系统要求确认。这个决定由你在系统界面完成。
4. 对「连接自己的ChatGPT.command」完成确认后，继续官方登录；再运行「启用AI助手.command」。第二个脚本可能需要单独确认一次。

如果没有看到「仍要打开」，重新双击一次相应脚本，再返回设置检查；受组织管理的电脑可能不允许例外。不要通过关闭整个 Gatekeeper 或批量移除隔离标记来解决。离线编辑不需要运行这两个脚本，可以先用浏览器打开「纸上文字.html」。

Release 附带 `SHA256SUMS.txt`，可用 `shasum -a 256 Paper-Lettering-0.6.1.zip` 比对下载包。哈希只能验证文件与发布包一致，不代表 Apple 审核或安全保证。

0.6.1 是首次使用指引修正，不是签名修复；本版仍需要上述人工确认。要减少其他用户遇到“无法验证开发者”的拦截，后续需要把启动器打包为正式 Mac App，使用有效 Developer ID 签名并完成 Apple 公证；首次运行仍可能有正常的互联网下载确认。普通本地签名不能替代。

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
