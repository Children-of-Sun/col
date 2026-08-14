#!/usr/bin/env node
/**
 * data.json 手工整理补丁（本地文件版）
 *
 * 用途：上游数据更新后，对本地 data.json 重新应用手工整理。
 * 自动下载+更新请用：node scripts/updateDataJson.mjs
 *
 * 用法：
 *   node scripts/patchDataJson.mjs <输入.json> [输出.json]
 *     - 省略输出文件时原地写回输入文件
 *   node scripts/patchDataJson.mjs --check <输入.json>
 *     - 只打印将要执行的操作，不写文件
 *
 * 示例：
 *   node scripts/patchDataJson.mjs data_new.json public/data.json
 *   node scripts/patchDataJson.mjs --check public/data123.json
 *
 * 说明：
 *   - 幂等：已整理过的文件再次运行不会有任何改动
 *   - 容错：目标不存在时打印警告并跳过，不中断
 *   - 整理规则见 scripts/dataPatchCore.mjs 中的 CURATIONS
 */

import fs from 'node:fs';
import { applyPatch } from './dataPatchCore.mjs';

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const paths = args.filter(a => a !== '--check');

if (paths.length < 1 || paths.length > 2) {
  console.error(`
用法:
  node scripts/patchDataJson.mjs <输入.json> [输出.json]
  node scripts/patchDataJson.mjs --check <输入.json>
`);
  process.exit(1);
}

const inputPath = paths[0];
const outputPath = paths[1] || inputPath;

const raw = fs.readFileSync(inputPath, 'utf8');
const data = JSON.parse(raw);

console.log(`== data.json 手工整理补丁 (${checkOnly ? '检查模式' : '应用模式'}) ==`);
console.log(`输入: ${inputPath}`);
const logs = [];
applyPatch(data, msg => { logs.push(msg); console.log(msg); });

if (logs.every(l => l.startsWith('[跳过]'))) {
  console.log('== 无需要修改的内容（可能已整理过） ==');
}

if (!checkOnly) {
  // 与原文件格式保持一致（4 空格缩进，无末尾换行），减少无谓的 git 差异
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 4));
  console.log(`\n已写入: ${outputPath}`);
} else {
  console.log('\n(--check 模式，未写入任何文件)');
}
