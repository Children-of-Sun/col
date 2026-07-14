import React from 'react';
import { useStore } from '../stores';
import { t } from '../utils';
import { Btn, Select, ModalShell } from './UI';

export const OfficeBuildingPanel: React.FC = () => {
  const gameData = useStore(s => s.gameData);
  const fullData = useStore(s => s.fullData);
  const officeBuildingEnabled = useStore(s => s.officeBuildingEnabled);
  const officeSelectedLevel = useStore(s => s.officeSelectedLevel);
  const officeRecipeEnabled = useStore(s => s.officeRecipeEnabled);
  const setOfficeBuildingEnabled = useStore(s => s.setOfficeBuildingEnabled);
  const setOfficeLevelById = useStore(s => s.setOfficeLevelById);
  const setOfficeRecipeEnabled = useStore(s => s.setOfficeRecipeEnabled);
  const translation = useStore(s => s.translation);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [currentBuilding, setCurrentBuilding] = React.useState<string | null>(null);

  // 优先从 gameData 获取办公室建筑，否则从 fullData
  const buildingsSource = gameData?.machines_and_buildings || fullData?.machines_and_buildings;
  const officeBuildings = buildingsSource?.filter((b: any) => b.name?.startsWith('Office')) || [];

  if (officeBuildings.length === 0) {
    return <div className="hint">未检测到办公室建筑，请确保 GameData.json 中包含 Office 建筑数据。</div>;
  }

  const openRecipeModal = (buildingId: string) => {
    setCurrentBuilding(buildingId);
    setModalOpen(true);
  };

  return (
    <div className="section">
      <h3>🏢 办公室建筑</h3>
      {officeBuildings.map((b: any) => (
        <div key={b.id} className="building-block" style={{ marginBottom: 10 }}>
          <div className="building-header" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="checkbox"
              checked={officeBuildingEnabled[b.id] !== false}
              onChange={e => setOfficeBuildingEnabled(b.id, e.target.checked)}
            />
            <span>{t(b.name, translation)}</span>
            <Select
              value={String(officeSelectedLevel[b.id] || 1)}
              options={[
                { value: '1', label: 'Lv1' },
                { value: '2', label: 'Lv2' },
                { value: '3', label: 'Lv3' },
              ]}
              onChange={v => setOfficeLevelById(b.id, parseInt(v))}
            />
            <Btn onClick={() => openRecipeModal(b.id)}>🧪 配方选择</Btn>
          </div>
        </div>
      ))}
      <ModalShell open={modalOpen} onClose={() => setModalOpen(false)} title="办公室配方选择" maxWidth="600px">
        {currentBuilding && (
          <div>
            {officeBuildings
              .find((b: any) => b.id === currentBuilding)
              ?.recipes?.map((r: any) => (
              <div key={r.id} className="recipe-entry" style={{ marginBottom: 8 }}>
                <label>
                  <input
                    type="checkbox"
                    checked={officeRecipeEnabled[r.id] !== false}
                    onChange={e => setOfficeRecipeEnabled(r.id, e.target.checked)}
                  />
                  {' '}{r.name}
                </label>
              </div>
            ))}
          </div>
        )}
        <Btn onClick={() => setModalOpen(false)}>关闭</Btn>
      </ModalShell>
    </div>
  );
};
