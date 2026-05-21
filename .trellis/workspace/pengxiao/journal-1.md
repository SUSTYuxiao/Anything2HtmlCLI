# Journal - pengxiao (Part 1)

> AI development session journal
> Started: 2026-05-21

---



## Session 1: a2h CLI: charter → spec → spike → PR1 + PR2（P0 全过）

**Date**: 2026-05-21
**Task**: a2h CLI: charter → spec → spike → PR1 + PR2（P0 全过）
**Branch**: `main`

### Summary

项目从 0 起步，1 session 完成 P0 全栈：charter（README + ref/html-anything clone + AGENTS）、9 份 spec（backend 4 + guides cli-design/upstream-sync，含跨文件一致性核对）、Q-MVP-9 复杂模板 spike（deck-product-launch + data-report 端到端通过）、PR1（TS+esbuild 脚手架 + scripts/sync-from-ref.mjs + 75 skill 同步 + cli骨架/errors/logger）、PR2（render/skills/preview + claude 集成 + 39 测试通过 + 真实端到端 smoke 12.2KB HTML）。架构原则：薄壳同步上游不改业务逻辑、零运行时依赖、stdout 数据通道+ stderr 人读、标准化退出码 + --json-errors。剩余 P1（preview 浏览器/流式 progress/多 agent/--interactive/单二进制）和 npm publish 留待后续独立任务。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `cb6a6bc` | (see git log) |
| `51ee5b9` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 2: CLI polish: 砍 preview / 加 qoder / 心跳 progress + spec 中文化与反模式速查

**Date**: 2026-05-21
**Task**: CLI polish: 砍 preview / 加 qoder / 心跳 progress + spec 中文化与反模式速查
**Branch**: `main`

### Summary

承接 mvp P0 之后的 CLI 封装打磨任务（最高原则：只做 ref 项目的 CLI 适配封装，其他丢回 ref）。3 件事：(1) 砍 preview 子命令（浏览器交互不归 CLI）；(2) 引入 invokeAgent(id, opts, deps) 共享抽象层 + agents/errors.ts AGENT_CLASSIFIERS map，加 qoder agent 作为 claude 之外的第二选择，render --agent flag + A2H_AGENT env override，无自动 fallback；(3) logger.progressTick + invoke.ts setInterval(5s) 心跳 progress 治 spike F3 黑屏，仅 TTY+!quiet 时打 ·。并行做了 spec polish：10 份 spec 中文化 + backend/index.md + guides/index.md 末尾加反模式速查段（抽自现有 spec，不扩写新红线）。trellis-check 顺手修 5 处 spec drift（含额外发现的 quality-guidelines DI 示例 stale + upstream-sync 引用）。bootstrap-guidelines 任务 prd checkbox 全勾（DI 模式 + replaceExact 已沉淀进 spec）。验证全过：50/50 测试 / dist 26.6KB / 真实 smoke 9KB HTML exit 0 / 心跳 5.002s 准时 + clearInterval 生效。归档 cli-polish + charter（charter 1/1 done）；bootstrap-guidelines 保留以防后续补 spec。下次 session 可选方向：npm publish / 单二进制（用户说推迟）/ 多于 2 agent。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `f5931f0` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete
