# -*- coding: utf-8 -*-
from pathlib import Path
Path(r"D:\XiaomiMiMoProjects\laotagong\lib\kinship.ts").write_text(r'''import { type FamilyState, type Person } from "./family";
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
  if (n === 0) return "我";
  if (n === 1) return path.charAt(0) === "F" ? "父亲" : "母亲";
  const core = path.charAt(n - 1) === "F" ? "祖父" : "祖母";
  const gen = n === 2 ? "" : n === 3 ? "曾" : n === 4 ? "高" : String(n - 2) + "世";
  let outer = 0;
  let inner = 0;
  if (path.charAt(0) === "M") outer += 1;
  for (let i = 1; i <= n - 2; i += 1) {
    if (path.charAt(i) === "M") inner += 1;
  }
  return (outer ? "外" : "") + gen + (inner ? "外" : "") + core;
}

function inLawParentTerm(me: Person, role: "father" | "mother"): string {
  const meMale = genderOf(me) === "male";
  if (role === "mother") return meMale ? "丈母娘" : "婆婆";
  return meMale ? "岳父" : "公公";
}

export function kinshipTerm(
  state: FamilyState,
  personId: string,
  meId: string | null
): string {
  if (!meId || !state.persons[meId] || !state.persons[personId]) return "亲属";
  if (personId === meId) return "我";
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
    if (gMe === "female" && gP === "male") return "丈夫";
    if (gMe === "male" && gP === "female") return "妻子";
    return "配偶";
  }

  const myKids = childIdsOf(state, meId);
  if (myKids.includes(personId)) {
    if (gP === "male") return "儿子";
    if (gP === "female") return "女儿";
    return "子女";
  }

  for (const kidId of myKids) {
    if (isSpouse(state, kidId, personId)) {
      const kid = state.persons[kidId];
      if (genderOf(kid) === "male" && gP === "female") return "儿媳";
      if (genderOf(kid) === "female" && gP === "male") return "女婿";
      return "子女配偶";
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
        if (elder === true) return "内兄";
        if (elder === false) return "内弟";
        return "妻兄弟";
      }
      if (elder === true) return "姨姐";
      if (elder === false) return "姨妹";
      return "妻姐妹";
    }
    if (gP === "male") {
      if (elder === true) return "大伯子";
      if (elder === false) return "小叔子";
      return "夫兄弟";
    }
    if (elder === true) return "大姑子";
    if (elder === false) return "小姑子";
    return "夫姐妹";
  }

  const hisP = state.parents[personId];
  if (myP && hisP && shareParents(state, meId, personId)) {
    const elder = isElder(person, me);
    if (gP === "male") return elder === true ? "哥哥" : elder === false ? "弟弟" : "兄弟";
    if (gP === "female") return elder === true ? "姐姐" : elder === false ? "妹妹" : "姐妹";
    return "同胞";
  }

  for (const sibId of Object.keys(state.persons)) {
    if (sibId === meId || sibId === personId) continue;
    if (!isSpouse(state, sibId, personId)) continue;
    if (!myP || !shareParents(state, meId, sibId)) continue;
    const sib = state.persons[sibId];
    const sibMale = genderOf(sib) === "male";
    const elder = isElder(sib, me);
    if (sibMale && gP === "female") {
      return elder === true ? "嫂子" : elder === false ? "弟媳" : "兄弟配偶";
    }
    if (!sibMale && gP === "male") {
      return elder === true ? "姐夫" : elder === false ? "妹夫" : "姐妹配偶";
    }
  }

  const parentsOfMe = [myP?.fatherId, myP?.motherId].filter(Boolean) as string[];
  for (const parentId of parentsOfMe) {
    if (!shareParents(state, parentId, personId)) continue;
    const viaFather = parentId === myP?.fatherId;
    if (viaFather) {
      if (gP === "male") {
        const elder = isElder(person, state.persons[parentId]);
        return elder === true ? "伯父" : elder === false ? "叔父" : "叔伯";
      }
      return "姑母";
    }
    return gP === "male" ? "舅父" : "姨母";
  }

  for (const [cid, entry] of Object.entries(state.parents)) {
    const pids = [entry.fatherId, entry.motherId].filter(Boolean) as string[];
    if (!pids.includes(personId)) continue;
    if (!myP || !shareParents(state, meId, cid)) continue;
    const childG = genderOf(state.persons[cid]);
    if (gMe === "male") return childG === "female" ? "侄女" : "侄子";
    return childG === "female" ? "外甥女" : "外甥";
  }

  if (hisP) {
    const hisParents = [hisP.fatherId, hisP.motherId].filter(Boolean) as string[];
    for (const mid of parentsOfMe) {
      for (const pid of hisParents) {
        if (!pid || !shareParents(state, mid, pid)) continue;
        const fatherSide = mid === myP?.fatherId || pid === myP?.fatherId;
        const prefix = fatherSide ? "堂" : "表";
        if (gP === "male") return prefix + "兄弟";
        if (gP === "female") return prefix + "姐妹";
        return prefix + "亲";
      }
    }
  }

  for (const kidId of myKids) {
    const kp = state.parents[personId];
    if (!kp) continue;
    if (kp.fatherId === kidId || kp.motherId === kidId) {
      const kid = state.persons[kidId];
      const kidMale = genderOf(kid) === "male";
      if (kidMale) return gP === "female" ? "孙女" : "孙子";
      return gP === "female" ? "外孙女" : "外孙";
    }
  }

  for (const kidId of myKids) {
    for (const kSp of spouseIdsOf(state, kidId)) {
      const kp = state.parents[kSp];
      if (!kp) continue;
      if (kp.fatherId === personId || kp.motherId === personId) {
        return gP === "male" ? "亲家公" : "亲家母";
      }
    }
  }

  const d = computeDistances(state).get(personId);
  if (d === null || d === undefined) return "亲属";
  if (d === -1) return "父母";
  if (d === 0) return "同辈";
  if (d === 1) return "子女";
  if (d < 0) return String(Math.abs(d)) + " 世祖";
  return String(d) + " 世孙";
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
''', encoding="utf-8")
print("ok", Path(r"D:\XiaomiMiMoProjects\laotagong\lib\kinship.ts").stat().st_size)
