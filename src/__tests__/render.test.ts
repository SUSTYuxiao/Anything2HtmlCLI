// =====================================================================
// src/__tests__/render.test.ts
// 验证 renderToHtml 核心: skill 解析 + assemble + 注入 callAgent + 校验通过.
// fixture: spike runs/data-report.stdout.txt (真实 claude 输出, 41KB).
// =====================================================================

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  renderToHtml,
  parseRenderArgs,
  decideOutputTarget,
  inferOutPath,
} from "../commands/render.js";
import { A2hError } from "../errors.js";

// ─── fixture 路径解析 ────────────────────────────────────────────────
// 测试编译落在 dist-test/render.test.js, fixture 在 src/__tests__/fixtures/
// ↑ 一级 ../src/... 即可定位.
const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(__dirname, "../src/__tests__/fixtures/raw-stdout.txt");
const RAW_STDOUT = readFileSync(FIXTURE_PATH, "utf8");

// ─── 1. happy path: 注入 mock callAgent → 返回提取后 HTML ───────────
test("renderToHtml: happy path with injected agent returns valid HTML", async () => {
  const html = await renderToHtml({
    input: "# Hello\n\nA quick test.",
    skillId: "article-magazine",
    callAgent: async () => RAW_STDOUT, // mock: 直接返回已是合规 HTML
  });
  assert.match(html, /^<!DOCTYPE\s+html/i);
  assert.match(html, /<\/html>\s*$/);
});

// ─── 2. unknown skill → E_SKILL_NOT_FOUND ───────────────────────────
test("renderToHtml: unknown skill throws E_SKILL_NOT_FOUND", async () => {
  await assert.rejects(
    () =>
      renderToHtml({
        input: "x",
        skillId: "this-skill-does-not-exist",
        callAgent: async () => RAW_STDOUT,
      }),
    (err: unknown) => {
      assert.ok(err instanceof A2hError);
      assert.equal((err as A2hError).code, "E_SKILL_NOT_FOUND");
      return true;
    },
  );
});

// ─── 3. callAgent 抛 A2hError → 透传 ────────────────────────────────
test("renderToHtml: propagates A2hError from injected callAgent", async () => {
  await assert.rejects(
    () =>
      renderToHtml({
        input: "x",
        skillId: "article-magazine",
        callAgent: async () => {
          throw new A2hError("E_BUDGET_EXCEEDED", "fake budget exceeded");
        },
      }),
    (err: unknown) => {
      assert.ok(err instanceof A2hError);
      assert.equal((err as A2hError).code, "E_BUDGET_EXCEEDED");
      return true;
    },
  );
});

// ─── 4. assemble 接收 skill body + content ──────────────────────────
test("renderToHtml: passes input through to callAgent prompt", async () => {
  let capturedPrompt = "";
  await renderToHtml({
    input: "# UNIQUE_TEST_MARKER_42",
    skillId: "article-magazine",
    callAgent: async (_id, opts) => {
      capturedPrompt = opts.prompt;
      return RAW_STDOUT;
    },
  });
  // prompt 必须包含: SHARED 设计指令 + skill body + 用户内容标记
  assert.match(capturedPrompt, /UNIQUE_TEST_MARKER_42/);
  assert.match(capturedPrompt, /世界级的视觉设计师/); // SHARED 指令开头
});

// ─── 5. budget / noBare 透传 ─────────────────────────────────────────
test("renderToHtml: forwards budget + noBare to callAgent", async () => {
  let capturedBudget: number | undefined;
  let capturedNoBare: boolean | undefined;
  await renderToHtml({
    input: "x",
    skillId: "article-magazine",
    budget: 2.5,
    noBare: true,
    callAgent: async (_id, opts) => {
      capturedBudget = opts.budget;
      capturedNoBare = opts.noBare;
      return RAW_STDOUT;
    },
  });
  assert.equal(capturedBudget, 2.5);
  assert.equal(capturedNoBare, true);
});

// ─── 6. agentId 默认 claude ──────────────────────────────────────────
test("renderToHtml: agentId defaults to claude", async () => {
  let capturedId = "";
  await renderToHtml({
    input: "x",
    skillId: "article-magazine",
    callAgent: async (id) => {
      capturedId = id;
      return RAW_STDOUT;
    },
  });
  assert.equal(capturedId, "claude");
});

