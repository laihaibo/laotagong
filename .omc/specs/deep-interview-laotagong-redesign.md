# Deep Interview Spec: 老太公 · 家族图谱 —— Apple Style 全面重构

## Metadata

- Interview ID: `di-laotagong-20260911-01`
- Rounds: 10（含 Round 0 拓扑门 + 第 7 轮澄清）
- Final Ambiguity Score: **19%**
- Type: **brownfield**
- Generated: 2026-09-11
- Threshold: `0.2`
- Threshold Source: `default`（用户与项目 settings.json 均未配置 `omc.deepInterview.ambiguityThreshold`）
- Initial Context Summarized: no（原始输入 9 项，未超出 prompt 预算，无需摘要）
- Status: **PASSED**

## Clarity Breakdown

| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.90 | 0.35 | 0.3150 |
| Constraint Clarity | 0.75 | 0.25 | 0.1875 |
| Success Criteria | 0.75 | 0.25 | 0.1875 |
| Context Clarity | 0.80 | 0.15 | 0.1200 |
| **Total Clarity** | | | **0.8100** |
| **Ambiguity** | | | **0.1900** |

**降幅轨迹：** 100% → 58.8% → 55.5% → 54.25% → 47% → 45.75% → 46.3%（↑ 范围扩张）→ 41% → 41% → 25.75% → 19%

## Topology

| Component | Status | Description | Coverage / Deferral Note |
|-----------|--------|-------------|--------------------------|
| 设计语言基线 | active | Apple Style + Liquid Glass 视觉规范、字阶、间距、主题 | AC-1 ~ AC-4 |
| 页面骨架与顶栏 | active | header/main/footer 三段结构、通栏、顶栏分区、查找面板 | AC-5 ~ AC-11 |
| 卡片与弹窗细节 | active | 卡片信息密度分级、桌面端弹窗居中 | AC-12 ~ AC-16 |
| 数据模型与 Bug 修复 | active | 关系双写对称性、FamilyEvent、photoUrl、存储迁移策略 | AC-17 ~ AC-23 |
| 工程文档与配置 | active | CLAUDE.md 新增、.gitignore / README 更新 | AC-24 ~ AC-27 |

**Deferrals（用户确认延后，不计入本轮歧义计算，但保留在拓扑中）**

| 组件/能力 | 延后理由 | 确认时点 |
|-----------|---------|---------|
| 同辈拖拽排序（`SiblingOrder`） | 判为支撑性能力，不服务于「家族档案」本质；默认按出生年/创建序即可 | Round 8 |
| 家族事件独立时间线视图 | 事件结构保留、编辑 UI 保留，但不做独立聚合视图 | Round 8 |
| IndexedDB 存储层 | 照片改用外置链接后，该子系统整体消失 | Round 7 |

**注：** 家族档案能力（照片 + 生平事件）不单列为第 6 个组件——其**数据结构**归「数据模型与 Bug 修复」，其**编辑 UI**（内嵌于人物编辑 Sheet）归「卡片与弹窗细节」。此决策在第 8 轮明确记录，代价是该能力的验收标准拆散在两条线中，故本 spec 为其单开 **AC-28 ~ AC-31**。

## Goal

以 **Apple Style + Liquid Glass** 为设计基准，把「老太公 · 家族图谱」从当前的单文件原型重构为一套结构清晰、字阶可读、关系数据正确、可长期维护的**家族档案应用**。

具体地：保持现有玻璃材质与字体栈，把设计资源全部投入**字阶、行高、字距、间距网格与玻璃上的文字对比度**；把应用骨架确立为 **Header（身份 + 查找 + 显示偏好）/ Main（图谱）/ Footer（数据输入输出 + 危险操作）** 三段结构，Header 与 Footer 均 100% 宽度；新增**全员查找面板**（搜索 + 筛选合一，按以「我」为原点的关系距离分组）；卡片以**信息密度**而非尺寸作为分级手段；修复**关系双写不对称**导致的核心 Bug；把数据模型从「人 + 关系」扩展为**「人 + 关系 + 事件」**；移动端为设计基准，桌面端 ≥1024px 渐进增强。

## Constraints

