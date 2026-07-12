#!/usr/bin/env node
/**
 * validate.mjs — 课标 + 微主题 + 依赖 完整性校验（零依赖）。
 *
 *   node scripts/validate.mjs
 *
 * 校验项：
 *   1. 课标：结构 + 计数 + key 格式 + 版权一致性
 *   2. 微主题：id 格式 + type 枚举 + stage 合法 + evidence 非空 + 无重复 id
 *   3. 微主题 → 课标引用：每个 standards 引用都能解析
 *   4. 依赖：端点可解析 + 无自依赖 + 无重复边 + 无环（拓扑排序）
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW_DIR = resolve(ROOT, 'data', 'standards-raw');
const TOPICS_DIR = resolve(ROOT, 'data', 'topics');
const DEPS_DIR = resolve(ROOT, 'data', 'dependencies');

const errors = [];
const check = (cond, msg) => { if (!cond) errors.push(msg); };

const STAGES = new Set(['stage1', 'stage2', 'stage3', 'stage4', 'stage5']);
const TYPES = new Set(['CONCEPTUAL', 'PROCEDURAL', 'REPRESENTATIONAL', 'LANGUAGE', 'META']);
const CATEGORIES = new Set(['内容要求', '学业要求', '教学提示', '核心素养', '课程目标', '其他']);
const LICENSE_STATUSES = new Set(['encumbered', 'clear', 'factual']);

function listJson(dir) {
  try { return readdirSync(dir).filter(f => f.endsWith('.json')); } catch { return []; }
}

// ============================================================
// 1. 课标（standards-raw）
// ============================================================
const standardKeys = new Set();
const standardByFile = {};
let stdFileCount = 0;
let stdItemCount = 0;
let stdVerbatim = 0;

for (const file of listJson(RAW_DIR)) {
  stdFileCount++;
  const doc = JSON.parse(readFileSync(resolve(RAW_DIR, file), 'utf8'));
  standardByFile[file] = doc;

  check(typeof doc.slug === 'string' && /^moe-cn-\d{4}-[a-z-]+$/.test(doc.slug),
    `课标 ${file}: slug 不合规（期望 moe-cn-2022-<subject>），得到 ${doc.slug}`);
  check(doc.itemCount === doc.items?.length,
    `课标 ${file}: itemCount ${doc.itemCount} ≠ items.length ${doc.items?.length}`);

  for (const item of doc.items ?? []) {
    stdItemCount++;
    check(item.key === `${doc.slug}:${item.code}`,
      `课标 ${file}: key (${item.key}) ≠ slug:code`);
    if (standardKeys.has(item.key)) check(false, `课标 ${file}: 重复 key ${item.key}`);
    standardKeys.add(item.key);

    if (item.category) check(CATEGORIES.has(item.category), `课标 ${item.key}: 非法 category ${item.category}`);
    check(LICENSE_STATUSES.has(item.provenance?.licenseStatus),
      `课标 ${item.key}: 非法 licenseStatus`);

    const hasVerbatim = typeof item.verbatimText === 'string' && item.verbatimText.length > 0;
    if (hasVerbatim) {
      stdVerbatim++;
      check(item.publishable === false, `课标 ${item.key}: 含 verbatimText 但 publishable 不是 false`);
      check(item.provenance.licenseStatus === 'encumbered', `课标 ${item.key}: 含 verbatimText 但 licenseStatus 不是 encumbered`);
    }
  }
}

// ============================================================
// 2. 微主题（topics）
// ============================================================
const topicIds = new Set();
let topicsFileCount = 0;
let topicsCount = 0;

for (const file of listJson(TOPICS_DIR)) {
  topicsFileCount++;
  const doc = JSON.parse(readFileSync(resolve(TOPICS_DIR, file), 'utf8'));

  check(doc.topicCount === doc.topics?.length,
    `微主题 ${file}: topicCount ${doc.topicCount} ≠ topics.length ${doc.topics?.length}`);

  for (const t of doc.topics ?? []) {
    topicsCount++;
    check(typeof t.id === 'string' && /^cnmt_/.test(t.id), `微主题 id 不合规: ${t.id}`);
    check(TYPES.has(t.type), `微主题 ${t.id}: 非法 type ${t.type}`);
    check(STAGES.has(t.stage), `微主题 ${t.id}: 非法 stage ${t.stage}`);
    check(Array.isArray(t.evidence) && t.evidence.length > 0, `微主题 ${t.id}: evidence 必须非空`);
    check(typeof t.description === 'string' && t.description.length > 0, `微主题 ${t.id}: description 不能为空`);
    if (topicIds.has(t.id)) check(false, `微主题: 重复 id ${t.id}`);
    topicIds.add(t.id);

    // standards 引用必须能解析到课标 key
    for (const sk of t.standards ?? []) {
      check(standardKeys.has(sk), `微主题 ${t.id}: 引用了未知课标 ${sk}`);
    }

    // grade 一致性
    if (t.gradeStart != null && t.gradeEnd != null) {
      check(t.gradeStart <= t.gradeEnd, `微主题 ${t.id}: gradeStart(${t.gradeStart}) > gradeEnd(${t.gradeEnd})`);
    }
  }
}

// ============================================================
// 3. 依赖（dependencies）
// ============================================================
let depsFileCount = 0;
let edgeCount = 0;
const edgeSet = new Set();           // 去重 (topicId, prerequisiteId)
const adj = new Map();               // 邻接表：prereq -> [topics that depend on it]
const inDegree = new Map();          // 入度（被依赖方向，用于拓扑排序）

for (const file of listJson(DEPS_DIR)) {
  depsFileCount++;
  const doc = JSON.parse(readFileSync(resolve(DEPS_DIR, file), 'utf8'));

  check(doc.edgeCount === doc.dependencies?.length,
    `依赖 ${file}: edgeCount ${doc.edgeCount} ≠ dependencies.length ${doc.dependencies?.length}`);

  for (const d of doc.dependencies ?? []) {
    edgeCount++;
    check(topicIds.has(d.topicId), `依赖: 引用未知 topicId ${d.topicId}`);
    check(topicIds.has(d.prerequisiteId), `依赖: 引用未知 prerequisiteId ${d.prerequisiteId}`);
    check(d.topicId !== d.prerequisiteId, `依赖: 自依赖 ${d.topicId}`);
    check(d.strength === 'hard' || d.strength === 'soft', `依赖 ${d.topicId}→${d.prerequisiteId}: 非法 strength ${d.strength}`);

    const ek = `${d.topicId}|${d.prerequisiteId}`;
    if (edgeSet.has(ek)) check(false, `依赖: 重复边 ${d.topicId} → ${d.prerequisiteId}`);
    edgeSet.add(ek);

    // 建图：prerequisiteId → topicId（表示学完 prereq 才能 unlock topic）
    // 拓扑排序按"解锁方向"算入度
    if (!adj.has(d.prerequisiteId)) adj.set(d.prerequisiteId, []);
    adj.get(d.prerequisiteId).push(d.topicId);
    inDegree.set(d.topicId, (inDegree.get(d.topicId) ?? 0) + 1);
  }
}

// 初始化入度（无入度的节点入度为 0）
for (const id of topicIds) if (!inDegree.has(id)) inDegree.set(id, 0);

// Kahn 拓扑排序检测环
const queue = [...topicIds].filter(id => inDegree.get(id) === 0);
let visited = 0;
const indeg = new Map(inDegree);
while (queue.length) {
  const node = queue.shift();
  visited++;
  for (const next of adj.get(node) ?? []) {
    indeg.set(next, indeg.get(next) - 1);
    if (indeg.get(next) === 0) queue.push(next);
  }
}
if (visited !== topicIds.size) {
  const cyclic = [...topicIds].filter(id => indeg.get(id) > 0);
  check(false, `依赖图存在环，涉及 ${cyclic.length} 个节点: ${cyclic.slice(0, 8).join(', ')}${cyclic.length > 8 ? ' ...' : ''}`);
}

// ============================================================
// 报告
// ============================================================
console.log('');
if (errors.length) {
  console.error(`✗ 发现 ${errors.length} 个问题：`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`✓ 全部有效`);
console.log(`  课标：${stdFileCount} 文件 / ${stdItemCount} 条（原文已填 ${stdVerbatim}）`);
console.log(`  微主题：${topicsFileCount} 文件 / ${topicsCount} 个`);
console.log(`  依赖：${depsFileCount} 文件 / ${edgeCount} 条边`);
console.log(`  引用完整性：topics↔standards、dependencies 端点全部可解析，依赖图无环。`);
console.log('');
