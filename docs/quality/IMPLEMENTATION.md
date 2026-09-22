# 0.8 创作与排印预览

状态：首轮真人盲评文案 5/12、版式 2/12 获选，未达到各至少八个明确新版本偏好的门槛。原十二例现为反馈回归；稳定版仍需新的未用于调试的比较任务与人工校准。见 [首轮结果](FEEDBACK-ROUND-1.md)。

## 运行流程

现有 ChatGPT 登录 → scene（六条文案与保护区域）→ editor（三个语义/设计意图）→ 浏览器 HarfBuzz 试排（每个最多四种）→ review（真实全图与文字细节）→ 可选一次重排与 verify。最多四次模型请求，任务总期限 720 秒，每轮共享十二分钟的剩余预算，不另设会提前截断首轮构思的四分钟限制。

新接口 `POST /v1/creative` 使用 `version:1`，带 `revision`、`documentId`、去元数据 PNG `preview`、`copyMode`、`placement`、`preference`、图幅及可见层。`action:copy` 保留现有布局，仅改文案；保留原文用 `copyMode:preserve`。锁定层保留，作为障碍；隐藏层不上传。

`GET /jobs/{id}` 返回阶段、实际已用时间、已完成调用次数。`awaiting_render` 提供一次性 ticket、briefs、scene；前端用固定字体真实渲染，`POST /jobs/{id}/renders` 回传 ticket/revision、候选、PNG 摘要、排字参数摘要、全图与一张细节。旧 ticket、工程修订和摘要不符均拒绝。`POST /jobs/{id}/cancel` 取消等待并向模型发送中断。旧 `/advice` 配色/两方案协议保持兼容。

应用仅在最初画布指纹仍匹配时自动替换可编辑层；修改、切图、取消或错误都保留现有画布。保留下来的中间方案显式标为未审稿草案。

## 文字与视觉检查

项目 v4 在每层保存 renderer 与 typesetting（source/lines/poetic）。旧 v1–v3 层使用 legacy，preview.1 的 harfbuzz-1 层也保持原外观；preview.2 新 AI 层使用 harfbuzz-2。原文与视觉断行分开。内置 TTF 字体由固定 HarfBuzz JS 1.6.1 / native 14.4.0 渲染，保留现有 Canvas 材质。WASM 内嵌且哈希校验，离线不取远程字体/脚本；仅给 CSP 增加 wasm-unsafe-eval。

选用 zh-CN CLReq 草案规则子集，并非全面实现 CLReq。竖排字形由字体排印特性提供，西文串侧转、2–3 位数字纵中横。新引擎只在汉字与字母/数字边界增加四分之一字号光学间距，标点或已有空格处不叠加。横排逗号、顿号、句号按实际字形位置和大小选择回退并压缩点号占位；手写字体缺少竖排替代字形时也回退到 Noto Serif SC。缺字仍无法回退则拒绝。系统字体无法读取轮廓时使用原 Canvas 路径；AI 只选可嵌入字体。

保留原文模式逐层约束原有内容与数量。为兼容服务端严格输出语法，固定文本枚举不包含换行；原始文本仍完整保存在工程里，视觉分行单独存储，本地试排恢复原有显式换行或执行重新断行。不得删除空格或替换标点来掩盖文案变动。

硬检查：边界、文字重叠、锁定层、模型给定保护矩形、缺字、禁则。保护矩形本身是模型估计，低置信度扩大，不承诺像素级分割。区域协议显式区分 protect（保护）与 preferred（建议排字），不依据中文名称猜测角色。留白用局部边缘密度作候选排序，绝不称作美感真值。

模型输出有标签、置信度与坐标的 anchors，编辑阶段的 alignments 将文字层 start/center/end 对齐到参考线，并给出相对图幅的 offset。本地用实际旋转后字形范围执行，低置信度不强制吸附。局部试排优先保留满足检查的设计意图，失败时重新断行或移入明确的建议区域，不再单凭最空的角落决定位置。最多六层支持重复物体的逐个标签；这些轴线仍来自模型，不能保证视觉检测必然准确。

可读性在最终材质/透明度/混合之后，对实笔画区域计算对比。v2 同时检查整层和单字范围：中位数 <1.8、整层或单字至少 1.5 的笔画比例 <55% 时淘汰；中位数 <3、低十分位 <1.5 或单字比例 <70% 时提示。新引擎对油墨/压印/丝印的细笔画保留最低墨迹。这些阈值与字形外框取样是待校准的启发式，不是笔画识别或 WCAG 认证。文案及视觉审稿必须分别 pass。

## 明确偏好

只保存主动喜欢/不喜欢，分别针对文案和版式。原生启动使用用户应用数据目录中的 preferences.json，纯 HTML 使用本地浏览器存储；允许导入导出、逐项删除与停用。照片、全局个人偏好不进入分享工程。启用时最多六条相关明确偏好进入当前请求；不推断拖动/应用事件，不训练基础模型。

## 评测与证据

`evaluations/cases.json` 原为 12 dev + 12 holdout 任务，字段保留用于复现；首轮已揭晓，全部转作反馈回归。真实照片限两张授权示例，几何风景/建筑/纸纹为合成测试图，明确不是24张独立照片。后续扩展真实题材需另选授权素材；重新跑已评过的题不能算新的盲评通过。

开发环境需 Playwright 和 Chrome，运行时用户无需 Node/npm。按需设置 NODE_PATH、LETTERING_CHROME。

```
node scripts/evaluate_quality.cjs --live --cases dev --out /local/quality-evaluation
node scripts/evaluate_quality.cjs --live --baseline --cases holdout --out /local/quality-evaluation
python3 scripts/build_quality_review.py --results /local/quality-evaluation --out /local/blind-review
python3 scripts/build_quality_review.py --votes /local/votes.json --key /local/blind-review/answer-key.json
```

固定案例使用独立、关闭的空偏好档案；自有工程回归也可用 `--no-preferences` 隔离，均不改变用户的偏好。`--baseline-only` 可仅生成旧版。每案例可恢复运行；保留请求、响应、模型/规则/提示摘要、成图、真实渲染诊断及失败。只把原图的去元数据派生预览和文字传入模型；请求与工程可能含个人素材，应保存在私人实验，不提交公共仓库。`--live` 会使用账号额度。

AutoCorrect 仅作为开发阶段 lint 参考，可对测试文本执行其 lint 命令；不自动重写海报原文。规则卡是自写摘要与例子，不复制书籍全文或第三方 Skill 提示词。

自有工程通过同一运行器：`node scripts/evaluate_quality.cjs --live --project project.paper.json --document id --brief "创作要求" --out /local/experiment`；保留原文添加 `--preserve`。输出包含可编辑工程与 PNG，记录于指定目录。
