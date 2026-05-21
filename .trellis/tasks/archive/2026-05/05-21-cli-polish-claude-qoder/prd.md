# CLI Polish: 砍 preview / 加 qoder / 流式 progress + JSON 错误分类

> **Status**: planning（brainstorm 中）。父任务 mvp-cli-extract-and-ship 已 archive，P0 全过；本任务收尾 P1 中"CLI 封装"相关项，明确不做"开浏览器 / interactive / 多于 2 个 agent / 单二进制 / npm publish"等被用户砍掉的方向。

## Goal

把 a2h CLI 从"P0 可用"打磨到"封装扎实"：去掉与 CLI 业务目标不符的 preview 子命令，加 qoder 作为第二 agent 选项，把 spike F3 黑屏问题用**最简心跳**治掉。

## 最高原则（用户 2026-05-21 明确指令）

> **"做好 ref 项目的 cli 适配封装，其他问题丢给 ref 本身。"**

**含义**：
- 本任务**仅在 CLI 层做事**：argparse、I/O 契约、退出码、stderr 协议、agent 选择、心跳 progress
- 任何"深入 ref 项目业务层"的工作都**不在范围**：
  - LLM 协议解析（stream-json 解码、事件流、token 流）
  - skill prompt 调优 / 模板设计
  - LLM 错误码 subtype 解读
  - 渲染逻辑改写
- 失败兜底原则：**关键字 / 启发式现状能用就先用**，不切结构化解析层
- 加新功能前问自己："这是 CLI 的事，还是 ref 的事？" — 后者立刻丢回 ref upstream PR 或 P1+ 任务

## What I already know（来自上下文 + auto-context）

- mvp 任务已 archive（PR1 + PR2 commit `cb6a6bc` + `51ee5b9`）
- 当前 dist/cli.js = 21.1KB / 39 测试 / 真实 smoke `12.2KB HTML exit 0`
- spec 已沉淀 9 份；`spec/guides/upstream-sync.md` 白名单 6 项 / `spec/backend/quality-guidelines.md` lint ignores 含 detect+argv
- `src/agents/{detect,argv}.ts` 已从 ref/ 同步，`buildArgv` 含 claude / qoder / cursor-agent / codex 等 8 个 case
- spike `spike-end-to-end.md` F1: claude `--output-format text` 已够用（可省 stream-json）；F3: 复杂模板 ≈ 170s 黑屏需 streaming UX
- 上游 `argv.ts` 中：
  - `case "claude"` argv：`["-p", "--output-format", "stream-json", "--verbose", "--include-partial-messages", "--permission-mode", "bypassPermissions"]`
  - `case "qoder"` argv：`["-p", "--output-format", "stream-json", "--yolo"]`
  - **两者协议高度一致**（都是 stdin 写 prompt + stream-json ndjson 出 stdout）
- 上游 `detect.ts` 中：`qoder` bin 名 = `qodercli`（不是 `qoder`），envOverride = `QODER_BIN`
- 用户明确禁止：开浏览器 / interactive / 多于 2 agent / 单二进制 / npm publish（推迟）

## Assumptions（待验证）

- 把 stream-json + ndjson 解析作为流式 progress 的载体——比 text mode 更晚出 final HTML，但能给 logger.progress 更细 granular 的 token 进度
- 同时仍允许"text mode" 作为 fallback（脚本 / pipe 场景）—— spike F1 已证明 text 是最简路径
- claude 的 stream-json 含 `result` 块；其 `subtype` 字段（如 `success` / `error_during_execution` / `error_max_turns` / `error_max_budget` / etc）可作为结构化错误信号，替代 stderr 关键字正则

## 核心范围（用户 2026-05-21 明确指令）

### 在 MVP（P0）

1. **砍 preview 子命令**——`src/commands/preview.ts` 删；`cli.ts` 路由表移除；测试同步删；spec 中 preview 提及更新
2. **加 qoder agent + `--agent` flag**——render 默认 `--agent claude`，可指定 `qoder`；`A2H_AGENT` env 可覆盖；新建 `src/agents/invoke.ts`（共享 invokeAgent 抽象，per Q-CP-4 决策 A）+ `src/agents/errors.ts`（错误分类 map）；现有 `claude.ts` 抱什进 invoke.ts；不做 agent 间自动 fallback（claude 不可用就报错，per "轻易别做额外东西"）
3. **基于时间的心跳 progress**——spawn 后每 5 秒在 stderr 打一个点 `·`（仅 TTY）；spawn close 时 clearInterval + 换行；非 TTY / `--quiet` 完全静默；**不解析 stdout 中间内容**

### 不做（最高原则推论）

- ~~stream-json 流式解析~~ → 越界 ref 协议层；PR2 现状关键字分类继续用
- ~~LLM 错误码 subtype 解读~~ → 越界
- ~~Agent fallback 机制~~ → "别做额外东西"
- ~~浏览器交互~~（preview 砍掉就没承载点）
- ~~`--interactive` 修订循环~~
- ~~claude / qoder 之外的 agent~~
- ~~单二进制分发~~
- ~~npm publish 准备~~（推迟到独立任务）

## Open Questions

- ~~Q-CP-4：抽象层~~ → **A. 共享 `invokeAgent(id, opts)` 抽象层**：新建 `src/agents/invoke.ts` + `src/agents/errors.ts`（错误分类映射）；现有 `claude.ts` 抱什进 invoke.ts；commands/render.ts 改 import invokeAgent；加新 agent 仅需 errors map 加一项
- ~~Q-CP-1：`--agent` flag 语义~~ → **render `--agent <id>`**（默认 claude，候选 claude/qoder）+ **`A2H_AGENT` env override**；**无自动 fallback**（claude 不可用 → 报错让调用方决定；per 最高原则）
- ~~Q-CP-2：非 TTY 流式行为~~ → **非 TTY 时心跳完全静默**；TTY 时每 5 秒打 `·`；与 `--quiet` 一致行为
- ~~Q-CP-3：stream-json 解析~~ → **不做**（越界 ref 协议层；用基于时间的心跳替代）

## Acceptance Criteria（占位，brainstorm 收敛后填）

- [ ] 待 brainstorm

## Out of Scope（已明确）

- 浏览器交互
- --interactive 修订循环
- 多于 2 个 agent
- 单二进制
- npm publish 流水线

## Technical Notes

- 上游 argv.ts qoder 协议：与 claude 几乎一致；可共享一个 invokeAgent 抽象
- 上游 invoke.ts 的 ReadableStream + 多 agent 多协议派发对本项目过度复杂——本任务**不**纳入 sync 白名单；只取 minimal stream-json 解析（spike F1 思路延续）
- claude.ts / qoder.ts 共享 prompt 构造（assemblePrompt）+ extractHtml 后处理；差异仅在 argv + stderr 解析细节
- 预计 PRs：PR1（preview 砍 + qoder 加 + --agent flag）/ PR2（流式 progress + JSON 错误分类）
