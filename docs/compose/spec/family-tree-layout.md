---
feature: family-tree-layout
status: delivered
updated: 2026-09-11
branch: main
commits: workspace-local (main, no remote push this session)
---

# 家族树布局：以我为中心聚类 + 双模式切换

## Report

**What was built** — Dual family-tree layout engines with top-bar settings toggle:
(1) custom DOM/SVG canvas with ego-centric same-generation clustering — only true descendants of「我」(and their spouses) get clusterRank 0; in-law collateral (e.g. spouse's sister and her children) get rank 3 with wider H_GAP so my children and her children do not sit in one mixed band;
(2) AntV G6 comparison view (simplified glass nodes + lineage-colored edges), loaded from CDN at runtime because bundling @antv/g6 hung Turbopack static export.
Layout mode persists in localStorage (default custom) and is passed into FamilyTree.

**Verification** — vitest run: PASS 145 tests / 12 files (cluster.ego asserts non-interleave AND gap > 8px). next build: PASS static export.

**Journey log**
- Review found layoutMode never reached FamilyTree (codemod miss) — one-line prop fix.
- Review found d>=1 marked all affinal nephews rank 0 — replaced with isMeDescendant + recursive affinal rank.
- PowerShell/codemod UTF-8 corruption still poisons Chinese comments in tree.ts; prefer Node scripts.
- G6 must stay out of the Next bundle for this project until toolchain handles it.


## [S1] Problem

实际录入多人后，自研「整齐树」把**同一世代**的人都放在同一横行，排序主要依赖理想中心与族谱路径键。结果是：**我的子女**会挤在**配偶旁系（如老婆姐姐）的子女**旁边，家庭单元在视觉上被打散，分不清「谁是我这一支」。

用户要求：
1. 修复同代聚类（以「我」为中心）。
2. 顶栏设置里可在 **自研布局** 与 **AntV G6** 之间切换，先对比效果再定终稿。
3. 其它可一并优化的布局/体验问题。

## [S2] Design

### 双布局模式（顶栏设置）

| 模式 | 实现 | 默认 |
|---|---|---|
| `custom` | 现有 `lib/tree.ts` + DOM/SVG 玻璃卡片 | **是** |
| `g6` | `@antv/g6` 图布局 + 简化玻璃节点 | 否 |

- 切换入口：顶栏 **设置** 弹层中的「布局引擎」分段控件。
- 选择写入 `localStorage` 键 `laotagong:layout-mode`。
- 两种模式共用同一 `FamilyState` / 称呼 / 筛选（亲系、代数）。
- G6 模式节点为**简化玻璃卡片**：姓名 + 相对「我」称呼 + 亲系色条；点击仍打开详情；不强制复刻三按钮。

### 自研布局：以「我」为中心的同代聚类

对每个代际 `g`，给单元（夫妻并查集）计算 `clusterRank`：

| Rank | 含义 |
|---|---|
| 0 | 本人或配偶；本人的后裔（含后裔配偶） |
| 1 | 本人同胞及其配偶 |
| 2 | 父母的同胞（叔伯姑舅姨）及其配偶 |
| 3 | 配偶方旁系（妻/夫的兄弟姐妹等姻亲） |
| 4 | 其它 / 未连接 |

扫掠同一代时：

1. 先按 `clusterRank` 升序（我的一簇永远在中间偏前）。
2. 同 rank 内按理想中心 / 生年。
3. **簇间距**：`H_GAP`（同簇）→ `H_GAP * 2`（相邻 rank）→ `H_GAP * 3`（跨姻亲），用空隙把「我的子女」和「老婆姐姐的子女」分开。

后代代际（g > me）在 `clusterRank=0` 内再按对「我」单元的水平距离排序，保证子女正下方居中。

### 连线

- `custom`：继续使用布局输出的 `routes[]` 显式折线（已通过几何测试）。
- `g6`：使用 G6 边；亲子用正交/直线，配偶用短边；颜色沿用 `--line-*` 亲系色。

### 其它优化（本特性范围内）

- 设置面板展示当前布局引擎说明。
- `custom` 在 `clusterRank` 变化处略增空隙后，若卡片相交则由既有 fuzz/不重叠测试兜住。
- 不改 `FamilyState` schema；不引入服务端。

## [S3] Out of Scope

- 不重做液态玻璃 token / 字阶。
- 不实现 G6 里完整三按钮卡片、小地图与 G6 深度定制动画。
- 不迁移到 WebGL 大规模渲染。
- 不改数据导入导出格式。

## Tasks

- [x] T1: 布局模式状态 — `layout-mode` 读写 + 设置面板切换 UI；acceptance: 切换后刷新仍保持所选模式，默认 `custom` (covers: S2)
- [x] T2: 自研同代聚类 — `clusterRank` + 簇间距扫掠；acceptance: 单测断言我的子女 x 区间与姻亲旁系子女 x 区间不相邻/有间隔且 rank0 更靠近 me.x (covers: S2; depends: T1)
- [x] T3: AntV G6 视图 — 安装 `@antv/g6`，`TreeG6` 客户端组件，简化玻璃节点 + 亲系边色；acceptance: 切到 g6 后画布渲染全部可见成员，点击节点打开详情 (covers: S2; depends: T1)
- [x] T4: 接线 family-tree/family-app — 按模式挂载 custom 或 g6，筛选与称呼共用；acceptance: 全部/父系/母系/直系与代数在两种模式下都生效 (covers: S2; depends: T2, T3)
- [x] T5: 回归 — `pnpm test` + `pnpm build` 通过；acceptance: 既有 tree/kinship/routes 测试全绿，新聚类测试通过 (covers: S2; depends: T4)
