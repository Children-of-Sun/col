import React, { useState, useMemo, useEffect } from 'react';
import { useStore } from '../stores';
import { Btn, Checkbox, SearchInput, ModalShell } from './UI';
import { IconWithFallback } from './IconWithFallback';
import { t } from '../utils';
import { RedundancyResource } from '../types';

export const RedundancyModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const allItems = useStore(s => s.allItems);
  const translation = useStore(s => s.translation);
  const productCategories = useStore(s => s.productCategories);
  const productIcons = useStore(s => s.productIcons);
  const showIcons = useStore(s => s.showIcons);
  const storeEnable = useStore(s => s.enableRedundancy);
  const storeGlobalLower = useStore(s => s.globalLower);
  const storeGlobalUpper = useStore(s => s.globalUpper);
  const storeResources = useStore(s => s.redundancyResources);
  const setEnableRedundancy = useStore(s => s.setEnableRedundancy);
  const setGlobalLower = useStore(s => s.setGlobalLower);
  const setGlobalUpper = useStore(s => s.setGlobalUpper);
  const setRedundancyResources = useStore(s => s.setRedundancyResources);

  // Temp state (committed on save)
  const [tempEnable, setTempEnable] = useState(storeEnable);
  const [tempGlobalLower, setTempGlobalLower] = useState(storeGlobalLower);
  const [tempGlobalUpper, setTempGlobalUpper] = useState(storeGlobalUpper);
  const [tempResources, setTempResources] = useState<Record<string, RedundancyResource>>({});
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('');

  // Initialize temp state when modal opens
  useEffect(() => {
    if (open) {
      setTempEnable(storeEnable);
      setTempGlobalLower(storeGlobalLower);
      setTempGlobalUpper(storeGlobalUpper);
      // Deep copy
      const copy: Record<string, RedundancyResource> = {};
      for (const [k, v] of Object.entries(storeResources)) {
        copy[k] = { ...v };
      }
      setTempResources(copy);
      setSearch('');
    }
  }, [open, storeEnable, storeGlobalLower, storeGlobalUpper, storeResources]);

  // Group items by category, filter by search
  const allItemsList = useMemo(() => [...allItems].sort(), [allItems]);

  const groups = useMemo(() => {
    const filtered = allItemsList.filter(item =>
      !search || t(item, translation).toLowerCase().includes(search.toLowerCase())
    );
    const groupsMap: Record<string, string[]> = {};
    for (const item of filtered) {
      const cat = productCategories[item.toLowerCase()] || 'Other';
      if (!groupsMap[cat]) groupsMap[cat] = [];
      groupsMap[cat].push(item);
    }
    return groupsMap;
  }, [allItemsList, search, translation, productCategories]);

  const tabNames = useMemo(() => Object.keys(groups).sort(), [groups]);

  useEffect(() => {
    if (tabNames.length === 0) {
      setActiveTab('');
    } else if (!tabNames.includes(activeTab)) {
      setActiveTab(tabNames[0]);
    }
  }, [tabNames, activeTab]);

  // 判断物品是否在 map 中（已显式处理过）
  const isExplicit = (item: string): boolean => item in tempResources;

  // Get or create resource settings for an item
  // 不在 map 中的物品默认不启用（opt-in），仅用于界面显示
  const getResource = (item: string): RedundancyResource => {
    return tempResources[item] || { enabled: false, lower: 100, upper: 100 };
  };

  const updateResource = (item: string, patch: Partial<RedundancyResource>) => {
    setTempResources(prev => {
      const current = prev[item] || { enabled: false, lower: 100, upper: 100 };
      return { ...prev, [item]: { ...current, ...patch } };
    });
  };

  const toggleEnabled = (item: string) => {
    if (!isExplicit(item)) {
      // 第一次点击：显式启用（opt-in），使用全局默认值 100%
      updateResource(item, { enabled: true, lower: 100, upper: 100 });
    } else {
      // 已显式处理过的物品 → 切换 enabled
      const current = getResource(item);
      updateResource(item, { enabled: !current.enabled });
    }
  };

  // Save
  const handleSave = () => {
    const disabledItems = Object.entries(tempResources).filter(([_, v]) => v.enabled === false);
    const explicitItems = Object.entries(tempResources).filter(([_, v]) => v.enabled === true);
    console.warn('[冗余] 保存设置:', {
      enable: tempEnable,
      globalLower: tempGlobalLower,
      globalUpper: tempGlobalUpper,
      explicitCount: explicitItems.length,
      disabledCount: disabledItems.length,
      disabledItems: disabledItems.map(([k]) => k),
      note: '未在列表中的资源自动使用全局值',
    });
    setEnableRedundancy(tempEnable);
    setGlobalLower(tempGlobalLower);
    setGlobalUpper(tempGlobalUpper);
    setRedundancyResources(tempResources);
    onClose();
  };

  // Reset all resources (keep global settings)
  const handleReset = () => {
    setTempResources({});
  };

  const currentItems = groups[activeTab] || [];

  return (
    <ModalShell open={open} onClose={onClose} title="资源冗余设置" maxWidth="900px">
      <div style={{ maxHeight: '70vh', overflowY: 'auto', paddingRight: 8 }}>
        {/* ===== 全局设置区 ===== */}
        <div style={{ marginBottom: 16, padding: 12, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
          <div style={{ marginBottom: 8 }}>
            <label>
              <input
                type="checkbox"
                checked={tempEnable}
                onChange={e => setTempEnable(e.target.checked)}
                style={{ marginRight: 6 }}
              />
              ☑ 启用冗余系统（全局总开关）
            </label>
          </div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <label>
              全局下限冗余：
              <input
                type="number"
                min={50}
                max={150}
                step={1}
                value={tempGlobalLower}
                onChange={e => setTempGlobalLower(parseInt(e.target.value) || 100)}
                style={{ width: 70, marginLeft: 4 }}
              />
              %
            </label>
            <label>
              全局上限冗余：
              <input
                type="number"
                min={50}
                max={150}
                step={1}
                value={tempGlobalUpper}
                onChange={e => setTempGlobalUpper(parseInt(e.target.value) || 100)}
                style={{ width: 70, marginLeft: 4 }}
              />
              %
            </label>
          </div>
          <div className="hint" style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
            点击物品卡片启用冗余（绿色"已启用"标签）。再次点击可禁用（灰色"已关闭"）。
            100%时使用全局值；自定义值直接使用。连续模式下限≥100%。
          </div>
        </div>

        {/* ===== 搜索框 ===== */}
        <div style={{ marginBottom: 12 }}>
          <input
            type="text"
            placeholder="搜索物品..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ccc' }}
          />
        </div>

        {/* ===== 分类选项卡 ===== */}
        {tabNames.length > 0 && (
          <div style={{ marginBottom: 12, borderBottom: '1px solid #ddd', display: 'flex', flexWrap: 'wrap', gap: 4, paddingBottom: 8 }}>
            {tabNames.map(cat => {
              const isActive = activeTab === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setActiveTab(cat)}
                  style={{
                    padding: '6px 14px',
                    background: isActive ? '#2563eb' : '#f0f0f0',
                    color: isActive ? 'white' : '#333',
                    border: 'none',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontSize: 13,
                  }}
                >
                  {t(cat, translation)}
                </button>
              );
            })}
          </div>
        )}

        {/* ===== 资源卡片网格 ===== */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 12,
        }}>
          {currentItems.map(item => {
            const res = getResource(item);
            const iconPath = productIcons[item.toLowerCase()];
            const isNotEnrolled = !isExplicit(item); // 未启用（不在 map 中）
            const isDisabled = isExplicit(item) && !res.enabled; // 显式关闭
            const isEnrolled = isExplicit(item) && res.enabled;  // 显式启用

            return (
              <div
                key={item}
                onClick={() => toggleEnabled(item)}
                style={{
                  padding: 8,
                  borderRadius: 8,
                  border: isEnrolled ? '2px solid #22c55e' : isDisabled ? '2px solid #d1d5db' : '2px solid #e5e7eb',
                  background: isEnrolled ? '#f0fdf4' : isDisabled ? '#f9fafb' : '#ffffff',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                {/* 第一行：图标 + 名称 + 状态标签 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  {showIcons && iconPath && (
                    <IconWithFallback src={iconPath} alt="" style={{ width: 24, height: 24, flexShrink: 0 }} />
                  )}
                  <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{t(item, translation)}</span>
                  {isDisabled && <span style={{ fontSize: 10, color: '#999', background: '#f0f0f0', padding: '1px 5px', borderRadius: 3 }}>已关闭</span>}
                  {isEnrolled && <span style={{ fontSize: 10, color: '#166534', background: '#dcfce7', padding: '1px 5px', borderRadius: 3 }}>已启用</span>}
                </div>

                {/* 第二行：上限 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} onClick={e => e.stopPropagation()}>
                  <span style={{ fontSize: 12, color: isEnrolled ? '#333' : '#999', minWidth: 28 }}>上限</span>
                  <input
                    type="number"
                    min={50}
                    max={150}
                    step={1}
                    value={res.upper}
                    onChange={e => updateResource(item, { upper: parseInt(e.target.value) || 100 })}
                    style={{
                      width: 60,
                      padding: '2px 4px',
                      fontSize: 12,
                      color: isEnrolled ? '#333' : '#999',
                    }}
                  />
                  <span style={{ fontSize: 12, color: isEnrolled ? '#333' : '#999' }}>%</span>
                </div>

                {/* 第三行：下限 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} onClick={e => e.stopPropagation()}>
                  <span style={{ fontSize: 12, color: isEnrolled ? '#333' : '#999', minWidth: 28 }}>下限</span>
                  <input
                    type="number"
                    min={50}
                    max={150}
                    step={1}
                    value={res.lower}
                    onChange={e => updateResource(item, { lower: parseInt(e.target.value) || 100 })}
                    style={{
                      width: 60,
                      padding: '2px 4px',
                      fontSize: 12,
                      color: isEnrolled ? '#333' : '#999',
                    }}
                  />
                  <span style={{ fontSize: 12, color: isEnrolled ? '#333' : '#999' }}>%</span>
                </div>
              </div>
            );
          })}
        </div>

        {currentItems.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', color: '#999' }}>没有匹配的资源</div>
        )}
      </div>

      {/* ===== 底部按钮 ===== */}
      <div className="modal-footer" style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        <Btn onClick={handleReset}>重置所有</Btn>
        <div style={{ flex: 1 }} />
        <Btn onClick={handleSave}>确定</Btn>
        <Btn onClick={onClose}>取消</Btn>
      </div>
    </ModalShell>
  );
};
