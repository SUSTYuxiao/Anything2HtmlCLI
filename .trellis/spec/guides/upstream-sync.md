# 上游同步指南

> **本项目特有协议**：从 `ref/html-anything/` 同步代码与资产到 `src/` 的白名单、attribution header、纪律与反模式。
> 围绕 Charter ADR-lite 决策 2（薄壳同步上游）+ PRD Q-MVP-SYNC（最简口子人工触发）+ AGENTS.md `ref/` 只读约定展开。

---

## Why（为什么是"薄壳同步"而非 fork 重写）

Charter 原则 2 说得最清楚：

> 上游 `ref/html-anything` 持续演进，本 CLI 必须能"低成本同步"上游能力，而非一次性 fork 后失联。
> 上游每次 release 后，本 CLI 跟进所需人工成本应**< 1 工时**。

这意味着：

1. **不在 `src/` 里二次修改上游同步进来的逻辑**——bug 修复应回到上游 PR（保持上游单一真相源）。
2. **`ref/` 整树视为只读**——AGENTS.md 已声明，CI 应排除（`.gitignore` 不收录）。
3. **同步脚本职责仅为"白名单 cp + 写 attribution header"**——PRD Q-MVP-SYNC 决策；不引入 diff 报告 / glob 提取 / AST codemod / import 重写。

> Lead with WHY：可变状态是复杂度之母（用户 CLAUDE.md `<layer_philosophical>`）。"二次修改 + 上游持续演进"会让 src/ 与 ref/ 在每次 release 后产生歧义；唯有"src/ 是 ref/ 的纯下游投影"才能让同步保持一行命令的轻量。

---

## 1. 白名单文件（精确路径，不是 glob）

| 上游路径 | 同步到 | 处理方式 |
| --- | --- | --- |
| `ref/html-anything/next/src/lib/templates/skills/**` | `src/templates/skills/**` | 整树 cp，零修改 |
| `ref/html-anything/next/src/lib/templates/loader.ts` | `src/templates/loader.ts` | cp + 仅修改 `SKILLS_DIR` 常量指向新路径 + 加 attribution header |
| `ref/html-anything/next/src/lib/templates/shared.ts` | `src/templates/shared.ts` | cp + 加 attribution header |
| `ref/html-anything/next/src/lib/extract-html.ts` | `src/extract-html.ts` | cp + 加 attribution header，零逻辑修改 |
| `ref/html-anything/next/src/lib/agents/detect.ts` | `src/agents/detect.ts` | cp + attribution header（含 `// @ts-nocheck`），零逻辑修改 |
| `ref/html-anything/next/src/lib/agents/argv.ts` | `src/agents/argv.ts` | cp + attribution header（含 `// @ts-nocheck`），零逻辑修改 |

### 明确**不**同步（首版排除清单）

| 上游路径 | 排除原因 |
| --- | --- |
| `templates/scenarios.ts` | UI 场景元数据，CLI 无场景概念 |
| `templates/index.ts` | 只是 barrel re-export，本项目自己组织 import |
| `agents/invoke.ts` | ReadableStream + 多 agent 多协议派发，对 MVP 严重过度；spike F1 证明 `--output-format text` 不需要流式协议层；本项目自写最简版 spawn 替代，见 `src/agents/invoke.ts` |
| `export/**` | PRD Out of Scope（PPTX / XLSX / WeChat / Notion 导出） |
| `parsers/**` | 首版只接 markdown 字符串；不引入文件类型分发 |

> **设计自由（用户 CLAUDE.md `<design_freedom>`）**：白名单是"当前所需最小集"，而非"未来可能用到的最大集"。当 P1 决定纳入多 agent 时，再扩白名单——不预留。

---

## 2. Apache-2.0 Attribution Header 模板（强制）

每个从 `ref/` 同步进来的文件，**开头必须加**以下 ASCII 分块注释。
不仅是法律义务（Apache-2.0 NOTICE 要求），更是给未来维护者的灯塔。

```ts
// =====================================================================
// Source: ref/html-anything/next/src/lib/<path-from-upstream>
// Upstream commit: <sha at sync time>  (run: `git -C ref/html-anything rev-parse HEAD`)
// License: Apache-2.0  (see ref/html-anything/LICENSE)
// =====================================================================
// Local modifications (mark with `// [a2h]` inline comments):
//   - <列出本地必要修改，例如"将 SKILLS_DIR 从 process.cwd() 重定位至 fileURLToPath(import.meta.url)">
// =====================================================================
// @ts-nocheck — 上游代码以 Next.js 默认 TS 档撰写，不为本项目的 strict
// (noUncheckedIndexedAccess + exactOptionalPropertyTypes) 严格度负责。
// 本项目的 strict TS 仅约束 src/ 下"本项目层"代码（cli.ts / commands/* /
// agents/* / errors.ts / logger.ts），不约束同步进来的上游层。
// =====================================================================
```

### 字段填写规则

| 字段 | 来源 | 示例 |
| --- | --- | --- |
| `Source` | 上游精确路径（不含 `ref/html-anything/` 前缀也可，但要保持脚本一致） | `ref/html-anything/next/src/lib/extract-html.ts` |
| `Upstream commit` | 同步时刻 `git -C ref/html-anything rev-parse HEAD` 的 short SHA | `a1b2c3d` |
| `Local modifications` | 列出每处改动的**意图**，对应 `// [a2h]` 内联注释 | 见下例 |

