const fs = require("fs");
const p = "D:/XiaomiMiMoProjects/laotagong/docs/compose/spec/family-tree-layout.md";
let c = fs.readFileSync(p, "utf8");
c = c.replace("status: delivered", "status: delivered");
const report = `## Report

**What was built** — Dual family-tree layout engines with top-bar settings toggle:
(1) custom DOM/SVG canvas with ego-centric same-generation clustering — only true descendants of「我」(and their spouses) get clusterRank 0; in-law collateral (e.g. spouse\'s sister and her children) get rank 3 with wider H_GAP so my children and her children do not sit in one mixed band;
(2) AntV G6 comparison view (simplified glass nodes + lineage-colored edges), loaded from CDN at runtime because bundling @antv/g6 hung Turbopack static export.
Layout mode persists in localStorage (default custom) and is passed into FamilyTree.

**Verification** — vitest run: PASS 145 tests / 12 files (cluster.ego asserts non-interleave AND gap > 8px). next build: PASS static export.

**Journey log**
- Review found layoutMode never reached FamilyTree (codemod miss) — one-line prop fix.
- Review found d>=1 marked all affinal nephews rank 0 — replaced with isMeDescendant + recursive affinal rank.
- PowerShell/codemod UTF-8 corruption still poisons Chinese comments in tree.ts; prefer Node scripts.
- G6 must stay out of the Next bundle for this project until toolchain handles it.

`;
if (c.includes("## Report")) {
  c = c.replace(/## Report[\s\S]*?(?=\n## \[S1\])/, report);
} else {
  c = c.replace("# 家族树布局：以我为中心聚类 + 双模式切换", "# 家族树布局：以我为中心聚类 + 双模式切换\n\n" + report);
}
fs.writeFileSync(p, c, "utf8");
console.log("spec updated");
