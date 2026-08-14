/**
 * data.json 手工整理规则（共享核心）
 *
 * 被以下脚本引用：
 *   - scripts/patchDataJson.mjs  本地文件补丁
 *   - scripts/updateDataJson.mjs 自动更新（下载上游 + 补丁）
 *
 * 规则均按"上游原始 → 整理后"方向设计，幂等、容错：
 * 目标已存在/不存在时跳过并打印提示，不中断。
 */

export const CURATIONS = {
  // ── 1. 补充缺失的建筑（按 id 去重，已存在则跳过）──
  addBuildings: [
    {
      id: 'TheStatueofMaintenance',
      name: 'The Statue of Maintenance',
      category: 'Buildings',
      subcategory: '',
      next_tier: '',
      workers: 10,
      maintenance_cost_units: 'Maintenance I',
      maintenance_cost_quantity: 10,
      electricity_consumed: 0,
      electricity_generated: 0,
      computing_consumed: 0,
      computing_generated: 0,
      product_type: '',
      storage_capacity: 0,
      unity_cost: 0,
      research_speed: 0,
      icon_path: '',
      build_costs: [
        { product: 'Construction Parts III', quantity: 200 },
        { product: 'Concrete Slab', quantity: 400 },
        { product: 'Steel', quantity: 300 },
        { product: 'Copper', quantity: 1000 },
      ],
      recipes: [],
    },
  ],

  // ── 2. 断开升级链：这些建筑在游戏中不是升级关系，置空 next_tier ──
  clearNextTier: ['SolarPanel', 'NuclearReactorT2'],

  // ── 2b. 保留升级链：确保这些建筑的 next_tier 指向目标建筑（上游缺失时补回）──
  setNextTier: {
    PowerGeneratorT1: 'Power generator (large)',
  },

  // ── 3. 删除不需要的配方（平均输出配方对规划无意义）──
  removeRecipes: [
    { buildingId: 'SolarPanelMono', recipeId: 'SolarpanelmonoAvgoutput' },
  ],

  // ── 4. 补充上游缺失的配方（按 建筑+配方id 去重，已存在则跳过）──
  //    上游版本中火箭装配/发射配方为空，需手工补全
  addRecipes: [
    {
      buildingId: 'RocketAssemblyDepot',
      recipes: [
        {
          id: 'RocketT1assembly', name: 'RocketT1 assembly', duration: 480,
          inputs: [
            { name: 'Composite panel', quantity: 300 },
            { name: 'Steel', quantity: 80 },
            { name: 'Electronics II', quantity: 24 },
          ],
          outputs: [{ name: 'RocketT1', quantity: 1 }],
          power_multiplier: 1,
        },
        {
          id: 'RocketT2assembly', name: 'RocketT2 assembly', duration: 480,
          inputs: [
            { name: 'Composite panel', quantity: 480 },
            { name: 'Titanium alloy', quantity: 120 },
            { name: 'Steel', quantity: 80 },
            { name: 'Electronics III', quantity: 16 },
          ],
          outputs: [{ name: 'RocketT2', quantity: 1 }],
          power_multiplier: 1,
        },
      ],
    },
    {
      buildingId: 'RocketLaunchPad',
      recipes: [
        {
          id: 'RocketT1launchRLP', name: 'RocketT1 launch RLP', duration: 480,
          inputs: [
            { name: 'RocketT1', quantity: 1 },
            { name: 'Hydrogen', quantity: 140 },
            { name: 'Oxygen', quantity: 40 },
            { name: 'Water', quantity: 160 },
          ],
          outputs: [{ name: 'Rocket T1 RLP', quantity: 1 }],
          power_multiplier: 1,
        },
        {
          id: 'RocketT1launchthing', name: 'RocketT1 launch thing', duration: 480,
          inputs: [
            { name: 'RocketT1', quantity: 1 },
            { name: 'Hydrogen', quantity: 140 },
            { name: 'Oxygen', quantity: 40 },
            { name: 'Water', quantity: 160 },
          ],
          outputs: [{ name: 'Rocket T1 thing', quantity: 1 }],
          power_multiplier: 1,
        },
        {
          id: 'RocketT2launchRLP', name: 'RocketT2 launch RLP', duration: 480,
          inputs: [
            { name: 'RocketT2', quantity: 1 },
            { name: 'Hydrogen', quantity: 320 },
            { name: 'Oxygen', quantity: 90 },
            { name: 'Water', quantity: 160 },
          ],
          outputs: [{ name: 'Rocket T2 RLP', quantity: 1 }],
          power_multiplier: 1,
        },
        {
          id: 'RocketT2launchthing', name: 'RocketT2 launch thing', duration: 480,
          inputs: [
            { name: 'RocketT2', quantity: 1 },
            { name: 'Hydrogen', quantity: 320 },
            { name: 'Oxygen', quantity: 90 },
            { name: 'Water', quantity: 160 },
          ],
          outputs: [{ name: 'Rocket T2 thing', quantity: 1 }],
          power_multiplier: 1,
        },
      ],
    },
  ],

  // ── 5. 配方 id 改名（name 同步修正；上游连旧 id 也没有时用 fallbackRecipe 直接补全）──
  renameRecipes: [
    {
      buildingId: 'NuclearWasteStorage',
      fromId: 'FP_to_RNW_conversion',
      toId: 'FPtoRNWconversion',
      name: 'FP to RNW conversion',
      fallbackRecipe: {
        id: 'FPtoRNWconversion', name: 'FP to RNW conversion', duration: 72000,
        inputs: [{ name: 'Fission product', quantity: 2400 }],
        outputs: [{ name: 'Retired waste', quantity: 2400 }],
        power_multiplier: 1,
      },
    },
  ],

  // ── 6. 配方输入项移到建筑级字段（游戏按建筑收维护/电力，配方仅输入原料）──
  //    target: 'maintenance' → maintenance_cost_units/quantity
  //            'electricity' → electricity_consumed
  moveInputsToBuilding: [
    {
      buildingId: 'DataCenter',
      recipeId: 'BasicServerRack',
      inputs: [
        { name: 'Maintenance III', target: 'maintenance' },
        { name: 'Electricity', target: 'electricity' },
      ],
    },
  ],

  // ── 7. 维护数值整理为整洁值（key = 建筑 id；expected 是上游原值，不符时提示）──
  fixMaintenanceQuantity: {
    SolarPanel:      { value: 0.2, expected: 0.2001953 },
    SolarPanelMono:  { value: 0.2, expected: 0.2001953 },
    BasicServerRack: { value: 0.8, expected: 0.7998047 },
    DataCenter:      { value: 42.4, expected: 42.39063 },
  },
};

