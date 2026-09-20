const fs = require("fs");
const p = "D:/XiaomiMiMoProjects/laotagong/components/family-tree.tsx";
let c = fs.readFileSync(p, "utf8");
const open = `      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-[var(--glass-edge)] bg-[var(--glass)]/40">
        <div
          ref={containerRef}
          data-tree-canvas`;
if (c.includes("<TreeG6") && c.includes("data-tree-canvas") && !c.includes("{layoutMode === \"g6\" ? (")) {
  c = c.replace(
    open,
    `      {layoutMode === "g6" ? (
        <TreeG6
          state={state}
          focusId={focusId}
          filter={filter}
          maxDepth={maxDepth}
          onOpenPerson={onOpenPerson}
        />
      ) : (
` + open
  );
  const close = `            <Target className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}`;
  if (c.includes(close)) {
    c = c.replace(
      close,
      `            <Target className="h-4 w-4" />
          </Button>
        </div>
      </div>
      )}
    </div>
  );
}`
    );
    console.log("wrapped ok");
  } else {
    console.log("close not found");
  }
} else if (c.includes("{layoutMode === \"g6\" ? (")) {
  console.log("already wrapped");
} else {
  console.log("missing pieces");
}
fs.writeFileSync(p, c, "utf8");
console.log("check", c.includes("{layoutMode === \"g6\" ? ("), (c.match(/TreeG6/g)||[]).length);

// family-app
const ap = "D:/XiaomiMiMoProjects/laotagong/components/family-app.tsx";
let fa = fs.readFileSync(ap, "utf8");
if (!fa.includes("@/lib/layout-mode")) {
  fa = fa.replace(
    'import { FamilyTree } from "@/components/family-tree";',
    'import { FamilyTree } from "@/components/family-tree";\nimport {\n  LAYOUT_MODE_META,\n  type LayoutMode,\n  loadLayoutMode,\n  saveLayoutMode,\n} from "@/lib/layout-mode";'
  );
}
if (!fa.includes("useState<LayoutMode>")) {
  const m = fa.match(/const \[themeMode, setThemeMode\] = useState[^;]+;/);
  if (m) {
    fa = fa.replace(
      m[0],
      `const [layoutMode, setLayoutMode] = useState<LayoutMode>("custom");\n  const [settingsOpen, setSettingsOpen] = useState(false);\n  ` + m[0]
    );
  } else console.log("theme state not found");
}
if (!fa.includes("changeLayoutMode")) {
  const cm = fa.match(/const changeTheme = useCallback\(/);
  if (cm) {
    fa = fa.replace(
      "const changeTheme = useCallback(",
      `const changeLayoutMode = useCallback((mode: LayoutMode) => {
    setLayoutMode(mode);
    saveLayoutMode(mode);
  }, []);

  const changeTheme = useCallback(`
    );
  }
}
if (!fa.includes("loadLayoutMode()")) {
  fa = fa.replace(
    /applyTheme\(resolveTheme\(mode\)\);/,
    "applyTheme(resolveTheme(mode));\n    setLayoutMode(loadLayoutMode());"
  );
}
if (!fa.includes('title="\\u8bbe\\u7f6e"') && !fa.includes('title="设置"')) {
  // insert settings button
  fa = fa.replace(
    /<ThemeCycleButton mode=\{themeMode\} onChange=\{changeTheme\} \/>/,
    `<Button
              variant="ghost"
              size="icon-sm"
              data-header-item
              onClick={() => setSettingsOpen(true)}
              title="设置"
            >
              <Settings2 className="h-4 w-4" />
            </Button>
            <ThemeCycleButton mode={themeMode} onChange={changeTheme} />`
  );
}
if (!fa.includes("Settings2,")) {
  fa = fa.replace(/(\n  Search,)/, "$1\n  Settings2,");
  if (!fa.includes("Settings2,")) fa = fa.replace(/(\n  Database,)/, "$1\n  Settings2,");
}
if (!fa.includes("layoutMode={layoutMode}")) {
  fa = fa.replace(
    /<FamilyTree\n(\s+)state=\{state\}\n(\s+)focusId=\{focus\}/,
    "<FamilyTree\n$1state={state}\n$2focusId={focus}\n$2layoutMode={layoutMode}"
  );
}
if (!fa.includes("\u5e03\u5c40\u5f15\u64ce") && !fa.includes("布局引擎")) {
  const sheet = `
      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>设置</SheetTitle>
            <SheetDescription>布局引擎等显示偏好</SheetDescription>
          </SheetHeader>
          <div className="space-y-3 pb-4">
            <Label>布局引擎</Label>
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
          </div>
        </SheetContent>
      </Sheet>
`;
  if (fa.includes("{/* 数据管理弹窗 */}")) {
    fa = fa.replace("{/* 数据管理弹窗 */}", sheet + "\n      {/* 数据管理弹窗 */}");
  } else if (fa.includes("{/* 查找弹窗 */}")) {
    fa = fa.replace("{/* 查找弹窗 */}", sheet + "\n      {/* 查找弹窗 */}");
  } else {
    console.log("no insert point for sheet");
  }
}
fs.writeFileSync(ap, fa, "utf8");
console.log("app", fa.includes("layoutMode"), fa.includes("Settings2"), fa.includes("changeLayoutMode"), fa.includes("LAYOUT_MODE_META"));
