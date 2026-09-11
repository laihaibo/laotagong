export type Gender = "male" | "female" | "unknown";

export type RelationKind = "father" | "mother" | "spouse" | "child";

export const EVENT_TYPES = [
  "marriage",
  "migration",
  "birth",
  "death",
  "education",
  "custom",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export interface FamilyEvent {
  id: string;
  type: EventType;
  /** 容忍非规范写法："约1950"、"?"、"1949-" */
  date: string;
  place?: string;
  note?: string;
}

export interface Person {
  id: string;
  name: string;
  gender: Gender;
  birthYear?: string;
  deathYear?: string;
  ancestralHome?: string;
  household?: string;
  note?: string;
  /** 外置图片链接；不用 base64，避免撞 localStorage 配额 */
  photoUrl?: string;
  events?: FamilyEvent[];
  createdAt: number;
  updatedAt: number;
}

export interface FamilyState {
  version: 1;
  persons: Record<string, Person>;
  /** childId -> { fatherId?, motherId? } */
  parents: Record<string, { fatherId?: string; motherId?: string }>;
  /** unordered pairs */
  spouses: Array<{ a: string; b: string }>;
  meId: string | null;
}

export const STORAGE_KEY = "laotagong:family:v1";

export function createEmptyState(): FamilyState {
  return {
    version: 1,
    persons: {},
    parents: {},
    spouses: [],
    meId: null,
  };
}

/**
 * Person 的**唯一**字段清单。
 *
 * createPerson 与 sanitizeState 都必须经过它——分成两份清单是 P-1 的根因：
 * 写路径认识新字段、读路径不认识，于是 saveState 写进去、loadState 又丢掉，
 * 而构建与测试全绿，没有任何信号。
 */
export function normalizeEvent(raw: unknown): FamilyEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  const type: EventType = EVENT_TYPES.includes(e.type as EventType)
    ? (e.type as EventType)
    : "custom";
  return {
    id: typeof e.id === "string" && e.id ? e.id : crypto.randomUUID(),
    type,
    date: typeof e.date === "string" ? e.date : "",
    place: typeof e.place === "string" ? e.place : "",
    note: typeof e.note === "string" ? e.note : "",
  };
}

export function normalizePerson(id: string, raw: unknown): Person {
  const p = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const now = Date.now();
  return {
    id,
    name: typeof p.name === "string" ? p.name : "未命名",
    gender:
      p.gender === "male" || p.gender === "female" || p.gender === "unknown"
        ? p.gender
        : "unknown",
    birthYear: typeof p.birthYear === "string" ? p.birthYear : "",
    deathYear: typeof p.deathYear === "string" ? p.deathYear : "",
    ancestralHome: typeof p.ancestralHome === "string" ? p.ancestralHome : "",
    household: typeof p.household === "string" ? p.household : "",
    note: typeof p.note === "string" ? p.note : "",
    photoUrl: typeof p.photoUrl === "string" ? p.photoUrl : "",
    events: Array.isArray(p.events)
      ? p.events
          .map(normalizeEvent)
          .filter((e): e is FamilyEvent => e !== null)
      : [],
    createdAt: typeof p.createdAt === "number" ? p.createdAt : now,
    updatedAt: typeof p.updatedAt === "number" ? p.updatedAt : now,
  };
}

export function createPerson(partial: Partial<Person> = {}): Person {
  const now = Date.now();
  const base = normalizePerson(partial.id ?? crypto.randomUUID(), partial);
  return { ...base, createdAt: partial.createdAt ?? now, updatedAt: now };
}

export function getFatherId(state: FamilyState, personId: string): string | null {
  return state.parents[personId]?.fatherId ?? null;
}

export function getMotherId(state: FamilyState, personId: string): string | null {
  return state.parents[personId]?.motherId ?? null;
}

export function getChildrenIds(state: FamilyState, personId: string): string[] {
  const result: string[] = [];
  for (const [childId, p] of Object.entries(state.parents)) {
    if (p.fatherId === personId || p.motherId === personId) {
      result.push(childId);
    }
  }
  return result;
}

export function getSpouseIds(state: FamilyState, personId: string): string[] {
  return state.spouses
    .filter((s) => s.a === personId || s.b === personId)
    .map((s) => (s.a === personId ? s.b : s.a));
}

/** 兄弟姐妹：与本人共享至少一位父母的其他人 */
export function getSiblingIds(state: FamilyState, personId: string): string[] {
  const parents = state.parents[personId];
  if (!parents?.fatherId && !parents?.motherId) return [];
  const result: string[] = [];
  for (const [childId, p] of Object.entries(state.parents)) {
    if (childId === personId) continue;
    const shareFather =
      parents.fatherId && p.fatherId === parents.fatherId;
    const shareMother =
      parents.motherId && p.motherId === parents.motherId;
    if (shareFather || shareMother) result.push(childId);
  }
  return result;
}

