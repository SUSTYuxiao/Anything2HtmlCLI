#!/usr/bin/env node
// =====================================================================
// Spike: thin-shell end-to-end validation
// ---------------------------------------------------------------------
// Purpose: prove that "load prompt skill → call local `claude` CLI →
// extract <html>" works without any Next.js / React / HTTP server.
//
// Run:    node spike.mjs                       # default skill: article-magazine
//         node spike.mjs blog-post             # other skill
//         A2H_SPIKE_INPUT=/path/to/in.md node spike.mjs
//
// Outputs:
//   ./out.html             — final extracted HTML
//   ./raw-stdout.txt       — raw `claude -p` stdout (debug)
//   ./report.json          — structured spike report (timings, sizes, status)
// =====================================================================

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "../../../../..");
const REF = join(PROJECT_ROOT, "ref/html-anything");
const SKILLS_DIR = join(REF, "next/src/lib/templates/skills");
const OUT_DIR = __dirname;

// ─── Inline copy of upstream's shared directives ──────────────────────
// Source: ref/html-anything/next/src/lib/templates/shared.ts
const SHARED_DESIGN_DIRECTIVES = `
你是世界级的视觉设计师 + 资深前端工程师。请输出一份**自包含的单文件 HTML**，要求：

【内容驱动数量 — 最高优先级, 覆盖模板里的任何数字】
- 模板只定义"可用版面 / 风格 / 配色 / 字体 / 组件库", **不定义** slide / 帧 / 卡片 / section 的数量。
- 输出的 slide / frame / card / section 数量**完全由【用户内容】的实际长度和信息结构决定**。

【硬性技术要求】
- **禁止使用 Write / Edit / MultiEdit / Bash / Create / 任何文件系统工具**。不要把 HTML 写到任何 \`.html\` 文件里。前端直接捕获你的 stdout 文本, 文件落盘由前端负责。
- 直接把完整的 HTML 文档作为助手回复的正文流式输出。不要先说"我来生成"、"已输出至 …"之类的话。
- 文档以 \`<!DOCTYPE html>\` 开头, 末尾以 \`</html>\` 结束。
- 在 \`<head>\` 中通过 CDN 引入 Tailwind v3 Play (https://cdn.tailwindcss.com) 与所需的 Google Fonts。
- 输出**纯 HTML**, 不要用 markdown 代码围栏包裹, 不要任何解释性文字。第一个字符必须是 \`<\`。

【设计准则 — 世界级标准】
- 排版: 中文优先 \`Noto Sans SC\` / \`Noto Serif SC\`, 英文 \`Inter\` / \`Manrope\` 风格。
- 色彩: 使用 1 个主色 + 2 个中性色 + 至多 1 个强调色; 大胆留白; 不使用纯黑纯白。
- 网格: 8 px 基线; 段落最大宽度 65 ch; 标题与正文有清晰的层级。
- 微观细节: 圆角统一 (rounded-xl/2xl), 投影柔和 (shadow-sm/lg)。

【内容真实性】
- **必须使用用户提供的真实数据**, 不要编造、不要 lorem ipsum、不要 "Your text here"。
- 中文与英文混排时, 中英文之间留半角空格 (盘古之白)。
`;

// ─── Inline port of upstream's extractHtml ────────────────────────────
// Source: ref/html-anything/next/src/lib/extract-html.ts
function extractHtml(streamed) {
  if (!streamed) return "";
  const fence = streamed.match(/```(?:html|HTML)?\s*([\s\S]*?)```/);
  if (fence) {
    const inner = fence[1].trim();
    if (inner.startsWith("<")) return inner;
  }
  const doctypeStart = streamed.search(/<!DOCTYPE\s+html/i);
  if (doctypeStart !== -1) {
    const closeIdx = streamed.lastIndexOf("</html>");
    if (closeIdx !== -1) return streamed.slice(doctypeStart, closeIdx + 7);
    return streamed.slice(doctypeStart);
  }
  const htmlStart = streamed.search(/<html[\s>]/i);
  if (htmlStart !== -1) {
    const closeIdx = streamed.lastIndexOf("</html>");
    if (closeIdx !== -1) return streamed.slice(htmlStart, closeIdx + 7);
    return streamed.slice(htmlStart);
  }
  if (streamed.trimStart().startsWith("<")) return streamed;
  return "";
}

