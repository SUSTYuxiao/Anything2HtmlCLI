# README 重构: 保留 CLI 用户视角，分离设计/路线图

## Goal

把 `README.md` 从"项目宪章 + 用户手册"双轨格式重构为**纯用户视角的 CLI 文档**，将所有项目内部 / 设计 / 路线图内容分离到 `docs/`。

## What I already know

- 当前 README.md 246 行 / 14 段（10 个 § 宪章段 + 4 个用户手册段）
- 用户已选 B：`docs/design.md` + `docs/roadmap.md` 两份分离
- 当前 README §9 成本与时间参考是 Embedding cookbook 的关键参考，**保留 README**
- §2 背景与痛点完整版较长，README 中应精简到 2-3 行

## Requirements（P0）

### 1. README.md 重构后结构

精简至下列段（按顺序）：

```markdown
# Anything2HtmlCLI

> 一句话定位（来自原 §1）

## 这是什么 / Why this exists
2-3 行精简版本，引用 docs/design.md 看完整设计

## Installation
（原 Installation 段保留）

## Usage
（原 Usage 段保留 6 个示例）

## Embedding from another Agent / Skill
（原 Embedding 段保留——含 spawn cookbook + 退出码表 + --json-errors 协议）

## 成本与时间参考
（原 §9，调用方传 --max-budget-usd 必参考）

## 更多
- 设计与架构原则: [docs/design.md](./docs/design.md)
- 路线图: [docs/roadmap.md](./docs/roadmap.md)
- AI 协作约定: [AGENTS.md](./AGENTS.md)
- License: Apache-2.0
```

预计 README 从 246 行降到 ~150 行。

### 2. 新建 `docs/design.md`

迁入下列原 README 内容（合并、可重组顺序但不改语义）：

- §3 核心目标（What）
- §4 非目标（Not）
- §5 架构原则
- §6 关键能力清单（首版 MVP）—— 改写为"已实现能力清单"，标注完成状态
- §7 参考实现
- §10 目录结构（规划） —— 改写为"目录结构（实际）"，对齐当前真实状态

附 charter ADR-lite 4 条原则（可从 archived task prd 抽取，简版即可，不要复制 prd 全文）。

### 3. 新建 `docs/roadmap.md`

迁入原 §8 路线图，并扩展为含完成进度：

```markdown
# 路线图

| 阶段 | 关注点 | 状态 | 里程碑 commit |
| --- | --- | --- | --- |
| Charter | 目标对齐、参考导入 | ✅ 已完成 | cb6a6bc 起 |
| Spec Bootstrap | 编码规范、目录约定 | ✅ 已完成 | (随 PR1 起 各 sub-agent 落地) |
| MVP | 解耦上游核心渲染、CLI 骨架、最小模板 | ✅ 已完成 (PR1+PR2) | 51ee5b9 |
| CLI Polish | 砍 preview / 加 qoder / 心跳 progress | ✅ 已完成 | f5931f0 |
| 边界原则沉淀 | spec sync | ✅ 已完成 | a6705d0 |
| 发布准备 | npm publish prep + Embedding cookbook | ✅ 已完成（待 user 真实发布） | a6705d0 |
| Distribution | 真实 npm publish + GitHub | ⏳ user 决策 | — |

## 已明确不做

- 浏览器交互 / `--interactive` / >2 agent / 单二进制 / 配置文件

## 远期演化（需要重新 brainstorm 才能开任务）

- stream-json 解析切结构化错误码（违反项目边界原则）
- 多文件输出（违反 charter "单文件 HTML"）
- 上游同步自动化（CI / PR / codemod）
```

### 4. npm publish 范围对齐

`package.json` `files` 当前 `["dist/", "bin/", "LICENSE", "README.md"]` 不含 `docs/`。**保持不变**——docs 不发到 npm（npm 用户用 README + GitHub 链接看 docs 即可），减小 tarball。

### 5. 验证

- [ ] README.md 行数 < 200，含 § 一句话定位 / Why / Install / Usage / Embedding / 成本表 / 更多链接
- [ ] `docs/design.md` 存在，含原 §3-§7 + §10 内容（可重组顺序）
- [ ] `docs/roadmap.md` 存在，路线图带完成状态 + 里程碑 commit
- [ ] `grep -c "## 1\. 一句话定位" README.md` ≥ 1（保留原段）
- [ ] `grep -c "成本与时间参考" README.md` ≥ 1（保留）
- [ ] `grep -c "目录结构" README.md` = 0（已迁出）
- [ ] `npm pack --dry-run` 输出仍 clean，体积变化 < 5KB（README 缩 + docs 不发，体积应略降）
- [ ] 所有 README 中 `[link](./docs/*.md)` 路径有效

## Out of Scope

- 不动 src/ / scripts/ / spec / package.json `files` 字段
- 不改 docs 之外的文档（AGENTS.md / LICENSE）
- 不重新 brainstorm 远期演化的细节（仅在 roadmap.md 列出占位）
- 不在 docs/design.md 重写或扩写新设计——仅迁移原 README 已有内容

## Technical Notes

- 各 task 的 commit hash 见 `git log --oneline`：cb6a6bc / 51ee5b9 / f5931f0 / a6705d0 / 22debd1 等已 archive 任务的 work commit
- README 链 docs/ 用相对路径 `./docs/design.md` 而非绝对 URL
- docs/* 风格保持中文叙述 + 英文 identifier（per 项目 spec 风格）
