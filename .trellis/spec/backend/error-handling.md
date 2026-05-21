# Error Handling — `a2h` 错误协议

> 本文档定义 `a2h` CLI 的错误信号协议。**所有错误必须可被调用方（LLM Agent / Skill / Shell 脚本）程序化解析**——因为本项目主场景是被嵌入调用，次场景才是人类手动。

---

## Why（这条规范防什么具体问题）

依据 PRD 决策 **Q-MVP-8 方案 C**：错误信号若不标准化，调用方只能用正则去抓 stderr 人话，遇到 `claude` 子进程的本地化错误文案就直接失效。`a2h` 必须给出三条同时成立的承诺：

1. **退出码恒定** ——上游 Agent 用 `exit code` 走 switch 分支，永不需要解析文案
2. **stderr 永远人读** ——人类排错不被 JSON 噪音淹没
3. **`--json-errors` 时 stdout 出结构化错误对象** ——LLM 调用方靠 stdout 首字符 `<` vs `{` 区分成败，零误判

不遵守此协议的直接后果：被嵌入到 Skill 调用链里时，调用方 catch 到错误却只能"重试或放弃"，无法智能 fallback（例如 `E_SKILL_NOT_FOUND` 时改投另一个 skill）。

---

## 退出码表（Single Source of Truth）

| 退出码 | 常量名 | 含义 | stderr 文案模板 |
| --- | --- | --- | --- |
| 0 | `OK` | 成功 | (空) |
| 1 | `E_USAGE` | 命令行参数错误（缺必需 arg、未知 flag、用法错误） | `Usage: ...` |
| 10 | `E_SKILL_NOT_FOUND` | `--skill` 指定的 skill 不存在 | `⚠️  Skill '<name>' not found. Try: a2h skills` |
| 20 | `E_AGENT_UNAVAILABLE` | 本机找不到 claude CLI 或调用失败 | `⚠️  claude CLI not found on PATH. Install: ...` |
| 30 | `E_BUDGET_EXCEEDED` | `--max-budget-usd` 触发（claude 退出码 ≠0 且 stderr 含 budget 关键字） | `⚠️  Budget exceeded ($x / $y).` |
| 40 | `E_OUTPUT_INVALID` | `extractHtml` 提取的 HTML 不合规（无 DOCTYPE / 无 `</html>`） | `⚠️  Output invalid: ...` |
| 50 | `E_NETWORK` | claude CLI 网络故障（exit 137 / ETIMEDOUT / DNS） | `⚠️  Network error: ...` |

