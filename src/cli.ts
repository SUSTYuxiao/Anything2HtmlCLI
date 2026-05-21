// =====================================================================
// src/cli.ts —— 唯一 process.exit 出口 + argparse + 子命令路由
// 协议: .trellis/spec/guides/cli-design.md (子命令面 / flag / help)
//       .trellis/spec/backend/error-handling.md (退出码 / 双流分离)
//
// PR1 范围: 仅骨架 + 全局 flag + 子命令路由表。
// render / skills / preview 的业务逻辑由 PR2/PR3 实现; 此处占位为
// "not implemented" A2hError, 保证 cli 启动不崩、help 可打、未知子命令报错。
// =====================================================================

import { A2hError, ErrorCode, normalize, type ErrorCodeName } from "./errors.js";
import { configureLogger, log } from "./logger.js";

// ─── version (PR4 时改为从 package.json 注入) ────────────────────────
const VERSION = "0.1.0";

// ─── help texts ──────────────────────────────────────────────────────
const HELP_TOP = `a2h ${VERSION} — text → self-contained HTML, no server.

USAGE
  a2h <command> [args] [flags]

COMMANDS
  render <input | -> --skill <id> [-o <file>]
                       Render input to a self-contained HTML file.
  skills [--json]      List available skill identifiers.
  preview <input | -> --skill <id>
                       Render and open in the system browser.

GLOBAL FLAGS
  -q, --quiet          Suppress progress / info on stderr.
  -v, --verbose        Extra diagnostics on stderr.
  -h, --help           Show this help (or help for a subcommand).
      --version        Print version and upstream commit SHA.

EXAMPLES
  a2h skills --json
  a2h render article.md --skill article-magazine -o out.html
  echo "$content" | a2h render - --skill blog-post --json-errors > out.html

For per-command help, run: a2h <command> --help
`;

const HELP_RENDER = `a2h render — text → self-contained HTML

USAGE
  a2h render <input | -> --skill <id> [-o <file>] [flags]

DESCRIPTION
  Render input text to a self-contained HTML file using the given skill.

FLAGS
  --skill <id>           Skill identifier (required). Run \`a2h skills\` to list.
  -o, --out <file>       Output file path. Defaults to stdout.
  --max-budget-usd <n>   Forward to claude CLI as cost ceiling.
  --json-errors          Emit JSON error object to stdout on failure.
  --no-bare              Disable claude --bare (rarely needed).
  -q, --quiet            Suppress progress on stderr.
  -h, --help             Show this help.

EXAMPLES
  a2h render article.md --skill article-magazine -o article.html
  echo "$content" | a2h render - --skill blog-post --json-errors > out.html
`;

const HELP_SKILLS = `a2h skills — list available skill identifiers

USAGE
  a2h skills [--json] [flags]

DESCRIPTION
  List skill ids that \`render\` / \`preview\` accept.

FLAGS
  --json                 Output as JSON array (for agent consumption).
  -h, --help             Show this help.

EXAMPLES
  a2h skills
  a2h skills --json | jq '.[].id'
`;

const HELP_PREVIEW = `a2h preview — render and open in browser

USAGE
  a2h preview <input | -> --skill <id> [flags]

DESCRIPTION
  Render input to a temp HTML file and open it in the system browser.

FLAGS
  --skill <id>           Skill identifier (required).
  --max-budget-usd <n>   Forward to claude CLI as cost ceiling.
  -q, --quiet            Suppress progress on stderr.
  -h, --help             Show this help.

EXAMPLES
  a2h preview article.md --skill article-magazine
  echo "$content" | a2h preview - --skill blog-post
`;

// ─── argv helpers (手写 argparse, 不引 commander/yargs) ──────────────
function hasFlag(argv: readonly string[], ...names: string[]): boolean {
  return argv.some((a) => names.includes(a));
}

// ─── PR1 stub: 子命令暂未实现, 抛 A2hError 不崩 stack ────────────────
function notImplemented(name: string): never {
  throw new A2hError(
    "E_USAGE",
    `${name}: not implemented in PR1`,
    { subcommand: name, pr: 1 },
    "PR2 will implement this subcommand. See .trellis/tasks/05-21-mvp-cli-extract-and-ship/prd.md",
  );
}

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

  // 子命令级 --help 永远先于业务执行 (即使业务未实现)
  const wantsHelp = hasFlag(rest, "--help", "-h");

  switch (sub) {
    case "render":
      if (wantsHelp) {
        process.stderr.write(HELP_RENDER);
        return;
      }
      notImplemented("render");
      break;

    case "skills":
      if (wantsHelp) {
        process.stderr.write(HELP_SKILLS);
        return;
      }
      notImplemented("skills");
      break;

    case "preview":
      if (wantsHelp) {
        process.stderr.write(HELP_PREVIEW);
        return;
      }
      notImplemented("preview");
      break;

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
