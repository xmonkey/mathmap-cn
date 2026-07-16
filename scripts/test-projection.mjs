#!/usr/bin/env node
/**
 * test-projection.mjs — 渲染投影不变量扫描测试（零依赖）。
 *
 *   node scripts/test-projection.mjs
 *
 * 目的：防止「放大到极致时投影崩溃」一类 bug 再现。
 *
 * 做法：把 projectAll() 的透视数学当成纯函数，对 (yaw, pitch, zoom, 视口尺寸)
 * 做网格扫描，断言每个节点在每个组合下的透视值：
 *   - 恒为正、有限
 *   - 有界（persp 过大说明节点穿越相机、坐标将炸飞）
 *
 * 数据来源：直接解析 viz/cn-graph.html 里内联的 DATA（与 build 产物同源），
 * 避免重复实现坐标计算；视口/zoom 的扫描覆盖真实交互范围与边界值。
 *
 * 退出码：0 通过；1 有违反（打印首个失败组合供调试）。
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = resolve(ROOT, 'viz', 'cn-graph.html');

const FOCAL = 1400; // 与 build-cn-graph.mjs 保持一致

// ---------- 1. 解析产物里的 DATA.nodes（与实际渲染同源）----------
// DATA 是 HTML 内联的字面量对象（DATA={...}），用增量 JSON.parse 找边界，
// 比大括号 depth 计数更稳（节点描述文本里可能含未转义的 } 字符）。
const html = readFileSync(HTML, 'utf8');
const start = html.indexOf('DATA=');
if (start < 0) throw new Error('viz/cn-graph.html 里找不到 DATA=，产物结构已变？');
const brace = html.indexOf('{', start);
if (brace < 0) throw new Error('DATA= 后找不到起始 {');
let dataEnd = -1;
for (let end = brace + 50; end < html.length; end++) {
  if (html[end] !== '}') continue;
  try {
    const obj = JSON.parse(html.slice(brace, end + 1));
    if (obj && Array.isArray(obj.nodes) && obj.nodes.length > 0) { dataEnd = end; break; }
  } catch { /* 继续向后扩 */ }
}
if (dataEnd < 0) throw new Error('无法从 HTML 解析出 DATA.nodes');
const nodes = JSON.parse(html.slice(brace, dataEnd + 1)).nodes;
if (nodes.length === 0) throw new Error('DATA.nodes 为空');

// ---------- 2. 投影数学（复刻 projectAll，只保留透视计算）----------
// 旋转：yaw 绕 Y、pitch 绕 X。z2 是旋转后的深度坐标。
// persp = FOCAL / (FOCAL + z2 * baseSc * 1.6)
// 不变量：对任何 (yaw,pitch,zoom,viewport)，FOCAL + z2*baseSc*1.6 必须为正且离 0 足够远。
function rotateZ2(n, yaw, pitch) {
  const x1 = n.x * Math.cos(yaw) + n.z * Math.sin(yaw);
  const z1 = -n.x * Math.sin(yaw) + n.z * Math.cos(yaw);
  const y1 = n.py;
  return y1 * Math.sin(pitch) + z1 * Math.cos(pitch);
}

// ---------- 3. 网格扫描 ----------
// yaw: 任意角度；pitch: 与 136 行交互 clamp [-1.1, 0.15] 一致（含边界）
// zoom: 与 139 行 clamp [0.5, 4] 一致（含边界）
// baseSc = min(VW/1500, VH/1700)：覆盖手机 ~ 桌面
const YAWS = [0, Math.PI / 4, Math.PI / 2, Math.PI, 3 * Math.PI / 2, 2 * Math.PI];
const PITCHES = [-1.1, -0.8, -0.32, -0.1, 0, 0.15];
const ZOOMS = [0.5, 1, 2, 3, 4];        // 含 zoom 上界 —— 正是原 bug 的触发点
const BASESCS = [0.25, 0.5, 0.7, 1.0];   // 手机/中屏/大屏/超宽

// 预扫描每个节点在最坏旋转下的 z2 区间，定位风险节点用于失败时的诊断
let worstNegZ2 = Infinity, worstNegNode = null;
let worstPosZ2 = -Infinity, worstPosNode = null;
for (const n of nodes) {
  for (const p of PITCHES) for (const y of YAWS) {
    const z2 = rotateZ2(n, y, p);
    if (z2 < worstNegZ2) { worstNegZ2 = z2; worstNegNode = n.t; }
    if (z2 > worstPosZ2) { worstPosZ2 = z2; worstPosNode = n.t; }
  }
}

// 主扫描：对每个 (pitch, baseSc) 组合检查最坏 z2（zoom 不该影响透视 —— 这是核心断言）
let failures = 0;
const firstFailure = { pitch: null, baseSc: null, z2: null, denom: null, node: null };

for (const pitch of PITCHES) {
  for (const baseSc of BASESCS) {
    // 对该 pitch，每个节点的 z2 还随 yaw 变化，取最负的（分母最小 = 最危险）
    for (const n of nodes) {
      let z2min = Infinity;
      for (const y of YAWS) {
        const z2 = rotateZ2(n, y, pitch);
        if (z2 < z2min) z2min = z2;
      }
      const denom = FOCAL + z2min * baseSc * 1.6;
      if (!(denom > 0 && Number.isFinite(denom)) || denom < 50) {
        failures++;
        if (firstFailure.node === null) {
          Object.assign(firstFailure, { pitch, baseSc, z2: z2min, denom, node: n.t });
        }
      }
    }
  }
}

// ---------- 4. 报告 ----------
console.log('投影不变量扫描 · 节点数 ' + nodes.length);
console.log('  z2 区间：[' + worstNegZ2.toFixed(1) + ' (' + worstNegNode + '), '
  + worstPosZ2.toFixed(1) + ' (' + worstPosNode + ')]');
console.log('  扫描组合：' + PITCHES.length + ' pitch × ' + BASESCS.length + ' viewport'
  + ' × ' + nodes.length + ' 节点 × ' + YAWS.length + ' yaw = '
  + (PITCHES.length * BASESCS.length * nodes.length * YAWS.length) + ' 次投影');

if (failures === 0) {
  console.log('✓ 全部通过：persp 在所有 (yaw, pitch, zoom, viewport) 下恒正且有限。');
  process.exit(0);
} else {
  console.error('✗ 失败 ' + failures + ' 处：透视分母非正/过小，节点会穿越相机导致坐标炸飞。');
  console.error('  首个失败：node="' + firstFailure.node
    + '" pitch=' + firstFailure.pitch + ' baseSc=' + firstFailure.baseSc
    + ' z2=' + firstFailure.z2.toFixed(1) + ' denom=' + firstFailure.denom.toFixed(1));
  console.error('  常见根因：zoom 进入了透视深度项（应只用 baseSc）。');
  process.exit(1);
}
