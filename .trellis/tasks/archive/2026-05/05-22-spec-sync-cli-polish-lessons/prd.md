# Spec sync: 沉淀 cli-polish 经验

> **Status**: planning（无需 brainstorm，需求已在前置 session 收敛）。本任务把刚刚完成的 cli-polish 任务（已 archive）中**未沉淀**的 3 条经验固化到 active spec，保证未来 sub-agent 接到任务时能加载到这些规则。

## Goal

把 2026-05-21 cli-polish session 中确定但**仅记录在已 archive 任务 prd 内**的 3 条工程原则 / 模式提升到 active spec：

1. "只做 ref 适配封装，不深入业务"边界原则（最高 ROI——避免未来 sub-agent 重新踩"切 stream-json"的坑）
2. per-agent classifier map 抽象模式（Q-CP-4 决策的代码落地形态，下次加 agent 时复用）
3. 心跳 progress 路径推荐（基于时间，不解析 LLM 输出）

## What I already know

- cli-polish 任务（archive 路径：`.trellis/tasks/archive/2026-05/05-21-cli-polish-claude-qoder/`）的 prd.md "最高原则"段已写明边界原则
- mvp 任务（archive 路径：`.trellis/tasks/archive/2026-05/05-21-mvp-cli-extract-and-ship/`）spike F1/F3/F6 是这些经验的源头
- 现有 spec 中：
  - `backend/quality-guidelines.md` 已有 DI 段（被 trellis-check 改成 invoke.ts/InvokeDeps），但**没单独讲 per-agent classifier 模式**
  - `backend/logging-guidelines.md` 有 TTY progress 段；需核对是否仍写"基于 stream-json"——若是，调整为"心跳优先"
  - `guides/cli-design.md` 末尾有反模式段（含"render 默认开浏览器"），可加"严禁深入 LLM 协议解析"
  - `guides/upstream-sync.md` 末尾有反模式段（含"二次修改上游代码"），可加交叉引用边界原则

## Requirements（P0）

### 候选 1：边界原则升级（cli-design.md + upstream-sync.md 各加一段）

- 在 `guides/cli-design.md` 末尾（反模式速查段之前或末尾）新增"## 项目边界原则"短段（≤ 15 行）：
  - 措辞围绕："a2h 仅在 CLI 层做事；任何'深入 ref 业务层'（LLM 协议解析 / skill prompt 调优 / 渲染逻辑）的工作都不在范围"
  - 列举越界行为反例：解析 stream-json / 解读 LLM subtype / 改 prompt 装配
  - 失败兜底：关键字 / 启发式现状能用就先用
  - 加新功能前自问："这是 CLI 的事，还是 ref 的事？"
- 在 `guides/upstream-sync.md` 末尾（反模式速查段附近）加 1-3 行交叉引用，指向 cli-design.md 的边界原则

### 候选 2：per-agent classifier map 模式（quality-guidelines.md 加 Agent Layer Extensibility 小节）

- 在 `backend/quality-guidelines.md` 的 DI 段附近（同一节或紧邻新节）加"## Agent Layer Extensibility"小节（≤ 30 行）：
  - 模式：`AGENT_CLASSIFIERS: Record<string, ClassifyFn>` map
  - 实例：`agents/errors.ts` 的 claudeClassify / qoderClassify 实例对照
  - 加新 agent 流程：argv.ts 已有 case → 加 errors.ts map 一项 → invoke.ts 自动 dispatch
  - unknown agent fallback 规则（保守用 qoderClassify 等"低假设"分类）
  - 严禁：在 invoke.ts 里 hardcode if/else 分支判断 agent id

### 候选 3：心跳 progress 优先（logging-guidelines.md 进度协议段更新）

- 读 `backend/logging-guidelines.md` 当前进度协议段
- 若仍写"基于 stream-json"，更新为：
  - 默认：基于时间的心跳（setInterval 5s + 仅 TTY+!quiet 触发 progressTick `·`）
  - 可选演化（未来）：解析 LLM 协议层流（仅当业务需求迫切，明确说明这越过项目边界，须由独立任务评估）
  - 实例：`logger.progressTick()` + `invoke.ts setInterval(opts.onProgress, 5000)` + close/error/abort 三路径 clearInterval
  - 严禁：在心跳逻辑里读 stdout 中间内容（per 边界原则）
- 若已对齐，跳过本候选

## Acceptance Criteria

- [ ] `guides/cli-design.md` 含"项目边界原则"段 ≥ 1 处 grep 命中
- [ ] `guides/upstream-sync.md` 含交叉引用 cli-design.md 边界原则 ≥ 1 处
- [ ] `backend/quality-guidelines.md` 含"Agent Layer Extensibility"小节 + `AGENT_CLASSIFIERS` 字串 ≥ 1 处
- [ ] `backend/logging-guidelines.md` 进度协议段以"心跳"为推荐路径（不再以 stream-json 为默认）
- [ ] grep `"It (is\|should\|must)"` 全部 spec 命中数仍为 0（中文化保持）
- [ ] 改完跑 `npm run typecheck && npm run lint && npm test` 全过（spec 改不影响代码，但要确认无意外）

## Out of Scope

- 不动 PRD / archive 任务文件
- 不动 trellis 自带 thinking guides（code-reuse / cross-layer）
- 不改任何代码（src/ / scripts/ / package.json）
- 不再扩 sync 白名单 / 不再加新 agent
- 不写 changelog / 长篇引用——保持 spec 凝练

## Technical Notes

- 候选 3 可能"已含跳过"——logging-guidelines.md 之前可能已经被 cli-polish PR 间接更新过；先 grep 确认现状再决定要不要改
- 候选 1 的两段措辞要避免重复，cli-design.md 是 SSoT，upstream-sync.md 仅引用
- 候选 2 的代码示例参考 archive 中 cli-polish PR 的 `agents/errors.ts` 现状
