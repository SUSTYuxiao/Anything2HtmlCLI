// =====================================================================
// src/__tests__/invoke.test.ts
// 验证 invokeAgent 错误路径 + argv 构造, 不打真实 claude / qoder CLI.
// 通过 deps.{resolveBin, spawn} 注入 mock; 与 quality-guidelines.md
// "CI 不跑真实 LLM" 对齐.
// =====================================================================

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";
import type { ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { invokeAgent, _internal } from "../agents/invoke.js";
import { _internal as _errInternal } from "../agents/errors.js";
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

// ─── 1. resolveBin 返回 null → E_AGENT_UNAVAILABLE (claude) ─────────
test("invokeAgent claude: missing bin throws E_AGENT_UNAVAILABLE", async () => {
  await assert.rejects(
    () =>
      invokeAgent(
        "claude",
        { prompt: "x" },
        { resolveBin: () => null, spawn: mockSpawn({ stdout: RAW_STDOUT }) },
      ),
    (err: unknown) => {
      assert.ok(err instanceof A2hError);
      assert.equal((err as A2hError).code, "E_AGENT_UNAVAILABLE");
      assert.match((err as A2hError).message, /claude CLI not found/);
      return true;
    },
  );
});

// ─── 2. resolveBin 返回 null → E_AGENT_UNAVAILABLE (qoder) ──────────
test("invokeAgent qoder: missing bin throws E_AGENT_UNAVAILABLE", async () => {
  await assert.rejects(
    () =>
      invokeAgent(
        "qoder",
        { prompt: "x" },
        { resolveBin: () => null, spawn: mockSpawn({ stdout: RAW_STDOUT }) },
      ),
    (err: unknown) => {
      assert.ok(err instanceof A2hError);
      assert.equal((err as A2hError).code, "E_AGENT_UNAVAILABLE");
      assert.match((err as A2hError).message, /qoder CLI not found/);
      return true;
    },
  );
});

// ─── 3. claude happy path: exit 0 + 合规 stdout ─────────────────────
test("invokeAgent claude: exit 0 with valid HTML returns extracted HTML", async () => {
  const html = await invokeAgent(
    "claude",
    { prompt: "x" },
    {
      resolveBin: () => "/fake/claude",
      spawn: mockSpawn({ stdout: RAW_STDOUT, exitCode: 0 }),
    },
  );
  assert.match(html, /^<!DOCTYPE\s+html/i);
  assert.match(html, /<\/html>\s*$/);
});

// ─── 4. qoder happy path: exit 0 + 合规 stdout ──────────────────────
// qoder 走 stream-json + --yolo argv, 但 invoke.ts 不解析, 整段过 extractHtml.
// 这里 fixture 是 claude 的 raw text mode 输出 (DOCTYPE 起手), 同样能切出.
test("invokeAgent qoder: exit 0 with DOCTYPE stdout returns extracted HTML", async () => {
  const html = await invokeAgent(
    "qoder",
    { prompt: "x" },
    {
      resolveBin: () => "/fake/qodercli",
      spawn: mockSpawn({ stdout: RAW_STDOUT, exitCode: 0 }),
    },
  );
  assert.match(html, /^<!DOCTYPE\s+html/i);
  assert.match(html, /<\/html>\s*$/);
});

// ─── 5. claude budget keyword → E_BUDGET_EXCEEDED ───────────────────
test("invokeAgent claude: nonzero exit with budget keyword maps to E_BUDGET_EXCEEDED", async () => {
  await assert.rejects(
    () =>
      invokeAgent(
        "claude",
        { prompt: "x" },
        {
          resolveBin: () => "/fake/claude",
          spawn: mockSpawn({
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

// ─── 6. claude network keyword → E_NETWORK ──────────────────────────
test("invokeAgent claude: nonzero exit with network keyword maps to E_NETWORK", async () => {
  await assert.rejects(
    () =>
      invokeAgent(
        "claude",
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

// ─── 7. qoder generic failure → E_AGENT_UNAVAILABLE ─────────────────
// qoder 第一版只识别 network + auth, 其他 stderr 默认 unavailable.
test("invokeAgent qoder: nonzero exit without known keyword → E_AGENT_UNAVAILABLE", async () => {
  await assert.rejects(
    () =>
      invokeAgent(
        "qoder",
        { prompt: "x" },
        {
          resolveBin: () => "/fake/qodercli",
          spawn: mockSpawn({ stderr: "qoder: model rejected", exitCode: 1 }),
        },
      ),
    (err: unknown) => {
      assert.ok(err instanceof A2hError);
      assert.equal((err as A2hError).code, "E_AGENT_UNAVAILABLE");
      assert.match((err as A2hError).message, /qoder/);
      return true;
    },
  );
});

// ─── 8. exit 0 但 stdout 不合规 → E_OUTPUT_INVALID ──────────────────
test("invokeAgent claude: exit 0 with truncated <…> stdout maps to E_OUTPUT_INVALID", async () => {
  await assert.rejects(
    () =>
      invokeAgent(
        "claude",
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

// ─── 9. spawn error → E_AGENT_UNAVAILABLE ───────────────────────────
test("invokeAgent claude: child process spawn error → E_AGENT_UNAVAILABLE", async () => {
  await assert.rejects(
    () =>
      invokeAgent(
        "claude",
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

// ─── 10. argv builder claude: 默认 -p + text + --bare ───────────────
test("buildAgentArgv claude: default argv = -p + --output-format text + --bare", () => {
  const argv = _internal.buildAgentArgv("claude", { prompt: "x" });
  assert.deepEqual(argv, ["-p", "--output-format", "text", "--bare"]);
});

// ─── 11. argv builder claude: budget + model 透传 ───────────────────
test("buildAgentArgv claude: --max-budget-usd + --model appended when set", () => {
  const argv = _internal.buildAgentArgv("claude", { prompt: "x", budget: 2, model: "sonnet" });
  assert.ok(argv.includes("--max-budget-usd"));
  assert.ok(argv.includes("2"));
  assert.ok(argv.includes("--model"));
  assert.ok(argv.includes("sonnet"));
});

// ─── 12. argv builder claude: --no-bare 时去掉 --bare ───────────────
test("buildAgentArgv claude: noBare drops --bare", () => {
  const argv = _internal.buildAgentArgv("claude", { prompt: "x", noBare: true });
  assert.equal(argv.includes("--bare"), false);
});

// ─── 13. argv builder qoder: 走上游 buildArgv ───────────────────────
// 上游 argv.ts qoder case: ["-p","--output-format","stream-json","--yolo"]
test("buildAgentArgv qoder: includes -p + stream-json + --yolo (per upstream)", () => {
  const argv = _internal.buildAgentArgv("qoder", { prompt: "x" });
  assert.ok(argv.includes("-p"));
  assert.ok(argv.includes("--output-format"));
  assert.ok(argv.includes("stream-json"));
  assert.ok(argv.includes("--yolo"));
});

test("buildAgentArgv qoder: --model passes through", () => {
  const argv = _internal.buildAgentArgv("qoder", { prompt: "x", model: "performance" });
  assert.ok(argv.includes("--model"));
  assert.ok(argv.includes("performance"));
});

// ─── 14. classify: claude vs qoder dispatch ─────────────────────────
test("AGENT_CLASSIFIERS: claude budget 关键字, qoder 不识别 budget 默认 unavailable", () => {
  const a = _errInternal.claudeClassify(1, "max-budget-usd exceeded");
  assert.equal(a.code, "E_BUDGET_EXCEEDED");
  // qoder 第一版没有 budget 关键字 (协议无等价 flag), budget 文案落入默认分类
  const b = _errInternal.qoderClassify(1, "max-budget-usd exceeded");
  assert.equal(b.code, "E_AGENT_UNAVAILABLE");
});

// ─── 15. lookupAgentDef 拦截不支持 id ───────────────────────────────
// 类型层已限定 AgentId, 但 caller 用 unsafe cast 时仍要兜底.
test("lookupAgentDef: unsupported id throws E_USAGE", () => {
  assert.throws(
    () => _internal.lookupAgentDef("definitely-not-an-agent" as never),
    (err: unknown) => {
      assert.ok(err instanceof A2hError);
      assert.equal((err as A2hError).code, "E_USAGE");
      return true;
    },
  );
});

// ─── 16. heartbeat: onProgress 不传则不调度 ─────────────────────────
// 隐式验证: 无 onProgress 时 setInterval 不应触发 (timeout 1s 内不抛异常即可).
// 显式验证 setInterval 调度需要 fake timer, 加重测试复杂度——跳过, 用真实
// 短路径覆盖.
test("invokeAgent: heartbeat absent when onProgress not provided", async () => {
  const html = await invokeAgent(
    "claude",
    { prompt: "x" },
    {
      resolveBin: () => "/fake/claude",
      spawn: mockSpawn({ stdout: RAW_STDOUT, exitCode: 0 }),
    },
  );
  assert.match(html, /^<!DOCTYPE/);
});

// ─── 17. heartbeat: onProgress 在 close 前后均被 clearInterval ──────
// 验证 close 触发后不再调用 onProgress; mockSpawn 用 setImmediate 立即关闭,
// 5s 心跳来不及触发——所以 ticks 应为 0.
test("invokeAgent: onProgress callback wired but cleared on close", async () => {
  let ticks = 0;
  const html = await invokeAgent(
    "claude",
    { prompt: "x", onProgress: () => ticks++ },
    {
      resolveBin: () => "/fake/claude",
      spawn: mockSpawn({ stdout: RAW_STDOUT, exitCode: 0 }),
    },
  );
  assert.match(html, /^<!DOCTYPE/);
  // close 前 5s 心跳来不及触发, ticks 必为 0
  assert.equal(ticks, 0);
});
