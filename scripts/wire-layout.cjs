const fs = require("fs");

// --- family-tree.tsx ---
let ft = fs.readFileSync("D:/XiaomiMiMoProjects/laotagong/components/family-tree.tsx", "utf8");
if (!ft.includes("TreeG6")) {
  ft = ft.replace(
    'import { type TreeLayout, layoutFamilyTree } from "@/lib/tree";',
    'import { type TreeLayout, layoutFamilyTree } from "@/lib/tree";\nimport { TreeG6 } from "@/components/tree-g6";\nimport { type LayoutMode } from "@/lib/layout-mode";'
  );
}
if (!ft.includes("layoutMode")) {
  ft = ft.replace(
    `export function FamilyTree({
  state,
  focusId,
  onOpenPerson,
  onAddRelation,
  onSetMe,
}: {
  state: FamilyState;
  focusId: string | null;
  onOpenPerson: (id: string) => void;
  onAddRelation: (id: string) => void;
  onSetMe: (id: string) => void;
}) {`,
    `export function FamilyTree({
  state,
  focusId,
  onOpenPerson,
  onAddRelation,
  onSetMe,
  layoutMode = "custom",
}: {
  state: FamilyState;
  focusId: string | null;
  onOpenPerson: (id: string) => void;
  onAddRelation: (id: string) => void;
  onSetMe: (id: string) => void;
  layoutMode?: LayoutMode;
}) {`
  );
}
// insert layout mode chips after minimap button in filter bar
if (!ft.includes('data-layout-mode-chips')) {
  ft = ft.replace(
    `        <button
          type="button"
          className="h-8 rounded-full border border-[var(--glass-border)] px-3 text-caption text-[var(--ink-soft)]"
          onClick={() => setShowMinimap((v) => !v)}
        >
          ???
        </button>`,
    `        <button
          type="button"
          className="h-8 rounded-full border border-[var(--glass-border)] px-3 text-caption text-[var(--ink-soft)]"
          onClick={() => setShowMinimap((v) => !v)}
        >
          ???
        </button>
        <div data-layout-mode-chips className="ml-1 flex items-center gap-1 rounded-full border border-[var(--glass-border)] p-0.5">
          <span className="px-2 text-[10px] text-[var(--ink-faint)]">??</span>
          <span className={cn(
            "rounded-full px-2 py-0.5 text-caption",
            layoutMode === "custom" ? "glass-btn text-[var(--ink)]" : "text-[var(--ink-faint)]"
          )}>??</span>
          <span className={cn(
            "rounded-full px-2 py-0.5 text-caption",
            layoutMode === "g6" ? "glass-btn text-[var(--ink)]" : "text-[var(--ink-faint)]"
          )}>G6</span>
        </div>`
  );
}
// branch canvas vs g6 ? wrap the relative canvas container
if (!ft.includes("layoutMode === \"g6\"")) {
  ft = ft.replace(
    `      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-[var(--glass-edge)] bg-[var(--glass)]/40">
        <div
          ref={containerRef}
          data-tree-canvas`,
    `      {layoutMode === "g6" ? (
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
          data-tree-canvas`
  );
  // close the ternary before end of component return ? find the closing of that div
  // The custom tree section ends with `</div>\n    </div>\n  );\n}` near FamilyTree
  ft = ft.replace(
    /(<Button[\s\S]*?title="?????"[\s\S]*?<\/Button>\s*<\/div>\s*<\/div>\s*)\n    <\/div>\n  \);\n\}/,
    `$1
      </div>
      )}
    </div>
  );
}`
  );
}
fs.writeFileSync("D:/XiaomiMiMoProjects/laotagong/components/family-tree.tsx", ft, "utf8");
console.log("family-tree wired", ft.includes("layoutMode === \"g6\""), ft.includes("TreeG6"));

