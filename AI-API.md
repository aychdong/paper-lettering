# 本机编辑器协议

这是浏览器和 Python 进程之间的内部协议，不是公网 API，也不是通用服务商协议。监听 `127.0.0.1` 的随机端口，只接受本机 Host、file 页的 null Origin，以及启动器为本次运行生成的 Bearer capability。这个 capability 与 ChatGPT 登录凭据不同。

- `GET /status`：检查 Codex 组件和本机账号类型，只返回脱敏状态。
- `GET /ping`：维持打开页面的连接；关闭后闲置 15 分钟退出。
- `POST /advice`：接收 `design` 或 `palette` 请求，返回 job ID；最多一个正在运行的请求。
- `GET /jobs/{id}`：返回 running/complete/failed，以及实际阶段或结果。

请求只包含最长边不超过 1200 的 PNG 派生预览、画布尺寸、文案、白名单参数、要求和图像哈希。`design_contract.py` 校验图片与 JSON 字段。应用结果前再次检查选中照片、锁定和请求期间的修改；不直接把模型文字作为代码执行。

扩展提供方时保留 `status()` 和 `Client.advise(prompt, image_path, schema, cwd, progress)` 的结果约定：`{data, model, usage, toolEvents}`。必须通过同一 schema 验证，并保留真实模型标识、预览哈希及结果来源。现有实现只有 `codex_client.py`；尚无 API Key 配置或其他服务商支持。

本工具给 Codex 的任务是看图后返回结构化文字建议。使用临时目录、只读环境和工具关闭配置，并拒绝服务端发起的工具/审批请求。模型输出需要验证；这不等于已经在所有 Codex 版本上验证了同样的隔离实现。

## 0.7 创作策略

`POST /advice` 新增 `copyMode: "compose" | "preserve"`、`placement: "auto" | "right" | "left" | "top" | "bottom"`，`preference` 最多 500 字。新界面默认 compose；旧客户端缺省 copyMode 时按 preserve 处理，避免静默改写。palette 请求不返回设计。

compose 可以替换可见文案；preserve 的每个非空可见源层对应一个方案层，文字和标点一致，只允许空白与换行改变。超过四层或每层超过 120 字时会拒绝 preserve 请求。后台和界面均检查保留策略。

方案层新增必填 `lineHeight`（1–2.5，字号倍数）；`text` 中的换行决定行/列。旧工程和历史方案缺省行距时继续使用 1.4。竖排从右至左分列。返回值携带 copyMode、placement；界面将创作要求随方案来源和每图 aiSettings 保存。

结果必须通过结构、范围与文字策略检查才应用；格式合法仍不保证文案或视觉判断完全合适，始终提供预览、编辑和撤销。结构化输出边界参考 [OpenAI 官方说明](https://developers.openai.com/api/docs/guides/structured-outputs)。

## 0.8 预览创作协议

新增 `/v1/creative`、`/jobs/{id}/renders`、`/jobs/{id}/cancel` 与 `/v1/preferences`。旧 `/advice` 保持兼容；新接口的阶段、摘要、取消与工程兼容见 [创作流程实现](docs/quality/IMPLEMENTATION.md)。偏好接口同样受每次启动的回环能力令牌保护。
