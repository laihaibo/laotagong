# CLAUDE.md

给在这个仓库里工作的 AI 与人看的**架构约束手册**。只写「不知道就会做错」的东西，
不写全量 API 文档——那些去看代码。

---

## 项目定位

**老太公 · 家族图谱** — 以「我」为中心的移动端家族关系图谱。
液态玻璃视觉、纯客户端、数据只存在浏览器 localStorage、可导入导出 JSON。

设计基准：**Apple Style + Liquid Glass**。玻璃材质是既定资产，不要重做；
设计资源投入**字阶、行距、间距网格、以及玻璃上的文字对比度**。

## 命令

```bash
pnpm dev        # 本地开发
pnpm build      # 构建（静态导出到 out/）
pnpm test       # vitest + jsdom
pnpm test:watch # 监听模式
```

**没有 lint 脚本。** 原来的 `"lint": "next lint"` 在 Next 16 上已失效
（`next-lint.js` 已从 `next/dist/cli/` 移除），于 2026-09 删除。
不要重新加一条跑不通的 `next lint`——死掉的质量门会训练人不再相信红绿灯。
要加就加真正能跑的 eslint。

## 文件地图

```
app/
  globals.css      设计 token + 玻璃样式 + @theme 语义层（唯一的设计来源）
  icon.svg         应用图标 / favicon
  layout.tsx       root layout；含防闪烁的内联主题脚本
  page.tsx         仅渲染 <FamilyApp />
components/
  family-app.tsx   全部应用组件（待继续拆分）
  ui/              shadcn 风格原语：button / input / label / sheet / collapsible
lib/
  family.ts        纯函数数据层 —— 对 UI 零依赖，可单独测试
                   （关系算法 + 五服 + 生肖推导都在这里）
  theme.ts         自研主题（非 next-themes）
  utils.ts         cn()
scripts/
  check-contrast.mjs  token 漂移守卫（**不是**对比度验收，见其文件头）
test/
  fixtures/        固定 id 的裸 JSON，用于复现历史坏数据
e2e/               （已移除；改用 test/ 下的 jsdom 测试 + 人工验证清单）
```

---

## 数据不变量（最重要的一节）

### 1. 关系写入必须双写对称

`parents` 的**唯一构造者**是 `addParentLink`。任何调用点都不许裸写
`parents: { ... }` 对象字面量。

```bash
# 这条必须永远返回 0
grep -rn "parents: {" components/ hooks/
```

历史上踩过的坑：`addSpouseLink` 只往 `spouses` 追加、从不回填已有子女的另一端双亲。
于是「先给 A 加子女 C，再给 A 加配偶 B」之后，C 永远拿不到 `motherId`，
把 C 设为「我」时看不到母亲。**先加配偶再加子女的顺序却是正常的**——
这解释了为什么这个 bug 看起来像「时好时坏」。

### 2. 回填的判定必须在 post-add 状态上求值

`backfillChildrenOf` 要在配偶关系**已经写进 state 之后**再算配偶数。
在写入前求值，配偶数恒为 0，谓词永不成立，上面那个 bug 会原样复发。

`isUnambiguousBackfill` 是**残缺数据检测器**，不是写入前置条件：
数据修好之后它就该返回 false。

### 3. 只在唯一候选时回填，绝不猜

恰好 1 位配偶 → 唯一候选，可以回填。
0 位 → 无从补起。**≥2 位 → 是猜测，不写**，交给多配偶 picker 让用户指定。

族谱里凭空捏造一位祖先，比留一个空缺更糟——它与真相无法区分。

`applyRepairs` **可恢复但不可撤销**：重新导入修复前的 JSON 可以回到原状，
但没有历史日志，无法在界面上一键撤销。措辞不要夸大。

### 4. 世代不落库

`FamilyState` 恰好 5 个键：`version` / `persons` / `parents` / `spouses` / `meId`。
**没有 `generation` 字段，也不许加。**

关系距离由 `getRelationDistances()` 运行时 BFS 推导，以 `meId` 为原点：
父/母 −1、配偶 0、子女 +1、与「我」不连通者为 `null`。

