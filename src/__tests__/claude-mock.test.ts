// =====================================================================
// src/__tests__/claude-mock.test.ts
// 验证 callClaude 错误路径 + argv 构造, 不打真实 claude CLI.
// 通过 deps.{resolveBin, spawn} 注入 mock; 与 quality-guidelines.md
// "CI 不跑真实 claude" 对齐.
// =====================================================================

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";
import type { ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { callClaude, _internal } from "../agents/claude.js";
import { A2hError } from "../errors.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAW_STDOUT = readFileSync(
  resolve(__dirname, "../src/__tests__/fixtures/raw-stdout.txt"),
  "utf8",
);

// ─── 极简 spawn 工厂 ────────────────────────────────────────────────
type MockSpec = { stdout?: string; stderr?: string; exitCode?: number; spawnError?: Error };

function mockSpawn(spec: MockSpec) {
  return (): ChildProcess => {
    const child = new EventEmitter() as ChildProcess;
    // stdin: 不验证内容, 仅吞掉
    const stdin = new Writable({ write: (_c, _e, cb) => cb() });
    const stdout = new Readable({ read() {} });
    const stderr = new Readable({ read() {} });
    (child as unknown as { stdin: typeof stdin }).stdin = stdin;
    (child as unknown as { stdout: typeof stdout }).stdout = stdout;
    (child as unknown as { stderr: typeof stderr }).stderr = stderr;

    setImmediate(() => {
      if (spec.spawnError) {
        child.emit("error", spec.spawnError);
        return;
      }
      if (spec.stdout) stdout.push(spec.stdout);
      stdout.push(null);
      if (spec.stderr) stderr.push(spec.stderr);
      stderr.push(null);
      child.emit("close", spec.exitCode ?? 0);
    });
    return child;
  };
}

// ─── 1. resolveBin 返回 null → E_AGENT_UNAVAILABLE ──────────────────
test("callClaude: missing claude binary throws E_AGENT_UNAVAILABLE", async () => {
  await assert.rejects(
    () =>
      callClaude(
        { prompt: "x" },
        { resolveBin: () => null, spawn: mockSpawn({ stdout: RAW_STDOUT }) },
      ),
    (err: unknown) => {
      assert.ok(err instanceof A2hError);
      assert.equal((err as A2hError).code, "E_AGENT_UNAVAILABLE");
      return true;
    },
  );
});

// ─── 2. exit 0 + 合规 stdout → 返回提取的 HTML ──────────────────────
test("callClaude: exit 0 with valid HTML returns extracted HTML", async () => {
  const html = await callClaude(
    { prompt: "x" },
    {
      resolveBin: () => "/fake/claude",
      spawn: mockSpawn({ stdout: RAW_STDOUT, exitCode: 0 }),
    },
  );
  assert.match(html, /^<!DOCTYPE\s+html/i);
  assert.match(html, /<\/html>\s*$/);
});

// ─── 3. exit !=0 + budget 关键字 → E_BUDGET_EXCEEDED ────────────────
test("callClaude: nonzero exit with budget keyword maps to E_BUDGET_EXCEEDED", async () => {
  await assert.rejects(
    () =>
      callClaude(
        { prompt: "x" },
        {
          resolveBin: () => "/fake/claude",
          spawn: mockSpawn({
            stdout: "",
            stderr: "Error: --max-budget-usd exceeded ($0.51 > $0.50)",
            exitCode: 1,
          }),
        },
      ),
    (err: unknown) => {
      assert.ok(err instanceof A2hError);
      assert.equal((err as A2hError).code, "E_BUDGET_EXCEEDED");
      return true;
    },
  );
});

// ─── 4. exit !=0 + network keyword → E_NETWORK ──────────────────────
test("callClaude: nonzero exit with network keyword maps to E_NETWORK", async () => {
  await assert.rejects(
    () =>
      callClaude(
        { prompt: "x" },
        {
          resolveBin: () => "/fake/claude",
          spawn: mockSpawn({ stderr: "getaddrinfo ENOTFOUND api.anthropic.com", exitCode: 1 }),
        },
      ),
    (err: unknown) => {
      assert.ok(err instanceof A2hError);
      assert.equal((err as A2hError).code, "E_NETWORK");
      return true;
    },
  );
});

// ─── 5. exit 0 但 stdout 不合规 → E_OUTPUT_INVALID ──────────────────
// extractHtml 的兜底分支 5 会把纯文本包成合法 HTML 骨架; 真正能触发
// E_OUTPUT_INVALID 的是"起手 < 但缺 DOCTYPE / </html>"——branch 4 原样
// 透传, 校验时被 validateHtml 拦截.
test("callClaude: exit 0 with truncated <…> stdout maps to E_OUTPUT_INVALID", async () => {
  await assert.rejects(
    () =>
      callClaude(
        { prompt: "x" },
        {
          resolveBin: () => "/fake/claude",
          spawn: mockSpawn({ stdout: "<section>incomplete", exitCode: 0 }),
        },
      ),
    (err: unknown) => {
      assert.ok(err instanceof A2hError);
      assert.equal((err as A2hError).code, "E_OUTPUT_INVALID");
      return true;
    },
  );
});

// ─── 6. spawn error → E_AGENT_UNAVAILABLE ───────────────────────────
test("callClaude: child process spawn error → E_AGENT_UNAVAILABLE", async () => {
  await assert.rejects(
    () =>
      callClaude(
        { prompt: "x" },
        {
          resolveBin: () => "/fake/claude",
          spawn: mockSpawn({ spawnError: new Error("ENOENT no such file") }),
        },
      ),
    (err: unknown) => {
      assert.ok(err instanceof A2hError);
      assert.equal((err as A2hError).code, "E_AGENT_UNAVAILABLE");
      return true;
    },
  );
});

// ─── 7. argv builder: 默认带 --bare + text mode ─────────────────────
test("buildClaudeArgv: default argv includes -p + --output-format text + --bare", () => {
  const argv = _internal.buildClaudeArgv({ prompt: "x" });
  assert.deepEqual(argv, ["-p", "--output-format", "text", "--bare"]);
});

// ─── 8. argv builder: budget + model 透传 ───────────────────────────
test("buildClaudeArgv: --max-budget-usd + --model appended when set", () => {
  const argv = _internal.buildClaudeArgv({ prompt: "x", budget: 2, model: "sonnet" });
  assert.ok(argv.includes("--max-budget-usd"));
  assert.ok(argv.includes("2"));
  assert.ok(argv.includes("--model"));
  assert.ok(argv.includes("sonnet"));
});

// ─── 9. argv builder: --no-bare 时去掉 --bare ───────────────────────
test("buildClaudeArgv: noBare drops --bare", () => {
  const argv = _internal.buildClaudeArgv({ prompt: "x", noBare: true });
  assert.equal(argv.includes("--bare"), false);
});
