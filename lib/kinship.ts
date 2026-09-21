import { type FamilyState, type Person } from "./family";
import { computeDistances, isBloodDescendant, pedigreePath } from "./lineage";

/**
 * 亲属称谓 —— 浙江省三门县主流用法。
 *
 * 词表来自用户整理（爸爸妈妈 / 爷爷奶奶 / 外公外婆 / 伯伯伯母 / 叔叔婶婶 /
 * 姑姑姑丈 / 舅舅舅妈 / 阿姨姨丈 / 太公太婆 / 舅公舅婆 / 姑婆 / 公公婆婆），
 * 祖辈旁系参照吴语台州片惯例（吴语维基「祖父母」词条、wu-chinese.com）：
 * 祖辈的兄弟 = 舅公/伯公/叔公，祖辈的姐妹 = 姑婆/姨婆，太公太婆 = 曾祖辈。
 *
 * 原则：
 * - 「外」只跟母系（路径起始 M 算一个，中间嫁入女性的 M 不再叠加）；
 * - 性别未知的长辈默认按男性分支命名（与 linkChildWithParents 的默认一致）；
 * - 同辈排行不明时「称大不称小」。
 */

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

/** 直系尊亲属：爸爸妈妈 → 爷爷奶奶外公外婆 → (外)太公太婆 → (外)老太公太婆 → N世祖 */
export function ancestorTerm(path: string): string {
  const n = path.length;
  if (n === 0) return "我";
  if (n === 1) return path.charAt(0) === "F" ? "爸爸" : "妈妈";
  if (n === 2) {
    if (path === "FF") return "爷爷";
    if (path === "FM") return "奶奶";
    if (path === "MF") return "外公";
    return "外婆";
  }
  let outer = 0;
  let inner = 0;
  if (path.charAt(0) === "M") outer += 1;
  for (let i = 1; i <= n - 2; i += 1) {
    if (path.charAt(i) === "M") inner += 1;
  }
  const prefix = "外".repeat(outer + inner);
  const core = path.charAt(n - 1) === "F" ? "太公" : "太婆";
  if (n === 3) return prefix + core;
  if (n === 4) return prefix + "老" + core;
  return prefix + String(n - 2) + "世祖";
}

function inLawParentTerm(me: Person, role: "father" | "mother"): string {
  const meMale = genderOf(me) === "male";
  if (role === "mother") return meMale ? "岳母" : "婆婆";
  return meMale ? "岳父" : "公公";
}

/** 祖辈旁系长者的配偶：伯公→伯婆、姑婆→姑丈公、舅公→舅婆…… */
const GRAND_LATERAL_SPOUSE: Record<string, string> = {
  伯公: "伯婆",
  叔公: "叔婆",
  姑婆: "姑丈公",
  舅公: "舅婆",
  姨婆: "姨丈公",
  外伯公: "外伯婆",
  外叔公: "外叔婆",
  外姑婆: "外姑丈公",
  外舅公: "外舅婆",
  外姨婆: "外姨丈公",
};

/** 全图逐人算称谓时的共享上下文：距离表与血亲闭包各只算一次 */
export interface KinshipContext {
  distances?: Map<string, number | null>;
  /** 与「我」经纯血亲边（parents 双向）连通的人，不含姻亲 */
  blood?: Set<string>;
}

/** 血亲闭包：从 meId 沿 parents 边双向 BFS，不经过配偶边 */
function bloodClosure(state: FamilyState, meId: string): Set<string> {
  const blood = new Set<string>([meId]);
  const queue = [meId];
  while (queue.length > 0) {
    const cur = queue.shift() as string;
    const up = state.parents[cur];
    for (const pid of [up?.fatherId, up?.motherId]) {
      if (pid && state.persons[pid] && !blood.has(pid)) {
        blood.add(pid);
        queue.push(pid);
      }
    }
    for (const [cid, entry] of Object.entries(state.parents)) {
      if (
        (entry.fatherId === cur || entry.motherId === cur) &&
        state.persons[cid] &&
        !blood.has(cid)
      ) {
        blood.add(cid);
        queue.push(cid);
      }
    }
  }
  return blood;
}

