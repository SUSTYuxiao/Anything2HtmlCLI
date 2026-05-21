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
import { renderToHtml } from "../commands/render.js";
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
    callAgent: async (opts) => {
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
  let captured: { budget?: number; noBare?: boolean } = {};
  await renderToHtml({
    input: "x",
    skillId: "article-magazine",
    budget: 2.5,
    noBare: true,
    callAgent: async (opts) => {
      captured = { ...opts };
      return RAW_STDOUT;
    },
  });
  assert.equal(captured.budget, 2.5);
  assert.equal(captured.noBare, true);
});
