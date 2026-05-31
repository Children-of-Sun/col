import React, { useState, useMemo } from 'react';
import { useStore } from '../stores';
import { t } from '../utils';
import { IconWithFallback } from './IconWithFallback';

interface ProductGridProps {
  items: string[];
  selectedItem?: string | null;
  onSelect?: (item: string) => void;
  multiSelect?: boolean;
  selectedSet?: Set<string>;
  onToggle?: (item: string, checked: boolean) => void;
  search: string;
  setSearch: (v: string) => void;
  placeholder?: string;
  showSearch?: boolean;
}

export const ProductGrid: React.FC<ProductGridProps> = ({
  items,
  selectedItem,
  onSelect,
  multiSelect = false,
  selectedSet = new Set(),
  onToggle,
  search,
  setSearch,
  placeholder = '搜索物品...',
  showSearch = true,
}) => {
  const translation = useStore(s => s.translation);
  const productCategories = useStore(s => s.productCategories);
  const productIcons = useStore(s => s.productIcons);
  const showIcons = useStore(s => s.showIcons);

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

  const tabNames = Object.keys(groups).sort();
  const [activeTab, setActiveTab] = useState<string>(tabNames[0] || '');
  const currentItems = groups[activeTab] || [];

  return (
    <div>
      {showSearch && (
        <div className="search-box" style={{ marginBottom: 12 }}>
          <input
            type="text"
            placeholder={placeholder}
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: 6 }}
          />
        </div>
      )}
      {tabNames.length > 0 && (
        <div style={{ marginBottom: 12, borderBottom: '1px solid #ddd', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {tabNames.map(cat => {
            const isActive = activeTab === cat;
            return (
              <button
                key={cat}
                onClick={() => setActiveTab(cat)}
                style={{
                  padding: '6px 16px',
                  background: isActive ? '#2563eb' : '#f0f0f0',
                  color: isActive ? 'white' : '#333',
                  border: 'none',
                  borderRadius: 20,
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: isActive ? 'bold' : 'normal',
                  transition: 'all 0.2s',
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
          const icon = productIcons[item.toLowerCase()];
          const isSelected = multiSelect ? selectedSet.has(item) : selectedItem === item;
          if (multiSelect) {
            return (
              <label
                key={item}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 8,
                  background: isSelected ? '#c7e5ff' : '#f5f5f5',
                  border: isSelected ? '1px solid #1e88e5' : '1px solid #ddd',
                  borderRadius: 6,
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'all 0.2s',
                }}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={e => onToggle?.(item, e.target.checked)}
                  style={{ marginBottom: 4 }}
                />
                {showIcons && icon && (
                  <IconWithFallback src={icon} alt="" style={{ width: 32, height: 32, marginBottom: 4 }} />
                )}
                <span>{t(item, translation)}</span>
              </label>
            );
          } else {
            return (
              <div
                key={item}
                onClick={() => onSelect?.(item)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 8,
                  background: isSelected ? '#c7e5ff' : '#f5f5f5',
                  border: isSelected ? '1px solid #1e88e5' : '1px solid #ddd',
                  borderRadius: 6,
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'all 0.2s',
                }}
              >
                {showIcons && icon && (
                  <IconWithFallback src={icon} alt="" style={{ width: 32, height: 32, marginBottom: 4 }} />
                )}
                <span>{t(item, translation)}</span>
              </div>
            );
          }
        })}
      </div>
    </div>
  );
};