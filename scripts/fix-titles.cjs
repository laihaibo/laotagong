const fs = require("fs");
const p = "D:/XiaomiMiMoProjects/laotagong/components/family-tree.tsx";
let c = fs.readFileSync(p, "utf8");
// Map corrupted titles by order of appearance in TreeScene buttons
// 553: add relation, 561: detail, 570: set me
c = c.split('title="????"').join('title="\\u589e\\u52a0\\u5173\\u7cfb"');
// may have replaced all three with same - fix sequentially
// Re-read and fix by unique context
c = fs.readFileSync(p, "utf8");
c = c.replace(
  /onClick=\{\(\) => onAddRelation\(node\.id\)\}\s*\n\s*title="[^"]*"/,
  'onClick={() => onAddRelation(node.id)}\n                title="\\u589e\\u52a0\\u5173\\u7cfb"'
);
c = c.replace(
  /onClick=\{\(\) => onOpenPerson\(node\.id\)\}\s*\n\s*title="[^"]*"/,
  'onClick={() => onOpenPerson(node.id)}\n                title="\\u8be6\\u60c5"'
);
c = c.replace(
  /onClick=\{\(\) => onSetMe\(node\.id\)\}[\s\S]*?title="[^"]*"/,
  'onClick={() => onSetMe(node.id)}\n                disabled={isMe}\n                title="\\u8bbe\\u4e3a\\u300c\\u6211\\u300d"'
);
// minimap title
c = c.replace(/title="[^"]*"\s*\n\s*onClick=\{\(e\) => \{\s*\n\s*const rect = e\.currentTarget/,
  'title="\\u70b9\\u51fb\\u8df3\\u8f6c"\n      onClick={(e) => {\n        const rect = e.currentTarget');
fs.writeFileSync(p, c, "utf8");
const after = fs.readFileSync(p, "utf8");
console.log("titles", after.includes("????"), after.includes("??"), after.includes("??"));