export function areSpouses(state: FamilyState, a: string, b: string): boolean {
  return state.spouses.some(
    (s) => (s.a === a && s.b === b) || (s.a === b && s.b === a)
  );
}

export function addParentLink(
  state: FamilyState,
  childId: string,
  parentId: string,
  role: "father" | "mother"
): FamilyState {
  const parents = {
    ...state.parents,
    [childId]: {
      ...state.parents[childId],
      [role === "father" ? "fatherId" : "motherId"]: parentId,
    },
  };
  return { ...state, parents };
}

/** 某条父母记录中「唯一空着的槽位」；两槽皆满或皆空时返回 null */
function freeRoleOf(entry: {
  fatherId?: string;
  motherId?: string;
}): "father" | "mother" | null {
  const hasFather = !!entry.fatherId;
  const hasMother = !!entry.motherId;
  if (hasFather === hasMother) return null;
  return hasFather ? "mother" : "father";
}

/** 由性别推导其在父母对中的角色；未知返回 null（不猜） */
function roleOfGender(g: Gender | undefined): "father" | "mother" | null {
  if (g === "male") return "father";
  if (g === "female") return "mother";
  return null;
}

/**
 * 为 parentIds 各自已有的子女回填缺失的另一端双亲。
 *
 * 只在「该子女已绑定的那位家长恰好只有 1 位配偶」时回填——唯一候选才算证据，
 * 0 位或 ≥2 位都是猜测，一律不写。
 *
 * ⚠️ 必须在配偶关系**写入之后**调用（post-add）。若在写入前求值，配偶数恒为 0，
 * 谓词永不成立，AC-17 会原样复发。
 */
function backfillChildrenOf(state: FamilyState, parentIds: string[]): FamilyState {
  let next = state;
  for (const parentId of parentIds) {
    for (const childId of getChildrenIds(next, parentId)) {
      const entry = next.parents[childId];
      if (!entry) continue;
      const free = freeRoleOf(entry);
      if (!free) continue;
      const existingParentId =
        free === "father" ? entry.motherId : entry.fatherId;
      if (!existingParentId) continue;
      const spouseIds = getSpouseIds(next, existingParentId);
      if (spouseIds.length !== 1) continue;
      const spouseId = spouseIds[0];
      const spouseRole = roleOfGender(next.persons[spouseId]?.gender);
      if (spouseRole && spouseRole !== free) continue;
      next = addParentLink(next, childId, spouseId, free);
    }
  }
  return next;
}

/**
 * 为子女挂上双亲：本人按性别挂一边，若本人恰好有一位配偶则自动挂另一边。
 */
export function linkChildWithParents(
  state: FamilyState,
  childId: string,
  parentId: string
): FamilyState {
  const parent = state.persons[parentId];
  if (!parent) return state;

  const entry = state.parents[childId] ?? {};
  const genderRole = roleOfGender(parent.gender);
  let primaryRole: "father" | "mother";
  if (genderRole) {
    primaryRole = genderRole;
  } else {
    // 性别未知：绑到空槽；两槽皆空时默认父亲。绝不覆盖已存在的真实家长。
    if (entry.fatherId && entry.motherId) return state;
    primaryRole = entry.fatherId ? "mother" : "father";
  }

  let next = addParentLink(state, childId, parentId, primaryRole);

  // 仅当本人恰有一位配偶时才自动补另一端——唯一候选才算证据。
  // 0 位：无从补起；≥2 位：不猜，留给多配偶 picker（AC-20）。
  const spouseIds = getSpouseIds(state, parentId);
  if (spouseIds.length === 1) {
    const spouseId = spouseIds[0];
    const spouse = next.persons[spouseId];
    if (spouse) {
      const otherRole: "father" | "mother" =
        primaryRole === "father" ? "mother" : "father";
      const existing = next.parents[childId];
      const already =
        otherRole === "father" ? existing?.fatherId : existing?.motherId;
      if (!already) {
        next = addParentLink(next, childId, spouseId, otherRole);
      }
    }
  }

  return next;
}

export function addSpouseLink(state: FamilyState, a: string, b: string): FamilyState {
  if (a === b || areSpouses(state, a, b)) return state;
  const linked: FamilyState = {
    ...state,
    spouses: [...state.spouses, { a, b }],
  };
  // 新配偶关系建立后，回填双方已有子女缺失的另一端双亲。
  // 求值必须在 post-add 状态上（见 backfillChildrenOf 的说明）。
  return backfillChildrenOf(linked, [a, b]);
}

export function removeSpouseLink(state: FamilyState, a: string, b: string): FamilyState {
  return {
    ...state,
    spouses: state.spouses.filter(
      (s) => !((s.a === a && s.b === b) || (s.a === b && s.b === a))
    ),
  };
}

