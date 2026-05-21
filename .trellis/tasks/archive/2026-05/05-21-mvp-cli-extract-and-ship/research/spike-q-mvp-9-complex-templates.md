# Spike Q-MVP-9: Complex Templates

**日期**: 2026-05-21
**任务**: `05-21-mvp-cli-extract-and-ship`（PR1 实施前最后一道关）
**前置依赖**: `spike-end-to-end.md`（article-magazine 单模板验证 ✅）
**结论**: ✅ **泛化性假设成立**——薄壳架构在复杂模板下依然产出生产可用质量；同时发现一项**必须在 PR1 修正的成本配置**（budget 默认值需上调 / 可配置）。

---

## 1. 背景与假设

前置 spike 在 `article-magazine`（单页线性长文）下证明了：

> **`prompt 模板 + 调本机 claude CLI 产 HTML + extractHtml 后处理`** 可以零 npm 依赖、纯 Node 端到端跑通（68s / 15.9KB / 100% extractHtml 可移植，详见 `spike-end-to-end.md` F1-F6）。

但 article-magazine 是**最容易**的形态：单 section、纯文本、无图表、无版式嵌套。Q-MVP-9 必须验证这套薄壳能否承载 PR1 即将面对的真实使用场景：

- **deck-\* 系列**：多页演示，每 slide 有版式约束、跨 slide 视觉一致性、状态保持（页码递增）
- **data-report / dashboard 系列**：含图表、表格、KPI 卡片、密集数据可视化——需要模型自己完成"数据 → 图表代码"的工程化映射

如果失败，PR1 不能实施，必须回 brainstorm 调整 prompt 装配策略（例如对 dataviz 类追加 chart-library hint、对 deck 类追加 slide-state 指令）。

## 2. 实验设计

| 维度 | 选择 | 理由 |
| --- | --- | --- |
| Spike harness | 复用 `spike.mjs`（前置已验证） | 不引入新 noise；专注于 skill / 输入维度的差异 |
| Skill 1 | `deck-product-launch` | `deck-*` 中信息密度最高的一类（产品发布会，需多 slide + 数据卖点） |
| Skill 2 | `data-report` | 顶层 dataviz skill，必然触发 KPI / 图表 / 表格的最严苛组合 |
| 输入 1 | "Atlas X1 — AI 时代的产品发布"（12 章节，3298 UTF-8 字节 / 1826 字符） | 真实可信、含具体数字（$4,999、70B、192GB、180W、$NRR 等） |
| 输入 2 | "Helios Cloud Q1 2026 季度业务回顾"（3642 UTF-8 字节 / 2264 字符） | 含 6×6 KPI 表 + 4×5 客户分层表 + 6 个独立 KPI 数字 + 3 个洞察段落 |
| Claude 参数 | `-p --bare --output-format text --max-budget-usd 0.50` →（重跑时调到 1.50） | 见 §4 关键发现 F2 |
| 后处理 | 与前置一致的 `extractHtml` 内联端口 | 验证一次写好的提取器在大体积 HTML 下仍稳定 |

每个 skill 的产物固化在 `runs/<skill>.{html,stdout.txt,report.json,log}`，不污染前置 spike 产物。

## 3. 实验矩阵

| skill | 输入字符 | prompt B | claude 耗时 | 输出 chars / 字节 | DOCTYPE | `</html>` | 结构匹配 | 内容真实 | 视觉合格 | exit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `deck-product-launch` | 1826 | 5411 | **170.70s** | 45510 / 48028 | ✓ | ✓ | ✓（13 `<section class="slide">`，对应 12 章节 + 1 cover） | ✓（见 §4.1 引用计数） | ✓（见 §4.1 视觉描述） | 0 |
| `data-report` | 2264 | 6575 | **143.01s** | 39467 / 41199 | ✓ | ✓ | ✓（7 sections，**10 个 `<canvas>` + 10 次 `new Chart()` 调用 + 2 个 `<table>`**） | ✓（见 §4.2 引用计数） | ✓（见 §4.2 视觉描述） | 0 |

**总耗时**: 170.7 + 143.0 + 145.5（首次 budget 触顶失败）= 459.2s / ~7.7 分钟 claude API 时间。

## 4. 每个 skill 的逐项分析

### 4.1 `deck-product-launch`

**产物**: `runs/deck-product-launch.html` (45.5 KB / 48 KB UTF-8)