注意 `d = 0` 那一环**同时包含配偶和兄弟姐妹**（配偶边权重为 0），
所以它叫「同辈」而不是「我」。

### 4b. 一切可推导的信息都不落库

同一条原则贯穿全库，凡能从已有数据算出来的，一律**运行时推导**：

| 信息 | 推导函数 | 依据 |
|---|---|---|
| 关系距离 / 世代 | `getRelationDistances` | 从 `meId` 做 BFS |
| 五服 | `wufuOf` | 血缘路径；旁系按「到共同祖先的代数」定服 |
| 生肖 | `zodiacOf` | `(公元年份 − 4) mod 12` |

好处是它们**不可能与源数据不一致**：改了生年，生肖立刻跟着变；换了「我」，
关系距离与五服全部重算。若把这些存成字段，就必须在每次写入时级联维护，
而级联维护正是第 1 条那个 bug 的来源。

**五服是简化版**：不区分长子/众子、父在/父殁、过继/出继。族谱应用够用，
礼制考据不够。每个结果都带 `basis` 字符串，展示给用户看凭什么这么算——
不要只给一个等级，那会让人无从核对。

### 5. Person 的字段清单只有一处

`normalizePerson` 是唯一来源，`createPerson` 与 `sanitizeState` 都必须经过它。

分成两份清单就是在制造静默数据丢失：写路径认识新字段、读路径不认识，
于是 `saveState` 写进去、`loadState` 又丢掉，**而构建和测试全绿，没有任何信号**。
新增字段时，改 `normalizePerson` 一处就够；如果你发现需要改第二处，说明结构被破坏了。

### 6. STORAGE_KEY 变更必须配迁移

`laotagong:family:v1`。`sanitizeState` 是字段白名单强转——不认识的键直接丢弃。
若要改 schema 或换键，**必须同时写迁移函数**，否则老用户数据会被静默清空。

---

## 易踩的坑

### CSS 注释里绝不能出现 `*/`

写 `p-*/gap-*` 这类缩写会**提前闭合注释**，后面的内容变成非法 CSS，
把紧随其后的整个 `@theme` 块一起毁掉。表现是：所有工具类静默停止生成，
构建不报错、页面看不出来。踩过一次，排查花了很久。

### Tailwind 4 的主题机制

- 项目**没有** `tailwind.config.js`（Tailwind 4 正确写法：`components.json` 里
  `tailwind.config` 为空串）。
- 设计 token 在 `app/globals.css` 的 `:root` / `.dark` 里，通过 `@theme inline`
  映射为语义 token。**`inline` 是必需的**：这些值引用运行时切换的变量。
- 深色模式用 `@custom-variant dark (&:where(.dark, .dark *))`，
  与 `lib/theme.ts` 的 `applyTheme()`（在 `documentElement` 上挂 `.dark`）对应。
  **不要用 `next-themes`**——自研主题是既定选择。
- 字号命名空间被 `--text-*: initial` 重置过，只剩 5 级：
  `text-display`(响应式 28→34) / `text-title`(22) / `text-subtitle`(17) /
  `text-body`(15) / `text-caption`(13)。
  **`text-xs` / `text-sm` / `text-base` / `text-lg` / `text-xl` 已不存在**，
  写了不会生成任何 CSS。正文不得小于 13px。
  这行 `initial` 必须是 `@theme` 块的**第一条声明**，排在自定义档位之前。

  ```bash
  # 这条必须永远返回 0
  grep -rn "text-xs\|text-sm\|text-base\|text-lg\|text-xl" components/
  ```

- **绝不重定义基础的 `--spacing`。** Tailwind 的基础值是 `0.25rem`，
  `p-3` = 12px、`gap-3` = 12px、`max-w-3xl` 等都挂在它上面。
  重定义会一次性重新缩放全库所有数值工具类，被误读成「重设计把布局改崩了」。
  要加新档位就用 `--spacing-card` / `--spacing-section` 这类具名 token。

### 静态导出（`output: "export"`）

