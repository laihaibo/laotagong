# 老太公 · 家族图谱

以「我」为中心的家族关系图谱。液态玻璃视觉，本地存储，支持导入导出。

## 功能

- 以任意人物为「我」，向上无限追溯父母，向下延伸子女，横向连接配偶
- 记录每人 **籍贯**、**户籍**、生卒年与备注
- **照片头像**：填一个外置图片链接即可，不做上传、不占本地存储配额
- **家族事件**：婚嫁、迁徙、出生、离世、褒学等，可记时间（容忍「约1950」这类写法）、地点与备注
- **五服**：按本宗九族的经典算法自动推出服制（斩衰 / 齐衰 / 大功 / 小功 / 缌麻 / 出服），并给出推导依据
- **生肖**：由生年推导，非规范写法（「约1950」）也能推，会标注「（推）」
- **查找**：弹窗内搜索姓名 / 籍贯 / 户籍，配合性别与在世筛选；结果按**以「我」为原点的关系距离**分组（祖辈 / 父辈 / 同辈 / 子辈 / 孙辈 / 未连接）
- 人物卡片一键添加父母 / 子女 / 配偶，也可关联已有成员
- 数据保存在浏览器 localStorage，可导出 / 导入 JSON
- Next.js 16 静态导出 + GitHub Pages 自动部署

### 交互约定

- **点击卡片看详情**，不会改变「我」。想以某人重新定心，用详情面板里的
  「以此人为中心」；**只有皇冠按钮会设「我」**。
- 顶栏四个图标：品牌 / 查找 / 数据 / 主题。查找与数据都是弹窗。

### 五服是怎么算的

旁系按「到共同祖先的代数」定服，这正是本宗九族的经典规则：

| 共同祖先 | 关系 | 服制 |
|---|---|---|
| 同父 | 兄弟姐妹 | 齐衰 |
| 同祖 | 堂兄弟姐妹 | 大功 |
| 同曾祖 | 从兄弟姐妹 | 小功 |
| 同高祖 | 族兄弟姐妹 | 缌麻 |
| 更远 | — | 出服 |

直系：父母斩衰、祖父母齐衰、曾祖父母齐衰（三月）、高祖父母缌麻。
姻亲不在本宗五服之内，单独标注。

> **这是简化版**：不区分长子/众子、父在/父殁、过继/出继。
> 族谱应用够用，礼制考据不够。

### 关系数据的一条硬规则

新增关系时**必须双写对称**。历史上有个很隐蔽的 bug：先给某人添加子女、之后才添加配偶时，
子女那一端永远不会被回填，于是把子女设为「我」就看不到另一位亲长——而反过来先加配偶就一切正常。
现在所有关系写入都经过同一个对称层，并有测试守着（见 `test/family.links.test.ts`）。

## 设计

基准是 **Apple Style + Liquid Glass**：

- 玻璃材质（模糊、饱和度、高光扫过、背景光球）保持不变
- 排版是重点：5 级字阶（13 / 15 / 17 / 22 / 响应式 28→34px），8px 基准间距网格
- 卡片尺寸差来自**信息密度**：锚点卡片显示全部字段所以更高，亲属卡片只留姓名与生卒年，
  但两者**宽度一致**，连线不会错位
- 移动端为设计基准；视口 ≥1024px 时弹窗改为垂直水平居中

## 数据模型

```ts
interface FamilyState {
  version: 1;
  persons: Record<string, Person>;
  parents: Record<string, { fatherId?: string; motherId?: string }>;  // childId → 双亲
  spouses: Array<{ a: string; b: string }>;                            // 无序对
  meId: string | null;
}

interface Person {
  id: string; name: string; gender: "male" | "female" | "unknown";
  birthYear?: string; deathYear?: string;   // 字符串，容忍「约1950」「?」
  ancestralHome?: string; household?: string; note?: string;
  photoUrl?: string;                        // 外置链接
  events?: FamilyEvent[];                   // 生平事件
  createdAt: number; updatedAt: number;
}
```

**没有 `generation` 字段。** 世代是运行时由 `getRelationDistances()` 从 `meId` 做 BFS 推导的，
不落库——这样切换「我」时自动重算，也不需要数据迁移。

## 本地开发

```bash
pnpm install
pnpm dev
```

## 测试

```bash
pnpm test        # vitest + jsdom
pnpm test:watch
```

覆盖数据层的核心不变量：关系双写对称、回填判定、关系距离推导、序列化往返、
非法输入不抛错。**视觉与布局需要人工在浏览器里验证**——jsdom 不实现
`backdrop-filter` 与真实的像素计算。

## 构建

```bash
pnpm build
```

产物在 `out/` 目录，可直接静态托管。

## 部署（GitHub Pages）

1. 推送到 GitHub 仓库的 `main`（或 `master`）分支
2. 仓库 Settings → Pages → Source 选择 **GitHub Actions**
3. Actions 会自动构建并发布（Node 22 + pnpm）

推送前会先跑 `verify` job（`pnpm test`）——**测试红了就挡住部署**。

用户站点（`user.github.io`）与项目站点（`user.github.io/repo`）均自动适配 basePath。

## 技术栈

- Next.js 16（App Router，`output: "export"` — 无服务端能力）
- React 19 + TypeScript
- Tailwind CSS 4 + Radix UI（shadcn 风格组件）
- vitest + jsdom
- pnpm

## 给协作者

架构约束、数据不变量与历史踩过的坑都写在 [`CLAUDE.md`](./CLAUDE.md)。
动数据层或设计 token 之前请先读它。