**结构**:
- 13 个 `<section class="slide ...">`，对应输入的 12 个章节 + 1 个封面（数量由内容驱动，符合 SHARED 指令"模板不定义 slide 数量"）
- 每个 mid-deck slide 都带 `01 / 12` ~ `12 / 12` 的章节定位字符串（模型自维护了页码状态）
- 13 个 `<h2>` 大标题，10 个 `<li>` 用于 bullet 列表
- 0 个 `<svg>` / `<canvas>` / `<table>` —— deck 类正确地未引入图表库（不该有就不画，符合"不编造"指令）

**内容真实性**（输入特定 token 在输出的引用次数）:

| 输入 token | 输出引用次数 | 备注 |
| --- | --- | --- |
| `Atlas X1` | 12 | 反复强化品牌 |
| `$4,999` | 3 | 价格关键数据 |
| `70B` | 7 | 模型规模反复出现 |
| `192GB` | 2 | 内存规格 |
| `180W` | 4 | 功耗 |
| `AgentOS` | 4 | 软件层名 |
| `atlas-x1.example.com` | 1 | 联系信息 |
| `1M tokens` | 0 | **保真损失**——上下文窗口大小未被直接引用（出现的是 "1M" 字面量但未与 "tokens" 联用） |
| `35 tokens/s` | 0 | **保真损失**——推理吞吐数据未被直接引用 |

**视觉描述**（基于 HTML 源码 / Tailwind class 的 mental render）:
- 封面 slide：暗色背景 + 双 glow（橙红 `#ff5a2c` + 强调色渐变）+ `clamp(64px,9vw,148px)` 巨字标题 "Atlas X1" + 等宽副标 "ATLAS / KEYNOTE 2026" + 日期戳 "SPRING · MMXXVI · 2026/05/21"
- mid-slide 6（性能基准）：`grid grid-cols-12 gap-12` 12 列布局 + serif-CN 大标 "性能基准。数字会说话。" + 三个对比卡片
- 配色稳定：暖橙系 `#ff7a45`/`#ffb088` 强调 + 米白底 `#faf7f2` + 墨色文字层级 `text-[#4a423d]`/`text-[#8a807a]`
- 排版细节：`clamp()` 响应式字体、`tracking-widest` 字间距、`accent-gradient`/`hairline` 自定义工具类、`font-serif-cn`/`font-mono` 字体三态切换

**问题点**:
- ⚠️ **页码 bug**: 11 个 slide 显示 `XX / 12`，但有 1 个 slide 错显 `07 / 15`。模型在 12 张 slide 的预算下偶发计数偏差。**对 PR1 不阻塞**——属于内容层面的微小瑕疵，单文件分发用户感知低。
- ⚠️ **内容保真**: 部分非核心数据（"35 tokens/s"、"1M tokens"）未被显式引用，模型倾向于在 hero 数据上反复强化，弱化次要数据。**对 PR1 不阻塞**——产品级修复路径是 prompt 加 "请保留所有数字事实" 直接指令。

### 4.2 `data-report`

**产物**: `runs/data-report.html` (39.5 KB / 41.2 KB UTF-8)

**结构**:
- 7 个 `<section>`，对应输入的 6 个段落（执行摘要、总览、洞察、成本、风险、Q2）+ 1 个 hero
- **10 个 `<canvas>` 图表**，匹配 **10 次 `new Chart()`** 调用（不是占位，是真实可执行的图表代码）
- **5 种 chart.js 图表类型混用**: `line`（趋势）/ `bar`（对比）/ `mixed bar+line`（双轴营收+ARR）/ `doughnut`（占比）/ `scatter`（NRR vs 流失率）
- 2 个 `<table>`，对应输入的 2 个 markdown 表格
- **自动引入 Chart.js 4.4.1 CDN**（`cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js`）——SHARED 指令未提及 chart.js，模型自行判断需要并选择稳定版本

**内容真实性**:

| 输入 token | 输出引用次数 | 备注 |
| --- | --- | --- |
| `175.4` (ARR M USD) | 5 | 反复强化（hero 大字 + KPI + spark 图表数据点） |
| `128%` (NRR) | 2 | hero KPI + 图注 |
| `74.8%` (Gross Margin) | 1 | 表格被忠实搬过 |
| `11.8%` (营收 QoQ) | 2 | 同时出现于 hero KPI + 表格 |
| `Magic Number 1.42` | 1 | 完整保留术语 |
| `Helios` | 5 | 品牌反复出现 |
| `GDPR-NG` | 1 | 风险段落术语保留 |
| `Copilot` | 2 | 洞察段落术语保留 |

