export type Gender = "male" | "female" | "unknown";

export type RelationKind = "father" | "mother" | "spouse" | "child";

export interface Person {
  id: string;
  name: string;
  gender: Gender;
  birthYear?: string;
  deathYear?: string;
  ancestralHome?: string;
  household?: string;
  note?: string;
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

export function createPerson(partial: Partial<Person> = {}): Person {
  const now = Date.now();
  return {
    id: partial.id ?? crypto.randomUUID(),
    name: partial.name ?? "未命名",
    gender: partial.gender ?? "unknown",
    birthYear: partial.birthYear ?? "",
    deathYear: partial.deathYear ?? "",
    ancestralHome: partial.ancestralHome ?? "",
    household: partial.household ?? "",
    note: partial.note ?? "",
    createdAt: partial.createdAt ?? now,
    updatedAt: now,
  };
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

/**
 * 为子女挂上双亲：本人按性别挂一边，若本人有配偶则自动挂另一边。
 */
export function linkChildWithParents(
  state: FamilyState,
  childId: string,
  parentId: string
): FamilyState {
  const parent = state.persons[parentId];
  if (!parent) return state;

  const spouseIds = getSpouseIds(state, parentId);
  const primaryRole: "father" | "mother" =
    parent.gender === "female" ? "mother" : "father";

  let next = addParentLink(state, childId, parentId, primaryRole);

  if (spouseIds.length > 0) {
    const spouseId = spouseIds[0];
    const spouse = next.persons[spouseId];
    if (spouse) {
      const otherRole: "father" | "mother" =
        primaryRole === "father" ? "mother" : "father";
      // 仅当该侧尚未绑定时补全
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
  return { ...state, spouses: [...state.spouses, { a, b }] };
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
    for (const [id, p] of Object.entries(obj.persons as Record<string, Person>)) {
      if (!p || typeof p !== "object") continue;
      persons[id] = {
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
        createdAt: typeof p.createdAt === "number" ? p.createdAt : Date.now(),
        updatedAt: typeof p.updatedAt === "number" ? p.updatedAt : Date.now(),
      };
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
