# Implementation Plan — 老太公 · 家族图谱 Apple Style 重构

> RALPLAN-DR · **DELIBERATE** mode · Iteration 1 (Planner draft)
> Spec: `.omc/specs/deep-interview-laotagong-redesign.md` (34 AC, ambiguity 19%, PASSED)
> Repo: `D:\XiaomiMiMoProjects\laotagong` · Next 16.3.4 (App Router, `output: "export"`) · React 19 · TS 5.9 strict · Tailwind 4.1.14 · pnpm 11.22 · Node 22.23

---

## 1. RALPLAN-DR Summary (DELIBERATE mode)

### 1.1 Principles (invariants this plan must not violate)

| # | Principle | Why it is an invariant | Enforcement |
|---|-----------|------------------------|-------------|
| P1 | **双写对称 (Link Symmetry)** — every relation write goes through one symmetric layer; no call site may write `state.parents` / `state.spouses` directly. | The Bug exists because one path knew about the other side and four did not. Verified today: **2** direct `parents:` object literals in `components/family-app.tsx` (`:162` inside `handleAddRelation`, `:199` inside `handleLinkExistingAsParent`) plus 4 `addSpouseLink`/`linkChildWithParents` call sites (`:171`, `:174`, `:187`, `:216`, `:226`). Adding a seventh path later re-creates the Bug. | Unit test: `grep -rn "parents:" components/` returns **0** hits after Step 2. |
| **P2** | **世代不落库 (No persisted generation)** | Spec constraint (line 69). `--store` must never gain a `generation`/`depth` field. Relation distance is recomputed from `meId` on every render. | Type-level: `FamilyState` has exactly 5 keys. Test asserts `Object.keys(createEmptyState())` deep-equals `["version","persons","parents","spouses","meId"]`. |
| **P3** | **单一字段真相 (One field list, one place)** | The Bug that drops `photoUrl`/`events` is possible *only* because the Person field list is duplicated at `lib/family.ts:40-54` (`createPerson`) and `lib/family.ts:196-210` (`sanitizeState`). Any plan that adds fields to two lists will drift again. | `createPerson` and `sanitizeState` both call one `normalizePerson(id, raw)`. Test: reflect over a fully-populated `Person` fixture and assert every key survives `sanitizeState(JSON.parse(exportState(s)))`. |
| **P4** | **模糊即询问，不猜测 (Never fabricate a relation)** | This is a *family archive*, not a demo. A guessed parent link is worse than a missing one: it is silently wrong and the user has no way to notice. Multi-spouse (AC-20) and orphan-repair both hit this. | Every link function returns `LinkResult { state, applied[], ambiguous[] }`. The plan contains **zero** auto-repair-on-load code paths. |
| **P5** | **移动端为基准，桌面端只放大不改结构** | Spec constraint (line 60) + Round 10. Breakpoint change must be expressible in CSS alone, never in JS, so there is no hydration mismatch and no resize listener. | AC-15 implemented as `lg:` utility overrides in `sheet.tsx`, not `useMediaQuery`. Playwright asserts both viewports. |

### 1.2 Decision Drivers (top 3)

1. **The Bug is a data-integrity bug, not a UI bug.** AC-17/18/19/20 all live in `lib/family.ts`, which is already UI-free and pure. It must be fixed and *proven* before any pixel changes, because every UI change afterwards would otherwise be built on an unverified model. This driver alone forces "data layer first".
2. **`components/family-app.tsx` (1277 lines) is a single-writer bottleneck.** Every redesign task touches it. Concurrency only exists after it is dismantled. This driver forces "split before parallel redesign, and split to *target* boundaries, not intermediate ones".
3. **The project has zero tests and zero test infrastructure.** AC-17's symmetry invariant regresses silently (it did once already). The test harness is a *prerequisite*, not a nice-to-have, and it is also the only artifact that mutates `pnpm-lock.yaml` — so it must land once, first, by one writer.

### 1.3 Viable Options — the three contested decisions

#### D1 · Execution ordering

