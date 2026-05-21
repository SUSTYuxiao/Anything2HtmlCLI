# Quality Guidelines

> **WHY**：本项目对外承诺"零运行时依赖纯 Node"（spike F5 实证）+ "薄壳跟进上游"（charter 原则 2）。质量门槛必须把这两条原则编码成机器可校验的 lint/test/build 规则——任何宽松一寸，下次 `npm run sync` 就会拖进 React/Tailwind 这种巨型尾巴。

---

## ─── 构建：esbuild 单 entry bundle（Q-MVP-SCAFFOLD B） ─

入口 `src/cli.ts` → `dist/cli.js`，单文件 ESM，目标 Node 20。

```jsonc
// package.json scripts
{
  "build": "esbuild src/cli.ts --bundle --platform=node --target=node20 --format=esm --external:node:* --outfile=dist/cli.js --minify --legal-comments=inline",
  "sync": "node scripts/sync-from-ref.mjs",
  "test": "node --test --enable-source-maps dist-test/**/*.test.js",
  "test:build": "esbuild src/**/*.ts --outdir=dist-test --platform=node --target=node20 --format=esm",
  "typecheck": "tsc --noEmit",
  "lint": "eslint src/cli.ts src/errors.ts src/logger.ts 'src/commands/**/*.ts' 'src/agents/**/*.ts'"
}
```

**`--external:node:*`** 关键：保留 `node:fs` `node:child_process` 这类 builtin 协议前缀；不写就被 bundler 当外部包。

**`sync` 用 `.mjs` 而非 `.ts`**：避免引入 `tsx` / `ts-node` 等 runtime 依赖（与"零运行时依赖"原则对齐，与 `research/spike/spike.mjs` 一脉相承）。

---

## ─── Skills 数据资产：运行时 fs.readFile（不内联） ────

skills 共 75 个目录，每个含 `SKILL.md` + `example.md` + `example.html`，体积约 800KB。两条路：

| 方案 | 命令 | 体积 | 启动 | 选用 |
|---|---|---|---|---|
| A. 内联 | `--loader:.md=text` | dist/cli.js ≈ 1MB | 0 io | ❌ |
| B. 运行时读 | `fs.readFileSync(__dirname+"/skills/...")` | dist/cli.js < 200KB + 独立 skills/ | 1 同步读 | ✅ |

**选 B**（运行时 fs.readFile）。理由：

1. 单 skill 调用只读 1 个 SKILL.md（~3KB），同步 io 可忽略。
2. 上游同步频繁，方案 A 每次同步都触发整个 bundle 重打；方案 B 只动 `dist/skills/` 目录。
3. 方案 A 把数据 hardcode 进 .js，违反"代码与数据分离"。

`package.json` 的 `"files"` 同步加 `"dist/skills/"`；同步脚本同时 cp `src/templates/skills/**` 到 `dist/skills/**`。

---

## ─── TypeScript：严格档但不强转 ──────────────────────

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src/**/*.ts"]
}
```

**ESM import 强制 `.js` 后缀**（即使源码是 `.ts`）：

```ts
// ✅ 正确
import { extractHtml } from "./extract-html.js";
import { loadSkill }   from "./templates/loader.js";

// ❌ 错误：tsx / ts-node 风格，esbuild bundle 后会 404
import { extractHtml } from "./extract-html";
```

不引 `tsx` 运行时、不引 `ts-node`——它们都是开发期奢侈品，与"零运行时依赖"冲突。

---

## ─── 测试：node --test + spike fixture ────────────────

测试框架选 **`node --test`**（Node 20+ 原生），与"零运行时依赖"对齐——不引 vitest / jest。

**单元测试（必测）**：

| 被测对象 | 路径 | 测试要点 |
|---|---|---|
| `extractHtml` | `src/__tests__/extract-html.test.ts` | DOCTYPE 切片、`</html>` 闭合、markdown fence 兼容 |
| `parseFrontmatter` | `src/__tests__/loader.test.ts` | 合法 frontmatter / 无 frontmatter / 损坏分隔符 |
| claude argv 构造 | `src/__tests__/agents.claude.test.ts` | 始终含 `-p --bare --output-format text`；Q-MVP-7 `--max-budget-usd` 仅在显式传入时附加 |

**集成测试（mock spawn，不打真实 claude）**：

```ts
// src/__tests__/commands.render.test.ts
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

