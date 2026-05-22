# CLI 设计指南

> **本项目特有协议**：`a2h` 的命令面、flag 命名、I/O 契约、help 文本风格、退出码表。
> 仅描述本项目自实现的最简 argparse 行为；不引用 commander / yargs / oclif 等库。

---

## Why（为什么这样设计）

`a2h` 的核心定位是**被 Agent / Skill 内嵌调用**（PRD Q-MVP-2，首版锁 claude）。
这意味着：

1. **stdout 必须能直接 pipe**——不夹任何装饰、广告、banner、progress（PRD Q-MVP-6：TTY 检测自动开 progress，但只走 stderr）。
2. **stdin 必须可接受**——agent 不愿落盘临时文件，希望 `spawn + stdin.write` 一气呵成（PRD Q-MVP-IO B）。
3. **错误必须机器可读**——agent 调用方需要解析 exit code + 可选 JSON 错误对象（PRD Q-MVP-8：双流分离协议）。
4. **flag 语义必须稳定**——内嵌方一旦写死 `--skill blog`，未来改名等同 breaking change。

> Lead with WHY：这套协议不是"通用 CLI 最佳实践"，而是"为 agent pipe 而生的接口契约"。

---

## 1. Subcommand 结构（kubectl / gh / git 风格）

PRD Q-MVP-5 决策：**多子命令**而非单一 `a2h` + 一堆 flag。
理由：未来扩展 `a2h sync-upstream`（P1+）/ `a2h diff` 等不会污染主命令；列子命令时 `a2h --help` 一目了然。

### P0 子命令（首版必达）

```text
a2h render <input | -> [--skill <id>] [-o <file>] [flags]
   生成单文件 HTML；--skill 缺省 article-magazine；-o 缺省按场景自动决定（见 §3）。
   - 表示从 stdin 读取输入。

a2h skills [--json]
   列出可用 skill；--json 输出结构化数组供 agent 消费。
```

> **`a2h preview` 已砍**（PR3 cli-polish）：CLI 工具不承担浏览器交互。
> 用户需要试看请 `a2h render in.md --skill X -o /tmp/preview.html` 后自行 `open` 或在编辑器打开。
> 浏览器交互不是 CLI 的事，是上游 webapp 的事。

### 未来扩展子命令（P1+）

| 子命令 | 用途 |
| --- | --- |
| `a2h sync-upstream` | 触发 `scripts/sync-from-ref.ts`（详见 [`upstream-sync.md`](./upstream-sync.md)） |
| `a2h diff` | 比较两次 render 输出，辅助 prompt 调试 |

### 加新子命令的流程

每个子命令 = `src/commands/<name>.ts` 写实现 + `cli.ts` 路由表加一行。
**不要**搞动态扫描 `commands/` 目录的反射魔法——显式路由表更易读。

```text
src/
├── cli.ts                # argparse + 路由表（subcommand → handler）
└── commands/
    ├── render.ts         # export async function run(argv: string[])
    └── skills.ts
```

---

## 2. Flag 命名约定

### kebab-case，永远

```text
✅ --max-budget-usd
✅ --json-errors
✅ --no-bare
❌ --maxBudgetUsd       # camelCase 与 Unix 传统冲突
❌ --MAX_BUDGET_USD     # 环境变量风格不入 flag
```

### 单字母短选项：仅给最常用 4 个

| 短 | 长 | 语义 |
| --- | --- | --- |
| `-o` | `--out` | 输出文件路径 |
| `-q` | `--quiet` | 静默 progress 与 info |
| `-v` | `--verbose` | 输出详细日志到 stderr |
| `-h` | `--help` | 显示帮助 |

**不发明** `-s`（与 Unix `-s/--silent` 语义冲突）、`-i`（与 `--interactive` / `--in-place` 都可能冲突）、`-f`（force 还是 file？）。
新增 flag 默认**只**给长名，短名只在该 flag 高频出现且无歧义时追加。

### Boolean flag 默认值规则

- 默认 `false` 的 flag：直接 `--foo` 开启，不需要 `--no-foo`。
- 默认 `true` 的 flag：必须同时支持 `--no-X` 关闭（如 PRD Q-MVP-5 + spike F3 的 `--bare` 默认开，提供 `--no-bare` 转义阀）。

### 全局 flag（在所有子命令可用）

```text
--quiet | -q       静默 progress 与非错误 stderr 输出
--verbose | -v     额外 debug 信息打到 stderr
--help | -h        子命令级帮助
--version          打印 a2h 版本与 upstream commit SHA（详见 upstream-sync.md）
```

### `render` 专属 flag

```text
--skill <id>          skill 标识，如 article-magazine / blog-post
                      缺省 = "article-magazine"（PR4 Q-RD-3 决策；不存在的 id 仍报 E_SKILL_NOT_FOUND）
-o <file>             输出到指定文件路径（不接受目录）；缺省按场景自动决定（见 §3 输出）
                      "-" 哨兵 = 强制 stdout
--max-budget-usd <n>  透传至下游 claude CLI（PRD Q-MVP-7：默认 unset）
--json-errors         失败时 stdout 写 JSON 错误对象（详见 §5）
--bare                透传 claude --bare（默认 true，spike F3）
--no-bare             关闭 bare（极少需要；用户 session 污染时才用）
```

