// =====================================================================
// src/commands/render.ts —— a2h render 业务逻辑
// ---------------------------------------------------------------------
// WHY: 这是 MVP 的核心路径——把"输入文本 + skill id"经 prompt 装配 +
//      调 agent → 提取 HTML 的端到端流程具象化。spike.mjs 的 100 行
//      Node 脚本在此被 TS 化为可测、可注入、可演化的命令实现。
//
// PR3 改动:
//   1. callClaude → invokeAgent (共享抽象, qoder/claude 同入口);
//   2. 加 --agent <id> flag + A2H_AGENT env override (per Q-CP-1);
//   3. progress 由"流式 chars 计数"改为"5s 时间心跳" (per Q-CP-2/3).
//
// PR4 (render-defaults-and-link) 改动:
//   1. --skill 缺省 = "article-magazine" (per Q-RD-3);
//   2. -o 缺省按 "输入类型 + stdout 是否 TTY" 分场景 (per Q-RD-4 决策 B);
//   3. 新增 -o - 哨兵: 显式要 stdout (per Q-RD-2);
//   4. isTTY 走 DI 注入, 测试可 mock 切场景.
//
// 协议来源:
//   - .trellis/spec/guides/cli-design.md §3 I/O 契约 (input - 哨兵 / -o 文件)
//   - .trellis/spec/backend/error-handling.md (E_USAGE / E_SKILL_NOT_FOUND)
//   - PRD Q-MVP-IO B (位置参数 + stdin 哨兵 + stdout/-o)
//   - PRD Q-MVP-7 (--max-budget-usd 透传)
//   - PRD Q-CP-1 (--agent flag + A2H_AGENT env, 无 fallback)
//   - PRD render-defaults-and-link (默认 skill + -o TTY 检测分场景)
// =====================================================================

import { readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { loadSkill } from "../templates/loader.js";
import { assemblePrompt } from "../templates/shared.js";
import { invokeAgent, type AgentId, type InvokeOpts } from "../agents/invoke.js";
import { A2hError } from "../errors.js";
import { log } from "../logger.js";

// ─── 默认 skill (per PRD Q-RD-3) ─────────────────────────────────────
// 缺省 --skill 时使用 article-magazine; 不绕过 E_SKILL_NOT_FOUND——若用户
// 显式传 --skill X 且 X 不存在仍然报错, 默认值仅省略键入.
const DEFAULT_SKILL = "article-magazine";

// ─── 支持的 agent 白名单 (与 InvokeOpts.AgentId 双源对齐) ─────────────
// 任何越过此白名单的 id (含 codex/cursor-agent/...) 都该报 E_USAGE 让调用
// 方决定, 不做 fallback (per Q-CP-1 "无自动 fallback").
const SUPPORTED_AGENTS = new Set<AgentId>(["claude", "qoder"]);

function isAgentId(s: string): s is AgentId {
  return SUPPORTED_AGENTS.has(s as AgentId);
}

// ─── argv 解析: 仅本命令需要的最小子集 (不引 commander/yargs) ────────
export type RenderArgs = {
  input: string; // 文件路径或 "-" 哨兵
  skill: string;
  agent: AgentId;
  out?: string;
  budget?: number;
  noBare: boolean;
};

function resolveAgent(flagValue: string | undefined): AgentId {
  // 优先级: --agent flag > A2H_AGENT env > "claude" 默认
  // 与 PRD Q-CP-1 决策对齐: env override 仅在 flag 未传时生效.
  const candidate = flagValue ?? process.env["A2H_AGENT"] ?? "claude";
  if (!isAgentId(candidate)) {
    throw new A2hError(
      "E_USAGE",
      `Unknown agent: ${candidate}`,
      { agent: candidate },
      "Supported: claude | qoder",
    );
  }
  return candidate;
}

export function parseRenderArgs(rest: readonly string[]): RenderArgs {
  let input: string | undefined;
  let skill: string | undefined;
  let agentFlag: string | undefined;
  let out: string | undefined;
  let budget: number | undefined;
  let noBare = false;

  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--skill") {
      skill = rest[++i];
    } else if (a === "--agent") {
      agentFlag = rest[++i];
    } else if (a === "-o" || a === "--out") {
      out = rest[++i];
    } else if (a === "--max-budget-usd") {
      const v = rest[++i];
      const n = Number(v);
      if (!Number.isFinite(n)) {
        throw new A2hError("E_USAGE", `--max-budget-usd expects a number, got: ${String(v)}`);
      }
      budget = n;
    } else if (a === "--no-bare") {
      noBare = true;
    } else if (a === "--bare") {
      noBare = false;
    } else if (a === "--quiet" || a === "-q" || a === "--verbose" || a === "-v" || a === "--json-errors") {
      // 全局 flag 已在 cli.ts 里处理过, 此处放过
    } else if (a !== "-" && a?.startsWith("-")) {
      // 注意: 单独的 "-" 是 stdin 哨兵 (PRD Q-MVP-IO B), 不是 flag
      throw new A2hError("E_USAGE", `Unknown flag: ${a}`, undefined, "Run: a2h render --help");
    } else if (input === undefined) {
      input = a;
    } else {
      throw new A2hError("E_USAGE", `Unexpected positional argument: ${a}`);
    }
  }

  if (!input) {
    throw new A2hError(
      "E_USAGE",
      "Missing input. Pass a file path or '-' for stdin.",
      undefined,
      "Example: a2h render input.md",
    );
  }

  // --skill 缺省 → 默认 article-magazine (PRD Q-RD-3)
  const resolvedSkill = skill ?? DEFAULT_SKILL;

  const agent = resolveAgent(agentFlag);
  const args: RenderArgs = { input, skill: resolvedSkill, agent, noBare };
  if (out !== undefined) args.out = out;
  if (budget !== undefined) args.budget = budget;
  return args;
}

