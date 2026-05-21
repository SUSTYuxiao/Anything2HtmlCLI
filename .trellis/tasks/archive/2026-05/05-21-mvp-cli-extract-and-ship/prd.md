# MVP CLI: Extract Upstream and Ship Single-Binary `a2h`

> **Status**: planning（待 brainstorm）。本 PRD 由 charter 任务播种，下一轮 brainstorm 会进一步收敛。

## Goal

把 `ref/html-anything` 的"prompt 模板 + 调本机 agent CLI 产 HTML + 后处理"管线，剥离 Next.js / React UI，重新打包成对用户透明运行时的纯 CLI（暂名 `a2h`），首版可被任意 Agent / Skill 内嵌调用，最小闭环：**文本 → skill 选择 → 单文件 HTML 输出**。

## What We Already Know（来自 charter 任务勘察）

### 上游架构事实

- `ref/html-anything/` 是 pnpm workspace（`next/` + `e2e/`），Apache-2.0。
- Skills 形态：`next/src/lib/templates/skills/<name>/{SKILL.md, example.md, example.html}`，**75 个**，是 prompt 指令 + few-shot 样例，**不是 React 组件**。
- 真正的"产 HTML"：`next/src/lib/agents/{detect,invoke,argv}.ts` 检测本机已登录的 8 个 Agent CLI（claude / cursor-agent / codex / gemini / copilot / opencode / qwen / aider），通过 stdin / argv / ACP 派发 prompt。
- 后处理：`marked` / `dompurify` / `highlight.js` / `juice` / `modern-screenshot` / `pptxgenjs` / `xlsx` / `papaparse` / `jszip`，均为 npm 包，**不依赖** React/Next runtime。
- UI Shell（`next/`）只服务于人类用户，CLI 化时**整体丢弃**。

### 移植白名单（charter 决定）

**保留**：

- `next/src/lib/templates/skills/**`（数据资产，原样拷贝）
- `next/src/lib/templates/{loader,scenarios,shared,index}.ts`
- `next/src/lib/agents/{detect,invoke,argv}.ts`
- `next/src/lib/extract-html.ts`
- `next/src/lib/export/**`（按需，可 MVP 仅纳入 markdown-roundtrip + image，其余下放后续）
- `next/src/lib/parsers/**`（输入文本解析）

**丢弃**：`next/src/{app,components}/**`、`next/src/lib/store.ts`（zustand UI 状态）、`next/src/lib/use-*.ts`（React hooks）、所有 `next.config.ts` / `tailwind.config` / Next.js 路由。

## 项目级原则（来自 charter，不可违反）

1. **运行时对用户透明**：CLI 内部检测 Bun / Node，按需自举；用户感知是单可执行体。
2. **薄壳同步上游**：靠 `scripts/sync-upstream.ts` 白名单提取 + diff 报告，单命令同步上游迭代。
3. **不重写渲染**：沿用上游"调本地 agent CLI 产 HTML + npm 后处理"路径。
4. **Self-contained 输出**：HTML 单文件，CSS/JS/字体/小图全部内联。

## 待研究的技术议题（brainstorm 时拆为 trellis-research 子任务）

### T1：单二进制分发选型

候选：`bun build --compile` / Node SEA / `pkg` / `nexe` / `npx @scope/a2h`。
关键评估维度：体积、启动延迟、跨平台（macOS / Linux / Windows）、对动态依赖（如 `xlsx`）的兼容性、首次"自举安装 Bun/Node"的失败恢复 UX。

### T2：上游同步脚本设计

- 白名单提取规则（glob / 显式列表 / AST 改写？）
- 移除 React/Next 引用的策略（手工补丁 vs codemod）
- diff 报告形态（CHANGELOG.md auto-update / GitHub Action / 本地 dry-run）
- 上游版本绑定（按 commit / 按 release tag / 按日期）

### T3：交互式修订循环 UX

- 参考：Codex / Claude Code / Cursor Agent CLI 的 prompt-iterate 模式。
- 输入：上一轮 HTML 输出 + 用户反馈片段。
- 输出：下一轮 HTML diff 或全量替换。
- 关键问题：是否需要本 CLI 自带"对话上下文"，还是把状态完全交给被调用的 agent CLI（agent 自身已有 session）？

## Open Questions（next brainstorm session 解决）