### 设计约束
- **玻璃材质保持现状**，不强化也不削弱：`.glass-card` blur 28px / saturate 170% / 125deg 高光扫过 / 三颗背景光球均保留。
- **字体栈不动**（`app/globals.css:5-7` 已是 Apple 优先栈：`-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif`），不引入任何自定义字体或网络字体。
- **不引入 `next-themes`**，沿用现有自研三层主题（`lib/theme.ts` + `layout.tsx` bootTheme 内联脚本 + `ThemeCycleButton`）。
- **移动端为设计基准**（375–430px），桌面端只做放大不改结构。
- **卡片宽度必须一致，连线锚点不得错位**——高度差只能来自信息量，不能来自人为放大。

### 布局约束
- `Header` 与 `Footer` 必须 **100% 宽度**；现有 `max-w-3xl lg:max-w-5xl` 容器下沉到 `Main` 层。
- `Header` 只允许 3 个元素：品牌 / 查找入口 / 主题切换。**数据操作不得出现在 Header。**
- `Footer` 承载导出 / 导入 / 设置 + 本机存储提示。

### 数据约束
- **世代不落库**：`FamilyState` 不新增 `generation` 字段，关系距离由 `lib/family.ts` 中新的纯函数 BFS 推导。
- **照片走外置链接**：`Person` 只新增 `photoUrl?: string`，不引入 IndexedDB、不做图片压缩管道、不做上传 UI。
- `localStorage` 键 `laotagong:family:v1` **变更必须配迁移函数**；`sanitizeState` 是字段白名单强转，不配迁移会导致老数据被静默丢弃。
- **关系写入必须双写对称**——这是本 spec 最重要的不变量。

### 平台约束
- `output: "export"` → **无服务端能力**：无 Server Actions、无 API route、无 middleware、无动态路由。
- `basePath` 为构建期注入（`NEXT_PUBLIC_BASE_PATH`），**任何硬编码的 `/xxx` 绝对资源路径都会在 GitHub Pages 项目站点下 404**。
- Tailwind 4 无 `@theme` 块、无 `@custom-variant dark`，全项目 `dark:` variant 不可用，只能消费 `:root` / `.dark` 下的 CSS 变量。

## Non-Goals

- ❌ 不引入 IndexedDB 或任何额外存储层
- ❌ 不做同辈拖拽排序（`SiblingOrder`）
- ❌ 不做家族事件独立时间线视图
- ❌ 不做图片上传 / 压缩 / base64 内嵌
- ❌ 不改动玻璃材质参数（blur / saturate / 透明度 / 高光）
- ❌ 不引入自定义字体或网络字体
- ❌ 不替换自研主题系统为 `next-themes`
- ❌ 不新增服务端能力（API / Server Actions / 动态路由）
- ❌ 不做多用户、协作、云端同步
- ❌ 不扩展 `Gender` 枚举（保持 `male | female | unknown`）

## Acceptance Criteria

### 设计语言基线（组件 1）
- [ ] **AC-1** 玻璃材质参数与重构前完全一致：`.glass-card` 的 `backdrop-filter` 仍为 `blur(28px) saturate(170%)`，125deg 高光 `::before` 与三颗背景光球均保留
- [ ] **AC-2** 字阶建立明确的 4–5 级层级，主标题移动端 28px / 桌面端 34px，字重 600，字距 -0.02em；正文最小字号不低于 13px
- [ ] **AC-3** 间距体系切换到 **8px 基准网格**，卡片内 padding ≥16px，区块间距 ≥32px
- [ ] **AC-4** 玻璃卡片上的正文文字对比度满足 **WCAG AA（≥4.5:1）**，浅色与深色两套主题均需验证

### 页面骨架与顶栏（组件 2）
- [ ] **AC-5** `<header>` 与 `<footer>` 均为 **100% 视口宽度**，不继承任何 `max-w-*` 约束；内容容器下沉至 `<main>`
- [ ] **AC-6** `Header` 恰好包含 3 个视觉元素：品牌标识、查找入口、主题切换
- [ ] **AC-7** 数据操作（导出 / 导入 / 设置）**全部位于 `Footer`**，Header 中不存在任何数据操作入口
- [ ] **AC-8** 查找面板由搜索输入 + 筛选 chip 组成，**不新增独立搜索框与筛选框**（二者合一）
- [ ] **AC-9** 查找结果按**以「我」为原点的关系距离**分组：祖辈(-2) / 父辈(-1) / 我(0) / 子辈(+1) / …；与「我」不连通的人归入「未连接」组
- [ ] **AC-10** 关系距离为**运行时推导**，`FamilyState` 中不存在 `generation` 或等价字段
- [ ] **AC-11** 选中任一查找结果后，该人成为浏览焦点（`focusId`），图谱滚动至该人

