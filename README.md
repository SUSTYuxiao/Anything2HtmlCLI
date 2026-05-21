# Anything2HtmlCLI

> 把任意文本变成单文件 HTML——不启服务，纯 CLI，可被任何 Agent / Skill 内嵌调用。

---

## 1. 一句话定位

将 [`nexu-io/html-anything`](https://github.com/nexu-io/html-anything) 的"文本→精美 HTML"能力，从"必须本地起 npm 服务"的形态，蒸馏为一个**无服务依赖、可管道调用的 CLI**。

## 2. 背景与痛点

| 上游能力 | 阻碍 |
| --- | --- |
| `html-anything` 渲染效果优秀，模板成熟 | 必须 `npm run dev` 起本地服务器才能产出 |
| 适合人类交互式使用 | 无法被 Codex / Claude Code / 其它 Agent Skill 内联调用 |
| 单次启动成本不高 | 在批处理、CI、Skill 嵌套场景下无法被脚本化 |

## 3. 核心目标（What）

构造单一可执行入口（暂命名 `a2h` / `anything2html`），满足：

1. **输入**：从文件路径或 stdin 读取任意文本（Markdown、纯文本、半结构化数据）。
2. **模板**：通过 CLI 参数指定模板名与变量（`--template <name> --var key=value`）。
3. **输出**：
   - 单个 self-contained HTML 文件到 `--out <path>`（CSS/JS/图片内联），或
   - 直接写入 stdout 供管道消费。
4. **二次修改**：构建过程支持交互式迭代（保留 prompt 上下文，反复修订直到满意），最终落盘单文件 HTML。

## 4. 非目标（Not）

- 不维护本地 HTTP 服务（不要求用户先 `npm run dev`）。
- 不引入额外运行时（仅 Node.js 自身；视情况允许 bundle）。
- 不做模板设计本身的扩展——优先复刻 / 解耦上游模板。
- 不做多文件资产输出（始终是单 HTML）。

## 5. 架构原则

- **单一可执行入口**：一条命令完成全部工作，无外部进程。
- **模板逻辑下沉**：从 `ref/html-anything` 中抽取渲染与模板逻辑，剥离 server / dev-only 依赖。
- **Self-contained 输出**：CSS / JS / 字体 / 小图全部内联，HTML 文件可直接传输与嵌入。
- **Agent-friendly**：参数语义对 LLM 友好（明确的 flag、确定性退出码、stderr 日志、stdout 数据）。
- **可组合**：支持 `cat input.md | a2h --template post > out.html` 这种 Unix 管道风格。

## 6. 关键能力清单（首版 MVP）

- [ ] 文本输入：`--input <file>` 与 stdin 二选一
- [ ] 模板选择：`--template <name>`，列举内置模板
- [ ] 变量传入：`--var k=v`（可重复）或 `--vars-file <json>`
- [ ] 输出落盘：`--out <path>`（缺省 stdout）
- [ ] 交互迭代：`--interactive` 进入"生成→预览→修订"循环
- [ ] 静默/详细：`--quiet` / `--verbose`，与 Agent 输出整洁度对齐

## 7. 参考实现

- `ref/html-anything/`——上游项目的浅克隆（git submodule 或独立子目录），仅作只读参考与移植来源；**禁止**在 `ref/` 内修改代码。
- 模板与渲染逻辑的抽取路径详见后续 `.trellis/spec/` 与各任务 PRD。

## 8. 路线图（占位）

| 阶段 | 关注点 |
| --- | --- |
| Charter | 目标对齐、参考导入（**已完成**） |
| Spec Bootstrap | 编码规范、目录约定（`00-bootstrap-guidelines`） |
| MVP | 解耦上游核心渲染、CLI 骨架、最小模板 |
| Polish | 预览、交互式修订、自包含打包 |
| Distribution | npm / 单二进制发布 |

## 9. 成本与时间参考（spike 实证）

`a2h render` 端到端耗时与成本由下游 `claude` CLI 决定。下表来自 2026-05-21 spike 验证（`article-magazine` / `deck-product-launch` / `data-report`），供调用方在嵌入时显式传 `--max-budget-usd` 时参考：

| 模板族 | 典型耗时 | 典型成本 | 推荐用户传参 |
| --- | --- | --- | --- |
| article 类（article-magazine / blog-post / newsletter）| ~70s | $0.3-0.5 | `--max-budget-usd 0.5` |
| deck 类（deck-* / 多页演示）| ~170s | $0.6-1.2 | `--max-budget-usd 2.0` |
| dataviz 类（data-report / dashboard）| ~145s | $0.6-1.0 | `--max-budget-usd 2.0` |

> `a2h` CLI 自身**不设默认上限**（per PRD Q-MVP-7 决策 A）；上述参考值由调用方在嵌入时显式传入。

## 10. 目录结构（规划）

```
Anything2HtmlCLI/
├── README.md          # 你正在读的项目目标文档
├── AGENTS.md          # AI 协作约定（Trellis 入口）
├── ref/
│   └── html-anything/ # 上游参考实现（只读）
├── src/               # CLI 源码（待建）
├── templates/         # 抽取后的模板（待建）
├── .trellis/          # 任务、规范、工作区
└── ...
```

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

`a2h` 自身不设默认上限——参考第 9 节"成本与时间参考"按模板族传值。

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
| 40 | `E_OUTPUT_INVALID` | LLM 输出非合规 HTML（无 DOCTYPE / 无 `</html>`） |
| 50 | `E_NETWORK` | claude / qoder 网络故障（DNS / 超时 / 连接重置） |

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

参考第 9 节"成本与时间参考"，按模板族传：

- article 类（article-magazine / blog-post / newsletter）：`--max-budget-usd 0.5`
- deck 类（deck-* / 多页演示）：`--max-budget-usd 2.0`
- dataviz 类（data-report / dashboard）：`--max-budget-usd 2.0`

### 推荐 `--json-errors` 让 stdout 永远是结构化数据

启用后失败时 stdout = JSON 错误对象（首字符 `{`），成功时 stdout = HTML（首字符 `<`）。LLM 调用方靠首字符切判分支，无需解析 stderr。
