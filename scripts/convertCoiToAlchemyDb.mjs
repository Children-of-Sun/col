/**
 * Convert COI data.json → alchemy_db.js format.
 * Run: node scripts/convertCoiToAlchemyDb.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DIST = join(ROOT, 'dist');
const PUBLIC_ALCHEMY = join(ROOT, 'public', 'alchemy');

// ====== 1. Load COI data ======
const dataJson = JSON.parse(readFileSync(join(DIST, 'data.json'), 'utf-8'));
const productsJson = JSON.parse(readFileSync(join(DIST, 'products.json'), 'utf-8'));

const buildings = dataJson.machines_and_buildings || [];

// ====== 2. Build product type map from products.json ======
const productTypeMap = {};
(productsJson.products || []).forEach(p => {
  productTypeMap[p.name] = p.type || '';
});

// ====== 3. Collect all unique item names ======
const itemSet = new Set();
const itemTierMap = {};

buildings.forEach(b => {
  // Collect build cost items
  (b.build_costs || []).forEach(c => itemSet.add(c.product));
  // Collect items from recipes
  (b.recipes || []).forEach(r => {
    (r.inputs || []).forEach(i => itemSet.add(i.name));
    (r.outputs || []).forEach(o => {
      itemSet.add(o.name);
      // Track tier: items produced by higher-tier buildings get higher tier
      const currentTier = itemTierMap[o.name] || 0;
      const bTier = parseInt(b.id.match(/T(\d+)$/)?.[1] || '0') || 0;
      itemTierMap[o.name] = Math.max(currentTier, bTier + 1);
    });
  });
});

// ====== 4. Assign numeric IDs to items ======
const itemsArr = [...itemSet].sort();
const itemIdMap = {};
itemsArr.forEach((name, i) => { itemIdMap[name] = i + 1; });

// ====== 5. Build DB.items ======
const dbItems = {};
itemsArr.forEach(name => {
  const type = productTypeMap[name] || '';
  let category = 'Item';
  if (type.includes('Virtual')) category = 'Virtual';
  else if (name.toLowerCase().includes('ore') || name.toLowerCase().includes('rock') || name.toLowerCase().includes('coal') || name.toLowerCase().includes('crude'))
    category = 'Raw Materials';
  else if (name.toLowerCase().includes('ingot') || name.toLowerCase().includes('plate') || name.toLowerCase().includes('bar'))
    category = 'Metal';
  else if (name.includes('Part') || name.includes('Assembly'))
    category = 'Parts';

  dbItems[name] = {
    id: itemIdMap[name],
    category,
    tier: itemTierMap[name] || 1,
    liquid: false,
  };
});

// ====== 6. Build DB.machines ======
const dbMachines = {};
buildings.forEach(b => {
  const buildCost = {};
  (b.build_costs || []).forEach(c => { buildCost[c.product] = c.quantity; });

  dbMachines[b.name] = {
    tier: parseInt(b.id.match(/T(\d+)$/)?.[1] || '0') || 1,
    buildCost,
  };
});

// ====== 7. Build DB.recipes ======
const dbRecipes = [];
buildings.forEach(b => {
  (b.recipes || []).forEach(r => {
    const inputs = {};
    const outputs = {};
    (r.inputs || []).forEach(i => { inputs[i.name] = i.quantity; });
    (r.outputs || []).forEach(o => { outputs[o.name] = o.quantity; });

    dbRecipes.push({
      id: r.id,
      machine: b.name,
      inputs,
      outputs,
      baseTime: r.duration,
    });
  });
});

// ====== 8.5 Add safety stubs for DEFAULT_SETTINGS references ======
// alchemy_ui.js DEFAULT_SETTINGS references items that may not exist in COI data.
// Create stubs so the code doesn't crash when looking them up.
const STUB_ITEMS = {
  'Blast Potion': { category: 'Fuel', tier: 1 },
  'Fertile Catalyst': { category: 'Fertilizer', tier: 1 },
  'Charcoal': { category: 'Fuel', tier: 1 },
  'Basic Fertilizer': { category: 'Fertilizer', tier: 1 },
};
Object.entries(STUB_ITEMS).forEach(([name, props]) => {
  if (!itemIdMap[name]) {
    const newId = Object.keys(itemIdMap).length + 1;
    itemIdMap[name] = newId;
    itemsArr.push(name);
    dbItems[name] = { id: newId, liquid: false, ...props };
  }
});

if (!dbMachines['Stone Furnace']) {
  dbMachines['Stone Furnace'] = { tier: 1, buildCost: {} };
}
const defaultSettings = {
  lvlBelt: 0,
  lvlSpeed: 0,
  lvlAlchemy: 0,
  lvlFuel: 0,
  lvlFert: 0,
  lvlSell: 0,
  selectedHeatingDevice: '',
  defaultFuel: '',
  defaultFert: '',
  showBeltCount: true,
  showFuelFert: true,
  showMaxCap: false,
  showHeatFert: false,
  nodeSize: 1,
  colorfulLinks: true,
  preferredRecipes: {},
  nodeRecipeOverrides: {},
  recipeModifiers: {},
  activeRecyclers: {},
  customCosts: {},
  multiTargets: [],
};

// ====== 9. Generate alchemy_db.js ======
const alchemyDb = {
  version: 1,
  date: new Date().toISOString().split('T')[0],
  gameVersion: dataJson.game_version || '0.0.0',
  items: dbItems,
  machines: dbMachines,
  recipes: dbRecipes,
};

const jsContent = `// Auto-generated from COI data.json — DO NOT EDIT
// Generated: ${new Date().toISOString()}
window.ALCHEMY_DB = ${JSON.stringify(alchemyDb, null, 2)};

// Default settings (merged with localStorage on load)
window.ALCHEMY_DEFAULT_SETTINGS = ${JSON.stringify(defaultSettings, null, 2)};
`;

mkdirSync(PUBLIC_ALCHEMY, { recursive: true });
writeFileSync(join(PUBLIC_ALCHEMY, 'alchemy_db.js'), jsContent, 'utf-8');
console.log(`✅ Generated alchemy_db.js with ${itemsArr.length} items, ${dbRecipes.length} recipes, ${Object.keys(dbMachines).length} machines`);

// ====== 9.5 Generate alchemy_i18n.js from zh_en.json ======
const zhEnPath = join(DIST, 'zh_en.json');
let i18nItems = {};
let i18nMachines = {};
let i18nRecipes = {};

if (existsSync(zhEnPath)) {
  const zhEn = JSON.parse(readFileSync(zhEnPath, 'utf-8'));

  // Items: all COI item names → Chinese
  itemsArr.forEach(name => {
    if (zhEn[name]) i18nItems[name] = zhEn[name];
  });

  // Machines: all COI building names → Chinese
  Object.keys(dbMachines).forEach(name => {
    if (zhEn[name]) i18nMachines[name] = zhEn[name];
  });

  // Recipes: recipe names → Chinese (recipe IDs and names)
  dbRecipes.forEach(r => {
    if (zhEn[r.id]) i18nRecipes[r.id] = zhEn[r.id];
    // Also check recipe name if different from id
    if (r.name && r.name !== r.id && zhEn[r.name]) {
      i18nRecipes[r.name] = zhEn[r.name];
    }
  });
}

// Read ORIGINAL (source) alchemy_i18n.js to extract UI translations
const origI18nPath = join(ROOT, 'AlchemyFactoryCalculator-develop', 'alchemy_i18n.js');
let uiTranslations = {};
if (existsSync(origI18nPath)) {
  try {
    // Run the original file in a VM to extract the ALCHEMY_I18N object
    const origI18nCode = readFileSync(origI18nPath, 'utf-8');
    // Remove the t(), queryDualItemName(), translateDatabase(), translateText() function definitions
    // We only want the assignment: window.ALCHEMY_I18N = { ... };
    const objMatch = origI18nCode.match(/window\.ALCHEMY_I18N\s*=\s*\{[\s\S]*?\n\};/);
    if (objMatch) {
      let objStr = objMatch[0].replace(/^window\.ALCHEMY_I18N\s*=\s*/, '');
      // Remove trailing semicolon
      objStr = objStr.replace(/;\s*$/, '');
      // Strip single-line comments
      objStr = objStr.replace(/\/\/.*$/gm, '');
      // Strip trailing commas (JSON doesn't allow them)
      objStr = objStr.replace(/,(\s*[}\]])/g, '$1');
      try {
        const i18nData = JSON.parse(objStr);
        uiTranslations = i18nData.ui || {};
      } catch(e) {
        // Try eval as last resort
        try {
          const fn = new Function('return ' + objStr);
          const data = fn();
          uiTranslations = data.ui || {};
        } catch(e2) {
          console.warn('Could not parse UI translations:', e2.message);
        }
      }
    }
  } catch(e) { console.warn('Could not extract UI translations:', e.message); }
}

