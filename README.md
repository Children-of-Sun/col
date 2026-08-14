# 工业巨头量化计算器

基于混合整数线性规划（MILP）的工厂生产优化工具。输入生产需求，自动计算最优的机器配置、电力供应、贸易路线和资源分配方案。
只用于工业巨头( Captain of Industry)游戏

## 功能

- **生产链求解** — 输入目标产物及产量，自动计算全链条最优机器数量
- **电力优化** — 支持多种发电方式（太阳能、蒸汽、燃气等），自动匹配电力供需
- **贸易优化** — 码头贸易合同自动评估，计算最优进出口组合
- **凝聚力计算** — 科研、法令、办公升级的凝聚力消耗量化
- **冗余系统** — 支持资源冗余下限/上限设置，模拟真实生产波动
- **占地计算** — 建筑占地面积统计，支持参考尺寸和理论尺寸
- **整数模式** — 连续求解 / 向上取整 / MILP 精确整数三种模式
- **配置管理** — 导出/导入/保存配置，刷新自动恢复

## 技术栈

| 类别 | 技术 |
|------|------|
| 前端框架 | React 18 + TypeScript |
| 构建工具 | Vite 7 |
| 状态管理 | Zustand |
| 求解器 | [HiGHS](https://github.com/lovasoa/highs-js) (WASM, MILP) |
| 部署 | GitHub Pages |

## 使用方法

### 在线使用

访问 [https://children-of-sun.github.io/col](https://children-of-sun.github.io/col)

### 本地运行

```bash
git clone https://github.com/Children-of-Sun/col.git
cd col
npm install
npm run dev
```

### 构建部署

```bash
npm run build
npm run deploy
```

### 更新游戏数据（data.json）

`public/data.json` 来自 [David-Melo/captain-of-data](https://github.com/David-Melo/captain-of-data) 的 `data/machines_and_buildings.json`，
并叠加了本项目的少量手工整理（雕像建筑、升级链断开、配方改名、维护迁移等，规则见 `scripts/dataPatchCore.mjs`）。
上游更新后无需手动重做：

- **GitHub Actions 自动更新**（推荐）：仓库已配置 `.github/workflows/update-data.yml`，
  每周一自动检查上游 → 应用整理 → 重新构建 → 提交并部署。也可在 Actions 页面手动触发。
- **本地一键更新**：

```bash
npm run update:data
# 只预览差异不写入：
npm run update:data -- --check
```

## 项目结构

```
├── public/              # 静态资源
│   ├── highs.js         # HiGHS JS 胶水代码
│   ├── highs.wasm       # HiGHS WASM（CDN 加载）
│   ├── solver.worker.js # 求解器 Web Worker
│   ├── GameData.json    # 游戏数据
│   └── data.json        # 建筑/配方数据
├── src/
│   ├── App.tsx          # 主应用
│   ├── stores.ts        # Zustand 状态管理
│   ├── lpBuilder.ts     # LP 模型构建
│   ├── parseData.ts     # 游戏数据解析
│   ├── buildActiveRecipes.ts  # 活跃配方构建
│   ├── types.ts         # 类型定义
│   ├── utils.ts         # 工具函数
│   └── components/      # UI 组件
└── index.html           # 入口页面
```

## 第三方依赖

| 依赖 | 协议 | 说明 |
|------|------|------|
| [HiGHS (highs-js)](https://github.com/lovasoa/highs-js) | MIT | 线性规划求解器，由 Lovasoa 维护 |
| [React](https://react.dev) | MIT | UI 框架 |
| [Zustand](https://github.com/pmndrs/zustand) | MIT | 状态管理 |
| [Vite](https://vitejs.dev) | MIT | 构建工具 |

特别感谢 [lovasoa/highs-js](https://github.com/lovasoa/highs-js) 将 HiGHS 编译为 WebAssembly，使浏览器端 MILP 求解成为可能。

部分游戏数据来自 [David-Melo/captain-of-data](https://github.com/David-Melo/captain-of-data)。

## 协议

本项目采用 [木兰宽松许可证 v2 (Mulan PSL v2)](http://license.coscl.org.cn/MulanPSL2) 开源。
