// =====================================================================
// src/__tests__/errors.test.ts
// 验证 ErrorCode 表 / A2hError 序列化 / normalize 映射。
// 协议: .trellis/spec/backend/error-handling.md
// =====================================================================

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { A2hError, ErrorCode, normalize } from "../errors.js";

// ─── ErrorCode 表完整性 (PRD Q-MVP-8 SSoT) ──────────────────────────
test("ErrorCode table matches PRD Q-MVP-8 contract", () => {
  assert.equal(ErrorCode.OK, 0);
  assert.equal(ErrorCode.E_USAGE, 1);
  assert.equal(ErrorCode.E_SKILL_NOT_FOUND, 10);
  assert.equal(ErrorCode.E_AGENT_UNAVAILABLE, 20);
  assert.equal(ErrorCode.E_BUDGET_EXCEEDED, 30);
  assert.equal(ErrorCode.E_OUTPUT_INVALID, 40);
  assert.equal(ErrorCode.E_NETWORK, 50);
});

// ─── A2hError 构造 + 序列化 ──────────────────────────────────────────
test("A2hError serializes all fields when present", () => {
  const e = new A2hError(
    "E_SKILL_NOT_FOUND",
    "Skill 'x' not found",
    { skill: "x" },
    "Try: a2h skills",
  );
  const obj = e.toErrorObject();
  assert.equal(obj.code, "E_SKILL_NOT_FOUND");
  assert.equal(obj.message, "Skill 'x' not found");
  assert.deepEqual(obj.detail, { skill: "x" });
  assert.equal(obj.hint, "Try: a2h skills");
});

test("A2hError omits absent optional fields (exactOptionalPropertyTypes)", () => {
  const e = new A2hError("E_USAGE", "bad");
  const obj = e.toErrorObject();
  assert.equal(obj.code, "E_USAGE");
  assert.equal(obj.message, "bad");
  // optional 字段未传时序列化结果不应含该 key (而非含 undefined)
  assert.equal("detail" in obj, false);
  assert.equal("hint" in obj, false);
});

test("A2hError JSON.stringify round-trip", () => {
  const e = new A2hError("E_OUTPUT_INVALID", "no doctype", { doctype: false });
  const json = JSON.stringify(e.toErrorObject());
  const parsed = JSON.parse(json) as { code: string; message: string };
  assert.equal(parsed.code, "E_OUTPUT_INVALID");
  assert.equal(parsed.message, "no doctype");
});

// ─── normalize: 已是 A2hError 直通 ───────────────────────────────────
test("normalize: A2hError instance pass-through", () => {
  const original = new A2hError("E_NETWORK", "down");
  assert.equal(normalize(original), original);
});

// ─── normalize: ENOENT → E_USAGE ─────────────────────────────────────
test("normalize: ENOENT maps to E_USAGE", () => {
  const enoent = Object.assign(new Error("file not found"), { code: "ENOENT" });
  const out = normalize(enoent);
  assert.equal(out.code, "E_USAGE");
  assert.equal(out.message, "file not found");
});

// ─── normalize: 网络类 errno → E_NETWORK ────────────────────────────
test("normalize: ETIMEDOUT maps to E_NETWORK", () => {
  const timeout = Object.assign(new Error("timed out"), { code: "ETIMEDOUT" });
  const out = normalize(timeout);
  assert.equal(out.code, "E_NETWORK");
});

test("normalize: ECONNREFUSED maps to E_NETWORK", () => {
  const refused = Object.assign(new Error("conn refused"), { code: "ECONNREFUSED" });
  const out = normalize(refused);
  assert.equal(out.code, "E_NETWORK");
});

test("normalize: EAI_AGAIN (DNS) maps to E_NETWORK", () => {
  const dns = Object.assign(new Error("dns retry"), { code: "EAI_AGAIN" });
  const out = normalize(dns);
  assert.equal(out.code, "E_NETWORK");
});

// ─── normalize: 默认分支 ─────────────────────────────────────────────
test("normalize: bare Error falls back to E_USAGE", () => {
  const bare = new Error("unspecified");
  const out = normalize(bare);
  assert.equal(out.code, "E_USAGE");
  assert.equal(out.message, "unspecified");
});

test("normalize: non-Error value coerced to string E_USAGE", () => {
  const out = normalize("oops, just a string");
  assert.equal(out.code, "E_USAGE");
  assert.match(out.message, /oops, just a string/);
});
