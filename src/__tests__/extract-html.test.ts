// =====================================================================
// src/__tests__/extract-html.test.ts
// 验证从上游同步进来的 extract-html.ts 在本仓库环境下行为正确。
// 测试覆盖 spec/quality-guidelines.md §测试 列出的四个分支:
//   1. fenced HTML  2. DOCTYPE start  3. 仅 <html>  4. fallback 包装
// =====================================================================

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { extractHtml, previewHtml } from "../extract-html.js";

// ─── 1. fenced HTML ──────────────────────────────────────────────────
test("extractHtml: strips ```html fence", () => {
  const fenced = "```html\n<!DOCTYPE html><html><body>x</body></html>\n```";
  const out = extractHtml(fenced);
  assert.match(out, /^<!DOCTYPE/);
  assert.match(out, /<\/html>$/);
});

test("extractHtml: strips uppercase ```HTML fence", () => {
  const fenced = "```HTML\n<!DOCTYPE html><html><body>y</body></html>\n```";
  const out = extractHtml(fenced);
  assert.match(out, /^<!DOCTYPE/);
});

// ─── 2. DOCTYPE start (the spike F2 happy path) ─────────────────────
test("extractHtml: slices from DOCTYPE through </html>", () => {
  const raw = "preamble noise\n<!DOCTYPE html><html><body>hi</body></html>tail";
  const out = extractHtml(raw);
  assert.equal(out.startsWith("<!DOCTYPE"), true);
  assert.equal(out.endsWith("</html>"), true);
  assert.equal(/preamble/.test(out), false);
  assert.equal(/tail/.test(out), false);
});

test("extractHtml: returns from doctype to end if </html> missing (streaming)", () => {
  const raw = "noise <!DOCTYPE html><html><body>partial";
  const out = extractHtml(raw);
  assert.equal(out.startsWith("<!DOCTYPE"), true);
  // streaming branch keeps tail intact
  assert.equal(out.endsWith("partial"), true);
});

// ─── 3. <html> fallback (no doctype) ─────────────────────────────────
test("extractHtml: finds <html> when no doctype", () => {
  const raw = "noise <html><body>x</body></html>";
  const out = extractHtml(raw);
  assert.match(out, /^<html/);
  assert.match(out, /<\/html>$/);
});

// ─── 4. fallback wrap (totally unstructured input) ──────────────────
test("extractHtml: wraps non-HTML in scaffold with escaped pre", () => {
  const raw = "just plain text & <stuff>";
  const out = extractHtml(raw);
  assert.match(out, /<!DOCTYPE html>/i);
  assert.match(out, /<pre/);
  // 必须 escape & 与 < 防 XSS
  assert.match(out, /&amp;/);
  assert.match(out, /&lt;stuff&gt;/);
});

test("extractHtml: empty input → empty string", () => {
  assert.equal(extractHtml(""), "");
});

test("extractHtml: leading-< trusted as root", () => {
  const raw = "<section>foo</section>";
  const out = extractHtml(raw);
  // 不含 doctype 不含 </html> 不含 markdown fence, 走第 4 分支:
  // 起手 < 直接信任
  assert.equal(out, raw);
});

// ─── previewHtml: streaming 兜底闭合 ─────────────────────────────────
test("previewHtml: appends </body></html> when missing", () => {
  const partial = "<!DOCTYPE html><html><body>not-yet-closed";
  const out = previewHtml(partial);
  assert.match(out, /<\/html>\s*$/);
});

test("previewHtml: leaves complete HTML alone", () => {
  const complete = "<!DOCTYPE html><html><body>done</body></html>";
  const out = previewHtml(complete);
  assert.equal(out, complete);
});
