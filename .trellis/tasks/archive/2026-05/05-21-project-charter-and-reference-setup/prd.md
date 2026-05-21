# Project Charter and Reference Setup

## 任务定位

项目级最前置的 bootstrap：在写任何代码或编码规范之前，先把"我们到底要做什么"沉淀成根目录可读文档，并把上游参考实现导入仓库。

## 背景

- 仓库刚 `trellis init`，只有 `AGENTS.md` 与空 spec。
- 已存在 `00-bootstrap-guidelines`，但其关注点是编码规范（spec 填充），**不**回答项目本身的目标与边界。
- 用户明确诉求：把 `nexu-io/html-anything`（依赖本地 npm 服务的文本→HTML 渲染器）改造为可被 Agent / Skill 内嵌调用的单文件 CLI。

## 交付物

1. **根目录 `README.md`**——项目宪章：定位、痛点、核心目标 / 非目标、架构原则、能力清单、路线图。
2. **`ref/html-anything/`**——上游仓库浅克隆，作为只读参考与移植来源。
3. **根 `AGENTS.md` 增补**——告知后续 AI session：`ref/` 为只读参考目录，禁止在内修改。

## 验收标准

- [ ] `README.md` 存在，覆盖：定位、痛点、目标、非目标、架构原则、MVP 能力清单、路线图、目录规划。
- [ ] `ref/html-anything/` 目录存在，包含上游 README 与源码。
- [ ] `AGENTS.md` 中明确 `ref/` 的只读语义。
- [ ] 后续任务（spec bootstrap、CLI MVP）可直接引用本 charter 作为目标对齐依据。

## 非目标

- 不抽取 / 不修改上游代码（留给 MVP 任务）。
- 不撰写编码规范（留给 `00-bootstrap-guidelines`）。
- 不实现 CLI 骨架（留给后续 MVP 任务）。

## 关键决策

| 决策 | 选择 | 理由 |
| --- | --- | --- |
| 根目录目标文档命名 | `README.md` | 仓库尚无 README；README 是新仓库公认的目标着陆页，无需新造文件名。 |
| ref 仓库放置 | `ref/html-anything/` | `ref/` 作为命名空间，便于后续可能加入其它参考。 |
| ref 克隆深度 | `--depth 1` | 仅作参考，无需历史；减小体积。 |
| ref 是否纳入主仓库 git | 暂不做 submodule | 避免在 charter 阶段引入 git 子模块复杂度；后续如需可升级。 |

## 风险与备注

- 上游许可证已确认 Apache-2.0；移植代码时需在新文件头标注 upstream 路径与 commit。
- `ref/` 目录的 `.git` 子目录保留——便于必要时升级为 submodule 或拉取 upstream 更新。

## 新增架构约束（用户 2026-05-21 确认）

### 约束 A：运行时对用户透明

- 项目可依赖 Node.js / Bun，但**对终端用户透明**：用户 `a2h` 一键即可，不需要先 `nvm install`、`brew install bun`、`npm i -g xxx`。
- CLI 内部自检并按需安装 Bun（或等价运行时），失败时给出可读的修复指引。
- 隐含决策：分发形态须支持"自举运行时"——候选包括单二进制（`bun build --compile`、`pkg`、`nexe`、Node SEA）、自启动脚本（首次运行时 `curl | sh` 拉 Bun）、或 npm 包 + postinstall 钩子。

### 约束 B：架构须能跟进上游迭代

- `ref/html-anything` 持续演进（新模板、新技能、Bug 修复），本 CLI 必须能"低成本同步"上游能力，而非一次性 fork 后失联。
- 隐含决策：本项目应优先采用**适配层 / 薄壳**策略，把上游视为黑盒或最小侵入式包装，而非深拷贝重写：
  - 候选 1：上游若发 npm 包 → 直接 `dependencies` 引入，CLI 只做"剥离 server 的渲染调用"。
  - 候选 2：上游不发包 → git submodule + 自动化构建脚本，每次 `a2h --upgrade` 拉取并重建。
  - 候选 3：上游模板与渲染逻辑高度耦合 server → 写"提取器"脚本，定时从 ref/ 抽取模板与渲染纯函数到 src/，并附 diff 报告。
- 验收对齐：上游每次 release 后，本 CLI 跟进所需人工成本应**< 1 工时**（一条命令 + 必要时 review diff）。

## 待研究的技术议题

- T1：Node/Bun 单二进制分发——比较 `bun build --compile` / `pkg` / `nexe` / Node SEA 的体积、跨平台、启动延迟。
- T2：上游同步策略——上游是否发布 npm 包？模板渲染是否可脱离 Next.js？e2e 目录是否已包含无服务渲染示例？
- T3：交互式修订的 UX 模式——参考 Codex / Claude Code / Cursor Agent CLI 在"生成-预览-修订"循环中的输入输出约定。

