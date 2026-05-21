# Anything2HtmlCLI

> 把任意文本变成单文件 HTML——不启服务，纯 CLI，可被任何 Agent / Skill 内嵌调用。

---

## 这是什么 / Why this exists

`a2h` 把 [`nexu-io/html-anything`](https://github.com/nexu-io/html-anything) 的"文本→精美 HTML"能力，从"必须本地起 npm 服务"的形态，蒸馏为一个**无服务依赖、可管道调用的 CLI**——一条命令、零落盘、能被 spawn 进任何 Agent 的工作流里。

完整设计动机、架构原则与代码组织详见 [`docs/design.md`](./docs/design.md)；阶段性里程碑见 [`docs/roadmap.md`](./docs/roadmap.md)。

---

## Installation

```bash
npm i -g @a2h/cli
# 或暂用本地 tarball：
npm i -g <path-to>/a2h-cli-<version>.tgz
```

要求 Node.js `>= 20.0.0`（与 esbuild bundle target 对齐）。

### 前置依赖

`a2h` 调用本机已登录的 agent CLI 产出 HTML，需要至少装其一：

- [Claude Code](https://docs.claude.com/en/docs/claude-code) (`claude`)：默认 agent
- [Qoder CLI](https://qoder.dev) (`qodercli`)：可选第二 agent

`a2h` 自身不连任何 LLM API，所有 LLM 调用通过本机已登录的 agent CLI 透传——这意味着配额、登录、网络全部由对应 agent CLI 负责，本工具零运行时依赖。

---

## Usage

### 基本：把 markdown 文件渲染成 HTML

```bash
a2h render in.md --skill article-magazine -o out.html
```

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

`a2h` 自身不设默认上限——参考下文"成本与时间参考"按模板族传值。

### 写到 stdout（Unix 管道）

```bash
a2h render in.md --skill article-magazine > out.html
```

成功路径上 stdout 首字符必然是 `<`（DOCTYPE 起手），便于 grep / pipe。

详见 `a2h --help` / `a2h render --help` / `a2h skills --help`。

---

## Embedding from another Agent / Skill

`a2h` 设计目标之一是被其它 Agent / Skill 内嵌调用。LLM 调用方推荐以下模式：

### Spawn 调用（零磁盘副作用）

```typescript
import { spawn } from "node:child_process";

const child = spawn("a2h", [
  "render", "-",
  "--skill", "article-magazine",
  "--agent", "claude",
  "--max-budget-usd", "0.5",
  "--json-errors",          // 失败时 stdout 写 JSON 错误对象
], { stdio: ["pipe", "pipe", "pipe"] });

child.stdin.write(promptContent);
child.stdin.end();

let stdout = "";
let stderr = "";
child.stdout.on("data", (c) => (stdout += c));
child.stderr.on("data", (c) => (stderr += c));

child.on("close", (code) => {
  if (code === 0) {
    // stdout 是合规 HTML（首字符 `<`）
    return stdout;
  } else {
    // stdout 首字符 `{` —— --json-errors 协议下的错误对象
    const err = JSON.parse(stdout);
    // err.code: "E_SKILL_NOT_FOUND" / "E_AGENT_UNAVAILABLE" / "E_BUDGET_EXCEEDED" / ...
    throw new Error(err.message);
  }
});
```

### 退出码协议

| 退出码 | 常量名 | 含义 |
| --- | --- | --- |
| 0 | `OK` | 成功 |
| 1 | `E_USAGE` | 命令行参数错（缺必需 arg、未知 flag） |
| 10 | `E_SKILL_NOT_FOUND` | `--skill` 指定的 skill 不存在 |
| 20 | `E_AGENT_UNAVAILABLE` | 本机无对应 agent CLI 或未登录 |
| 30 | `E_BUDGET_EXCEEDED` | `--max-budget-usd` 触发 |
| 40 | `E_OUTPUT_INVALID` | LLM 输出非合规 HTML(无 DOCTYPE / 无 `</html>`) |
| 50 | `E_NETWORK` | claude / qoder 网络故障(DNS / 超时 / 连接重置) |

调用方用 exit code 走 `switch`，永不需要解析 stderr 文案。完整协议见 [`.trellis/spec/backend/error-handling.md`](./.trellis/spec/backend/error-handling.md)。

### 双流分离（stdout / stderr）

| 模式 | stdout | stderr |
| --- | --- | --- |
| 默认 + 成功 | HTML（首字符 `<`） | 空（或 TTY 进度行） |
| 默认 + 失败 | 空 | 人读 colored 错误 |
| `--json-errors` + 成功 | HTML（首字符 `<`） | 空（或 TTY 进度行） |
| `--json-errors` + 失败 | JSON 错误对象（首字符 `{`） | 人读 colored 错误 |

LLM 调用方的最简判别：

```ts
const isError = output.trimStart().startsWith("{");
```

### 推荐传 `--max-budget-usd` 兜底成本

参考下文"成本与时间参考"，按模板族传：

- article 类（article-magazine / blog-post / newsletter）：`--max-budget-usd 0.5`
- deck 类（deck-* / 多页演示）：`--max-budget-usd 2.0`
- dataviz 类（data-report / dashboard）：`--max-budget-usd 2.0`

### 推荐 `--json-errors` 让 stdout 永远是结构化数据

启用后失败时 stdout = JSON 错误对象（首字符 `{`），成功时 stdout = HTML（首字符 `<`）。LLM 调用方靠首字符切判分支，无需解析 stderr。

---

## 成本与时间参考

`a2h render` 端到端耗时与成本由下游 `claude` CLI 决定。下表来自 2026-05-21 spike 验证（`article-magazine` / `deck-product-launch` / `data-report`），供调用方在嵌入时显式传 `--max-budget-usd` 时参考：

| 模板族 | 典型耗时 | 典型成本 | 推荐用户传参 |
| --- | --- | --- | --- |
| article 类（article-magazine / blog-post / newsletter）| ~70s | $0.3-0.5 | `--max-budget-usd 0.5` |
| deck 类（deck-* / 多页演示）| ~170s | $0.6-1.2 | `--max-budget-usd 2.0` |
| dataviz 类（data-report / dashboard）| ~145s | $0.6-1.0 | `--max-budget-usd 2.0` |

> `a2h` CLI 自身**不设默认上限**；上述参考值由调用方在嵌入时显式传入。

---

## 更多

- 设计与架构原则：[`docs/design.md`](./docs/design.md)
- 路线图：[`docs/roadmap.md`](./docs/roadmap.md)
- AI 协作约定：[`AGENTS.md`](./AGENTS.md)
- License: Apache-2.0