// ─── 输出目标决策 (PRD Q-RD-4 决策 B: TTY 检测分场景) ────────────────
// 单点优先级链, 纯函数; 单元测试 mock isTTY 即可覆盖全场景.
//
// 优先级:
//   1. 显式 -o "-"          → stdout (哨兵)
//   2. 显式 -o <file>       → 写文件
//   3. stdin 输入 ("-")     → stdout (无原文件可推; 永远 stdout)
//   4. 文件输入 + isTTY     → 写 <input-stem>.html (与输入同目录)
//   5. 文件输入 + 非 TTY    → stdout (保 Unix 管道契约)
export type OutputTarget =
  | { readonly kind: "stdout" }
  | { readonly kind: "file"; readonly path: string };

export function inferOutPath(inputFilePath: string): string {
  const dir = path.dirname(inputFilePath);
  const stem = path.basename(inputFilePath, path.extname(inputFilePath));
  return path.join(dir, `${stem}.html`);
}

export function decideOutputTarget(
  input: string,
  out: string | undefined,
  isTTY: boolean,
): OutputTarget {
  // 1-2. 显式 -o (含 "-" 哨兵) — 最高优先级
  if (out === "-") return { kind: "stdout" };
  if (out !== undefined) return { kind: "file", path: out };
  // 3. stdin 输入 — 永远 stdout
  if (input === "-") return { kind: "stdout" };
  // 4-5. 文件输入 — TTY 检测分支
  if (isTTY) return { kind: "file", path: inferOutPath(input) };
  return { kind: "stdout" };
}

// ─── 输入读取: 文件路径 / "-" stdin ──────────────────────────────────
function readInput(input: string): string {
  if (input === "-") {
    // /dev/stdin via fd 0 — 同步读, 与 spike.mjs 风格一致.
    try {
      return readFileSync(0, "utf8");
    } catch (err) {
      throw new A2hError(
        "E_USAGE",
        `Failed to read stdin: ${(err as Error).message}`,
      );
    }
  }
  try {
    return readFileSync(input, "utf8");
  } catch (err) {
    const errno = err as NodeJS.ErrnoException;
    if (errno.code === "ENOENT") {
      throw new A2hError(
        "E_USAGE",
        `Input file not found: ${input}`,
        { input },
        "Pass a valid file path or '-' for stdin.",
      );
    }
    throw err;
  }
}

// ─── core: 装配 prompt → invokeAgent → 返回 HTML ─────────────────────
// 抽出可注入测的最小核, 不碰 fs / process.stdout / log.
export type RenderCoreOpts = {
  input: string;
  skillId: string;
  agentId?: AgentId;
  budget?: number;
  noBare?: boolean;
  /** 测试注入: 替换 invokeAgent 实现; 与 commands 解耦. */
  callAgent?: (agentId: AgentId, opts: InvokeOpts) => Promise<string>;
  onProgress?: () => void;
};

export async function renderToHtml(opts: RenderCoreOpts): Promise<string> {
  const skill = loadSkill(opts.skillId);
  if (!skill) {
    throw new A2hError(
      "E_SKILL_NOT_FOUND",
      `Skill '${opts.skillId}' not found`,
      { skill: opts.skillId },
      "Run: a2h skills",
    );
  }
  const prompt = assemblePrompt({
    body: skill.body,
    content: opts.input,
    format: "markdown",
  });
  const callAgent = opts.callAgent ?? invokeAgent;
  const agentId: AgentId = opts.agentId ?? "claude";
  const invokeOpts: InvokeOpts = { prompt };
  if (opts.budget !== undefined) invokeOpts.budget = opts.budget;
  if (opts.noBare !== undefined) invokeOpts.noBare = opts.noBare;
  if (opts.onProgress !== undefined) invokeOpts.onProgress = opts.onProgress;
  return await callAgent(agentId, invokeOpts);
}

// ─── public: CLI 入口 (DI 形态: isTTY 注入 → 单元可 mock) ────────────
export type RunRenderDeps = {
  /** 注入口: 默认 () => process.stdout.isTTY === true. 测试 mock 切场景. */
  isTTY?: () => boolean;
};

export async function runRender(
  rest: readonly string[],
  deps: RunRenderDeps = {},
): Promise<void> {
  const args = parseRenderArgs(rest);
  const isTTY = deps.isTTY ?? (() => process.stdout.isTTY === true);

  log.info(`skill=${args.skill} agent=${args.agent}`);
  const t0 = Date.now();
  const inputText = readInput(args.input);

  const coreOpts: RenderCoreOpts = {
    input: inputText,
    skillId: args.skill,
    agentId: args.agent,
    noBare: args.noBare,
    // 心跳 progress (PRD Q-CP-2/3): 5s 一个点, 仅 TTY (logger 内判断).
    onProgress: () => log.progressTick(),
  };
  if (args.budget !== undefined) coreOpts.budget = args.budget;

  const html = await renderToHtml(coreOpts);

  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  log.done(`done in ${secs}s, wrote ${html.length}B`);

  // -o 决策 (优先级链见 decideOutputTarget): 单点判定, 无 if/else 散点.
  const target = decideOutputTarget(args.input, args.out, isTTY());
  if (target.kind === "file") {
    writeFileSync(target.path, html);
    log.info(`wrote ${target.path}`);
  } else {
    // 不加换行——下游 pipe 可能对尾换行敏感 (spike.mjs 哲学)
    process.stdout.write(html);
  }
}
