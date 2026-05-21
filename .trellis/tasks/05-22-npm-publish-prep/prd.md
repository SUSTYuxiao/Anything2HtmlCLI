# npm publish prep: 让 a2h 真正可装可用

> **Status**: planning（无需 brainstorm，工作内容标准化）。补完最后一道闸口——把 a2h 从"本地开发产物"变成"可被 `npm i -g` 安装、可被 Agent / Skill 内嵌调用"的真正 CLI 工具。

## Goal

完成 npm 发布前的所有准备工作，让 a2h 达到"任意 Agent / Skill 可 `npm i -g @a2h/cli` 后内嵌调用"的状态。**本任务到 `npm publish --dry-run` 验证为止，不实际 publish**（实际发布由用户决定时机 + npm scope name）。

## What I already know

- 当前状态：dist/cli.js 26.6KB / 50 测试 / 真实 smoke 通过 / 零运行时依赖
- bin/a2h shebang wrapper 已就位（指向 dist/cli.js）
- package.json 现有 `bin: { "a2h": "bin/a2h" }` + `files: ["dist/", "bin/"]`
- README 是项目宪章（不是用户手册），缺 Installation / Usage / Embedding 段
- LICENSE Apache-2.0 与上游对齐

## Requirements（P0）

### 1. package.json 元数据完善

补齐以下 npm registry 必需 / 推荐字段：

- `description`：一句话定位（"Convert text to a self-contained HTML file via local agent CLIs (claude / qoder), zero-runtime-deps"）
- `keywords`：`["cli", "html", "agent", "claude", "qoder", "markdown", "render", "static-site"]`
- `homepage`：暂留 placeholder 或指向项目 README（user 后续可改）
- `repository`：暂留 placeholder（user 后续 push GitHub 时补）
- `bugs`：暂留 placeholder
- `engines.node`: `">=20.0.0"`（dist 用 esbuild target node20，运行时需对齐）
- `license`: `"Apache-2.0"`（与 LICENSE 对齐）
- `author`: 暂留 placeholder（user 自填）
- `type`: `"module"`（已有）
- 包名 `name`：暂用 `@a2h/cli`（占位，user 后续按真实 npm scope 改）

### 2. prepublishOnly + 发布流水线

`package.json` 加 npm script：
- `prepublishOnly`: 串行 `npm run sync && npm run lint && npm run build && npm test`——发布前自动跑完整 quality gate
- 不加自动 publish；require 用户手动 `npm publish` 才真发布

### 3. files 字段精确化 + .npmignore（如需）

- `files` 当前是 `["dist/", "bin/"]`，确认加上 `LICENSE` 与 `README.md`（npm 默认包含 LICENSE / README，但显式声明更清晰）
- 验证 `npm pack --dry-run` 输出 tarball 内容**只含**：`package.json` / `dist/` / `bin/` / `LICENSE` / `README.md`
- **不**包含 `src/` / `scripts/` / `.trellis/` / `.claude/` / `ref/` / `node_modules/` / `dist-test/` / `*.log` / `tests/` / `tsconfig.json`

### 4. README 加 3 段（用户手册）

在现有"项目宪章"内容后追加，**不破坏**现有"项目目标 / 痛点 / 路线图 / 成本与时间参考"等段：

- **Installation**：`npm i -g @a2h/cli`（注：使用真实 scope 时改）+ 前置依赖（claude CLI / qoder CLI 至少一个，链接到上游）
- **Usage** (人类视角)：5-7 个常用调用示例（render 文件 / render stdin / skills 列表 / --agent qoder / --max-budget-usd / -o file / --json-errors）
- **Embedding from another Agent / Skill** (LLM 调用方视角)：
  - spawn 调用模式（`spawn("a2h", ["render","-","--skill","blog","--json-errors"], { stdio: ["pipe","pipe","pipe"] })`）
  - stdin 写 prompt 内容
  - stdout 首字符 `<` vs `{` 区分成功 / 失败
  - 退出码表（链接 spec/error-handling 或简短复述 0/1/10/20/30/40/50）
  - 推荐传 `--max-budget-usd` 兜底成本（参考根 README 的"成本与时间参考"表）

### 5. 实测验证

- `npm pack --dry-run` 输出 tarball 文件清单 ≤ 必需文件
- `npm pack` 真生成 tarball，体积 < 2MB（含 75 个 skill 数据资产）
- 在 `/tmp` 下 `npm i -g <tarball>` 安装试验，全局 `a2h --help` 可用
- `a2h render --skill article-magazine - <<< "# test"` 端到端能跑（消耗 ~$0.5 claude 配额，必跑一次）

## Acceptance Criteria

- [ ] `package.json` 含 description / keywords / engines.node ≥ 20 / license / repository（即使 placeholder）
- [ ] `npm run prepublishOnly` 全过（sync + lint + build + test 串行）
- [ ] `npm pack --dry-run` 输出仅含必需文件，无源码 / .trellis / 测试残留
- [ ] `npm pack` 生成 tarball，体积 < 2MB
- [ ] tmp 目录 `npm i -g <tarball>` 安装 + 全局 `a2h --help` 可用
- [ ] tmp 实跑 `echo "..." | a2h render - --skill article-magazine -o /tmp/x.html`：exit 0 + 合规 HTML
- [ ] README 含 Installation / Usage / Embedding 三段（embedding 段含 spawn + 退出码表）

## Out of Scope

- 实际 `npm publish`（由用户决定时机）
- 真实 npm scope 名称选择（用户后续决定）
- GitHub Actions / CI 自动发布流水线（推迟）
- semver 自动化（standard-version / changesets 等，推迟）
- npm 包签名 / 双因素验证（推迟）

## Technical Notes

- 当前 `package.json` `name` 用 `@a2h/cli`（占位）；用户实际发布时 scope 可能是个人或组织
- `npm pack --dry-run` 是干跑，不会实际打包
- 加 engines.node 后，老版本 node 装包会报警告（不阻断），符合预期
- README 的 Embedding 段是**本任务最大价值**——给 LLM 调用方一份明确的 cookbook
