// =====================================================================
// src/__tests__/skills.test.ts
// 验证 listSkills() 返回真实磁盘上的 75 个 skill, 含 article-magazine.
// =====================================================================

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { listSkills } from "../templates/loader.js";

// ─── 1. 数量下限: 上游 ≥ 75 个 skill ─────────────────────────────────
test("listSkills: returns at least 75 skills (upstream baseline)", () => {
  const skills = listSkills();
  assert.ok(
    skills.length >= 75,
    `Expected ≥75 skills, got ${skills.length}`,
  );
});

// ─── 2. 必含 article-magazine (PR2 smoke test 的 skill) ─────────────
test("listSkills: contains article-magazine", () => {
  const skills = listSkills();
  const found = skills.find((s) => s.id === "article-magazine");
  assert.ok(found, "article-magazine missing");
  assert.equal(typeof found?.zhName, "string");
  assert.equal(typeof found?.description, "string");
});

// ─── 3. 每条 skill 都有合法 id (loader 自身应该过滤无效) ────────────
test("listSkills: every entry has valid id and tags array", () => {
  const skills = listSkills();
  for (const s of skills) {
    assert.match(s.id, /^[a-z0-9][a-z0-9-]*$/i, `bad id: ${s.id}`);
    assert.ok(Array.isArray(s.tags), `tags not array for ${s.id}`);
  }
});

// ─── 4. JSON 序列化可往返 (--json 输出契约) ─────────────────────────
test("listSkills: result is JSON.stringify safe", () => {
  const skills = listSkills();
  const json = JSON.stringify(skills);
  const parsed = JSON.parse(json) as Array<{ id: string }>;
  assert.equal(parsed.length, skills.length);
});
