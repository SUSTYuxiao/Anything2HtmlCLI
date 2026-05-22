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

// ─── help texts (中文叙述 + 英文 identifier / flag / 路径 / 命令) ────
// 风格: 与 README / .trellis/spec/ 中文文档一致; 子命令面 / flag /
// 退出码常量名保持英文 (机器可读 + 与 SSoT error-handling.md 对齐).
const HELP_TOP = `a2h ${VERSION} — 把文本变成单文件 HTML，无需启服务器。

用法
  a2h <子命令> [参数] [选项]

子命令
  render <输入 | ->     用指定 skill 渲染输入文本为单文件 HTML
  skills [--json]       列出所有可用 skill 标识符

全局选项
  -q, --quiet           静默模式（stderr 不打 progress / info）
  -v, --verbose         详细模式（stderr 增加调试信息）
  -h, --help            打印帮助；也可用 a2h <子命令> --help 看子命令详情
      --version         打印版本号

示例
  a2h skills                          # 列出所有 skill
  a2h render in.md                    # 交互终端：默认 article-magazine + 写到 ./in.html
  cat in.md | a2h render -            # 管道：stdin 读入，stdout 输出
  a2h render in.md --json-errors > out.html
                                      # Agent 嵌入：失败时 stdout 出 JSON 错误对象

文档
  README、设计、路线图见仓库根目录 README.md / docs/
`;

const HELP_RENDER = `a2h render — 把输入文本渲染为单文件 HTML

用法
  a2h render <输入 | -> [选项]

参数
  <输入>                  文件路径；用 - 表示从 stdin 读取

选项 (Skill)
  --skill <id>            skill 标识符；缺省 article-magazine
                          用 a2h skills 查所有可用 id

选项 (Agent)
  --agent <id>            调用的 agent CLI（claude | qoder）；缺省 claude
                          环境变量 A2H_AGENT 可覆盖默认

选项 (输出)
  -o, --out <file>        输出文件路径；- 哨兵强制写 stdout
                          缺省按"输入类型 + stdout 是否 TTY"自动决定：
                            文件输入 + 交互终端 → 写 <input-stem>.html（与输入同目录）
                            文件输入 + pipe / 重定向 → 写 stdout（保管道契约）
                            stdin 输入（-）→ 写 stdout（永远）

选项 (成本)
  --max-budget-usd <n>    透传 claude --max-budget-usd（成本上限，美元）

选项 (错误协议)
  --json-errors           失败时在 stdout 写 JSON 错误对象（首字符 {），
                          便于 Agent 调用方靠首字符切判分支

选项 (Bare 模式)
  --no-bare               关闭 claude --bare（默认开启，极少需要关）

选项 (静默 / 帮助)
  -q, --quiet             静默 stderr progress / info（错误仍打）
  -h, --help              显示本帮助

示例
  # 交互终端（默认 skill + 自动写 ./in.html）：
  a2h render in.md

  # 显式 skill + 输出路径：
  a2h render article.md --skill article-magazine -o article.html

  # 强制 stdout（- 哨兵），便于 pipe：
  a2h render in.md -o - | grep '<title>'

  # Agent 嵌入（零落盘 + 结构化错误协议）：
  echo "$content" | a2h render - --skill blog-post --json-errors > out.html

  # 切换 agent：
  a2h render in.md --skill article-magazine --agent qoder -o out.html

退出码
  0   ok
  1   E_USAGE             命令行参数错
  10  E_SKILL_NOT_FOUND   --skill 不存在
  20  E_AGENT_UNAVAILABLE 本机无对应 agent CLI
  30  E_BUDGET_EXCEEDED   超过 --max-budget-usd
  40  E_OUTPUT_INVALID    LLM 输出非合规 HTML
  50  E_NETWORK           agent 网络故障

详见 README §Embedding from another Agent / Skill
`;

const HELP_SKILLS = `a2h skills — 列出可用 skill 标识符

用法
  a2h skills [--json]

选项
  --json                JSON 数组输出（便于 Agent 消费）
  -h, --help            显示本帮助

说明
  共 75 个 skill，覆盖 article / blog / card / deck / dashboard /
  data-report 等类别。完整列表参见 src/templates/skills/。

示例
  # 默认人类对齐表格：
  a2h skills

  # JSON + jq 取所有 id：
  a2h skills --json | jq '.[].id'

  # 按 category 过滤（例如所有 deck 类）：
  a2h skills --json | jq '.[] | select(.category == "deck")'
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