/** 对 data 对象应用全部整理规则；log 用于输出每条变更 */
export function applyPatch(data, log = () => {}) {
  const buildings = data.machines_and_buildings;
  if (!Array.isArray(buildings)) {
    throw new Error('输入文件缺少 machines_and_buildings 数组，无法修补');
  }
  const byId = new Map(buildings.map(b => [b.id, b]));

  // 1. 补充建筑
  for (const nb of CURATIONS.addBuildings) {
    if (byId.has(nb.id)) {
      log(`[跳过] 建筑 ${nb.id} 已存在`);
    } else {
      buildings.push({ ...nb, recipes: [...(nb.recipes || [])] });
      byId.set(nb.id, buildings[buildings.length - 1]);
      log(`[新增] 建筑 ${nb.id} (${nb.name})`);
    }
  }

  // 2. 断开升级链
  for (const id of CURATIONS.clearNextTier) {
    const b = byId.get(id);
    if (!b) { log(`[警告] 未找到建筑 ${id}，跳过清空 next_tier`); continue; }
    if (b.next_tier && b.next_tier !== '') {
      log(`[修改] ${id}.next_tier: "${b.next_tier}" => ""`);
      b.next_tier = '';
    } else {
      log(`[跳过] ${id}.next_tier 已为空`);
    }
  }

  // 2b. 保留升级链
  for (const [id, nextTier] of Object.entries(CURATIONS.setNextTier || {})) {
    const b = byId.get(id);
    if (!b) { log(`[警告] 未找到建筑 ${id}，跳过设置 next_tier`); continue; }
    if (b.next_tier === nextTier) {
      log(`[跳过] ${id}.next_tier 已是 "${nextTier}"`);
      continue;
    }
    log(`[修改] ${id}.next_tier: "${b.next_tier || '(空)'}" => "${nextTier}"`);
    b.next_tier = nextTier;
  }

  // 3. 删除配方
  for (const { buildingId, recipeId } of CURATIONS.removeRecipes) {
    const b = byId.get(buildingId);
    if (!b || !Array.isArray(b.recipes)) { log(`[警告] 未找到建筑 ${buildingId}，跳过删除配方 ${recipeId}`); continue; }
    const idx = b.recipes.findIndex(r => r.id === recipeId);
    if (idx >= 0) {
      log(`[删除] ${buildingId} 配方 ${recipeId}`);
      b.recipes.splice(idx, 1);
    } else {
      log(`[跳过] ${buildingId} 配方 ${recipeId} 不存在（已删除？）`);
    }
  }

  // 4. 补充配方（按 id 去重；若同名配方将由改名规则产生，也跳过避免重复）
  const renameTargets = new Set(CURATIONS.renameRecipes.map(r => r.toId));
  for (const { buildingId, recipes } of CURATIONS.addRecipes) {
    const b = byId.get(buildingId);
    if (!b) { log(`[警告] 未找到建筑 ${buildingId}，跳过补充配方`); continue; }
    if (!Array.isArray(b.recipes)) b.recipes = [];
    const have = new Set(b.recipes.map(r => r.id));
    for (const rc of recipes) {
      if (have.has(rc.id)) {
        log(`[跳过] ${buildingId} 配方 ${rc.id} 已存在`);
        continue;
      }
      if (renameTargets.has(rc.id)) {
        // 该配方可能由改名规则产生（如 FP_to_RNW_conversion → FPtoRNWconversion），
        // 若旧 id 还在就不重复添加
        const renamedFrom = CURATIONS.renameRecipes.find(r => r.toId === rc.id)?.fromId;
        if (renamedFrom && have.has(renamedFrom)) {
          log(`[跳过] ${buildingId} 配方 ${rc.id} 将由改名规则产生（上游有 ${renamedFrom}）`);
          continue;
        }
      }
      b.recipes.push(JSON.parse(JSON.stringify(rc)));
      have.add(rc.id);
      log(`[新增] ${buildingId} 配方 ${rc.id}`);
    }
  }

  // 5. 配方改名 / 补全
  for (const { buildingId, fromId, toId, name, fallbackRecipe } of CURATIONS.renameRecipes) {
    const b = byId.get(buildingId);
    if (!b || !Array.isArray(b.recipes)) { log(`[警告] 未找到建筑 ${buildingId}，跳过配方改名`); continue; }
    const r = b.recipes.find(x => x.id === fromId);
    if (r) {
      log(`[改名] ${buildingId} 配方 ${fromId} => ${toId}`);
      r.id = toId;
      if (name && r.name !== name) { log(`       name: "${r.name}" => "${name}"`); r.name = name; }
    } else if (b.recipes.some(x => x.id === toId)) {
      log(`[跳过] ${buildingId} 配方 ${fromId} 不存在（已是 ${toId}？）`);
    } else if (fallbackRecipe) {
      b.recipes.push(JSON.parse(JSON.stringify(fallbackRecipe)));
      log(`[新增] ${buildingId} 配方 ${fromId} 与 ${toId} 均不存在，用模板补全 ${toId}`);
    } else {
      log(`[警告] ${buildingId} 未找到配方 ${fromId} 或 ${toId}`);
    }
  }

  // 6. 配方输入项移到建筑级字段
  for (const { buildingId, recipeId, inputs } of CURATIONS.moveInputsToBuilding) {
    const b = byId.get(buildingId);
    if (!b) { log(`[警告] 未找到建筑 ${buildingId}，跳过输入项迁移`); continue; }
    const recipe = (b.recipes || []).find(r => r.id === recipeId);
    if (!recipe) { log(`[警告] ${buildingId} 未找到配方 ${recipeId}，跳过输入项迁移`); continue; }
    for (const { name, target } of inputs) {
      const input = (recipe.inputs || []).find(i => i.name.toLowerCase() === name.toLowerCase());
      if (!input) {
        log(`[跳过] ${buildingId}/${recipeId} 配方输入中无 ${name}（已迁移？）`);
        continue;
      }
      const qty = input.quantity;
      if (target === 'maintenance') {
        log(`[移动] ${buildingId}/${recipeId} ${name}×${qty} → 建筑维护字段`);
        b.maintenance_cost_units = name;
        b.maintenance_cost_quantity = qty;
      } else if (target === 'electricity') {
        log(`[移动] ${buildingId}/${recipeId} ${name}×${qty} → 建筑电力消耗字段`);
        b.electricity_consumed = qty;
      } else {
        log(`[警告] ${buildingId}/${recipeId} 未知迁移目标 ${target}，跳过`);
        continue;
      }
      recipe.inputs = recipe.inputs.filter(i => i !== input);
    }
  }

  // 7. 维护数值整理
  for (const [id, { value, expected }] of Object.entries(CURATIONS.fixMaintenanceQuantity)) {
    const b = byId.get(id);
    if (!b) { log(`[警告] 未找到建筑 ${id}，跳过维护数值整理`); continue; }
    if (b.maintenance_cost_quantity === value) {
      log(`[跳过] ${id} 维护数值已是 ${value}`);
      continue;
    }
    if (b.maintenance_cost_quantity !== expected) {
      log(`[注意] ${id} 上游维护数值 ${b.maintenance_cost_quantity} 与预期 ${expected} 不符，仍整理为 ${value}（请核对上游是否已变化）`);
    }
    log(`[修改] ${id} 维护数值: ${b.maintenance_cost_quantity} => ${value}`);
    b.maintenance_cost_quantity = value;
  }
}

/** 判断整理结果是否与目标内容一致（用于"已是最新"判断） */
export function isSameData(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
