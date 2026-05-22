# 日志规范 — `a2h` 日志与进度协议

> 本文档定义 `a2h` CLI 的 stderr / stdout 通道纪律与进度反馈协议。**stdout 永远只承载数据（HTML 或 JSON 错误对象），stderr 承载所有给人看的字符**——这是被嵌入调用场景下不可让步的红线。

---

## Why（这条规范防什么具体问题）

依据 spike F6（`.trellis/tasks/05-21-mvp-cli-extract-and-ship/research/spike-end-to-end.md`）：claude API 端到端 **68 秒** 静默是不可接受的 UX——人类用户会以为卡死，调用方 Agent 也无法判断进度。但与此同时，本项目的主场景是被另一个 Agent 用 `spawn("a2h", [...])` 嵌入调用，调用方会把 stdout 当 HTML 解析。

矛盾的解法即 PRD 决策 **Q-MVP-6 方案 A**：

1. **stderr 出进度** ——保活信号给人看，永不污染 stdout
2. **TTY 检测自动开关** ——人在终端时才出进度；被 pipe / `-o` 重定向 / CI 时彻底静默
3. **stdout 永远纯净** ——HTML 在前，JSON 错误对象在后，绝无其他字节

违反任一条即破坏被嵌入场景的可解析性，本规范无妥协空间。

---

## stderr 协议（人读消息的唯一通道）

```
┌─────────────────────┬──────────────────────────────────────────────┐
│ 通道                │ 内容                                         │
├─────────────────────┼──────────────────────────────────────────────┤
│ stdout              │ 仅 HTML（成功）或 JSON 错误对象（失败）      │
│ stderr              │ 所有人读字符：进度、info、warn、error        │
└─────────────────────┴──────────────────────────────────────────────┘
```

**颜色策略**：仅在 `process.stderr.isTTY === true && !process.env.NO_COLOR` 时上色，否则纯文本。**禁止引入 `chalk` / `picocolors` 运行时依赖**——CLI 启动延迟敏感且自身已是薄壳，自带极简 ANSI 即够：

