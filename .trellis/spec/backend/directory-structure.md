# 目录结构

> **WHY**：本项目是 `ref/html-anything` 的薄壳 CLI；目录结构必须把"从上游同步进来的资产"和"本项目自己的编排层"物理分层，否则薄壳同步原则（charter 原则 2 + PRD 决策 Q-MVP-SYNC）会在第二次 `npm run sync` 时被冲突覆盖击穿。

---

## ─── src/ 真实布局（PRD 实施计划 PR1-4） ───────────────

```text
src/
├── cli.ts                      # bin 入口：argparse + 子命令路由 + 唯一退出点
├── errors.ts                   # 本项目层：A2hError + ErrorCode（见 error-handling.md）
├── logger.ts                   # 本项目层：唯一 stderr 出口（见 logging-guidelines.md）
├── commands/                   # 本项目层：子命令实现（Q-MVP-5 多子命令）
│   ├── render.ts               # a2h render <input> --skill <id> [--agent <id>] [-o]
│   └── skills.ts               # a2h skills [--json]
├── agents/                     # 本项目层：Agent CLI 调用器
│   ├── invoke.ts               # 共享 invokeAgent(id, opts) 抽象（claude / qoder）
│   ├── errors.ts               # AGENT_CLASSIFIERS：每 agent stderr → A2hError 映射
│   ├── detect.ts               # 上游同步层：bin 探测（PATH + 常见 shim 目录）
│   └── argv.ts                 # 上游同步层：buildArgv(agentId, opts)
├── templates/                  # 上游同步层：禁止原地修改
│   ├── loader.ts               # 从 ref/ 同步：parseFrontmatter / listSkills / loadSkill
│   ├── shared.ts               # 从 ref/ 同步：SHARED_DESIGN_DIRECTIVES / assemblePrompt
│   └── skills/                 # 从 ref/ 同步：75 个 skill 数据资产
│       └── <skill-id>/
│           ├── SKILL.md
│           ├── example.md
│           └── example.html
├── extract-html.ts             # 从 ref/ 同步：spike F2 已证零修改可用
└── __tests__/                  # *.test.ts 紧邻被测对象（同包同层）
scripts/
└── sync-from-ref.ts            # Q-MVP-SYNC：cp 白名单文件，无 diff 报告
bin/
└── a2h                         # shebang 一行包装，指向 dist/cli.js
dist/                           # esbuild 产物，不入 git
```

---

## ─── 分层契约：上游同步层 vs 本项目层 ────────────────

**核心红线**（违反即破坏 charter 原则 2 "薄壳同步上游"）：

| 层 | 路径 | 修改权限 | 演进方式 |
|---|---|---|---|
| 上游同步 | `src/templates/**` `src/extract-html.ts` | **禁止原地修改** | `npm run sync` 整体覆盖 |
| 本项目 | `src/cli.ts` `src/errors.ts` `src/logger.ts` `src/commands/` `src/agents/` `src/__tests__/` | 自由编辑 | 正常 commit |
| 构建产物 | `dist/` | 工具生成 | gitignore |
| 分发壳 | `bin/a2h` | 一次性写定 | 几乎不动 |

**功能扩展去哪里？**——**永远去本项目层**。需要修改 prompt 装配？包一层 `commands/render.ts` 调 `templates/shared.ts` 的导出函数；不要去 patch `shared.ts`。需要新的 agent？开 `agents/codex.ts`，不要污染 `templates/`。

---

## ─── 文件头：Apache-2.0 attribution ───────────────────

上游同步层的每个文件，**首行注释必须含 attribution**，指向 ref 路径与同步时锁定的 commit。

> **唯一权威模板与字段细则见 [`../guides/upstream-sync.md` §2](../guides/upstream-sync.md)**——
> 本文档不重写模板，避免双源漂移。`scripts/sync-from-ref.ts` 负责注入该 header；
> 无 attribution header 的 `templates/**` / `extract-html.ts` 视为未同步状态，CI 拒收。

---

## ─── bin/a2h：一行 shebang 包装 ───────────────────────

直接 shebang 一个 ESM `.js` 在 Windows 上常炸（`\r\n` 行尾 + 路径 quoting）。所以 `bin/a2h` 不指 `dist/cli.js`，而是包一层：

```js
#!/usr/bin/env node
import('../dist/cli.js');
```

`package.json` 同步声明：

```json
{
  "type": "module",
  "bin": { "a2h": "bin/a2h" },
  "files": ["dist/", "bin/", "package.json", "LICENSE"],
  "engines": { "node": ">=20" }
}
```

---

## ─── 测试同居：__tests__ 紧邻被测对象 ─────────────────

```text
src/
├── extract-html.ts
├── __tests__/
│   ├── extract-html.test.ts          # 测同目录 extract-html.ts
│   ├── commands.render.test.ts       # 测 commands/render.ts
│   └── fixtures/
│       ├── raw-stdout.txt            # 来自 spike report
│       └── report.json               # 来自 spike report
```

`node --test` 自动发现 `**/*.test.ts`（经 esbuild 转译后为 `.test.js`）。fixture 与 test 同包同移动，不另开 `tests/` 顶层目录。

---

## ─── npm publish 范围 ────────────────────────────────

发布物**只含构建产物 + 入口壳**，源码不发：

```text
[发] dist/cli.js          # esbuild 单文件 bundle
[发] bin/a2h              # shebang 包装
[发] package.json
[发] LICENSE              # Apache-2.0（继承上游）
[不发] src/               # 源码留在 GitHub
[不发] scripts/
[不发] ref/               # 上游参考目录，与发布无关
[不发] .trellis/
```

由 `package.json` 的 `"files"` 字段强制白名单；`.npmignore` 不再维护（黑名单易漏）。

---

## ─── 反模式（违反即重写 PR） ─────────────────────────

- **不要在 `src/templates/**` 原地修复 bug**——回 `ref/html-anything` 提 issue / PR，再 sync 下来。
- **不要建 `src/utils/` `src/lib/` `src/core/` 这种容器目录**——按职责（commands / agents / templates）分层，不按"东西类型"分。
- **不要把测试集中放 `tests/` 顶层目录**——本项目层简单到不值得跨目录跳转，紧邻同包即可。
- **不要 commit `dist/` 到 git**——构建产物归构建产物，git history 归源码 history。
- **不要在 `scripts/sync-from-ref.ts` 里做 codemod / import 重写**（Q-MVP-SYNC 明确）——MVP 只 cp，复杂度溢出再升级。
- **不要让 `bin/a2h` 直接 shebang 跑业务逻辑**——业务在 `dist/cli.js`，shebang 只负责拉起 node。
