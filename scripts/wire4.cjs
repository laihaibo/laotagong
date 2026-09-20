const fs = require("fs");
const p = "D:/XiaomiMiMoProjects/laotagong/components/family-tree.tsx";
let c = fs.readFileSync(p, "utf8");
if (c.includes("{layoutMode === \"g6\" ? (")) {
  console.log("already");
} else {
  const reOpen = /      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-\[var\(--glass-edge\)\] bg-\[var\(--glass\)\]\/40">\r?\n        <div\r?\n          ref=\{containerRef\}\r?\n          data-tree-canvas/;
  if (!reOpen.test(c)) {
    console.log("open regex fail");
  } else {
    c = c.replace(reOpen, `      {layoutMode === "g6" ? (
        <TreeG6
          state={state}
          focusId={focusId}
          filter={filter}
          maxDepth={maxDepth}
          onOpenPerson={onOpenPerson}
        />
      ) : (
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-[var(--glass-edge)] bg-[var(--glass)]/40">
        <div
          ref={containerRef}
          data-tree-canvas`);
  }
  const reClose = /            <Target className="h-4 w-4" \/>\r?\n          <\/Button>\r?\n        <\/div>\r?\n      <\/div>\r?\n    <\/div>\r?\n  \);\r?\n\}/;
  if (!reClose.test(c)) {
    console.log("close regex fail");
  } else {
    c = c.replace(reClose, `            <Target className="h-4 w-4" />
          </Button>
        </div>
      </div>
      )}
    </div>
  );
}`);
    console.log("close ok");
  }
}
fs.writeFileSync(p, c, "utf8");
console.log("result", c.includes("{layoutMode === \"g6\" ? ("), (c.match(/<\/Button>\r?\n        <\/div>\r?\n      <\/div>\r?\n      \)\}/g)||[]).length);
