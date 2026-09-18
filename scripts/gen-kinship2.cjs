const fs = require("fs");
const u = {
  me: "\\u6211",
  qinshu: "\\u4eb2\\u5c5e",
  fuqin: "\\u7236\\u4eb2",
  muqin: "\\u6bcd\\u4eb2",
  zufu: "\\u7956\\u7236",
  zumu: "\\u7956\\u6bcd",
  wai: "\\u5916",
  zeng: "\\u66fe",
  gao: "\\u9ad8",
  shi: "\\u4e16",
  zhangfu: "\\u4e08\\u592b",
  qizi: "\\u59bb\\u5b50",
  peiou: "\\u914d\\u5076",
  erzi: "\\u513f\\u5b50",
  nver: "\\u5973\\u513f",
  zinv: "\\u5b50\\u5973",
  erxi: "\\u513f\\u5ab3",
  nvxu: "\\u5973\\u5a7f",
  zinvpeiou: "\\u5b50\\u5973\\u914d\\u5076",
  zhangmuniang: "\\u4e08\\u6bcd\\u5a18",
  yuefu: "\\u5cb3\\u7236",
  popo: "\\u5a46\\u5a46",
  gonggong: "\\u516c\\u516c",
  neixiong: "\\u5185\\u5144",
  neidi: "\\u5185\\u5f1f",
  qixiongdi: "\\u59bb\\u5144\\u5f1f",
  yijie: "\\u59e8\\u59d0",
  yimei: "\\u59e8\\u59b9",
  qijiemei: "\\u59bb\\u59d0\\u59b9",
  dabozi: "\\u5927\\u4f2f\\u5b50",
  xiaoshuzi: "\\u5c0f\\u53d4\\u5b50",
  fuxiongdi: "\\u592b\\u5144\\u5f1f",
  daguzi: "\\u5927\\u59d1\\u5b50",
  xiaoguzi: "\\u5c0f\\u59d1\\u5b50",
  fujiemei: "\\u592b\\u59d0\\u59b9",
  gege: "\\u54e5\\u54e5",
  didi: "\\u5f1f\\u5f1f",
  jiejie: "\\u59d0\\u59d0",
  meimei: "\\u59b9\\u59b9",
  xiongdi: "\\u5144\\u5f1f",
  jiemei: "\\u59d0\\u59b9",
  tongbao: "\\u540c\\u80de",
  saozi: "\\u5ac2\\u5b50",
  dixi: "\\u5f1f\\u5ab3",
  jiefu: "\\u59d0\\u592b",
  meifu: "\\u59b9\\u592b",
  xiongdipeiou: "\\u5144\\u5f1f\\u914d\\u5076",
  jiemeipeiou: "\\u59d0\\u59b9\\u914d\\u5076",
  bofu: "\\u4f2f\\u7236",
  shufu: "\\u53d4\\u7236",
  shubo: "\\u53d4\\u4f2f",
  gumu: "\\u59d1\\u6bcd",
  jiufu: "\\u8205\\u7236",
  yimu: "\\u59e8\\u6bcd",
  zhizi: "\\u4f84\\u5b50",
  zhinu: "\\u4f84\\u5973",
  waisheng: "\\u5916\\u751f",
  waishengnu: "\\u5916\\u751f\\u5973",
  tang: "\\u5802",
  biao: "\\u8868",
  qin: "\\u4eb2",
  sunzi: "\\u5b59\\u5b50",
  sunnv: "\\u5b59\\u5973",
  waisun: "\\u5916\\u5b59",
  waisunnv: "\\u5916\\u5b59\\u5973",
  qinjiagong: "\\u4eb2\\u5bb6\\u516c",
  qinjiamu: "\\u4eb2\\u5bb6\\u6bcd",
  tongbei: "\\u540c\\u8f88",
  shizu: "\\u4e16\\u7956",
  shisun: "\\u4e16\\u5b59",
};
const ts = `import { type FamilyState, type Person } from "./family";
import { computeDistances, pedigreePath } from "./lineage";

function genderOf(p: Person | undefined): Person["gender"] {
  return p?.gender ?? "unknown";
}
function birthOf(p: Person | undefined): string {
  return p?.birthYear ?? "";
}
function isElder(a: Person | undefined, b: Person | undefined): boolean | null {
  const ya = birthOf(a);
  const yb = birthOf(b);
  if (!ya || !yb) return null;
  return ya < yb;
}
function isSpouse(state: FamilyState, meId: string, personId: string): boolean {
  return state.spouses.some(
    (s) => (s.a === meId && s.b === personId) || (s.b === meId && s.a === personId)
  );
}
function spouseIdsOf(state: FamilyState, id: string): string[] {
  return state.spouses
    .filter((s) => s.a === id || s.b === id)
    .map((s) => (s.a === id ? s.b : s.a));
}
function childIdsOf(state: FamilyState, id: string): string[] {
  const out: string[] = [];
  for (const [cid, p] of Object.entries(state.parents)) {
    if (p.fatherId === id || p.motherId === id) out.push(cid);
  }
  return out;
}
function shareParents(state: FamilyState, a: string, b: string): boolean {
  const pa = state.parents[a];
  const pb = state.parents[b];
  if (!pa || !pb) return false;
  return Boolean(
    (pa.fatherId && pa.fatherId === pb.fatherId) ||
      (pa.motherId && pa.motherId === pb.motherId)
  );
}

export function ancestorTerm(path: string): string {
  const n = path.length;
  if (n === 0) return "${u.me}";
  if (n === 1) return path.charAt(0) === "F" ? "${u.fuqin}" : "${u.muqin}";
  const core = path.charAt(n - 1) === "F" ? "${u.zufu}" : "${u.zumu}";
  const gen = n === 2 ? "" : n === 3 ? "${u.zeng}" : n === 4 ? "${u.gao}" : String(n - 2) + "${u.shi}";
  let outer = 0;
  let inner = 0;
  if (path.charAt(0) === "M") outer += 1;
  for (let i = 1; i <= n - 2; i += 1) {
    if (path.charAt(i) === "M") inner += 1;
  }
  return (outer ? "${u.wai}" : "") + gen + (inner ? "${u.wai}" : "") + core;
}

function inLawParentTerm(me: Person, role: "father" | "mother"): string {
  const meMale = genderOf(me) === "male";
  if (role === "mother") return meMale ? "${u.zhangmuniang}" : "${u.popo}";
  return meMale ? "${u.yuefu}" : "${u.gonggong}";
}

export function kinshipTerm(
  state: FamilyState,
  personId: string,
  meId: string | null
): string {
  if (!meId || !state.persons[meId] || !state.persons[personId]) return "${u.qinshu}";
  if (personId === meId) return "${u.me}";
  const me = state.persons[meId];
  const person = state.persons[personId];
  const path = pedigreePath(state, personId, meId);
  if (path && path.length > 0 && /^[FM]+$/.test(path)) {
    return ancestorTerm(path);
  }
  return kinshipInner(state, personId, meId, me, person);
}

function kinshipInner(
  state: FamilyState,
  personId: string,
  meId: string,
  me: Person,
  person: Person
): string {
  const mySpouses = spouseIdsOf(state, meId);
  const gMe = genderOf(me);
  const gP = genderOf(person);
  const myP = state.parents[meId];

  if (isSpouse(state, meId, personId)) {
    if (gMe === "female" && gP === "male") return "${u.zhangfu}";
    if (gMe === "male" && gP === "female") return "${u.qizi}";
    return "${u.peiou}";
  }

  const myKids = childIdsOf(state, meId);
  if (myKids.includes(personId)) {
    if (gP === "male") return "${u.erzi}";
    if (gP === "female") return "${u.nver}";
    return "${u.zinv}";
  }

  for (const kidId of myKids) {
    if (isSpouse(state, kidId, personId)) {
      const kid = state.persons[kidId];
      if (genderOf(kid) === "male" && gP === "female") return "${u.erxi}";
      if (genderOf(kid) === "female" && gP === "male") return "${u.nvxu}";
      return "${u.zinvpeiou}";
    }
  }

  for (const sid of mySpouses) {
    const sp = state.parents[sid];
    if (!sp) continue;
    if (sp.motherId === personId) return inLawParentTerm(me, "mother");
    if (sp.fatherId === personId) return inLawParentTerm(me, "father");
  }

  for (const sid of mySpouses) {
    if (!shareParents(state, sid, personId)) continue;
    const spouse = state.persons[sid];
    const elder = isElder(person, spouse);
    if (gMe === "male") {
      if (gP === "male") {
        if (elder === true) return "${u.neixiong}";
        if (elder === false) return "${u.neidi}";
        return "${u.qixiongdi}";
      }
      if (elder === true) return "${u.yijie}";
      if (elder === false) return "${u.yimei}";
      return "${u.qijiemei}";
    }
    if (gP === "male") {
      if (elder === true) return "${u.dabozi}";
      if (elder === false) return "${u.xiaoshuzi}";
      return "${u.fuxiongdi}";
    }
    if (elder === true) return "${u.daguzi}";
    if (elder === false) return "${u.xiaoguzi}";
    return "${u.fujiemei}";
  }

  const hisP = state.parents[personId];
  if (myP && hisP && shareParents(state, meId, personId)) {
    const elder = isElder(person, me);
    if (gP === "male") return elder === true ? "${u.gege}" : elder === false ? "${u.didi}" : "${u.xiongdi}";
    if (gP === "female") return elder === true ? "${u.jiejie}" : elder === false ? "${u.meimei}" : "${u.jiemei}";
    return "${u.tongbao}";
  }

  for (const sibId of Object.keys(state.persons)) {
    if (sibId === meId || sibId === personId) continue;
    if (!isSpouse(state, sibId, personId)) continue;
    if (!myP || !shareParents(state, meId, sibId)) continue;
    const sib = state.persons[sibId];
    const sibMale = genderOf(sib) === "male";
    const elder = isElder(sib, me);
    if (sibMale && gP === "female") {
      return elder === true ? "${u.saozi}" : elder === false ? "${u.dixi}" : "${u.xiongdipeiou}";
    }
    if (!sibMale && gP === "male") {
      return elder === true ? "${u.jiefu}" : elder === false ? "${u.meifu}" : "${u.jiemeipeiou}";
    }
  }

  const parentsOfMe = [myP?.fatherId, myP?.motherId].filter(Boolean) as string[];
  for (const parentId of parentsOfMe) {
    if (!shareParents(state, parentId, personId)) continue;
    const viaFather = parentId === myP?.fatherId;
    if (viaFather) {
      if (gP === "male") {
        const elder = isElder(person, state.persons[parentId]);
        return elder === true ? "${u.bofu}" : elder === false ? "${u.shufu}" : "${u.shubo}";
      }
      return "${u.gumu}";
    }
    return gP === "male" ? "${u.jiufu}" : "${u.yimu}";
  }

  for (const [cid, entry] of Object.entries(state.parents)) {
    const pids = [entry.fatherId, entry.motherId].filter(Boolean) as string[];
    if (!pids.includes(personId)) continue;
    if (!myP || !shareParents(state, meId, cid)) continue;
    const childG = genderOf(state.persons[cid]);
    if (gMe === "male") return childG === "female" ? "${u.zhinu}" : "${u.zhizi}";
    return childG === "female" ? "${u.waishengnu}" : "${u.waisheng}";
  }

  if (hisP) {
    const hisParents = [hisP.fatherId, hisP.motherId].filter(Boolean) as string[];
    for (const mid of parentsOfMe) {
      for (const pid of hisParents) {
        if (!pid || !shareParents(state, mid, pid)) continue;
        const fatherSide = mid === myP?.fatherId || pid === myP?.fatherId;
        const prefix = fatherSide ? "${u.tang}" : "${u.biao}";
        if (gP === "male") return prefix + "${u.xiongdi}";
        if (gP === "female") return prefix + "${u.jiemei}";
        return prefix + "${u.qin}";
      }
    }
  }

  for (const kidId of myKids) {
    const kp = state.parents[personId];
    if (!kp) continue;
    if (kp.fatherId === kidId || kp.motherId === kidId) {
      const kid = state.persons[kidId];
      const kidMale = genderOf(kid) === "male";
      if (kidMale) return gP === "female" ? "${u.sunnv}" : "${u.sunzi}";
      return gP === "female" ? "${u.waisunnv}" : "${u.waisun}";
    }
  }

  for (const kidId of myKids) {
    for (const kSp of spouseIdsOf(state, kidId)) {
      const kp = state.parents[kSp];
      if (!kp) continue;
      if (kp.fatherId === personId || kp.motherId === personId) {
        return gP === "male" ? "${u.qinjiagong}" : "${u.qinjiamu}";
      }
    }
  }

  const d = computeDistances(state).get(personId);
  if (d === null || d === undefined) return "${u.qinshu}";
  if (d === -1) return "${u.fuqin.replace("?","?")}" && "${u.muqin}";
  if (d === 0) return "${u.tongbei}";
  if (d === 1) return "${u.zinv}";
  if (d < 0) return String(Math.abs(d)) + " ${u.shizu}";
  return String(d) + " ${u.shisun}";
}

export function buildKinshipMap(
  state: FamilyState,
  meId: string | null
): Map<string, string> {
  const map = new Map<string, string>();
  if (!meId || !state.persons[meId]) return map;
  for (const id of Object.keys(state.persons)) {
    map.set(id, kinshipTerm(state, id, meId));
  }
  return map;
}
`;
// fix the accidental bad line for d===-1
const fixed = ts.replace(
  'if (d === -1) return "${u.fuqin.replace("?","?")}" && "${u.muqin}";',
  'if (d === -1) return "${u.muqin}";'
);
// The replace above won't work on already-expanded template. Patch the fallback directly:
const out = ts
  .split("\n")
  .map((line) => {
    if (line.includes("if (d === -1)")) {
      return '  if (d === -1) return "' + u.muqin + '";';
    }
    return line;
  })
  .join("\n");
fs.writeFileSync("D:/XiaomiMiMoProjects/laotagong/lib/kinship.ts", out, "utf8");
console.log("wrote", out.length);
console.log("sample", out.includes("\\u4e08\\u6bcd\\u5a18"), out.match(/ancestorTerm[\\s\\S]{0,80}/)?.[0]);