### 本地修改的内联注释规则

```ts
// =====================================================================
// Source: ref/html-anything/next/src/lib/templates/loader.ts
// Upstream commit: a1b2c3d
// License: Apache-2.0  (see ref/html-anything/LICENSE)
// =====================================================================
// Local modifications (mark with `// [a2h]` inline comments):
//   - Relocate SKILLS_DIR base from process.cwd() to module-relative URL
// =====================================================================
// @ts-nocheck — 上游代码以 Next.js 默认 TS 档撰写，不为本项目的 strict
// (noUncheckedIndexedAccess + exactOptionalPropertyTypes) 严格度负责。
// 本项目的 strict TS 仅约束 src/ 下"本项目层"代码（cli.ts / commands/* /
// agents/* / errors.ts / logger.ts），不约束同步进来的上游层。
// =====================================================================

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// [a2h] 重定位至同步进来的 src/templates/skills/，与上游用 process.cwd() 不同
const SKILLS_DIR = join(dirname(fileURLToPath(import.meta.url)), "skills");

// ... 上游原逻辑保持不动 ...
```

> **铁律**：本地必要修改必须用 `// [a2h]` 标注，且控制在**5 行以内**。超过即说明同步策略错了，应回上游推 PR 或重新评估白名单。

---

## 3. 同步纪律

### 3.1 标准操作流程

```bash
# 1. 拉取上游最新（手动触发，PRD Q-MVP-SYNC 决策）
git -C ref/html-anything pull

# 2. 记录新 commit SHA（脚本会读这个值写 attribution header）
git -C ref/html-anything rev-parse HEAD

# 3. 跑同步脚本
npm run sync   # 即 node scripts/sync-from-ref.mjs（npm script 定义见 quality-guidelines.md）

# 4. 跑测试——若失败，上游有 breaking change
npm test

# 5. 提交
git add src/
git commit -m "chore(sync): bump upstream to <short-sha>"
```

### 3.2 commit message 格式（强制）

```text
chore(sync): bump upstream to <short-sha>

Files changed:
  M src/templates/loader.ts
  M src/extract-html.ts
  + src/templates/skills/<new-skill-id>/SKILL.md
  + src/templates/skills/<new-skill-id>/example.md

New skills: <new-skill-id>
Removed skills: (none)
```

### 3.3 `ref/` 与 git 的关系

- `ref/` **不是** submodule（Charter 决策："暂不做 submodule"）。
- `.gitignore` 应排除 `ref/`——它是开发者本机的只读参考，不是项目源码。
- 严禁 `git add ref/`——这会把上游整树纳入本项目历史，破坏"薄壳"语义。

---

## 4. 何时跳过上游同步（人工判断点）