// --- family-app.tsx ---
let fa = fs.readFileSync("D:/XiaomiMiMoProjects/laotagong/components/family-app.tsx", "utf8");
if (!fa.includes("layout-mode")) {
  fa = fa.replace(
    'import { FamilyTree } from "@/components/family-tree";',
    'import { FamilyTree } from "@/components/family-tree";\nimport { type LayoutMode, LAYOUT_MODE_META, loadLayoutMode, saveLayoutMode } from "@/lib/layout-mode";'
  );
}
if (!fa.includes("layoutMode")) {
  // state near theme
  fa = fa.replace(
    "const [themeMode, setThemeMode] = useState",
    "const [layoutMode, setLayoutMode] = useState<LayoutMode>(\"custom\");\n  const [settingsOpen, setSettingsOpen] = useState(false);\n  const [themeMode, setThemeMode] = useState"
  );
  // hydrate layout mode - find applyTheme hydrate
  fa = fa.replace(
    "applyTheme(resolveTheme(mode));",
    "applyTheme(resolveTheme(mode));\n    setLayoutMode(loadLayoutMode());"
  );
  // changeLayout
  if (!fa.includes("changeLayoutMode")) {
    fa = fa.replace(
      "const changeTheme = useCallback",
      `const changeLayoutMode = useCallback((mode: LayoutMode) => {
    setLayoutMode(mode);
    saveLayoutMode(mode);
  }, []);

  const changeTheme = useCallback`
    );
  }
  // header button before theme
  fa = fa.replace(
    `<ThemeCycleButton mode={themeMode} onChange={changeTheme} />`,
    `<Button
              variant="ghost"
              size="icon-sm"
              data-header-item
              onClick={() => setSettingsOpen(true)}
              title="??"
            >
              <Settings2 className="h-4 w-4" />
            </Button>
            <ThemeCycleButton mode={themeMode} onChange={changeTheme} />`
  );
  // import Settings2
  if (!fa.includes("Settings2")) {
    fa = fa.replace(
      /from "lucide-react"/,
      `from "lucide-react"` // already has many; add Settings2 to import list
    );
    // fix import list - add Settings2 after Search or Database
    fa = fa.replace(
      /(\n  Search,)/,
      "$1\n  Settings2,"
    );
    if (!fa.includes("Settings2,")) {
      fa = fa.replace(
        /(\n  Database,)/,
        "$1\n  Settings2,"
      );
    }
  }
  // pass layoutMode to FamilyTree
  fa = fa.replace(
    `<FamilyTree
            state={state}
            focusId={focus}
            onOpenPerson={(id) => setEditingId(id)}
            onAddRelation={(id) => setRelationPickerFor(id)}
            onSetMe={(id) => setAsMe(id)}
          />`,
    `<FamilyTree
            state={state}
            focusId={focus}
            layoutMode={layoutMode}
            onOpenPerson={(id) => setEditingId(id)}
            onAddRelation={(id) => setRelationPickerFor(id)}
            onSetMe={(id) => setAsMe(id)}
          />`
  );
  // settings sheet before Data sheet or after header return block
  const settingsSheet = `
      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>??</SheetTitle>
            <SheetDescription>?????????</SheetDescription>
          </SheetHeader>
          <div className="space-y-3 pb-4">
            <Label>????</Label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(LAYOUT_MODE_META) as LayoutMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => changeLayoutMode(m)}
                  className={cn(
                    "rounded-2xl border px-3 py-3 text-left text-sm transition-all",
                    layoutMode === m
                      ? "glass-btn text-[var(--ink)]"
                      : "border-[var(--glass-border)] text-[var(--ink-soft)] hover:bg-[var(--glass-strong)]"
                  )}
                >
                  <div className="font-medium">{LAYOUT_MODE_META[m].label}</div>
                  <div className="mt-1 text-caption text-[var(--ink-faint)]">
                    {LAYOUT_MODE_META[m].hint}
                  </div>
                </button>
              ))}
            </div>
            <p className="text-caption text-[var(--ink-faint)]">
              ???????? G6 ???????????????
            </p>
          </div>
        </SheetContent>
      </Sheet>
`;
  if (!fa.includes("????")) {
    fa = fa.replace(
      /{\/\* ?????? \*\/}/,
      settingsSheet + "\n      {/* ?????? */}"
    );
  }
}
fs.writeFileSync("D:/XiaomiMiMoProjects/laotagong/components/family-app.tsx", fa, "utf8");
console.log("family-app wired", fa.includes("layoutMode"), fa.includes("Settings2"), fa.includes("????"));

// fix G6 layout name
let g6 = fs.readFileSync("D:/XiaomiMiMoProjects/laotagong/components/tree-g6.tsx", "utf8");
g6 = g6.replace('type: "antv-dagre"', 'type: "dagre"');
g6 = g6.replace('rankdir: "BT"', 'rankdir: "TB"');
fs.writeFileSync("D:/XiaomiMiMoProjects/laotagong/components/tree-g6.tsx", g6, "utf8");
console.log("g6 layout dagre TB");
