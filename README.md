# Anything2HtmlCLI

> 把任意文本变成单文件 HTML——不启服务，纯 CLI，可被任何 Agent / Skill 内嵌调用。

---

## 这是什么 / Why this exists

**`a2h` 把"文本 → 精美 HTML"的能力蒸馏成一条本地命令。**

源能力来自 [`nexu-io/html-anything`](https://github.com/nexu-io/html-anything)（Apache-2.0）。原项目以 npm 服务形态运行；`a2h` 把它重塑为一个**零运行时依赖、零落盘、可管道、可被 spawn 进任何 Agent 工作流**的 CLI。

- **怎么用**：`a2h render in.md > out.html` —— 一条命令，无服务，stdout 即结果
- **给谁用**：把渲染能力嵌入 Skill / Agent 自动化的开发者；在 CLI 工作流里直接 markdown → HTML 的工程师
- **不是什么**：不是 LLM 客户端 / 不连任何 API / 不缓存 / 不起服务；所有 LLM 调用通过本机已登录的 `claude` / `qodercli` 透传
- **心智**：`a2h` 是一根管道，不是一个平台

完整设计动机、架构原则与代码组织详见 [`docs/design.md`](./docs/design.md)；阶段性里程碑见 [`docs/roadmap.md`](./docs/roadmap.md)。

---

## Installation

> 🚧 **尚未发布到 npm**。下面是发布后的预期使用方式；当前要试用，请走末尾的 [如何贡献 / Contributing](#如何贡献--contributing) 章节，用源码 + `npm link` 流程。

```bash
npm i -g anything2html-cli
```

要求 Node.js `>= 20.0.0`（与 esbuild bundle target 对齐）。

### 前置依赖

`a2h` 调用本机已登录的 agent CLI 产出 HTML，需要至少装其一：

- [Claude Code](https://docs.claude.com/en/docs/claude-code) (`claude`)：默认 agent
- [Qoder CLI](https://qoder.dev) (`qodercli`)：可选第二 agent

`a2h` 自身不连任何 LLM API，所有 LLM 调用通过本机已登录的 agent CLI 透传——配额、登录、网络全部由对应 agent CLI 负责，本工具零运行时依赖。

---

## Usage / For Humans

终端直接使用的常见姿势。所有命令默认对 TTY 友好（彩色进度行 + 自动写文件），对管道也友好（stdout 写 HTML，可直接 `> out.html` / `| pbcopy`）。

### 把 markdown 文件渲染成 HTML

```bash
a2h render in.md --skill article-magazine -o out.html

# 在交互式终端，等价于上一行 —— --skill 默认 article-magazine、
# -o 默认写到与输入同目录的 in.html：
a2h render in.md
```

> `--skill` 缺省 → `article-magazine`；`-o` 缺省按"输入类型 + stdout 是否 TTY"自动决定：
> - 文件输入 + 交互终端 → 写到 `<input-stem>.html`（与输入同目录）
> - 文件输入 + pipe / 重定向 → 写 stdout（保 Unix 管道契约）
> - stdin 输入（`-`）→ 写 stdout（永远）
> - 显式 `-o -` 哨兵 → 强制 stdout，无视输入类型与 TTY

### 走 stdin（管道场景，零落盘）

```bash
cat in.md | a2h render - --skill blog-post -o out.html
```

`-` 哨兵表示从 stdin 读输入（与 `cat` / `kubectl apply -f -` 一致语义）。

### 切换 agent（claude / qoder）

```bash
a2h render in.md --skill article-magazine --agent qoder -o out.html
# 或用环境变量覆盖默认 agent：
A2H_AGENT=qoder a2h render in.md --skill article-magazine -o out.html
```

### 列出所有可用 skill

```bash
a2h skills              # 人类对齐表格
a2h skills --json       # agent 友好 JSON
```

### 显式预算上限（推荐复杂模板）

```bash
a2h render in.md --skill data-report --max-budget-usd 2 -o out.html
```

`a2h` 自身不设默认上限——参考 [`docs/agent-integration.md`](./docs/agent-integration.md#推荐传---max-budget-usd-兜底成本) 按模板族传值。

### 写到 stdout（Unix 管道）

```bash
a2h render in.md --skill article-magazine > out.html
```

成功路径上 stdout 首字符必然是 `<`（DOCTYPE 起手），便于 grep / pipe。

详见 `a2h --help` / `a2h render --help` / `a2h skills --help`。

---

## Usage / For Agents

`a2h` 的设计目标之一就是被其它 Agent / Skill 内嵌调用。集成模式只有一句话：

> spawn 子进程 → 写 stdin → 读 stdout → 看首字符判成功/失败。

最简集成：

```typescript
import { spawn } from "node:child_process";

const child = spawn("a2h", [
  "render", "-",
  "--skill", "article-magazine",
  "--json-errors",            // 失败时 stdout 写 JSON 错误对象
], { stdio: ["pipe", "pipe", "pipe"] });

child.stdin.write(promptContent);
child.stdin.end();
// stdout 首字符 `<` = 成功的 HTML
// stdout 首字符 `{` = 失败的 JSON 错误对象（含 code / exitCode / message）
```

**完整嵌入手册**——退出码协议、stdout/stderr 双流分离、`--json-errors` 错误对象结构、按模板族的 `--max-budget-usd` 推荐、成本与时间参考、Troubleshooting——见 [`docs/agent-integration.md`](./docs/agent-integration.md)。

---

## 如何贡献 / Contributing

欢迎 issue / PR。

### 本地自测（不发包到 npm 也能用全局命令）

```bash
npm install
npm run dev:link        # build + npm link，把全局 `a2h` 软链到当前项目
a2h --version           # 期望: a2h 0.1.0
a2h render in.md        # 直接用全局命令试
npm run dev:unlink      # 解除软链 (重复跑不报错)
```

`dev:unlink` 内置 `|| true`，已 unlink 时再跑也是 exit 0；不做更复杂的 PATH 自动检测——轻量为美。

### 完整开发流程

本仓库使用 [Trellis](./.trellis/workflow.md) 工作流（任务驱动、spec 优先、brainstorm + check 双闸）。提交 PR 前请先读 [`.trellis/workflow.md`](./.trellis/workflow.md) 与 [`AGENTS.md`](./AGENTS.md)。

---

## 更多

- 设计与架构原则：[`docs/design.md`](./docs/design.md)
- 路线图：[`docs/roadmap.md`](./docs/roadmap.md)
- Agent / Skill 嵌入手册：[`docs/agent-integration.md`](./docs/agent-integration.md)
- AI 协作约定：[`AGENTS.md`](./AGENTS.md)
- License: Apache-2.0
