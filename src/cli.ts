// =====================================================================
// src/cli.ts —— 唯一 process.exit 出口 + argparse + 子命令路由
// 协议: .trellis/spec/guides/cli-design.md (子命令面 / flag / help)
//       .trellis/spec/backend/error-handling.md (退出码 / 双流分离)
//
// PR2: render / skills 业务逻辑接入 src/commands/*; 本文件仅
//      保留 argparse + dispatcher + 唯一 catch-and-exit. 业务命令一律
//      抛 A2hError, 由顶层 normalize → 退出码映射.
//
// PR3 (cli-polish): 砍 preview 子命令 (CLI 不承担浏览器交互);
//                   加 --agent flag (claude / qoder).
// =====================================================================

import { A2hError, ErrorCode, normalize, type ErrorCodeName } from "./errors.js";
import { configureLogger, log } from "./logger.js";
import { runRender } from "./commands/render.js";
import { runSkills } from "./commands/skills.js";

// ─── version (PR4 时改为从 package.json 注入) ────────────────────────
const VERSION = "0.1.0";

// ─── help texts ──────────────────────────────────────────────────────
const HELP_TOP = `a2h ${VERSION} — text → self-contained HTML, no server.

USAGE
  a2h <command> [args] [flags]

COMMANDS
  render <input | -> [--skill <id>] [-o <file>]
                       Render input to a self-contained HTML file.
                       --skill defaults to "article-magazine".
                       -o defaults: file input + TTY → <input-stem>.html;
                                    file input + pipe → stdout;
                                    stdin → stdout. Use "-o -" to force stdout.
  skills [--json]      List available skill identifiers.

GLOBAL FLAGS
  -q, --quiet          Suppress progress / info on stderr.
  -v, --verbose        Extra diagnostics on stderr.
  -h, --help           Show this help (or help for a subcommand).
      --version        Print version and upstream commit SHA.

EXAMPLES
  a2h skills --json
  a2h render in.md
  a2h render article.md --skill article-magazine -o out.html
  echo "$content" | a2h render - --skill blog-post --json-errors > out.html

For per-command help, run: a2h <command> --help
`;

const HELP_RENDER = `a2h render — text → self-contained HTML

USAGE
  a2h render <input | -> [--skill <id>] [-o <file>] [flags]

DESCRIPTION
  Render input text to a self-contained HTML file using the given skill.

FLAGS
  --skill <id>           Skill identifier. Defaults to "article-magazine".
                         Run \`a2h skills\` to list available ids.
  --agent <id>           Agent CLI to invoke (claude | qoder). Default: claude.
                         Env override: A2H_AGENT.
  -o, --out <file>       Output file path. Pass "-" to force stdout.
                         If omitted, output target is auto-decided:
                           file input + interactive TTY → <input-stem>.html
                                                          (same dir as input)
                           file input + pipe / redirect  → stdout
                           stdin input ("-")             → stdout (always)
  --max-budget-usd <n>   Forward to claude CLI as cost ceiling.
  --json-errors          Emit JSON error object to stdout on failure.
  --no-bare              Disable claude --bare (rarely needed).
  -q, --quiet            Suppress progress on stderr.
  -h, --help             Show this help.

EXAMPLES
  # Interactive (defaults: --skill article-magazine, -o ./in.html):
  a2h render in.md

  # Explicit skill + output path:
  a2h render article.md --skill article-magazine -o article.html

  # Force stdout even on a TTY (sentinel "-o -"):
  a2h render in.md -o - | grep '<title>'

  # Agent-pipe invocation (zero disk):
  echo "$content" | a2h render - --skill blog-post --json-errors > out.html

  # Switch agent:
  a2h render in.md --skill article-magazine --agent qoder -o out.html
`;

const HELP_SKILLS = `a2h skills — list available skill identifiers

USAGE
  a2h skills [--json] [flags]

DESCRIPTION
  List skill ids that \`render\` accepts.

FLAGS
  --json                 Output as JSON array (for agent consumption).
  -h, --help             Show this help.

EXAMPLES
  a2h skills
  a2h skills --json | jq '.[].id'
`;

// ─── argv helpers (手写 argparse, 不引 commander/yargs) ──────────────
function hasFlag(argv: readonly string[], ...names: string[]): boolean {
  return argv.some((a) => names.includes(a));
}

// ─── PR2 实装: notImplemented stub 已被 commands/* 替换. 顶层仅作 dispatcher.

// ─── 顶层 dispatcher ─────────────────────────────────────────────────
async function main(argv: readonly string[]): Promise<void> {
  // 全局 flag 必须先于子命令解析, 这样 --help / --version 在裸调用时也响应
  const quiet = hasFlag(argv, "--quiet", "-q");
  const verbose = hasFlag(argv, "--verbose", "-v");
  configureLogger({ quiet, verbose });

  // 裸 a2h / 顶层 --help
  if (argv.length === 0 || (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h"))) {
    process.stderr.write(HELP_TOP);
    return;
  }

  // --version
  if (argv[0] === "--version") {
    process.stdout.write(`a2h ${VERSION}\n`);
    return;
  }

  const sub = argv[0];
  const rest = argv.slice(1);

  // 子命令级 --help 永远先于业务执行
  const wantsHelp = hasFlag(rest, "--help", "-h");

  switch (sub) {
    case "render":
      if (wantsHelp) {
        process.stderr.write(HELP_RENDER);
        return;
      }
      await runRender(rest);
      return;

    case "skills":
      if (wantsHelp) {
        process.stderr.write(HELP_SKILLS);
        return;
      }
      await runSkills(rest);
      return;

    default:
      throw new A2hError(
        "E_USAGE",
        `Unknown command: ${String(sub)}`,
        { command: String(sub) },
        "Run: a2h --help",
      );
  }
}

// ─── 唯一 process.exit 出口 ──────────────────────────────────────────
// 协议: 内部抛 A2hError, cli.ts 收尸; commands/*.ts 不允许直接 process.exit
function formatHuman(e: A2hError): string {
  const hint = e.hint ? `\n   ${e.hint}` : "";
  return `${e.message}${hint}`;
}

main(process.argv.slice(2)).catch((err: unknown) => {
  const e = normalize(err);
  log.error(formatHuman(e));

  if (process.argv.includes("--json-errors")) {
    process.stdout.write(JSON.stringify(e.toErrorObject()) + "\n");
  }

  const codeName: ErrorCodeName = e.code;
  process.exit(ErrorCode[codeName]);
});
