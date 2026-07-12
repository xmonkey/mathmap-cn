#!/usr/bin/env node
/**
 * query.mjs — 微主题依赖图查询工具（零依赖）。
 *
 *   node scripts/query.mjs                      列出图根（最基础的微主题）
 *   node scripts/query.mjs trace <id>           追溯某个主题的完整前置链
 *   node scripts/query.mjs unlock <id>          展示学某主题能解锁什么
 *   node scripts/query.mjs path <from> <to>     求从 from 到 to 的学习路径
 *   node scripts/query.mjs stats                统计：度数、关键节点
 *   node scripts/query.mjs find <关键词>        按名字/描述模糊查找
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TOPICS_DIR = resolve(ROOT, 'data', 'topics');
const DEPS_DIR = resolve(ROOT, 'data', 'dependencies');

// 加载所有 topics + dependencies
const topics = new Map();
for (const f of readdirSync(TOPICS_DIR).filter(f => f.endsWith('.json'))) {
  for (const t of JSON.parse(readFileSync(resolve(TOPICS_DIR, f), 'utf8')).topics) topics.set(t.id, t);
}
const edges = [];
for (const f of readdirSync(DEPS_DIR).filter(f => f.endsWith('.json'))) {
  edges.push(...JSON.parse(readFileSync(resolve(DEPS_DIR, f), 'utf8')).dependencies);
}

// 反向邻接：topicId -> 它直接依赖的 edges
const prereqsOf = new Map();
// 正向邻接：prerequisiteId -> 依赖它的 topicIds（解锁方向）
const unlocksOf = new Map();
for (const d of edges) {
  (prereqsOf.get(d.topicId) ?? prereqsOf.set(d.topicId, []).get(d.topicId)).push(d);
  (unlocksOf.get(d.prerequisiteId) ?? unlocksOf.set(d.prerequisiteId, []).get(d.prerequisiteId)).push(d);
}

const [cmd, ...rest] = process.argv.slice(2);

function trace(id, depth = 0, seen = new Set()) {
  for (const d of prereqsOf.get(id) ?? []) {
    if (seen.has(d.prerequisiteId)) continue;
    seen.add(d.prerequisiteId);
    const tag = d.strength === 'hard' ? 'hard' : 'soft';
    console.log(`${'  '.repeat(depth)}${tag} → ${name(d.prerequisiteId)}`);
    trace(d.prerequisiteId, depth + 1, seen);
    seen.delete(d.prerequisiteId);
  }
}

function name(id) { return topics.get(id)?.name ?? id; }

if (cmd === 'trace' && rest[0]) {
  console.log(`【${name(rest[0])}】的完整前置链：`);
  console.log(`（要学这个，必须先掌握：）`);
  trace(rest[0]);
} else if (cmd === 'unlock' && rest[0]) {
  console.log(`【${name(rest[0])}】能解锁：`);
  for (const d of unlocksOf.get(rest[0]) ?? []) {
    console.log(`  ${d.strength} → ${name(d.topicId)}`);
  }
} else if (cmd === 'stats') {
  console.log(`节点 ${topics.size} 个 | 边 ${edges.length} 条`);
  // 入度（被多少 topic 依赖）
  const depCount = new Map();
  for (const d of edges) depCount.set(d.prerequisiteId, (depCount.get(d.prerequisiteId) ?? 0) + 1);
  const ranked = [...depCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  console.log('\n关键节点（被最多主题依赖 = 桩基）：');
  for (const [id, n] of ranked) console.log(`  ${n}× ${name(id)}`);
  const roots = [...topics.keys()].filter(id => !prereqsOf.has(id));
  console.log(`\n图根（无前置依赖，最基础）：${roots.length} 个`);
  for (const id of roots) console.log(`  • ${name(id)}`);
} else if (cmd === 'find' && rest[0]) {
  const kw = rest.join(' ');
  const hits = [...topics.values()].filter(t => t.name.includes(kw) || t.description.includes(kw));
  console.log(`查找 "${kw}" → ${hits.length} 个匹配：`);
  for (const t of hits) console.log(`  ${t.id}  ${t.name}`);
} else if (cmd === 'path' && rest[0] && rest[1]) {
  const [from, to] = rest;
  console.log(`从【${name(from)}】到【${name(to)}】的学习路径：`);
  const visited = new Set([from]);
  const queue = [[from, [from]]];
  let found = null;
  while (queue.length) {
    const [node, path] = queue.shift();
    if (node === to) { found = path; break; }
    for (const d of prereqsOf.get(node) ?? []) {
      if (!visited.has(d.prerequisiteId)) {
        visited.add(d.prerequisiteId);
        queue.push([d.prerequisiteId, [...path, d.prerequisiteId]]);
      }
    }
  }
  if (found) {
    [...found].reverse().forEach((id, i) => console.log(`  ${i + 1}. ${name(id)}`));
  } else {
    console.log('  不存在前置关系路径。');
  }
} else {
  // 默认：列出图根
  const roots = [...topics.keys()].filter(id => !prereqsOf.has(id));
  console.log(`图根（${roots.length} 个无前置依赖的最基础微主题）：`);
  for (const id of roots) console.log(`  ${id}  ${name(id)}`);
  console.log(`\n子命令：trace <id> | unlock <id> | path <from> <to> | stats | find <kw>`);
}