同步脚本 cp 完后跑 `npm test`；**任一情况发生立即停止 commit、回滚 src/**：

| 情况 | 处理 |
| --- | --- |
| 上游引入 React / Next 专用 hooks 或 server actions（如 `'use client'` / `useSearchParams`） | 跳过该文件，开 issue 跟踪，等上游解耦 |
| 上游 `templates/` 之外目录新增 npm 依赖 | 评估是否真需要再同步；MVP 倾向于不引入新依赖 |
| 上游 `LICENSE` 变更 | 立刻人工审查，必要时停止所有同步并升级 attribution 模板 |
| `npm test` 失败但本地代码无改动 | 上游 breaking change；回滚 src/，issue 跟踪修复 |
| 上游引入 stream-json 解析等首版未纳入的复杂度 | 跳过，等 P1 多 agent 任务时再扩白名单 |

---

## 5. 同步反模式（明确禁止）

### 禁止：在 `src/` 内"二次修改"同步进来的文件来"修 bug"

```text
❌ 看到 src/extract-html.ts 有 bug → 直接在 src/ 改
✅ 去 ref/html-anything 上游推 PR；本项目不持有渲染逻辑的所有权
✅ 紧急情况下用 // [a2h] 局部 patch，但必须立即开 upstream issue 跟踪
```

理由：每次本地修改都是技术债务的种子——下次同步时这处修改会与上游版本冲突，
解冲突时必然产生"是上游对还是本地对"的歧义。
**src/ 应当是 ref/ 的纯下游投影**，bug 修复方向永远向上游回流。

### 禁止：把 `sync-from-ref.mjs` 演化成 diff 生成器 / codemod 工具

```text
❌ 加 --dry-run --diff-report 输出 markdown diff 报告
❌ 加 AST 重写"自动移除 'use client' 指令"
❌ 加 import 路径自动改写 + alias 解析
✅ 保持最简：白名单 cp + 写 attribution header（PRD Q-MVP-SYNC 决策）
```

理由：codemod 会让"同步"从一行命令变成"另一个需要维护的子项目"，
彻底背离 Charter 原则 2"< 1 工时人工成本"。

### 禁止：在 sync 脚本中用 silent `String.replace()` 改写上游源码

`scripts/sync-from-ref.mjs` 对上游文本的任何替换必须走**断言型 `replaceExact(src, needle, repl, label)`**：
needle 不存在 / 多次匹配 → 立即 `process.exit(1)`，不允许静默落到 `src/`。

```js
// scripts/sync-from-ref.mjs
function replaceExact(src, needle, repl, label) {
  const idx = src.indexOf(needle);
  if (idx === -1)                          process.exit(1); // 锚点不存在
  if (src.indexOf(needle, idx + 1) !== -1) process.exit(1); // 锚点不唯一
  return src.slice(0, idx) + repl + src.slice(idx + needle.length);
}
```

**为什么不直接 `.replace()`**：原生 `String.prototype.replace()` 找不到 needle 时**静默返回原串、0 次替换**——sync 看似成功，实际同步层悄悄退化成"未打补丁"状态，silent drift 进 main，半个月后才在某次错误时被发现。断言型替换让"上游 rename / 重排版"在 sync 触发时立即可见，是同步纪律的最后一道闸。

适用范围：`SKILLS_DIR` 重定位、`agents/argv.ts` 中针对 next.js 路径的局部改写、任何"上游模板内嵌特定字符串需替换"的场景。**不适用**于 attribution header 注入（那是"在文件首部 prepend"，不是"替换原文片段"）。

### 禁止：同步后跳过测试就 commit

```text
❌ npm run sync && git commit ...
✅ npm run sync && npm test && git commit ...
```

跳过测试的同步等于把上游 breaking change 直接埋进 main——"无证据的同步"违反用户 CLAUDE.md 现象层"快速止血"原则。

### 禁止：`git add ref/`

```text
❌ git add ref/ → 把上游整树纳入本项目 git 历史
✅ ref/ 在 .gitignore 内；通过 git -C ref/html-anything pull 维护
```

如果未来确实需要锁定上游版本，方案是升级为 git submodule（Charter 决策预留路径），
**不是**把整树深拷贝进本项目。

### 禁止：在 attribution header 中省略 commit SHA

```text
❌ // Source: ref/html-anything/next/src/lib/extract-html.ts (sometime in May 2026)
✅ // Upstream commit: a1b2c3d
```

SHA 是同步可追溯性的唯一根：没有它就无法回答"这版本对应上游哪个状态"。

### 禁止：删除 attribution header 末尾的 `// @ts-nocheck`

```text
❌ 觉得 @ts-nocheck "丑" / "不专业"，把它从 src/templates/* / src/extract-html.ts 删掉
✅ 保留——这是上游薄壳与本项目 strict TS 档的解耦点
```

`// @ts-nocheck` 让 src/ 下的上游同步层免受本项目 strict TS（`noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`）的约束。
删除它会让 `npm run typecheck` 在每次 sync 后红墙——理由同 lint 只扫本项目层（`quality-guidelines.md`）：上游代码风格归上游负责。

---

## 6. 当上游协议发生重大变化时

如果出现以下情况，本指南本身需要更新：

1. 上游 `next/` 与 `lib/` 的目录边界变动（白名单路径要改）。
2. 上游开始发布 npm 包（白名单可能整体被 `dependencies` 替代）。
3. 上游 `LICENSE` 不再是 Apache-2.0（attribution 模板要重写）。
4. P1 任务决定纳入多 agent → 只需在 `src/agents/` 下扩本项目自写 wrapper（如新增 `src/agents/codex.ts`），**不需要**扩 sync 白名单（`detect.ts` 已涵盖 8 个 agent 的探测逻辑，PR2 已纳入）。

更新本指南 = 同步纪律本身的变更，需要在 task PRD 中显式提案，不在常规同步 commit 里偷偷改。

---

## 速查表

| 议题 | 协议 |
| --- | --- |
| 同步触发 | 人工 `npm run sync`，频次随上游 release |
| 白名单 | 6 条精确路径（templates/skills/** + loader.ts + shared.ts + extract-html.ts + agents/detect.ts + agents/argv.ts） |
| Attribution | 每文件强制 ASCII 分块 header，含 commit SHA |
| 本地修改 | `// [a2h]` 标注，5 行以内 |
| ref/ git 状态 | .gitignore 排除，禁止 git add |
| 同步后 | 必跑 npm test 才 commit |
| commit 格式 | `chore(sync): bump upstream to <short-sha>` |

---

## 相关原则

**项目边界原则**（"只做 CLI 适配，不深入 ref 业务"）见 [`cli-design.md`](./cli-design.md) 末尾"项目边界原则"段。
本指南的"src/ 是 ref/ 的纯下游投影"与该原则互为表里——前者约束代码流向（向上游回流，不本地 fork），
后者约束功能边界（CLI 层做事，业务层丢回 ref）。两条线一起守，薄壳同步才不漏。