// Generate new alchemy_i18n.js
const i18nData = {
  enabled: true,
  items: i18nItems,
  machines: i18nMachines,
  recipes: i18nRecipes,
  ui: uiTranslations,
};

const i18nContent = `// Auto-generated from COI zh_en.json — DO NOT EDIT
// Generated: ${new Date().toISOString()}

// ====== TRANSLATION: $t$ ======
function t(text, category = 'ui') {
    if (!text) return "";
    if (window.ALCHEMY_I18N.enabled === false) return text;
    const i18n = window.ALCHEMY_I18N;
    const translatedText = i18n?.[category]?.[text];
    if (!translatedText && category != 'ui') {
        console.info('[i18n][' + category + '] Missing: ' + text);
    }
    return translatedText ?? text;
}

// Input item name, return the translated item name. And vice versa
function queryDualItemName(itemName) {
    const i18n = window.ALCHEMY_I18N;
    if (!i18n || !i18n.items) return "";
    const translatedText = i18n.items[itemName];
    if (translatedText) return translatedText;
    for (const [originalName, nameInDb] of Object.entries(i18n.items)) {
        if (nameInDb === itemName) return originalName;
    }
    return "";
}

function translateDatabase(db, forward) {
    const i18n = window.ALCHEMY_I18N;
    if (!db || !i18n || !i18n.items) return;
    if (i18n.enabled === false) return;

    const item2translate = new Map();
    const translate2item = new Map();
    for (let key in i18n.items) {
        const value = i18n.items[key];
        item2translate.set(key, value);
        translate2item.set(value, key);
    }
    const forwardMap = forward ? item2translate : translate2item;
    const invertedMap = forward ? translate2item : item2translate;
    const missingKeys = new Set();

    // Translate item keys in DB
    if (db.items) {
        const newItems = {};
        for (let key in db.items) {
            const mappedKey = forwardMap.get(key) || key;
            if (forward && !forwardMap.has(key)) missingKeys.add(key);
            newItems[mappedKey] = db.items[key];
        }
        db.items = newItems;
    }

    // Translate recipe inputs/outputs/machine
    if (db.recipes) {
        db.recipes.forEach(r => {
            ['inputs','outputs'].forEach(field => {
                if (r[field]) {
                    const newObj = {};
                    for (let key in r[field]) {
                        const mappedKey = forwardMap.get(key) || key;
                        if (forward && !forwardMap.has(key)) missingKeys.add(key);
                        newObj[mappedKey] = r[field][key];
                    }
                    r[field] = newObj;
                }
            });
            if (r.machine) {
                const mappedMachine = forwardMap.get(r.machine) || r.machine;
                if (forward && !forwardMap.has(r.machine)) missingKeys.add(r.machine);
                r.machine = mappedMachine;
            }
        });
    }

    // Translate machine keys
    if (db.machines) {
        const newMachines = {};
        for (let key in db.machines) {
            const mappedKey = forwardMap.get(key) || key;
            if (forward && !forwardMap.has(key)) missingKeys.add(key);
            newMachines[mappedKey] = db.machines[key];
        }
        db.machines = newMachines;
    }

    if (forward && missingKeys.size > 0) {
        console.warn('[i18n] Missing translations for: ' + [...missingKeys].join(', '));
    }
}

function translateText() {
    const i18n = window.ALCHEMY_I18N;
    if (!i18n || i18n.enabled === false) return;
    document.querySelectorAll('.translate-text').forEach(el => {
        const text = el.dataset.transKey;
        const category = el.dataset.transCat || 'ui';
        if (text) el.textContent = t(text, category);
    });
}

window.ALCHEMY_I18N = ${JSON.stringify(i18nData, null, 2)};
`;

