# Anything2HtmlCLI

> 把任意文本变成单文件 HTML——不启服务，纯 CLI，可被任何 Agent / Skill 内嵌调用。

---

## 1. 一句话定位

将 [`nexu-io/html-anything`](https://github.com/nexu-io/html-anything) 的"文本→精美 HTML"能力，从"必须本地起 npm 服务"的形态，蒸馏为一个**无服务依赖、可管道调用的 CLI**。

## 2. 背景与痛点

| 上游能力 | 阻碍 |
| --- | --- |
| `html-anything` 渲染效果优秀，模板成熟 | 必须 `npm run dev` 起本地服务器才能产出 |
| 适合人类交互式使用 | 无法被 Codex / Claude Code / 其它 Agent Skill 内联调用 |
| 单次启动成本不高 | 在批处理、CI、Skill 嵌套场景下无法被脚本化 |

## 3. 核心目标（What）

构造单一可执行入口（暂命名 `a2h` / `anything2html`），满足：

1. **输入**：从文件路径或 stdin 读取任意文本（Markdown、纯文本、半结构化数据）。
2. **模板**：通过 CLI 参数指定模板名与变量（`--template <name> --var key=value`）。
3. **输出**：
   - 单个 self-contained HTML 文件到 `--out <path>`（CSS/JS/图片内联），或
   - 直接写入 stdout 供管道消费。
4. **二次修改**：构建过程支持交互式迭代（保留 prompt 上下文，反复修订直到满意），最终落盘单文件 HTML。

## 4. 非目标（Not）

- 不维护本地 HTTP 服务（不要求用户先 `npm run dev`）。
- 不引入额外运行时（仅 Node.js 自身；视情况允许 bundle）。
- 不做模板设计本身的扩展——优先复刻 / 解耦上游模板。
- 不做多文件资产输出（始终是单 HTML）。

## 5. 架构原则

- **单一可执行入口**：一条命令完成全部工作，无外部进程。
- **模板逻辑下沉**：从 `ref/html-anything` 中抽取渲染与模板逻辑，剥离 server / dev-only 依赖。
- **Self-contained 输出**：CSS / JS / 字体 / 小图全部内联，HTML 文件可直接传输与嵌入。
- **Agent-friendly**：参数语义对 LLM 友好（明确的 flag、确定性退出码、stderr 日志、stdout 数据）。
- **可组合**：支持 `cat input.md | a2h --template post > out.html` 这种 Unix 管道风格。

## 6. 关键能力清单（首版 MVP）

- [ ] 文本输入：`--input <file>` 与 stdin 二选一
- [ ] 模板选择：`--template <name>`，列举内置模板
- [ ] 变量传入：`--var k=v`（可重复）或 `--vars-file <json>`
- [ ] 输出落盘：`--out <path>`（缺省 stdout）
- [ ] 交互迭代：`--interactive` 进入"生成→预览→修订"循环
- [ ] 静默/详细：`--quiet` / `--verbose`，与 Agent 输出整洁度对齐

## 7. 参考实现

- `ref/html-anything/`——上游项目的浅克隆（git submodule 或独立子目录），仅作只读参考与移植来源；**禁止**在 `ref/` 内修改代码。
- 模板与渲染逻辑的抽取路径详见后续 `.trellis/spec/` 与各任务 PRD。

## 8. 路线图（占位）

| 阶段 | 关注点 |
| --- | --- |
| Charter | 目标对齐、参考导入（**已完成**） |
| Spec Bootstrap | 编码规范、目录约定（`00-bootstrap-guidelines`） |
| MVP | 解耦上游核心渲染、CLI 骨架、最小模板 |
| Polish | 预览、交互式修订、自包含打包 |
| Distribution | npm / 单二进制发布 |

## 9. 成本与时间参考（spike 实证）

`a2h render` 端到端耗时与成本由下游 `claude` CLI 决定。下表来自 2026-05-21 spike 验证（`article-magazine` / `deck-product-launch` / `data-report`），供调用方在嵌入时显式传 `--max-budget-usd` 时参考：

| 模板族 | 典型耗时 | 典型成本 | 推荐用户传参 |
| --- | --- | --- | --- |
| article 类（article-magazine / blog-post / newsletter）| ~70s | $0.3-0.5 | `--max-budget-usd 0.5` |
| deck 类（deck-* / 多页演示）| ~170s | $0.6-1.2 | `--max-budget-usd 2.0` |
| dataviz 类（data-report / dashboard）| ~145s | $0.6-1.0 | `--max-budget-usd 2.0` |

> `a2h` CLI 自身**不设默认上限**（per PRD Q-MVP-7 决策 A）；上述参考值由调用方在嵌入时显式传入。

## 10. 目录结构（规划）

```
Anything2HtmlCLI/
├── README.md          # 你正在读的项目目标文档
├── AGENTS.md          # AI 协作约定（Trellis 入口）
├── ref/
│   └── html-anything/ # 上游参考实现（只读）
├── src/               # CLI 源码（待建）
├── templates/         # 抽取后的模板（待建）
├── .trellis/          # 任务、规范、工作区
└── ...
```
