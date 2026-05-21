// =====================================================================
// src/agents/invoke.ts —— 共享 invokeAgent(id, opts) 抽象层
// ---------------------------------------------------------------------
// WHY: PR2 时仅 claude 一个 agent, 实现散在 claude.ts; 加 qoder 时若再
//      抄一份 qoder.ts 即制造耦合点 (心跳 / spawn / extractHtml /
//      stdin 写入 4 处都得复制). 抽象 invokeAgent 让"加新 agent =
//      AGENT_CLASSIFIERS map 加一项 + argv builder 已就位"——其余共
//      享, 这与上游 invoke.ts 的"多协议派发"哲学相通, 但只取 stdin
//      协议 + 最简心跳, 不解析 stream-json (per Q-CP-3).
//
// 最高原则 (用户 2026-05-21): "做好 ref 项目的 cli 适配封装, 其他问题
//   丢给 ref 本身." → 失败兜底走 "关键字 / 启发式现状能用就先用",
//   stdout 整段当文本, 让 extractHtml 的 DOCTYPE 起手分支去切 (spike F1
//   已证 extractHtml 容忍 stream-json ndjson 文本).
//
// 协议来源:
//   - .trellis/spec/backend/error-handling.md (退出码契约)
//   - .trellis/spec/backend/quality-guidelines.md (DI Deps + HTML 验证)
//   - PRD Q-CP-1 / Q-CP-2 / Q-CP-3 / Q-CP-4 决策
//   - 上游 ref/html-anything/next/src/lib/agents/argv.ts (qoder/claude argv)
// =====================================================================

import { spawn as cpSpawn, type ChildProcess } from "node:child_process";
import { resolveOnPath, AGENTS, type AgentDef } from "./detect.js";
import { buildArgv } from "./argv.js";
import { extractHtml } from "../extract-html.js";
import { A2hError } from "../errors.js";
import { classifyAgentFailure } from "./errors.js";

// ─── public types ────────────────────────────────────────────────────
// 暂只支持 claude / qoder. 加新 agent: 这里加一项 + errors.ts map 加一项.
export type AgentId = "claude" | "qoder";

export type InvokeOpts = {
  /** Full prompt text written to agent stdin. */
  prompt: string;
  /** --max-budget-usd <n> (PRD Q-MVP-7). 仅 claude 有效, qoder 静默忽略. */
  budget?: number;
  /** --model <id> 透传; 缺省 = agent CLI 自身配置决定. */
  model?: string;
  /** Disable claude --bare (默认 false = 默认带 --bare). qoder 无此概念. */
  noBare?: boolean;
  /** Cancellation. */
  signal?: AbortSignal;
  /**
   * 心跳回调; invokeAgent 内部 setInterval 每 5 秒触发一次, 子进程关闭时
   * clearInterval. 调用方一般传 () => log.progressTick(). 不传 = 静默.
   */
  onProgress?: () => void;
};

// ─── DI: deps 注入口 (per quality-guidelines §DI) ────────────────────
type SpawnFn = (cmd: string, argv: readonly string[]) => ChildProcess;
export type InvokeDeps = {
  resolveBin?: (def: AgentDef) => string | null;
  spawn?: SpawnFn;
};

// ─── 心跳节奏 ────────────────────────────────────────────────────────
// per PRD: 每 5 秒打一个点 (TTY); 节奏交给 caller 的 onProgress 决定颗粒度,
// invoke.ts 只负责调度.
const HEARTBEAT_MS = 5000;

// ─── 找 AgentDef + 走 envOverride / PATH 查 bin ──────────────────────
function lookupAgentDef(id: AgentId): AgentDef {
  const def = AGENTS.find((a) => a.id === id);
  if (!def) {
    // SUPPORTED_IDS 已经在类型层卡死, 真到这里只可能是 caller 传了类型外的字符串
    throw new A2hError(
      "E_USAGE",
      `Unknown agent: ${id}`,
      { agent: id },
      "Supported: claude | qoder",
    );
  }
  return def;
}

function defaultResolveBin(def: AgentDef): string | null {
  // 优先 env override (与上游 detectAgents() 行为一致)
  const overrideKey = def.envOverride;
  if (overrideKey) {
    const overrideVal = process.env[overrideKey];
    if (overrideVal) return overrideVal;
  }
  // 再走 fallbackBins + 主 bin
  const candidates = [def.bin, ...(def.fallbackBins ?? [])];
  for (const c of candidates) {
    const p = resolveOnPath(c);
    if (p) return p;
  }
  return null;
}