> ⚠️ 2026-05-21 spike 已经更新了 4 条 Open Questions 的指针，详情见 `research/spike-end-to-end.md`：

- ~~Q-MVP-1：MVP 是否首版就支持交互式修订？~~ → **不需要**，一次产出即可用，交互式列入 P1 polish
- ~~Q-MVP-2：MVP 是否必须支持全部 8 个 agent CLI？~~ → **首版锁 claude 单 agent**，多 agent 列入 P1
- ~~Q-MVP-3：`a2h` 是否提供"列出可用 skills"的子命令？~~ → **是**，frontmatter 解析已验证可行（30 行）
- ~~Q-MVP-4：单二进制是 P0 还是 P1？~~ → **P1**，spike 证明零依赖纯 Node 已可工作，首版用 `npx @scope/a2h` 即够

### 仍需 brainstorm 的新问题

- ~~Q-MVP-5（spike 衍生）：MVP 命令面布局~~ → **A. 多子命令（kubectl/gh/git 风格）**：`a2h render <input>` / `a2h skills` / `a2h preview <input>`，未来可扩展 `a2h sync-upstream`
- ~~Q-MVP-6（spike 衍生）：进度反馈~~ → **A. TTY 检测自动开**：stdout 是 TTY 时把 progress 打到 stderr；被 pipe / 加 `-o` 时静默
- ~~Q-MVP-7（spike 衍生）：`--max-budget-usd` 默认值~~ → **A. unset（不封顶）**：完全交调用方显式传参；MVP 不强加默认上限
- ~~Q-MVP-8（spike 衍生）：错误路径协议~~ → **C. 标准化退出码 + `--json-errors` 双流分离**：
  - 退出码：`0` ok / `1` usage / `10` skill not found / `20` agent unavailable / `30` budget exceeded / `40` output invalid / `50` network
  - 默认 stderr 人读 colored；`--json-errors` 开启后失败时 stdout 写 JSON 错误对象（成功 stdout 仍是 HTML，靠首字符 `<` vs `{` 区分）
- ~~Q-MVP-SCAFFOLD：源码语言与构建~~ → **B. TypeScript + esbuild 构建（业界主流）**：`src/*.ts` → `dist/*.js`（`esbuild --bundle --platform=node`），`bin/a2h` 指向 `dist/cli.js`；上游同步脚本可原样处理 `.ts ↔ .ts`；npm publish 发 `dist/` + `bin/`。
- ~~Q-MVP-IO：render I/O 契约~~ → **B. 文件或 stdin（`-` 哨兵）+ stdout/`-o`**：
  - 输入：位置参数为文件路径，`-` 表示 stdin
  - 输出：缺省 stdout；`-o <file>` 写指定文件（不接受目录路径）
  - agent 嵌入零磁盘副作用：`spawn("a2h", ["render","-",...])` + `stdin.write(content)`
- ~~Q-MVP-SYNC：上游同步交付时机~~ → **最简口子，定期人工触发**：
  - `ref/html-anything/` 自身的更新：靠开发者手动 `git pull`，本项目不提供工具
  - `src/` 从 `ref/` 同步：MVP 提供一个最简 `scripts/sync-from-ref.ts` 脚本（cp 白名单文件即可），不做 diff 报告、glob 提取、import 重写
  - 触发方式：开发者人工 `npm run sync`，频次按上游 release 节奏
  - 不在本任务做：CI 自动同步、自动 PR、AST codemod、版本绑定追踪
- ~~Q-MVP-9（spike 衍生 / 留给实施前）：长输入（10k+ 字符）+ 复杂模板（deck-* / dashboard / data-report）下，假设是否仍成立？~~ → **✅ 通过**（2026-05-21 spike 验证，详见 `research/spike-q-mvp-9-complex-templates.md`）：
  - `deck-product-launch`（170s / 45.5KB / 13 个 slide section）+ `data-report`（143s / 39.5KB / 10 个 `new Chart()` + 表格 + KPI）双双通过，DOCTYPE / `</html>` / 内容真实性 / 视觉合格全过关
  - **F5 副产品**：模型自主识别 dataviz 场景并引入 Chart.js@4.4.1 CDN——**brainstorm 阶段假定的"复杂模板需追加图表库 hint" 风险被证否**，PR1 不需要为 dataviz 类追加额外 prompt 指令
  - **F2 副产品（不改 Q-MVP-7 决策）**：spike.mjs 内部硬编码的 `--max-budget-usd 0.50` 在复杂模板下不足；但这是研究脚本自身的安全网，**不影响 a2h CLI 的 Q-MVP-7 决策（默认 unset，由调用方显式传参）**
  - **F3 副产品**：复杂模板 ≈ 2.5× 耗时（170s 黑屏不可接受），强化了 P1 streaming UX 的优先级——但 Q-MVP-6（TTY progress）已涵盖此点