test("render pipes fixture stdout into extractHtml and emits valid HTML", async () => {
  const rawStdout = readFileSync("src/__tests__/fixtures/raw-stdout.txt", "utf8");
  const html = await runRenderWithMockedSpawn({ stdout: rawStdout, code: 0 });
  assert.match(html, /^<!DOCTYPE\s+html/i);
  assert.match(html, /<\/html>\s*$/i);
});
```

fixture 种子直接复用 spike 产物：`research/spike/raw-stdout.txt` 与 `report.json` 拷到 `src/__tests__/fixtures/`。

**CI 不跑真实 claude**：mock `child_process.spawn`，回放 fixture 的 stdout/stderr/exitCode；端到端"打真 LLM"放本地手测，不进流水线。

---

## ─── 输出验证：HTML 头尾正则 + 退出码 40 ───────────

`commands/render.ts` 在 `extractHtml` 之后必检；**抛 `A2hError` 而非 `process.exit`**——
顶层 `cli.ts` catch 才允许退出（见 `error-handling.md` 行为纪律）：

```ts
// ─── HTML output validation (per spike F2 + PRD Q-MVP-8) ─────
import { A2hError } from "../errors.js";

const okStart = /^<!DOCTYPE\s+html/i.test(html);
const okEnd   = /<\/html>\s*$/i.test(html);
if (!okStart || !okEnd) {
  throw new A2hError(
    "E_OUTPUT_INVALID",
    `Invalid HTML output (doctype=${okStart}, close=${okEnd})`,
    { doctype: okStart, htmlClose: okEnd },
  );
}
```

退出码契约（PRD Q-MVP-8 表）固定为：`0` `OK` / `1` `E_USAGE` / `10` `E_SKILL_NOT_FOUND` / `20` `E_AGENT_UNAVAILABLE` / `30` `E_BUDGET_EXCEEDED` / `40` `E_OUTPUT_INVALID` / `50` `E_NETWORK`。任何新错误必须复用现有码或在 PRD 表里加一行——**禁止 ad-hoc `process.exit(2)`，也禁止在 commands/*.ts 内部直接 `process.exit`**（见 `error-handling.md` 行为纪律）。

---

## ─── Lint：只扫本项目层 ──────────────────────────────

ESLint 仅作用于本项目层；上游同步层是黑盒：

```jsonc
// eslint.config.js（flat config）
export default [
  {
    files: ["src/cli.ts", "src/errors.ts", "src/logger.ts", "src/commands/**/*.ts", "src/agents/**/*.ts"],
    rules: {
      "no-unused-vars": "error",
      "no-implicit-coercion": "error",
      "@typescript-eslint/no-explicit-any": "error"
    }
  },
  {
    ignores: [
      "src/templates/**",      // 上游同步层
      "src/extract-html.ts",   // 上游同步层
      "src/agents/detect.ts",  // 上游同步层，本仓库不为其风格背锅
      "src/agents/argv.ts",    // 同上
      "src/__tests__/fixtures/**",
      "dist/**",
      "ref/**"
    ]
  }
];
```

**理由**：上游代码风格归上游负责；本仓库不为它的 `any` / 命名风格背锅，否则每次 sync 都触发 lint 红墙。

---

## ─── 体积红线 ────────────────────────────────────────

| 产物 | 上限 | 校验方式 |
|---|---|---|
| `dist/cli.js`（不含 skills） | < 200 KB | CI: `[ $(stat -f %z dist/cli.js) -lt 204800 ]` |
| `dist/skills/` 总和 | < 1 MB | CI: `du -sk dist/skills` |
| `dist/cli.js + dist/skills/` 合 | < 1.2 MB | 同上加和 |

超线意味着引了 npm 包或多 bundle 了上游代码——**先回审依赖**，再考虑加体积预算。

---

## ─── 反模式（明确禁止） ──────────────────────────────

- **不要把 `dist/` commit 到 git**——`.gitignore` 必含 `dist/` `dist-test/`。
- **不要为类型完美引 `zod` / `yup` / `class-validator`**——CLI argparse 用 Node 内置 `node:util.parseArgs` 即够；运行时验证库违反 spike F5 的零依赖前提。
- **不要因 strict 被报错就到处写 `as Foo`**——`as` 多于 5 处即说明类型设计有错，回去改 type，不要硬转。
- **不要用 `tsx` / `ts-node` 跑生产代码**——开发期可短暂用，但 `bin/a2h` `dist/cli.js` 必须是 esbuild 产物。
- **不要在 CI 流水线里调真实 claude CLI**——LLM 不是确定性测试对象，会让 CI 变成"今天天气如何"赌博。
- **不要写"通用 retry 框架"**——claude CLI 自带网络层；本项目失败即退码 50，调用方决定是否重试。
- **不要用 `console.log` 输出业务结果**——stdout 是 HTML 通道（PRD Q-MVP-IO），所有日志/进度走 stderr。
