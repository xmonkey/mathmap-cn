#!/usr/bin/env node
/**
 * build-cn-graph.mjs — 生成完全自研的可视化页面（支持 4 套主题）。
 *
 * 渲染引擎全部原创（Canvas 2D + 手写 3D 透视投影），可自由发布。
 * 坐标只算一次，4 个主题共享同一布局，保证对比公平。
 *
 *   node scripts/build-cn-graph.mjs           生成全部 4 主题
 *   node scripts/build-cn-graph.mjs tech       只生成 tech 主题
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TOPICS_DIR = resolve(ROOT, 'data', 'topics');
const DEPS_DIR = resolve(ROOT, 'data', 'dependencies');

// ---------- 1. 加载数据 ----------
const topics = [];
for (const f of readdirSync(TOPICS_DIR).filter(f => f.endsWith('.json'))) {
  topics.push(...JSON.parse(readFileSync(resolve(TOPICS_DIR, f), 'utf8')).topics);
}
const edges = [];
for (const f of readdirSync(DEPS_DIR).filter(f => f.endsWith('.json'))) {
  edges.push(...JSON.parse(readFileSync(resolve(DEPS_DIR, f), 'utf8')).dependencies);
}
const id2idx = new Map(topics.map((t, i) => [t.id, i]));
const DOMAINS = ['数与代数', '图形与几何', '统计与概率', '综合与实践'];
const H = 1400;
const STUDENT_NAME = process.env.STUDENT_NAME || '学生';

// ---------- 2. 坐标计算（只算一次）----------
const hash = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
const coords = topics.map(t => {
  const grade = t.gradeStart ?? 3;
  const yNorm = (grade - 1) / 11;  // grade 1→0, grade 12→1（覆盖高中）
  const jitter = (hash(t.id) % 1000) / 1000 * 0.08;
  const y = Math.max(0, Math.min(H, (yNorm + jitter) * H));
  return { x: (Math.random() - 0.5) * 400, z: (Math.random() - 0.5) * 400, y };
});
const REPULSE=2000, SPRING=75, SPRING_K=0.04, DAMP=0.82;
const ANGLES=[Math.PI/4, 5*Math.PI/4, 3*Math.PI/4, 7*Math.PI/4];
const CLUSTER_R=220, CLUSTER_K=0.09;
const MAX_R=280;
const degreeCount=new Array(topics.length).fill(0);
for(const e of edges){const a=id2idx.get(e.topicId),b=id2idx.get(e.prerequisiteId);if(a!=null)degreeCount[a]++;if(b!=null)degreeCount[b]++;}
for(let iter=0;iter<400;iter++){
  for(let i=0;i<topics.length;i++)for(let j=i+1;j<topics.length;j++){
    let dx=coords[i].x-coords[j].x,dz=coords[i].z-coords[j].z,d2=dx*dx+dz*dz+1,d=Math.sqrt(d2),f=REPULSE/d2;
    coords[i].x+=dx/d*f;coords[i].z+=dz/d*f;coords[j].x-=dx/d*f;coords[j].z-=dz/d*f;
  }
  for(const e of edges){
    const a=id2idx.get(e.topicId),b=id2idx.get(e.prerequisiteId);if(a==null||b==null)continue;
    const cross=topics[a].domain!==topics[b].domain;const sLen=cross?SPRING*3:SPRING;
    let dx=coords[a].x-coords[b].x,dz=coords[a].z-coords[b].z,d=Math.sqrt(dx*dx+dz*dz+1),f=(d-sLen)*SPRING_K;
    coords[a].x-=dx/d*f;coords[a].z-=dz/d*f;coords[b].x+=dx/d*f;coords[b].z+=dz/d*f;
  }
  for(let i=0;i<topics.length;i++){const g=DOMAINS.indexOf(topics[i].domain);if(g<0)continue;
    const tx=Math.cos(ANGLES[g])*CLUSTER_R,tz=Math.sin(ANGLES[g])*CLUSTER_R;
    coords[i].x+=(tx-coords[i].x)*CLUSTER_K;coords[i].z+=(tz-coords[i].z)*CLUSTER_K;}
  for(let i=0;i<coords.length;i++){const cf=0.025/(1+(degreeCount[i]||0)*0.2);coords[i].x=coords[i].x*DAMP-coords[i].x*cf;coords[i].z=coords[i].z*DAMP-coords[i].z*cf;}
  // 弹性边界：超出 MAX_R 的节点被平滑拉回（而非硬裁切）
  for(const c of coords){const r=Math.hypot(c.x,c.z);if(r>MAX_R){const pull=(r-MAX_R)*0.28;c.x-=c.x/r*pull;c.z-=c.z/r*pull;}}
}
coords.forEach(c=>{const r=Math.hypot(c.x,c.z);if(r>MAX_R){const s=MAX_R/r;c.x*=s;c.z*=s;}});
const TARGET_R=350;const finalScale=TARGET_R/MAX_R;
coords.forEach(c=>{c.x*=finalScale;c.z*=finalScale;});

// 确保 prerequisite.y ≤ topic.y（前置节点高度不超过后置节点）
for (let iter = 0; iter < 100; iter++) {
  let violations = 0;
  for (const e of edges) {
    const a = id2idx.get(e.topicId), b = id2idx.get(e.prerequisiteId);
    if (a == null || b == null) continue;
    if (coords[b].y > coords[a].y) {
      const mid = (coords[a].y + coords[b].y) / 2;
      coords[b].y = Math.max(0, mid - 1);
      coords[a].y = Math.min(H, mid + 1);
      violations++;
    }
  }
  if (violations === 0) break;
}

// ---------- 3. 数据对象 ----------
const hubCount = new Map();
for (const e of edges) hubCount.set(e.prerequisiteId, (hubCount.get(e.prerequisiteId) ?? 0) + 1);
const maxHub = Math.max(1, ...hubCount.values());
const baseNodes = topics.map((t, i) => ({
  x:+coords[i].x.toFixed(1), y:+coords[i].y.toFixed(1), z:+coords[i].z.toFixed(1),
  py:+(coords[i].y-H/2).toFixed(1), g:DOMAINS.indexOf(t.domain), grade:t.gradeStart??3,
  c:0.04+(hubCount.get(t.id)??0)/maxHub*0.42, dm:t.domain, t:t.name,
  desc:t.description, ev:t.evidence, q:(t.assessmentPrompt??'').replace(/\{\{name\}\}/g,STUDENT_NAME), type:t.type,
}));
const outEdges = edges.map(e => [id2idx.get(e.topicId), id2idx.get(e.prerequisiteId), e.strength==='hard'?1:0]);

// ---------- 4. 主题定义 ----------
const THEMES = {
  academic: { label:'A · 学术严谨', name:'数学课标图谱', tagline:'义务教育数学的知识脉络',
    bg:'#E2E8F0', panelBg:'rgba(255,255,255,.95)', border:'#94A3B8', text:'#0F172A', subText:'#475569', subText2:'#64748B',
    dcol:['#1E3A5F','#1B5E20','#7C2D12','#4A148C'], edgeBase:'30,45,75', edgeAlpha:0.35, nodeStroke:'71,85,105',
    fogBase:0.85, fogRange:0.15,
    font:'"Noto Serif SC","Source Han Serif SC","Songti SC",serif', chipBg:'rgba(255,255,255,.85)' },
  friendly: { label:'B · 亲和教育', name:'数学小图谱', tagline:'看见孩子学的每一步',
    bg:'#E0E7EF', panelBg:'rgba(255,255,255,.96)', border:'#94A3B8', text:'#0F172A', subText:'#475569', subText2:'#64748B',
    dcol:['#1D4ED8','#15803D','#C2410C','#BE185D'], edgeBase:'50,65,90', edgeAlpha:0.32, nodeStroke:'100,116,139',
    fogBase:0.82, fogRange:0.18,
    font:'"PingFang SC","Microsoft YaHei","Hiragino Sans GB",sans-serif', chipBg:'rgba(241,245,249,.9)' },
  tech: { label:'C · 科技数据', name:'中国 1-12 年级数学课程知识图谱', tagline:'270 个知识点的依赖脉络 · 覆盖义务教育与高中',
    bg:'#050816', panelBg:'rgba(5,8,22,.92)', border:'#1E293B', text:'#E2E8F0', subText:'#64748B', subText2:'#475569',
    dcol:['#60A5FA','#34D399','#FBBF24','#F472B6'], edgeBase:'140,155,195', edgeAlpha:0.22, nodeStroke:'8,10,18',
    fogBase:0.55, fogRange:0.45,
    font:'-apple-system,"PingFang SC","Microsoft YaHei",sans-serif', chipBg:'#1E293B' },
  cultural: { label:'D · 文化融合', name:'九章算图', tagline:'从《九章算术》到 2022 课标',
    bg:'#E8DCC4', panelBg:'rgba(252,247,238,.96)', border:'#A08850', text:'#2A1F0E', subText:'#6B5530', subText2:'#8B7340',
    dcol:['#1A1A1A','#9B1B1B','#8B6914','#1B4332'], edgeBase:'60,48,28', edgeAlpha:0.38, nodeStroke:'90,72,44',
    fogBase:0.85, fogRange:0.15,
    font:'"STKaiti","KaiTi","Songti SC","Noto Serif SC",serif', chipBg:'rgba(212,197,160,.5)' },
};

// ---------- 5. 生成 HTML 的函数 ----------
function buildHTML(theme) {
  const nodes = baseNodes.map((n, i) => ({...n, col: theme.dcol[n.g] ?? '#888'}));
  const dataJson = JSON.stringify({domains:DOMAINS, dcol:theme.dcol, H, nodes, edges:outEdges});
  const T = theme;
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${T.name}</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='14' fill='%23050816'/><circle cx='20' cy='20' r='8' fill='%2360A5FA'/><circle cx='44' cy='44' r='8' fill='%2334D399'/></svg>">
<meta property="og:title" content="${T.name}">
<meta property="og:description" content="${T.tagline} · 270 微主题 · 326 依赖">
<meta property="og:type" content="website">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:${T.font};background:${T.bg};color:${T.text};overflow:hidden}
#stage{width:100vw;height:100vh;display:block;cursor:grab}
#stage.drag{cursor:grabbing}
canvas{display:block}
.legend{position:fixed;top:16px;left:16px;background:${T.panelBg};border:1px solid ${T.border};border-radius:12px;padding:14px 18px;backdrop-filter:blur(8px);z-index:10;max-width:280px;transition:opacity .2s}
.legend.collapsed{opacity:0;pointer-events:none}
.legend-toggle{position:fixed;top:16px;left:16px;width:36px;height:36px;border-radius:8px;background:${T.panelBg};border:1px solid ${T.border};color:${T.text};font-size:20px;display:none;align-items:center;justify-content:center;cursor:pointer;z-index:11;backdrop-filter:blur(8px)}
.legend-toggle.visible{display:flex}
@media(max-width:600px){.legend{max-width:calc(100vw - 32px);margin-left:44px}}
.legend h1{font-size:15px;font-weight:600;margin-bottom:4px;color:${T.text}}
.legend .tag{font-size:11px;color:${T.subText};margin-bottom:8px}
.chip{display:inline-flex;align-items:center;gap:6px;font-size:13px;margin:3px;padding:4px 10px;border-radius:14px;background:${T.chipBg};cursor:pointer;user-select:none;transition:all .15s}
.chip:hover{opacity:.8}.chip.off{opacity:.35}.chip .dot{width:10px;height:10px;border-radius:50%}.chip .cnt{font-size:11px;color:${T.subText2}}
.legend .meta{font-size:11px;color:${T.subText2};margin-top:8px;line-height:1.6}
.tip{position:fixed;background:${T.panelBg};border:1px solid ${T.border};border-radius:10px;padding:10px 14px;z-index:20;pointer-events:none;opacity:0;transition:opacity .12s;max-width:280px}
.tip.on{opacity:1}.tip .tdm{font-size:11px;color:${T.subText}}.tip .ttitle{font-size:14px;color:${T.text};margin:2px 0;font-weight:500}.tip .tq{font-size:12px;color:${T.subText};margin-top:4px;line-height:1.5}
.panel{position:fixed;top:16px;right:16px;width:360px;max-height:calc(100vh - 32px);overflow-y:auto;background:${T.panelBg};border:1px solid ${T.border};border-radius:14px;padding:20px;backdrop-filter:blur(8px);z-index:10;opacity:0;transform:translateX(16px);transition:all .2s;pointer-events:none}
.panel.on{opacity:1;transform:translateX(0);pointer-events:auto}
.panel h2{font-size:18px;color:${T.text};line-height:1.3;margin-bottom:6px}
.panel .badges{margin-bottom:8px}.panel .b{display:inline-block;font-size:11px;padding:2px 8px;border-radius:10px;margin:2px 4px 2px 0}
.panel .b-dom{color:#fff;font-weight:600}.panel .b-grade{background:${T.chipBg};color:${T.subText}}.panel .b-type{background:${T.chipBg};color:${T.subText2}}
.panel h3{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:${T.subText2};margin:14px 0 6px}
.panel p{font-size:14px;line-height:1.65;color:${T.text}}.panel ul{margin:4px 0 4px 18px}.panel li{font-size:13px;line-height:1.7;color:${T.text}}
.panel .prompt{background:${T.chipBg};border-left:3px solid ${T.border};padding:10px 12px;border-radius:0 8px 8px 0;font-size:13px;color:${T.text};line-height:1.5}
.panel .pre-list{max-height:200px;overflow-y:auto}.panel .pre-item{display:block;width:100%;text-align:left;background:none;border:none;color:${T.text};padding:6px 8px;border-radius:6px;cursor:pointer;font-size:13px}
.panel .pre-item:hover{background:${T.chipBg}}.panel .pre-tag{display:inline-block;font-size:10px;padding:1px 6px;border-radius:8px;margin-right:6px}
.panel .close{position:absolute;top:14px;right:16px;color:${T.subText2};font-size:22px;cursor:pointer;background:none;border:none}
.panel .close:hover{color:${T.text}}
.hint{position:fixed;bottom:48px;left:50%;transform:translateX(-50%);font-size:11px;color:${T.subText2};z-index:5}
.brand{position:fixed;bottom:16px;left:16px;font-size:16px;color:${T.subText};z-index:5;line-height:1.6;max-width:60vw}
.brand a{color:${T.subText};cursor:pointer;text-decoration:underline}
.brand a:hover{color:${T.text}}
.about-bg{position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,.4);z-index:25;opacity:0;pointer-events:none;transition:opacity .2s}
.about-bg.on{opacity:1;pointer-events:auto}
.about{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:420px;max-width:90vw;max-height:80vh;overflow-y:auto;background:${T.panelBg};border:1px solid ${T.border};border-radius:14px;padding:28px;backdrop-filter:blur(12px);z-index:30;opacity:0;pointer-events:none;transition:opacity .2s}
.about.on{opacity:1;pointer-events:auto}
.about h2{font-size:20px;color:${T.text};margin-bottom:12px}
.about p{font-size:14px;color:${T.subText};line-height:1.8}
.about h3{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:${T.subText2};margin:16px 0 6px}
.about a{color:${T.text};text-decoration:underline}
.about .close{position:absolute;top:14px;right:16px;color:${T.subText2};font-size:22px;cursor:pointer;background:none;border:none}
.about .close:hover{color:${T.text}}
</style></head><body>
<div class="legend-toggle" id="legendToggle">☰</div>
<div class="legend" id="legend"><h1>${T.name}</h1><div class="tag">${T.tagline}</div><div id="chips"></div><div style="margin-top:6px;font-size:11px;color:${T.subText2}">年级</div><div id="stageChips"></div>
<div class="meta"><span id="nCount"></span> 个微主题 · <span id="eCount"></span> 条依赖<br>高度 = 年级 · 颜色 = 领域<br>节点大小 = 被依赖次数<br><a id="aboutLink" style="color:${T.subText2};cursor:pointer;text-decoration:underline">关于</a></div></div>
<div class="tip" id="tip"><div class="tdm" id="tipDm"></div><div class="ttitle" id="tipTitle"></div><div class="tq" id="tipQ"></div></div>
<div class="panel" id="panel"></div>
<div class="hint">拖拽旋转 · 滚轮缩放 · 点击节点追溯前置链</div>
<div class="brand"><a href="https://xmonkey.github.io/mathmap-cn/" target="_blank" style="color:${T.subText};text-decoration:underline">xmonkey.github.io/mathmap-cn</a> · by <a href="https://www.zhihu.com/people/xmonkey" target="_blank" style="color:${T.subText};text-decoration:underline">Xiao Bin</a></div>
<div class="about-bg" id="aboutBg"></div>
<div class="about" id="about"><button class="close" id="aboutClose">×</button>
<h2>中国 1-12 年级数学课程知识图谱</h2>
<p>270 个微主题 · 327 条依赖 · 123 课标条目<br>覆盖义务教育（1-9 年级）与高中（10-12 年级）</p>
<h3>数据来源</h3>
<p>·《义务教育数学课程标准（2022 年版）》— 教育部<br>·《普通高中数学课程标准（2017 年版 2020 年修订）》— 教育部<br>· 课标仅使用代码和标题，不包含原文</p>
<h3>致谢</h3>
<p>· <a href="https://github.com/withmarbleapp/os-taxonomy" target="_blank">Marble Skill Taxonomy</a> — 数据模型与可视化灵感<br>· <a href="https://github.com/jethac/os-taxonomy-japanese" target="_blank">os-taxonomy-japanese</a> — 工程实践参考</p>
<h3>作者</h3><p><a href="https://www.zhihu.com/people/xmonkey" target="_blank">肖斌 (Xiao Bin)</a></p>
<h3>项目主页</h3><p><a href="https://xmonkey.github.io/mathmap-cn/" target="_blank">xmonkey.github.io/mathmap-cn</a><br><a href="https://github.com/xmonkey/mathmap-cn" target="_blank">github.com/xmonkey/mathmap-cn</a></p>
<h3>许可证</h3><p>代码 MIT · 数据内容 CC BY-SA 4.0<br>课标版权归教育部/人教社所有</p>
</div>
<canvas id="stage"></canvas>
<script>
(function(){'use strict';
const DATA=${dataJson};const N=DATA.nodes,E=DATA.edges;const DOMAINS=DATA.domains,DCOL=DATA.dcol;
const incident=Array.from({length:N.length},()=>[]);E.forEach((e,i)=>{incident[e[0]].push(i);incident[e[1]].push(i)});
function buildClosure(s){const nodes=new Set([s]),edges=new Set(),q=[s];while(q.length){const u=q.shift();for(const ei of incident[u]){const e=E[ei];if(e[0]===u){edges.add(ei);if(!nodes.has(e[1])){nodes.add(e[1]);q.push(e[1])}}}}return{nodes,edges}}
function hexRgb(h){const n=parseInt(h.slice(1),16);return[(n>>16)&255,(n>>8)&255,n&255]}const rgb=N.map(n=>hexRgb(n.col));
const cv=document.getElementById('stage'),ctx=cv.getContext('2d');let DPR=1,VW=0,VH=0;
const BG='${T.bg}';const EDGE_ALPHA=${T.edgeAlpha};const NODE_STROKE='${T.nodeStroke}';const FOG_BASE=${T.fogBase};const FOG_RANGE=${T.fogRange};const EDGE_COL=[${T.edgeBase}];
function resize(){DPR=Math.min(window.devicePixelRatio||1,2);VW=window.innerWidth;VH=window.innerHeight;cv.width=VW*DPR;cv.height=VH*DPR;cv.style.width=VW+'px';cv.style.height=VH+'px'}
let yaw=0.6,pitch=-0.32,zoom=1,autoSpin=true;const SPIN=0.0002,FOCAL=1400;let focusTween=null;
let grow=0;const GROW_MS=2000;const ANIM_START=performance.now();
let growDone=false;
let cameraTween=null;
let displayGrade=12;
const proj=new Float32Array(N.length*3);
function projectAll(){const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch),cx=VW*0.5,cyc=VH*0.52,baseSc=Math.min(VW/1500,VH/1700),sc=baseSc*zoom;
// 透视只用 baseSc（不含 zoom），保证 FOCAL+z2*baseSc*1.6 永远为正；
// zoom 只对屏幕坐标做线性放大，不进入深度项，避免放大到极致时节点穿越相机导致投影崩溃。
for(let i=0;i<N.length;i++){const n=N[i];const x1=n.x*cy+n.z*sy,z1=-n.x*sy+n.z*cy,y1=n.py;const y2=y1*cp-z1*sp,z2=y1*sp+z1*cp;const persp=FOCAL/(FOCAL+z2*baseSc*1.6);
proj[i*3]=cx+x1*sc*persp;proj[i*3+1]=cyc-y2*sc*persp;proj[i*3+2]=persp}}
function nodeRad(i){const c=N[i].c||0.05;return(2.5+Math.sqrt(c)*8)*proj[i*3+2]*Math.min(1.6,Math.max(0.9,zoom))}
function pickAt(mx,my){let best=-1,bestD=18*18;for(let i=0;i<N.length;i++){if(!active.has(N[i].g)||!inStage(N[i].grade))continue;const dx=proj[i*3]-mx,dy=proj[i*3+1]-my,d=dx*dx+dy*dy,rr=Math.max(13,nodeRad(i)+5);if(d<rr*rr&&d<bestD){bestD=d;best=i}}return best}
const FILTERS=[{n:'1-2年级',a:1,b:2},{n:'3-4年级',a:3,b:4},{n:'5-6年级',a:5,b:6},{n:'7-9年级',a:7,b:9},{n:'高中',a:10,b:12}];const activeFilters=new Set([0,1,2,3,4]);function inStage(g){for(let i=0;i<FILTERS.length;i++){if(activeFilters.has(i)&&g>=FILTERS[i].a&&g<=FILTERS[i].b)return true}return false}
const active=new Set(DOMAINS.map((_,i)=>i));let hover=-1,selected=-1,lineage=null;
const order=N.map((_,i)=>i);
function draw(){ctx.setTransform(DPR,0,0,DPR,0,0);ctx.fillStyle=BG;ctx.fillRect(0,0,VW,VH);projectAll();const hasSel=!!lineage;
ctx.lineCap='round';
for(let k=0;k<E.length;k++){const e=E[k],a=e[0],b=e[1];if(!active.has(N[a].g)||!active.has(N[b].g)||!inStage(N[a].grade)||!inStage(N[b].grade)||N[a].grade/12>grow||N[b].grade/12>grow||N[a].grade>displayGrade||N[b].grade>displayGrade)continue;
let alpha,col;if(hasSel){if(lineage.edges.has(k)){alpha=0.72;col=rgb[b]}else{alpha=0.04;col=EDGE_COL}}else{alpha=e[2]?EDGE_ALPHA:EDGE_ALPHA*0.5;col=EDGE_COL}
const depth=(proj[a*3+2]+proj[b*3+2])/2;
ctx.strokeStyle='rgba('+col[0]+','+col[1]+','+col[2]+','+(alpha*depth)+')';
ctx.lineWidth=e[2]?1.1:0.5;ctx.setLineDash(e[2]?[]:[3,3]);
ctx.beginPath();ctx.moveTo(proj[a*3],proj[a*3+1]);ctx.lineTo(proj[b*3],proj[b*3+1]);ctx.stroke()}
ctx.setLineDash([]);
order.sort((a,b)=>proj[a*3+2]-proj[b*3+2]);
for(const i of order){const n=N[i];if(!active.has(n.g)||!inStage(n.grade)||n.grade/12>grow||n.grade>displayGrade)continue;const inLin=hasSel?lineage.nodes.has(i):true;const isFocus=(i===selected)||(i===hover);const dim=(hasSel&&!inLin)?0.1:1;
const sx=proj[i*3],sy=proj[i*3+1],pf=proj[i*3+2];const r=nodeRad(i)*(isFocus?1.5:1);const c=rgb[i];const a=dim*(FOG_BASE+FOG_RANGE*Math.min(1,pf*pf));
if(isFocus||(hasSel&&inLin)){ctx.shadowColor='rgba('+c[0]+','+c[1]+','+c[2]+',1)';ctx.shadowBlur=isFocus?20:10}else{ctx.shadowBlur=0}
ctx.fillStyle='rgba('+c[0]+','+c[1]+','+c[2]+','+a+')';ctx.beginPath();ctx.arc(sx,sy,r,0,6.2832);ctx.fill();ctx.shadowBlur=0;
ctx.strokeStyle='rgba('+NODE_STROKE+','+(0.5*dim)+')';ctx.lineWidth=1;ctx.stroke();
if(isFocus){ctx.strokeStyle='rgba(128,128,128,.9)';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(sx,sy,r+2.5,0,6.2832);ctx.stroke()}}}
let lastTs=performance.now();
function frame(ts){const dt=Math.min(64,ts-lastTs);lastTs=ts;
grow=Math.min(1,(performance.now()-ANIM_START)/GROW_MS);
if(grow<1||!growDone){const cg=grow*12;const chips=document.querySelectorAll('#stageChips .chip');FILTERS.forEach((f,i)=>{if(chips[i])chips[i].style.opacity=f.a>cg?'0.25':''});if(grow>=1)growDone=true;}
if(autoSpin&&selected<0&&hover<0&&grow>=1)yaw+=SPIN*dt;
if(focusTween){let d=((focusTween.yaw-yaw+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;yaw+=d*0.12;pitch+=(focusTween.pitch-pitch)*0.12;zoom+=(focusTween.zoom-zoom)*0.12;if(Math.abs(d)<0.01)focusTween=null}
if(cameraTween){const t=Math.min(1,(performance.now()-cameraTween.start)/cameraTween.ms);const e=t*t*(3-2*t);yaw=cameraTween.sy+(cameraTween.ty-cameraTween.sy)*e;pitch=cameraTween.sp+(cameraTween.tp-cameraTween.sp)*e;zoom=cameraTween.sz+(cameraTween.tz-cameraTween.sz)*e;if(t>=1)cameraTween=null}
draw();requestAnimationFrame(frame)}
const tip=document.getElementById('tip'),tipDm=document.getElementById('tipDm'),tipTitle=document.getElementById('tipTitle'),tipQ=document.getElementById('tipQ');
function showTip(i,e){const n=N[i];tipDm.textContent=n.dm+' · '+n.grade+'年级';tipTitle.textContent=n.t;tipQ.textContent=n.q||'';tip.classList.add('on');moveTip(e)}
function moveTip(e){const w=tip.offsetWidth,h=tip.offsetHeight;let x=e.clientX+16,y=e.clientY+16;if(x+w>VW-8)x=e.clientX-w-16;if(y+h>VH-8)y=e.clientY-h-16;tip.style.left=x+'px';tip.style.top=y+'px'}
function hideTip(){tip.classList.remove('on')}
const panel=document.getElementById('panel');const typeMap={CONCEPTUAL:'概念',PROCEDURAL:'运算',REPRESENTATIONAL:'表征',LANGUAGE:'语言',META:'综合'};
function showPanel(i){const n=N[i];const closure=lineage?lineage.nodes.size-1:0;const directPre=incident[i].filter(ei=>E[ei][0]===i).map(ei=>E[ei][1]);directPre.sort((a,b)=>N[a].grade-N[b].grade);
const preHtml=directPre.length?directPre.map(j=>{const ei=incident[i].find(e=>E[e][0]===i&&E[e][1]===j);const hard=ei!=null&&E[ei][2];
return'<button class="pre-item" data-i="'+j+'"><span class="pre-tag" style="background:rgba(128,128,128,.15);color:${T.subText}">'+(hard?'hard':'soft')+'</span><span style="color:'+DCOL[N[j].g]+'">●</span> '+N[j].t+' <span style="opacity:.5">('+N[j].grade+'年级)</span></button>'}).join(''):'<div style="opacity:.5;font-size:13px">无 — 这是基础节点</div>';
panel.innerHTML='<button class="close" id="pClose">×</button><h2>'+n.t+'</h2><div class="badges"><span class="b b-dom" style="background:'+n.col+'">'+n.dm+'</span><span class="b b-grade">'+n.grade+'年级</span><span class="b b-type">'+(typeMap[n.type]||n.type)+'</span></div><h3>描述</h3><p>'+n.desc+'</p><h3>掌握判据</h3><ul>'+n.ev.map(e=>'<li>'+e+'</li>').join('')+'</ul>'+(n.q?'<h3>评估提示</h3><div class="prompt">'+n.q+'</div>':'')+'<h3>直接前置 ('+directPre.length+')</h3><div class="pre-list">'+preHtml+'</div>';
panel.classList.add('on');document.getElementById('pClose').onclick=clearSel;panel.querySelectorAll('.pre-item').forEach(btn=>{btn.onclick=()=>selectNode(+btn.dataset.i,true)})}
function selectNode(i,push){selected=i;lineage=buildClosure(i);showPanel(i);const n=N[i];const cs=lineage.nodes.size;const tz=cs>30?0.55:cs>15?0.7:cs>5?0.9:1.2;focusTween={yaw:Math.atan2(-n.x,n.z),pitch:-0.15,zoom:Math.min(Math.max(zoom,0.9),tz)};hideTip()}
function clearSel(){selected=-1;lineage=null;panel.classList.remove('on')}
let dragging=false,moved=false,lx=0,ly=0;
cv.addEventListener('pointerdown',e=>{dragging=true;moved=false;lx=e.clientX;ly=e.clientY;cv.classList.add('drag');cv.setPointerCapture(e.pointerId)});
cv.addEventListener('pointermove',e=>{if(dragging){const dx=e.clientX-lx,dy=e.clientY-ly;if(Math.abs(dx)+Math.abs(dy)>3)moved=true;yaw+=dx*0.0055;pitch=Math.max(-1.1,Math.min(0.15,pitch-dy*0.003));lx=e.clientX;ly=e.clientY}else{const r=cv.getBoundingClientRect();const i=pickAt(e.clientX-r.left,e.clientY-r.top);if(i!==hover){hover=i;if(i>=0)showTip(i,e);else hideTip()}else if(i>=0)moveTip(e)}});
cv.addEventListener('pointerup',e=>{dragging=false;cv.classList.remove('drag');if(!moved){const r=cv.getBoundingClientRect();const i=pickAt(e.clientX-r.left,e.clientY-r.top);if(i>=0)selectNode(i,true);else clearSel()}});
cv.addEventListener('pointerleave',()=>{hideTip();hover=-1});
cv.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(0.5,Math.min(4,zoom*Math.exp(-e.deltaY*0.0016)))},{passive:false});
const chipsEl=document.getElementById('chips');const counts=DOMAINS.map(()=>0);N.forEach(n=>counts[n.g]++);
DOMAINS.forEach((d,i)=>{const el=document.createElement('div');el.className='chip';el.innerHTML='<span class="dot" style="background:'+DCOL[i]+'"></span>'+d+'<span class="cnt">'+counts[i]+'</span>';el.onclick=()=>{if(active.has(i)){active.delete(i);el.classList.add('off')}else{active.add(i);el.classList.remove('off')}};chipsEl.appendChild(el)});
const stageChipsEl=document.getElementById('stageChips');FILTERS.forEach((f,i)=>{const cnt=N.filter(n=>n.grade>=f.a&&n.grade<=f.b).length;const el=document.createElement('div');el.className='chip';el.innerHTML=f.n+'<span class="cnt">'+cnt+'</span>';el.onclick=()=>{if(activeFilters.has(i)){activeFilters.delete(i);el.classList.add('off')}else{activeFilters.add(i);el.classList.remove('off')}};stageChipsEl.appendChild(el)});
document.getElementById('nCount').textContent=N.length;document.getElementById('eCount').textContent=E.length;
const legendEl=document.getElementById('legend'),legendToggle=document.getElementById('legendToggle');
function checkMobile(){const m=window.innerWidth<=600;if(m){legendToggle.classList.add('visible');legendEl.classList.add('collapsed')}else{legendToggle.classList.remove('visible');legendEl.classList.remove('collapsed')}}
legendToggle.onclick=()=>{legendEl.classList.toggle('collapsed')};
checkMobile();window.addEventListener('resize',checkMobile);
const aboutEl=document.getElementById('about'),aboutBgEl=document.getElementById('aboutBg');
document.getElementById('aboutLink').onclick=()=>{aboutEl.classList.add('on');aboutBgEl.classList.add('on')};
document.getElementById('aboutClose').onclick=()=>{aboutEl.classList.remove('on');aboutBgEl.classList.remove('on')};
aboutBgEl.onclick=()=>{aboutEl.classList.remove('on');aboutBgEl.classList.remove('on')};
window.addEventListener('resize',resize);resize();requestAnimationFrame(frame);
// 暴露给外部脚本（demo/测试）的控制接口
window.__selectByName=function(name){const i=N.findIndex(n=>n.t.includes(name));if(i>=0)selectNode(i,true);return i>=0};
window.__clickFirstPre=function(){const btn=document.querySelector('.pre-item');if(btn){btn.click();return true}return false};
window.__clearSel=clearSel;
window.__setCamera=function(y,p,z){autoSpin=false;if(y!=null)yaw=y;if(p!=null)pitch=p;if(z!=null)zoom=z};
window.__autoSpin=function(on){autoSpin=on};
window.__tweenCamera=function(y,p,z,ms){autoSpin=false;cameraTween={sy:yaw,sp:pitch,sz:zoom,ty:y,tp:p,tz:z,start:performance.now(),ms:ms||1000}};
window.__setDisplayGrade=function(g){displayGrade=g;const chips=document.querySelectorAll('#stageChips .chip');FILTERS.forEach((f,i)=>{if(chips[i]){chips[i].style.opacity=f.a>g?'0.25':''}})};
window.__getNodePos=function(name){const i=N.findIndex(n=>n.t.includes(name));if(i<0)return null;return{x:Math.round(proj[i*3]+cv.getBoundingClientRect().left),y:Math.round(proj[i*3+1]+cv.getBoundingClientRect().top)}};
window.__getChipPos=function(idx){const els=document.querySelectorAll('#chips .chip');if(!els[idx])return null;const r=els[idx].getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}};
})();
</script></body></html>`;
}

// ---------- 6. 生成 ----------
mkdirSync(resolve(ROOT, 'viz'), { recursive: true });
const want = process.argv[2]; // 可选：指定单个主题
const targets = want ? [want] : Object.keys(THEMES);
for (const key of targets) {
  const theme = THEMES[key];
  if (!theme) { console.error('未知主题：' + key); continue; }
  const out = resolve(ROOT, 'viz', `theme-${key}.html`);
  const html = buildHTML(theme);
  writeFileSync(out, html, 'utf8');
  console.log(`✓ ${theme.label} → viz/theme-${key}.html`);
  if (key === 'tech') {
    writeFileSync(resolve(ROOT, 'viz', 'cn-graph.html'), html, 'utf8');
    console.log(`  ↳ tech 亦输出为 viz/cn-graph.html（默认入口）`);
  }
}
console.log(`\n共 ${targets.length} 个主题 · ${baseNodes.length} 节点 · ${outEdges.length} 边`);