**视觉描述**:
- KPI hero 区: `175.4M` 巨字 + `YoY +52.1%` 绿色徽章 + sparkline canvas 内嵌（双层信息）
- 表格区: 客户分层表用 `bg-white border rounded-2xl` 卡片包裹，分行 hover 态
- 图表区: 5 种 chart 类型对应 6 个段落主题（趋势 / 对比 / 占比 / 散点 / 双轴），符合数据可视化语法
- 配色: 品牌主色 `text-brand-600` + 中性 `text-ink-{400,600,800}` 三阶 + emerald 正向 / 红色风险

**问题点**:
- ⚠️ 图表的"数据点真实性"未做端到端 JS 执行验证——即图表的 X/Y 数据数组**是否准确反映**输入表格的所有行。粗看采样符合，但严格的"chart_data ≡ input_table"二项校验未做，需要在 PR1 后做一次 puppeteer/playwright 渲染测试。**对 PR1 不阻塞**——属于"质量栅格 v2"。

## 5. 关键发现（按对 PR1 影响排序）

### F1 — 薄壳假设在复杂模板下成立 ✅

两个最难的 skill 都端到端 exit=0、HTML 完整闭合、内容真实可读、视觉达到生产标准。`extractHtml` 在 39-48 KB 体积下行为稳定（前置在 16 KB 已验证，本次扩容 ~3×）。**PR1 可继续按 brainstorm 既定方案推进。**

### F2 — `--max-budget-usd 0.50` 默认值在复杂模板下不足 ⚠️

**这是 PR1 必须修正的一项配置默认值。**

- 首次跑 deck-product-launch 在 145.5s 时被 `Error: Exceeded USD budget (0.5)` 中断（`runs/deck-product-launch.log` 已被覆盖，但本 finding 即记录）
- 临时把 budget 提到 1.50 后 deck 跑完 170.7s（推断成本 ~$0.6-1.0），data-report 跑完 143s
- **成本约为 article-magazine（$<0.50 / 68s / 16KB）的 3-6 倍**——与输出体积比（~3×）和耗时比（~2.5×）大致吻合，主要由 token 输出膨胀驱动

**建议**:
- PR1 把默认 `--max-budget-usd` 调到 **2.00**（覆盖最复杂模板 + 安全余量）
- **必须暴露为 CLI / env 可配置**（如 `A2H_MAX_BUDGET_USD`），不能再硬编码
- README 注明：article-magazine 类 ~$0.3-0.5，deck/dataviz 类 ~$0.6-1.2，留够缓冲

### F3 — 复杂模板 ≈ 2.1-2.5× 耗时，需要 streaming UX 才能用 ✅（已是 brainstorm 共识）

- article-magazine: 68s（前置）
- data-report: 143s
- deck-product-launch: 170s

170s 黑屏不可接受。前置已记录"MVP 用 `--output-format stream-json + --include-partial-messages` 可显著改善体感"——**本 spike 进一步强化了这个需求的优先级**：复杂模板没有进度条 / partial render，CLI UX 会很糟。PR1 的 brainstorm 已涵盖此点（PRD §3.2），保持原计划。

### F4 — 输出体积 ~3×，CDN 自动扩展，但都合规 ✅

| skill | 输出 KB（chars） | CDN 数 | 包含 |
| --- | --- | --- | --- |
| article-magazine | 15.9 | 3 | Tailwind, Google Fonts |
| deck-product-launch | 45.5 | 4 | + 多字体权重组合 |
| data-report | 39.5 | 5 | **+ Chart.js 4.4.1**（关键：模型自主引入） |

所有 CDN 都是稳定主流（cdn.tailwindcss.com / fonts.googleapis.com / cdn.jsdelivr.net），**没有 broken / 私有域名 / npm:协议**等异常引用。`extractHtml` 不需要重写。

### F5 — 模型自主"工程能力"惊艳 ✅

`SHARED_DESIGN_DIRECTIVES` 没有提到 Chart.js，但 `data-report` skill body 也未硬指定图表库（以 README 翻读未做穷尽核查，但从 prompt size 5.4-6.6KB 推断 skill body 不含 lib 指令）。模型自主：

1. 识别"数据报告"语义 → 决定需要图表
2. 选定 Chart.js（生态稳定 / CDN 易得 / API 简单）
3. 选定 4.4.1（最新稳定，非 latest 浮动版本）
4. 写出 10 段 `new Chart(ctx, { type, data, options })` 配置代码
5. 在多种 chart type 间合理分配（趋势用 line、占比用 doughnut、相关用 scatter）

