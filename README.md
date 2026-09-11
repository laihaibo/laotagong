# 老太公 · 家族图谱

以「我」为中心的移动端家族关系图谱。液态玻璃视觉，本地存储，支持导入导出。

## 功能

- 以任意人物为「我」，向上无限追溯父母，向下延伸子女，横向连接配偶
- 记录每人 **籍贯**、**户籍**、生卒年与备注
- 人物卡片一键添加父母 / 子女 / 配偶，也可关联已有成员
- 数据保存在浏览器 localStorage，可导出 / 导入 JSON
- Next.js 16 静态导出 + GitHub Pages 自动部署

## 本地开发

```bash
pnpm install
pnpm dev
```

## 构建

```bash
pnpm build
```

产物在 `out/` 目录，可直接静态托管。

## 部署（GitHub Pages）

1. 推送到 GitHub 仓库的 `main`（或 `master`）分支
2. 仓库 Settings → Pages → Source 选择 **GitHub Actions**
3. Actions 会自动构建并发布（Node 22 + pnpm）

用户站点（`user.github.io`）与项目站点（`user.github.io/repo`）均自动适配 basePath。

## 技术栈

- Next.js 16（App Router，`output: "export"`）
- React 19 + TypeScript
- Tailwind CSS 4 + Radix UI（shadcn 风格组件）
- pnpm