### 卡片与弹窗细节（组件 3）
- [ ] **AC-12** 「我」的卡片显示**全部字段**（姓名 / 生卒年 / 籍贯 / 户籍 / 备注 / 头像）；配偶、父母、子女卡片只显示**姓名 + 生卒年 + 头像**
- [ ] **AC-13** **所有卡片宽度一致**，高度差仅由信息量产生；连线锚点在任何尺寸组合下均不错位
- [ ] **AC-14** 头像尺寸分级：我 56px / 亲属 36px；未设置 `photoUrl` 时回退到现有「姓名首字 + 性别渐变」
- [ ] **AC-15** 视口 **<1024px** 时弹窗为底部 Sheet；**≥1024px** 时弹窗垂直水平居中
- [ ] **AC-16** 弹窗居中在任意视口高度下不产生内容裁切，内容超出时可滚动

### 数据模型与 Bug 修复（组件 4）
- [ ] **AC-17** **核心 Bug 修复**：先「给 A 添加子女 C」再「给 A 添加配偶 B」后，把 C 设为「我」，**B 可见**（`C.motherId` 被正确回填）
- [ ] **AC-18** 关系写入统一走**双写对称**逻辑，`addSpouseLink` 与 `linkChildWithParents` 对称性一致
- [ ] **AC-19** `removeSpouseLink` 的语义被明确定义并测试：解除配偶关系后，已建立的父母链接是否保留，行为必须与文档一致且可预期
- [ ] **AC-20** `linkChildWithParents` 在多配偶场景下行为已定义（不再静默只取 `spouseIds[0]` 而不告知）
- [ ] **AC-21** `Person` 新增 `photoUrl?: string` 与 `events?: FamilyEvent[]`；`FamilyEvent = { id, type, date, place?, note? }`，`type` 覆盖婚丧嫁娶 / 迁徙 / 褒学 / 自定义
- [ ] **AC-22** `birthYear` / `deathYear` 等日期字段容忍非规范输入（`约1950`、`?`、`1949-`）
- [ ] **AC-23** 若 `STORAGE_KEY` 或 schema 发生变更，**必须配套迁移函数**，v1 数据可无损读入

### 工程文档与配置（组件 5）
- [ ] **AC-24** 新增 `CLAUDE.md`，约 150 行，**必须包含**：项目定位、命令、文件地图、**数据不变量**（关系双写对称 / 世代不落库 / STORAGE_KEY 变更须配迁移）、**易踩的坑**（Tailwind 4 无 `@theme` / `output:export` 无服务端 / basePath 构建期注入）、设计约定（玻璃保持 / 尺寸差 = 信息密度差 / 宽度对齐）
- [ ] **AC-25** `.gitignore` 补齐 `.omc/`、`.remember/`、`.vercel/`、`*.log`
- [ ] **AC-26** `.gitignore` **不得**忽略 `public/.nojekyll`（GitHub Pages 必需）
- [ ] **AC-27** `README.md` 更新功能列表（照片外链、家族事件）、设计说明（Apple Style / Liquid Glass）、数据模型简述

### 家族档案能力（跨组件，见 Topology 注）
- [ ] **AC-28** 人物编辑 Sheet 内提供「照片链接」输入框，填入外置 URL 后卡片头像立即更新
- [ ] **AC-29** 照片加载失败时优雅回退到「姓名首字 + 性别渐变」，不出现破图图标
- [ ] **AC-30** 人物编辑 Sheet 内提供可折叠的「家族事件」列表，支持增删改
- [ ] **AC-31** 家族事件**不**出现在卡片正面，仅在编辑 Sheet 内可见（避免卡片信息过载）

### 全局
- [ ] **AC-32** 移动端（375px）无横向滚动条，所有内容不溢出
- [ ] **AC-33** `pnpm build` 通过，`out/` 产物在 GitHub Pages 项目站点路径下资源不 404
- [ ] **AC-34** 浅色 / 深色两套主题下，所有新增 UI 均正确渲染

