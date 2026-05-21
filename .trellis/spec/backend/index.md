# Backend 规范索引

本项目作为单一 CLI 工具，"backend" 在此理解为"Node.js CLI 进程内部"——
所有规范均针对运行在用户机器上的 a2h 进程。

## 现行 specs

| 文件 | 规范主题 |
| --- | --- |
| [`directory-structure.md`](./directory-structure.md) | src/ 组织、文件归属、ref/ 同步进来的文件如何放置 |
| [`error-handling.md`](./error-handling.md) | 标准化退出码 + `--json-errors` 协议 + 类型化错误抛出纪律 |
| [`logging-guidelines.md`](./logging-guidelines.md) | stderr 协议、TTY 进度、--quiet/--verbose、stdout 不许出现日志 |
| [`quality-guidelines.md`](./quality-guidelines.md) | esbuild 配置、TS strict、测试策略、体积红线 |

## 本项目不适用

| 文件 | 原因 |
| --- | --- |
| [`database-guidelines.md`](./database-guidelines.md) | a2h 无持久化层 |

## 跨层主题

CLI 设计与上游同步纪律详见 [`../guides/cli-design.md`](../guides/cli-design.md)
和 [`../guides/upstream-sync.md`](../guides/upstream-sync.md)。

---

## ⚠️ 反模式速查（看这一段就够避坑）

> 任何 sub-agent 接到 backend 任务前，先扫这一段，避开下面所有红线。

### 退出码与错误处理

- ❌ `commands/*` 内 `process.exit` —— 唯一退出点是 `cli.ts` 顶层 catch
- ❌ 自创新退出码 —— 退出码表是契约，加新码先改 spec
- ❌ 吞异常（`catch {}` 不 rethrow）
- ❌ stdout 写错误 / 日志 —— stdout 是数据通道（HTML / JSON），错误走 stderr 或 `--json-errors` 协议

### 日志与进度

- ❌ 直接 `console.log` / `console.error` —— 用 `src/logger.ts` 唯一出口
- ❌ 引入 chalk / picocolors / pino / winston —— 用极简 ANSI（per logging-guidelines.md）
- ❌ 非 TTY 写 `\r` 重写 —— 进度只在 TTY 起作用

### 测试

- ❌ CI 跑真实 claude / qoder —— 用 fixture 录制（`src/__tests__/fixtures/`）+ DI 注入 mock
- ❌ 在测试里引入 sinon / proxyquire —— 用本项目的 DI 模式（per quality-guidelines.md）
- ❌ 跳过 typecheck / lint —— PR 验证流程必跑

### 构建与依赖

- ❌ 引入 runtime dependency —— `package.json` `"dependencies"` 永远 `{}`
- ❌ 引入 tsx / ts-node / commander / yargs / oclif / zod —— 全部禁用，理由见各 spec 反模式段
- ❌ 把 `dist/` 提交进 git —— `.gitignore` 已排除
- ❌ 删除 attribution header 末尾 `// @ts-nocheck` —— 上游薄壳与本项目 strict 档的解耦点

### 引用 SSoT

- 详细规范：[`directory-structure.md`](./directory-structure.md) / [`quality-guidelines.md`](./quality-guidelines.md) / [`error-handling.md`](./error-handling.md) / [`logging-guidelines.md`](./logging-guidelines.md)
