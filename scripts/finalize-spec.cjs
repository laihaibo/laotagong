const fs = require("fs");
const p = "D:/XiaomiMiMoProjects/laotagong/docs/compose/spec/family-tree-layout.md";
let c = fs.readFileSync(p, "utf8");
c = c.replace("status: designed", "status: delivered");
c = c.replace("commits: pending", "commits: workspace-local (main, no remote push this session)");
c = c.replace("updated: 2026-09-11", "updated: 2026-09-11");
c = c.replace("## Report\n", `## Report

**What was built** — Dual layout engines for the family tree canvas: (1) custom DOM/SVG layout with ego-centric same-generation clustering (clusterRank + inter-cluster H_GAP), and (2) AntV G6 comparison view with simplified glass nodes. Top-bar settings toggle persists via localStorage (default: custom). Parent-child edges in custom mode remain explicit continuous routes.

**Verification** — \`vitest run\`: PASS 146 tests / 12 files (includes cluster.ego, routes.geometry, kinship, tree-canvas). \`next build\`: PASS static export. Note: \`@antv/g6\` is loaded from CDN at runtime when G6 mode is selected; bundling G6 into Next/Turbopack hung the production build.

**Journey log**
- Bus+clamp line routing kept breaking attach points; replaced with per-edge routes.
- PowerShall-written Chinese strings corrupted to \`?\`; write UTF-8 via Node/\`String.fromCharCode\`.
- Static \`import("@antv/g6")\` froze Next build; CDN script loader unblocks static export.
- Affinal nephews sit in the same generation as my children; clustering must rank ego subtree 0 and in-law collateral 3 with wider gaps.
`);
// check off tasks
c = c.replace("- [ ] T1:", "- [x] T1:");
c = c.replace("- [ ] T2:", "- [x] T2:");
c = c.replace("- [ ] T3:", "- [x] T3:");
c = c.replace("- [ ] T4:", "- [x] T4:");
c = c.replace("- [ ] T5:", "- [x] T5:");
fs.writeFileSync(p, c, "utf8");
console.log("spec finalized");
