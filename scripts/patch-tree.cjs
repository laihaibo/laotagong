const fs = require("fs");
const p = "D:/XiaomiMiMoProjects/laotagong/lib/tree.ts";
let c = fs.readFileSync(p, "utf8");
if (!c.includes("collateralSide")) {
  c = c.replace("  pedigreeSortKey,", "  pedigreeSortKey,\n  collateralSide,");
}
const re = /const unitPedigreeKey = \(unit: string\): string => \{[\s\S]*?\n  \};/;
const neu = [
  "  const unitPedigreeKey = (unit: string): string => {",
  "    const members = membersOf.get(unit) ?? [];",
  "    let best = \"9\";",
  "    for (const id of members) {",
  "      const path = pedigreePath(working, id, meId);",
  "      if (path && path.length > 0 && /^[FM]+$/.test(path)) {",
  "        const key = pedigreeSortKey(path);",
  "        if (key < best) best = key;",
  "        continue;",
  "      }",
  "      const lineage = lineageOf.get(id);",
  "      const birth = working.persons[id]?.birthYear ?? \"\";",
  "      const side = collateralSide(working, id, meId);",
  "      let key = \"9\";",
  "      if (lineage === \"collateral\" && side === \"paternal\") key = \"00P\" + birth + id;",
  "      else if (lineage === \"sibling\") key = \"01S\" + birth + id;",
  "      else if (lineage === \"affinal\" || lineage === \"descendant\" || lineage === \"ego\") key = \"02E\" + id;",
  "      else if (lineage === \"collateral\" && side === \"maternal\") key = \"2M\" + birth + id;",
  "      else key = \"9\" + id;",
  "      if (key < best) best = key;",
  "    }",
  "    return best;",
  "  };"
].join("\n");
if (re.test(c)) { c = c.replace(re, neu); console.log("key ok"); }
else console.log("key fail");
const re2 = /const sign = parentIds\.length === 1 \? 0 : index === 0 \? -1 : 1;[\s\S]*?laneY: busY - 14 - index \* 8,/;
const neu2 = [
  "const sign = parentIds.length === 1 ? 0 : index === 0 ? -1 : 1;",
  "      const pl = lineageOf.get(pid);",
  "      const sidePull = pl === \"paternal\" ? -20 : pl === \"maternal\" ? 20 : 0;",
  "      return {",
  "        parentId: pid,",
  "        x: cx + sign * 12 + sidePull,",
  "        laneY: busY - 16 - index * 10,"
].join("\n");
if (re2.test(c)) { c = c.replace(re2, neu2); console.log("lane ok"); }
else console.log("lane fail");
fs.writeFileSync(p, c);
console.log("done", c.includes("00P"), c.includes("sidePull"));
