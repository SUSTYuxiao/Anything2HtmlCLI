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
// 协议来源:
//   - .trellis/spec/guides/cli-design.md §3 I/O 契约 (input - 哨兵 / -o 文件)
//   - .trellis/spec/backend/error-handling.md (E_USAGE / E_SKILL_NOT_FOUND)
//   - PRD Q-MVP-IO B (位置参数 + stdin 哨兵 + stdout/-o)
//   - PRD Q-MVP-7 (--max-budget-usd 透传)
//   - PRD Q-CP-1 (--agent flag + A2H_AGENT env, 无 fallback)
// =====================================================================

import { readFileSync, writeFileSync } from "node:fs";
import { loadSkill } from "../templates/loader.js";
import { assemblePrompt } from "../templates/shared.js";
import { invokeAgent, type AgentId, type InvokeOpts } from "../agents/invoke.js";
import { A2hError } from "../errors.js";
import { log } from "../logger.js";

// ─── 支持的 agent 白名单 (与 InvokeOpts.AgentId 双源对齐) ─────────────
// 任何越过此白名单的 id (含 codex/cursor-agent/...) 都该报 E_USAGE 让调用
// 方决定, 不做 fallback (per Q-CP-1 "无自动 fallback").
const SUPPORTED_AGENTS = new Set<AgentId>(["claude", "qoder"]);

function isAgentId(s: string): s is AgentId {
  return SUPPORTED_AGENTS.has(s as AgentId);
}

// ─── argv 解析: 仅本命令需要的最小子集 (不引 commander/yargs) ────────
type RenderArgs = {
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

function parseRenderArgs(rest: readonly string[]): RenderArgs {
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
      "Example: a2h render input.md --skill article-magazine",
    );
  }
  if (!skill) {
    throw new A2hError("E_USAGE", "Missing --skill <id>", undefined, "Run: a2h skills");
  }

  const agent = resolveAgent(agentFlag);
  const args: RenderArgs = { input, skill, agent, noBare };
  if (out !== undefined) args.out = out;
  if (budget !== undefined) args.budget = budget;
  return args;
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

// ─── public: CLI 入口 ────────────────────────────────────────────────
export async function runRender(rest: readonly string[]): Promise<void> {
  const args = parseRenderArgs(rest);

  log.info(`skill=${args.skill} agent=${args.agent}`);
  const t0 = Date.now();
  const inputText = readInput(args.input);

  const coreOpts: RenderCoreOpts = {
    input: inputText,
    skillId: args.skill,
    agentId: args.agent,
    noBare: args.noBare,
    // 心跳 progress (PRD Q-CP-2/3): 5s 一个点, 仅 TTY (logger 内判断).
    // 非 TTY / --quiet → progressTick 静默, 与 onProgress 在 invoke 里
    // setInterval 不冲突 (空 callback 无副作用).
    onProgress: () => log.progressTick(),
  };
  if (args.budget !== undefined) coreOpts.budget = args.budget;

  const html = await renderToHtml(coreOpts);

  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  log.done(`done in ${secs}s, wrote ${html.length}B`);

  if (args.out) {
    writeFileSync(args.out, html);
  } else {
    // 不加换行——下游 pipe 可能对尾换行敏感 (spike.mjs 哲学)
    process.stdout.write(html);
  }
}
