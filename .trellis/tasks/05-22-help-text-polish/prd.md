# CLI UX 打磨: help 中文化 + 心跳 TTY 检测修正

## Goal

两件事打包：
1. **help 文本优化与中文化**——3 段 help (HELP_TOP / HELP_RENDER / HELP_SKILLS) 全部中文化，与项目其他文档（README / spec）风格一致；优化措辞、补充退出码表、加文档指引
2. **心跳 TTY 检测修正**——当前 logger 心跳条件 `stdout.isTTY && stderr.isTTY` 在 `a2h render in.md > out.html` 场景下被 stdout 重定向干掉，违反"心跳走 stderr"的设计本意。修正为**只看 stderr.isTTY + !quiet**

## What I already know

- `src/cli.ts` HELP_TOP / HELP_RENDER / HELP_SKILLS 三段全英文，与项目其他文档（README 中文 / spec 中文）风格不一致
- `src/logger.ts` 心跳 TTY 检测设计缺陷：把 stdout 通道状态拖入 stderr 反馈通道判定
- 用户实测：跑 `a2h render README.md > out.html` 完全无反馈 60+ 秒，体验差
- 设计原则（spec/backend/logging-guidelines.md）："stdout 是数据通道、stderr 是人读通道"——TTY 检测应分流，不应耦合
- 现有心跳实现：`src/agents/invoke.ts` 的 setInterval(opts.onProgress, HEARTBEAT_MS=5000) + 三路径 clearInterval

## Requirements（P0）

### 1. help 文本中文化（3 段全改写）

按下列目标格式重写 `src/cli.ts` 的三个 HELP 常量。**保留英文 identifier / flag / 路径 / 命令**，自然语言全部中文。

#### 1.1 HELP_TOP（约 30-35 行）

```
a2h 0.1.0 — 把文本变成单文件 HTML，无需启服务器。

用法
  a2h <子命令> [参数] [选项]

子命令
  render <输入 | ->     用指定 skill 渲染输入文本为单文件 HTML
  skills [--json]       列出所有可用 skill 标识符

全局选项
  -q, --quiet           静默模式（stderr 不打 progress / info）
  -v, --verbose         详细模式（stderr 增加调试信息）
  -h, --help            打印帮助；也可用 a2h <子命令> --help 看子命令详情
      --version         打印版本号

示例
  a2h skills                          # 列出所有 skill
  a2h render in.md                    # 交互终端：默认 article-magazine + 写到 ./in.html
  cat in.md | a2h render -            # 管道：stdin 读入，stdout 输出
  a2h render in.md --json-errors > out.html
                                      # Agent 嵌入：失败时 stdout 出 JSON 错误对象

文档
  README、设计、路线图见仓库根目录 README.md / docs/
```

#### 1.2 HELP_RENDER（约 60-70 行）

含：
- 一句话定位
- 用法 + 参数说明（input + - 哨兵）
- 选项分组：skill / agent / 输出 / 成本 / 错误协议 / 静默
- 示例 5 个：交互默认 / 显式参数 / `-o -` 哨兵 / Agent 嵌入 / 切 agent
- **退出码表**（与 spec/backend/error-handling.md 字面对齐）
- 末尾"详见 README §Embedding"指引

#### 1.3 HELP_SKILLS（约 20-25 行）

含：
- 一句话定位
- 用法 + 选项 (--json)
- 示例 3 个（默认表格 / `--json | jq` 取 id / 按 category 过滤）
- 提到共 75 个 skill + 大致类别（article / blog / card / deck / dashboard / data-report 等）

### 2. 心跳 TTY 检测修正

#### 2.1 `src/logger.ts` 的 `progressTick()` TTY 检测

当前（推断）：
```ts
const isTTY = process.stdout.isTTY && process.stderr.isTTY && !quiet;
```

改为：
```ts
// 心跳走 stderr，TTY 检测只看 stderr 通道（per spec/backend/logging-guidelines.md
// "stdout 数据通道 / stderr 人读通道"分流原则）
const heartbeatVisible = process.stderr.isTTY && !quiet;
```

同样原则审视 `log.info` / `log.done` / `log.error` 等其他方法的 TTY 检测——**只要走 stderr 的方法，TTY 检测都应该只看 stderr.isTTY**。

#### 2.2 spec drift 同步

`.trellis/spec/backend/logging-guidelines.md` 中如有"stdout.isTTY && stderr.isTTY 双条件"或类似描述，改为"仅 stderr.isTTY + !quiet"。补一段说明"为什么不看 stdout"——避免未来 sub-agent 重新踩坑。

#### 2.3 测试扩展

`src/__tests__/logger.test.ts`（如不存在则创建）加 4 项：
- stderr TTY + !quiet → 心跳打
- stderr TTY + quiet → 心跳不打
- stderr 非 TTY → 心跳不打
- **stdout 非 TTY + stderr TTY**（关键 bug 场景）→ **心跳打**（验证修复）

可能也要让 `render.test.ts` 中已 mock isTTY 的测试调整为 mock stderr.isTTY。

## Acceptance Criteria

### help 文本

- [ ] `a2h --help` 输出全中文叙述（保留英文 identifier / flag / path）
- [ ] `a2h render --help` 含退出码表 7 行（0/1/10/20/30/40/50）+ 5 个示例
- [ ] `a2h skills --help` 含示例 3 条（默认 / --json | jq / category 过滤）
- [ ] 所有 help 输出仍走 stderr（spec 协议，per logging-guidelines.md）
- [ ] grep `"It (is\|should\|must)"` 在 cli.ts 命中 0 次

### 心跳 TTY 修正

- [ ] **`a2h render in.md > out.html`** 场景下 stderr 能看到心跳 `·` 累加
- [ ] `a2h render in.md` 在交互终端仍打心跳
- [ ] `a2h render in.md > out.html 2>&1 | grep ...` 场景（stderr 也被 pipe）→ 心跳静默（stderr 非 TTY）
- [ ] `a2h render in.md --quiet > out.html` → 心跳静默（quiet 优先）
- [ ] logger.test.ts 4 项测试通过

### 整体

- [ ] `npm run typecheck && npm run lint && npm run build && npm test` 全过
- [ ] dist/cli.js 体积变化 < 5KB（仅文案 + isTTY 条件改）
- [ ] 现有 50+ 测试不破坏（render.test.ts 中 mock isTTY 的测试可能需要 mock 切到 stderr.isTTY）

## Out of Scope

- 不改 src/agents/ 业务逻辑
- 不改 src/templates/ 上游同步层
- 不改 ref/ / scripts/ / package.json `files`
- 不引入 runtime dependency
- 不实跑 LLM smoke（本任务零 LLM 调用——纯文案 + isTTY 条件改 + mock 测试）
- 不重写 README（HELP_TOP 末尾指向 README 即可）

## Technical Notes

- `src/cli.ts` 现有 HELP_TOP 24-50 行 / HELP_RENDER 52-92 行 / HELP_SKILLS 94-109 行
- `src/logger.ts` 现有 ~70 行；`progressTick()` 在 line 56 附近
- 测试 mock 模式：DI 注入 `isTTY: () => boolean` 已在 render.ts；logger 内部直接用 process.stderr.isTTY，可考虑同样 DI 化便于测试
- spec drift：logging-guidelines.md 进度协议段需对齐
- 工程量估算：HELP 改写 ~150 行 / logger.ts ~5 行改 / spec ~10 行改 / 新测试 ~50 行 = 约 30-45 min sub-agent 时间
