# readme 重构：分人/agent 视角 usage + npm 发布元数据准备

## Goal

让 README 成为合格的开源项目门面，并把 npm 发布的最后一公里铺好：

1. 顶部 "这是什么" 一眼让人/agent 理解定位（tagline + bullet 分点）
2. Installation 与项目当前发布状态对齐（npm 未发布、包名待启用）
3. Usage 明确拆分：README 留 "For Humans"（终端使用） + 极简 "For Agents" 入口（spawn 概览 + 外链）；完整嵌入手册抽到 `docs/agent-integration.md`
4. "开发者本地自测" 移出 Installation，并入末尾极简版 "如何贡献" 章节
5. 包名 `@a2h/cli` → `anything2html-cli`（无 scope，与仓库名对齐，免去 npm scope 注册）
6. npm 发布元数据收尾（USER 占位修复 + publishConfig）

## Decisions（已确认）

| 决策 | 选择 |
| --- | --- |
| Q1 — Usage agent 部分 | 抽到 `docs/agent-integration.md`，README 留概览 + 链接 |
| Q2 — "这是什么" 优化方向 | tagline + bullet 分点（高密度、可扫读） |
| Q3 — "如何贡献" 内容范围 | 极简：自测命令 + 外链 `.trellis/workflow.md` |
| Q4 — npm 包名 | `anything2html-cli`（无 scope） |

## What I already know

* 当前 README 共 212 行；技术内容齐全，**结构而非内容是问题**
* `@a2h/cli` 未发布到 npm（registry 404）；package.json 元数据基本就绪（description / keywords / engines / files / bin / prepublishOnly 都已配）
* `homepage` / `repository` / `bugs` 三处仍是 `USER/Anything2HtmlCLI` 占位
* 历史 task `archive/2026-05/05-22-npm-publish-prep` 已完成 package.json 主要字段；本次只补：URL 占位 + 包名 + `publishConfig`
* 包名硬编码位置：`package.json` `name` + `scripts.dev:unlink` + `README.md`；`package-lock.json` 由 `npm install` 自动同步
* 远端仓库 `git@github.com:SUSTYuxiao/Anything2HtmlCLI.git` 已就位，main 已同步
* `examples/readme.html` 是当前 README 的 a2h 渲染版本，README 改后会过期 → 收尾需重新生成

## Requirements

### A. README 内容侧（按用户原始诉求）

* [必] "这是什么 / Why this exists" 重排：tagline 一行加粗 + 3 行背景 + 4 个 bullet（怎么用 / 给谁用 / 不是什么 / 心智）
* [必] Installation 重写：删掉 `npm i -g <path-to>/a2h-cli-<version>.tgz`；明确标注 "已发布到 npm 后" 的 `npm i -g anything2html-cli`，未发布前给一行 "尚未发布，欢迎从源码 + npm link 试用，详见末尾 [如何贡献]"
* [必] Usage 章节标题改为 "Usage / For Humans"（保留现有 render / skills / agent / budget / stdout 用法），专注终端使用者
* [必] 新增简短 "Usage / For Agents" 章节：1 段定位 + 最简 spawn 例（10 行内）+ 一句指引 → `docs/agent-integration.md`
* [必] 现 `## Embedding from another Agent / Skill` 整块（spawn 完整例 + 退出码表 + 双流分离 + budget 推荐 + json-errors）迁出到 `docs/agent-integration.md`
* [必] "成本与时间参考" 一并迁到 `docs/agent-integration.md`（与嵌入语境强相关，留在 README 是噪声），README 末尾 "更多" 链一行回 docs
* [必] 末尾新增 "如何贡献 / Contributing" 章节（极简版）：环境要求 1 行 + npm link 自测命令块 + 一句 "完整 workflow 见 [`.trellis/workflow.md`](./.trellis/workflow.md)"
* [必] 删掉原 Installation 内嵌的 "开发者本地自测" 子节（已并入贡献章节）

### B. npm 发布元数据侧

* [必] `package.json`：`name` `@a2h/cli` → `anything2html-cli`
* [必] `package.json`：`homepage` / `repository.url` / `bugs.url` 中 `USER` → `SUSTYuxiao`
* [必] `package.json`：`scripts.dev:unlink` 中 `npm unlink -g @a2h/cli` → `npm unlink -g anything2html-cli`
* [可选] `package.json`：新增 `publishConfig: { "access": "public" }`（无 scope 包默认 public，加它仅作显式声明，无害）
* [必] 跑 `npm install` 让 `package-lock.json` 同步新包名
* [必] 跑 `npm pack --dry-run` 验证产物白名单 = `dist/` + `bin/` + `LICENSE` + `README.md`

### C. 新文件 `docs/agent-integration.md`

完整目录（来自当前 README 迁出）：

