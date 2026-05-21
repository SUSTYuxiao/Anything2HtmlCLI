// =====================================================================
// src/agents/errors.ts —— Agent 失败 → A2hError 错误码分类映射
// ---------------------------------------------------------------------
// WHY: 不同 agent CLI 的退出码与 stderr 风格各异, 但本项目对外承诺统一
//      退出码表 (PRD Q-MVP-8). 这里把"agent → A2hError 映射"集中到一
//      个 map, 加新 agent 仅需多加一项, invoke.ts 不需要改. 这就是
//      "薄壳封装" 在错误维度的具象化.
//
// 最高原则 (用户 2026-05-21): "做好 ref 项目的 cli 适配封装, 其他问题
//   丢给 ref 本身." → 错误识别走"关键字 / 启发式现状能用就先用", 不
//   解析 stream-json subtype, 不深入 LLM 协议层.
//
// 协议来源:
//   - .trellis/spec/backend/error-handling.md (退出码 SSoT)
//   - PRD Q-CP-4 决策 A (共享抽象 + errors map)
// =====================================================================

import { A2hError } from "../errors.js";

// ─── 单 agent 的分类函数签名 ─────────────────────────────────────────
export type ClassifyFn = (
  exitCode: number | null,
  stderr: string,
) => A2hError;

// ─── claude: budget / network / auth / 其余 = E_AGENT_UNAVAILABLE ────
// 实证依据: PR2 spike + 现网 claude CLI stderr 实测; 退出码恒 1, 区分靠文案.
const claudeClassify: ClassifyFn = (_exitCode, stderr) => {
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
  return new A2hError(
    "E_AGENT_UNAVAILABLE",
    `claude exited non-zero; ${stderr.trim().slice(0, 200) || "(empty stderr)"}`,
    { stderr: stderr.slice(0, 500) },
  );
};

// ─── qoder: 第一版保守, 仅做 network 关键字识别, 其余 → E_AGENT_UNAVAILABLE
// 真实 qoder stderr 风格未知 (用户机器可能没装), 通过实测再调; 不强求复用
// claude 全部关键字 (budget 文案大概率不同). 与 claude 共用的只有 network.
const qoderClassify: ClassifyFn = (_exitCode, stderr) => {
  const lower = stderr.toLowerCase();
  if (/network|timed out|timeout|enotfound|econnrefused|getaddrinfo|dns/i.test(lower)) {
    return new A2hError(
      "E_NETWORK",
      `Network error from qoder; ${stderr.trim().slice(0, 200)}`,
      { stderr: stderr.slice(0, 500) },
    );
  }
  if (/not.*logged.in|unauthor|api.key|authentic/i.test(lower)) {
    return new A2hError(
      "E_AGENT_UNAVAILABLE",
      `qoder unauthenticated; ${stderr.trim().slice(0, 200)}`,
      { stderr: stderr.slice(0, 500) },
      "Run: qodercli login",
    );
  }
  return new A2hError(
    "E_AGENT_UNAVAILABLE",
    `qoder exited non-zero; ${stderr.trim().slice(0, 200) || "(empty stderr)"}`,
    { stderr: stderr.slice(0, 500) },
  );
};

// ─── 注册表: 加新 agent 仅需在此加一行 ───────────────────────────────
export const AGENT_CLASSIFIERS: Record<string, ClassifyFn> = {
  claude: claudeClassify,
  qoder: qoderClassify,
};

// ─── public dispatcher ───────────────────────────────────────────────
export function classifyAgentFailure(
  agentId: string,
  exitCode: number | null,
  stderr: string,
): A2hError {
  // unknown agent → 走 qoder 最保守分类 (network + auth + 其余 unavailable)
  const classify = AGENT_CLASSIFIERS[agentId] ?? qoderClassify;
  return classify(exitCode, stderr);
}

// ─── 暴露给测试 ──────────────────────────────────────────────────────
export const _internal = { claudeClassify, qoderClassify };