writeFileSync(join(PUBLIC_ALCHEMY, 'alchemy_i18n.js'), i18nContent, 'utf-8');
console.log(`✅ Generated alchemy_i18n.js with ${Object.keys(i18nItems).length} item translations, ${Object.keys(i18nMachines).length} machine translations`);

// ====== 10. Copy icons ======
// Use icon_path from COI data to find matching icons

// Build product icon mapping: item name → expected icon filename
// From products.json: { name → icon_path basename (with .svg→.png) }
const productIconFileMap = {};
(productsJson.products || []).forEach(p => {
  if (p.icon_path) {
    let basename = p.icon_path.split('/').pop().replace(/\.svg$/i, '.png');
    productIconFileMap[p.name] = basename;
  }
});

// Build building icon mapping: building name → expected icon filename
const buildingIconFileMap = {};
buildings.forEach(b => {
  if (b.icon_path) {
    let basename = b.icon_path.split('/').pop().replace(/\.svg$/i, '.png');
    buildingIconFileMap[b.name] = basename;
  }
});

const imgDir = join(PUBLIC_ALCHEMY, 'img');
const machinesImgDir = join(imgDir, 'machines');
mkdirSync(imgDir, { recursive: true });
mkdirSync(machinesImgDir, { recursive: true });

// Build actual icon file sets
const productsIconDir = join(DIST, 'icons', 'products');
const productsIconSet = new Set();
if (existsSync(productsIconDir)) {
  readdirSync(productsIconDir).forEach(f => { if (f.endsWith('.png')) productsIconSet.add(f); });
}

