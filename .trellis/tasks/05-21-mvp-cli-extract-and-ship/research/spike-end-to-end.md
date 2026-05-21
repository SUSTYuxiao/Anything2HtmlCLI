# Spike: Thin-Shell End-to-End Validation

**日期**: 2026-05-21
**任务**: `05-21-mvp-cli-extract-and-ship`（MVP brainstorm 前的可行性验证）
**结论**: ✅ **架构假设证实**——纯 Node 脚本 + `claude -p`，无任何 npm 依赖、无 Next.js、无 HTTP 服务，端到端产出高质量单文件 HTML。

---

## 1. 验证目标

charter 任务勘察上游 `ref/html-anything` 后形成假设：

> **本项目的渲染管线 = "skill prompt 模板 + 调本机已登录的 agent CLI 产 HTML + extractHtml 正则后处理"**——上游 `next/` webapp 仅是 UI 外壳，剥离后整套链路不依赖 React/Next。

spike 任务：用一个 100 行的 Node 脚本，从零跑通这条链路，**用证据替代猜测**。

## 2. 实验设计

| 维度 | 选择 | 原因 |
| --- | --- | --- |
| 入口语言 | Node.js（`spike.mjs`） | 无 npm 依赖，纯 stdlib（`fs` / `child_process` / `path`），最小可执行体 |
| 调用的 agent CLI | `claude` | 用户已登录、本机 `/Users/pengxiao/.npm-global/bin/claude` 可达 |
| claude 参数 | `-p --bare --output-format text --max-budget-usd 0.50` | `text` 模式跳过 ndjson 解析复杂度；`--bare` 跳过 hooks/auto-memory 保确定性；预算硬封顶 |
| skill | `article-magazine` | charter 已确认是典型的 prompt+few-shot 形态 |
| 输入 | 自定义 276 字符 markdown（"为何 Agent 时代 HTML 强于 Markdown"） | 控制 token 成本，又保留真实的章节结构 |
| 后处理 | 上游 `extract-html.ts` 内联端口（DOCTYPE / `<html>` 正则裁剪） | 验证现有逻辑能直接复用 |

## 3. 实验结果

```json
{
  "skillId": "article-magazine",
  "promptBytes": 3036,
  "inputChars": 276,
  "elapsedSeconds": 68.06,
  "exitCode": 0,
  "stdoutBytes": 15900,
  "stderrBytes": 0,
  "htmlBytes": 15899,
  "hasDoctype": true,
  "hasHtmlClose": true,
  "success": true
}
```

### 产物质量肉眼检视

- HTML5 doctype + `lang="zh-CN"`，正确闭合 `</html>`
- Tailwind CDN（`cdn.tailwindcss.com`）+ Google Fonts（Noto Sans SC / Noto Serif SC / Inter / Manrope / JetBrains Mono）正确引入
- 自定义 CSS tokens：朱砂橙主色 `#c2410c` + 墨绿强调 `#0f766e` + 米白底 `#faf8f4`——符合 SHARED_DESIGN_DIRECTIVES 的"1 主色 + 2 中性 + 1 强调"约束
- 语义结构：16 个 h2/h3/p/blockquote/hr，108 个 Tailwind class 实例
- 真实数据：使用了我提供的"为何 HTML 强于 Markdown"内容，没有 lorem ipsum
- 中英文混排留有"盘古之白"半角空格
- 末尾"— fin —"装饰，符合"杂志文章"模板的精修感

### 资源开销

- **时间**: 68 秒（claude API 端到端）——慢但可接受；MVP 用 `--output-format stream-json + --include-partial-messages` 可显著改善体感
- **prompt 体积**: 3036 字节（含 SHARED 设计指令 + skill body + 用户内容），合理
- **输出体积**: 15.9 KB（自包含 HTML）——单文件分发体积可接受

## 4. 关键发现（按对 MVP 决策的影响排序）