## Assumptions Exposed & Resolved

| 假设 | 如何被质疑 | 最终决定 |
|------|-----------|---------|
| 「我的卡片大点、亲属卡片小点」——尺寸差异是表达重要性的正确杠杆 | **Round 4 Contrarian**：树状布局下尺寸不一会让连线锚点错位、打断四段结构节奏。「如果所有卡片一样大呢？」 | **假设被推翻**。改为「信息密度分级」——尺寸差异是信息密度的**结果**而非目的。宽度必须一致，高度差只能来自信息量。原始诉求（我的卡片明显更突出）完整保留，树错位代价被消除 |
| 「优化数据结构」= 加字段 | **Round 6/7 层层追问范围**：四件事（修 Bug / 统一字段语义 / 拆巨石文件 / 加字段）量级差一个数量级 | 用户选择最大范围，随后 Round 8 的本体追问把「加字段」重新定义为「**这个产品是家族档案，不只是关系图**」，`FamilyEvent` 从「顺手加的」升格为**核心能力** |
| 照片必须进 `localStorage`（base64）或 `IndexedDB` | **Round 7 Simplifier**：三张手机照片 base64 后约 4.5–9MB，直接撞爆 5–10MB 配额，且 `QuotaExceededError` 会连带导致文字数据写入失败 | **用户把问题本身消掉了**——「照片我会找外置链接」。IndexedDB 子系统、图片压缩管道、上传 UI **全部消失**，退化为一个 `photoUrl?: string` 字符串字段 |
| 「世代」需要一个数据库字段 | **Round 3**：现有 `FamilyState` 完全没有世代概念，落库需 v1→v2 迁移 + 级联维护 | 改为**运行时 BFS 推导关系距离**（以「我」为原点，父辈 -1 / 子女 +1）。零迁移、零级联、切换「我」自动重算 |
| Header 需要同时放主题切换和数据操作 | **Round 5**：用户要求「主题切换和数据操作分开」，但未说明分开后数据操作去哪；项目当时 `<footer>` 零匹配 | 确立**三段语义分工**：Header = 身份 + 查找 + 显示偏好；Footer = 数据输入输出 + 危险操作。Footer 从「空白槽位」变成有明确职责的区域 |
| 「Apple Style」意味着需要引入自定义字体 | **Round 10 前核实代码**：`globals.css:5-7` 已是 `-apple-system` 优先栈 + `PingFang SC` 中文回退 | 字体栈**已符合 Apple Style**，零改动。设计资源全部转向字阶 / 间距 / 对比度 |

## Technical Context

### 现状结构（重构前）

```
app/
  globals.css        396 行  全部设计 token + 玻璃拟态，无 @theme 块
  layout.tsx          57 行  唯一 root layout，无 header/footer/main
  page.tsx             5 行  仅 <FamilyApp />
components/
  family-app.tsx    1277 行  整个应用，含 10 个组件
  ui/                        仅 5 个原语：button collapsible input label sheet
lib/
  family.ts          277 行  数据模型 + 全部关系算法（纯函数，对 UI 零依赖）
  theme.ts            36 行  自研主题，非 next-themes
  utils.ts             6 行  cn()
scripts/                     空目录
```

### 已定位的缺陷（重构须修复）

