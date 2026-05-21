# Backend Spec Index

本项目作为单一 CLI 工具，"backend" 在此理解为"Node.js CLI 进程内部"——
所有规范均针对运行在用户机器上的 a2h 进程。

## Active Specs

| 文件 | 规范主题 |
| --- | --- |
| [`directory-structure.md`](./directory-structure.md) | src/ 组织、文件归属、ref/ 同步进来的文件如何放置 |
| [`error-handling.md`](./error-handling.md) | 标准化退出码 + `--json-errors` 协议 + 类型化错误抛出纪律 |
| [`logging-guidelines.md`](./logging-guidelines.md) | stderr 协议、TTY 进度、--quiet/--verbose、stdout 不许出现日志 |
| [`quality-guidelines.md`](./quality-guidelines.md) | esbuild 配置、TS strict、测试策略、体积红线 |

## N/A for this project

| 文件 | 原因 |
| --- | --- |
| [`database-guidelines.md`](./database-guidelines.md) | a2h 无持久化层 |

## 跨层主题

CLI 设计与上游同步纪律详见 [`../guides/cli-design.md`](../guides/cli-design.md)
和 [`../guides/upstream-sync.md`](../guides/upstream-sync.md)。