## Acceptance Criteria（spike 后初轮收敛）

### 成本与时间参考（spike 实证）

| 模板族 | 典型耗时 | 典型成本 | 推荐用户传参 |
| --- | --- | --- | --- |
| article 类（article-magazine / blog-post / newsletter）| ~70s | $0.3-0.5 | `--max-budget-usd 0.5` |
| deck 类（deck-* / 多页演示）| ~170s | $0.6-1.2 | `--max-budget-usd 2.0` |
| dataviz 类（data-report / dashboard）| ~145s | $0.6-1.0 | `--max-budget-usd 2.0` |

> 注：a2h CLI 自身**不设默认上限**（per Q-MVP-7 决策 A），上述参考值由调用方在嵌入时显式传入。README 应包含同表。

### 必达（P0）

- [ ] **仅 CLI 包装、不改上游业务逻辑**——本项目对 `ref/html-anything` 是"零侵入薄壳"：移植进 `src/templates/` 与 `src/extract-html.ts` 的代码必须与上游逻辑等价，仅允许"路径重定位 + ESM/import 兼容"等不可避免的局部适配（每文件 ≤ 5 行 `// [a2h]` 标注修改，per `guides/upstream-sync.md`）。任何"修 bug" / "优化" / "新功能"应推上游 PR，**不在本仓库 fork**。

- [ ] CLI 入口为多子命令架构（kubectl/gh 风格）：
  - `a2h render <input> --skill <id> [-o <out.html>]` —— 主路径，缺省写 stdout
  - `a2h skills [--json]` —— 列出可用 skill；`--json` 给 Agent 消费
  - `a2h preview <input> --skill <id>` —— 生成临时 HTML 并在系统浏览器中打开
- [ ] `a2h render` 端到端跑通，零 npm 依赖纯 Node 实现
- [ ] 输出 HTML 满足：`<!DOCTYPE html>` 起手 + `</html>` 闭合 + 可在浏览器双击打开
- [ ] 内置至少 1 个 agent（claude）的检测与调用
- [ ] `--bare` 模式默认开启（避免被嵌入时受外层 session 污染）
- [ ] `--max-budget-usd <n>` 透传至下游 claude CLI
- [ ] `scripts/sync-from-ref.ts`（最简口子版）：cp 白名单文件 `ref/html-anything/next/src/lib/templates/skills/**` + `extract-html.ts` + `templates/{loader,shared}.ts` 到 `src/`，无 diff 报告、无 import 重写、人工触发

### 期望（P1，本任务范围内若顺利则做）

- [ ] 多 agent 支持（codex / cursor-agent / gemini / copilot 至少加一个）
- [ ] `--interactive` 交互式修订循环
- [ ] 单二进制分发（候选: bun build --compile / Node SEA）
- [ ] `--preview` 调用 `open` 在系统浏览器中即时预览

### 暂不做（O of S，下放后续任务）

- 浏览器内"实时编辑器"（与项目宗旨相悖）
- PPTX / XLSX / WeChat / Notion / Zhihu 等导出能力
- 自托管模型（OpenAI API / Bedrock）支持

## Out of Scope（暂列）

- 上游 webapp 的部署能力（Vercel / Bluesky / Notion / WeChat / Zhihu）——不在 MVP。
- PPTX / XLSX 导出——不在 MVP。
- 视觉编辑器 / 实时预览 server——本项目根本目标就是消灭它，不会实现。
- 多 skill 串联 / pipeline——后续。

## Technical Notes / References

- charter 决策：`.trellis/tasks/05-21-project-charter-and-reference-setup/prd.md` 的 ADR-lite 章节
- 项目目标：[`README.md`](../../../README.md)
- 上游 README：[`ref/html-anything/README.md`](../../../ref/html-anything/README.md)
- 上游 skills 目录：`ref/html-anything/next/src/lib/templates/skills/`
- 上游 agent 调用层：`ref/html-anything/next/src/lib/agents/`
