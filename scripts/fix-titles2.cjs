const fs = require("fs");
const p = "D:/XiaomiMiMoProjects/laotagong/components/family-tree.tsx";
let c = fs.readFileSync(p, "utf8");
const add = String.fromCharCode(0x589e, 0x52a0, 0x5173, 0x7cfb);
const detail = String.fromCharCode(0x8be6, 0x60c5);
const setMe = String.fromCharCode(0x8bbe, 0x4e3a, 0x300c, 0x6211, 0x300d);
const jump = String.fromCharCode(0x70b9, 0x51fb, 0x8df3, 0x8f6c);
const dot = String.fromCharCode(0xb7); // ?
c = c.replace(/title="\\u589e\\u52a0\\u5173\\u7cfb"/g, "title=\"" + add + "\"");
c = c.replace(/title="\\u8be6\\u60c5"/g, "title=\"" + detail + "\"");
c = c.replace(/title="\\u8bbe\\u4e3a\\u300c\\u6211\\u300d"/g, "title=\"" + setMe + "\"");
c = c.replace(/title="\\u70b9\\u51fb\\u8df3\\u8f6c"/g, "title=\"" + jump + "\"");
c = c.replace(/" \? " \+ age/g, "\" \\u00b7 \" + age");
c = c.replace(/" \? " \+ zodiac\.label/g, "\" \\u00b7 \" + zodiac.label");
// use real middot
c = c.split(String.fromCharCode(0x3f) + " + age").join(String.fromCharCode(0xb7) + " + age");
c = c.replace(/age !== null && " \? " \+ age/, "age !== null && \" " + dot + "\" + age");
fs.writeFileSync(p, c, "utf8");
const after = fs.readFileSync(p, "utf8");
console.log("add", after.includes(add), "detail", after.includes(detail), "setMe", after.includes(setMe));
console.log("sample title", after.match(/title=\"[^\"]+\"/g).slice(-5));
