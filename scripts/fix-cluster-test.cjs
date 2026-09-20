const fs = require("fs");
const p = "D:/XiaomiMiMoProjects/laotagong/test/cluster.ego.test.ts";
let c = fs.readFileSync(p, "utf8");
c = c.replace(
  /const persons: Record<string, Person> = \{\};[\s\S]*?meId: "ME",/,
  `const persons: Record<string, Person> = {};
  for (const [id, g, y] of [
    ["WGF", "male", "1960"],
    ["WGM", "female", "1962"],
    ["ME", "male", "1990"],
    ["WIFE", "female", "1992"],
    ["SIS_IN_LAW", "female", "1994"],
    ["SIL_HUSBAND", "male", "1993"],
    ["MY_SON", "male", "2018"],
    ["MY_DAU", "female", "2020"],
    ["SIL_SON", "male", "2019"],
    ["SIL_DAU", "female", "2021"],
  ] as const) {
    persons[id] = person(id, g, y);
  }
  return {
    version: 1,
    persons,
    parents: {
      WIFE: { fatherId: "WGF", motherId: "WGM" },
      SIS_IN_LAW: { fatherId: "WGF", motherId: "WGM" },
      MY_SON: { fatherId: "ME", motherId: "WIFE" },
      MY_DAU: { fatherId: "ME", motherId: "WIFE" },
      SIL_SON: { fatherId: "SIL_HUSBAND", motherId: "SIS_IN_LAW" },
      SIL_DAU: { fatherId: "SIL_HUSBAND", motherId: "SIS_IN_LAW" },
    },
    spouses: [
      { a: "ME", b: "WIFE" },
      { a: "SIL_HUSBAND", b: "SIS_IN_LAW" },
      { a: "WGF", b: "WGM" },
    ],
    meId: "ME",
  };`
);
c = c.replace("expect(layout.byId.size).toBe(8);", "expect(layout.byId.size).toBe(10);");
fs.writeFileSync(p, c, "utf8");
console.log("test fixed", c.includes("WGF"), c.includes("toBe(10)"));
