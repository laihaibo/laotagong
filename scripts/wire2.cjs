const fs = require("fs");
const p = "D:/XiaomiMiMoProjects/laotagong/components/family-tree.tsx";
let c = fs.readFileSync(p, "utf8");

if (!c.includes("@/components/tree-g6")) {
  c = c.replace(
    'import { type TreeLayout, layoutFamilyTree } from "@/lib/tree";',
    'import { type TreeLayout, layoutFamilyTree } from "@/lib/tree";\nimport { TreeG6 } from "@/components/tree-g6";\nimport { type LayoutMode } from "@/lib/layout-mode";'
  );
}

c = c.replace(
  "  onSetMe,\n}: {\n  state: FamilyState;\n  focusId: string | null;\n  onOpenPerson: (id: string) => void;\n  onAddRelation: (id: string) => void;\n  onSetMe: (id: string) => void;\n}) {",
  "  onSetMe,\n  layoutMode = \"custom\",\n}: {\n  state: FamilyState;\n  focusId: string | null;\n  onOpenPerson: (id: string) => void;\n  onAddRelation: (id: string) => void;\n  onSetMe: (id: string) => void;\n  layoutMode?: LayoutMode;\n}) {"
);

// layout indicator after minimap toggle button text
const minimapBtn = "          onClick={() => setShowMinimap((v) => !v)}\n        >\n          \u5c0f\u5730\u56fe\n        </button>";
if (c.includes(minimapBtn) && !c.includes("data-layout-mode-chips")) {
  c = c.replace(
    minimapBtn,
    minimapBtn +
      "\n        <div data-layout-mode-chips className=\"ml-1 inline-flex items-center gap-1 rounded-full border border-[var(--glass-border)] px-2 py-0.5 text-[10px] text-[var(--ink-faint)]\">\n          <span>\u5e03\u5c40</span>\n          <span className={cn(\"rounded-full px-1.5 py-0.5\", layoutMode === \"custom\" ? \"glass-btn text-[var(--ink)]\" : \"\")}>\u81ea\u7814</span>\n          <span className={cn(\"rounded-full px-1.5 py-0.5\", layoutMode === \"g6\" ? \"glass-btn text-[var(--ink)]\" : \"\")}>G6</span>\n        </div>"
  );
  console.log("chips ok");
} else {
  console.log("minimap btn missing or chips exist", c.includes(minimapBtn), c.includes("data-layout-mode-chips"));
}

// wrap canvas with conditional G6
const canvasOpen = '      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-[var(--glass-edge)] bg-[var(--glass)]/40">\n        <div\n          ref={containerRef}\n          data-tree-canvas';
if (c.includes(canvasOpen) && !c.includes("layoutMode === \"g6\"")) {
  c = c.replace(
    canvasOpen,
    '      {layoutMode === "g6" ? (\n        <TreeG6\n          state={state}\n          focusId={focusId}\n          filter={filter}\n          maxDepth={maxDepth}\n          onOpenPerson={onOpenPerson}\n        />\n      ) : (\n' + canvasOpen
  );
  // close before the final `    </div>\n  );\n}` of FamilyTree — first occurrence after Target button
  const targetBtn = '            <Target className="h-4 w-4" />\n          </Button>\n        </div>\n      </div>\n    </div>\n  );\n}';
  if (c.includes(targetBtn)) {
    c = c.replace(
      targetBtn,
      '            <Target className="h-4 w-4" />\n          </Button>\n        </div>\n      </div>\n      )}\n    </div>\n  );\n}'
    );
    console.log("branch close ok");
  } else {
    console.log("target close missing");
    console.log(JSON.stringify(c.slice(c.indexOf("Target className"), c.indexOf("Target className")+200)));
  }
  console.log("canvas open replaced");
} else {
  console.log("canvas open fail", c.includes(canvasOpen), c.includes("layoutMode === \"g6\""));
}

fs.writeFileSync(p, c, "utf8");
console.log("done", c.includes("TreeG6"), c.includes("layoutMode"));