// ─── Frontmatter stripper (minimal port of shared.ts parser) ──────────
function stripFrontmatter(raw) {
  const m = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?([\s\S]*)$/m.exec(raw);
  return m ? m[2].trim() : raw.trim();
}

// ─── Main ─────────────────────────────────────────────────────────────
const skillId = process.argv[2] || "article-magazine";
const skillDir = join(SKILLS_DIR, skillId);
if (!existsSync(skillDir)) {
  console.error(`[spike] skill not found: ${skillDir}`);
  process.exit(2);
}

const skillRaw = readFileSync(join(skillDir, "SKILL.md"), "utf8");
const skillBody = stripFrontmatter(skillRaw);

// Use a small custom input to keep token cost low; not example.md (which is verbose).
const SAMPLE_INPUT = `# 为何 Agent 时代 HTML 强于 Markdown

Markdown 是写给人看的草稿格式——纯文本、易编辑、适合源码。
但人类最终消费的不是源码, 是渲染后的视觉。

## 三个论点

1. Agent 时代的输出受众是渲染层, Markdown 多了一层无谓的转换。
2. HTML 自带样式表达力, 不必依赖外部 CSS 框架的"约定俗成"。
3. 单文件 HTML 可被任意浏览器、IM、邮件客户端直接打开, 传输成本最低。

## 结论

**草稿用 Markdown, 成品用 HTML——让 Agent 跨过最后一公里。**
`;

const userInput = process.env.A2H_SPIKE_INPUT
  ? readFileSync(process.env.A2H_SPIKE_INPUT, "utf8")
  : SAMPLE_INPUT;

const prompt = `${SHARED_DESIGN_DIRECTIVES}
${skillBody}

【输入格式】: markdown
【用户内容】:
${userInput}
`;

const promptBytes = Buffer.byteLength(prompt, "utf8");
console.log(`[spike] skill=${skillId} prompt=${promptBytes}B input=${userInput.length}chars`);

// Spawn claude. Use --bare for determinism + --output-format text for simplest path.
// --max-budget-usd caps spike cost as a hard guard.
const argv = [
  "-p",
  "--bare",
  "--output-format", "text",
  "--max-budget-usd", "0.50",
];
console.log(`[spike] spawn: claude ${argv.join(" ")}`);

const t0 = Date.now();
const child = spawn("claude", argv, { stdio: ["pipe", "pipe", "pipe"] });

let stdout = "";
let stderr = "";
child.stdout.on("data", (c) => (stdout += c));
child.stderr.on("data", (c) => (stderr += c));

child.stdin.write(prompt);
child.stdin.end();

child.on("error", (err) => {
  console.error(`[spike] spawn error: ${err.message}`);
  process.exit(3);
});

child.on("close", (code) => {
  const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
  console.log(`[spike] claude exited code=${code} in ${elapsed}s`);
  console.log(`[spike] stdout=${stdout.length}B stderr=${stderr.length}B`);

  writeFileSync(join(OUT_DIR, "raw-stdout.txt"), stdout);
  if (stderr) writeFileSync(join(OUT_DIR, "raw-stderr.txt"), stderr);

  const html = extractHtml(stdout);
  const hasDoctype = /<!DOCTYPE\s+html/i.test(html);
  const hasHtmlClose = /<\/html>/i.test(html);

  if (html) {
    writeFileSync(join(OUT_DIR, "out.html"), html);
    console.log(`[spike] wrote out.html (${html.length}B, doctype=${hasDoctype}, </html>=${hasHtmlClose})`);
  } else {
    console.log(`[spike] extractHtml returned empty — see raw-stdout.txt`);
  }

  const report = {
    timestamp: new Date().toISOString(),
    skillId,
    promptBytes,
    inputChars: userInput.length,
    elapsedSeconds: Number(elapsed),
    exitCode: code,
    stdoutBytes: stdout.length,
    stderrBytes: stderr.length,
    htmlBytes: html.length,
    hasDoctype,
    hasHtmlClose,
    success: code === 0 && html.length > 0 && hasDoctype && hasHtmlClose,
  };
  writeFileSync(join(OUT_DIR, "report.json"), JSON.stringify(report, null, 2));
  console.log(`[spike] report: ${JSON.stringify(report, null, 2)}`);
  process.exit(report.success ? 0 : 1);
});
