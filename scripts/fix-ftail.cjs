const fs = require("fs");
const p = "D:/XiaomiMiMoProjects/laotagong/components/family-tree.tsx";
let c = fs.readFileSync(p, "utf8");
const idx = c.indexOf("function Minimap({");
if (idx < 0) { console.log("no minimap"); process.exit(1); }
const head = c.slice(0, idx);
const tail = `function Minimap({
  layout,
  view,
  viewport,
  onJump,
}: {
  layout: TreeLayout;
  view: View;
  viewport: { w: number; h: number };
  onJump: (x: number, y: number) => void;
}) {
  const W = 112;
  const H = 80;
  const sx = layout.width > 0 ? W / layout.width : 1;
  const sy = layout.height > 0 ? H / layout.height : 1;
  const s = Math.min(sx, sy);
  const vx = (-view.x / view.scale) * s;
  const vy = (-view.y / view.scale) * s;
  const vw = (viewport.w / view.scale) * s;
  const vh = (viewport.h / view.scale) * s;

  return (
    <button
      type="button"
      className="glass pointer-events-auto absolute bottom-3 left-3 overflow-hidden rounded-xl"
      style={{ width: W, height: H }}
      title="????"
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const px = (e.clientX - rect.left) / s;
        const py = (e.clientY - rect.top) / s;
        onJump(px, py);
      }}
    >
      <svg width={W} height={H} className="absolute inset-0">
        {layout.nodes.map((n) => (
          <rect
            key={n.id}
            x={n.x * s}
            y={n.y * s}
            width={Math.max(2, n.width * s)}
            height={Math.max(2, n.height * s)}
            rx={1}
            fill={LINEAGE_STROKE[n.lineage] ?? "var(--line-other)"}
            opacity={n.lineage === "ego" ? 0.95 : 0.45}
          />
        ))}
        <rect
          x={vx}
          y={vy}
          width={Math.max(8, vw)}
          height={Math.max(6, vh)}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={1.2}
        />
      </svg>
    </button>
  );
}

const TreeScene = memo(function TreeScene({
  layout,
  persons,
  meId,
  focusId,
  kinship,
  onOpenPerson,
  onAddRelation,
  onSetMe,
}: {
  layout: TreeLayout;
  persons: Record<string, Person>;
  meId: string | null;
  focusId: string | null;
  kinship: Map<string, string>;
  onOpenPerson: (id: string) => void;
  onAddRelation: (id: string) => void;
  onSetMe: (id: string) => void;
}) {
  return (
    <>
      {layout.bands.map((band) => (
        <div
          key={"band-" + band.generation}
          className="pointer-events-none absolute left-0 w-full"
          style={{ top: band.y - 22, height: 22, opacity: 0.7 }}
        >
          <div className="flex h-full items-end px-2">
            <span className="rounded-t-md bg-[var(--glass-strong)] px-2 py-0.5 text-[10px] tracking-wide text-[var(--ink-faint)]">
              {band.label}
            </span>
          </div>
          <div className="absolute bottom-0 left-0 h-px w-full bg-[var(--glass-edge)]" />
        </div>
      ))}

      <svg
        className="pointer-events-none absolute left-0 top-0"
        width={layout.width}
        height={layout.height}
        aria-hidden
      >
        {(layout.routes ?? []).map((route) => {
          const stroke =
            route.kind === "spouse"
              ? "var(--line-spouse)"
              : LINEAGE_STROKE[route.lineage] ?? "var(--line-other)";
          return (
            <path
              key={route.id}
              d={route.d}
              fill="none"
              stroke={stroke}
              strokeWidth={route.kind === "spouse" ? 2.2 : 1.8}
              strokeOpacity={route.kind === "spouse" ? 0.85 : 0.72}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          );
        })}
      </svg>

      {layout.nodes.map((node) => {
        const person = persons[node.id];
        if (!person) return null;
        const isMe = meId === node.id;
        const isFocus = focusId === node.id;
        const years =
          person.birthYear || person.deathYear
            ? person.birthYear || "?" + "?" + person.deathYear || ""
            : "";
        const yearsText =
          person.birthYear || person.deathYear
            ? (person.birthYear || "?") + "?" + (person.deathYear || "")
            : "";
        const age = lifespanOf(person);
        const zodiac = zodiacOf(person.birthYear);
        const lineage = node.lineage;
        const term = kinship.get(node.id) || lineageLabel(lineage) || "";

        return (
          <div
            key={node.id}
            data-tree-node
            data-lineage={lineage}
            style={{
              position: "absolute",
              left: node.x,
              top: node.y,
              width: node.width,
              height: node.height,
              borderLeft: "3px solid " + (LINEAGE_STROKE[lineage] ?? "transparent"),
            }}
            className={cn(
              "glass-card absolute flex items-stretch overflow-hidden rounded-2xl",
              isMe && "me",
              isFocus && "focused"
            )}
          >
            <button
              type="button"
              onClick={() => onOpenPerson(node.id)}
              className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-2 text-center"
            >
              <Avatar person={person} size={isMe ? "sm" : "xs"} />
              <span className="w-full truncate text-caption font-medium text-[var(--ink)]">
                {person.name}
              </span>
              {yearsText ? (
                <span className="w-full truncate text-caption text-[var(--ink-faint)]">
                  {yearsText}
                  {age !== null && " ? " + age}
                  {zodiac && " ? " + zodiac.label}
                </span>
              ) : null}
              <span className="w-full truncate text-caption font-medium text-[var(--accent)]">
                {term}
              </span>
            </button>
            <div
              className="flex w-11 shrink-0 flex-col border-l border-[var(--glass-edge)]"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => onAddRelation(node.id)}
                title="????"
                className="flex flex-1 items-center justify-center text-[var(--ink-soft)] transition-colors hover:bg-[var(--glass-strong)] hover:text-[var(--ink)]"
              >
                <UserPlus className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onOpenPerson(node.id)}
                title="??"
                className="flex flex-1 items-center justify-center text-[var(--ink-soft)] transition-colors hover:bg-[var(--glass-strong)] hover:text-[var(--ink)]"
              >
                <Info className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onSetMe(node.id)}
                disabled={isMe}
                title="?????"
                className="flex flex-1 items-center justify-center text-[var(--ink-soft)] transition-colors hover:bg-[var(--glass-strong)] hover:text-[var(--accent)] disabled:opacity-30"
              >
                <Crown className="h-4 w-4" />
              </button>
            </div>
          </div>
        );
      })}
    </>
  );
});

function lineageLabel(kind: LineageKind): string {
  const map: Record<LineageKind, string> = {
    ego: "?",
    paternal: "??",
    maternal: "??",
    descendant: "??",
    sibling: "??",
    affinal: "??",
    collateral: "??",
    orphan: "",
  };
  return map[kind] ?? "";
}
`;
// fix yearsText - remove broken years var usage in tail (already clean)
fs.writeFileSync(p, head + tail, "utf8");
console.log("fixed tail", p, fs.statSync(p).size);