* Quick Start：spawn 调用 + json-errors（10 行 ts 例）
* Exit Code Protocol（退出码表 + spec 引用）
* stdout / stderr 双流分离表
* Budget 推荐策略（按模板族）
* 成本与时间参考表（迁自 README）
* 失败排查（可选）

### D. 文档同步

* AGENTS.md：在文件清单/职责段补一行说明 `docs/agent-integration.md`
* `examples/readme.html`：README 完成后重新跑 `a2h render README.md -o examples/readme.html` 刷新

## Acceptance Criteria

* [ ] README 顶部 "这是什么" 30 秒内向陌生人讲清 a2h 是什么 + 给谁用 + 不是什么
* [ ] Installation 章节复制粘贴的命令不会误导（未发布期间不出现一条"装不上"的命令）
* [ ] Usage / For Humans 中无 `child_process.spawn` / 退出码表 / json-errors 等 agent 视角内容
* [ ] Usage / For Agents 段落 ≤ 30 行，含 1 个最简 spawn 例 + 链接到 `docs/agent-integration.md`
* [ ] `docs/agent-integration.md` 含完整退出码表 / 双流分离 / budget 策略 / 成本参考
* [ ] "如何贡献" 在 README 末尾，且能让贡献者从 0 到 `a2h --version` 全流程自测
* [ ] `package.json` 中：`name = "anything2html-cli"`、无 `USER` 占位、含 `publishConfig.access = "public"`
* [ ] `npm pack --dry-run` 通过，产物清单恰为 `dist/` `bin/` `LICENSE` `README.md`
* [ ] `examples/readme.html` 与最新 README.md 内容一致
* [ ] 全文链接全部可达（design.md / roadmap.md / agent-integration.md / .trellis/workflow.md / spec/*）

## Definition of Done

* README + docs/agent-integration.md 在 GitHub 渲染视觉清晰，跨链接均可达
* `npm pack --dry-run` 通过；如此时 `npm publish --access public` 也能一次成功（不实际执行）
* `prepublishOnly` chain（sync + lint + build + test）全绿
* AGENTS.md 同步反映新增 `docs/agent-integration.md`

## Out of Scope

* GitHub Actions 自动发包 workflow（后续单独 task）
* 增加 CONTRIBUTING.md / CODE_OF_CONDUCT.md 完整法律级模板
* 改动 docs/design.md 或 docs/roadmap.md 内容（仅可能调整链接锚点）

## In Scope（追加：实际发布到 npm）

用户已确认 `anything2html-cli` 在 npm 无占用且账号已登录，**本任务包含实际 `npm publish`**。

执行 gate（必须满足后才推进 publish）：

1. PR1 + PR2 全部完成，工作树 clean
2. `npm install` / `npm run lint` / `npm run typecheck` / `npm run build` / `npm test` 全绿
3. `npm pack --dry-run` 输出白名单恰为 `dist/` `bin/` `LICENSE` `README.md`，无溢出
4. `npm whoami` 确认登录态
5. `npm view anything2html-cli` 二次确认未被占用
6. **向用户做最终汇报**（包内容快照 + 版本号 + tag），用户拍板后才执行 `npm publish`

执行命令（所有 gate 通过后）：

```bash
npm publish --access public          # 无 scope 包默认 public，加 --access 显式无害
npm view anything2html-cli version   # 验证已上架
```

发布后回滚窗口：72 小时内可 `npm unpublish`，超时只能 `npm deprecate`。

## Implementation Plan（小 PR 拆分）

* **PR1 — npm 元数据修正 + 包名切换**
  * `package.json` 改 name / URL / dev:unlink / publishConfig
  * `npm install` 同步 lock，`npm pack --dry-run` 验证
  * 影响面最小、可独立 ship

* **PR2 — README 重构（5 件事）+ docs/agent-integration.md 抽出**
  * 重排 "这是什么" / Installation / Usage 拆 A/B / 末尾 "如何贡献"
  * 新建 `docs/agent-integration.md`，迁入 Embedding + 成本参考
  * AGENTS.md 同步
  * 收尾刷新 `examples/readme.html`

## Technical Notes

* `npm view @a2h/cli` → 404；本地 package.json `0.1.0` 未发布
* scoped 包默认 private，**无 scope 包默认 public**，所以 `anything2html-cli` 无需 `--access public`，但加 `publishConfig` 显式声明无害
* `package.json.files` 白名单已生效，无需 `.npmignore`
* `bin/a2h` 含 `#!/usr/bin/env node` shebang，发布后可直接 `npx anything2html-cli` 或 `npm i -g anything2html-cli` 后调 `a2h`
* 包名 `anything2html-cli` 在 npm 上可用性需用户 `npm view anything2html-cli` 确认（注册登录后）