| 缺陷 | 位置 | 说明 |
|------|------|------|
| **关系双写不对称**（核心 Bug） | `lib/family.ts:154-157` `addSpouseLink` | 只往 `spouses` 追加，**从不回填已有子女的另一端双亲**。先加子女后加配偶 → 子女永远拿不到 `motherId` → 设为「我」后看不到另一位亲长 |
| `removeSpouseLink` 同样不回填 | `lib/family.ts:159-166` | 解除配偶后子女仍保留指向非配偶者的 `motherId` |
| 多配偶静默丢数据 | `lib/family.ts:121-152` | `linkChildWithParents` 只取 `spouseIds[0]`，其余配偶不被挂载且无提示 |
| 性别未知落到父亲分支 | 同上 | `gender === "unknown"` 时 `primaryRole` 归为 `"father"` |
| 类型与运行时不一致 | `lib/family.ts:1-28` | `birthYear?` 等 5 个字段类型 optional，但 `createPerson`(:40) 与 `sanitizeState`(:197) 恒填 `""` |
| **弹窗动画完全失效** | `components/ui/sheet.tsx:20,41,43` | 使用了 `animate-in` / `fade-in-0` / `slide-in-from-bottom` / `zoom-in-95`，但项目**未安装 `tw-animate-css`**，Tailwind 4 也无 `@plugin`——这些类不生成任何 CSS |
| 主题键名硬编码重复 | `app/layout.tsx:26` vs `lib/theme.ts:3` | bootTheme 内联脚本硬编码 `"laotagong:theme"` 字面量，与常量重复定义 |
| 深色模式状态栏不跟随 | `app/layout.tsx:14-21` | `themeColor: "#eef2f7"` 固定浅色 |
| 死代码 | `app/globals.css:359-362` | `select option` 样式存在但全项目无 `<select>` |

### 可复用资产

- **`components/ui/sheet.tsx:42-43` 已实现 `side="center"` 分支**（`left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[28px]`），但 3 处调用全部硬编码 `side="bottom"`——AC-15 可直接启用，无需新写组件。
- `components.json` 配置完整（Tailwind 4 写法：`tailwind.config: ""`），`hooks` alias 已声明但 `hooks/` 目录不存在。
- `deploy.yml` 的 `Detect base path` 步骤已正确区分用户站点与项目站点。

### 存储与数据流

```
localStorage["laotagong:family:v1"]
  ⇄ loadState / saveState
    ⇄ React state `FamilyState`
      → 派生：father / mother / spouses / children / siblings
      → 写路径：handleAddRelation / handleLinkExistingAs* / setAsMe / deletePerson
        → 纯函数 addParentLink / linkChildWithParents / addSpouseLink / removePersonDeep
```

### 关键数据结构

```ts
interface Person {
  id: string; name: string; gender: Gender;
  birthYear?: string; deathYear?: string;
  ancestralHome?: string; household?: string; note?: string;
  createdAt: number; updatedAt: number;
}

interface FamilyState {
  version: 1;
  persons: Record<string, Person>;
  parents: Record<string, { fatherId?: string; motherId?: string }>;  // childId → 双亲
  spouses: Array<{ a: string; b: string }>;                            // 无序对
  meId: string | null;
}
```

**两个必须区分的 id 概念：**
- `state.meId`（**持久化**）：谁是「我」，随 JSON 导出
- `focusId`（**不持久化**，React state）：当前浏览谁的图谱，刷新后丢失并跳回「我」

## Ontology (Key Entities)

*取自最终轮（Round 10）的实体抽取*

| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| `Person` | core domain | id, name, gender, birthYear, deathYear, ancestralHome, household, note, **photoUrl**, **events[]**, createdAt, updatedAt | 有多个父/母（经 `parents`）；有多个配偶（经 `spouses`）；有多个子女（反向派生） |
| `FamilyState` | core domain | version, persons, parents, spouses, meId | 聚合 Person；持有 meId |
| `Me` | core domain | meId | 是 FamilyState 的一个 Person 引用；是 RelationDistance 的原点 |
| `RelationDistance` | derived | 整数（负数=长辈，0=我，正数=晚辈） | 由 FamilyState 经 BFS 推导；**不落库** |
| `FamilyEvent` | core domain | id, type, date, place, note | 属于一个 Person |
| `PhotoUrl` | supporting | string（外置 URL） | 属于一个 Person；失败时回退到首字头像 |
| `SiblingOrder` | **deferred** | — | 本轮不实现 |
| `SearchPanel` | supporting | query, selectedFilters, results | 消费 RelationDistance 分组；选中后写 focusId |
| `Header` | layout | 品牌, 查找入口, 主题切换 | 100% 宽；不含数据操作 |
| `Main` | layout | 图谱内容 | 承载 max-w 容器 |
| `Footer` | layout | DataActionBar, 本机存储提示 | 100% 宽 |
| `DataActionBar` | supporting | 导出, 导入, 设置 | 位于 Footer |
| `MeCard` | supporting | 全字段 | 承载 FamilyEvent 入口与 PhotoUrl |
| `RelativeCard` | supporting | 姓名, 生卒年, 头像 | 与 MeCard **等宽**，高度更低 |
| `PersonEditSheet` | supporting | 全部 Person 字段 + 照片链接 + 家族事件列表 | ≥1024px 居中 / <1024px 底部 |
| `Generation` → `RelationDistance` | 已改名 | — | Round 3 决策：绝对世代 → 相对距离 |
| `GlassMaterial` | design | blur 28px, saturate 170%, 高光扫过 | **保持不动** |
| `TypographyScale` | design | 5 级字阶, 移动 28px / 桌面 34px | 本轮重点投入 |
| `SpacingGrid` | design | 8px 基准 | 本轮重点投入 |
| `UnconnectedGroup` | derived | 与「我」无路径的人 | 查找面板的兜底分组 |
| `ClaudeMd` | doc | 架构约束手册 ~150 行 | 记录数据不变量 |
| `Gitignore` | doc | +.omc/ +.remember/ +.vercel/ +*.log | — |

