# 本机编辑器协议

这是浏览器和 Python 进程之间的内部协议，不是公网 API，也不是通用服务商协议。监听 `127.0.0.1` 的随机端口，只接受本机 Host、file 页的 null Origin，以及启动器为本次运行生成的 Bearer capability。这个 capability 与 ChatGPT 登录凭据不同。

- `GET /status`：检查 Codex 组件和本机账号类型，只返回脱敏状态。
- `GET /ping`：维持打开页面的连接；关闭后闲置 15 分钟退出。
- `POST /advice`：接收 `design` 或 `palette` 请求，返回 job ID；最多一个正在运行的请求。
- `GET /jobs/{id}`：返回 running/complete/failed，以及实际阶段或结果。

请求只包含最长边不超过 1200 的 PNG 派生预览、画布尺寸、文案、白名单参数、要求和图像哈希。`design_contract.py` 校验图片与 JSON 字段。应用结果前再次检查选中照片、锁定和请求期间的修改；不直接把模型文字作为代码执行。

扩展提供方时保留 `status()` 和 `Client.advise(prompt, image_path, schema, cwd, progress)` 的结果约定：`{data, model, usage, toolEvents}`。必须通过同一 schema 验证，并保留真实模型标识、预览哈希及结果来源。现有实现只有 `codex_client.py`；尚无 API Key 配置或其他服务商支持。

本工具给 Codex 的任务是看图后返回结构化文字建议。使用临时目录、只读环境和工具关闭配置，并拒绝服务端发起的工具/审批请求。模型输出需要验证；这不等于已经在所有 Codex 版本上验证了同样的隔离实现。
