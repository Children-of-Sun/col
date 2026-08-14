#!/usr/bin/env node
/**
 * data.json 自动更新脚本
 *
 * 一键完成：从上游仓库下载最新 machines_and_buildings.json
 *           → 自动应用手工整理补丁 → 写回 public/data.json
 *
 * 上游来源：https://github.com/David-Melo/captain-of-data
 *           data/machines_and_buildings.json
 *
 * 用法：
 *   node scripts/updateDataJson.mjs               # 下载+整理+更新 public/data.json
 *   node scripts/updateDataJson.mjs --check       # 只下载+整理并预览差异，不写文件
 *   node scripts/updateDataJson.mjs --input 本地.json   # 用本地文件模拟上游（离线调试用）
 *   node scripts/updateDataJson.mjs --url <URL>   # 指定上游地址
 *   node scripts/updateDataJson.mjs --output dist/data.json  # 指定输出位置（默认 public/data.json）
 *
 * 说明：
 *   - 写回前自动备份旧文件到 <输出>.bak
 *   - 若整理结果与现有文件完全一致，提示"已是最新"并跳过写入
 *   - 若上游结构变化导致补丁规则不适用，会打印警告，请核对 scripts/dataPatchCore.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { applyPatch, isSameData } from './dataPatchCore.mjs';

const DEFAULT_OUTPUT = 'public/data.json';

// 上游多源回退链：官方 raw 优先，镜像/CDN 兜底（国内网络 raw 常不可直连）
const DEFAULT_SOURCES = [
  {
    name: 'GitHub raw（官方）',
    url: 'https://raw.githubusercontent.com/David-Melo/captain-of-data/main/data/machines_and_buildings.json',
  },
  {
    name: 'jsDelivr CDN（有缓存延迟，备用）',
    url: 'https://cdn.jsdelivr.net/gh/David-Melo/captain-of-data@main/data/machines_and_buildings.json',
  },
  {
    name: 'ghfast.top 镜像',
    url: 'https://ghfast.top/https://raw.githubusercontent.com/David-Melo/captain-of-data/main/data/machines_and_buildings.json',
  },
  {
    name: 'gh-proxy.com 镜像',
    url: 'https://gh-proxy.com/https://raw.githubusercontent.com/David-Melo/captain-of-data/main/data/machines_and_buildings.json',
  },
];

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');

const getArg = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
};

const url = getArg('--url');                // 手动指定下载源（覆盖默认多源回退）
const inputFile = getArg('--input');        // 离线调试：用本地文件代替下载
const outputPath = getArg('--output') || DEFAULT_OUTPUT;

// 用系统 curl 下载（可识别 HTTPS_PROXY/HTTP_PROXY 环境变量；Node fetch 不读代理）
function downloadViaCurl(url) {
  return new Promise((resolve, reject) => {
    execFile('curl', ['-sL', '--connect-timeout', '15', '--max-time', '120', url],
      { maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' },
      (err, stdout) => {
        if (err) return reject(new Error(`curl 失败: ${err.message}`));
        if (!stdout.trim()) return reject(new Error('curl 返回空内容'));
        resolve(stdout);
      });
  });
}

// 按回退链逐个源下载，全部失败时给出可操作的错误提示
async function downloadAll() {
  const sources = url
    ? [{ name: '自定义 --url', url }]
    : DEFAULT_SOURCES;

  const lastErrMsgs = [];
  for (const s of sources) {
    console.log(`\n尝试下载 [${s.name}]\n  ${s.url}`);
    try {
      const resp = await fetch(s.url, { redirect: 'follow', signal: AbortSignal.timeout(60000) });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const text = await resp.text();
      const head = text.trimStart().slice(0, 200);
      if (!text.trim()) throw new Error('返回空内容');
      if (/^<!DOCTYPE|<html/i.test(head)) throw new Error('返回的是 HTML 错误页，不是 JSON');
      console.log(`✓ [${s.name}] 下载成功: ${(text.length / 1024).toFixed(0)} KB`);
      return text;
    } catch (e) {
      lastErrMsgs.push(`[${s.name}] ${e.message}`);
      console.warn(`✗ 失败: ${e.message}`);
    }
  }

  // fetch 全失败时，若设置了代理环境变量，最后用系统 curl 重试官方源
  const proxy = process.env.HTTPS_PROXY || process.env.HTTPS_PROXY_ || process.env.https_proxy
    || process.env.HTTP_PROXY || process.env.http_proxy;
  if (proxy) {
    const official = sources[0]?.url || url;
    console.log(`\n检测到代理环境变量，改用系统 curl 重试官方源（curl 会读取代理设置）...`);
    try {
      const text = await downloadViaCurl(official);
      console.log(`✓ [curl + 代理] 下载成功: ${(text.length / 1024).toFixed(0)} KB`);
      return text;
    } catch (e) {
      lastErrMsgs.push(`[curl+代理] ${e.message}`);
      console.warn(`✗ 失败: ${e.message}`);
    }
  }

  throw new Error(
    `所有下载源均失败：\n  ${lastErrMsgs.join('\n  ')}\n` +
    `请检查网络连接或代理；也可用镜像地址手动指定：\n` +
    `  node scripts/updateDataJson.mjs --url https://ghfast.top/https://raw.githubusercontent.com/David-Melo/captain-of-data/main/data/machines_and_buildings.json`
  );
}

async function main() {
  console.log('== data.json 自动更新 ==');

  let raw;
  if (inputFile) {
    console.log(`(离线模式) 读取本地上游: ${inputFile}`);
    raw = fs.readFileSync(inputFile, 'utf8');
  } else {
    raw = await downloadAll();
  }

  let upstream;
  try {
    upstream = JSON.parse(raw);
  } catch (e) {
    throw new Error(`上游文件不是合法 JSON: ${e.message}`);
  }
  if (!Array.isArray(upstream.machines_and_buildings)) {
    throw new Error('上游文件缺少 machines_and_buildings 数组（结构可能已变化，请检查上游仓库）');
  }

  console.log(`上游: game_version=${upstream.game_version ?? '未知'}  建筑数=${upstream.machines_and_buildings.length}`);

  // 应用手工整理补丁
  console.log('\n-- 应用手工整理 --');
  applyPatch(upstream, msg => console.log(msg));

  // 与现有文件对比
  const exists = fs.existsSync(outputPath);
  let current = null;
  if (exists) {
    try { current = JSON.parse(fs.readFileSync(outputPath, 'utf8')); } catch { /* 忽略损坏的现有文件 */ }
  }

  if (current && isSameData(upstream, current)) {
    console.log(`\n== 已是最新：整理结果与 ${outputPath} 完全一致，无需更新 ==`);
    return;
  }

  // 差异摘要
  console.log('\n-- 与现有文件差异 --');
  if (!current) {
    console.log(`(现有文件不存在: ${outputPath})`);
  } else {
    const oldVer = current.game_version ?? '未知';
    const newVer = upstream.game_version ?? '未知';
    if (oldVer !== newVer) console.log(`game_version: ${oldVer} => ${newVer}`);
    const oldN = current.machines_and_buildings?.length ?? 0;
    const newN = upstream.machines_and_buildings.length;
    if (oldN !== newN) console.log(`建筑数: ${oldN} => ${newN}`);
    const oldIds = new Set((current.machines_and_buildings || []).map(b => b.id));
    const newIds = new Set(upstream.machines_and_buildings.map(b => b.id));
    const added = [...newIds].filter(id => !oldIds.has(id));
    const removed = [...oldIds].filter(id => !newIds.has(id));
    if (added.length) console.log(`新增建筑: ${added.join(', ')}`);
    if (removed.length) console.log(`移除建筑: ${removed.join(', ')}`);
    if (oldVer === newVer && oldN === newN && added.length === 0 && removed.length === 0) {
      console.log('(无建筑级差异，仅有内容细节变化)');
    }
  }

  if (checkOnly) {
    console.log('\n(--check 模式，未写入任何文件)');
    return;
  }

  // 备份 + 写入（与原文件格式保持一致：4 空格缩进，无末尾换行）
  if (exists) {
    const bak = `${outputPath}.bak`;
    fs.copyFileSync(outputPath, bak);
    console.log(`已备份旧文件: ${bak}`);
  }
  fs.writeFileSync(outputPath, JSON.stringify(upstream, null, 4));
  console.log(`已写入: ${outputPath}`);
}

main().catch(err => {
  console.error(`\n❌ 更新失败: ${err.message}`);
  process.exit(1);
});