export function kinshipTerm(
  state: FamilyState,
  personId: string,
  meId: string | null,
  context?: KinshipContext
): string {
  if (!meId || !state.persons[meId] || !state.persons[personId]) return "亲属";
  if (personId === meId) return "我";
  const me = state.persons[meId];
  const person = state.persons[personId];
  const path = pedigreePath(state, personId, meId);
  if (path && path.length > 0 && /^[FM]+$/.test(path)) {
    return ancestorTerm(path);
  }
  return kinshipInner(state, personId, meId, me, person, context);
}

function kinshipInner(
  state: FamilyState,
  personId: string,
  meId: string,
  me: Person,
  person: Person,
  context?: KinshipContext
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
    const elder = isElder(person, state.persons[sid]);
    if (gMe === "male") {
      if (gP === "male") {
        if (elder === true) return "大舅子";
        if (elder === false) return "小舅子";
        return "妻兄弟";
      }
      if (elder === true) return "大姨子";
      if (elder === false) return "小姨子";
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

  // ── 配偶的兄弟姐妹的子女：内侄/内侄女（配偶兄弟之子）、
  // 妻甥/妻甥女（我的配偶的姐妹之子，女性用「我」时为夫甥/夫甥女）──
  // 三跳姻亲，距离兜底曾把 d=1 的他们标成「子女」——必须显式成词。
  for (const sid of mySpouses) {
    const theirP = state.parents[personId];
    if (!theirP) continue;
    const hisParents = [theirP.fatherId, theirP.motherId].filter(Boolean) as string[];
    for (const pid of hisParents) {
      if (pid === sid || !shareParents(state, sid, pid)) continue;
      const parent = state.persons[pid];
      if (parent && genderOf(parent) === "male") {
        return gP === "female" ? "内侄女" : "内侄";
      }
      if (gMe === "male") return gP === "female" ? "妻甥女" : "妻甥";
      return gP === "female" ? "夫甥女" : "夫甥";
    }
  }

  // ── 配偶与他人（或未登记「我」）的子女：继子 / 继女 ──
  const theirOwnP = state.parents[personId];
  if (theirOwnP) {
    const hisOwnParents = [theirOwnP.fatherId, theirOwnP.motherId].filter(
      Boolean
    ) as string[];
    for (const sid of mySpouses) {
      if (hisOwnParents.includes(sid)) {
        return gP === "female" ? "继女" : "继子";
      }
    }
  }

  // ── 配偶的兄弟姐妹的配偶：连襟（妻的姐妹的丈夫）/ 妯娌（夫的兄弟的妻子）──
  // 三跳姻亲，距离兜底只会给出「同辈」，必须显式成词。
  // 性别未知默认按男性分支（与本文件开头约定一致）。
  for (const sid of mySpouses) {
    for (const otherId of Object.keys(state.persons)) {
      if (otherId === meId || otherId === sid || otherId === personId) continue;
      if (!shareParents(state, sid, otherId)) continue;
      if (!isSpouse(state, otherId, personId)) continue;
      return gMe === "female" ? "妯娌" : "连襟";
    }
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

  // ── 父母的兄弟姐妹：伯伯 / 叔叔 / 姑姑 / 舅舅 / 阿姨 ──
  const parentsOfMe = [myP?.fatherId, myP?.motherId].filter(Boolean) as string[];
  for (const parentId of parentsOfMe) {
    if (!shareParents(state, parentId, personId)) continue;
    const viaFather = parentId === myP?.fatherId;
    if (viaFather) {
      if (gP === "male") {
        const elder = isElder(person, state.persons[parentId]);
        return elder === true ? "伯伯" : elder === false ? "叔叔" : "叔伯";
      }
      return "姑姑";
    }
    return gP === "male" ? "舅舅" : "阿姨";
  }

  // ── 父母兄弟姐妹的配偶：伯母 / 婶婶 / 姑丈 / 舅妈 / 姨丈 ──
  if (myP) {
    for (const sid of Object.keys(state.persons)) {
      if (sid === meId || sid === personId) continue;
      const viaFather =
        myP.fatherId && sid !== myP.fatherId && shareParents(state, sid, myP.fatherId);
      const viaMother =
        !viaFather &&
        myP.motherId !== undefined &&
        sid !== myP.motherId &&
        shareParents(state, sid, myP.motherId);
      if (!viaFather && !viaMother) continue;
      if (!isSpouse(state, sid, personId)) continue;
      const sib = state.persons[sid];
      const sibMale = genderOf(sib) === "male";
      if (viaFather) {
        if (sibMale) {
          const elder = isElder(sib, state.persons[myP.fatherId!]);
          return elder === false ? "婶婶" : "伯母";
        }
        return "姑丈";
      }
      return sibMale ? "舅妈" : "姨丈";
    }
  }

  // ── 祖辈旁系：伯公 / 叔公 / 姑婆 / 舅公 / 姨婆（含外姓外前缀）及其配偶 ──
  if (myP) {
    const gps: Array<{ gid: string; maternal: boolean; g: Person["gender"] }> = [];
    const fatherP = myP.fatherId ? state.parents[myP.fatherId] : undefined;
    if (fatherP?.fatherId) {
      gps.push({
        gid: fatherP.fatherId,
        maternal: false,
        g: genderOf(state.persons[fatherP.fatherId]),
      });
    }
    if (fatherP?.motherId) {
      gps.push({
        gid: fatherP.motherId,
        maternal: false,
        g: genderOf(state.persons[fatherP.motherId]),
      });
    }
    const motherP = myP.motherId ? state.parents[myP.motherId] : undefined;
    if (motherP?.fatherId) {
      gps.push({
        gid: motherP.fatherId,
        maternal: true,
        g: genderOf(state.persons[motherP.fatherId]),
      });
    }
    if (motherP?.motherId) {
      gps.push({
        gid: motherP.motherId,
        maternal: true,
        g: genderOf(state.persons[motherP.motherId]),
      });
    }
    const grandLateral = new Map<string, string>();
    for (const sid of Object.keys(state.persons)) {
      if (sid === meId) continue;
      for (const { gid, maternal, g } of gps) {
        if (sid === gid || !shareParents(state, gid, sid)) continue;
        const wai = maternal ? "外" : "";
        const gS = genderOf(state.persons[sid]);
        const elder = isElder(state.persons[sid], state.persons[gid]);
        let term: string;
        if (g === "female") {
          // 奶奶/外婆的兄弟 = 舅公，姐妹 = 姨婆；性别未知默认男分支
          term = gS === "female" ? wai + "姨婆" : wai + "舅公";
        } else if (gS === "female") {
          // 爷爷/外公的姐妹 = 姑婆
          term = wai + "姑婆";
        } else {
          // 爷爷/外公的兄弟：称大不称小
          term = elder === false ? wai + "叔公" : wai + "伯公";
        }
        grandLateral.set(sid, term);
        break;
      }
    }
    if (grandLateral.has(personId)) {
      return grandLateral.get(personId)!;
    }
    for (const [xId, xTerm] of grandLateral) {
      if (isSpouse(state, xId, personId)) {
        const spouseTerm = GRAND_LATERAL_SPOUSE[xTerm];
        if (spouseTerm) return spouseTerm;
      }
    }
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

  // ── 兜底：混合 BFS 的 d 把「血亲连通」与「经配偶边连通」混在一起，
  // 必须先分桶：血亲后代给世代称呼；其余血亲是远亲；非血亲是姻亲。
  // 否则妻方旁系的子女（d=1）会被叫成「子女」。
  const d = (context?.distances ?? computeDistances(state)).get(personId);
  if (d === null || d === undefined) return "亲属";
  const blood = context?.blood ?? bloodClosure(state, meId);
  if (isBloodDescendant(state, personId, meId)) {
    if (d === 1) return "子女";
    return d > 0 ? `${d} 世孙` : "晚辈";
  }
  if (blood.has(personId)) {
    if (d <= -1) return "远亲长辈";
    if (d === 0) return "远亲";
    return "远亲晚辈";
  }
  if (d <= -2) return "姻亲长辈";
  if (d === -1) return "长辈";
  if (d === 0) return "姻亲同辈";
  return "姻亲晚辈";
}

export function buildKinshipMap(
  state: FamilyState,
  meId: string | null
): Map<string, string> {
  const map = new Map<string, string>();
  if (!meId || !state.persons[meId]) return map;
  // 距离表与血亲闭包全图各只算一次：
  // 兜底分支曾每人重跑一遍全图 BFS，最坏 O(V³)，±10 代时不可接受
  const context: KinshipContext = {
    distances: computeDistances(state),
    blood: bloodClosure(state, meId),
  };
  for (const id of Object.keys(state.persons)) {
    map.set(id, kinshipTerm(state, id, meId, context));
  }
  return map;
}