**没有服务端能力**：无 Server Actions、无 API route、无 middleware、无动态路由。
所有数据必须留在客户端。加任何依赖服务端的功能前先想清楚这一点。

### basePath 是构建期注入的

`NEXT_PUBLIC_BASE_PATH`（见 `.github/workflows/deploy.yml` 的 Detect base path 步骤）。
**硬编码 `/xxx` 绝对资源路径会在 GitHub Pages 项目站点下 404。**
外置图片链接（如 `photoUrl`）是绝对 URL，不受影响，也不该被加前缀。

### `pnpm lint` 不存在

见「命令」一节。

---

## 设计约定

- **玻璃材质参数不动**：`.glass-card` 的 `blur(28px) saturate(170%)`、
  125deg 高光 `::before`、三颗 `.ambient` 光球，都是既定资产。
- **尺寸差 = 信息密度的结果，不是手段**。锚点卡片显示全部字段所以更高；
  亲属卡片只显示姓名 + 生卒年 + 头像所以更矮。
  **两者宽度必须一致**（`w-full`），否则连线锚点会错位。
- **字体栈不动**：`-apple-system` 优先 + 苹方/微软雅黑回退。
  Apple 设备上自动就是 SF Pro + 苹方，零下载。不要引入网络字体。
- 层级优先靠**字阶与字重**，而不是拉开灰色差距——深色模式下两级灰色
  为了满足 AA 已经收敛到很接近，靠颜色区分层级在那里行不通。

### 交互约定

- **点击卡片 = 看详情**。不要改回「点击即重定心」：被点的人会滑到锚点位置，
  看起来**完全像是「这个人刚刚变成了我」**，而它其实只改了 `focusId`。
  这个混淆是真实发生过的。
- **重定心是显式动作**：详情面板里的「以此人为中心」，或查找结果、面包屑。
- **只有皇冠按钮会设「我」**。任何其他点击都不该改 `meId`。
- 顶栏五个图标：品牌 / 全族总览 / 查找 / 数据 / 主题。总览、查找、数据都是**弹窗**，
  不做内联展开——内联面板会把图谱往下推。页脚只有一行署名。
- **总览视图**（`OverviewPanel`）按关系距离分层画出全部成员，复用
  `groupByRelationDistance`，不引入新的布局算法。点任意一人即定心。

## 无障碍

玻璃卡片上正文的对比度目标 **AA（≥4.5:1）**。次级/三级文字
（`--ink-soft` / `--ink-faint`）的上调就是为了在光球透出的合成背景上仍然达标。

> 注意：`scripts/check-contrast.mjs`（若存在）是 **token 漂移守卫**，
> 它**无法**回答真实的对比度问题——它复刻的是我们自己的合成模型，
> 而模型对玻璃层、光球透明度、扫光的建模并不完整。
> 真实证据只有**浏览器里的实测**（DevTools 对比度检查器）。

---

## 测试

`pnpm test`（vitest + jsdom）。**没有 Playwright**——视觉与布局由人工验证。

jsdom 能测：数据往返、DOM 结构、事件流、localStorage 键卫生、类名。
jsdom **不能**测：`backdrop-filter`、`getComputedStyle` 的像素值、断点切换、真实对比度。
这些必须人工在浏览器里看。

写测试时的两条经验：

1. **用固定 id 的裸 JSON fixture 复现坏数据**，不要用构造器造样本。
   构造器造出来的数据复现不了 load/write 路径的 bug。
2. **断言前先确认集合非空。** 曾经有一条「任何卡片都不含事件文本」的断言，
   在卡片属性还没被创建时**恒真**——绿着通过，而功能是坏的。
   空集合上的全称命题没有意义。

## 部署

推送到 `main` → GitHub Actions 构建 → GitHub Pages。
`verify` job 跑 `pnpm test` + `pnpm check:contrast`，**红了就挡住部署**。
`basePath` 由 workflow 自动判定（用户站点为空，项目站点为 `/<repo>`）。
`public/.nojekyll` 必须被跟踪——`.gitignore` 里不要加会遮蔽它的规则。