## Ontology Convergence

| Round | Entity Count | New | Changed | Stable | Stability Ratio |
|-------|-------------|-----|---------|--------|----------------|
| 1 | 8 | 8 | — | — | N/A（首轮） |
| 2 | 13 | 5 | 0 | 8 | 61.5% |
| 3 | 14 | 1 | 1 | 12 | 92.9% |
| 4 | 14 | 0 | 0 | 14 | 100% |
| 5 | 17 | 3 | 1 | 13 | 82.4% |
| 6 | 21 | 4 | 0 | 17 | 81.0% |
| 7 | 21 | 0 | 0 | 17 | 81.0%（`IndexedDB` 移除） |
| 8 | 21 | 2 | 0 | 19 | 90.5% |
| 9 | 23 | 2 | 0 | 21 | 91.3% |
| 10 | 23 | 0 | 0 | 23 | **100%** |

**收敛叙事：** 第 1–2 轮的 61.5% 反映设计方向尚未确定，实体处于发散状态。第 3 轮的 92.9% 是一次跃升——「世代不落库」这个决策同时**消掉**了一个待定字段并**固化**了 `RelationDistance` 的定义。第 5–6 轮的回落（82.4% → 81.0%）**不是坏事**：那是范围扩张（三段布局 + 家族档案）把新实体带进模型的必然结果，且这些新实体全部来自用户已确认的决策，不是猜的。第 10 轮回到 100%，说明领域模型与用户心智已对齐。

## Interview Transcript

<details>
<summary>Full Q&A (11 rounds including Round 0)</summary>

### Round 0 — Topology Confirmation
**Q:** 我读出的这 5 个顶层组件，拓扑对吗？需要增删、合并、拆分，还是推迟其中某几个？
**A:** 拓扑正确，开始提问
**Ambiguity:** not scored yet

### Round 1 — 页面骨架与顶栏 / Goal
**Q:** 新增的搜索框和筛选框，具体操作什么？
**A:** 搜索 + 筛选合并为「全员查找面板」（顶栏唯一搜索入口，结果面板按世代分组 + chip 筛选）
**Ambiguity:** 58.8%（Goal 0.50, Constraints 0.30, Criteria 0.20, Context 0.75）

### Round 2 — 设计语言基线 / Success Criteria
**Q:** 当前 app 已经有完整的液态玻璃了——你说「以 Apple Style + Liquid Glass 为基准」时，心里的痛点更接近哪个？
**A:** 材质 OK，排版不行（h1 22→34px、卡片 padding 12→16px、区块间距 24→32px，改 8px 基准网格）
**Ambiguity:** 55.5%

### Round 3 — 数据模型 / Constraints
**Q:** 查找面板要按世代分组，但目前数据里根本没有「世代」这个概念——它应该从哪来？
**A:** 运行时推导「关系距离」（BFS from meId，父辈 -1 / 我 0 / 子辈 +1，未连通归「未连接」组）；数据层零改动、零迁移
**Ambiguity:** 54.25%

### Round 4 — 卡片与弹窗 / Success Criteria 🔄 CONTRARIAN
**Q:** 【反方质疑】你假设「尺寸差异」是表达重要性的正确杠杆。如果换成「信息密度分级」，你原来的诉求会被满足，但树不会错位——你真正想要的是哪个？
**A:** 信息密度分级（尺寸是结果）。我卡片显示全字段 + 56px 头像；亲属卡片只留姓名 + 生卒 + 36px 头像。宽度对齐不断线
**Ambiguity:** 47%

