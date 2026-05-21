// =====================================================================
// src/errors.ts —— 错误协议唯一来源
// 协议: .trellis/spec/backend/error-handling.md
// 退出码表对齐 PRD Q-MVP-8 决策 C
// =====================================================================

// ─── ErrorCode 表 (Single Source of Truth) ───────────────────────────
export const ErrorCode = {
  OK: 0,
  E_USAGE: 1,
  E_SKILL_NOT_FOUND: 10,
  E_AGENT_UNAVAILABLE: 20,
  E_BUDGET_EXCEEDED: 30,
  E_OUTPUT_INVALID: 40,
  E_NETWORK: 50,
} as const;

export type ErrorCodeName = keyof typeof ErrorCode;

// ─── 序列化形态 (--json-errors 时写入 stdout) ────────────────────────
export type ErrorObject = {
  code: ErrorCodeName;
  message: string;
  detail?: Record<string, unknown>;
  hint?: string;
};

// ─── 类型化错误基类 ──────────────────────────────────────────────────
// 内部代码抛此类；裸 Error 进 normalize 默认分支会失真为 E_USAGE。
export class A2hError extends Error {
  readonly code: ErrorCodeName;
  readonly detail: Record<string, unknown> | undefined;
  readonly hint: string | undefined;

  constructor(
    code: ErrorCodeName,
    message: string,
    detail?: Record<string, unknown>,
    hint?: string,
  ) {
    super(message);
    this.name = "A2hError";
    this.code = code;
    this.detail = detail;
    this.hint = hint;
  }

  toErrorObject(): ErrorObject {
    // exactOptionalPropertyTypes: true 要求 optional key 不能 = undefined,
    // 须按需省略。
    const obj: ErrorObject = { code: this.code, message: this.message };
    if (this.detail !== undefined) obj.detail = this.detail;
    if (this.hint !== undefined) obj.hint = this.hint;
    return obj;
  }
}

// ─── normalize: Node 原生异常 → A2hError ────────────────────────────
// 协议见 spec §"错误抛出与退出的纪律"
export function normalize(err: unknown): A2hError {
  if (err instanceof A2hError) return err;

  // ENOENT / ETIMEDOUT 之类的 NodeJS.ErrnoException
  if (typeof err === "object" && err !== null && "code" in err) {
    const errnoErr = err as NodeJS.ErrnoException;
    const msg = errnoErr.message || String(errnoErr.code);
    switch (errnoErr.code) {
      case "ENOENT":
        return new A2hError("E_USAGE", msg);
      case "ETIMEDOUT":
      case "ENETUNREACH":
      case "EAI_AGAIN":
      case "ECONNRESET":
      case "ECONNREFUSED":
        return new A2hError("E_NETWORK", msg);
    }
  }

  if (err instanceof Error) return new A2hError("E_USAGE", err.message);
  return new A2hError("E_USAGE", String(err));
}
