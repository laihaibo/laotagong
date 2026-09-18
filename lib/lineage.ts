import { type FamilyState, getSpouseIds } from "./family";

export type LineageKind =
  | "ego"
  | "paternal"
  | "maternal"
  | "descendant"
  | "sibling"
  | "affinal"
  | "collateral"
  | "orphan";

export type LineageFilter = "all" | "paternal" | "maternal" | "direct";

export const LINEAGE_FILTERS: Array<{ id: LineageFilter; label: string }> = [
  { id: "all", label: "全部" },
  { id: "paternal", label: "父系" },
  { id: "maternal", label: "母系" },
  { id: "direct", label: "直系" },
];

export function generationLabel(distance: number): string {
  if (!Number.isFinite(distance)) return "未连接";
  if (distance <= -5) return Math.abs(distance) + " 世祖";
  if (distance === -4) return "高祖";
  if (distance === -3) return "曾祖";
  if (distance === -2) return "祖辈";
  if (distance === -1) return "父辈";
  if (distance === 0) return "同辈";
  if (distance === 1) return "子辈";
  if (distance === 2) return "孙辈";
  if (distance === 3) return "曾孙";
  if (distance === 4) return "玄孙";
  return distance + " 世孙";
}

export function pedigreePath(
  state: FamilyState,
  personId: string,
  meId: string | null
): string | null {
  if (!meId || !state.persons[meId]) return null;
  if (personId === meId) return "";
  const prev = new Map<string, { from: string; via: "F" | "M" }>();
  const queue: string[] = [meId];
  const seen = new Set<string>([meId]);
  while (queue.length > 0) {
    const current = queue.shift() as string;
    if (current === personId) break;
    const entry = state.parents[current];
    const ups: Array<["F" | "M", string | undefined]> = [
      ["F", entry?.fatherId],
      ["M", entry?.motherId],
    ];
    for (const [via, id] of ups) {
      if (!id || !state.persons[id] || seen.has(id)) continue;
      seen.add(id);
      prev.set(id, { from: current, via });
      queue.push(id);
    }
  }
  if (!seen.has(personId)) return null;
  const parts: string[] = [];
  let cursor = personId;
  while (cursor !== meId) {
    const step = prev.get(cursor);
    if (!step) return null;
    parts.push(step.via);
    cursor = step.from;
  }
  return parts.reverse().join("");
}

export function isPatrilinealPath(path: string | null): boolean {
  return path !== null && path.length > 0 && /^F+$/.test(path);
}
export function isMatrilinealPath(path: string | null): boolean {
  return path !== null && path.length > 0 && /^M+$/.test(path);
}
export function isAncestorPath(path: string | null): boolean {
  return path !== null && path.length > 0 && /^[FM]+$/.test(path);
}
export function pedigreeSortKey(path: string | null): string {
  if (!path) return "9";
  return path.split("").map(function (ch) { return ch === "F" ? "0" : "1"; }).join("");
}

export function computeDistances(state: FamilyState): Map<string, number | null> {
  const distances = new Map<string, number | null>();
  for (const id of Object.keys(state.persons)) distances.set(id, null);
  const meId = state.meId;
  if (!meId || !state.persons[meId]) return distances;
  distances.set(meId, 0);
  const queue = [meId];
  const neighbour = (id: string): Array<[string, number]> => {
    const out: Array<[string, number]> = [];
    const p = state.parents[id];
    if (p?.fatherId) out.push([p.fatherId, -1]);
    if (p?.motherId) out.push([p.motherId, -1]);
    for (const [childId, entry] of Object.entries(state.parents)) {
      if (entry.fatherId === id || entry.motherId === id) out.push([childId, 1]);
    }
    for (const s of getSpouseIds(state, id)) out.push([s, 0]);
    return out.sort((a, b) => a[0].localeCompare(b[0]));
  };
  while (queue.length > 0) {
    const cur = queue.shift() as string;
    const base = distances.get(cur);
    if (base === null || base === undefined) continue;
    for (const [nid, w] of neighbour(cur)) {
      if (distances.get(nid) !== null) continue;
      distances.set(nid, base + w);
      queue.push(nid);
    }
  }
  return distances;
}

function sharesParentWith(state: FamilyState, personId: string, ancestorId: string): boolean {
  const ap = state.parents[ancestorId];
  const pp = state.parents[personId];
  if (!ap || !pp) return false;
  return Boolean(
    (ap.fatherId && ap.fatherId === pp.fatherId) ||
      (ap.motherId && ap.motherId === pp.motherId)
  );
}

