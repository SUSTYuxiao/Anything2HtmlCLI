# render 默认值优化 + 开发软链脚本

> **Status**: planning（brainstorm）。两件事打包：(1) 产品默认值优化——`--skill` 缺省默认 `article-magazine`，`-o` 缺省默认写到输入文件同级目录；(2) 工程工具——`npm run dev:link / dev:unlink` 开发期全局软链脚本。

## Goal

让 a2h CLI 的常用调用更轻量，同时给开发者更便捷的本地自测路径。

## What I already know

- 当前 PR2 设计：`--skill` 必填、`-o` 缺省走 stdout（per `Q-MVP-IO 决策 B`）
- 用户原文："`--skill article-magazine` 可以为空，默认则为 article-magazine，`-o` 也可以为空 默认放到原文件同级目录"
- 用户场景：交互式手动 a2h 时不想每次写 `--skill article-magazine -o out.html`
- 设计冲突点：`-o` 缺省改"写到原文件同级"会破坏现有 Unix 管道契约 `a2h render in.md > out.html`（如果 -o 仍写到 file，stdout 没东西，`>` 重定向是空文件）
- stdin 输入路径（`a2h render -` / `cat in.md | a2h render -`）没有"原文件"，必须有 fallback

## Requirements（P0）

### 1. `--skill` 默认 `article-magazine`

- 缺省时不报 E_USAGE，自动用 `article-magazine`
- `--help` 加注："defaults to `article-magazine` if omitted"
- 实测：`a2h render in.md` 等价于 `a2h render in.md --skill article-magazine`

### 2. `-o` 行为分场景默认（决策 B：TTY 检测自动切）

按"输入类型 + stdout 是否 TTY"分场景：

| 输入 | stdout 状态 | -o 缺省 | 默认行为 |
| --- | --- | --- | --- |
| 文件路径 (`a2h render in.md`) | TTY（交互式） | 缺省 | **写到 `<input-stem>.html`（与输入同目录）** |
| 文件路径 (`a2h render in.md > out.html` / `... \| grep`) | 非 TTY（pipe / 重定向） | 缺省 | **写 stdout**（保 Unix 管道契约） |
| stdin (`a2h render -`) | 任意 | 缺省 | **写 stdout**（无原文件，永远 stdout） |
| 文件 / stdin + 显式 `-o file` | 任意 | 显式 | 写指定文件 |
| 文件 / stdin + 显式 `-o -`（stdout 哨兵） | 任意 | 显式 | 写 stdout |

**新增 `-o -` 哨兵**：让"文件输入 + 交互终端 + 想要 stdout"场景仍可达——`a2h render in.md -o -` 等价于"明确要 stdout"。

判定逻辑（render.ts 实现）：
```ts
// 1. 显式 -o （含 "-" 哨兵）— 最高优先级
if (opts.out === "-") { writeStdout = true; }
else if (opts.out) { writeFile = opts.out; }
// 2. stdin 输入 — 永远 stdout
else if (input === "-") { writeStdout = true; }
// 3. 文件输入 — TTY 检测分支
else if (process.stdout.isTTY) {
  writeFile = inferOutPath(inputFilePath);  // path.dirname/basename + ".html"
} else {
  writeStdout = true;  // 被 pipe / 重定向时
}
```

`--help` 加完整场景表说明。

### 3. `npm run dev:link / dev:unlink` 脚本

- `package.json` `scripts` 加：
  - `dev:link`: `npm run build && npm link`
  - `dev:unlink`: `npm unlink -g @a2h/cli || true`（`|| true` 让脚本在已 unlink 时不报错）
- 不做更复杂的"自动检测 link 状态"逻辑（轻量为美）

## Acceptance Criteria

- [ ] `node bin/a2h render in.md` 在 TTY 终端：等价于 `--skill article-magazine`，产物落到 `./in.html`
- [ ] `node bin/a2h render in.md > out.html`：HTML 写 stdout（非 TTY 检测）→ shell `>` 落到 out.html，out.html 非空
- [ ] `node bin/a2h render in.md | wc -c`（pipe）：HTML 写 stdout → wc 看到字节数
- [ ] `cat in.md | node bin/a2h render -`：HTML 写 stdout（stdin 永远 stdout）
- [ ] `node bin/a2h render in.md -o -`（显式哨兵）：HTML 写 stdout，**不**写 in.html
- [ ] `node bin/a2h render in.md -o my.html`：写 my.html
- [ ] `node bin/a2h render in.md --skill nonexistent` 仍 E_SKILL_NOT_FOUND（默认值不绕过校验）
- [ ] `npm run dev:link` 跑完后 `which a2h` 指向当前项目；`a2h --version` 输出 `0.1.0`
- [ ] `npm run dev:unlink` 跑完后 `which a2h` 不再返回当前项目路径，且重复跑不报错
- [ ] `--help` 文本注明 --skill 默认 + -o 完整场景表 + `-o -` stdout 哨兵
- [ ] 测试覆盖：`render.test.ts` 加 ≥ 5 项（--skill 缺省 / -o 缺省+TTY+文件输入 / -o 缺省+非 TTY+文件输入 / -o 缺省+stdin / `-o -` 哨兵）；mock `process.stdout.isTTY` 切换场景
- [ ] `npm run typecheck && npm run lint && npm test` 全过
- [ ] 真实 smoke 不必再跑（默认值变更不影响 LLM 调用路径）

## Out of Scope

- 不改 spec（除非默认值变更触发 cli-design.md / error-handling.md drift）
- 不改 README（默认值变更可能需要 README Usage 段顺手改一两行；本任务允许改 README 的 Usage 段对齐新默认）
- 不改 charter（Q-MVP-IO 决策 B 仍生效；本任务在其框架内**扩展**默认值，不推翻）
- 不做 PATH 自动检测（dev:link 脚本仅 npm link 简单包装）
- 不破坏 stdin 写 stdout 的 Unix 管道契约（关键不变量）

## Open Questions

- ~~Q-RD-1：stdin 缺省 -o 兜底策略~~ → **stdout**（保留 Unix 管道契约）
- ~~Q-RD-2：是否引入 `-o -` stdout 哨兵~~ → **是**，让"文件输入要 stdout"仍可达
- ~~Q-RD-3：--skill 默认值~~ → **`article-magazine`**（用户原话）
- ~~Q-RD-4：shell `>` 重定向冲突~~ → **B. TTY 检测自动切**（交互终端写文件 / 被 pipe 或重定向时写 stdout）

## Technical Notes

- `src/commands/render.ts` 有 `parseRenderArgs()` 和 `runRender()`——默认值实现在 parseRenderArgs 里
- 默认 skill 实现：`opts.skill ?? "article-magazine"`
- 默认 -o 文件名：`path.basename(input, path.extname(input)) + ".html"` + 输入文件 dirname
- spec 影响：`guides/cli-design.md` 中"必填 --skill"描述需更新；`error-handling.md` 退出码不变