---

## 3. I/O 契约（PRD 决策 Q-MVP-IO B）

### 输入

- **位置参数**为文件路径：`a2h render input.md --skill blog`
- **`-` 哨兵**表示从 stdin 读取（Unix 传统，与 `cat` / `tar` / `kubectl apply -f -` 一致）：

```bash
a2h render - --skill blog -o out.html < input.md
```

- 未指定位置参数 = 用法错误（exit 1），**不**默认读 stdin（避免误操作下挂死）。

### 输出

- **缺省**：按"输入类型 + stdout 是否 TTY"自动决定（PR4 Q-RD-4 决策 B）：
  - 文件输入 + 交互终端 → 写 `<input-stem>.html`（与输入同目录）
  - 文件输入 + pipe / 重定向（非 TTY） → 写 stdout（保 Unix 管道契约）
  - stdin 输入（`-`） → 永远写 stdout（无原文件可推）
- **`-o <file>`**：写指定**文件路径**，不接受目录路径。
  - 如需写入目录中的随机命名文件，由 shell 包装：`a2h render in.md --skill blog -o "$(mktemp -t a2h.XXXXXX.html)"`
  - 不支持 `-o /some/dir/`——保持语义最纯粹（PRD 决策 Q-MVP-IO B）。
- **`-o -` 哨兵**：强制 stdout（PR4 Q-RD-2），用于"文件输入 + 交互终端但仍想要 stdout"场景，
  例如 `a2h render in.md -o - | grep '<title>'`。
- 关键不变量：成功路径上 stdout 首字符必然是 `<`（DOCTYPE 起手），无论默认 / 显式路径。

### Agent 嵌入零磁盘副作用

这是 I/O 契约的终极测试：

```ts
// agent 内部调用 a2h，全程无文件落盘
const child = spawn("a2h", ["render", "-", "--skill", "blog"], {
  stdio: ["pipe", "pipe", "inherit"],
});
child.stdin.write(markdownContent);
child.stdin.end();
const html = await streamToString(child.stdout);
```

如果某个 flag 设计破坏了上面这段 ~5 行的零落盘契约——这个 flag 设计错了。

---

## 4. Help 文本风格

### 结构（USAGE / DESCRIPTION / FLAGS / EXAMPLES）

```text
USAGE
  a2h render <input | -> [--skill <id>] [-o <file>] [flags]

DESCRIPTION
  Render input text to a self-contained HTML file using the given skill.

FLAGS
  --skill <id>           Skill identifier. Defaults to "article-magazine".
                         Run \`a2h skills\` to list available ids.
  -o, --out <file>       Output file path. Pass "-" to force stdout.
                         If omitted: file input + TTY → <input-stem>.html;
                                     file input + pipe → stdout;
                                     stdin → stdout.
  --max-budget-usd <n>   Forward to claude CLI as cost ceiling.
  --json-errors          Emit JSON error object to stdout on failure.
  --no-bare              Disable claude --bare (rarely needed).
  -q, --quiet            Suppress progress on stderr.
  -h, --help             Show this help.

EXAMPLES
  # Human invocation (interactive defaults):
  a2h render article.md

  # Agent pipe invocation (zero disk):
  echo "$content" | a2h render - --skill blog --json-errors > out.html
```

### 硬性约束

1. **DESCRIPTION 一句话**只说"做什么"，不写"为什么"——为什么有这个子命令属于 README 范畴。
2. **每个子命令至少 2 个 EXAMPLES**：一个人类调用 + 一个 agent pipe 调用。
3. **FLAGS 顺序**：必填 → 高频可选 → 错误协议相关 → 调试 flag → `-h`。
4. **顶层 `a2h --help`** 列出所有子命令 + 一行说明，不展开子命令的 flag。

### 反模式

```text
❌ 在 --help 中嵌广告 / banner / "powered by xxx"
❌ 在 --help 中嵌 Telemetry / 升级提示
❌ DESCRIPTION 写"Render input ... so that you can iterate quickly with agents"
   ——把"为什么"和"做什么"混在一起，污染 EXAMPLES 之前的视觉重心
❌ EXAMPLES 只给一个人类调用——agent 调用是本项目核心场景，必须示范
```

---

## 5. Exit Code 表（PRD Q-MVP-8 决策）

呼应 backend/error-handling.md，但**站在用户视角**：调用方拿到的退出码 + 可选的 JSON 错误对象。

> 退出码、常量名、含义三栏与 `backend/error-handling.md` 的退出码表**逐字对齐**——
> 任何新增 / 改动必须先改 error-handling.md（Single Source of Truth），再回写本表。