### Round 5 — 页面骨架与顶栏 / Success Criteria
**Q:** footer 现在完全不存在。你要求它 100% 宽——它里该装什么？
**A:** 数据操作栏（导出 / 导入 / 设置）。分区逻辑：header = 身份 + 查找 + 显示偏好；footer = 数据输入输出 + 危险操作
**Ambiguity:** 45.75%

### Round 6 — 数据模型 / Goal
**Q:** 你说「优化数据结构」——它指到哪一层？四件事量级差一个数量级。
**A:** ＋ 新增字段（照片 / 家族事件）——选择最大范围
**Ambiguity:** 46.3%（↑ 范围扩张导致）

### Round 7 — 数据模型 / Constraints 🔄 SIMPLIFIER
**Q:** 【简化质疑】照片 base64 三张就能撞爆你的 5–10MB localStorage 配额。最简单但仍然有价值的版本是哪个？
**A（用户澄清）:** 「照片我会找外置链接」
**判定:** IndexedDB 子系统、图片压缩管道、上传 UI 全部消失；退化为 `photoUrl?: string` 字符串字段。问题本身被消掉
**Ambiguity:** 41%

### Round 8 — 数据模型 / Goal 🔄 ONTOLOGIST
**Q:** 【本体追问】剔掉照片之后，`FamilyEvent` 和 `SiblingOrder` 到底服务于什么？这个产品本质上是什么？
**A:** 家族档案：记录生平事件。数据模型 = 人 + 关系 + 事件。核心 = Avatar + FamilyEvent；支撑 = SiblingOrder（延后）
**Ambiguity:** 41%

### Round 9 — 工程文档 / Constraints
**Q:** 新增的 CLAUDE.md 要写到什么程度？（它是目前唯一挡住歧义度下降的组件）
**A:** 架构约束手册（~150 行）——数据不变量、易踩的坑、命令、文件地图、设计约定
**Ambiguity:** 25.75%

### Round 10 — 设计语言基线 / Constraints
**Q:** 这次重构的响应式优先级——主要在什么设备上用？
**A:** 移动端为主，桌面适配。断点 1024px 切换弹窗形态；h1 移动 28px / 桌面 34px
**Ambiguity:** **19% — 阈值达成**

</details>

## 风险与已知缺口

以下为结题时仍存的不确定性，**不阻塞执行**，但执行中应保持警觉：

1. **`removeSpouseLink` 的语义未定**（AC-19 只要求「行为被定义并测试」，未指定保留还是清除）。这是「删除关系 ≠ 删除事实」的建模判断，建议执行时按「**保留历史事实**」实现——即解除配偶不回溯清除已建立的父母链接，但需在 `CLAUDE.md` 记录该语义。
2. **多配偶场景的产品语义未定**（AC-20 只要求「行为已定义」）。当前 `spouseIds[0]` 的静默处理至少应改为显式告知。
3. **家族事件与卡片的信息量平衡未经实机验证**——用户已确认事件不出现在卡片正面（AC-31），但「我」卡片承载全部字段 + 照片后是否过高，需要实机看过再调。
4. **玻璃层级性能**：`.glass-card` / `.glass-btn` / `.glass-sheet` / 输入框四层 `backdrop-filter` 叠加，在低端移动设备上有代价。本轮决定不削弱玻璃，但若出现掉帧，**玻璃强度是第一个可调杠杆**。
5. **断点 1024px 的具体数值未经验证**——是桌面端弹窗居中的切换点，实际用 iPad 横屏等设备验证后可能需微调。

**非阻塞的既有缺陷**（探查发现，未纳入本轮 AC，建议随手修复）：
- `components/ui/sheet.tsx` 动画类失效（缺 `tw-animate-css`）——若按 AC-15 改动弹窗，顺手装包即可修复
- `app/layout.tsx:26` 主题键名字面量重复
- `app/layout.tsx:14-21` `themeColor` 固定浅色，深色模式状态栏不跟随
- `app/globals.css:359-362` `select option` 死代码