| Option | Pros | Cons |
|---|---|---|
| **O1-A: Split first (verbatim), then redesign** | The split has a hard oracle: a verbatim move must produce byte-identical DOM. Parallelism unlocks immediately. | Invents boundaries the redesign destroys. A naive split makes `components/cards/person-card.tsx` — which AC-12 immediately splits into `MeCard`/`RelativeCard`. You touch 1277 lines twice. |
| **O1-B: Redesign in place, then split** | No wasted boundaries. | `family-app.tsx` stays 1277 lines through 100% of the risk. Every task conflicts with every other task. Diff is unreviewable. No oracle is possible because behaviour changed intentionally. **Rejected.** |
| **O1-C ★ SPLIT DIRECTLY TO TARGET BOUNDARIES, PER-FILE `move → redesign`** | No wasted work: every new file is a target file (from the spec's Ontology table). Each file still gets a verbatim-move commit with the DOM oracle, then a redesign commit. Parallelism is per-file. | Requires discipline: the first commit touching each new file must be a pure move. One exception: `person-card.tsx` is created verbatim in the move and split in the redesign (≈10 min of rework, accepted). |
| **O1-D: Interleave freely (split+redesign in one pass per component)** | Fastest wall-clock for one writer. | Destroys the move oracle entirely; a regression in a 200-line diff is invisible. Subsumed by O1-C. **Rejected.** |

**Decision: O1-C**, sequenced as *foundation (serial, single writer) → per-file move (parallel) → per-file redesign (parallel) → integration (single writer)*. O1-A invalidated because its boundaries are not the spec's boundaries; O1-B invalidated because it maximizes contention on the project's largest file for the project's entire duration.

#### D2 · Token layer strategy

| Option | Pros | Cons |
|---|---|---|
| **O2-A: Keep `text-[var(--ink)]` arbitrary values everywhere; add nothing** | Zero new failure modes. Theme correctness is automatic (var flips). AC-34 passes by construction. | AC-2 requires a **5-level type scale** and AC-3 an **8px grid** enforced across ~10 new files. Arbitrary values make each new file re-invent `text-[28px]` / `p-[16px]`; the scale drifts within one sprint and nothing detects it. There is no mechanism for a *named, shared* scale. |
| **O2-B: `@theme inline` mapping existing vars → shadcn semantic tokens, plus `@custom-variant dark`** | The only Tailwind-4 mechanism that makes AC-2/AC-3 *enforceable*: `text-title` / `text-display` / `p-card` / `gap-section` are single-source-of-truth and cannot drift across files. Also gives every parallel writer a local `dark:` escape hatch instead of editing the shared `globals.css`. | `@theme` without `inline` **silently mis-resolves** vars that change at runtime (Tailwind docs, "Referencing other variables"). Adding `dark:` creates a *third* theming mechanism alongside (a) CSS-var flip and (b) `.dark X` rules — a smell. Risk of half-migration. |
| **O2-C: `@theme` for scale only (typography + spacing), no color mapping, no `dark:` variant** | Enforceable scale, zero theming risk. | Leaves the `text-[var(--ink)]` noise and gives parallel writers no escape hatch — they will add new `.dark X {}` rules to `globals.css`, which is exactly the shared-file contention we are trying to avoid. |

**Decision: O2-B, scoped.** Map **only** semantic + scale namespaces; do **not** map the glass materials (`--glass*` stay arbitrary-value, because glass is deliberately non-semantic). Mandatory constraints:
- **`@theme inline`** (not `@theme`) — non-negotiable, per Tailwind docs.
- **Never redefine `--spacing`** (the base). Doing so re-scales every existing `p-3`/`gap-3` in the codebase and would silently reflow the whole app. Add *named* spacing only (`--spacing-card`, `--spacing-section`).
- `@custom-variant dark (&:where(.dark, .dark *))` — matches `lib/theme.ts:31-36` `applyTheme()` which already writes `.dark` on `<html>`. This **presupposes** the self-built theme system; it does not replace it. Non-goal "不引入 next-themes" is respected.
- Convention recorded in `CLAUDE.md`: *prefer CSS-var tokens; use `dark:` only when no token exists.*

O2-A invalidated by AC-2/AC-3 (no enforcement mechanism). O2-C invalidated because it inverts the contention problem rather than solving it.

#### D3 · The `sheet.tsx` dead-animation problem

`components/ui/sheet.tsx:20,41,43` use `animate-in` / `fade-in-0` / `slide-in-from-bottom` / `zoom-in-95`, but `package.json:24-31` has no `tw-animate-css` and `app/globals.css:1` has no `@plugin`/`@import` for it. **These classes generate no CSS.** All three sheets are currently animation-dead.

| Option | Pros | Cons |
|---|---|---|
| **O3-A ★ `pnpm add -D tw-animate-css` + `@import "tw-animate-css";` in `globals.css`** | **Zero edits to the existing class strings** — the classes at `sheet.tsx:20,41,43` start working as written. `npm view tw-animate-css version` → 1.4.0, described as "TailwindCSS v4.0 compatible replacement for `tailwindcss-animate`" — this is the canonical Tailwind-4 package. The spec's own "非阻塞的既有缺陷" note (spec line 347) pre-blesses this: "若按 AC-15 改动弹窗，顺手装包即可修复". | +1 devDependency; ~15KB CSS into `out/`; **mutates `pnpm-lock.yaml`** — the single highest-conflict file in the repo. |
| **O3-B Hand-write keyframes in `globals.css`** | No dependency. | Must reimplement four utilities (`animate-in`, `fade-in-0`, `slide-in-from-bottom-*`, `zoom-in-95`) *plus* the Radix `data-[state=open|closed]` state machine — ≈60 lines of CSS we then own forever. Only wins if the dependency itself is objectionable, which nothing in the spec says. |
| **O3-C Drop animations entirely** | Zero cost. | Deletes classes from `sheet.tsx` (more churn, not less), and contradicts AC-15's whole point (different sheet forms at different breakpoints). A sheet that teleports in is not "Apple Style". |

**Decision: O3-A**, with the hard process rule that it happens **exactly once, in Step 0, by one writer**, together with the test-runner dependencies — so `pnpm-lock.yaml` is written once and then frozen for the rest of the project. O3-B/O3-C invalidation rationale is in the table above.

---

## 2. Pre-mortem — exactly 3 failure scenarios

### P-1 · Silent data loss on every reload: `sanitizeState` is a field white-list and will eat `photoUrl` + `events`

**What breaks.** `saveState` (`lib/family.ts:268-271`) writes the *whole* `FamilyState` to localStorage. `loadState` (`:257-266`) → `importState` (`:252-255`) → `sanitizeState` (`:187-246`). `sanitizeState` **rebuilds each Person from an explicit 10-key object literal** (`:196-210`). Any key not in that literal is discarded on read.

So: user pastes a photo URL and adds three 家族事件, hits 保存, sees them rendered, reloads the page — **gone**. Not partially: `photoUrl` and `events` vanish from every person. Worse than ordinary data loss, because the bytes are still in localStorage; a user who opens DevTools will see the data sitting there being thrown away on read.

This is *not hypothetical*: it is the direct consequence of AC-21 landing before the sanitizer is updated. `pnpm build` passes the whole time, the UI looks correct, and there is no runtime error. This is the highest-probability, highest-damage failure in the plan.

**Early warning signal.**
- `grep -c 'photoUrl' lib/family.ts` returns **2** (interface + `createPerson`) instead of **≥4** (interface, `normalizePerson` read, `normalizePerson` write, event/photo coercion). Same shape for `events`. In a correct Step 1 the field name appears in `lib/family/types.ts` *and* in `lib/family/sanitize.ts`; if it appears **only** in `types.ts`, P-1 has fired.
- The unit test `round-trip preserves all Person keys` fails while every other test passes.
- Manual signal: reload after editing; if the avatar reverts to the initial-letter fallback, this has fired.

**Mitigation baked into the plan.**
1. **Step 1 collapses the two field lists into one.** `createPerson` (`:40`) and `sanitizeState` (`:196`) both delegate to a single `normalizePerson(id, raw: unknown): Person`. A field can no longer be added to one and not the other — P3 is enforced structurally, not by review.
2. **Step 1 ships the round-trip parity test before any UI consumes the fields:** build a `Person` fixture with every field populated, `sanitizeState(JSON.parse(exportState(s)))`, and assert `Object.keys` parity + deep equality. This test fails loudly the moment a field is dropped.
3. **AC-28's UI (Step 7d) is gated on Step 1's tests being green** — the file-ownership table forbids 7d from starting if `test/family.sanitize.test.ts` is red.

### P-2 · The Bug is fixed for new data; the user's existing broken data stays broken — and the obvious "fix" is a fabrication

**What breaks.** AC-17 changes the *write* path. Rows already in localStorage with the broken shape (child has `fatherId` only, spouse added afterwards, `motherId` never backfilled) are untouched. The user upgrades, sees the identical symptom, and concludes the fix does not work. Concretely, this is reachable today via `components/family-app.tsx:171` (`addSpouseLink`, no backfill) and `:174` (`linkChildWithParents` on a parent with zero spouses at that moment).

The tempting repair — "on load, for each child with one parent and a free slot, fill the slot with that parent's spouse" — is **a heuristic, not a derivation**. If the parent has ≥2 spouses, the correct other parent is not knowable; filling in `spouseIds[0]` silently is precisely the behaviour AC-20 forbids. In a family archive, inventing an ancestor is worse than showing a gap, because the wrong answer is indistinguishable from the right one.

**Early warning signal.**
- The E2E AC-17 test passes (it seeds a clean state) while a manual check against a **pre-seeded** `laotagong:family:v1` fixture of the broken shape shows no change. If the two disagree, the fix is write-path-only.
- The repair detector reports **0** findings on real data → the predicate does not match the actual broken shape (likely because `sanitizeState` already dropped the orphaned entry at `:219` `if (!persons[childId]) continue;`).

**Mitigation baked into the plan.**
1. **One predicate, two callers.** `isUnambiguousBackfill(state, childId, parentId): boolean` returns true iff: `parents[childId]` exists, exactly one of its two slots equals `parentId`, the other slot is empty, **and** `getSpouseIds(state, parentId).length === 1`. The write path applies it eagerly; the repair detector applies it over the whole graph. Zero additional heuristic surface.
2. **No silent auto-repair.** The detector's output is surfaced in the Footer as an explicit, dismissible banner — "发现 N 条可修复的双亲关系" with a 修复 button. Justification: auto-repair would have to guess in the ≥2-spouse case, violating P4 and AC-20. Detection is conservative by construction (exactly-one-spouse only).
3. **Tests start from loaded bytes, not from builder calls.** `test/family.repair.test.ts` seeds a raw JSON string of the broken shape through `importState`, not through `addParentLink` — because the bug is a *load/write* bug and a fixture built by the new code cannot reproduce it.
4. **A manual escape hatch already exists and is preserved:** the empty 母亲 slot → 关联已有 → pick B (`family-app.tsx:684-688` → `:194-211`). Step 2 routes that call site through the symmetric layer so it stops being a fifth unguarded write path, but the UX path stays.

### P-3 · Merge-conflict-by-construction: one 1277-line file, one CSS file, one lockfile, four concurrent writers

**What breaks.** Three shared resources:
- `components/family-app.tsx` (1277 lines) is touched by *every* redesign task. Two agents editing it concurrently produce a conflict that `git` cannot merge semantically — both rewrote overlapping regions.
- `app/globals.css` is touched by the token layer *and* by any writer who needs a new `.dark X {}` rule or a new keyframe.
- `pnpm-lock.yaml` is rewritten by every `pnpm add`. `.github/workflows/deploy.yml:34` runs `pnpm install --no-frozen-lockfile`, so a mid-flight lockfile does not fail CI — it *silently* installs a different tree, which is worse.

**Early warning signal.**
- `git status --short` shows `components/family-app.tsx` modified by two agents in the same window.
- `pnpm-lock.yaml` appears in more than one commit on the branch.
- `app/globals.css` is modified after the Step 3 token-layer commit.
- Any writer adds a `.dark <selector>` rule or a `@keyframes` block to `globals.css` after Step 3 — that is a P-3 event, not a style choice.

**Mitigation baked into the plan.**
1. **Step 0 is the only step permitted to run `pnpm add`.** `vitest`, `jsdom`, `@playwright/test`, `tw-animate-css` all land together. Afterwards the lockfile is frozen; any later dependency need is escalated, not installed.
2. **`app/globals.css` is single-writer in Step 3 and closed afterwards.** The `@custom-variant dark` added in Step 3 is the sanctioned escape hatch, so no writer has a reason to reopen the file. If a writer believes they need to, that is a planning escalation.
3. **The split (Step 6) is serial, one file at a time.** This is the honest constraint: the file being dismantled is the shared resource, so it cannot be parallelised. Expand-contract (parallel new files + one late integrator) is a valid variant but is *not* recommended here — 1277 lines is small enough that coordination overhead exceeds the serial cost, and it defers all verification to a single high-risk integration point.
4. **File-ownership table** (§3.7) is normative: one agent per file at a time. It is the mechanism by which this mitigation is checkable rather than aspirational.

---

## 3. Implementation Steps

Every step ends with `pnpm build` green. Steps are grouped into phases; **the file-ownership table in §3.7 is normative.**

### Phase A — Foundation (serial · single writer)

#### Step 0 · Dependency + test harness (no source file changes)

**Files:** `package.json`, `pnpm-lock.yaml`, `vitest.config.ts` (new), `test/setup.ts` (new), `.gitignore`, `playwright.config.ts` (new)

- `pnpm add -D vitest jsdom @playwright/test tw-animate-css` — **all four, once.** (registry: vitest 5.0.0, jsdom 30.0.1, @playwright/test 1.63.0, tw-animate-css 1.4.0)
- `vitest.config.ts`: `resolve.alias { "@": <root> }` (mirrors `tsconfig.json:25-29`), `environment: "jsdom"`, `include: ["test/**/*.test.ts"]`.
- Scripts: `"test": "vitest run --passWithNoTests"`, `"test:watch": "vitest"`, `"e2e": "playwright test"`, `"check:contrast": "node scripts/check-contrast.mjs"`.
- `.gitignore`: `coverage/`, `playwright-report/`, `test-results/`.
- **AC:** none directly; enables AC-17/18/19/20/23 verification and Step 3.
- **Effort:** small. **Cannot be split** — it is the only lockfile-mutating step (P-3 mitigation 1).
- **Verification:** `pnpm install` clean; `pnpm build` green; `pnpm test` exits 0; **`head -1 pnpm-lock.yaml` still reads `lockfileVersion: '9.0'`** (local pnpm is 11.22.0 while `.github/workflows/deploy.yml:23-24` pins pnpm 9 — both emit 9.0, so they are compatible, but a silent version bump here would only fail in CI).
- **Working-tree state to resolve before Step 0 runs:** `git status` currently shows `package.json` modified — the `"packageManager": "pnpm@9.15.9"` field has been removed from the working tree while it is still present at `HEAD`. This is **not** an edit made by this plan. It must be either committed or reverted before Step 0, because Step 0 is the designated single writer of `package.json` + `pnpm-lock.yaml` (P-3 mitigation 1) and cannot proceed on a dirty file.
- **Incidental finding, record in CLAUDE.md:** `package.json:12` declares `"lint": "next lint"`, but **`next-lint.js` does not exist in `node_modules/next/dist/cli/`** on Next 16.3.4 — the script is dead. Do not add `pnpm lint` to any verification gate; either delete the script or replace with a direct `eslint` invocation (out of scope for this plan).

#### Step 1 · Data model + single field list (`lib/family.ts` → `lib/family/`)

**Files:** `lib/family/types.ts` (new), `lib/family/sanitize.ts` (new), `lib/family/derive.ts` (new), `lib/family/links.ts` (new), `lib/family/index.ts` (new, barrel), `lib/family.ts` (deleted)

> The barrel keeps `import { … } from "@/lib/family"` working unchanged for every existing call site — `components/family-app.tsx:33-54` needs **zero** edits in this step.

- **Types** (`types.ts`): `Gender`, `RelationKind`, `STORAGE_KEY` (unchanged, see below), `Person` **gains** `photoUrl?: string` and `events?: FamilyEvent[]`. `FamilyEvent = { id: string; type: FamilyEventType; date: string; place?: string; note?: string }`, `FamilyEventType = "marriage" | "birth" | "death" | "migration" | "honor" | "custom"` (labels 婚娶 / 生育 / 丧葬 / 迁徙 / 褒学 / 自定义 — covers AC-21's 婚丧嫁娶 / 迁徙 / 褒学 / 自定义). **AC-21**
- **`normalizePerson(id: string, raw: unknown): Person`** — the single field list. Both `createPerson` and `sanitizeState` call it. Resolves the spec's flagged defect (`lib/family.ts:1-28` vs `:40` vs `:197`): optional text fields normalize **empty string → `undefined`**, so `exportState` stops emitting 10 empty strings per person and the declared type becomes true. Verified safe: every consumer uses falsy checks (`components/family-app.tsx:836-839` `person.birthYear || person.deathYear`, `:888` `person.ancestralHome || person.household`) and the edit sheet already coalesces (`:984` `draft.birthYear ?? ""`). **AC-22**
- **`normalizeEvent(raw, index): FamilyEvent | null`** — `id` must be a non-empty string else `crypto.randomUUID()`; `type` must be in the enum else `"custom"`; `date` string default `""`; `place`/`note` string-or-`undefined`. Invalid entries are dropped, not thrown. **AC-21**
- **`sanitizeState`** (`sanitize.ts`) extended to run `normalizePerson` and to coerce `events` through `normalizeEvent`. **AC-23**
- **`getRelationDistances(state): Map<string, number>`** + **`groupByRelationDistance`** (`derive.ts`) — see §3.6. **AC-9, AC-10**
- **Migration decision — explicit:** `STORAGE_KEY` **stays `"laotagong:family:v1"`** and `FamilyState.version` **stays `1`**. Rationale: `photoUrl` and `events` are *optional additive* fields; a v1 document remains a valid v1 document, and `normalizePerson` supplies `undefined` / `[]`. Bumping the key would strand existing user data under the old key and *create* the migration risk the spec warns about, for zero benefit. AC-23 is therefore satisfied **vacuously and by record** — the plan documents the reasoning in `CLAUDE.md` (Step 8) so a future contributor does not bump the key casually. **AC-23**
- **AC:** AC-21, AC-22, AC-23. No UI change — new fields exist in the model but nothing renders them yet.
- **Effort:** medium. **Cannot be split** below "model + normalizer + sanitizer", because splitting them would reintroduce exactly the two-field-list defect P-1 is about.
- **Verification:** `pnpm build` green; `test/family.sanitize.test.ts` green including the round-trip key-parity test.

**Step 1 tests** (`test/family.sanitize.test.ts`):
1. `round-trip preserves every Person key` — reflect over a fully-populated fixture (P-1 mitigation 2).
2. `sanitizeState drops unknown keys but keeps photoUrl/events`.
3. `sanitizeState coerces a non-array events field to []`.
4. `normalizeEvent rejects an unknown type → "custom"`, `regenerates a missing id`.
5. `non-canonical birthYear survives verbatim`: `"约1950"`, `"?"`, `"1949-"` round-trip byte-identical. **AC-22**
6. `v1 JSON without photoUrl/events loads without loss` — a raw literal of the *current* on-disk format (`birthYear: ""` etc.) parses, all 10 original fields preserved. **AC-23**
7. `FamilyState has exactly 5 keys`. **AC-10**

#### Step 2 · Symmetric write layer + repair predicate (`lib/family/links.ts`)

**Files:** `lib/family/links.ts`, `lib/family/index.ts` (barrel export), `components/family-app.tsx` (**5 surgical call sites only**, lines 171 / 174 / 187 / 216 / 226)

- **`LinkResult`** = `{ state: FamilyState; applied: Array<{ childId: string; parentId: string }>; ambiguous: Array<{ childId: string; candidates: string[] }> }`.
- **`isUnambiguousBackfill(state, childId, parentId): boolean`** — the shared predicate (P-2 mitigation 1). Exported so the repair detector (Step 7h) can reuse it verbatim.
- **`addSpouseLink(state, a, b): LinkResult`** — adds the pair, then for each child `C` where exactly one of `{a,b}` is `C`'s recorded parent **and** `C`'s other slot is empty: if the predicate holds, backfill and record in `applied`; otherwise record in `ambiguous` with `candidates = getSpouseIds(state, parentOfC)`. Never overwrites an occupied slot — a child with a *recorded* other parent is untouched. **AC-17 (write half), AC-18**
- **`linkChildWithParents(state, childId, parentId): LinkResult`** — replaces the silent `spouseIds[0]` at `lib/family.ts:136`. 0 spouses → bind one side only; **1 spouse → bind it**; **≥2 spouses → bind *neither*, emit `ambiguous`**. The caller (Step 7) surfaces a "选择另一位亲长 / 暂不指定" picker. **AC-20**
- **Gender-unknown fix** (`lib/family.ts:130-131` currently sends `"unknown"` to the `"father"` branch): `"unknown"` binds **the free slot**; if both are free, `"father"`; if both are occupied by someone else, the state is returned unchanged with a reason rather than silently overwriting a real parent. **AC-18**
- **`removeSpouseLink` semantics (AC-19) — decided: keep the parent links.** Removing a spouse pair does **not** retroactively clear `motherId`/`fatherId` previously established. Rationale: 删除关系 ≠ 删除事实; the existing code at `lib/family.ts:159-166` already behaves this way, and the spec's own risk register (spec line 339) recommends this. It is now *documented* (CLAUDE.md, Step 8) and *tested*, which is what AC-19 actually demands. The removal also does **not** trigger backfill — a newly-freed slot is surfaced by the detector, never auto-filled. **AC-19**
- **Call-site edits in `components/family-app.tsx` (5 sites, surgical):** `:171`, `:174` → use `.state` and toast on `ambiguous`; `:187` (`handleLinkExistingAsChild`); `:197-206` (`handleLinkExistingAsParent`) → **route through `linkChildWithParents` / the symmetric layer instead of the raw `parents` spread** (this is the fifth unguarded write path, and it is why `grep -rn "parents:" components/` must reach 0); `:216`, `:226` accordingly.
- **AC:** AC-17 (write path), AC-18, AC-19, AC-20.
- **Effort:** medium. **Cannot be split** from the call-site edits — a signature change without callers does not build.
- **Verification:** `pnpm build` green; `test/family.links.test.ts` green; `grep -rn "parents:" components/` drops from **2** (`components/family-app.tsx:162`, `:199`) to **0**.

**Step 2 tests** (`test/family.links.test.ts`) — the symmetry invariant is the highest-value target:
1. **`INVARIANT: ∀C, parents[C]={F,M} ⟹ areSpouses(state,F,M)`** — asserted after every mutating operation over a matrix of ~12 fixtures. **AC-18**
2. **`AC-17 exact shape`**: seed via `importState('<raw v1 JSON>')` with `A` + child `C` (fatherId=A only) + `B`; run `addSpouseLink(A,B)`; assert `C.motherId === B`. **AC-17**
3. `addSpouseLink never overwrites an occupied slot` — child with a recorded other parent is left alone.
4. `addSpouseLink with ≥2 existing spouses → ambiguous, no write`.
5. `linkChildWithParents with 1 spouse backfills`; `with 2 spouses → ambiguous, neither bound`. **AC-20**
6. `gender "unknown" binds the free slot; does not overwrite`. **AC-18**
7. `removeSpouseLink preserves existing parent links`. **AC-19**
8. `removeSpouseLink then addSpouseLink again is idempotent` (no duplicate pairs — `lib/family.ts:155` guard preserved).

### Phase B — Shared surfaces (serial · single writer)

#### Step 3 · Design token layer (`app/globals.css`) — **single writer, then closed**

**Files:** `app/globals.css` only. **No component file changes.**

- `@import "tw-animate-css";` after `@import "tailwindcss";` (line 1). Fixes the D3 defect with **zero** edits to `components/ui/sheet.tsx`.
- `@custom-variant dark (&:where(.dark, .dark *));` — matches `lib/theme.ts:31-36` `applyTheme()`.
- **`@theme inline { … }`** — `inline` is mandatory (Tailwind docs, "Referencing other variables": without it, utilities resolve against the value where the *theme var* is declared, not where it is used). Map semantic tokens only: `--color-background: var(--bg-0)`, `--color-foreground: var(--ink)`, `--color-muted-foreground: var(--ink-soft)`, `--color-faint-foreground: var(--ink-faint)`, `--color-primary: var(--accent)`, `--color-destructive: var(--danger)`, `--color-border: var(--glass-edge)`, `--color-ring: var(--me-ring)`, `--radius-card: 1.75rem`. **Do not map `--glass*`** — glass is a material, not a semantic colour (D2).
- **Typography scale — 5 levels (AC-2)** via `--text-*` + `--text-*--line-height` + `--text-*--letter-spacing` + `--text-*--font-weight`:

  | token | size | use | AC-2 requirement |
  |---|---|---|---|
  | `--text-caption` | 0.8125rem (13px) | card years, hints, chips | **the AC-2 floor: 正文最小字号 ≥13px** |
  | `--text-body` | 0.9375rem (15px) | card names, form values | |
  | `--text-heading` | 1.25rem (20px) | sheet titles, section headings | |
  | `--text-title` | 1.75rem (28px), `-0.02em`, 600 | **h1 mobile** | |
  | `--text-display` | 2.125rem (34px), `-0.02em`, 600 | **h1 desktop (`lg:text-display`)** | |
- **Spacing (AC-3)** — named tokens only: `--spacing-card: 1rem` (16px, card padding floor) and `--spacing-section: 2rem` (32px, block gap floor); usable as `p-card`, `gap-section`, `mb-section`. **⚠️ Never redefine the base `--spacing`** — that rescales every existing numeric utility (`p-3`, `gap-3`, `h-5`, `max-w-3xl`) and silently reflows the whole app.
- **Contrast tokens (AC-4) — values derived, not guessed.** A worst-case WCAG model over `.glass-card` (`backdrop-filter: blur(28px) saturate(170%)`, `globals.css:186`) compositing `--glass` alpha over each of the 3 page-gradient stops × each of the 3 orbs × 3 positions:

  | token | now | **new** | worst-case ratio (light) | worst-case ratio (dark) |
  |---|---|---|---|---|
  | `--ink` | 1.0 | 1.0 | 14.99 ✓ | 7.64 ✓ |
  | `--ink-soft` (light) | 0.62 | **0.74** | 6.9 ✓ | — |
  | `--ink-faint` (light) | 0.42 | **0.66** | 5.35 ✓ | — |
  | `--ink-soft` (dark) | 0.62 | **0.78** | — | 5.40 ✓ |
  | `--ink-faint` (dark) | 0.40 | **0.72** | — | 4.87 ✓ |

  **Two findings that change the design:**
  1. **`--ink-soft` at 0.62 currently FAILS AA in dark mode (4.07:1)** over the cyan orb (`--orb-1`, `#38bdf8` @ 0.22) showing through 7% dark glass — the composited backdrop is `rgb(56,80,103)`, *lighter* than the page. AC-4 is therefore a real defect fix, not polish.
  2. In dark mode the two sub-`ink` tiers converge (0.78 / 0.72) because AA over that backdrop leaves little room. **This is intentional and aligned with AC-2**: hierarchy moves from colour tiering to the typographic scale. Record the rule in CLAUDE.md — *in dark mode `--ink-faint` is for non-content affordances (drag handle, dividers, disabled icons); all content text uses `--ink` or `--ink-soft`.*
- **Delete dead code** `select option` (`globals.css:359-362`) — no `<select>` exists anywhere.
- **AC:** AC-2, AC-3, AC-4; enables AC-1 (untouched glass) and AC-34.
- **Effort:** medium. **Cannot be split** — a half-migrated theme (half the tokens mapped, half the ink tiers raised) is worse than either state.
- **Verification:** `pnpm build` green; `pnpm check:contrast` green (§4.4); `shasum` of `out/index.html` unchanged; the **only** intended visual delta is the two ink tiers.

#### Step 4 · Sheet primitive: responsive side + live animation (`components/ui/sheet.tsx`)

**Files:** `components/ui/sheet.tsx`

- `side?: "bottom" | "center" | "responsive"`, default `"responsive"`. **AC-15**
- `"responsive"` = the existing bottom classes (`:41`) plus `lg:` overrides for the centre geometry already written at `:43` (`lg:left-1/2 lg:top-1/2 lg:bottom-auto lg:inset-x-auto lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-[28px] lg:max-w-md`). **Pure CSS — no `useMediaQuery`, no resize listener, no hydration risk** (P5).
- Animation (now live thanks to Step 3): `animate-in fade-in-0 slide-in-from-bottom-4 duration-300 lg:slide-in-from-bottom-0 lg:zoom-in-95` + `data-[state=closed]:animate-out data-[state=closed]:fade-out-0`. `--tw-enter-translate-y` and `--tw-enter-scale` are independent custom properties, so the responsive composition works.
- **AC-16** — `max-h-[92dvh]` at bottom; add `lg:max-h-[85vh]`; the body gets `min-h-0 flex-1 overflow-y-auto` so long content scrolls instead of clipping.
- The drag-handle `<div>` (`:48`) is currently rendered for **all** sides; gate it `aria-hidden` + hidden at `lg:` so the centred dialog does not carry a bottom-sheet affordance.
- **AC:** AC-15, AC-16; repairs the dead-animation defect (spec line 347).
- **Effort:** small.
- **Verification:** Playwright at 375×667 and 1440×900 (§4.3).

#### Step 5 · Layout skeleton — Header / Main / Footer (`components/family-app.tsx`)

**Files:** `components/family-app.tsx`. **`app/layout.tsx` needs no structural change** (see note).

- Wrap the root in `flex min-h-dvh flex-col`; replace the current single wrapper at `:280` (`mx-auto … max-w-3xl … lg:max-w-5xl`) with three siblings:
  - `<header className="w-full …">` — **exactly 3 visual elements: 品牌 / 查找入口 / 主题切换**. The settings button (`:293-300`) **leaves** the header. **AC-5, AC-6**
  - `<main className="mx-auto w-full max-w-3xl px-4 lg:max-w-5xl lg:px-8 …">` — inherits the `max-w` constraint that header/footer must not. **AC-5**
  - `<footer className="w-full …">` — 导出 / 导入 / 设置 / 清空 + 「N 位成员 · 数据仅保存在本机」 (`:457-459`). The three buttons move out of the settings sheet (`:428-453`) into a `DataActionBar`. **AC-7**
- **Note on `app/layout.tsx`:** it is a Server Component; theme/search state lives in the client `FamilyApp`. Rendering `<header>` in `layout.tsx` would force the state up or split it. Rendering the three regions **inside the client tree** keeps `app/layout.tsx` out of Phase B's write set entirely (P-3 mitigation). `layout.tsx` is still touched once, in Step 8, for the two incidental defects.
- **AC:** AC-5, AC-6, AC-7, AC-32.
- **Effort:** medium, single file, single writer.
- **Verification:** `document.querySelector('header').getBoundingClientRect().width === window.innerWidth`; `scrollWidth <= clientWidth` at 375px (**AC-32**); header contains exactly 3 focusable controls (**AC-6**).

### Phase C — Dismantle the monolith (serial · single writer · verbatim moves only)

#### Step 6 · Split `components/family-app.tsx` to target boundaries

> **Verbatim moves only.** No behaviour, no className, no JSX changes in this step. The oracle is §4.3's visual-freeze test: after **all** moves, the normalised DOM of a seeded page must hash identically to the pre-Step-6 baseline. `pnpm build` must be green after **every** individual move.

**Target file map** (line ranges are pre-edit, from the current file):

| New file | Source in `family-app.tsx` | Lines |
|---|---|---|
| `components/common/theme-cycle-button.tsx` | `ThemeCycleButton` | 515-535 |
| `components/common/gender-picker.tsx` | `GenderPicker` (used 3×: `:581`, `:972`, `:1201`) | 594-629 |
| `components/common/section-label.tsx` | `SectionLabel` | 788-797 |
| `components/common/toast.tsx` | inline toast JSX | 504-510 |
| `components/common/empty-state.tsx` | `EmptyState` | 546-592 |
| `components/cards/person-card.tsx` | `PersonCard` (verbatim; split in Step 7a) | 801-914 |
| `components/tree/tree-section.tsx` | `TreeSection` | 633-786 |
| `components/sheets/settings-sheet.tsx` | settings `Sheet` | 377-462 |
| `components/sheets/person-edit-sheet.tsx` | `PersonEditSheet` | 918-1073 |
| `components/sheets/add-relation-sheet.tsx` | `AddRelationSheet` | 1077-1277 |
| `components/layout/app-header.tsx` | Step 5's `<header>` block | — |
| `components/layout/app-footer.tsx` | Step 5's `<footer>` block | — |
| `hooks/use-family-store.ts` | state + hydration + persistence + all 11 handlers | 73-264 |
| `hooks/use-theme.ts` | theme state + `changeTheme` | 80, 83-108 |
| `hooks/use-toast.ts` | toast state + 2200ms timeout | 78, 98-102 |
| `lib/family/derive.ts` (`firstPersonId`) | `firstPersonId` | 537-542 |
| `lib/theme.ts` (`THEME_META`) | `THEME_META` | 66-70 |
| `components/family-app.tsx` | **composition root only — target ≤160 lines** | — |

`components.json:17-18` already declares the `hooks` alias while `hooks/` does not exist — this step creates it, so no config change is needed.

- **Why the split is serial:** the file being dismantled *is* the shared resource. Parallelising it means N conflicting rewrites of `family-app.tsx`. Expand-contract (parallel new files + one late integrator) is a legitimate variant but defers 100% of verification to one integration commit; at 1277 lines the coordination cost exceeds the serial cost. **This step cannot be meaningfully split further** — it is ~6 mechanical moves plus one composition-root rewrite.
- **AC:** none directly; it is the precondition for AC-11/12/14/28/29/30/31 landing in disjoint files.
- **Effort:** medium (~1h). **Not parallelisable** — say so rather than pretend.
- **Verification:** `pnpm build` green after each move; §4.3 visual-freeze hash identical.

### Phase D — Redesign + new capability (parallel-safe · disjoint files)

#### Step 7 · Per-file redesign and new features

Files in this phase are **disjoint**; the file-ownership table (§3.7) governs who may touch what. `components/family-app.tsx` gets exactly one writer throughout.

| Sub-step | File | Change | AC |
|---|---|---|---|
| **7a** | `components/cards/me-card.tsx` (new), `components/cards/relative-card.tsx` (new), `components/cards/person-card.tsx` (deleted) | Split on information density, not size. **MeCard** = 姓名 / 生卒年 / 籍贯 / 户籍 / 备注 / 头像. **RelativeCard** = 姓名 + 生卒年 + 头像 only (the 籍贯/户籍 block at `:888-895` is removed from relative cards). Both are `w-full` inside the existing `grid-cols-2` (`:670`, `:716`), so **width is already equal by construction** — AC-13's "宽度一致" needs no new CSS, only the removal of size-based variants. Connector anchors are sibling `div`s (`:690`, `:710`, `:757`) centred by `mx-auto` on the container, **not** positioned relative to card height, so height differences cannot misalign them. | AC-12, AC-13 |
| **7b** | `components/cards/person-avatar.tsx` (new) | One avatar component: `photoUrl` → `<img>`; `onError` sets a `failed` flag that **stops rendering the `<img>`** and swaps to the 姓名首字 + 性别渐变 fallback (an `onError` that merely styles the broken image still shows the broken-image glyph — this is what AC-29 forbids). Sizes 56px (我) / 36px (亲属) via a `size` prop. Use a plain `<img>` (not `next/image`): `next.config.ts:4-7` sets `output: "export"` + `images.unoptimized: true`, so there is no optimiser. `loading="lazy"`, `referrerPolicy="no-referrer"`, `alt=""` (the name is adjacent). **basePath trap:** `photoUrl` is a user-supplied absolute URL and must **not** be prefixed with `next.config.ts:9-10`'s `basePath`; validate on save that it starts with `http://` or `https://` and show an inline hint otherwise — a site-relative `/photos/x.jpg` would 404 under a GitHub Pages project site (**AC-33**). | AC-14, AC-29, AC-28 (render half) |
| **7c** | `components/sheets/family-event-list.tsx` (new) | Collapsible (reuse `components/ui/collapsible.tsx`) list of `FamilyEvent`; add / edit inline / delete; type chosen from the 6-value enum; date is a free-text `<input>` (AC-22 tolerance). Rendered **only** inside the edit sheet, never on a card face. | AC-30, AC-31 |
| **7d** | `components/sheets/person-edit-sheet.tsx` | Add the 照片链接 input (AC-28) with absolute-URL validation; mount `<FamilyEventList>`; **fix AC-22**: `inputMode="numeric"` on the birth/death inputs (`:982`, `:996`) blocks Chinese input on iOS numeric keypads — change to `inputMode="text"` and raise `maxLength` from 12 so `约1950` / `1949-` are typeable; switch `SheetContent` to `side="responsive"`. | AC-22, AC-28, AC-30, AC-31, AC-15 |
| **7e** | `components/search/search-panel.tsx` (new) | **One** control: a single `<Input>` with filter chips rendered inside its trailing area — there is no second, separate filter box (AC-8). Results grouped by `RelationDistance` via `groupByRelationDistance`, with a 未连接 group for `null` distance (AC-9). Group labels: `d ≤ -2` 祖辈（上溯 N 代） / `d = -1` 父辈 / `d = 0` 同辈（我 · 配偶 · 兄弟姐妹） / `d = +1` 子辈 / `d ≥ +2` 孙辈（下延 N 代） / 未连接. Selecting a result sets `focusId` and scrolls: `document.getElementById('focus-card')?.scrollIntoView({ block: 'center', behavior: 'smooth' })` (AC-11). **Under-specification, recorded for the reviewer:** the spec writes `我(0)`, but with spouse edges weighted 0 the `d = 0` ring also contains 配偶 and 兄弟姐妹, so a literal "我" label would be wrong. Labelled 同辈 with 我 marked inside. Also `d ≤ -2` and `d ≥ +2` are given real labels rather than an ellipsis. | AC-8, AC-9, AC-11 |
| **7f** | `components/tree/tree-section.tsx` | Consume MeCard / RelativeCard / PersonAvatar; add `id="focus-card"` to the focus card for 7e's scroll target; keep the three connector `div`s and the `key={focusId}` `fade-node` remount (`:666`). | AC-11, AC-12, AC-13, AC-14 |
| **7g** | `components/layout/app-header.tsx` | Brand + search entry + ThemeCycleButton. Exactly 3 elements. | AC-6 |
| **7h** | `components/layout/app-footer.tsx` | `DataActionBar` (导出 / 导入 / 设置 / 清空) + 本机存储提示 + the **repair banner**: `const repairable = findRepairableLinks(state)` (which is `isUnambiguousBackfill` quantified over the graph, Step 2's predicate reused verbatim) → "发现 N 条可修复的双亲关系" + 修复 button calling `applyRepairs(state)`. Never automatic (P-2 mitigation 2). | AC-7 |
| **7i** | `lib/family/derive.ts` | `findRepairableLinks`, `applyRepairs`, and the BFS (see §3.6). | AC-9, AC-10 |

- **AC:** AC-8..AC-14, AC-22, AC-28..AC-31 + AC-32/34 re-verified.
- **Effort:** large — this is the bulk of the work. It **is** splittable, and 7a–7i are parallel-safe because the files are disjoint; `family-app.tsx` remains the single integrator.

### Phase E — Documentation and configuration (parallel-safe)

#### Step 8 · Docs, config, layout defects

| File | Change | AC |
|---|---|---|
| `CLAUDE.md` (new, ~150 lines) | Must contain: 项目定位 / 命令 / 文件地图 / **数据不变量** (关系双写对称 · 世代不落库 · STORAGE_KEY 变更须配迁移 · `sanitizeState` 是字段白名单) / **易踩的坑** (Tailwind 4 需 `@theme inline` 才能引用运行时变量 · 不可重定义基础 `--spacing` · `output: "export"` 无服务端能力 · `basePath` 构建期注入，硬编码绝对路径会 404 · `next lint` 在 Next 16 已不存在) / 设计约定 (玻璃参数不动 · 尺寸差 = 信息密度差 · 卡片宽度必须一致 · 暗色下 `--ink-faint` 仅用于非正文). | AC-24 |
| `.gitignore` | Append `.omc/`, `.remember/`, `.vercel/`, `*.log` (plus Step 0's `coverage/`, `playwright-report/`, `test-results/`). **Must not ignore `public/.nojekyll`** — verified currently tracked via `git ls-files public/.nojekyll` → `public/.nojekyll`. Do **not** add a blanket `public/` or `out`-style pattern that would shadow it. | AC-25, AC-26 |
| `README.md` | Add 照片外链 + 家族事件 to 功能; Apple Style / Liquid Glass 设计说明; the `Person` / `FamilyState` data-model sketch. | AC-27 |
| `app/layout.tsx` | Two incidental defects: (a) `:26` hardcodes the literal `"laotagong:theme"` — replace with the `THEME_STORAGE_KEY` constant from `lib/theme.ts:3`, which cannot be imported into an inline `<script>` string, so the fix is to *generate* the script string from the constant in the module scope (template literal) rather than duplicating the literal; (b) `:20` `themeColor: "#eef2f7"` is fixed-light — replace with a `Viewport` `themeColor` array carrying `{ media: "(prefers-color-scheme: light)", color: "#eef2f7" }` and `{ media: "(prefers-color-scheme: dark)", color: "#0b1220" }` so the status bar follows. Note this tracks **OS** preference, not the app's 3-way mode — the app's `light`/`dark` override cannot drive `themeColor` from a static export. Record that limitation in CLAUDE.md. | AC-34 (adjacent) |

### 3.6 · `getRelationDistances` — the BFS specification

Graph: undirected adjacency over `persons`, with **signed edge weights**.
- parent `P` ↔ child `C`: `P → C` weighs `+1`, `C → P` weighs `−1`.
- spouse `A` ↔ `B`: weighs `0` both ways.

Algorithm: BFS by **hop count** from `meId`; a node's distance is the sum of weights along its BFS parent chain, assigned on first visit. Neighbour iteration is **sorted by id** so traversal (and therefore every test) is deterministic. Unvisited nodes get `null` → the 未连接 group (AC-9).

Why hop-count BFS is correct enough: on a well-formed family graph the weights satisfy `w(path)` is path-independent for any two paths between the same nodes (it is a potential function). Contradictory cycles (e.g. A and B recorded as both spouses and parent/child) are malformed *data*, not an algorithm failure; the BFS result is then "distance along the shortest-hop path", which is well-defined and documented. Complexity `O(V+E)` — irrelevant at family scale.

`meId === null` ⇒ every person is 未连接. This is an explicit test case. **AC-9, AC-10**

### 3.7 · File-ownership table (normative)

| File / glob | Writer | Window |
|---|---|---|
| `package.json`, `pnpm-lock.yaml` | **1 agent, once** | Step 0 only; frozen after |
| `lib/family/**` | 1 agent | Steps 1-2; then 7i only |
| `app/globals.css` | **1 agent** | Step 3 only; **closed after** |
| `components/ui/sheet.tsx` | 1 agent | Step 4 |
| `components/family-app.tsx` | **1 agent** | Steps 5, 6, and integration in 7 |
| `components/cards/**`, `components/tree/**`, `components/search/**`, `components/sheets/**`, `components/common/**`, `components/layout/**`, `hooks/**` | **1 agent per file** | Step 6 (move) then Step 7 (redesign) |
| `CLAUDE.md`, `.gitignore`, `README.md`, `app/layout.tsx` | 1 agent each | Step 8 |

Any need to write outside your window is an escalation, not a judgement call. `app/globals.css` reopens are the P-3 trigger to watch.

---

## 4. Expanded Test Plan (DELIBERATE mode)

Starting state: **0 test files, 0 test runners.** `scripts/` is empty (`ls scripts/` → no entries).

### 4.1 Unit — `lib/family.ts` first, symmetry invariant highest-value

**Runner: vitest 5.** Justification against `node:test`:
- `node:test` has no TS path-alias resolution; the project uses `@/*` (`tsconfig.json:25-29`) everywhere. Testing via relative imports would break the convention; `node --experimental-strip-types` (default-on in Node 22.23) also cannot resolve `@/…` without a loader.
- The localStorage round-trip and `loadState`/`saveState` tests (`lib/family.ts:257-271`) need a real `window.localStorage` — `typeof window === "undefined"` guard at `:258` means plain Node returns the empty state and tests nothing. `node:test` has no DOM environment; hand-rolling `globalThis.window` does not exercise quota/string-coercion semantics. **vitest + `jsdom` does.**
- vitest is a devDependency only: it never enters `out/` and cannot interact with `output: "export"`.
- Cost: +1 devDep, ~15 lines of `vitest.config.ts`. Paid once, in Step 0.

**Test files and targets:**

| File | Covers | AC |
|---|---|---|
| `test/family.sanitize.test.ts` | round-trip key parity · unknown-key drop · `photoUrl`/`events` coercion · non-canonical years · v1 JSON load · 5-key `FamilyState` | AC-21, 22, 23, 10 |
| `test/family.links.test.ts` | **symmetry invariant as a property over ~12 fixtures** · AC-17 exact shape · no-overwrite · multi-spouse ambiguous · gender-unknown free-slot · removeSpouseLink preserves links · idempotence | AC-17, 18, 19, 20 |
| `test/family.derive.test.ts` | BFS distances on a hand-built 3-generation fixture · spouse = 0 · sibling = 0 · 祖辈 = -2 · disconnect → `null` · `meId === null` → all unconnected · determinism across 100 shuffles of `persons` insertion order | AC-9, 10 |
| `test/theme.test.ts` | `resolveTheme` / `loadThemeMode` / `saveThemeMode` round-trip under jsdom (`lib/theme.ts:15-29`) | AC-34 (adjacent) |
| `test/utils.test.ts` | `cn()` merge semantics (`lib/utils.ts`) | — |

### 4.2 Integration — no browser required

| Test | Method | AC |
|---|---|---|
| localStorage round-trip | jsdom `window.localStorage`; `saveState(s)` → `loadState()` deep-equals `sanitizeState(s)`; includes `photoUrl` + 3 `events` | AC-21, 23 |
| `sanitizeState` hostile input | `null`, `[]`, `"str"`, `{persons: null}`, `{persons: {x: 42}}`, cyclic-safe: never throws, always returns a valid `FamilyState` | AC-23 |
| referential integrity | `sanitizeState` drops a `parents` entry whose child or parent is missing (`lib/family.ts:219`), drops a spouse pair with a missing member (`:233`), dedupes pairs (`:234-237`), nulls a dangling `meId` (`:242-243`) — each asserted | AC-23 |
| **v1→v2 compatibility** | A raw literal of the **current** on-disk format (`birthYear: ""`, no `photoUrl`, no `events`) parses; all 10 original fields survive; `photoUrl === undefined`; `events === []`. Plus: a document carrying *forward-compatible junk* keys is accepted with junk dropped | AC-23 |
| **repair predicate** | Seed the broken shape through `importState('<raw JSON>')` — **not** through builder calls, because a fixture built by the new code cannot reproduce a load/write bug (P-2 mitigation 3) | AC-17 |
| **repair is conservative** | 2-spouse fixture yields **0** repairable findings — the assertion that proves we do not fabricate | AC-20, P4 |

### 4.3 E2E — Playwright (`@playwright/test` 1.63; the `playwright` MCP plugin is also available in this environment for interactive use)

Serve the real static artefact, not the dev server: `pnpm build && npx serve out -l 4173`. Run a second pass with `NEXT_PUBLIC_BASE_PATH=/laotagong` and serve `out/` under that prefix to reproduce a GitHub Pages project site.

| Spec file | Named test | Assertion | AC |
|---|---|---|---|
| **`e2e/bug-spouse-backfill.spec.ts`** | **`AC-17: 先加子女后加配偶，子女设为「我」后另一位亲长可见`** | Seed the exact AC-17 pre-state; add spouse B; set C as 我; assert B's card is in the DOM and B is reachable in the search panel under 父辈/母辈. Also assert `JSON.parse(localStorage['laotagong:family:v1']).parents[C].motherId === B`. | **AC-17** |
| `e2e/repair-banner.spec.ts` | `orphaned v1 data surfaces a repairable banner, and repair is explicit` | Seed broken v1 JSON; assert the banner reads `发现 1 条`; assert **no** mutation before the button is clicked; click; assert the link is written. | AC-17, P-2 |
| `e2e/shell.spec.ts` | `header and footer are full-bleed at 1440px` · `375px has no horizontal scroll` | `header`/`footer` `getBoundingClientRect().width === innerWidth`; `documentElement.scrollWidth <= clientWidth`; header has exactly 3 controls; no data action is inside `header`. | AC-5, 6, 7, 32 |
| `e2e/sheet.spec.ts` | `at 375px the edit sheet is bottom-anchored` · `at 1440px it is centred` · `long content scrolls, never clips` | bottom: content box `bottom ≈ innerHeight` and `borderTopLeftRadius === 28px`; centred: `|centerX − innerWidth/2| < 2` and `|centerY − innerHeight/2| < 2`; overflow: with a 12-event person, the sheet's scroll container `scrollHeight > clientHeight` and the 保存 button remains reachable. | AC-15, 16 |
| `e2e/search.spec.ts` | `one input drives both search and filter` · `results group by relation distance` | Assert exactly **one** `input` in the panel with ≥3 chips inside it (not a sibling filter box); assert group headers appear in the order 祖辈/父辈/同辈/子辈/孙辈/未连接; assert an isolated person lands in 未连接. | AC-8, 9, 10, 11 |
| `e2e/cards.spec.ts` | `MeCard shows all six fields, RelativeCard shows three` · `all card widths are equal` · `connector anchors are aligned` | MeCard text includes 籍贯/户籍/备注; RelativeCard does not. Every card in a grid row has identical `offsetWidth`. Connector `div` centres are within 1px of the corresponding card-column centre across a 2-generation fixture. | AC-12, 13, 14 |
| `e2e/photo.spec.ts` | `a broken photoUrl falls back without a broken-image glyph` | Point `photoUrl` at a 404 origin; assert **no** `<img>` remains in the avatar slot and the initial-letter fallback is rendered. | AC-28, 29 |
| `e2e/events.spec.ts` | `family events are editable in the sheet and absent from the card face` | Add/edit/delete an event; then assert the event text appears **nowhere** inside any `[data-card]` node. | AC-30, 31 |
| `e2e/export.spec.ts` | `exported JSON contains photoUrl and events` | Intercept the download; parse; assert both fields present — the end-to-end proof against P-1. | AC-21 |
| `e2e/visual-freeze.spec.ts` | `DOM hash matches the pre-split baseline` | Seed the same fixture, `innerText`-normalise `document.body.innerHTML`, SHA-256. Recorded before Step 6; compared after. | Step 6 exit gate |
| `e2e/basepath.spec.ts` | `no 404s at the project-site path` | Build with `NEXT_PUBLIC_BASE_PATH=/laotagong`; assert every network response is `< 400`; assert the external `photoUrl` is requested **without** the basePath prefix. | AC-33 |
| `e2e/theme.spec.ts` | `every new surface renders in both themes` | Screenshot the header/main/footer/search-panel/edit-sheet at both `applyTheme` values; assert no element computed `color` equals its composited `background-color`. | AC-34 |

### 4.4 Observability / manual verification — and how to make it cheap

**Automate what can be automated; the rest gets a checklist, not a vibe.**

1. **`scripts/check-contrast.mjs`** (new; wired to `pnpm check:contrast`). **Parses the CSS custom properties out of `app/globals.css` at runtime** — so it cannot drift from the real tokens — then models the worst-case composite (each of the 3 page-gradient stops × each of the 3 orbs × `--glass` alpha × `.glass-card`'s `backdrop-filter`) and asserts `≥4.5` for every content tier in both themes. Exits non-zero on failure. **This is the machine check for AC-4.** It replaces hand-computed values.

   Caveat to state honestly: the model does **not** simulate `saturate(170%)` (`globals.css:186`), which pushes the backdrop away from neutral and therefore makes the real ratio slightly *worse* than modelled. That is why §3 Step 3's chosen alphas carry margin (5.35 / 4.87 vs the 4.5 floor) rather than sitting on it.

2. **What a human must actually eyeball (3 items, ~5 minutes total).**
   - **AC-4, two spots, two themes.** Light: the 生卒年 caption on a card overlapping `--orb-1` (top-left of the tree, where the cyan orb sits at `globals.css:114-120`). Dark: the same spot. Browser DevTools' contrast checker reading, screenshot attached to the PR. These are the *only* two spots where the worst case is reachable in the default layout.
   - **AC-13, connector alignment.** Resize 375 → 768 → 1024 → 1440 and confirm the three `.connector` rules (`family-app.tsx:690, 710, 757`) stay visually centred under the card columns. 30 seconds per breakpoint. Cheap because the connectors are container-centred, not card-height-dependent — if this ever fails, the cause is a `grid-cols` change, not a card change, which localises the bug immediately.
   - **AC-15, the 1024px boundary.** Open the edit sheet at 1023px and 1025px and confirm the form changes from bottom-anchored to centred. Deliberately placed *just* off the documented breakpoint, since spec risk #5 (line 344) flags 1024 as unvalidated.

3. **Not worth automating, and the plan says so:** AC-1 (glass parameters unchanged) is verified by `git diff app/globals.css` showing `blur(28px) saturate(170%)`, the `125deg` `::before`, and all three `.ambient span` rules untouched — a diff against a known-good baseline is cheaper and more reliable than any pixel test. AC-3's 8px grid is verified by `check:contrast`'s sibling grep over `p-`/`gap-`/`mb-` on the `@theme` named tokens.

---

## 5. Risks and Mitigations

| # | Risk | Likelihood | Impact | Concrete mitigation |
|---|---|---|---|---|
| R1 | `sanitizeState`'s white-list silently drops `photoUrl`/`events` on read (**P-1**) | **High** — it is the default behaviour of `lib/family.ts:196-210` | **Severe** — silent loss of the headline feature | Collapse to one `normalizePerson` (Step 1) + round-trip key-parity test as a hard gate before Step 7d starts |
| R2 | The Bug is fixed for new data only; existing broken rows stay broken (**P-2**) | **High** — write-path-only fixes are the default outcome | High — user concludes the fix failed | `isUnambiguousBackfill` shared by write path and detector; detector surfaces an explicit banner; repair test seeds through `importState` |
| R3 | Auto-repair fabricates a parent in the multi-spouse case | Medium if auto-repair is attempted | **Severe** — silently wrong genealogy | No auto-repair on load, by construction (P4). Detector is exactly-one-spouse only. Test asserts **0** findings on a 2-spouse fixture |
| R4 | `pnpm-lock.yaml` / `globals.css` / `family-app.tsx` contention (**P-3**) | **High** with >1 agent | High — unmergeable conflicts | §3.7 ownership table; Step 0 is the only lockfile writer; `globals.css` closed after Step 3 |
| R5 | `@theme` written **without** `inline` → semantic utilities resolve to the wrong value and dark mode breaks subtly | Medium — the `inline` keyword is easy to omit and fails silently | High — visual-only failure, invisible to `tsc` and to `pnpm build` | `inline` mandated in Step 3; Playwright `theme.spec.ts` asserts rendering in **both** themes, which is the only thing that catches it |
| R6 | Redefining base `--spacing` rescales every existing numeric utility | Medium — it reads like the "right" way to build an 8px grid | **Severe** — whole-app reflow, misread as a redesign regression | Explicit prohibition in Step 3; §3.7 keeps `globals.css` single-writer; `out/index.html` hash check catches layout shift before the visual-freeze test |
| R7 | `@theme` + `@custom-variant dark` half-migrated | Medium | Medium — a third theming mechanism emerges | `dark:` documented as fallback-only in CLAUDE.md; Step 3 is a single atomic commit; AC-34 Playwright pass |
| R8 | Deleting `lib/family.ts` breaks a call site missed by the barrel | Low — the barrel makes it a pure move | Medium — build failure | `pnpm build` after every move; `pnpm test` covers the public surface |
| R9 | `photoUrl` pasted as a site-relative path 404s under the project site | Medium — `/photos/x.jpg` looks valid in dev | Medium — broken avatar, and AC-29's fallback would hide it, masking the cause | Validate `http(s)://` on save with an inline hint (Step 7b); `basepath.spec.ts` asserts the external URL is not prefixed |
| R10 | `waitForLoadState`-style E2E flake from `fade-node`/`me-pulse` animations (`globals.css:312-339`) | Medium | Low — noise, erodes trust in the suite | `page.emulateMedia({ reducedMotion: 'reduce' })` and assert on geometry + text, never on opacity |
| R11 | `next lint` is dead (`package.json:12`, no `next-lint.js` in Next 16.3.4) | **Certain** | Low — a false sense of a quality gate | Recorded in CLAUDE.md (Step 8); no step in this plan gates on `pnpm lint` |
| R12 | `themeColor` cannot follow the app's 3-way mode from a static export (only OS preference) | **Certain** | Low | `Viewport.themeColor` media-array (Step 8) + the limitation documented rather than silently half-fixed |
| R13 | 1024px breakpoint is unvalidated (spec risk #5, line 344) | Medium | Low — one CSS number | Step 4 implements it as a single `lg:` token; the manual check is deliberately at 1023/1025 |
| R14 | Four stacked `backdrop-filter` layers cost frames on low-end mobile (spec risk #4, line 342) | Medium | Medium | Out of scope to weaken glass (spec Non-Goal, line 85). Instrument: Playwright `page.evaluate` frame-timing on the tree while scrolling; if p95 frame > 32ms, escalate glass strength as the first lever, as the spec pre-authorises |

---

## 6. Verification Steps

Concrete commands. Every AC maps to at least one line. No vague terms.

**Build gate (run after every step):**
```bash
cd /d/XiaomiMiMoProjects/laotagong && pnpm build            # exit 0, out/ regenerated
```

| AC | Verification | Command / check |
|---|---|---|
| AC-1 | Glass parameters byte-identical | `git diff app/globals.css` shows no change to `blur(28px) saturate(170%)` (line 186), the `125deg` `::before` (line 201-206), or the three `.ambient span` rules (lines 114-138) |
| AC-2 | 5-level scale; h1 28/34; body ≥13px | `grep -cE '^\s*--text-[a-z]+:' app/globals.css` = **5**; E2E `getComputedStyle(h1).fontSize` = `28px`@375, `34px`@1280; `fontWeight` = `600`; `letterSpacing` = `-0.56px`@28px / `-0.68px`@34px (−0.02em × 28/34); **`grep -rn "text-\[1[0-2]px\]" components/` must drop from 9 → 4** (the 4 remaining are badge/pill chrome: `我` pills and the role pill, which are UI affordances not 正文) |
| AC-3 | 8px grid, card pad ≥16, block gap ≥32 | `p-card` → `16px`; `gap-section` / `mb-section` → `32px`; `grep -cE '^\s*--spacing-' app/globals.css` = **2** (`--spacing-card`, `--spacing-section`); **`grep -cE '^\s*--spacing:' app/globals.css` = 0** — the base `--spacing` is never redefined |
| AC-4 | AA ≥4.5 both themes | `pnpm check:contrast` exit 0; plus the 2-spot DevTools reading (§4.4 item 2) |
| AC-5 | header/footer 100% width | `e2e/shell.spec.ts`: `header.getBoundingClientRect().width === innerWidth` at 375 and 1440; main container `maxWidth` ∈ {768, 1024} |
| AC-6 | Header = exactly 3 elements | `e2e/shell.spec.ts`: `header button, header [role=button], header a` → length 3 |
| AC-7 | No data action in Header | `e2e/shell.spec.ts`: `header` contains no 导出/导入/设置/清空 text; all four present in `footer` |
| AC-8 | Search + filter unified | `e2e/search.spec.ts`: exactly one `input` inside the panel; ≥3 chips are descendants of that input's wrapper, not siblings of a separate filter row |
| AC-9 | Grouped by relation distance | `e2e/search.spec.ts`: group headers appear in order 祖辈/父辈/同辈/子辈/孙辈/未连接; an isolated fixture person is under 未连接 |
| AC-10 | No persisted generation | `test/family.sanitize.test.ts`: `Object.keys(createEmptyState())` deep-equals `["version","persons","parents","spouses","meId"]`; `grep -rn "{ generation\|generation:" lib/ components/` → 0 |
| AC-11 | Selecting a result focuses + scrolls | `e2e/search.spec.ts`: click a result → `#focus-card` is in the viewport (`boundingBox` within `[0, innerHeight]`) and the breadcrumb name matches |
| AC-12 | MeCard 6 fields, RelativeCard 3 | `e2e/cards.spec.ts`: for `[data-card=me]`, innerText contains 籍贯/户籍/备注/生卒; for `[data-card=relative]` it contains name + years only |
| AC-13 | Equal widths, aligned anchors | `e2e/cards.spec.ts`: all `offsetWidth` in a grid row equal; each `.connector` centre within **1px** of its column centre across a 2-generation fixture at 375/768/1024/1440 |
| AC-14 | 56px / 36px avatars, fallback | `e2e/cards.spec.ts`: `offsetWidth` = 56 for the 我 avatar, 36 for relatives; with no `photoUrl`, the element renders `person.name[0]` |
| AC-15 | Sheet form at 1024px | `e2e/sheet.spec.ts` at 375/1023/1025/1440 (§4.3) |
| AC-16 | No clipping; scrolls | `e2e/sheet.spec.ts`: with a 12-event person, scroll container `scrollHeight > clientHeight`; 保存 still clickable |
| **AC-17** | **Bug fixed** | `e2e/bug-spouse-backfill.spec.ts` → **`AC-17: 先加子女后加配偶，子女设为「我」后另一位亲长可见`**; plus `test/family.links.test.ts` case 2 asserting `parents[C].motherId === B` from a seeded raw JSON |
| AC-18 | Symmetric writes | `test/family.links.test.ts` case 1 (invariant over ~12 fixtures); `grep -rn "parents:" components/ hooks/` → **0 hits** |
| AC-19 | `removeSpouseLink` semantics defined + tested | `test/family.links.test.ts` case 7 asserts parent links **survive**; the rule is written in `CLAUDE.md` |
| AC-20 | Multi-spouse defined, not silent | `test/family.links.test.ts` case 5 asserts `ambiguous.length === 1` and **no** parent bound; the UI (Step 7) renders the picker; E2E asserts the picker appears |
| AC-21 | `photoUrl` + `events` exist | `test/family.sanitize.test.ts` cases 1-4; `grep -n "photoUrl\|FamilyEvent" lib/family/types.ts` ≥3 |
| AC-22 | Non-canonical dates tolerated | `test/family.sanitize.test.ts` case 5: `"约1950"`, `"?"`, `"1949-"` round-trip byte-identical; `grep -c 'inputMode="numeric"' components/sheets/person-edit-sheet.tsx` = **0** |
| AC-23 | Migration policy honoured | `test/family.sanitize.test.ts` case 6 (raw current-format v1 loads without loss); `grep -n 'STORAGE_KEY' lib/family/types.ts` = `"laotagong:family:v1"` unchanged; the "why no key bump" reasoning is in `CLAUDE.md` |
| AC-24 | CLAUDE.md complete | `wc -l CLAUDE.md` ∈ [120, 180]; contains all four required sections (`grep -c` for 项目定位/命令/文件地图/数据不变量/易踩的坑/设计约定 = 6) |
| AC-25 | .gitignore additions | `grep -c '\.omc/\|\.remember/\|\.vercel/\|\*\.log' .gitignore` ≥ 4 |
| AC-26 | `.nojekyll` not ignored | `git check-ignore -v public/.nojekyll` → exit **1** (not ignored); `git ls-files public/.nojekyll` → prints the path |
| AC-27 | README updated | `grep -c '照片\|家族事件\|Apple Style\|Liquid Glass' README.md` ≥ 4 |
| AC-28 | Photo URL input → immediate update | `e2e/photo.spec.ts`: enter an absolute URL → the avatar's `<img src>` matches within one paint |
| AC-29 | Failed load → graceful fallback | `e2e/photo.spec.ts`: 404 origin → **no `<img>` remains**, initial-letter fallback rendered |
| AC-30 | Events CRUD in the sheet | `e2e/events.spec.ts`: add → appears; edit → text changes; delete → removed |
| AC-31 | Events absent from card faces | `e2e/events.spec.ts`: `document.querySelectorAll('[data-card]')` innerText contains no event text |
| AC-32 | No horizontal scroll at 375px | `e2e/shell.spec.ts`: `documentElement.scrollWidth <= clientWidth` at 375×667, checked on every route state (empty / tree / search open / sheet open) |
| AC-33 | Build + no 404 at the project path | `NEXT_PUBLIC_BASE_PATH=/laotagong pnpm build` exit 0; `e2e/basepath.spec.ts` asserts every response `< 400` |
| AC-34 | Both themes render | `pnpm test` (`test/theme.test.ts`) + `e2e/theme.spec.ts` screenshot pass in light and dark |

**Full gate before declaring done:**
```bash
cd /d/XiaomiMiMoProjects/laotagong
pnpm install --frozen-lockfile     # proves the lockfile was written once and is stable
pnpm build                         # AC-33
pnpm test                          # unit + integration
pnpm check:contrast                # AC-4
pnpm e2e                           # AC-5..AC-17, AC-28..AC-34
NEXT_PUBLIC_BASE_PATH=/laotagong pnpm build && pnpm e2e   # AC-33 under project-site prefix
git diff --stat main..HEAD -- app/globals.css    # AC-1: glass block untouched
```

**Effort honesty.** Phase A (Steps 0-2) is the highest-value and lowest-risk third. Phase B (Steps 3-5) is shared-surface work that must be serial. Step 6 is mechanical but **cannot be parallelised** and must not be attempted concurrently. Phase D (Step 7) is the largest block by wall-clock and is the only genuinely parallelisable phase. Phase E is small and independent.

---

## Appendix · Open items for the reviewer

1. **`d = 0` group label.** The spec writes `我(0)` (AC-9), but with spouse edges weighted 0 the ring also holds 配偶 and 兄弟姐妹. The plan labels it **同辈** with 我 marked inside. This is a refinement of an under-specification, not a re-litigation of a settled decision — flagging it for confirmation.
2. **`--ink-faint` tier collapse in dark mode.** Forced by AA over the cyan orb (worst case 4.87 at the best available alpha). The plan absorbs it into AC-2's scale-based hierarchy. If the reviewer prefers a visually distinct fourth grey, the only alternatives are weakening the dark orbs or a scrim — both barred by the spec's glass constraint.
3. **Repair banner is beyond the letter of the ACs.** AC-17 does not require it. It is included because without it, pre-existing broken data has no discoverable fix path, which is P-2. Cheap (~30 lines + one pure function) and it reuses Step 2's predicate verbatim. Cuttable if scope is tight — the cost of cutting is that P-2 becomes a live user-visible bug.
4. **`pnpm lint` is non-functional** on Next 16.3.4. Out of scope to fix here; recorded so no verification step depends on it.