### F1（**最高价值**）：`--output-format text` 完全够用，可省 stream-json 解析复杂度

上游用 `--output-format stream-json --verbose --include-partial-messages` 是为了 webapp 的实时 iframe 预览。CLI 一次性产出场景下，**`text` 模式直接拿到最终 HTML**，stdout 就是裸 HTML 文本，extractHtml 无需任何修改即可工作。

→ **MVP 默认走 text 模式，stream-json 留给 `--interactive` 选配实现**。

### F2：`extractHtml` 100% 可直接移植

claude 在 `--bare` + 系统 prompt 强约束下，输出**直接就是 `<!DOCTYPE html>` 起手**，没有 markdown fence、没有解释性前缀。`extractHtml` 走的分支是"找 DOCTYPE → 找 `</html>` → 裁剪"，与上游一致。

→ **MVP 把 `extract-html.ts` 原样拷过去即可，无需改写。**

### F3：`--bare` 是 CLI-嵌入场景的正确默认

`--bare` 关掉 hooks、LSP、plugin sync、auto-memory、CLAUDE.md 自动发现——这正是"被 Agent / Skill 内嵌调用"时希望的行为：调用方不希望 a2h 内部的 claude 调用受到调用方 session 的 CLAUDE.md / hook / memory 污染。

→ **MVP 默认 `--bare`；提供 `--no-bare` 转义阀让用户在需要时关掉。**

### F4：`--max-budget-usd` 是天然的成本兜底

claude CLI 自带预算硬封顶。a2h 应直接转发该参数（或自身 `--max-budget`），让被嵌入的 Agent 能透明传入预算约束。

→ **MVP 暴露 `--max-budget-usd <n>`，默认值待 brainstorm 决（候选: 0.5 / 1.0 / unset）。**

### F5：纯 stdlib 即可跑通——首版可零依赖

spike 用了零 npm 包：`fs` / `child_process.spawn` / `path` / `URL`。整个端到端逻辑 ~100 行。

→ **MVP 首版可走"零依赖纯 Node"路径，T1（单二进制选型）压力大幅减小**：
> - `node --experimental-sea-config` 直接打包就行
> - 或者 `bun build --compile` 也无需考虑 React/Next/Tailwind 等大型依赖的 bundle 兼容性
> - `pkg` / `nexe` 这类老牌方案也不必担心动态 require

### F6：68 秒延迟 → MVP 必须有 progress 反馈

68 秒 stdout 一片寂静的 UX 是不可接受的。但好消息是：claude 的 stream-json 模式可流式输出。

→ **MVP 在 stdout 是终端时（isTTY），切到 stream-json 模式打印进度（"·" / token 计数）；当 stdout 是管道时，保持 text 模式静默，避免污染下游消费者**。

## 5. 对 MVP Open Questions 的更新

| Q | spike 之前的状态 | spike 之后 |
| --- | --- | --- |
| Q-MVP-1：首版是否支持交互式修订 | 待 brainstorm | **不需要**——spike 证明一次产出已可用；交互式作 P1 polish |
| Q-MVP-2：MVP 是否锁定单一 agent | 待 brainstorm | **建议先锁 claude**——是上游协议复杂度最低的，且本机已登录；多 agent 支持作 P1 |
| Q-MVP-3：是否提供 list-skills 子命令 | 待 brainstorm | **是**——spike 已经验证 SKILL.md 解析极简（30 行 frontmatter parser），加 `a2h skills` 子命令几乎零成本 |
| Q-MVP-4：单二进制是否 P0 | 待 brainstorm | **降为 P1**——spike 证明零依赖纯 Node 已可工作，首版用 `npx @scope/a2h` / `npm i -g` 即足够；单二进制留给 distribution polish |

## 6. 局限与未覆盖的风险

spike **没有**验证以下点（留给后续 brainstorm 或 MVP 实施时再 spike）：

