#!/usr/bin/env node
// =====================================================================
// scripts/sync-from-ref.mjs —— 上游薄壳同步器
// ---------------------------------------------------------------------
// 协议: .trellis/spec/guides/upstream-sync.md
// 决策: PRD Q-MVP-SYNC（最简口子，cp + attribution header，不做 codemod）
//
// 选用 .mjs 而非 .ts 的理由：
//   1. 零 runtime 依赖（与 quality-guidelines "禁止 tsx" 红线一致）
//   2. 与 spike.mjs 风格一脉相承
//   3. 同步脚本本身就是简单 cp，无需类型系统
// 实现细节 vs 契约：spec / prd 中的 "scripts/sync-from-ref.ts" 名字是规约，
// 落盘扩展名是实现细节。
// =====================================================================

import { execSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ─── path constants ──────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const REF = join(ROOT, "ref/html-anything");
const SRC = join(ROOT, "src");

// ─── preflight ───────────────────────────────────────────────────────
if (!existsSync(REF)) {
  console.error(`[sync] ref/ not found at ${REF}`);
  console.error(`[sync] expected upstream checkout: ref/html-anything/`);
  process.exit(1);
}

// 上游 commit SHA —— attribution header 的可追溯性根
const sha = execSync("git rev-parse HEAD", { cwd: REF, encoding: "utf8" }).trim();
const shortSha = sha.slice(0, 7);

// ─── replaceExact: 断言型字符串替换 ──────────────────────────────────
// `.replace(needle, repl)` 找不到 needle 时**静默替换 0 次**——上游一改字符串
// 同步层就悄悄退化成"未打补丁"状态。本封装强制抛错,让 sync 在 CI / 手动
// 触发时第一时间显形,不让 silent drift 进 main。
function replaceExact(src, needle, repl, label) {
  const idx = src.indexOf(needle);
  if (idx === -1) {
    console.error(`[sync] FATAL: ${label} — needle not found in upstream source.`);
    console.error(`[sync] expected to match:\n  ${needle.replace(/\n/g, "\n  ")}`);
    console.error(`[sync] upstream may have renamed/reformatted; revisit sync-from-ref.mjs.`);
    process.exit(1);
  }
  // 二次出现也是问题 (期望唯一锚点,多个会让"修哪个"变模糊)
  if (src.indexOf(needle, idx + 1) !== -1) {
    console.error(`[sync] FATAL: ${label} — needle matched more than once; ambiguous patch site.`);
    process.exit(1);
  }
  return src.slice(0, idx) + repl + src.slice(idx + needle.length);
}

// ─── attribution header builder ──────────────────────────────────────
// 唯一权威模板见 .trellis/spec/guides/upstream-sync.md §2
// 多附 `// @ts-nocheck` 一行: 上游同步层不参与本项目 strict 类型检查,
// 与 ESLint 同源逻辑 (上游代码风格归上游负责)。它不改业务逻辑、不影响
// esbuild bundle、不违反"禁止 codemod"——只是文件级 type-check 开关。
function header(upstreamPath, modifications) {
  const mods = modifications.length
    ? modifications.map((m) => `//   - ${m}`).join("\n")
    : "//   (none)";
  return [
    "// =====================================================================",
    `// Source: ref/html-anything/${upstreamPath}`,
    `// Upstream commit: ${shortSha}`,
    `// License: Apache-2.0  (see ref/html-anything/LICENSE)`,
    "// =====================================================================",
    `// Local modifications (mark with \`// [a2h]\` inline comments):`,
    mods,
    "// =====================================================================",
    "// @ts-nocheck",
    "",
  ].join("\n");
}

// ─── sync targets ────────────────────────────────────────────────────
// 严格白名单，详见 spec/guides/upstream-sync.md §1
const SKILLS_SRC = join(REF, "next/src/lib/templates/skills");
const SKILLS_DST = join(SRC, "templates/skills");

const SHARED_SRC = join(REF, "next/src/lib/templates/shared.ts");
const SHARED_DST = join(SRC, "templates/shared.ts");

const LOADER_SRC = join(REF, "next/src/lib/templates/loader.ts");
const LOADER_DST = join(SRC, "templates/loader.ts");

const EXTRACT_SRC = join(REF, "next/src/lib/extract-html.ts");
const EXTRACT_DST = join(SRC, "extract-html.ts");

// PR2 新增：agent 检测 + argv 构造层（仅 claude 路径需要它们的纯函数）
// invoke.ts 上游是 ReadableStream + 多 agent 多协议派发，对 MVP 严重过度，
// 不同步——src/agents/claude.ts 自写最简 spawn 替代。
const DETECT_SRC = join(REF, "next/src/lib/agents/detect.ts");
const DETECT_DST = join(SRC, "agents/detect.ts");

const ARGV_SRC = join(REF, "next/src/lib/agents/argv.ts");
const ARGV_DST = join(SRC, "agents/argv.ts");

// 运行时 skills 目录：与 dist/cli.js 同级（quality-guidelines.md §Skills）
// loader.ts 用 fileURLToPath(import.meta.url) 解析 SKILLS_DIR——bundle 后
// import.meta.url 落在 dist/cli.js，故 skills 必须 mirror 到 dist/skills/。
const DIST_SKILLS_DST = join(ROOT, "dist/skills");

// ─── ensure parent dirs exist ────────────────────────────────────────
mkdirSync(join(SRC, "templates"), { recursive: true });
mkdirSync(join(SRC, "agents"), { recursive: true });
mkdirSync(join(ROOT, "dist"), { recursive: true });

// ─── 1. skills tree (零修改整树 cp) ──────────────────────────────────
rmSync(SKILLS_DST, { recursive: true, force: true });
cpSync(SKILLS_SRC, SKILLS_DST, { recursive: true });
const skillCount = readdirSync(SKILLS_DST, { withFileTypes: true }).filter((d) =>
  d.isDirectory(),
).length;

// 1b. mirror to dist/skills/——bundle 后的 cli.js 在运行时按 module-relative
// 路径读 skills，必须与 dist/cli.js 同级。详见 quality-guidelines.md §Skills。
rmSync(DIST_SKILLS_DST, { recursive: true, force: true });
cpSync(SKILLS_SRC, DIST_SKILLS_DST, { recursive: true });

// ─── 2. shared.ts (header only, 零逻辑修改) ─────────────────────────
{
  const raw = readFileSync(SHARED_SRC, "utf8");
  writeFileSync(SHARED_DST, header("next/src/lib/templates/shared.ts", []) + raw);
}

// ─── 3. loader.ts (header + SKILLS_DIR 重定位 ≤ 5 行) ───────────────
// 上游用 process.cwd() 起点（webapp 工作区根）；
// 同步进 src/templates/ 后必须改为 module-relative URL，否则任何调用方
// cwd 不在仓库根的场景都会找不到 skills。
{
  let raw = readFileSync(LOADER_SRC, "utf8");

  // [a2h-modify] 1: 在 import path 后追加 fileURLToPath import
  raw = replaceExact(
    raw,
    `import path from "node:path";`,
    `import path from "node:path";\nimport { fileURLToPath } from "node:url"; // [a2h]`,
    "loader.ts: inject fileURLToPath import",
  );

  // [a2h-modify] 2: 将 SKILLS_DIR 由 cwd-relative 改为 module-relative
  raw = replaceExact(
    raw,
    `const SKILLS_DIR = path.join(process.cwd(), "src/lib/templates/skills");`,
    `// [a2h] 重定位至同步进来的 src/templates/skills/，与上游用 process.cwd() 不同\nconst SKILLS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "skills");`,
    "loader.ts: relocate SKILLS_DIR base",
  );

  writeFileSync(
    LOADER_DST,
    header(
      "next/src/lib/templates/loader.ts",
      ["Relocate SKILLS_DIR base from process.cwd() to module-relative URL"],
    ) + raw,
  );
}

// ─── 4. extract-html.ts (header only, 零逻辑修改) ───────────────────
{
  const raw = readFileSync(EXTRACT_SRC, "utf8");
  writeFileSync(EXTRACT_DST, header("next/src/lib/extract-html.ts", []) + raw);
}

// ─── 5. agents/detect.ts (header only, 零逻辑修改) ──────────────────
// PR2 引入：claude 的 PATH 检测（resolveOnPath / AGENTS / DEFAULT_MODEL）。
// 不同步 invoke.ts——多 agent 多协议派发对 MVP 过度，由 src/agents/claude.ts
// 自写最简 spawn 替代。
{
  const raw = readFileSync(DETECT_SRC, "utf8");
  writeFileSync(DETECT_DST, header("next/src/lib/agents/detect.ts", []) + raw);
}

// ─── 6. agents/argv.ts (header only, 零逻辑修改) ────────────────────
// PR2 引入：claude argv 构造（buildArgv / makeParser / parseLine）的纯函数。
// MVP 仅用 buildArgv("claude", ...) 一支；其它 agent 分支随上游进 src/ 但
// 不被 callClaude 调到。
{
  const raw = readFileSync(ARGV_SRC, "utf8");
  writeFileSync(ARGV_DST, header("next/src/lib/agents/argv.ts", []) + raw);
}

// ─── done ────────────────────────────────────────────────────────────
console.log(`Synced ${skillCount} skills + 5 ts files (commit ${shortSha})`);