export function classifyLineage(
  state: FamilyState,
  personId: string,
  meId: string | null,
  distances?: Map<string, number | null>
): LineageKind {
  if (!meId || !state.persons[meId] || !state.persons[personId]) return "orphan";
  if (personId === meId) return "ego";
  const path = pedigreePath(state, personId, meId);
  if (isPatrilinealPath(path)) return "paternal";
  if (isMatrilinealPath(path)) return "maternal";
  if (isAncestorPath(path)) return path!.charAt(0) === "F" ? "paternal" : "maternal";

  const dist = distances || computeDistances(state);
  const d = dist.get(personId);
  const meP = state.parents[meId];
  if (d === null || d === undefined) {
    if (
      meP &&
      ((meP.fatherId && sharesParentWith(state, personId, meP.fatherId)) ||
        (meP.motherId && sharesParentWith(state, personId, meP.motherId)))
    ) {
      return "collateral";
    }
    return "orphan";
  }
  if (d >= 1) return "descendant";
  const my = state.parents[meId];
  const theirs = state.parents[personId];
  if (my && theirs) {
    const shareFather = Boolean(my.fatherId && my.fatherId === theirs.fatherId);
    const shareMother = Boolean(my.motherId && my.motherId === theirs.motherId);
    if (shareFather || shareMother) return "sibling";
  }
  if (getSpouseIds(state, meId).includes(personId)) return "affinal";
  if (
    meP &&
    ((meP.fatherId && sharesParentWith(state, personId, meP.fatherId)) ||
      (meP.motherId && sharesParentWith(state, personId, meP.motherId)))
  ) {
    return "collateral";
  }
  return "orphan";
}

export function collateralSide(
  state: FamilyState,
  personId: string,
  meId: string | null
): "paternal" | "maternal" | "other" {
  if (!meId) return "other";
  const meParents = state.parents[meId];
  if (!meParents) return "other";
  if (meParents.fatherId && sharesParentWith(state, personId, meParents.fatherId)) {
    return "paternal";
  }
  if (meParents.motherId && sharesParentWith(state, personId, meParents.motherId)) {
    return "maternal";
  }
  return "other";
}

export function filterVisibleIds(
  state: FamilyState,
  filter: LineageFilter,
  maxDepth: number
): Set<string> {
  const ids = Object.keys(state.persons);
  const meId = state.meId;
  const visible = new Set<string>();
  if (!meId || !state.persons[meId]) {
    for (const id of ids) visible.add(id);
    return visible;
  }
  const distances = computeDistances(state);
  visible.add(meId);
  for (const s of getSpouseIds(state, meId)) visible.add(s);
  const my = state.parents[meId];

  for (const id of ids) {
    const d = distances.get(id);
    const disconnected = d === null || d === undefined;

    if (filter === "all") {
      if (disconnected || Math.abs(d as number) <= maxDepth) visible.add(id);
      continue;
    }
    if (disconnected || Math.abs(d as number) > maxDepth) continue;

    const path = pedigreePath(state, id, meId);
    const lineage = classifyLineage(state, id, meId, distances);

    if (filter === "direct") {
      const directAncestor =
        (isPatrilinealPath(path) || isMatrilinealPath(path)) && (d as number) < 0;
      const isParents = Boolean(my && (id === my.fatherId || id === my.motherId));
      if (id === meId || directAncestor || isParents || (d as number) >= 1) {
        visible.add(id);
      }
      continue;
    }
    if (filter === "paternal") {
      const keep =
        isPatrilinealPath(path) ||
        (d as number) >= 1 ||
        lineage === "sibling" ||
        lineage === "affinal" ||
        (lineage === "collateral" && collateralSide(state, id, meId) === "paternal");
      if (keep) visible.add(id);
      if (my && id === my.fatherId && my.motherId) visible.add(my.motherId);
      continue;
    }
    if (filter === "maternal") {
      const keep =
        isMatrilinealPath(path) ||
        (d as number) >= 1 ||
        lineage === "sibling" ||
        lineage === "affinal" ||
        (lineage === "collateral" && collateralSide(state, id, meId) === "maternal");
      if (keep) visible.add(id);
      if (my && id === my.motherId && my.fatherId) visible.add(my.fatherId);
    }
  }

  let grew = true;
  while (grew) {
    grew = false;
    for (const id of Array.from(visible)) {
      for (const s of getSpouseIds(state, id)) {
        if (!visible.has(s)) {
          visible.add(s);
          grew = true;
        }
      }
    }
  }
  return visible;
}
