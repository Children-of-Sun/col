import React, { useState, useMemo, useEffect } from 'react';
import { useStore } from '../stores';
import { t } from '../utils';
import { IconWithFallback } from './IconWithFallback';

interface ExcludeContentProps {
  items: string[];
  selectedSet: Set<string>;
  onToggle: (item: string, checked: boolean) => void;
  search: string;
  setSearch: (v: string) => void;
  placeholder?: string;
}

export const ExcludeContent: React.FC<ExcludeContentProps> = ({
  items,
  selectedSet,
  onToggle,
  search,
  setSearch,
  placeholder = '搜索物品...',
}) => {
  const translation = useStore(s => s.translation);
  const productCategories = useStore(s => s.productCategories);
  const productIcons = useStore(s => s.productIcons);
  const showIcons = useStore(s => s.showIcons);

  // 按类别分组
  const groups = useMemo(() => {
    const filtered = items.filter(item =>
      !search || t(item, translation).toLowerCase().includes(search.toLowerCase())
    );
    const groupsMap: Record<string, string[]> = {};
    for (const item of filtered) {
      const cat = productCategories[item.toLowerCase()] || 'Other';
      if (!groupsMap[cat]) groupsMap[cat] = [];
      groupsMap[cat].push(item);
    }
    return groupsMap;
  }, [items, search, translation, productCategories]);

  const tabNames = useMemo(() => Object.keys(groups).sort(), [groups]);
  const [activeTab, setActiveTab] = useState<string>(tabNames[0] || '');

  useEffect(() => {
    if (tabNames.length === 0) {
      setActiveTab('');
    } else if (!tabNames.includes(activeTab)) {
      setActiveTab(tabNames[0]);
    }
  }, [tabNames, activeTab]);

  const currentItems = groups[activeTab] || [];

  if (items.length === 0) {
    return <div style={{ padding: 20, textAlign: 'center', color: '#999' }}>⚠️ 没有可排除的物品</div>;
  }

  return (
    <div>
      <div className="search-box" style={{ marginBottom: 12 }}>
        <input
          type="text"
          placeholder={placeholder}
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', padding: 6 }}
        />
      </div>
      {tabNames.length > 0 && (
        <div style={{ marginBottom: 12, borderBottom: '1px solid #ddd', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {tabNames.map(cat => {
            const isActive = activeTab === cat;
            return (
              <button
                key={cat}
                onClick={() => setActiveTab(cat)}
                style={{
                  padding: '6px 12px',
                  background: isActive ? '#2563eb' : '#f0f0f0',
                  color: isActive ? 'white' : '#333',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                }}
              >
                {t(cat, translation)}
              </button>
            );
          })}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 12 }}>
        {currentItems.map(item => {
          const iconPath = productIcons[item.toLowerCase()];
          const checked = selectedSet.has(item);
          return (
            <div
              key={item}
              onClick={() => onToggle(item, !checked)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 8,
                background: checked ? '#c7e5ff' : '#f5f5f5',
                border: checked ? '1px solid #1e88e5' : '1px solid #ddd',
                borderRadius: 6,
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'all 0.2s',
              }}
            >
              {showIcons && iconPath && (
                <IconWithFallback src={iconPath} alt="" style={{ width: 32, height: 32, marginBottom: 4 }} />
              )}
              <span>{t(item, translation)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};