export function removePersonDeep(state: FamilyState, personId: string): FamilyState {
  const persons = { ...state.persons };
  delete persons[personId];

  const parents: FamilyState["parents"] = {};
  for (const [childId, p] of Object.entries(state.parents)) {
    if (childId === personId) continue;
    const next = { ...p };
    if (next.fatherId === personId) delete next.fatherId;
    if (next.motherId === personId) delete next.motherId;
    if (next.fatherId || next.motherId) parents[childId] = next;
  }

  const spouses = state.spouses.filter((s) => s.a !== personId && s.b !== personId);
  const meId = state.meId === personId ? null : state.meId;

  return { ...state, persons, parents, spouses, meId };
}

export function sanitizeState(raw: unknown): FamilyState {
  const empty = createEmptyState();
  if (!raw || typeof raw !== "object") return empty;
  const obj = raw as Partial<FamilyState> & Record<string, unknown>;

  const persons: Record<string, Person> = {};
  if (obj.persons && typeof obj.persons === "object") {
    for (const [id, p] of Object.entries(obj.persons as Record<string, unknown>)) {
      if (!p || typeof p !== "object") continue;
      // 与 createPerson 共用同一份字段清单（P3）——两处分开维护就是 P-1 的根因
      persons[id] = normalizePerson(id, p);
    }
  }

  const parents: FamilyState["parents"] = {};
  if (obj.parents && typeof obj.parents === "object") {
    for (const [childId, p] of Object.entries(
      obj.parents as Record<string, { fatherId?: string; motherId?: string }>
    )) {
      if (!persons[childId]) continue;
      const entry: { fatherId?: string; motherId?: string } = {};
      if (p?.fatherId && persons[p.fatherId]) entry.fatherId = p.fatherId;
      if (p?.motherId && persons[p.motherId]) entry.motherId = p.motherId;
      if (entry.fatherId || entry.motherId) parents[childId] = entry;
    }
  }

  const spouses: FamilyState["spouses"] = [];
  if (Array.isArray(obj.spouses)) {
    for (const s of obj.spouses) {
      if (!s || typeof s !== "object") continue;
      const a = (s as { a?: string }).a;
      const b = (s as { b?: string }).b;
      if (a && b && persons[a] && persons[b] && a !== b) {
        const dup = spouses.some(
          (x) => (x.a === a && x.b === b) || (x.a === b && x.b === a)
        );
        if (!dup) spouses.push({ a, b });
      }
    }
  }

  const meId =
    typeof obj.meId === "string" && persons[obj.meId] ? obj.meId : null;

  return { version: 1, persons, parents, spouses, meId };
}

export function exportState(state: FamilyState): string {
  return JSON.stringify(state, null, 2);
}

export function importState(json: string): FamilyState {
  const raw = JSON.parse(json);
  return sanitizeState(raw);
}

export function loadState(): FamilyState {
  if (typeof window === "undefined") return createEmptyState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createEmptyState();
    return importState(raw);
  } catch {
    return createEmptyState();
  }
}

export function saveState(state: FamilyState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, exportState(state));
}

export function genderLabel(g: Gender): string {
  if (g === "male") return "男";
  if (g === "female") return "女";
  return "未知";
}

// ─────────────────────────────────────────────────────────────
// 关系修复检测（只报告，不自动改写历史数据）
// ─────────────────────────────────────────────────────────────

export interface RepairableLink {
  childId: string;
  spouseId: string;
  role: "father" | "mother";
}

export interface AmbiguousLink {
  childId: string;
  candidates: string[];
  role: "father" | "mother";
}

/**
 * 该子女是否可以**无歧义地**补全缺失的那一端双亲。
 *
 * 判定依据：已绑定的那位家长恰好只有 1 位配偶。0 位无从补起，≥2 位是猜测。
 * 调用方须传入 **post-add** 状态（配偶关系写入之后）。
 */
export function isUnambiguousBackfill(
  state: FamilyState,
  childId: string
): boolean {
  const entry = state.parents[childId];
  if (!entry) return false;
  const free = freeRoleOf(entry);
  if (!free) return false;
  const existingParentId =
    free === "father" ? entry.motherId : entry.fatherId;
  if (!existingParentId) return false;
  return getSpouseIds(state, existingParentId).length === 1;
}

/**
 * 扫描全库，找出历史上留下的「单亲子女」。
 *
 * 返回两个桶，二者都必须被渲染——只渲染 repairable 会让 ambiguous 永久不可达，
 * 等于把「模糊即询问」降级成「模糊只提示一次」。
 * 本函数**不修改**任何数据。
 */