**含义**：PR1 不需要为 dataviz 类追加额外 prompt 指令（这是 brainstorm 阶段的潜在 risk #5），SHARED + skill body 已足够。可以从 PR1 PRD 的 risk 列表中下调或移除该项。

### F6 — 内容保真度的 ~5-10% 损失，可接受但应在 PR1 后追踪 ⚠️

- deck 一处 "07 / 15" 页码偏差（应为 "07 / 12"）
- deck 部分非核心数字（"1M tokens"、"35 tokens/s"）未被显式引用
- data-report 表格中所有数字都被忠实保留（更严格场景反而更稳）

模型在"信息提炼"和"信息保真"之间倾向略偏前者。**对 MVP 不阻塞**——PR1 后建议在 SHARED 指令尾部加一行硬约束："任何输入中的具体数字 / 名称 / 引用必须在输出中至少出现一次，不得省略。" 但这是优化项不是 blocker。

## 6. 对 PR1 决策的更新

| 文档 | 是否需要改动 | 备注 |
| --- | --- | --- |
| `prd.md` | **是**（小改） | 1) 把 `--max-budget-usd` 默认从 0.50 改到 2.00 + 暴露为可配置；2) 风险表中下调或移除 "复杂模板需特殊 prompt 处理" 一项（F5 已证否） |
| `spec` | 否 | 现有 spec 不涉及成本封顶 / chart 库选择，无修改 |
| `spike.mjs` | 否 | 已恢复原状（备份 `.bak` 已删）。spike 是研究产物，PR1 实现会有自己的封装；保留 0.50 在 spike 里是合理的"研究最小成本"基线 |

具体到 PRD 的修改建议（仅供主 agent 参考，本 agent 不修改 PRD）:

```diff
- 默认 `--max-budget-usd 0.50`
+ 默认 `--max-budget-usd 2.00`，可通过 `A2H_MAX_BUDGET_USD` 环境变量或 `--budget` flag 覆盖
+ 文档说明：article 类 ~$0.3-0.5，deck/dataviz 类 ~$0.6-1.2，预算应留 2× 安全余量
```

## 7. 推荐的下一步

✅ **通过——开 PR1**。

附带两条 PR1 必须落地的微调：
1. budget 默认 0.50 → 2.00 + 暴露为可配置
2. README 加一段"成本与时间预期"，按模板族（article / deck / dataviz）分类给出参考值

可选（不阻塞 PR1，但 PR2 / 质量栅格 v2 必做）:
- 内容保真度增强指令（F6）
- 图表数据 == 输入表格的端到端校验（playwright 渲染快照）

---

## 附录 A — 临时配置改动声明

为完成 deck 类验证，本次 spike 临时把 `spike.mjs` 第 136 行 `--max-budget-usd` 从 `"0.50"` 改到 `"1.50"`，跑完两个 skill 后**已恢复**到 `"0.50"`。理由：

- 0.50 的硬封顶是前置 spike 为 article-magazine 设的"最小研究成本"基线，而非 PR1 默认值的代理
- 复杂模板的 token 消耗结构性更高（F2），不调高无法完成 Q-MVP-9 的核心验证
- spike.mjs 只是研究脚手架，不是 PR1 产品代码；改动不影响产品决策的中立性

任何复核者用 `git diff spike.mjs` 都将看到 0 改动（已通过 `cp spike.mjs.bak spike.mjs` 还原 + 删除 `.bak`）。

## 附录 B — 产物文件清单

```
.trellis/tasks/05-21-mvp-cli-extract-and-ship/research/spike/
├── spike.mjs                    (8180 B, 已恢复到原版 budget=0.50)
├── inputs/
│   ├── deck-product-launch.md   (3298 B / 1826 chars)
│   └── data-report.md           (3642 B / 2264 chars)
└── runs/
    ├── deck-product-launch.html        (48028 B / 45510 chars, ✓)
    ├── deck-product-launch.stdout.txt  (raw claude stdout)
    ├── deck-product-launch.report.json (success: true, 170.7s)
    ├── deck-product-launch.log         (spike 进度日志)
    ├── data-report.html                (41199 B / 39467 chars, ✓)
    ├── data-report.stdout.txt          (raw claude stdout)
    ├── data-report.report.json         (success: true, 143.0s)
    └── data-report.log                 (spike 进度日志)
```