## 上游架构反查（charter 阶段已完成）

通过对 `ref/html-anything` 的现场勘察，**最初的"提取 React 渲染管线"假设被推翻**，真实工作流如下：

| 层 | 上游实现 | 对本项目的含义 |
| --- | --- | --- |
| 模板 | `next/src/lib/templates/skills/<name>/{SKILL.md, example.md, example.html}`，共 75 个 | **不是 React 组件**，是 **prompt-style 指令 + few-shot 样例**，可直接作为数据资产移植 |
| 渲染 | `next/src/lib/agents/{detect,invoke,argv}.ts` 检测本地已登录的 8 个 agent CLI（claude / cursor-agent / codex / gemini / copilot / opencode / qwen / aider），通过 stdin / argv / ACP 协议派发 prompt | **真正的"产 HTML"由本机 LLM Agent CLI 完成**，上游只是编排层 |
| 后处理 | `marked` 解析、`dompurify` sanitize、`highlight.js` 高亮、`juice` CSS 内联、`modern-screenshot` 截图、`pptxgenjs/xlsx/papaparse` 导出 | 全部为 npm 包，**不依赖** Next.js / React 运行时 |
| UI Shell | `next/` Next.js 16 + React 19 webapp | **这是用户痛点的来源**——webapp 只是给人看的 UI 外壳，纯 CLI 不需要它 |

**一句话总结**：上游"必须 `npm run dev`"的痛点，本质是**只为人类用户准备的 UI 外壳挡在了 Agent 路径上**。CLI 化的真正工作不是"实现一套渲染引擎"，而是"把 webapp 的编排逻辑剥离到无 UI 的 Node 入口"。

## Decision（ADR-lite，charter 层）

**Context**：在动 MVP 前，需要先固定"项目级原则"，避免后续设计被反复挑战。

**Decisions**：

1. **运行时对用户透明**（用户约束 A 升级为项目原则）——CLI 内部按需检测/自举 Bun 或 Node，分发形态须支持单可执行体感。具体打包技术（`bun build --compile` vs Node SEA vs `pkg`）是 MVP 任务议题，**不在 charter 决策**。
2. **薄壳同步上游**（用户约束 B 升级为项目原则）——本项目相对上游采取"白名单提取 + 适配层"策略：
   - 提取目标：`templates/skills/**`、`templates/{loader,scenarios,shared}.ts`、`agents/{detect,invoke,argv}.ts`、`extract-html.ts`、`export/**`、必要 parsers。
   - 不提取：`next/`、`components/`（React UI）、`app/`（路由）、`store.ts`（zustand UI 状态）。
   - 同步通道：`scripts/sync-upstream.ts`（待 MVP 任务实现），跑一次完成"拷贝白名单 + 移除 Next/React 引用 + diff 报告"。
3. **不重写渲染**——CLI 沿用上游"调本地 agent CLI 产 HTML + 后处理 npm 包"路径，不发明新的 LLM 调用层、不内嵌 headless 浏览器（除非交互式预览阶段才用 `open` 打开浏览器）。
4. **本 charter 任务不承载 MVP 设计**——T1/T2/T3 三个技术议题以及具体打包/同步脚本设计，移交后续 MVP brainstorm 子任务。

**Consequences**：

- 优势：复杂度大幅下降（不需要 React 运行时 / 不需要 SSR / 不需要 headless browser）；与上游"agent-CLI-orchestrator"哲学保持一致；同步成本可控。
- 风险：依赖用户本地已登录某个 agent CLI（与上游一致），但这正是 user "可被其它 agent skill 内嵌"的诉求——内嵌方本身就在 agent 上下文中。
- 待跟踪：上游若引入"非 prompt-style"的新模板（如纯组件式），需重新评估提取边界。

## Out of Scope（charter 层）

- 单二进制选型（`bun --compile` vs Node SEA vs `pkg`）→ MVP 任务。
- 上游同步脚本的具体实现 → MVP 任务。
- CLI 参数 / 子命令设计 → MVP 任务。
- 交互式修订循环的 UX 形态 → MVP polish 阶段。
- 上游 `export/` 中的 PPT / Excel / WeChat 等导出能力是否首版纳入 → MVP 任务。

## Open Questions

- Q-CHARTER-1（待 user 确认 → **下一条消息回答**）：是否同意将本 charter 任务限定为"目标对齐 + ref 导入 + 项目级原则沉淀"——把所有具体方案（单二进制选型、上游同步脚本、CLI 参数面）下放给独立的 MVP brainstorm 子任务？
