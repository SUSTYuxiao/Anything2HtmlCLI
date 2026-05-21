// =====================================================================
// src/commands/preview.ts —— a2h preview (PR2 最简版)
// ---------------------------------------------------------------------
// WHY: 与 render 共享渲染核 (renderToHtml), 区别仅在于"产物落到 tmp 文件
//      并提示路径", 不写 stdout. PR3 再加 spawn("open", ...) 自动打开浏览器.
//
// 协议来源:
//   - .trellis/spec/guides/cli-design.md §1 (preview 不写 stdout)
//   - PRD AC P0 (preview 子命令存在 + 生成临时 HTML)
// =====================================================================

import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderToHtml, type RenderCoreOpts } from "./render.js";
import { A2hError } from "../errors.js";
import { log } from "../logger.js";

// ─── argv 解析: 与 render 同形, 但少 -o 与 --json-errors ─────────────
type PreviewArgs = {
  input: string;
  skill: string;
  budget?: number;
  noBare: boolean;
};

function parsePreviewArgs(rest: readonly string[]): PreviewArgs {
  let input: string | undefined;
  let skill: string | undefined;
  let budget: number | undefined;
  let noBare = false;

  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--skill") {
      skill = rest[++i];
    } else if (a === "--max-budget-usd") {
      const v = rest[++i];
      const n = Number(v);
      if (!Number.isFinite(n)) {
        throw new A2hError("E_USAGE", `--max-budget-usd expects a number, got: ${String(v)}`);
      }
      budget = n;
    } else if (a === "--no-bare") {
      noBare = true;
    } else if (a === "--quiet" || a === "-q" || a === "--verbose" || a === "-v" || a === "--json-errors") {
      // 全局 flag 已在 cli.ts 处理
    } else if (a !== "-" && a?.startsWith("-")) {
      // 单独 "-" 是 stdin 哨兵, 非 flag
      throw new A2hError("E_USAGE", `Unknown flag: ${a}`, undefined, "Run: a2h preview --help");
    } else if (input === undefined) {
      input = a;
    } else {
      throw new A2hError("E_USAGE", `Unexpected positional argument: ${a}`);
    }
  }

  if (!input) throw new A2hError("E_USAGE", "Missing input. Pass a file path or '-' for stdin.");
  if (!skill) throw new A2hError("E_USAGE", "Missing --skill <id>", undefined, "Run: a2h skills");

  const args: PreviewArgs = { input, skill, noBare };
  if (budget !== undefined) args.budget = budget;
  return args;
}

function readInput(input: string): string {
  if (input === "-") return readFileSync(0, "utf8");
  try {
    return readFileSync(input, "utf8");
  } catch (err) {
    const errno = err as NodeJS.ErrnoException;
    if (errno.code === "ENOENT") {
      throw new A2hError("E_USAGE", `Input file not found: ${input}`, { input });
    }
    throw err;
  }
}

// ─── public ──────────────────────────────────────────────────────────
// PR2 边界: 仅写 tmp + 提示路径, 不调 open / xdg-open. PR3 再加.
export async function runPreview(rest: readonly string[]): Promise<void> {
  const args = parsePreviewArgs(rest);

  log.info(`skill=${args.skill} agent=claude (preview)`);
  const t0 = Date.now();
  const inputText = readInput(args.input);

  const coreOpts: RenderCoreOpts = {
    input: inputText,
    skillId: args.skill,
    noBare: args.noBare,
    onProgress: (n) => log.progress(`streaming… ${(n / 1024).toFixed(1)}k chars`),
  };
  if (args.budget !== undefined) coreOpts.budget = args.budget;

  const html = await renderToHtml(coreOpts);

  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const tmpPath = join(tmpdir(), `a2h-preview-${Date.now()}.html`);
  writeFileSync(tmpPath, html);

  log.done(`done in ${secs}s, wrote ${html.length}B`);
  // 路径提示走 stderr (info), 不污染 stdout. PR3 改为 spawn open/xdg-open.
  log.info(`preview: ${tmpPath}`);
}
