// =====================================================================
// src/agents/claude.ts —— claude CLI 自写最简包装
// ---------------------------------------------------------------------
// WHY: 上游 invoke.ts 是 ReadableStream + 多 agent 多协议派发的复杂版本,
//      对 MVP（仅 claude + text mode）严重过度。spike F1 验证了
//      `--output-format text` 一次产出即可——本文件即此最简路径的 TS 化。
//
// 协议来源:
//   - .trellis/spec/backend/error-handling.md  (E_AGENT_UNAVAILABLE / E_BUDGET_EXCEEDED / E_NETWORK / E_OUTPUT_INVALID)
//   - .trellis/spec/backend/quality-guidelines.md §HTML 输出验证
//   - PRD Q-MVP-7 (--max-budget-usd 透传)
//   - spike F2/F3 (text mode + --bare 默认开)
// =====================================================================

import { spawn as cpSpawn, type ChildProcess } from "node:child_process";
import { resolveOnPath } from "./detect.js";
import { extractHtml } from "../extract-html.js";
import { A2hError } from "../errors.js";

// ─── public types ────────────────────────────────────────────────────
export type ClaudeOpts = {
  /** Full prompt text written to claude stdin. */
  prompt: string;
  /** --max-budget-usd <n> (PRD Q-MVP-7). Unset = no ceiling. */
  budget?: number;
  /** --model <id> 透传; 缺省 = claude CLI 自身配置决定. */
  model?: string;
  /** Disable claude --bare (默认 true, 用于"被嵌入时不受外层 session 污染"). */
  noBare?: boolean;
  /** Cancellation. */
  signal?: AbortSignal;
  /** stdout 累计字符数, 用于 logger.progress. text mode 下仅 close 时回调一次. */
  onProgress?: (chars: number) => void;
};

// ─── injected deps (testability) ─────────────────────────────────────
// callClaude 默认走真实 PATH 解析 + 真实 spawn; 测试时可通过 deps 注入 mock.
type SpawnFn = (cmd: string, argv: readonly string[]) => ChildProcess;
export type ClaudeDeps = {
  resolveBin?: () => string | null;
  spawn?: SpawnFn;
};

// ─── argv builder (与上游 buildArgv("claude") 不一致, 走简化版) ───────
// 上游用 stream-json 是为了 webapp iframe 实时预览; CLI 一次产出场景下
// text 模式直接拿到最终 HTML, extractHtml 无需任何修改即可工作 (spike F1).
function buildClaudeArgv(opts: ClaudeOpts): string[] {
  const argv = ["-p", "--output-format", "text"];
  if (!opts.noBare) argv.push("--bare");
  if (typeof opts.budget === "number" && Number.isFinite(opts.budget)) {
    argv.push("--max-budget-usd", String(opts.budget));
  }
  if (opts.model) argv.push("--model", opts.model);
  return argv;
}

// ─── stderr 关键字 → ErrorCode 映射 ──────────────────────────────────
// claude CLI 失败时退出码恒为 1, 区分必须靠 stderr 文案.
function classifyClaudeFailure(stderr: string): A2hError {
  const lower = stderr.toLowerCase();
  if (/budget|max-budget|cost.*exceed/i.test(lower)) {
    return new A2hError(
      "E_BUDGET_EXCEEDED",
      `Budget exceeded; claude stderr: ${stderr.trim().slice(0, 200)}`,
      { stderr: stderr.slice(0, 500) },
    );
  }
  if (/network|timed out|timeout|enotfound|econnrefused|getaddrinfo|dns/i.test(lower)) {
    return new A2hError(
      "E_NETWORK",
      `Network error from claude; ${stderr.trim().slice(0, 200)}`,
      { stderr: stderr.slice(0, 500) },
    );
  }
  if (/not.*logged.in|unauthor|api.key|authentic/i.test(lower)) {
    return new A2hError(
      "E_AGENT_UNAVAILABLE",
      `claude unauthenticated; ${stderr.trim().slice(0, 200)}`,
      { stderr: stderr.slice(0, 500) },
      "Run: claude login",
    );
  }
  // 默认: 把 claude 失败归类为 E_AGENT_UNAVAILABLE (调用层失败), 而非 E_USAGE.
  return new A2hError(
    "E_AGENT_UNAVAILABLE",
    `claude exited non-zero; ${stderr.trim().slice(0, 200) || "(empty stderr)"}`,
    { stderr: stderr.slice(0, 500) },
  );
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

// ─── public: callClaude ──────────────────────────────────────────────
// 输入 prompt + opts → 输出已经 extractHtml + 校验过的 HTML 字符串.
export async function callClaude(
  opts: ClaudeOpts,
  deps: ClaudeDeps = {},
): Promise<string> {
  const resolveBin = deps.resolveBin ?? ((): string | null => resolveOnPath("claude"));
  const spawnImpl: SpawnFn = deps.spawn ?? cpSpawn;

  const binPath = resolveBin();
  if (!binPath) {
    throw new A2hError(
      "E_AGENT_UNAVAILABLE",
      "claude CLI not found on PATH",
      { searched: "PATH + common npm/bun/asdf shim dirs" },
      "Install: https://docs.claude.com/claude-code or `npm i -g @anthropic-ai/claude-code`",
    );
  }

  const argv = buildClaudeArgv(opts);
  const child = spawnImpl(binPath, argv);

  // 收集 stdout/stderr; text mode 下 stdout 一气呵成, progress 仅起收尾报点.
  let stdout = "";
  let stderr = "";

  return await new Promise<string>((resolve, reject) => {
    const onAbort = (): void => {
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
      opts.onProgress?.(stdout.length);
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    });

    child.on("error", (err: Error) => {
      reject(
        new A2hError(
          "E_AGENT_UNAVAILABLE",
          `Failed to spawn claude: ${err.message}`,
          { spawnError: err.message },
        ),
      );
    });

    child.on("close", (code: number | null) => {
      if (code !== 0) {
        reject(classifyClaudeFailure(stderr));
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

    // prompt → stdin (claude protocol 是 stdin, spike.mjs 已验证)
    child.stdin?.write(opts.prompt);
    child.stdin?.end();
  });
}

// ─── 暴露 argv 构造给测试 ────────────────────────────────────────────
export const _internal = { buildClaudeArgv, classifyClaudeFailure, validateHtml };
