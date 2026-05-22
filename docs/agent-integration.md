# Agent / Skill 嵌入手册

> 本手册面向想把 `a2h` 嵌入自己的 Agent / Skill / 工作流的开发者。如果你只是在终端直接用 `a2h`，请回到 [README — Usage / For Humans](../README.md#usage--for-humans)。

`a2h` 设计目标之一就是**被其它 Agent / Skill 内嵌调用**。整体集成模式只有一句话：

> spawn 子进程 → 写 stdin → 读 stdout → 看首字符判成功/失败。

所有协议都是为了让 LLM 调用方**不用解析自然语言、不用扫 stderr 文案**——首字符就够。

---

## Quick Start：spawn 调用（零磁盘副作用）

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

要点：

- `render -` 中的 `-` 哨兵 = 从 stdin 读输入（与 `cat` / `kubectl apply -f -` 一致）
- `--json-errors` 让失败时 stdout 也是结构化数据（JSON），不再需要扫 stderr
- `--max-budget-usd` 给一个软兜底，避免下游 LLM 失控烧钱

---

## 退出码协议（Exit Code Protocol）

| 退出码 | 常量名 | 含义 |
| --- | --- | --- |
| 0 | `OK` | 成功 |
| 1 | `E_USAGE` | 命令行参数错（缺必需 arg、未知 flag） |
| 10 | `E_SKILL_NOT_FOUND` | `--skill` 指定的 skill 不存在 |
| 20 | `E_AGENT_UNAVAILABLE` | 本机无对应 agent CLI 或未登录 |
| 30 | `E_BUDGET_EXCEEDED` | `--max-budget-usd` 触发 |
| 40 | `E_OUTPUT_INVALID` | LLM 输出非合规 HTML（无 DOCTYPE / 无 `</html>`） |
| 50 | `E_NETWORK` | claude / qoder 网络故障（DNS / 超时 / 连接重置） |

调用方用 exit code 走 `switch`，**永不需要解析 stderr 文案**。完整协议见 [`.trellis/spec/backend/error-handling.md`](../.trellis/spec/backend/error-handling.md)。

---

## 双流分离（stdout / stderr）

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

不需要正则、不需要 NLP、不需要查异常表——一字符决定分支。这是 `a2h` 嵌入协议的核心承诺。

---

## 推荐传 `--max-budget-usd` 兜底成本

`a2h` CLI 自身**不设默认上限**，端到端耗时与成本由下游 `claude` / `qoder` CLI 决定。下表来自 2026-05-21 spike 验证（`article-magazine` / `deck-product-launch` / `data-report`），调用方在嵌入时按模板族传：

| 模板族 | 典型耗时 | 典型成本 | 推荐传参 |
| --- | --- | --- | --- |
| article 类（article-magazine / blog-post / newsletter）| ~70s | $0.3-0.5 | `--max-budget-usd 0.5` |
| deck 类（deck-* / 多页演示）| ~170s | $0.6-1.2 | `--max-budget-usd 2.0` |
| dataviz 类（data-report / dashboard）| ~145s | $0.6-1.0 | `--max-budget-usd 2.0` |

> 表内成本/耗时随上游模型与 LLM 套餐变化，长期需以你自己的 spike 数据为准。

触发 `E_BUDGET_EXCEEDED`（exit 30）时，`a2h` 会在 LLM 调用层硬切，不会留下半成品 HTML。

---

## 推荐 `--json-errors` 让 stdout 永远是结构化数据

启用后：

- 成功 → stdout = HTML，首字符 `<`
- 失败 → stdout = JSON 错误对象，首字符 `{`

即调用方靠首字符切判分支，永远不需要解析 stderr。错误对象结构：

```json
{
  "code": "E_BUDGET_EXCEEDED",
  "exitCode": 30,
  "message": "render exceeded --max-budget-usd 0.5 (actual: $0.62)",
  "skill": "deck-product-launch",
  "agent": "claude"
}
```

错误码常量与 exit code 一一对应，详见上文 [退出码协议](#退出码协议exit-code-protocol)。

---

## Troubleshooting

| 现象 | exit | 排查方向 |
| --- | --- | --- |
| stdout 第一字符不是 `<` 也不是 `{` | ≠ 0 | 没传 `--json-errors`，stdout 为空 / 仅进度行；改传 `--json-errors` |
| `E_AGENT_UNAVAILABLE` (20) | 20 | 本机未装 / 未登录对应 agent CLI；先 `claude --version` / `qodercli --version` |
| `E_OUTPUT_INVALID` (40) | 40 | 下游 LLM 返回了非 HTML（被截断、被 markdown 包裹）；试更小 prompt 或更稳的 skill |
| `E_BUDGET_EXCEEDED` (30) | 30 | 模板族太贵，按上表抬高 `--max-budget-usd` 或换更轻模板 |
| `E_NETWORK` (50) | 50 | claude / qoder 网络层故障；非 a2h 自身问题，重试或切 agent |

---

## 相关参考

- [README — Usage / For Humans](../README.md#usage--for-humans) — 终端直接用法
- [`.trellis/spec/backend/error-handling.md`](../.trellis/spec/backend/error-handling.md) — 退出码与错误对象的唯一真相源
- [`docs/design.md`](./design.md) — 整体设计动机与架构原则
- [`docs/roadmap.md`](./roadmap.md) — 阶段性里程碑
