# a2h CLI 设计文档

> 这是 `a2h` 的内部设计参考——讲"为什么这样设计"。
> 用户视角的安装/使用/嵌入手册请回到 [`README.md`](../README.md)。

---

## 项目定位

将 [`nexu-io/html-anything`](https://github.com/nexu-io/html-anything) 的"文本→精美 HTML"能力，从"必须本地起 npm 服务"的形态，蒸馏为一个**无服务依赖、可管道调用的 CLI**。

| 上游能力 | 阻碍 |
| --- | --- |
| `html-anything` 渲染效果优秀，模板成熟 | 必须 `npm run dev` 起本地服务器才能产出 |
| 适合人类交互式使用 | 无法被 Codex / Claude Code / 其它 Agent Skill 内联调用 |
| 单次启动成本不高 | 在批处理、CI、Skill 嵌套场景下无法被脚本化 |

`a2h` 的存在意义：**一条命令、零服务、能被 spawn 进任何 Agent 的工作流里**。

---

## 核心目标 / 非目标

### 目标（What）

构造单一可执行入口（`a2h`），满足：

1. **输入**：从文件路径或 stdin 读取任意文本（Markdown、纯文本、半结构化数据）。
2. **模板**：通过 CLI 参数指定 skill（`--skill <id>`）。
3. **输出**：
   - 单个 self-contained HTML 文件到 `--out <path>`（CSS/JS/图片内联），或
   - 直接写入 stdout 供管道消费。
4. **退出码协议**：调用方靠 exit code 走 switch 分支，不解析 stderr 文案。

### 非目标（Not）

- 不维护本地 HTTP 服务（不要求用户先 `npm run dev`）。
- 不引入额外运行时（仅 Node.js 自身；视情况允许 bundle）。
- 不做模板设计本身的扩展——优先复刻 / 解耦上游模板。
- 不做多文件资产输出（始终是单 HTML）。
- 不在本仓库重写上游业务层（LLM 协议解析、prompt 调优、渲染逻辑都属上游）。

---

## 架构原则

### CLI 自身原则

- **单一可执行入口**：一条命令完成全部工作，无外部进程常驻。
- **模板逻辑下沉**：从 `ref/html-anything` 抽取 skill prompt，剥离 server / dev-only 依赖。
- **Self-contained 输出**：CSS / JS / 字体 / 小图全部内联，HTML 文件可直接传输与嵌入。
- **Agent-friendly**：参数语义对 LLM 友好（明确的 flag、确定性退出码、stderr 日志、stdout 数据）。
- **可组合**：支持 `cat input.md | a2h render - --skill post > out.html` Unix 管道风格。

### Charter ADR-lite 4 条原则（简版）

1. **运行时对用户透明**——`a2h` 不连任何 LLM API，所有 LLM 调用透传给本机已登录的 agent CLI（claude / qoder），配额 / 登录 / 网络全部由对应 CLI 负责。
2. **薄壳同步上游**——`scripts/sync-from-ref.mjs` 从 `ref/html-anything/` 单向拉 skill 资产，不在本仓库 fork 业务逻辑；遇渲染问题先 PR 上游，不在 a2h patch。
3. **不重写渲染**——HTML 由下游 agent CLI 生成，`a2h` 仅做 stdout 提取 + DOCTYPE/`</html>` 头尾校验，不解析 stream-json 不分析 token 流。
4. **Self-contained 输出**——产物始终是单个 HTML 文件，CSS/JS/字体/图全部内联，没有"输出目录"这种东西。

### 项目边界（严防"功能外溢"）

`a2h` 仅在 **CLI 适配层**做事——argparse / I/O 通道 / 退出码 / stderr 协议 / agent 选择 / 心跳 progress / HTML 头尾校验。

**严禁深入 ref 业务层**：

- LLM 协议解析（stream-json 解码 / 事件流 / token 流计数）
- skill prompt 调优、模板设计、shared directives 改写
- LLM 错误码 subtype 解读
- 渲染 / 抽取逻辑改写

加新功能前自问："这是 CLI 的事，还是 ref 的事？"——后者立刻丢回上游 PR，不在本仓库 fork。

---

## 已实现能力

首版 MVP 锁定的核心能力（PR1 + PR2 + PR3 已全部落地）：

- [x] 文本输入：`<file>` 位置参数 与 stdin（`-` 哨兵）二选一
- [x] Skill 选择：`--skill <id>`，含 ~80 个 skill（详见 `a2h skills`）
- [x] Agent 选择：`--agent claude|qoder`（缺省 claude，可被 `A2H_AGENT` 环境变量覆盖）
- [x] 输出落盘：`-o <file>` 或缺省 stdout
- [x] 预算上限：`--max-budget-usd <n>` 透传 claude（CLI 自身不设默认上限）
- [x] 错误协议：退出码 0 / 1 / 10 / 20 / 30 / 40 / 50 + `--json-errors` 双流分离
- [x] TTY 心跳 progress：仅 stderr，仅 isTTY 时
- [x] 静默/详细：`--quiet` / `--verbose`
- [x] HTML 头尾校验：DOCTYPE 起手 + `</html>` 闭合，不通过即退 `E_OUTPUT_INVALID`

### 明确不做（已决策，无需重新讨论）

- ~~`--interactive` 交互迭代~~——CLI 是无状态纯函数，预览 / 修订交给上游 webapp
- ~~`a2h preview` 子命令~~（PR3 砍）——浏览器交互不是 CLI 的事
- ~~`--vars-file <json>` / `--var k=v`~~——MVP 输入只走文本流，结构化变量交给上游 prompt
- ~~`~/.a2hrc` / 环境变量优先级链~~（除 `A2H_AGENT` 单一开关外）——无状态优先

---

## 参考实现

- `ref/html-anything/`——上游项目的浅克隆（`scripts/sync-from-ref.mjs` 维护），仅作只读参考与移植来源。
- **禁止**在 `ref/` 内修改代码。需要的逻辑请移植到 `src/`，并在新文件头注明 upstream 路径与 commit。
- 模板与渲染逻辑的抽取路径：`ref/html-anything/skills/*` → `src/templates/skills/<id>/`（由 `npm run sync` 自动同步）。

---

## 目录结构（实际）

```
Anything2HtmlCLI/
├── README.md                  # 用户视角 CLI 文档（安装 / 使用 / 嵌入）
├── AGENTS.md                  # AI 协作约定 + Trellis 入口
├── LICENSE                    # Apache-2.0
├── package.json               # bin: a2h → bin/a2h ; files: dist/ bin/ LICENSE README.md
├── tsconfig.json
├── eslint.config.js
├── bin/
│   └── a2h                    # 可执行入口 shim（指向 dist/cli.js）
├── dist/                      # esbuild 产物（gitignored，npm publish 含）
├── src/
│   ├── cli.ts                 # argparse + 路由表 + 顶层 catch（唯一 process.exit 点）
│   ├── errors.ts              # ErrorCode 表 + A2hError 类（错误协议 SSoT）
│   ├── logger.ts              # stderr 双流日志（colored 人读 / json-errors 协议）
│   ├── extract-html.ts        # agent stdout → HTML（DOCTYPE / </html> 校验）
│   ├── commands/
│   │   ├── render.ts          # a2h render <input|-> --skill <id>
│   │   └── skills.ts          # a2h skills [--json]
│   ├── agents/
│   │   ├── invoke.ts          # spawn claude/qoder + heartbeat progress
│   │   ├── argv.ts            # 构造 claude / qoder 参数表
│   │   ├── detect.ts          # PATH 探测 + 登录态判断
│   │   └── errors.ts          # claudeClassify / qoderClassify 关键字匹配
│   ├── templates/
│   │   ├── loader.ts          # 加载 skill prompt + shared directives
│   │   ├── shared.ts          # 共享 prompt 段（self-contained / inline-only 等）
│   │   └── skills/            # ~80 个 skill prompt（由 npm run sync 自动维护）
│   └── __tests__/             # node:test 测试 + fixtures
├── scripts/
│   └── sync-from-ref.mjs      # 从 ref/html-anything 单向同步 skill 资产
├── ref/
│   └── html-anything/         # 上游浅克隆（gitignored）
├── docs/                      # 开发者视角文档（本文件 + roadmap.md）
│   ├── design.md
│   └── roadmap.md
├── .trellis/                  # 任务管理 + spec
│   ├── spec/                  # 编码规范 / CLI 协议 / 错误协议
│   ├── tasks/                 # active + archived 任务
│   ├── workflow.md
│   └── workspace/             # 个人 journal
└── .claude/                   # Trellis 注入（agents / commands / hooks / skills）
```

### 核心设计要点

- `src/cli.ts` 是唯一允许 `process.exit` 的位置——commands 抛 `A2hError`，cli.ts 收尸。
- `src/errors.ts` 是错误协议 SSoT——退出码、常量名、字段定义改这里，README 与 spec 跟着同步。
- `src/templates/skills/` 由 sync 脚本维护，**不允许手改**——改动会被下次同步覆盖。
- `dist/` 不入 git 但入 npm（`files: ["dist/"]`）；`docs/` 入 git 但**不入 npm**（保持 tarball 小）。

---

## 相关文档

- 用户安装与使用：[README.md](../README.md)
- 路线图与已完成里程碑：[roadmap.md](./roadmap.md)
- AI 协作约定：[AGENTS.md](../AGENTS.md)
- CLI 设计协议：[`.trellis/spec/guides/cli-design.md`](../.trellis/spec/guides/cli-design.md)
- 错误协议 SSoT：[`.trellis/spec/backend/error-handling.md`](../.trellis/spec/backend/error-handling.md)
