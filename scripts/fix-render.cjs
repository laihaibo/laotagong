const fs = require("fs");
const p = "D:/XiaomiMiMoProjects/laotagong/components/family-tree.tsx";
let c = fs.readFileSync(p, "utf8");
const start = c.indexOf("      <svg");
const end = c.indexOf("      {layout.nodes.map((node) => {");
if (start < 0 || end < 0) {
  console.log("markers", start, end);
  process.exit(1);
}
const svg = `      <svg
        className="pointer-events-none absolute left-0 top-0"
        width={layout.width}
        height={layout.height}
        aria-hidden
      >
        {/* ???????????????????????????????? */}
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
              strokeOpacity={route.kind === "spouse" ? 0.85 : 0.7}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          );
        })}
      </svg>

`;
c = c.slice(0, start) + svg + c.slice(end);
fs.writeFileSync(p, c, "utf8");
console.log("render routes ok", c.includes("layout.routes"));