> **新增退出码必须先改本表**——commands/*.ts 不允许"灵机一动"返回未登记的码。

---

## TS 类型定义

```ts
// ============================================================
// src/errors.ts —— 错误协议的唯一来源
// ============================================================

export const ErrorCode = {
  OK: 0,
  E_USAGE: 1,
  E_SKILL_NOT_FOUND: 10,
  E_AGENT_UNAVAILABLE: 20,
  E_BUDGET_EXCEEDED: 30,
  E_OUTPUT_INVALID: 40,
  E_NETWORK: 50,
} as const;
export type ErrorCode = typeof ErrorCode[keyof typeof ErrorCode];
export type ErrorCodeName = keyof typeof ErrorCode;

// ---- 错误对象（--json-errors 时序列化到 stdout） ----
export type ErrorObject = {
  code: ErrorCodeName;                  // "E_SKILL_NOT_FOUND" 等可读常量名
  message: string;                      // 人读 + agent 可读简短描述
  detail?: Record<string, unknown>;     // skill 名 / used+limit / agent 名等
  hint?: string;                        // 修复建议: "a2h skills" / "brew install claude"
};

// ---- 类型化错误基类 ----
export class A2hError extends Error {
  constructor(
    public readonly code: ErrorCodeName,
    message: string,
    public readonly detail?: Record<string, unknown>,
    public readonly hint?: string,
  ) {
    super(message);
    this.name = "A2hError";
  }
  toErrorObject(): ErrorObject {
    return { code: this.code, message: this.message, detail: this.detail, hint: this.hint };
  }
}
```

---

## `--json-errors` 双流协议（PRD Q-MVP-8 决策 C 重点）

```
┌─────────────────────┬──────────────────┬──────────────────────────────┐
│ 模式                │ stdout           │ stderr                       │
├─────────────────────┼──────────────────┼──────────────────────────────┤
│ 默认 + 成功         │ HTML（< 起手）   │ 空（或 TTY 进度行）          │
│ 默认 + 失败         │ 空               │ colored 人读消息             │
│ --json-errors+成功  │ HTML（< 起手）   │ 空（或 TTY 进度行）          │
│ --json-errors+失败  │ JSON（{ 起手）   │ colored 人读消息（不变）     │
└─────────────────────┴──────────────────┴──────────────────────────────┘
```

**调用方区分逻辑**：读 stdout 第一字节——`<` = HTML 成功；`{` = JSON 失败；空 = 看 exit code。

**关键不变量**：`--json-errors` **永远不影响 stderr**——stderr 在任何模式下都是人读 colored，给运维和人工排错用。

---

## 错误抛出与退出的纪律

```ts
// ============================================================
// src/cli.ts —— 唯一退出点（process.exit 仅允许出现在此处的最外层 catch）
// ============================================================

import { A2hError, ErrorCode, type ErrorObject } from "./errors";
import { log } from "./logger";

async function main(argv: string[]): Promise<void> {
  // ... 路由到 commands/render | skills | preview
}

main(process.argv.slice(2)).catch((err: unknown) => {
  const e = normalize(err);                        // Node 原生异常 → A2hError 映射
  log.error(formatHuman(e));                       // stderr 总出人读
  if (hasFlag("--json-errors")) {
    process.stdout.write(JSON.stringify(e.toErrorObject()) + "\n");
  }
  process.exit(ErrorCode[e.code]);
});

// ---- Node 原生异常 → ErrorCode 映射 ----
function normalize(err: unknown): A2hError {
  if (err instanceof A2hError) return err;
  const anyErr = err as NodeJS.ErrnoException;
  switch (anyErr?.code) {
    case "ENOENT":      return new A2hError("E_USAGE", anyErr.message);
    case "ETIMEDOUT":
    case "ENETUNREACH":
    case "EAI_AGAIN":   return new A2hError("E_NETWORK", anyErr.message);
    default:            return new A2hError("E_USAGE", String(anyErr?.message ?? err));
  }
}
```

**纪律清单**：

1. **`process.exit` 只允许出现在 `src/cli.ts` 最外层 catch**——commands/*.ts 抛错，cli.ts 收尸
2. **内部代码抛 `A2hError`**——不抛裸 `Error`，否则进 normalize 默认分支变 `E_USAGE` 失真
3. **不允许 `catch {}` 静默吞**——必须 rethrow 或用 `log.error` 后 rethrow
4. **commands 内部不直接 `console.error`**——走 `log.error`（见 logging-guidelines.md），避免污染 stdout 或绕过 stderr 协议

---

## 反模式（明确禁止）

```ts
// ❌ 反模式 1: console.error + 继续执行（错误信号丢失）
if (!skill) {
  console.error(`Skill ${name} not found`);
  return;                            // ← 调用方拿到 exit 0，以为成功
}

// ❌ 反模式 2: commands 内部 process.exit（绕过顶层 normalize）
export async function renderCommand(args: Args) {
  if (!fs.existsSync(args.input)) {
    process.exit(1);                 // ← cli.ts 顶层永远跑不到
  }
}

// ❌ 反模式 3: 发明退出码表外的码
process.exit(99);                    // ← 调用方 switch 漏分支，加新码必须先改 spec

// ❌ 反模式 4: stdout 写错误（污染数据流）
if (failed) {
  console.log(JSON.stringify({ error: "..." }));   // ← 不带 --json-errors 也写 stdout
}

// ✅ 正确：抛 A2hError，顶层统一处理
throw new A2hError("E_SKILL_NOT_FOUND", `Skill '${name}' not found`,
  { skill: name }, "Try: a2h skills");
```

---

## 引用与变更

- **协议来源**：PRD 决策 Q-MVP-8 方案 C（`.trellis/tasks/05-21-mvp-cli-extract-and-ship/prd.md`）
- **延迟容忍背景**：spike F6（68s 静默观察）证实错误必须既给人看也给机器看
- **变更流程**：增删退出码 / 改字段 → 先 PR 改本文档 → 再改 `src/errors.ts` → 再改 commands 与测试
