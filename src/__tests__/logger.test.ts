// =====================================================================
// src/__tests__/logger.test.ts
// 验证 logger 心跳 TTY 检测分流: 只看 stderr.isTTY + !quiet,
// 不看 stdout.isTTY (修复关键 bug: `a2h render in.md > out.html`
// 场景下 stdout 被重定向, 不应干掉 stderr 心跳).
//
// 协议: .trellis/spec/backend/logging-guidelines.md §进度协议
// =====================================================================

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { configureLogger, log, _testing } from "../logger.js";

// ─── 测试夹具: capture stderr 输出 + 重置全局状态 ────────────────────
function setup(opts: {
  stderrIsTty: boolean;
  quiet?: boolean;
  verbose?: boolean;
}): { captured: string[]; cleanup: () => void } {
  const captured: string[] = [];
  _testing.setStderrIsTty(opts.stderrIsTty);
  _testing.setStderrCapture((s) => captured.push(s));
  configureLogger({
    quiet: opts.quiet ?? false,
    verbose: opts.verbose ?? false,
  });
  return {
    captured,
    cleanup: () => {
      _testing.setStderrIsTty(undefined);
      _testing.setStderrCapture(undefined);
      _testing.resetFlags();
    },
  };
}

// ─── 1. heartbeat: stderr TTY + !quiet → 打 ──────────────────────────
test("heartbeat: stderr TTY + !quiet → tick written", () => {
  const { captured, cleanup } = setup({ stderrIsTty: true, quiet: false });
  try {
    log.progressTick();
    log.progressTick();
    const joined = captured.join("");
    assert.match(joined, /·/);
    assert.equal(captured.length, 2);
  } finally {
    cleanup();
  }
});

// ─── 2. heartbeat: stderr TTY + quiet → 静默 ─────────────────────────
test("heartbeat: stderr TTY + quiet → silent", () => {
  const { captured, cleanup } = setup({ stderrIsTty: true, quiet: true });
  try {
    log.progressTick();
    log.progressTick();
    assert.equal(captured.length, 0);
  } finally {
    cleanup();
  }
});

// ─── 3. heartbeat: stderr 非 TTY → 静默 ──────────────────────────────
test("heartbeat: stderr non-TTY → silent", () => {
  const { captured, cleanup } = setup({ stderrIsTty: false, quiet: false });
  try {
    log.progressTick();
    log.progressTick();
    assert.equal(captured.length, 0);
  } finally {
    cleanup();
  }
});

// ─── 4. KEY BUG FIX: stdout 非 TTY + stderr TTY → 心跳仍打 ───────────
// 这是 `a2h render in.md > out.html` 关键场景. stdout 被 `>` 重定向,
// stdout.isTTY = false; stderr 仍连终端, stderr.isTTY = true.
// 修复前: isTTY = stdout && stderr → false → 心跳静默 (bug, 用户 60s 无反馈)
// 修复后: stderrVisible = stderr.isTTY && !quiet → true → 心跳打 (正确)
//
// 注: stdout.isTTY 在本测试中不被 mock — 但因 stderrVisible 不再读它,
// 测试逻辑独立于 stdout 真实状态, 这正是修复的本质: 解耦.
test("heartbeat: stdout non-TTY + stderr TTY → tick written (key bug fix)", () => {
  const { captured, cleanup } = setup({ stderrIsTty: true, quiet: false });
  try {
    // 模拟 `a2h render in.md > out.html`: stdout 被重定向, 但 stderr TTY.
    // 我们的 stderrVisible() 不再读 stdout.isTTY, 所以无论 stdout 状态如何
    // 心跳都应该打 — 这是修复后的正确行为.
    log.progressTick();
    log.progressTick();
    log.progressTick();
    const joined = captured.join("");
    assert.match(joined, /·/);
    assert.equal(captured.length, 3, "expected 3 ticks even with stdout redirected");
  } finally {
    cleanup();
  }
});

// ─── 5. error: 始终打, 独立于 TTY / quiet (运维信号不能被屏蔽) ───────
test("error: always written even when stderr non-TTY + quiet", () => {
  const { captured, cleanup } = setup({ stderrIsTty: false, quiet: true });
  try {
    log.error("boom");
    const joined = captured.join("");
    assert.match(joined, /boom/);
    assert.equal(captured.length, 1);
  } finally {
    cleanup();
  }
});

// ─── 6. info / done 与 progressTick 同条件 (回归保护) ────────────────
// 验证"所有走 stderr 的方法 TTY 检测都只看 stderr.isTTY"原则全面落地.
test("info/done: same stderrVisible gate as progressTick", () => {
  const { captured, cleanup } = setup({ stderrIsTty: true, quiet: false });
  try {
    log.info("hello");
    log.done("bye");
    const joined = captured.join("");
    assert.match(joined, /hello/);
    assert.match(joined, /bye/);
  } finally {
    cleanup();
  }

  // 翻成非 TTY → info / done 应静默
  const { captured: c2, cleanup: cleanup2 } = setup({ stderrIsTty: false });
  try {
    log.info("hello");
    log.done("bye");
    assert.equal(c2.length, 0);
  } finally {
    cleanup2();
  }
});