// ─── 各 agent 的 argv 简化 (本项目 CLI 一次产出场景) ──────────────────
// claude: 用 text mode (spike F1), --bare 默认开 (spike F3); buildArgv("claude")
//   会返回 stream-json + verbose, 与 CLI 一次产出场景不匹配, 改简化版.
// qoder: 用上游 buildArgv("qoder", {model}) 默认 stream-json + --yolo;
//   stdout 是 ndjson 但本任务严禁解析, 整段当文本, 让 extractHtml 的
//   DOCTYPE 起手分支去切.
function buildAgentArgv(agentId: AgentId, opts: InvokeOpts): string[] {
  if (agentId === "claude") {
    // 简化版: -p + text mode + --bare (默认) + budget/model 透传
    const argv = ["-p", "--output-format", "text"];
    if (!opts.noBare) argv.push("--bare");
    if (typeof opts.budget === "number" && Number.isFinite(opts.budget)) {
      argv.push("--max-budget-usd", String(opts.budget));
    }
    if (opts.model) argv.push("--model", opts.model);
    return argv;
  }
  // qoder: 走上游 buildArgv 默认 (stream-json + --yolo); model 透传.
  // 不传 budget——qoder 协议里没有等价 flag (上游 argv.ts 也未定义).
  const argv = opts.model
    ? buildArgv("qoder", { model: opts.model })
    : buildArgv("qoder");
  return argv as string[];
}

// ─── HTML 输出验证 (per quality-guidelines §HTML 输出验证) ───────────
function validateHtml(html: string): void {
  const okStart = /^<!DOCTYPE\s+html/i.test(html);
  const okEnd = /<\/html>\s*$/i.test(html);
  if (!okStart || !okEnd) {
    throw new A2hError(
      "E_OUTPUT_INVALID",
      `Invalid HTML output (doctype=${okStart}, close=${okEnd})`,
      { doctype: okStart, htmlClose: okEnd, htmlBytes: html.length },
    );
  }
}

// ─── public: invokeAgent ─────────────────────────────────────────────
// 输入 prompt + opts → 输出 extractHtml + validateHtml 后的 HTML 字符串.
export async function invokeAgent(
  agentId: AgentId,
  opts: InvokeOpts,
  deps: InvokeDeps = {},
): Promise<string> {
  const def = lookupAgentDef(agentId);
  const resolveBin = deps.resolveBin ?? defaultResolveBin;
  const spawnImpl: SpawnFn = deps.spawn ?? cpSpawn;

  const binPath = resolveBin(def);
  if (!binPath) {
    throw new A2hError(
      "E_AGENT_UNAVAILABLE",
      `${agentId} CLI not found on PATH`,
      { agent: agentId, searched: "PATH + common npm/bun/asdf shim dirs" },
      agentId === "claude"
        ? "Install: https://docs.claude.com/claude-code or `npm i -g @anthropic-ai/claude-code`"
        : "Install qodercli; or set QODER_BIN to its absolute path.",
    );
  }

  const argv = buildAgentArgv(agentId, opts);
  const child = spawnImpl(binPath, argv);

  // ─── 心跳: 每 5s 触发一次 onProgress; close 时 clearInterval ──────
  // 节奏由 invoke.ts 内置, caller 只负责"打点动作". TTY/quiet 判断在
  // logger.progressTick 内做, invoke.ts 不关心.
  let heartbeat: NodeJS.Timeout | null = null;
  if (opts.onProgress) {
    heartbeat = setInterval(opts.onProgress, HEARTBEAT_MS);
  }
  const stopHeartbeat = (): void => {
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
  };

  let stdout = "";
  let stderr = "";

  return await new Promise<string>((resolve, reject) => {
    const onAbort = (): void => {
      stopHeartbeat();
      try {
        child.kill("SIGTERM");
      } catch {
        // ignore
      }
      reject(new A2hError("E_AGENT_UNAVAILABLE", "Aborted by caller"));
    };
    if (opts.signal) {
      if (opts.signal.aborted) return onAbort();
      opts.signal.addEventListener("abort", onAbort, { once: true });
    }

    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    });

    child.on("error", (err: Error) => {
      stopHeartbeat();
      reject(
        new A2hError(
          "E_AGENT_UNAVAILABLE",
          `Failed to spawn ${agentId}: ${err.message}`,
          { agent: agentId, spawnError: err.message },
        ),
      );
    });

    child.on("close", (code: number | null) => {
      stopHeartbeat();
      if (code !== 0) {
        reject(classifyAgentFailure(agentId, code, stderr));
        return;
      }
      try {
        const html = extractHtml(stdout);
        validateHtml(html);
        resolve(html);
      } catch (err) {
        reject(err);
      }
    });

    // prompt → stdin (claude / qoder 协议都是 stdin, 上游 invoke.ts 一致)
    child.stdin?.write(opts.prompt);
    child.stdin?.end();
  });
}

// ─── 暴露给测试 ──────────────────────────────────────────────────────
export const _internal = { buildAgentArgv, validateHtml, lookupAgentDef };
