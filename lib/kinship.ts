import { type FamilyState, type Person } from "./family";
import { computeDistances, pedigreePath } from "./lineage";

/**
 * 相对「我」的中文称呼。纯函数，随 meId 变化而变。
 * 覆盖直系/旁系常见称谓；生年缺省时用「兄/弟」弱化版。
 */

function genderOf(p: Person | undefined): Person["gender"] {
  return p?.gender ?? "unknown";
}

function birthOf(p: Person | undefined): string {
  return p?.birthYear ?? "";
}

function isOlderThan(a: Person | undefined, b: Person | undefined): boolean | null {
  const ya = birthOf(a);
  const yb = birthOf(b);
  if (!ya || !yb) return null;
  return ya < yb;
}

/** 祖辈路径 → 称呼，FF=祖父，MF=外祖父… */
export function ancestorTerm(path: string): string {
  const n = path.length;
  if (n === 0) return "我";
  const lastFather = path.charAt(n - 1) === "F";
  const viaFather = path.charAt(0) === "F";
  if (n === 1) return lastFather ? "父亲" : "母亲";
  const mid = n === 2 ? "" : n === 3 ? "曾" : n === 4 ? "高" : `${n - 2}世`;
  const core = lastFather ? "祖父" : "祖母";
  if (viaFather) return mid + core;
  return mid + "外" + core;
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

  // 祖先
  if (path && path.length > 0 && /^[FM]+$/.test(path)) {
    return ancestorTerm(path);
  }

    return kinshipTermInner(state, personId, meId, me, person, path);
}

function isSpouse(state: FamilyState, meId: string, personId: string): boolean {
  return state.spouses.some(
    (s) => (s.a === meId && s.b === personId) || (s.b === meId && s.a === personId)
  );
}

function kinshipTermInner(
  state: FamilyState,
  personId: string,
  meId: string,
  me: Person,
  person: Person,
  path: string | null
): string {
  if (isSpouse(state, meId, personId)) {
    if (genderOf(me) === "female" && genderOf(person) === "male") return "丈夫";
    if (genderOf(me) === "male" && genderOf(person) === "female") return "妻子";
    return "配偶";
  }

  const distances = computeDistances(state);
  const d = distances.get(personId);

  // 子女
  for (const [cid, p] of Object.entries(state.parents)) {
    if (p.fatherId === meId || p.motherId === meId) {
      if (cid === personId) {
        const g = genderOf(person);
        return g === "female" ? "女儿" : g === "male" ? "儿子" : "子女";
      }
    }
  }

  // 兄弟姐妹
  const myP = state.parents[meId];
  const hisP = state.parents[personId];
  if (myP && hisP) {
    const shareF = myP.fatherId && myP.fatherId === hisP.fatherId;
    const shareM = myP.motherId && myP.motherId === hisP.motherId;
    if (shareF || shareM) {
      const elder = isOlderThan(person, me);
      const g = genderOf(person);
      if (g === "male") return elder === false ? "弟弟" : elder === true ? "哥哥" : "兄弟";
      if (g === "female") return elder === false ? "妹妹" : elder === true ? "姐姐" : "姐妹";
      return "同胞";
    }
  }

  // 父母的兄弟姐妹（叔伯姑舅姨）
  const parentsOfMe = [myP?.fatherId, myP?.motherId].filter(Boolean) as string[];
  for (const parentId of parentsOfMe) {
    const pp = state.parents[parentId];
    const tp = state.parents[personId];
    if (!pp || !tp) continue;
    const share =
      (pp.fatherId && pp.fatherId === tp.fatherId) ||
      (pp.motherId && pp.motherId === tp.motherId);
    if (!share) continue;
    const viaFather = parentId === myP?.fatherId;
    const g = genderOf(person);
    if (viaFather) {
      if (g === "male") {
        const elder = isOlderThan(person, state.persons[parentId]);
        return elder === false ? "叔父" : "伯父";
      }
      return "姑母";
    }
    return g === "male" ? "舅父" : "姨母";
  }

  // 侄甥：兄弟姐妹的子女
  for (const [cid, p] of Object.entries(state.parents)) {
    const parentIds = [p.fatherId, p.motherId].filter(Boolean) as string[];
    for (const pid of parentIds) {
      if (pid !== personId) continue;
      // personId 是 cid 的家长；检查 cid 是否我的同胞
      const cp = state.parents[cid];
      if (!myP || !cp) continue;
      const sibling =
        (myP.fatherId && myP.fatherId === cp.fatherId) ||
        (myP.motherId && myP.motherId === cp.motherId);
      if (!sibling) continue;
      const g = genderOf(state.persons[cid]);
      
      // 我是男 → 侄/侄女；我是女 → 外甥/外甥女
      const childG = genderOf(state.persons[cid]);
      const meG = genderOf(me);
      if (meG === "male") return childG === "female" ? "侄女" : "侄子";
      return childG === "female" ? "外甥女" : "外甥";
    }
  }

  // 孙辈：我的子女的子女
  const kids = Object.entries(state.parents)
    .filter(([, p]) => p.fatherId === meId || p.motherId === meId)
    .map(([id]) => id);
  for (const kidId of kids) {
    const kp = state.parents[personId];
    if (!kp) continue;
    if (kp.fatherId === kidId || kp.motherId === kidId) {
      const kid = state.persons[kidId];
      const kidIsMale = genderOf(kid) === "male";
      const g = genderOf(person);
      if (kidIsMale) return g === "female" ? "孙女" : "孙子";
      return g === "female" ? "外孙女" : "外孙";
    }
  }

  // 兜底：按代际
  if (d === null || d === undefined) return "亲属";
  if (d === -1) return "父母";
  if (d === 0) return "同辈";
  if (d === 1) return "子女";
  if (d < 0) return `${Math.abs(d)} 世祖`;
  return `${d} 世孙`;
}

/** 批量：id → 称呼，供画布一次性计算 */
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
