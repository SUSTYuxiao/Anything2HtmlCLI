<!-- TRELLIS:START -->
# Trellis Instructions

These instructions are for AI assistants working in this project.

This project is managed by Trellis. The working knowledge you need lives under `.trellis/`:

- `.trellis/workflow.md` — development phases, when to create tasks, skill routing
- `.trellis/spec/` — package- and layer-scoped coding guidelines (read before writing code in a given layer)
- `.trellis/workspace/` — per-developer journals and session traces
- `.trellis/tasks/` — active and archived tasks (PRDs, research, jsonl context)

If a Trellis command is available on your platform (e.g. `/trellis:finish-work`, `/trellis:continue`), prefer it over manual steps. Not every platform exposes every command.

If you're using Codex or another agent-capable tool, additional project-scoped helpers may live in:
- `.agents/skills/` — reusable Trellis skills
- `.codex/agents/` — optional custom subagents

Managed by Trellis. Edits outside this block are preserved; edits inside may be overwritten by a future `trellis update`.

<!-- TRELLIS:END -->

## Project Charter

项目目标见根目录 [`README.md`](./README.md)。任何关于"做什么 / 不做什么"的疑问，先回到 charter 对齐。

## `ref/` 目录语义

`ref/` 存放**只读的上游参考实现**，不是本项目的源码。

- `ref/html-anything/` — 上游 [`nexu-io/html-anything`](https://github.com/nexu-io/html-anything)（Apache-2.0），浅克隆。本项目要把它依赖 Next.js 服务的渲染能力蒸馏为纯 CLI。
- **禁止**在 `ref/` 内修改、新增、提交任何文件；遇到需要的逻辑请**移植**到 `src/`，而非原地编辑。
- 移植代码时务必保留 Apache-2.0 归属（在新文件头注明 upstream 路径与 commit）。
- `ref/` 不应被本仓库 git 跟踪上游的 `.git`（如后续要正式追上游版本，再升级为 submodule）。

