// =====================================================================
// src/commands/skills.ts —— a2h skills 列表
// ---------------------------------------------------------------------
// WHY: 让 agent (--json) 与人类 (对齐表格) 都能 1 秒内拿到全量 skill id.
//      stdout 是数据通道 (per logging-guidelines)——本命令的输出必须走
//      stdout, 不走 stderr.
//
// 协议来源:
//   - .trellis/spec/guides/cli-design.md §1 P0 子命令
//   - PRD Q-MVP-3 (a2h skills 子命令)
// =====================================================================

import { listSkills, type SkillMeta } from "../templates/loader.js";
import { A2hError } from "../errors.js";

// ─── argv 解析 (仅 --json) ───────────────────────────────────────────
function parseSkillsArgs(rest: readonly string[]): { json: boolean } {
  let json = false;
  for (const a of rest) {
    if (a === "--json") {
      json = true;
    } else if (a === "--quiet" || a === "-q" || a === "--verbose" || a === "-v" || a === "--json-errors") {
      // 全局 flag 已被 cli.ts 处理
    } else if (a.startsWith("-")) {
      throw new A2hError("E_USAGE", `Unknown flag: ${a}`, undefined, "Run: a2h skills --help");
    } else {
      throw new A2hError("E_USAGE", `Unexpected positional argument: ${a}`);
    }
  }
  return { json };
}

// ─── 人类友好对齐渲染 ────────────────────────────────────────────────
// 列宽自适应; 不上色 (列表场景信息量已足, 颜色徒增噪音).
function renderHuman(skills: readonly SkillMeta[]): string {
  if (skills.length === 0) return "(no skills found)\n";

  const idWidth = Math.max(...skills.map((s) => s.id.length));
  const nameWidth = Math.max(...skills.map((s) => s.zhName.length * 2)); // 中文按双宽

  const lines: string[] = [];
  for (const s of skills) {
    const idCol = s.id.padEnd(idWidth);
    // 中文宽度近似: 简单按 padEnd 字符数 → 视觉略错位但可接受 (避免拉 wcwidth 依赖)
    const nameCol = s.zhName.padEnd(Math.max(8, nameWidth - s.zhName.length));
    lines.push(`${s.emoji}  ${idCol}  ${nameCol}  ${s.description}`);
  }
  return lines.join("\n") + "\n";
}

// ─── public ──────────────────────────────────────────────────────────
export async function runSkills(rest: readonly string[]): Promise<void> {
  const { json } = parseSkillsArgs(rest);
  const skills = listSkills();

  if (json) {
    process.stdout.write(JSON.stringify(skills, null, 2) + "\n");
    return;
  }
  process.stdout.write(renderHuman(skills));
}
