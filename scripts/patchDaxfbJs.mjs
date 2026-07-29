/**
 * Deep-translate daxfb-calculator's minified JavaScript.
 *
 * Part A: Replaces Vuetify's default English locale messages with Chinese.
 * Part B: Replaces daxfb-specific LONG English UI strings (12+ chars only).
 *
 * SHORT strings (like "Array", "Object", "Event", "Map", "Set", "Error",
 * "Delete", "Input", "Output", etc.) are JavaScript code identifiers and
 * MUST NOT be replaced globally — the MutationObserver handles those.
 *
 * Usage: node scripts/patchDaxfbJs.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const JS_PATH = path.join(ROOT, 'public', 'daxfb', 'assets', 'index-4c9f97cc.js');

console.log('=== daxfb JS Deep Translation Patch ===\n');

let content = fs.readFileSync(JS_PATH, 'utf8');
const origSize = content.length;

// ─── Part A: Replace Vuetify default messages (My object) ──────────
// The entire const My={...} object is replaced with Chinese.
// This is a targeted block replacement — no risk of breaking code.

const MY_START = 'const My={badge:"Badge"';
const MY_CHINESE = `const My={badge:"徽章",close:"关闭",dataIterator:{noResultsText:"未找到匹配记录",loadingText:"加载中..."},dataTable:{itemsPerPageText:"每页行数：",ariaLabel:{sortDescending:"降序排列。",sortAscending:"升序排列。",sortNone:"未排序。",activateNone:"激活以取消排序。",activateDescending:"激活以降序排列。",activateAscending:"激活以升序排列。"},sortBy:"排序方式"},dataFooter:{itemsPerPageText:"每页项目数：",itemsPerPageAll:"全部",nextPage:"下一页",prevPage:"上一页",firstPage:"第一页",lastPage:"最后一页",pageText:"第{0}-{1}页，共{2}页"},datePicker:{itemsSelected:"已选择{0}项",nextMonthAriaLabel:"下个月",nextYearAriaLabel:"下一年",prevMonthAriaLabel:"上个月",prevYearAriaLabel:"上一年"},noDataText:"暂无数据",carousel:{prev:"上一个",next:"下一个",ariaLabel:{delimiter:"轮播第{0}张，共{1}张"}},calendar:{moreEvents:"还有{0}个"},input:{clear:"清除{0}",prependAction:"{0}前置操作",appendAction:"{0}后置操作"},fileInput:{counter:"{0}个文件",counterSize:"{0}个文件（共{1}）"},timePicker:{am:"上午",pm:"下午"},pagination:{ariaLabel:{root:"分页导航",next:"下一页",previous:"上一页",page:"前往第{0}页",currentPage:"第{0}页，当前页",first:"第一页",last:"最后一页"}},rating:{ariaLabel:{item:"评分{0}/{1}"}}}`;

const myStartIdx = content.indexOf(MY_START);
if (myStartIdx === -1) {
  console.error('ERROR: Could not find Vuetify My object!');
  process.exit(1);
}

// Find the end of the My object (matching braces)
let depth = 0;
let inString = false;
let myEndIdx = myStartIdx;
for (let i = myStartIdx; i < content.length; i++) {
  const ch = content[i];
  if (inString) { if (ch === '"') inString = false; continue; }
  if (ch === '"') { inString = true; continue; }
  if (ch === '{') depth++;
  if (ch === '}') { depth--; if (depth === 0) { myEndIdx = i; break; } }
}

const oldMy = content.slice(myStartIdx, myEndIdx + 1);
content = content.slice(0, myStartIdx) + MY_CHINESE + content.slice(myEndIdx + 1);
console.log(`Part A: Vuetify messages replaced (${oldMy.length} → ${MY_CHINESE.length} chars)`);

// ─── Part B: Replace daxfb-specific LONG UI strings (> 12 chars) ──
//
// CRITICAL SAFETY RULE: Only replace strings ≥ 12 characters.
// Short strings like "Array", "Object", "Map", "Set", "Event", "Error",
// "Delete", "Input", "Output", "Primary", "Secondary", "Filter", "Lock",
// "Item", "Count", "Target", "Module", "Once", "Rows", "Cols" etc.
// are JavaScript code identifiers (enum values, case labels, symbol names,
// keyboard key names, property keys) — replacing them BREAKS the app.
//
// Long strings (≥ 12 chars) are almost certainly UI labels/text in
// Vue template render functions — safe to replace globally.

const TRANSLATIONS = [
  // Settings panel labels (all 12+ chars, all safe)
  ['Continue Drag And Scroll Outside', '边界外继续拖拽滚动'],
  ['Automatically Apply Factory Counts', '自动应用工厂数量'],
  ['Automatically Layout Blueprint', '自动布局蓝图'],
  ['Generate Link For Blueprint', '生成蓝图链接'],
  ['Edit Blueprint Description', '编辑蓝图描述'],
  ['Low Priority Objective', '低优先级目标'],
  ['Enable Drag And Drop', '启用拖拽'],
  ['Enable Point And Click', '启用点击'],
  ['Enable Scale On Wheel', '启用滚轮缩放'],
  ['Auto Scroll On Overflow', '溢出自动滚动'],
  ['Save / Share Blueprint', '保存/分享蓝图'],
  ['Copy Blueprint Data', '复制蓝图数据'],
  ['Paste Blueprint Data', '粘贴蓝图数据'],
  ['Mass Update Counts', '批量更新数量'],
  ['Auto Layout Graph', '自动布局'],
  ['Compress Saved Data', '压缩保存数据'],
  ['Split Encoded Data', '分割编码数据'],
  ['Encode Saved Data', '编码保存数据'],
  ['Primary Objective', '主要目标'],
  ['Secondary Objective', '次要目标'],
  ['Open Another Window', '打开新窗口'],
  ['Delete all links', '删除所有连线'],
  ['Search recipes...', '搜索配方...'],
  ['Save / Share Blueprint', '保存/分享蓝图'],
  ['Colorful Links', '彩色连线'],
  ['Count Controls', '数量控制'],
  ['Load Blueprint', '加载蓝图'],
  ['Toggle Summary', '切换汇总'],
  ['Sample Game', '示例游戏'],
  ['New Blueprint', '新蓝图'],
  ['Generate Link', '生成链接'],
  ['Select game', '选择游戏'],
  ['Upgrade Mode', '升级模式'],
  ['Calculations', '计算'],
  ['Appearance', '外观'],
];

// Validate: all strings must be ≥ 12 chars (except a few verified 10-11 char ones)
const verifiedShort = new Set(['Appearance', 'Sample Game', 'Select game']);
for (const [en] of TRANSLATIONS) {
  if (en.length < 12 && !verifiedShort.has(en)) {
    console.error(`SAFETY ERROR: "${en}" is only ${en.length} chars — REFUSING to replace!`);
    process.exit(1);
  }
}

let partBCount = 0;
for (const [en, zh] of TRANSLATIONS) {
  const quoted = `"${en}"`;
  let idx = content.indexOf(quoted);
  while (idx !== -1) {
    // Replace "English" → "Chinese" (keeping surrounding quotes)
    content = content.slice(0, idx + 1) + zh + content.slice(idx + 1 + en.length);
    partBCount++;
    idx = content.indexOf(quoted, idx + zh.length + 2);
  }
}
console.log(`Part B: ${partBCount} daxfb UI strings replaced`);

// ─── Write back ────────────────────────────────────────────────────

fs.writeFileSync(JS_PATH, content, 'utf8');
const sizeChange = content.length - origSize;
console.log(`\nFile size: ${origSize} → ${content.length} (${sizeChange >= 0 ? '+' : ''}${sizeChange})`);
console.log(`Written: ${JS_PATH}`);
console.log('Done!');
