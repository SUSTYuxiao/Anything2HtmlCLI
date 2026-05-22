# 修复 git 卫生: ignore 根目录 *.html

## Goal

修两件事：
1. `.gitignore` 加 `/*.html` 规则——`a2h render` 默认产物落在仓库根目录时不再被 `git add -A` 误捕获
2. 移除已被误 commit 的 `out.html` 文件（保留本地）

## What I already know

- 上一个 commit `878fbf8` 误 commit 了 `out.html`（user 跑 `a2h render README.md > out.html` 的产物）
- 根因：当前 `.gitignore` 只 ignore 了 `*.tgz` / `dist/` / `*.log`，未覆盖根 `*.html`
- `a2h render` 引入"自动写 `<input-stem>.html` 同级"行为后，根目录 *.html 必然是产物
- 但 `src/templates/skills/*/example.html` 是 sync 进来的 skill fixture——必须保留跟踪

## Requirements（P0）

### 1. `.gitignore` 加 `/*.html` 规则

精确语义：开头斜杠 `/` 表示**仅匹配仓库根目录**的 html 文件，**不递归子目录**。

加在合适位置（建议靠近其他临时产物 ignore 行如 `*.tgz`）：

```
# a2h render 默认在输入文件同级写 <stem>.html;
# 仓库根跑 a2h render <root-file> 会产生根 .html, 视为临时产物
/*.html
```

### 2. `git rm --cached out.html`

从 git 索引移除（保留本地文件）。

### 3. 验证

- `git status` 应见 `D out.html` 在 staged（删除标记）
- `cat README.md > /tmp/test.html` 测试不影响（不在仓库内）
- `ls src/templates/skills/article-magazine/example.html` 仍存在且仍被跟踪（`git ls-files src/templates/skills/article-magazine/example.html` 有输出）
- `cd /tmp && cp ~/code/vibe/Anything2HtmlCLI/README.md out.html && cd ~/code/vibe/Anything2HtmlCLI && git status` —— 不会显示 `?? out.html`

不要 commit，main session 来 commit。

## Acceptance Criteria

- [ ] `.gitignore` 含 `/*.html` 行
- [ ] `git ls-files out.html` 输出为空（已移除）
- [ ] `git ls-files src/templates/skills/*/example.html` 仍含 75 个文件（未误伤）
- [ ] `git status` 显示 `D out.html` + `M .gitignore`，无其他 dirty 文件
- [ ] 本地 `out.html` 文件仍在（`ls out.html` 看得到）

## Out of Scope

- 不改其他文件
- 不动 src/ / scripts/ / package.json
- 不 commit（main session 驱动）

## Technical Notes

- `/*.html` vs `*.html`：前者仅根目录、后者递归——必须用前者保护 skills/example.html
- `git rm --cached` 与 `git rm` 区别：前者只移 index 不删本地文件（user 要保留 out.html 本地用作浏览/调试）
