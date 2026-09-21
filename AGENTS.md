# AGENTS.md — 老太公 · 家族图谱

以「我」为原点的家族关系图谱（中文族谱应用）。**纯客户端**：Next.js 16 静态导出
（`output: "export"`，无服务端能力），数据只存浏览器 localStorage，可导入导出 JSON。

**改数据层或画布连线之前，先读 [`CLAUDE.md`](./CLAUDE.md)** —— 那里是完整的
架构约束、数据不变量与历史踩坑记录，本文件只是快速索引。

## 命令

```bash
pnpm dev              # 开发服务器（Node ≥ 22，pnpm）
pnpm build            # 静态导出到 out/
pnpm test             # vitest + jsdom 全量（当前 167 个）
pnpm test:watch
npx tsc --noEmit      # 类型检查（package.json 无 typecheck 脚本）
node scripts/check-contrast.mjs   # token 漂移守卫（不是对比度验收）
```

- **没有 lint 脚本**，也不要重新加 `next lint`（Next 16 已移除，跑不通）。
- 端口 3000 常有一个用户自己开的 dev server；再起会换端口或直接报
  "Another next dev server is already running"。优先复用 3000。

## 结构

```
app/            Next.js App Router；globals.css 是唯一设计 token 来源
components/     family-tree.tsx（画布+防误触）、family-app.tsx（外壳+弹窗）、
                tree-g6.tsx（G6 渲染引擎）、ui/（shadcn 风格）
lib/            纯函数层：family.ts（数据+关系算法+关系选项规则）、
                tree.ts（布局+连线几何）、g6-scene.ts（自研几何→G6 数据）、
                lineage.ts（亲系）、kinship.ts（称谓，含连襟/妯娌等多跳姻亲）、
                layout-mode.ts（布局引擎持久化）、dev-sample.ts（开发示例数据）、
                theme.ts（自研主题）
test/           vitest + jsdom；routes.geometry.test.ts 是连线几何守卫
docs/screenshots/  README 用的真实截图（1440×860）
scripts/        check-contrast.mjs 之外都是一次性 codemod，勿执行
```

## 硬性不变量（违反会静默坏掉，测试守着）

1. **关系写入必须双写对称**：`parents` 的唯一构造者是 `addParentLink`；
   UI 层禁止裸写 `parents: {...}` 字面量
   （`grep -rn "parents: {" components/` 必须为 0；lib/test 的字面量是合法构造）。
2. **世代不落库**：`FamilyState` 只有 5 个键，无 `generation` 字段；
   世代由 `getRelationDistances()` 从 `meId` BFS 推导。
3. **婚姻与共同养育是两种独立的边**：「添加母亲」不建婚姻边是刻意设计，
   布局层靠 `buildUnits` 把共同养育者并格，绝不回写 `spouses`。
4. **`normalizePerson` 是 Person 字段唯一清单**，新增字段只改它一处。
5. **画布几何**（`test/routes.geometry.test.ts` 逐 4px 采样守卫）：
   - 任意两卡片不得相交；
   - 连线途中任何一点不得落进卡片内部（卡片画在 SVG 上层，被盖住 = 视觉断线）；
   - 经典画法：父母横线相连 → 横线中点垂落 → 总线横贯 → 每孩短垂线落到**顶边中点**；
     单元内男左女右（性别优先于生年）；`SPOUSE_GAP` 是导出常量。
6. **CSS 级联陷阱**：Tailwind 4 工具类在 `@layer utilities`，而 `globals.css` 的
   自定义类（`.glass-card` 等）未分层——**未分层样式赢**。给带自定义类的元素定位，
   position 必须写内联 style（画布节点就是这么修的）。
7. **关系选项规则只在 lib 一处**：六种细分关系（父/母/夫/妻/子/女）的可用性
   （男不能加丈夫、女不能加妻子、已有槽位禁用）与默认性别（父/夫/子→男、
   母/妻/女→女）全部在 `lib/family.ts` 的 `relationOptions`；组件只消费。
   细分关系经 `relationBaseOf` 归约成三种边操作，`spouses` 仍只经 `addSpouseLink`。
8. **双布局引擎共享同一几何**：G6 模式（`lib/g6-scene.ts`）调同一个
   `layoutFamilyTree()`，preset 定位 + 自定义边渲染总线连线；**不要给 G6
   喂 dagre 之类自动布局**（配偶边参与排秩会毁掉辈分行对齐）。
   改 `lib/tree.ts` 几何两个引擎同时变，采样守卫同时守护两者。
9. **`public/laotagong-*.json` 是本机示例/个人数据，不进版本库**（.gitignore 已排除）；
   `lib/dev-sample.ts` 只在开发模式且本机存储为空时自动载入。

## 平台与编码

- `crypto.randomUUID` 只在安全上下文存在 → 一律用 `newId()`；
  `localStorage.setItem` / `setPointerCapture` 会抛 → 分别用 `saveState()`（返回 boolean）
  和 try/catch；**绝不在 state updater 里读 ref**（把值先取成局部常量）。
- 文件保持 UTF-8 无 BOM。`scripts/fix-*.cjs` 曾把中文注释/字符串毁成 `?` 乱码，勿运行；
  发现乱码按现状重写为有意义中文。
- CSS 注释里不能出现 `*/`（会提前闭合毁掉 `@theme`）；字阶只有 5 级
  （`text-display/title/subtitle/body/caption`），`text-xs/sm/base/lg/xl` 不存在；
  绝不重定义 `--spacing`。
- 静态导出无 API route / middleware；`NEXT_PUBLIC_BASE_PATH` 构建期注入，
  禁止硬编码绝对资源路径。
- `.mimosa/` 是安全扫描插件的运行状态，git status 里的变动可忽略。

## 测试纪律

写完回归测试，**把 bug 放回去跑一次确认它会红**；断言前确认集合非空。
改连线几何时，把新数据形态加进 `routes.geometry.test.ts` 的采样测试。