export function findRepairableLinks(state: FamilyState): {
  repairable: RepairableLink[];
  ambiguous: AmbiguousLink[];
} {
  const repairable: RepairableLink[] = [];
  const ambiguous: AmbiguousLink[] = [];

  for (const [childId, entry] of Object.entries(state.parents)) {
    const free = freeRoleOf(entry);
    if (!free) continue;
    const existingParentId =
      free === "father" ? entry.motherId : entry.fatherId;
    if (!existingParentId) continue;

    const spouseIds = getSpouseIds(state, existingParentId);
    if (spouseIds.length === 1) {
      const spouseRole = roleOfGender(state.persons[spouseIds[0]]?.gender);
      if (!spouseRole || spouseRole === free) {
        repairable.push({ childId, spouseId: spouseIds[0], role: free });
      }
    } else if (spouseIds.length > 1) {
      ambiguous.push({ childId, candidates: spouseIds, role: free });
    }
  }

  return { repairable, ambiguous };
}

/** 应用修复。幂等：已填的槽位不会被覆盖。可恢复（重新导入修复前的 JSON），但不可撤销。 */
export function applyRepairs(
  state: FamilyState,
  links: RepairableLink[]
): FamilyState {
  let next = state;
  for (const link of links) {
    const entry = next.parents[link.childId];
    const key = link.role === "father" ? "fatherId" : "motherId";
    if (entry?.[key]) continue;
    next = addParentLink(next, link.childId, link.spouseId, link.role);
  }
  return next;
}

// ─────────────────────────────────────────────────────────────
// 关系距离（世代不落库，运行时推导）
// ─────────────────────────────────────────────────────────────

/**
 * 以「我」为原点，按跳数 BFS 推导每个人的关系距离。
 * 父/母 −1 · 配偶 0 · 子女 +1 · 与「我」不连通者为 null。
 *
 * 世代**不进 FamilyState**，此函数是唯一来源。
 */
export function getRelationDistances(
  state: FamilyState
): Map<string, number | null> {
  const distances = new Map<string, number | null>();
  for (const id of Object.keys(state.persons)) distances.set(id, null);

  const meId = state.meId;
  if (!meId || !state.persons[meId]) return distances;

  const neighboursOf = (id: string): Array<[string, number]> => {
    const out: Array<[string, number]> = [];
    const p = state.parents[id];
    if (p?.fatherId) out.push([p.fatherId, -1]);
    if (p?.motherId) out.push([p.motherId, -1]);
    for (const childId of getChildrenIds(state, id)) out.push([childId, 1]);
    for (const spouseId of getSpouseIds(state, id)) out.push([spouseId, 0]);
    // 按 id 排序，保证遍历与结果确定（否则同输入不同插入序会产生不同分组）
    return out.sort((x, y) => x[0].localeCompare(y[0]));
  };

  distances.set(meId, 0);
  const queue: string[] = [meId];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    const base = distances.get(current);
    if (base === null || base === undefined) continue;
    for (const [neighbourId, weight] of neighboursOf(current)) {
      if (distances.get(neighbourId) !== null) continue;
      distances.set(neighbourId, base + weight);
      queue.push(neighbourId);
    }
  }

  return distances;
}

export interface DistanceGroup {
  key: string;
  label: string;
  ids: string[];
}

const DISTANCE_BUCKETS: Array<{ key: string; label: string; test: (d: number) => boolean }> = [
  { key: "ancestor", label: "祖辈及以上", test: (d) => d <= -2 },
  { key: "parent", label: "父辈", test: (d) => d === -1 },
  { key: "peer", label: "同辈", test: (d) => d === 0 },
  { key: "child", label: "子辈", test: (d) => d === 1 },
  { key: "descendant", label: "孙辈及以下", test: (d) => d >= 2 },
];

/**
 * 按关系距离分组，供查找面板使用。
 *
 * 注意 `同辈` 一桶同时包含配偶与兄弟姐妹——配偶边权重为 0，二者距离都是 0。
 * 「我」也在这一桶里，由 UI 单独标记，不另开分组。
 */
export function groupByRelationDistance(state: FamilyState): DistanceGroup[] {
  const distances = getRelationDistances(state);
  const groups: DistanceGroup[] = DISTANCE_BUCKETS.map((b) => ({
    key: b.key,
    label: b.label,
    ids: [],
  }));
  const unconnected: DistanceGroup = {
    key: "unconnected",
    label: "未连接",
    ids: [],
  };

  for (const [id, d] of distances) {
    if (d === null) {
      unconnected.ids.push(id);
      continue;
    }
    const bucket = DISTANCE_BUCKETS.find((b) => b.test(d));
    if (bucket) groups.find((g) => g.key === bucket.key)?.ids.push(id);
  }

  return [...groups.filter((g) => g.ids.length > 0), unconnected];
}