- **多 agent 支持**：仅测了 claude；其他 7 个（codex / cursor-agent / gemini / copilot / opencode / qwen / aider）协议各异，需要独立 spike。
- **长输入**：276 字符是短文；上游 SHARED_DESIGN_DIRECTIVES 提到"用户给了 12k 字符"——长输入下 claude 是否仍能在 `--bare + text` 下产合规 HTML？
- **复杂模板**：article-magazine 是相对简单的"长页面"模板；deck-replit / dashboard / data-report 这类多页 / 数据可视化模板，prompt 更复杂，需要单独验证。
- **错误路径**：claude CLI 失败时（网络断、quota 耗尽、prompt 越界）的退出码与 stderr 信号未测试。
- **上游同步脚本（T2）**：本 spike 是 ad-hoc 移植 `assemblePrompt` + `extractHtml`，没有自动化提取脚本。
- **Stream-json 流式 UX（F6 推论）**：未实测，仅依据 claude 文档假设。

## 7. 对 charter 决策的反向校验

charter 的四条项目级原则全部经 spike 验证：

1. ✅ "运行时对用户透明"——spike 是纯 Node，零依赖，分发为 npm 包或单二进制都不影响用户感知。
2. ✅ "薄壳同步上游"——spike 仅复制了 ~50 行（`SHARED_DESIGN_DIRECTIVES` + `extractHtml` + `parseFrontmatter`），跟上游耦合度极低。
3. ✅ "不重写渲染"——spike 完全复用 claude CLI 作为渲染引擎，本仓库零渲染逻辑。
4. ✅ "Self-contained 输出"——spike 产物 HTML 内联 Tailwind CDN + Google Fonts CDN，单文件可双击运行。

## 8. 关键文件清单（供 MVP 实施引用）

| 路径 | 角色 | spike 处理 |
| --- | --- | --- |
| `ref/html-anything/next/src/lib/templates/shared.ts` | `SHARED_DESIGN_DIRECTIVES` + `assemblePrompt` | 端口到 spike.mjs（裁剪了部分非关键 directive） |
| `ref/html-anything/next/src/lib/templates/loader.ts` | `parseFrontmatter`, `loadSkill`, `listSkills` | spike 用了简化版 `stripFrontmatter`；MVP 应原样移植 `parseFrontmatter` |
| `ref/html-anything/next/src/lib/extract-html.ts` | `extractHtml`, `previewHtml` | 端口到 spike.mjs，逻辑零修改 |
| `ref/html-anything/next/src/lib/agents/argv.ts` | `buildArgv("claude", ...)` 返回 `["-p", "--output-format", "stream-json", ...]` | spike 用了简化版 `["-p", "--bare", "--output-format", "text"]`；F1 表明 text 模式更适合 CLI |
| `ref/html-anything/next/src/lib/templates/skills/article-magazine/SKILL.md` | 模板 prompt body | spike 直接读取，0 改写 |

## 9. 产物文件

```
research/spike/
├── spike.mjs        — 100 行端到端验证脚本
├── raw-stdout.txt   — claude 的原始 stdout（15.9KB）
├── out.html         — 提取后的最终 HTML（15.9KB，可在浏览器打开验证）
├── report.json      — 结构化指标
└── (本文件)
```

## 10. 推荐的下一步

1. **立刻可做**：浏览器打开 `out.html` 看视觉效果——若主观满意，正式开 MVP brainstorm。
2. **brainstorm 前**：用 spike.mjs 再跑 1-2 个不同 skill（`blog-post`、`card-twitter`），观察 prompt+输出在不同模板下的稳定性。
3. **brainstorm 重点**：基于 F1-F6，拟定 MVP 命令面（`a2h render` / `a2h skills` / `a2h preview`）、CLI 参数、错误处理、子命令拆分。
4. **charter 任务**：可以收尾归档——所有 charter 假设已被实证，无遗留疑问。