| Exit | 常量名 | 含义 | 触发条件 |
| --- | --- | --- | --- |
| `0` | `OK` | 成功 | HTML 写出且 DOCTYPE 起手 / `</html>` 闭合 |
| `1` | `E_USAGE` | usage 错误 | flag 缺失、未知子命令、位置参数缺失等 |
| `10` | `E_SKILL_NOT_FOUND` | skill not found | `--skill` 指定的 id 不在 `a2h skills` 列表 |
| `20` | `E_AGENT_UNAVAILABLE` | agent unavailable | claude CLI 不在 PATH / 未登录 |
| `30` | `E_BUDGET_EXCEEDED` | budget exceeded | claude 返回 budget 错误信号 |
| `40` | `E_OUTPUT_INVALID` | output invalid | claude 输出未通过 extract-html 校验（无 DOCTYPE 等） |
| `50` | `E_NETWORK` | network | claude 端 API 不可达 |

### Agent 嵌入侧解析示例

```bash
a2h render input.md --skill blog -o out.html --json-errors
case $? in
  0)  echo "ok" ;;
  10) echo "skill not found, run: a2h skills" ;;
  20) echo "claude CLI missing or not logged in" ;;
  30) echo "budget exceeded" ;;
  *)  cat out.html | jq -r '.message' ;;  # --json-errors 让失败时 out.html 是 JSON
esac
```

### 双流分离协议（PRD Q-MVP-8 C）

| 场景 | stdout | stderr | exit |
| --- | --- | --- | --- |
| 成功 | HTML（首字符 `<`） | progress（仅 isTTY 时） | `0` |
| 失败 + 默认 | 空 | colored 人读错误 | 非零 |
| 失败 + `--json-errors` | JSON 错误对象（首字符 `{`） | colored 人读错误 | 非零 |

**首字符判别**：调用方一行可分辨成功/失败：

```ts
const isError = output.trimStart().startsWith("{");
```

---

## 6. CLI 反模式（明确禁止）

### 禁止：把"配置"做成 `~/.a2hrc` 或环境变量优先级链

```text
❌ ~/.a2hrc → A2H_DEFAULT_SKILL → flag 三级 fallback
✅ MVP 只接受 flag——无状态、可复现、agent 易理解
```

环境变量优先级链是经典 CLI 调试地狱（"为什么本机能跑 CI 不行？"）。
agent 嵌入场景下，agent 自己管 flag 即可，a2h 不需要"用户配置"。

### 禁止：副作用子命令（如 `a2h config set ...`）

```text
❌ a2h config set default-skill blog       # 引入持久状态
❌ a2h login                              # 凭据管理交给 agent CLI
✅ a2h 是无状态工具——每次调用纯函数式
```

### 禁止：`a2h render` 不带 `-o` 时打开浏览器

```text
❌ a2h render input.md --skill blog        # 自动 open http://...
✅ render 永远只产 HTML（stdout 或 -o 文件）
   浏览器交互不是 CLI 的事——用户需要试看请 -o 写文件后自己 open
```

理由：渲染 = 纯函数；预览 = 副作用。混在一起会让 `a2h render in.md --skill blog | grep '<title>'` 这种 pipe 莫名其妙打开浏览器。`a2h preview` 子命令已在 PR3 砍掉，理由同此。

### 禁止：在 --help 输出中嵌广告 / banner / Telemetry 提示

```text
❌ "🎉 New skill 'magazine-pro' available! Upgrade with npm i -g @scope/a2h"
✅ --help 是命令面契约文档；版本提示交给 a2h --version
```

### 禁止：让 stdout 在成功路径上输出非 HTML

```text
❌ "Rendering... done in 68s\n<!DOCTYPE html>..."
✅ 成功时 stdout 首字符必然是 < 或 {（json-errors 失败时）
   progress 一律走 stderr（PRD Q-MVP-6）
```

---

## 速查表

| 议题 | 协议 |
| --- | --- |
| 子命令风格 | kubectl/gh：`a2h <verb> [args] [flags]` |
| flag 大小写 | kebab-case |
| stdin 哨兵 | `-`（位置参数位） |
| 输出路径 | `-o <file>`，不接受目录 |
| 默认 progress 出口 | stderr，仅 isTTY 时 |
| 错误协议 | exit code + 可选 `--json-errors` |
| 配置形态 | 仅 flag，无 rc / env |

---

## 项目边界原则

`a2h` 仅在 **CLI 适配层**做事——argparse / I/O 通道 / 退出码 / stderr 协议 / agent 选择 / 心跳 progress / HTML 头尾校验。

**严禁深入 ref 业务层**：

- LLM 协议解析（stream-json 解码 / 事件流 / token 流计数）
- skill prompt 调优、模板设计、shared directives 改写
- LLM 错误码 subtype 解读（如 stream-json `error` 事件细分）
- 渲染 / 抽取逻辑改写（`extract-html.ts` 属上游同步层）

**失败兜底**：关键字 / 启发式现状能用就先用，不切结构化解析层（参见 `src/agents/errors.ts` 的 `claudeClassify` / `qoderClassify`：纯关键字匹配，零协议层依赖）。

**加新功能前自问**："这是 CLI 的事，还是 ref 的事？"——后者立刻丢回上游 PR 或独立任务评估，**不在本仓库 fork**。一旦本仓库私自 patch 渲染逻辑，下次 `npm run sync` 即破产薄壳同步原则。
