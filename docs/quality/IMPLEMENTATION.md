# 0.8 创作与排印预览

状态：工程实现与功能回归不代表审美验收。稳定版门槛仍需十二个保留案例的真人盲评，文案和版式各至少八个明确新版本偏好、零关键回归。

## 运行流程

现有 ChatGPT 登录 → scene（六条文案与保护区域）→ editor（三个语义/设计意图）→ 浏览器 HarfBuzz 试排（每个最多四种）→ review（真实全图与文字细节）→ 可选一次重排与 verify。最多四次模型请求，任务总期限 720 秒，每轮共享十二分钟的剩余预算，不另设会提前截断首轮构思的四分钟限制。

新接口 `POST /v1/creative` 使用 `version:1`，带 `revision`、`documentId`、去元数据 PNG `preview`、`copyMode`、`placement`、`preference`、图幅及可见层。`action:copy` 保留现有布局，仅改文案；保留原文用 `copyMode:preserve`。锁定层保留，作为障碍；隐藏层不上传。

`GET /jobs/{id}` 返回阶段、实际已用时间、已完成调用次数。`awaiting_render` 提供一次性 ticket、briefs、scene；前端用固定字体真实渲染，`POST /jobs/{id}/renders` 回传 ticket/revision、候选、PNG 摘要、排字参数摘要、全图与一张细节。旧 ticket、工程修订和摘要不符均拒绝。`POST /jobs/{id}/cancel` 取消等待并向模型发送中断。旧 `/advice` 配色/两方案协议保持兼容。

应用仅在最初画布指纹仍匹配时自动替换可编辑层；修改、切图、取消或错误都保留现有画布。保留下来的中间方案显式标为未审稿草案。

## 文字与视觉检查

项目 v4 在每层保存 renderer 与 typesetting（source/lines/poetic）。旧 v1–v3 层使用 legacy；新 AI 层使用 harfbuzz-1，原文与视觉断行分开。内置 TTF 字体由固定 HarfBuzz JS 1.6.1 / native 14.4.0 渲染，保留现有 Canvas 材质。WASM 内嵌且哈希校验，离线不取远程字体/脚本；仅给 CSP 增加 wasm-unsafe-eval。

选用 zh-CN CLReq 草案规则子集，并非全面实现 CLReq。竖排字形由字体排印特性提供，西文串侧转、2–3 位数字纵中横，中西文边界四分之一字号光学间距。系统字体无法读取轮廓时使用原 Canvas 路径；AI 只选可嵌入字体。缺字可回退到内置 Noto Serif SC，仍缺字则拒绝。

硬检查：边界、文字重叠、锁定层、模型给定保护矩形、缺字、禁则。保护矩形本身是模型估计，低置信度扩大，不承诺像素级分割。区域协议显式区分 protect（保护）与 preferred（建议排字），不依据中文名称猜测角色。留白用局部边缘密度作候选排序，绝不称作美感真值。

可读性在最终材质/透明度/混合之后，对实笔画区域计算对比。当前阈值是待真人校准的 v1 启发式（中位数 <1.8 或至少 1.5 的笔画比例 <55% 淘汰；中位数 <3 或低十分位 <1.5 提示），不声称 WCAG 认证。文案及视觉审稿必须分别 pass。

## 明确偏好

只保存主动喜欢/不喜欢，分别针对文案和版式。原生启动使用用户应用数据目录中的 preferences.json，纯 HTML 使用本地浏览器存储；允许导入导出、逐项删除与停用。照片、全局个人偏好不进入分享工程。启用时最多六条相关明确偏好进入当前请求；不推断拖动/应用事件，不训练基础模型。

## 评测与证据

`evaluations/cases.json` 固定 12 dev + 12 holdout 任务，真实照片限两张授权示例；几何风景/建筑/纸纹为合成测试图，明确不是24张独立照片。后续扩展真实题材需要另选授权素材。不得用 holdout 的人工答案调参。

开发环境需 Playwright 和 Chrome，运行时用户无需 Node/npm。按需设置 NODE_PATH、LETTERING_CHROME。

```
node scripts/evaluate_quality.cjs --live --cases dev --out /local/quality-evaluation
node scripts/evaluate_quality.cjs --live --baseline --cases holdout --out /local/quality-evaluation
python3 scripts/build_quality_review.py --results /local/quality-evaluation --out /local/blind-review
python3 scripts/build_quality_review.py --votes /local/votes.json --key /local/blind-review/answer-key.json
```

固定案例使用独立、关闭的空偏好档案，不改变用户的偏好；`--baseline-only` 可仅生成旧版。每案例可恢复运行；保留请求、响应、模型/规则/提示摘要、成图、真实渲染诊断及失败。只把原图的去元数据派生预览和文字传入模型；请求与工程可能含个人素材，应保存在私人实验，不提交公共仓库。`--live` 会使用账号额度。

AutoCorrect 仅作为开发阶段 lint 参考，可对测试文本执行其 lint 命令；不自动重写海报原文。规则卡是自写摘要与例子，不复制书籍全文或第三方 Skill 提示词。

自有工程通过同一运行器：`node scripts/evaluate_quality.cjs --live --project project.paper.json --document id --brief "创作要求" --out /local/experiment`；保留原文添加 `--preserve`。输出包含可编辑工程与 PNG，记录于指定目录。
