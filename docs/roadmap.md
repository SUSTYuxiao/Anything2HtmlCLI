# 路线图

`a2h` 项目的阶段性里程碑。当前状态：MVP 完整闭环 + 发布准备就绪，等待真实 npm publish 决策。

---

## 阶段表

| 阶段 | 关注点 | 状态 | 里程碑 commit |
| --- | --- | --- | --- |
| Charter | 目标对齐、参考导入 | ✅ 已完成 | `cb6a6bc` 起 |
| Spec Bootstrap | 编码规范、目录约定 | ✅ 已完成 | 随 PR1 各 sub-agent 落地 |
| MVP | 解耦上游核心渲染、CLI 骨架、最小模板 | ✅ 已完成（PR1 + PR2） | `51ee5b9` |
| CLI Polish | 砍 preview / 加 qoder / 心跳 progress | ✅ 已完成 | `f5931f0` |
| 边界原则沉淀 | spec sync（CLI 仅做适配层） | ✅ 已完成 | `a6705d0` |
| 发布准备 | npm publish prep + Embedding cookbook | ✅ 已完成（待用户真实发布） | `a6705d0` |
| Distribution | 真实 npm publish + GitHub release | ⏳ 用户决策 | — |

---

## 已明确不做

以下方向已在 charter / 历次 PRD 决策中关闭，不再进入 backlog：

- 浏览器交互 / `--interactive` 子命令
- 单仓库内同时支持 >2 个 agent CLI（仅 claude + qoder）
- 单二进制发布（pkg / nexe / bun build）——npm 分发已够
- 配置文件 / `~/.a2hrc` / 环境变量优先级链（除 `A2H_AGENT` 单一开关外）
- 多文件输出 / 资产分离（违反 charter "单文件 self-contained HTML"）

---

## 远期演化（需要重新 brainstorm 才能开任务）

下列方向**未否决但也未规划**——若真要做必须先重新对齐边界与代价：

- **stream-json 解析切结构化错误码**——目前 `claudeClassify` / `qoderClassify` 是关键字匹配；切协议层会违反"项目边界原则"（CLI 不深入 LLM 协议层）。
- **多文件输出**——违反 charter "单文件 HTML"，要做需重审 self-contained 约束。
- **上游同步自动化**（CI / PR / codemod）——目前 `npm run sync` 手动触发，自动化前需先解决上游 breaking change 检测。
