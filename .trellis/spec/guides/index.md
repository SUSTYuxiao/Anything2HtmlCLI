# 思考指南（Thinking Guides）

> **目的**：扩展思考维度，帮你抓住那些"没想到"的盲点。

---

## 为什么需要 Thinking Guides？

**大多数 bug 与技术债源自"没想到"，而非"不会写"**：

- 没想到层与层的边界 → 跨层 bug
- 没想到代码模式重复 → 到处是重复代码
- 没想到边界场景 → 运行时错误
- 没想到未来维护者 → 没人看得懂的代码

这些 guide 帮你**在动手编码前问对问题**。

---

## 可用 guides

| Guide | 用途 | 何时使用 |
|-------|---------|-------------|
| [Code Reuse Thinking Guide](./code-reuse-thinking-guide.md) | 识别模式、减少重复 | 注意到重复模式时 |
| [Cross-Layer Thinking Guide](./cross-layer-thinking-guide.md) | 跨层数据流的思考 | 需求横跨多层时 |
| [CLI Design Guide](./cli-design.md) | `a2h` 子命令面、flag 协议、I/O 契约、退出码表 | 新增子命令 / flag / 错误码前 |
| [Upstream Sync Guide](./upstream-sync.md) | 上游 `ref/` 同步白名单、Apache-2.0 attribution、同步纪律 | 跑 `npm run sync` 或动 `src/templates`、`src/extract-html.ts` 前 |

### 项目特有 guides（非通用 thinking）

- [`cli-design.md`](./cli-design.md) — CLI 命令面、flag 协议、I/O 契约、退出码表
- [`upstream-sync.md`](./upstream-sync.md) — 上游 ref/ 同步白名单、Apache-2.0 attribution、同步纪律

---

## 速查：思考触发器

### 何时该思考跨层问题

- [ ] 需求触及 3+ 层（API、Service、Component、Database）
- [ ] 数据格式在层之间发生变化
- [ ] 多个消费者需要同一份数据
- [ ] 你不确定某段逻辑应该放哪层

→ 阅读 [Cross-Layer Thinking Guide](./cross-layer-thinking-guide.md)

### 何时该思考代码复用

- [ ] 你正在写与已有代码相似的逻辑
- [ ] 你看到同一模式重复 3+ 次
- [ ] 你正在为多个地方添加同一字段
- [ ] **你正在修改任意常量或配置**
- [ ] **你正在新建工具 / 辅助函数** ← 先搜！

→ 阅读 [Code Reuse Thinking Guide](./code-reuse-thinking-guide.md)

---

## 修改前规则（关键）

> **改任何值之前，永远先搜！**

```bash
# 搜索你即将修改的值
grep -r "value_to_change" .
```

这一个习惯能避免大多数"忘记同步更新 X"的 bug。

---

## 如何使用本目录

1. **编码前**：扫一眼相关 thinking guide
2. **编码中**：发现某段感觉重复或复杂，回头查 guide
3. **修完 bug 后**：把新洞察补回相关 guide（从错误中学习）

---

## 贡献

发现新的"没想到"瞬间？补到对应 guide。

---

**核心原则**：30 分钟思考，省 3 小时排错。

---

## ⚠️ 反模式速查

> guides 层的雷，常常跨多个 spec 才能避开；本段汇总。

### CLI 设计

- ❌ 引入 commander / yargs / oclif —— 手写 argparse（per cli-design.md）
- ❌ 配置文件副作用（`a2h config set ...` / `~/.a2hrc`）—— MVP 是无状态工具
- ❌ render 默认开浏览器 —— 浏览器交互不归 CLI（preview 子命令已砍）
- ❌ `--help` 嵌广告 / banner / Telemetry 提示

### 上游同步

- ❌ 在 `src/templates/` 或 `src/extract-html.ts` 内"二次修改"上游代码 —— bug 修复推上游 PR
- ❌ silent `.replace()` 同步替换 —— 用 `replaceExact()` 断言型替换
- ❌ `git add ref/` —— `ref/` 整目录是只读参考，不进 git（已 `.gitignore`）
- ❌ 同步后跳过测试就 commit —— 上游 breaking change 必须先发现

### 引用 SSoT

- [`cli-design.md`](./cli-design.md) / [`upstream-sync.md`](./upstream-sync.md)
- 一般工程思维：[`code-reuse-thinking-guide.md`](./code-reuse-thinking-guide.md) / [`cross-layer-thinking-guide.md`](./cross-layer-thinking-guide.md)
