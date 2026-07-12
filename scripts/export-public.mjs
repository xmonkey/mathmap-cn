#!/usr/bin/env node
/**
 * export-public.mjs — 一键导出可发布版本。
 *
 * 扫描 data/standards-raw/*.json，对每条记录：
 *   1. 删除 verbatimText 字段
 *   2. 过滤掉 publishable === false 的条目（默认）
 *      使用 --keep-unpublishable 保留条目但删除 verbatimText
 *   3. 更新 textIncluded=false, licenseStatus='clear'
 *
 * 输出到 data/standards-public/*.json
 *
 *   node scripts/export-public.mjs
 *   node scripts/export-public.mjs --keep-unpublishable
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW_DIR = resolve(ROOT, 'data', 'standards-raw');
const PUB_DIR = resolve(ROOT, 'data', 'standards-public');
const keepUnpub = process.argv.includes('--keep-unpublishable');

mkdirSync(PUB_DIR, { recursive: true });

const files = readdirSync(RAW_DIR).filter(f => f.endsWith('.json'));
let stripped = 0;
let dropped = 0;
let kept = 0;

for (const file of files) {
  const doc = JSON.parse(readFileSync(resolve(RAW_DIR, file), 'utf8'));

  const cleanedItems = [];
  for (const item of doc.items ?? []) {
    const hadVerbatim = typeof item.verbatimText === 'string' && item.verbatimText.length > 0;
    if (hadVerbatim) stripped++;

    if (!item.publishable && !keepUnpub) {
      dropped++;
      continue;
    }

    // 剥离原文字段
    const { verbatimText, ...rest } = item;
    cleanedItems.push(rest);
    kept++;
  }

  const out = {
    ...doc,
    _internalNotice: undefined,
    textIncluded: false,
    licenseStatus: 'clear',
    itemCount: cleanedItems.length,
    items: cleanedItems,
    _exportNote: `由 export-public.mjs 于 ${new Date().toISOString()} 生成。verbatimText 已剥离。`,
  };

  writeFileSync(resolve(PUB_DIR, file), JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(`✓ ${file} → standards-public/ (${cleanedItems.length} 条)`);
}

console.log('');
console.log(`剥离 verbatimText：${stripped} 条`);
if (!keepUnpub) {
  console.log(`丢弃 publishable=false：${dropped} 条`);
}
console.log(`保留：${kept} 条`);
console.log('');
console.log('⚠️  发布前请人工抽查输出文件，确认不含任何原文片段。');