const buildingsIconDir = join(DIST, 'icons', 'buildings');
const buildingsIconSet = new Set();
if (existsSync(buildingsIconDir)) {
  readdirSync(buildingsIconDir).forEach(f => { if (f.endsWith('.png')) buildingsIconSet.add(f); });
}

function normalize(s) { return s.replace(/[^a-zA-Z0-9]/g, '').toLowerCase(); }

// Copy product icons: find by icon_path basename first, then fall back to name match
let productCopied = 0;
itemsArr.forEach(name => {
  const id = itemIdMap[name];
  const dst = join(imgDir, `item${id}.png`);

  // Try icon_path mapping first
  let iconFile = productIconFileMap[name];
  if (iconFile && productsIconSet.has(iconFile)) {
    copyFileSync(join(productsIconDir, iconFile), dst);
    productCopied++;
    return;
  }

  // Fallback: try case-insensitive name match
  const norm = normalize(name);
  const matchFile = [...productsIconSet].find(f => normalize(f.replace('.png','')) === norm);
  if (matchFile) {
    copyFileSync(join(productsIconDir, matchFile), dst);
    productCopied++;
    return;
  }
});

// Copy building icons: find by icon_path basename first
let machineCopied = 0;
Object.keys(dbMachines).forEach(name => {
  const slug = name.toLowerCase().replace(/ /g, '-');
  const dst = join(machinesImgDir, `${slug}.png`);

  // Try icon_path mapping first
  let iconFile = buildingIconFileMap[name];
  if (iconFile && buildingsIconSet.has(iconFile)) {
    copyFileSync(join(buildingsIconDir, iconFile), dst);
    machineCopied++;
    return;
  }

  // Fallback: try name match
  const norm = normalize(name);
  const matchFile = [...buildingsIconSet].find(f => normalize(f.replace('.png','')) === norm);
  if (matchFile) {
    copyFileSync(join(buildingsIconDir, matchFile), dst);
    machineCopied++;
    return;
  }
});

console.log(`✅ Copied ${productCopied}/${itemsArr.length} product icons, ${machineCopied}/${Object.keys(dbMachines).length} machine icons`);
console.log('Done!');