// ─── 7. agentId qoder 透传 ──────────────────────────────────────────
test("renderToHtml: agentId qoder passes through", async () => {
  let capturedId = "";
  await renderToHtml({
    input: "x",
    skillId: "article-magazine",
    agentId: "qoder",
    callAgent: async (id) => {
      capturedId = id;
      return RAW_STDOUT;
    },
  });
  assert.equal(capturedId, "qoder");
});

// =====================================================================
// PR4 (render-defaults-and-link) 新增: --skill 默认 + -o TTY 检测分场景.
// 协议来源: PRD render-defaults-and-link Q-RD-3 / Q-RD-4 / Q-RD-2.
// =====================================================================

// ─── 8. --skill 缺省 → 默认 article-magazine (PRD Q-RD-3) ───────────
test("parseRenderArgs: --skill omitted defaults to article-magazine", () => {
  const args = parseRenderArgs(["in.md"]);
  assert.equal(args.skill, "article-magazine");
  assert.equal(args.input, "in.md");
});

// ─── 8b. --skill 显式仍生效 (默认值不破坏显式传参) ──────────────────
test("parseRenderArgs: --skill explicit overrides default", () => {
  const args = parseRenderArgs(["in.md", "--skill", "blog-post"]);
  assert.equal(args.skill, "blog-post");
});

// ─── 8c. 默认值不绕过 E_SKILL_NOT_FOUND (per Acceptance Criteria) ───
// 用户显式传不存在的 skill 时仍报 E_SKILL_NOT_FOUND, 默认值仅省略键入.
test("renderToHtml: explicit unknown skill still throws E_SKILL_NOT_FOUND", async () => {
  await assert.rejects(
    () =>
      renderToHtml({
        input: "x",
        skillId: "nonexistent-skill-xyz",
        callAgent: async () => RAW_STDOUT,
      }),
    (err: unknown) => {
      assert.ok(err instanceof A2hError);
      assert.equal((err as A2hError).code, "E_SKILL_NOT_FOUND");
      return true;
    },
  );
});

// ─── 9. -o 缺省 + 文件输入 + isTTY=true → 写 <input-stem>.html ──────
test("decideOutputTarget: file input + TTY + no -o → file with stem.html", () => {
  const target = decideOutputTarget("docs/in.md", undefined, true);
  assert.equal(target.kind, "file");
  if (target.kind !== "file") return;
  assert.equal(target.path, "docs/in.html");
});

// ─── 10. -o 缺省 + 文件输入 + isTTY=false → stdout (保管道契约) ─────
test("decideOutputTarget: file input + non-TTY + no -o → stdout (pipe contract)", () => {
  const target = decideOutputTarget("in.md", undefined, false);
  assert.equal(target.kind, "stdout");
});

// ─── 11. -o 缺省 + stdin 输入 → 永远 stdout (无原文件可推) ──────────
test("decideOutputTarget: stdin input → stdout regardless of TTY", () => {
  const tty = decideOutputTarget("-", undefined, true);
  const nonTty = decideOutputTarget("-", undefined, false);
  assert.equal(tty.kind, "stdout");
  assert.equal(nonTty.kind, "stdout");
});

// ─── 12. -o "-" 哨兵 → 强制 stdout (任意输入 / 任意 TTY) ────────────
test("decideOutputTarget: -o '-' sentinel forces stdout", () => {
  const fileInputTty = decideOutputTarget("in.md", "-", true);
  const stdinInputNonTty = decideOutputTarget("-", "-", false);
  assert.equal(fileInputTty.kind, "stdout");
  assert.equal(stdinInputNonTty.kind, "stdout");
});

// ─── 13. -o <file> 显式 → 写指定文件 (优先级最高) ───────────────────
test("decideOutputTarget: explicit -o <file> writes that file", () => {
  const target = decideOutputTarget("in.md", "custom/out.html", true);
  assert.equal(target.kind, "file");
  if (target.kind !== "file") return;
  assert.equal(target.path, "custom/out.html");
});

// ─── 14. inferOutPath: <input-stem>.html 与输入同目录 ───────────────
test("inferOutPath: returns <stem>.html in input's dirname", () => {
  assert.equal(inferOutPath("/abs/path/article.md"), "/abs/path/article.html");
  assert.equal(inferOutPath("article.md"), "article.html");
  assert.equal(inferOutPath("docs/notes.markdown"), "docs/notes.html");
  // 无扩展名: 直接拼 ".html"
  assert.equal(inferOutPath("docs/README"), "docs/README.html");
});