```ts
// src/logger.ts —— 极简 ANSI（够用，不引依赖）
const ANSI = {
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red:    (s: string) => `\x1b[31m${s}\x1b[0m`,
  dim:    (s: string) => `\x1b[2m${s}\x1b[0m`,
};
```

---

## 进度协议（PRD Q-MVP-6 决策 A）

### 触发条件（仅 stderr.isTTY + !quiet）

```ts
const heartbeatVisible =
  process.stderr.isTTY === true &&
  !flags.quiet;
```

任一条件假即完全静默——这覆盖了：被 Agent 嵌入调用（stderr 也被 pipe）、CI 环境（`isTTY` 自然为 false）、显式 `--quiet`。

#### 为什么只看 stderr.isTTY，不看 stdout.isTTY

心跳走 stderr，stdout 是数据通道。两条流的 TTY 状态相互独立判定：

- `a2h render in.md > out.html`：stdout 被 `>` 重定向到文件 → `stdout.isTTY = false`；但 stderr 仍连终端 → `stderr.isTTY = true`，**用户在终端能看到心跳**才是正解。
- 把 stdout.isTTY 拖进 stderr 反馈通道判定，会在这种最常见的"渲染并重定向"场景下错误地干掉心跳——用户 60+ 秒无反馈。
- 通用原则：**走哪条通道的输出，就只看哪条通道的 isTTY**。stderr 输出（progress / progressTick / info / verbose / done）一律只看 `process.stderr.isTTY`。

### 推荐路径：基于时间的心跳（heartbeat）

**默认实现**：`invokeAgent` 内部 `setInterval(opts.onProgress, 5000)`，每 5 秒回调 caller 传入的 `onProgress`；caller 一般传 `() => log.progressTick()`，TTY+!quiet 时打一个 `·` 累加。

```ts
// src/agents/invoke.ts —— heartbeat 实测形态（仅作示例，不修改本文件）
const HEARTBEAT_MS = 5000;
let heartbeat: NodeJS.Timeout | null = null;
if (opts.onProgress) heartbeat = setInterval(opts.onProgress, HEARTBEAT_MS);
const stopHeartbeat = (): void => { if (heartbeat) { clearInterval(heartbeat); heartbeat = null; } };

// close / error / abort 三路径都必须 stopHeartbeat()——否则 setInterval 泄漏
child.on("close", () => { stopHeartbeat(); /* ... */ });
child.on("error", () => { stopHeartbeat(); /* ... */ });
opts.signal?.addEventListener("abort", () => { stopHeartbeat(); /* ... */ }, { once: true });
```

**为什么用心跳而非读 stdout**：调用方拿 stdout 当 HTML 解析；invokeAgent 不窥探 stdout 中间内容（`stdout += chunk` 仅累计，不解码 stream-json）。这是项目边界原则的具体体现——**LLM 协议解析是 ref 的事，不是 CLI 的事**（参见 `.trellis/spec/guides/cli-design.md` 末尾"项目边界原则"段）。

### 进度行内容（最简，可粘贴）

```
[a2h] skill=article-magazine agent=claude
· · · · · · · · · · · · · ·          ← 心跳：每 5s 一个点（TTY+!quiet 时累加追加）
[a2h] done in 68s, wrote 15.9KB
```

`done` 时必须换行落定，把动态行钉为静态记录（`log.done(...)` 内部已 `\n` 起手）。

### 节奏

| 模式 | 节奏 |
| --- | --- |
| 默认（heartbeat） | `setInterval(opts.onProgress, 5000)` → `log.progressTick()` 仅 stderr.isTTY+!quiet 写 `·` |
| `--quiet` / stderr 非 TTY | 心跳函数仍跑，但 `progressTick` 内部条件假，零字节落到 stderr |

### 可选演化（未来评估，**当前不做**）

解析 LLM 协议层流（如 claude `stream-json --include-partial-messages` 的 token-by-token progress）——
**这越过项目边界**（cli-design.md "项目边界原则"），引入 stream-json subtype 解读、事件流 buffering、
ndjson parser。需由独立任务显式评估收益与边界债务，不在本规范默认开启。

### TTY 重写示意

```ts
// 心跳路径（推荐）：每 5s 追加一个点，不覆盖
process.stderr.write(dim("·"));   // 由 log.progressTick() 内部完成

// 旧 streaming 路径（保留 API，但 invokeAgent 心跳路径下已不主动调用）
process.stderr.write(`\r[a2h] streaming… ${chars}k chars`);

// done 阶段：换行 + 终态
process.stderr.write(`\n[a2h] done in ${secs}s, wrote ${size}\n`);
```

---

## flag 行为矩阵

| flag | 进度 | info | error | 用途 |
| --- | --- | --- | --- | --- |
| 默认（无 flag） | TTY 时打 | TTY 时打 | 始终打 | 人类终端使用 |
| `--quiet` / `-q` | 静默 | 静默 | 始终打 | 脚本里只关心 exit code |
| `--verbose` / `-v` | 默认 + prompt 字节数 / argv / claude PID | 同 info | 同 error | 排错 |
| 非 TTY（pipe / `-o` / CI） | 静默 | 静默 | 始终打 | 被嵌入调用 |

> `--quiet` 不影响 stderr 错误输出——错误是给运维看的关键信号，不能被 `-q` 屏蔽。

---

## logger 内部 API（`src/logger.ts` 建议形态）

```ts
// ============================================================
// src/logger.ts —— 唯一 stderr 出口
// ============================================================

type Flags = { quiet: boolean; verbose: boolean };

let flags: Flags = { quiet: false, verbose: false };

export function configureLogger(f: Flags): void { flags = f; }

// stderr 通道 TTY 检测 (走 stderr 的输出共用此判定)
const stderrIsTty = (): boolean => process.stderr.isTTY === true;
const stderrVisible = (): boolean => stderrIsTty() && !flags.quiet;

const useColor = (): boolean =>
  stderrIsTty() && !process.env.NO_COLOR;

const yellow = (s: string) => useColor() ? `\x1b[33m${s}\x1b[0m` : s;
const red    = (s: string) => useColor() ? `\x1b[31m${s}\x1b[0m` : s;
const dim    = (s: string) => useColor() ? `\x1b[2m${s}\x1b[0m`  : s;

export const log = {
  // ---- info: stderr TTY 且非 quiet 时打 ----
  info: (msg: string): void => {
    if (!stderrVisible()) return;
    process.stderr.write(dim(`[a2h] ${msg}`) + "\n");
  },

  // ---- progress: 仅 stderr TTY，\r 覆盖同一行 ----
  progress: (msg: string): void => {
    if (!stderrVisible()) return;
    process.stderr.write(`\r${dim(`[a2h] ${msg}`)}`);
  },

  // ---- done: 收束 progress，换行落定 ----
  done: (msg: string): void => {
    if (!stderrVisible()) return;
    process.stderr.write(`\n${yellow(`[a2h] ${msg}`)}\n`);
  },

  // ---- error: 永远打 stderr，独立于 quiet/TTY ----
  error: (msg: string): void => {
    process.stderr.write(red(`⚠️  ${msg}`) + "\n");
  },
};
```

**刻意缺失**：

- 没有 `log.debug` / `log.warn` ——`info` + `error` 两级足矣，多分级是上游 web 服务的需求，CLI 用不上
- 没有结构化 JSON 日志 ——CLI 失败信号已由 `--json-errors` 走 stdout（见 error-handling.md），无需第二条 JSON 通道

---

## 反模式（明确禁止）

```ts
// ❌ 反模式 1: console.log 写日志（污染 stdout，调用方解析失败）
console.log("[a2h] starting...");
//          ^^^ stdout，调用方 Agent 把这行当 HTML 头解析爆炸

// ❌ 反模式 2: console.error 直接调（绕过 logger，色彩与 quiet/TTY 失控）
console.error(`failed: ${err}`);

// ❌ 反模式 3: 引入运行时日志库
import pino from "pino";              // ← 增 ~200KB 依赖，违反"零依赖纯 Node"原则
import chalk from "chalk";            // ← 极简 ANSI 8 行就能搞定，不需要

// ❌ 反模式 4: 把 progress 当 debug 关掉
if (process.env.DEBUG) log.progress(...);
//  ^^^^ progress 是正式 UX 协议，不是 debug 开关

// ❌ 反模式 5: 非 TTY 也打 progress（CI 日志爆炸）
process.stderr.write(`\r[a2h] ...`);  // ← 跳过 isTTY 检查，CI 输出 \r 乱码

// ✅ 正确：所有 stderr 写入收口到 logger
import { log } from "./logger";
log.info(`skill=${skillId} agent=claude`);
log.progress(`streaming… ${chars}k chars`);
log.done(`done in ${secs}s, wrote ${size}`);
log.error(`Skill '${name}' not found`);
```

---

## 引用与变更

- **协议来源**：PRD 决策 Q-MVP-6 方案 A（TTY 自动开 progress）+ spike F6（68s 静默不可接受）
- **stdout 纯净性**：与 error-handling.md 的 `--json-errors` 协议联动——两文档共同保证 stdout 首字节稳定为 `<` 或 `{`
- **变更流程**：改进度行格式 / flag 行为 → 先改本文档 → 再改 `src/logger.ts` → 再回归测试 TTY 与非 TTY 两条路径
