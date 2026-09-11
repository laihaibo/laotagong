# Consensus Plan: 老太公 · 家族图谱 Apple Style 重构

> **Status: `pending approval`** — 本计划由 deep-interview spec（歧义度 19%，34 条 AC）经 RALPLAN-DR **deliberate** 模式两轮共识精炼产出。
> 共识路径：Planner 迭代 1（517 行）→ Architect 评审（REJECT 级发现：P1/P4 原则违反）+ Critic 独立评审（REJECTED，9 项阻塞缺陷）→ Planner 迭代 2 修复全部 9 项 + 13 项非阻塞项 → Orchestrator 定点验证通过（critic-2 随会话中断丢失，由主会话抽查 B1/B5/B8/B9 关键裁决点替代，验证深度已在下方标注）。

## ADR (Architecture Decision Record)

### Decision
按 **9 阶段串行主干 + 3 层并行 DAG（Step 7a–7k）** 执行：测试脚手架先行（Step 0/0b）→ 数据层修复与对称化（Step 1–2）→ token 层 + 字阶迁移原子落地（Step 3+3b，同 agent 同 landing，前置于拆分）→ 弹窗响应式（Step 4）→ 布局骨架（Step 5）→ 巨石文件拆分至目标边界（Step 6，拆 6a 纯移动 / 6b hook 抽取两段契约）→ 逐文件重设计（Step 7）→ 文档（Step 8）。

### Drivers
1. **Bug 是数据完整性 bug，不是 UI bug** —— AC-17/18/19/20 全在纯函数层，必须先修并证明，再动像素。
2. **1277 行巨石文件是单写者瓶颈** —— 拆分完成前不存在真正的并行。
3. **零测试基础设施** —— harness 是 Driver 1/2 的唯一回归防护，且必须接入 CI 才算数。

### Alternatives Considered
| 决策 | 选定 | 被否决 |
|---|---|---|
| D1 执行顺序 | O1-C 直接拆至目标边界（6a/6b 两段契约） | O1-A 先拆后设计（边界会被重设计摧毁，1277 行碰两遍）；O1-B 原地重设计（巨石全程是争夺焦点，无 oracle） |
| D2 token 层 | `@theme inline` + `--text-*: initial` + `@custom-variant dark`；玻璃材质留在任意值 | 纯任意值语法（AC-2/3 无强制机制）；全量语义化迁移（三套颜色机制并存更糟） |
| D3 弹窗动画 | `tw-animate-css`（零类字符串改动） | 手写 keyframes（~60 行 + 永久维护 Radix 状态机）；放弃动画（违背 AC-15 前提） |

### Why Chosen
- **D1**：评审证明 O1-C 原形态声称的 per-file oracle 与提前并行**都不存在**（visual-freeze 是累积基线、Step 6 串行），故拆 6a（13 纯移动，逐文件比对固定 id 基线）/6b（hook 抽取，明写 refactor + 行为 oracle），让 O1-C 真正拿到它声称的优势。
- **D2**：AC-2 的 13px 下限靠 `--text-*: initial` 成为硬门（`@theme` 只增不删已本地编译验证）；`initial` 必须**第一行**（否则清掉自定义档位）；3b 必须前置于 Step 6，否则 verbatim oracle 失效。
- **D3**：本地下载 dist 验证 bare 类与 `--tw-duration` 链路完整成立，「零改动」断言为真。

### Consequences
- ✅ 34 条 AC 每条有具名验证手段；每步 `pnpm build` 绿（3+3b 原子 landing 为**显式声明的唯一例外**）
- ✅ CI 接入 `verify`（unit + contrast 漂移守卫）与 `e2e`（Playwright 缓存）job，`--frozen-lockfile`
- ✅ AC-3 **部分满足**并记录原因（`--spacing` 重定义判 Severe，8px 网格不追溯既有工具类）
- ⚠️ `applyRepairs` **可恢复但不可撤销**（无历史日志；真 undo 属新范围）
- ⚠️ 深色模式 `--ink-faint` tier collapse（AA 逼出的收敛），层级表达转移至字阶
- ⚠️ 验证深度标注：迭代 2 未经第二轮 Architect+Critic 全量评审（用户要求加速，改为定点抽查）；critic-2 定点验证随会话中断丢失，由 orchestrator 抽查替代

### Follow-ups（批准时需一并决定）
1. `package.json` 工作区已删 `packageManager: pnpm@9.15.9`（非本会话所为）——**建议提交**（CI `deploy.yml:24-27` 自带 pnpm 9 pin，不依赖该字段；本机 pnpm 11.22.0 需要删除才正常）。Step 0 是 `package.json` 唯一写者，脏文件无法开工。
2. Appendix 5 项开放项的默认取向：`d=0` 标「同辈」；AC-3 记部分满足；修复提示条**保留**（裁掉会让 P4 的 ambiguous 处理不可达）；`applyRepairs` 不做真 undo。

---

# Implementation Plan v2 — 老太公 · 家族图谱 Apple Style 重构

> RALPLAN-DR · **DELIBERATE** mode · Iteration 2 (Planner revision)
> Supersedes: `.omc/drafts/consensus-laotagong-redesign-draft.md` (iteration 1, REJECTED with 9 blocking defects)
> Spec: `.omc/specs/deep-interview-laotagong-redesign.md` (34 AC, ambiguity 19%, PASSED)
> Repo: `D:\XiaomiMiMoProjects\laotagong` · Next 16.3.4 (App Router, `output: "export"`) · React 19 · TS 5.9 strict · Tailwind 4.1.14 · pnpm 11.22 · Node 22.23

**Revision doctrine.** The iteration-1 rejection had one root cause, named five times: *verification steps were decoupled from what they claimed to verify.* Every fix in v2 was re-checked against this test — **would this gate return green on an implementation that violates the AC it guards?** Where the answer was yes, the gate was replaced, not reworded. Three gates were deleted outright rather than repaired (B4, and the two vacuous selectors in B8/B9).

---

## 1. RALPLAN-DR Summary (DELIBERATE mode)

### 1.1 Principles (invariants this plan must not violate)

| # | Principle | Why it is an invariant | Enforcement (revised) |
|---|-----------|------------------------|-------------|
| **P1** | **双写对称 (Link Symmetry)** — every write to `state.parents` goes through `addParentLink`; every write to `state.spouses` goes through `addSpouseLink`/`removeSpouseLink`. No call site may write either key with an object/array literal. | The Bug exists because one path knew about the other side and four did not. Verified: **2** `parents:` object literals in `components/family-app.tsx` (`:162` inside `handleAddRelation`, `:199` inside `handleLinkExistingAsParent`) plus **4** add/link call sites (`:171`, `:174`, `:187`, `:216`) and **1** removal call site (`:226`). | `grep -rn "parents: {" components/ hooks/` returns **0** (from 2). Structural: `addParentLink` (`lib/family/links.ts`) is the only function in the codebase that constructs a `parents` value; it is the single named target of the grep. |
| **P2** | **世代不落库 (No persisted generation)** | Spec constraint (spec line 69). `--store` must never gain a `generation`/`depth` field; relation distance is recomputed from `meId` on every render. | Type-level: `FamilyState` has exactly 5 keys. Test asserts `Object.keys(createEmptyState())` deep-equals `["version","persons","parents","spouses","meId"]`. **Added:** the localStorage **key set** is asserted too (`e2e/key-hygiene.spec.ts`) — repair-banner dismissal state is **memory-only** and must never become a 6th persisted key (see §1.3 P2-hole). |
| **P3** | **单一字段真相 (One field list, one place)** | The Bug that drops `photoUrl`/`events` is possible *only* because the Person field list is duplicated today (`lib/family.ts:40-54` `createPerson` vs `:196-210` `sanitizeState`). | `normalizePerson` lives in **`lib/family/normalize.ts` alone**; `createPerson` (`model.ts`) and `sanitizeState` (`sanitize.ts`) both call it. **Structural gate:** `normalize.ts` is the only file permitted to enumerate `Person` field names in an object literal — asserted by the P-1 drift grep in §2 P-1, which is scoped to catch real drift instead of the intended single list. |
| **P4** | **模糊即询问，不猜测 (Never fabricate a relation) — *backfill only on unambiguous evidence, and it must be auditable and opt-in*** | Rewritten from iteration 1, which narrowed the principle in its own execution column while the step list violated it. This is a *family archive*: a guessed parent link is silently wrong and indistinguishable from a right one. **Declared exception (was hidden):** `addSpouseLink` DOES backfill `C.motherId := B`, and AC-17 *requires* it. That is not a guess when it is gated on exactly-one-spouse evidence. The exception is now stated here, gated, surfaced, and tested — not buried in a step. | Every link function returns `LinkResult { state, applied[], ambiguous[] }`. **Zero automatic repair, ever** — the detector only *surfaces*, the user clicks 修复. `applied[]` is rendered in a toast and in the repair banner. **Auditability:** the repair writes exactly one empty parent slot per finding and the finding remains re-derivable from the data. **Reversibility (honest scope):** true undo would require a history log, which this plan does not build — instead AC-19's semantics guarantee the 解除配偶 path leaves parent links intact, and the 关联已有 picker (7j) lets a user overwrite a disagreeable slot. That is *recoverable*, not *undoable*; the distinction is recorded in CLAUDE.md rather than papered over. |
| **P5** | **移动端为基准，桌面端只放大不改结构** | Spec constraint (line 60) + Round 10. Breakpoint change must be expressible in CSS alone, never in JS — no hydration mismatch, no resize listener. | AC-15 implemented as `lg:` utility overrides in `sheet.tsx`, not `useMediaQuery`. Playwright asserts 375/1023/1025/1440. **Edge fixed (iteration-1 defect):** `sheet.tsx:41` already carries `sm:max-w-lg` (512px); adding `lg:max-w-md` (448px) would make 768–1023px *wider* than ≥1024px — the opposite of "desktop only enlarges". v2 sets `sm:max-w-md` and drops `sm:max-w-lg`, so width is monotonic (375 → 448 → 448). |

### 1.2 Decision Drivers (top 3)

1. **The Bug is a data-integrity bug, not a UI bug.** AC-17/18/19/20 all live in `lib/family.ts`, which is already UI-free and pure. It must be fixed and *proven* before any pixel changes, because every UI change afterwards would otherwise be built on an unverified model. This driver alone forces "data layer first".
2. **`components/family-app.tsx` (1277 lines) is a single-writer bottleneck.** Every redesign task touches it. Concurrency only exists after it is dismantled. This driver forces "split before parallel redesign, and split to *target* boundaries, not intermediate ones".
3. **The project has zero tests, zero test infrastructure, and CI that runs neither.** `deploy.yml` has no test step at all (verified: 68 lines, `build` job = checkout → pnpm → node → install → detect base path → build → upload). AC-17's symmetry invariant regressed silently once already. The test harness is a *prerequisite*, and Driver 3 is only meaningful if the harness **actually runs in the pipeline** — otherwise it is a local ritual, which is exactly what iteration 1's plan was. **v2 adds the CI jobs (B2).** It is also the only artifact that mutates `pnpm-lock.yaml`, so it lands once, first, by one writer.

### 1.3 Viable Options — the three contested decisions

#### D1 · Execution ordering

| Option | Pros | Cons |
|---|---|---|
| **O1-A: Split first (verbatim), then redesign** | The split has a hard oracle: a verbatim move must produce byte-identical DOM. Parallelism unlocks immediately. | Invents boundaries the redesign destroys. A naive split makes `components/cards/person-card.tsx` — which AC-12 immediately splits into `MeCard`/`RelativeCard`. You touch 1277 lines twice. |
| **O1-B: Redesign in place, then split** | No wasted boundaries. | `family-app.tsx` stays 1277 lines through 100% of the risk. Every task conflicts with every other task. Diff is unreviewable. No oracle is possible because behaviour changed intentionally. **Rejected.** |
| **O1-C ★ SPLIT DIRECTLY TO TARGET BOUNDARIES, PER-FILE `move → redesign`** | No wasted work: every new file is a target file from the spec's Ontology table. Each file still gets a verbatim-move commit with the DOM oracle, then a redesign commit. Parallelism is per-file. | Requires discipline: the first commit touching each new file must be a pure move. One exception: `person-card.tsx` is created verbatim in the move and split in the redesign (≈10 min of rework, accepted). |
| **O1-D: Interleave freely (split+redesign in one pass per component)** | Fastest wall-clock for one writer. | Destroys the move oracle entirely; a regression in a 200-line diff is invisible. Subsumed by O1-C. **Rejected.** |

**Decision: O1-C**, sequenced as *foundation (serial, single writer) → token landing (serial, single writer, Steps 3+3b as one landing) → per-file move (serial) → per-file redesign (layered DAG) → integration (single writer) → docs (parallel)*. O1-A invalidated because its boundaries are not the spec's boundaries; O1-B invalidated because it maximizes contention on the project's largest file for the project's entire duration.

#### D2 · Token layer strategy

| Option | Pros | Cons |
|---|---|---|
| **O2-A: Keep `text-[var(--ink)]` arbitrary values everywhere; add nothing** | Zero new failure modes. Theme correctness is automatic (var flips). AC-34 passes by construction. | AC-2 requires a **5-level type scale** and AC-3 an **8px grid** enforced across ~10 new files. Arbitrary values make each new file re-invent `text-[28px]` / `p-[16px]`; the scale drifts within one sprint and nothing detects it. There is no mechanism for a *named, shared* scale. |
| **O2-B ★ `@theme inline` mapping existing vars → semantic tokens, plus `@custom-variant dark`, plus `--text-*: initial`** | The only Tailwind-4 mechanism that makes AC-2/AC-3 *enforceable*: `text-title`/`text-display`/`p-card`/`gap-section` are single-source-of-truth and cannot drift across files. Also gives every parallel writer a local `dark:` escape hatch instead of editing the shared `globals.css`. **`--text-*: initial` is what makes AC-2 a hard gate rather than an aspiration** (B5). | One extra landing step (3b) migrating 37 existing type-scale occurrences. Risk of half-migration — mitigated by making 3+3b an atomic landing. |
| **O2-C: `@theme` for scale only (typography + spacing), no colour mapping, no `dark:` variant** | Enforceable scale, zero theming risk. | Leaves the `text-[var(--ink)]` noise and gives parallel writers no escape hatch — they will add new `.dark X {}` rules to `globals.css`, which is exactly the shared-file contention we are trying to avoid. |

**Decision: O2-B, scoped.** Map **only** semantic + scale namespaces; do **not** map the glass materials (`--glass*` stay arbitrary-value — glass is deliberately non-semantic). Mandatory constraints:

- **`@theme inline`** — kept, for the *correct* reason. Iteration 1 justified it with "non-inline silently mis-resolves runtime vars", which is not true *here*: `:root` and `.dark` land on the **same element** (`app/layout.tsx:43` `<html className="light">` + `lib/theme.ts:32-33` `root.classList.add(...)`). Non-inline would work in this repo. `inline` is chosen because it has the clearest semantics and does not depend on the implicit premise ".dark must be on `<html>`" — a premise `applyTheme` could break with one edit. **The false claim is dropped.**
- **`--text-*: initial;` as the FIRST declaration inside `@theme`** — the namespace reset. Without it, `.text-xs{font-size:var(--text-xs)}` keeps generating at 12px and AC-2's floor is violated while every gate stays green (B5). Order matters: `initial` must precede our `--text-caption`/`--text-body`/… declarations, or it clears them too (the wildcard matches both `--text-xs` and its `--text-*--line-height` companion).
- **Never redefine `--spacing`** (base). Verified `node_modules/tailwindcss/theme.css:325` → `--spacing: 0.25rem`. Redefining it re-scales every numeric utility (`p-3`, `gap-3`, `h-5`, `w-10`, `space-y-4`, `inset-x-0`) and silently reflows the whole app. Add *named* spacing only (`--spacing-card`, `--spacing-section`). **Iteration 1's example was wrong:** `max-w-3xl` belongs to the `--container-*` namespace and is unaffected by `--spacing`; it has been removed from the rationale.
- `@custom-variant dark (&:where(.dark, .dark *))` — matches `lib/theme.ts:31-36` `applyTheme()`. This **presupposes** the self-built theme system; it does not replace it. Non-goal "不引入 next-themes" is respected.
- Convention recorded in `CLAUDE.md`: *prefer CSS-var tokens; use `dark:` only when no token exists.*

O2-A invalidated by AC-2/AC-3 (no enforcement mechanism). O2-C invalidated because it inverts the contention problem rather than solving it.

#### D3 · The `sheet.tsx` dead-animation problem

`components/ui/sheet.tsx:20,41,43` use `animate-in` / `fade-in-0` / `slide-in-from-bottom` / `zoom-in-95`, but `package.json:24-31` has no `tw-animate-css` and `app/globals.css:1` has no `@plugin`/`@import` for it. **These classes generate no CSS.** All three sheets are currently animation-dead.

| Option | Pros | Cons |
|---|---|---|
| **O3-A ★ `pnpm add -D tw-animate-css` + `@import "tw-animate-css";` in `globals.css`** | **Zero edits to the existing class strings** — the classes at `sheet.tsx:20,41,43` start working as written. `npm view tw-animate-css version` → 1.4.0, "TailwindCSS v4.0 compatible replacement for `tailwindcss-animate`" — the canonical Tailwind-4 package. The spec pre-blesses this (spec line 347): "若按 AC-15 改动弹窗，顺手装包即可修复". | +1 devDependency; ~15KB CSS into `out/`; **mutates `pnpm-lock.yaml`** — the highest-conflict file in the repo. |
| **O3-B Hand-write keyframes in `globals.css`** | No dependency. | Must reimplement four utilities plus the Radix `data-[state=open\|closed]` state machine — ≈60 lines of CSS we then own forever. Only wins if the dependency itself is objectionable, which nothing in the spec says. |
| **O3-C Drop animations entirely** | Zero cost. | Deletes classes from `sheet.tsx` (more churn, not less), and contradicts AC-15's whole point. A sheet that teleports in is not "Apple Style". |

**Decision: O3-A**, with the hard process rule that it happens **exactly once, in Step 0, by one writer**, together with the test-runner dependencies — so `pnpm-lock.yaml` is written once and then frozen.

#### P2-hole closed · where does repair-banner dismissal state live?

Iteration 1 called the banner "dismissible" without saying where dismissal lives. If persisted it becomes a 6th localStorage key and breaks P2's own assertion. **Decision: React `useState` inside `FamilyApp`, memory-only, never persisted, reset on reload.** Enforced by `e2e/key-hygiene.spec.ts` asserting the exact key set after a full interaction pass — a deliberate behavioural gate, not a code comment.

---

## 2. Pre-mortem — exactly 3 failure scenarios

### P-1 · Silent data loss on every reload: `sanitizeState` is a field white-list and will eat `photoUrl` + `events`

**What breaks.** `saveState` (`lib/family.ts:268-271`) writes the *whole* `FamilyState` to localStorage. `loadState` (`:257-266`) → `importState` (`:252-255`) → `sanitizeState` (`:187-246`). `sanitizeState` **rebuilds each Person from an explicit 10-key object literal** (`:196-210`). Any key not in that literal is discarded on read.

So: user pastes a photo URL and adds three 家族事件, hits 保存, sees them rendered, reloads the page — **gone**. Not partially: `photoUrl` and `events` vanish from every person. Worse than ordinary data loss, because the bytes are still in localStorage; a user who opens DevTools will see the data sitting there being thrown away on read.

This is *not hypothetical*: it is the direct consequence of AC-21 landing before the sanitizer is updated. `pnpm build` passes the whole time, the UI looks correct, and there is no runtime error.

**Early warning signal (corrected — iteration 1's signal false-alarmed on a correct implementation).** Iteration 1 asserted `photoUrl` must appear in **both** `types.ts` and `sanitize.ts`. The correct v2 layout puts the coercion in `normalize.ts`, so the intended, correct implementation would have *tripped that alarm*. The rule is now: **the field name appears exactly once as a declaration and exactly once as a coercion, and nowhere else as an object-literal key.**

```bash
# must be >= 2 (declaration + read/write in the single field list)
grep -c 'photoUrl' lib/family/normalize.ts
# must be 0 — a second field list anywhere else is the disease
grep -rn 'photoUrl' lib/family/ | grep -v -e 'types.ts' -e 'normalize.ts'
# same shape for events
grep -c 'events' lib/family/normalize.ts
grep -rn 'events' lib/family/ | grep -v -e 'types.ts' -e 'normalize.ts' | grep -v 'sanitize.ts'
```

The **primary** signal is behavioural, not textual: the round-trip key-parity test fails while every other test passes. Manual signal: reload after editing; if the avatar reverts to the initial-letter fallback, this has fired.

**Mitigation baked into the plan.**
1. **Step 1 collapses the two field lists into one.** `createPerson` (`model.ts`) and `sanitizeState` (`sanitize.ts`) both delegate to `normalizePerson(id, raw: unknown)` in **`normalize.ts`**. A field can no longer be added to one and not the other — P3 is enforced structurally, not by review.
2. **Step 1 ships the round-trip parity test before any UI consumes the fields:** build a `Person` fixture with every field populated, `sanitizeState(JSON.parse(exportState(s)))`, assert `Object.keys` parity + deep equality. Fails loudly the moment a field is dropped.
3. **AC-28's UI (Step 7d) is gated on Step 1's tests being green** — the ownership table forbids 7d from starting if `test/family.sanitize.test.ts` is red.

### P-2 · The Bug is fixed for new data; the user's existing broken data stays broken — and the obvious "fix" is a fabrication

**What breaks.** AC-17 changes the *write* path. Rows already in localStorage with the broken shape (child has `fatherId` only, spouse added afterwards, `motherId` never backfilled) are untouched. The user upgrades, sees the identical symptom, and concludes the fix does not work. Reachable today via `components/family-app.tsx:171` (`addSpouseLink`, no backfill) and `:174` (`linkChildWithParents` on a parent with zero spouses at that moment).

The tempting repair — "on load, for each child with one parent and a free slot, fill the slot with that parent's spouse" — is a **heuristic, not a derivation**. If the parent has ≥2 spouses, the correct other parent is not knowable; filling in `spouseIds[0]` silently is precisely what AC-20 forbids.

**Early warning signal.**
- The E2E AC-17 test passes (it seeds a clean state) while a manual check against a **pre-seeded** `laotagong:family:v1` fixture of the broken shape shows no change. If the two disagree, the fix is write-path-only.
- The repair detector reports **0** findings on real data → the predicate does not match the actual broken shape.
- **Added (B6 of iteration 2):** the banner reports 0 需指定 while a ≥2-spouse fixture is loaded → `ambiguous` is not being surfaced (see mitigation 3).

**Mitigation baked into the plan.**
1. **One predicate, two callers, evaluation point pinned (iteration-1 hole closed).** `isUnambiguousBackfill(state, childId, parentId): boolean` returns true iff: `state.parents[childId]` exists; exactly one of its two slots equals `parentId`; the other slot is empty; **and** `getSpouseIds(state, parentId).length === 1`. **`state` must be the state that already contains the pair under consideration.** `addSpouseLink` therefore evaluates against **`next` (post-add)**, not the pre-add `state` — iteration 1 never said which, and the pre-add reading makes the count always 0, the predicate never fires, and AC-17 recurs verbatim. Caller contract is documented at the definition and asserted by two tests that pin both directions (§4.1 cases 5a/5b).
2. **No silent auto-repair.** The detector's output is surfaced in the Footer as an explicit banner — "发现 N 条可修复的双亲关系" with a 修复 button. Auto-repair would have to guess in the ≥2-spouse case, violating P4 and AC-20.
3. **The banner also reports the ambiguous bucket.** `findRepairableLinks` returns `{ repairable, ambiguous }`. Iteration 1 fed only `repairable` (which by construction contains *only* the exactly-1-spouse case) to a toast, making the ≥2-spouse case reachable exactly once and then permanently invisible — degrading P4 to "ambiguity gets a one-shot toast". v2's banner renders both: "N 条可修复 · M 条需指定", with 修复 for the first and a 指定另一位亲长 picker (7j's component, reused) for the second.
4. **Tests start from loaded bytes, not from builder calls.** `test/family.repair.test.ts` seeds a raw JSON string of the broken shape through `importState`, not through `addParentLink` — because the bug is a *load/write* bug and a fixture built by the new code cannot reproduce it.
5. **A manual escape hatch already exists and is preserved:** the empty 母亲 slot → 关联已有 → pick B (`family-app.tsx:684-688` → `:194-211`). Step 2 routes that call site through the symmetric layer so it stops being a fifth unguarded write path; the UX path stays.

### P-3 · Merge-conflict-by-construction: one 1277-line file, one CSS file, one lockfile, four concurrent writers

**What breaks.** Three shared resources:
- `components/family-app.tsx` (1277 lines) is touched by *every* redesign task. Two agents editing it concurrently produce a conflict that `git` cannot merge semantically.
- `app/globals.css` is touched by the token layer *and* by any writer who needs a new `.dark X {}` rule.
- `pnpm-lock.yaml` is rewritten by every `pnpm add`. `.github/workflows/deploy.yml:36` runs `pnpm install --no-frozen-lockfile`, so a mid-flight lockfile does not fail CI — it *silently* installs a different tree, which is worse. **v2 changes this line to `--frozen-lockfile` (B2).**

**Early warning signal.**
- `git status --short` shows `components/family-app.tsx` modified by two agents in the same window.
- `pnpm-lock.yaml` appears in more than one commit on the branch.
- `app/globals.css` is modified after the Steps 3+3b landing.
- Any writer adds a `.dark <selector>` rule or a `@keyframes` block to `globals.css` after that landing — that is a P-3 event, not a style choice.

**Mitigation baked into the plan.**
1. **Steps 0 and 0b are the only steps permitted to run `pnpm add`.** `vitest`, `jsdom`, `@playwright/test`, `tw-animate-css`, `serve` all land together. Afterwards the lockfile is frozen; any later dependency need is escalated, not installed.
2. **`app/globals.css` is single-writer across Steps 3 and 3b, then closed.** Keeping 3b on the same agent is deliberate: the rule is *one writer at a time*, not *one agent ever*. The `@custom-variant dark` added in Step 3 is the sanctioned escape hatch, so no writer has a reason to reopen the file.
3. **The split (Step 6) is serial, one file at a time.** This is the honest constraint: the file being dismantled is the shared resource, so it cannot be parallelised. Expand-contract is a valid variant but is *not* recommended — 1277 lines is small enough that coordination overhead exceeds the serial cost, and it defers all verification to one high-risk integration point.
4. **File-ownership table (§3.7) is normative** and now covers every created file (B3/B7). One agent per file at a time.

---

## 3. Implementation Steps

Every step ends with `pnpm build` green. **Exception, stated explicitly:** Steps 3 and 3b form **one landing** (two commits) — after Step 3's `--text-*: initial`, the named type utilities generate no CSS, so the app is visually broken until 3b migrates the 37 call sites. Both must land before any other step proceeds. **The file-ownership table in §3.7 is normative.**

### Phase A — Foundation (serial · single writer)

#### Step 0 · Dependency + test harness

**Files:** `package.json`, `pnpm-lock.yaml`, `vitest.config.ts` (new), `test/setup.ts` (new), `.gitignore`, `.github/workflows/deploy.yml`

- `pnpm add -D vitest jsdom @playwright/test tw-animate-css serve` — **all five, once.** (registry: vitest 5.0.0, jsdom 30.0.1, @playwright/test 1.63.0, tw-animate-css 1.4.0, serve 14.x)
- `vitest.config.ts`: `resolve.alias { "@": <root> }` (mirrors `tsconfig.json:25-29`), `environment: "jsdom"`, `include: ["test/**/*.test.ts"]`.
- Scripts (final set, **`lint` deleted**): `"test": "vitest run"`, `"test:watch": "vitest"`, `"e2e": "playwright test"`, `"e2e:serve": "serve out -l 4173"`, `"check:contrast": "node scripts/check-contrast.mjs"`.
- **Delete `package.json:12` `"lint": "next lint"` (non-blocking 10).** Verified dead: `next-lint.js` does not exist under `node_modules/next/dist/cli/` on Next 16.3.4. No step may gate on it. A dead quality gate trains people to distrust red/green — which is precisely what Driver 3 exists to prevent, so leaving it is not neutral. If linting is wanted later it must be re-introduced as a working `eslint` invocation, not as a corpse.
- `.gitignore`: append `coverage/`, `playwright-report/`, `test-results/`.
- **`npx playwright install --with-deps chromium`** — without this, `pnpm e2e` fails on a clean clone (non-blocking 9). Documented in `README.md` (Step 8).
- **CI (B2) — `.github/workflows/deploy.yml` gains two jobs and three line changes:**
  - `:36` `pnpm install --no-frozen-lockfile` → **`pnpm install --frozen-lockfile`**. Iteration 1 flagged this as the worse option and then left it in place.
  - New `verify` job: checkout → pnpm 9 → node 22 (`cache: pnpm`) → `pnpm install --frozen-lockfile` → **`pnpm test`** → **`pnpm check:contrast`**.
  - New `e2e` job (`needs: verify`): + `actions/cache` on `~/.cache/ms-playwright` keyed `${{ runner.os }}-pw-${{ hashFiles('pnpm-lock.yaml') }}` → `npx playwright install --with-deps chromium` → `pnpm build` → `pnpm e2e`. Uploads `playwright-report/` on failure (`actions/upload-artifact@v4`, `if: failure()`).
  - `build` job gains `needs: e2e`, so **a red test suite blocks the deploy**. Without this, Driver 3's entire justification ("the harness is THE regression guard") is false.
- **AC:** none directly; enables AC-17/18/19/20/23 verification and Steps 3/3b.
- **Effort:** small. **Cannot be split** — it is the only lockfile-mutating step (P-3 mitigation 1).
- **Verification:** `pnpm install` clean; `pnpm build` green; `pnpm test` exits 0; `head -1 pnpm-lock.yaml` still reads `lockfileVersion: '9.0'` (local pnpm is 11.22.0 while `deploy.yml:27` pins pnpm 9 — both emit 9.0, so they are compatible, but a silent version bump here would only fail in CI, and with `--frozen-lockfile` it would now fail *loudly*, which is the point).
- **Working-tree state to resolve before Step 0 runs:** `git status` currently shows `package.json` modified — the `"packageManager": "pnpm@9.15.9"` field has been removed from the working tree while it is still present at `HEAD`. This is **not** an edit made by this plan. It must be either committed or reverted before Step 0, because Step 0 is the designated single writer of `package.json` + `pnpm-lock.yaml` (P-3 mitigation 1) and cannot proceed on a dirty file.

#### Step 0b · Playwright harness skeleton (so no step invokes a tool with zero inputs)

**Files:** `playwright.config.ts` (new), `e2e/helpers/seed.ts` (new), `e2e/fixtures/*.json` (new), `e2e/smoke.spec.ts` (new)

Iteration 1 registered `"e2e": "playwright test"` in Step 0 and invoked it as Step 4's verification, while **no step created a single `e2e/*.spec.ts`**. With zero specs, `playwright test` exits non-zero — the verification could not have passed. v2 gives the harness an owning step and one real spec, so `pnpm e2e` is green from Step 0b onward and each later step *adds* its own spec file.

- `playwright.config.ts`: `webServer { command: "pnpm e2e:serve", url: "http://localhost:4173", reuseExistingServer: !process.env.CI, timeout: 120_000 }`, `use { baseURL: "http://localhost:4173", reducedMotion: "reduce" }` (kills R10's animation flake at the source), projects: `mobile-chrome` (375×667) and `desktop-chrome` (1440×900), `reporter: [["html", { open: "never" }], ["list"]]`.
- `e2e/helpers/seed.ts`: `seed(rawOrFixture)` — `page.addInitScript` writing `localStorage["laotagong:family:v1"]` **before** app boot, so tests exercise the real `loadState` path. Also `openSheet()`, `readStore()`, `expectNoHorizontalScroll()`.
- `e2e/fixtures/`: `broken-v1.json` (the AC-17/P-2 shape: `C.fatherId = A`, no `motherId`, `spouses: []`), `two-spouse.json`, `three-generation.json`, `orphan.json`. Committed, not generated — P-2 mitigation 4 requires the exact pre-fix bytes.
- `e2e/smoke.spec.ts`: `app boots and renders the brand`. One assertion. Its job is to make the runner valid, not to prove anything.
- **Verification:** `pnpm build && pnpm e2e` exit 0 on a clean clone with exactly 1 spec passing. This is the gate that Step 4's verification will later rely on.

#### Step 1 · Data model + single field list (`lib/family.ts` → `lib/family/`)

**Files:** `lib/family/types.ts` (new), `lib/family/normalize.ts` (new), `lib/family/model.ts` (new), `lib/family/query.ts` (new), `lib/family/links.ts` (new), `lib/family/sanitize.ts` (new), `lib/family/index.ts` (new, barrel), `lib/family.ts` (deleted), `test/family.sanitize.test.ts` (new)

> The barrel keeps `import { … } from "@/lib/family"` working unchanged for every existing call site — `components/family-app.tsx:33-54` needs **zero** edits in this step. The module is split along the dependency DAG `types ← normalize ← {model, sanitize}`, `types ← query ← links ← repair` specifically to keep it acyclic: `findRepairableLinks` needs both the getters and the predicate, so a single `derive.ts` holding both would import from `links.ts` while `links.ts` imports from it.

**Complete export ownership map (B7) — every export of today's `lib/family.ts` has exactly one home:**

| New file | Exports | Depends on |
|---|---|---|
| `types.ts` | `Gender`, `RelationKind`, `FamilyEventType`, `FamilyEvent`, `Person`, `FamilyState`, `LinkResult`, `STORAGE_KEY` | — |
| `normalize.ts` | `normalizePerson`, `normalizeEvent` — **the only file that enumerates Person field names** | `types.ts` |
| `model.ts` | `createEmptyState`, `createPerson`, `removePersonDeep` | `types.ts`, `normalize.ts` |
| `query.ts` | `getFatherId`, `getMotherId`, `getChildrenIds`, `getSpouseIds`, `getSiblingIds`, `areSpouses`, `genderLabel`, `firstPersonId`, `getRelationDistances`, `groupByRelationDistance` | `types.ts` |
| `links.ts` | `addParentLink`, `linkChildWithParents`, `addSpouseLink`, `removeSpouseLink`, `isUnambiguousBackfill` | `types.ts`, `query.ts` |
| `repair.ts` (created in Step 2, see below) | `findRepairableLinks`, `applyRepairs` | `types.ts`, `query.ts`, `links.ts` |
| `sanitize.ts` | `sanitizeState`, `exportState`, `importState`, `loadState`, `saveState` | `types.ts`, `normalize.ts`, `model.ts` |
| `index.ts` | barrel — re-exports all of the above | all |

The 16 exports iteration 1 left unowned (`createEmptyState`, `createPerson`, `getFatherId`, `getMotherId`, `getChildrenIds`, `getSpouseIds`, `getSiblingIds`, `areSpouses`, `addParentLink`, `removePersonDeep`, `removeSpouseLink`, `exportState`, `importState`, `loadState`, `saveState`, `genderLabel`) are now all assigned in the table above, and `firstPersonId` moves here from `family-app.tsx:537-542`.

- **Types** (`types.ts`): `Person` **gains** `photoUrl?: string` and `events?: FamilyEvent[]`. `FamilyEvent = { id: string; type: FamilyEventType; date: string; place?: string; note?: string }`, `FamilyEventType = "marriage" | "birth" | "death" | "migration" | "honor" | "custom"` (labels 婚娶 / 生育 / 丧葬 / 迁徙 / 褒学 / 自定义 — covers AC-21's 婚丧嫁娶 / 迁徙 / 褒学 / 自定义). **AC-21**
- **`normalizePerson(id: string, raw: unknown): Person`** — the single field list. Resolves the spec's flagged defect (`lib/family.ts:1-28` vs `:40` vs `:197`): optional text fields normalize **empty string → `undefined`**, so `exportState` stops emitting 10 empty strings per person and the declared type becomes true. Verified safe: every consumer uses falsy checks (`components/family-app.tsx:836-839` `person.birthYear || person.deathYear`, `:888` `person.ancestralHome || person.household`) and the edit sheet already coalesces (`:984` `draft.birthYear ?? ""`). **AC-22**
- **`normalizeEvent(raw, index): FamilyEvent | null`** — `id` must be a non-empty string else `crypto.randomUUID()`; `type` must be in the enum else `"custom"`; `date` string default `""`; `place`/`note` string-or-`undefined`. Invalid entries are dropped, not thrown. **AC-21**
- **`sanitizeState`** (`sanitize.ts`) extended to run `normalizePerson` and to coerce `events` through `normalizeEvent`. **AC-23**
- **`getRelationDistances(state): Map<string, number | null>`** — the `| null` is mandatory (non-blocking 1): `tsconfig.json:9` sets `strict: true`, so iteration 1's `Map<string, number>` is a compile error the moment an unvisited node is inserted, and it also contradicts the plan's own "unvisited nodes get `null`". See §3.6. **AC-9, AC-10**
- **Migration decision — explicit:** `STORAGE_KEY` **stays `"laotagong:family:v1"`** and `FamilyState.version` **stays `1`**. Rationale: `photoUrl` and `events` are *optional additive* fields; a v1 document remains a valid v1 document, and `normalizePerson` supplies `undefined` / `[]`. Bumping the key would strand existing user data under the old key and *create* the migration risk the spec warns about, for zero benefit. AC-23 is satisfied **vacuously and by record** — the reasoning is written into `CLAUDE.md` (Step 8) so a future contributor does not bump the key casually. **AC-23**
- **AC:** AC-21, AC-22, AC-23, AC-10. No UI change — new fields exist in the model but nothing renders them yet.
- **Effort:** medium. **Cannot be split** below "model + normalizer + sanitizer", because splitting them would reintroduce exactly the two-field-list defect P-1 is about.
- **Verification:** `pnpm build` green; `test/family.sanitize.test.ts` green including the round-trip key-parity test; the P-1 drift grep (§2 P-1) returns the documented shape.

**Step 1 tests** (`test/family.sanitize.test.ts`):
1. `round-trip preserves every Person key` — reflect over a fully-populated fixture (P-1 mitigation 2). **This is the primary AC-21 gate.**
2. `sanitizeState drops unknown keys but keeps photoUrl/events`.
3. `sanitizeState coerces a non-array events field to []`.
4. `normalizeEvent rejects an unknown type → "custom"`, `regenerates a missing id`.
5. `non-canonical birthYear survives verbatim`: `"约1950"`, `"?"`, `"1949-"` round-trip byte-identical. **AC-22**
6. `v1 JSON without photoUrl/events loads without loss` — a raw literal of the *current* on-disk format (`birthYear: ""` etc.) parses, all 10 original fields preserved. **AC-23**
7. `FamilyState has exactly 5 keys`. **AC-10**
8. `Person field names appear in exactly one module` — the grep above, executed as a test so it runs in CI rather than in a reviewer's memory. **P3**

#### Step 2 · Symmetric write layer + repair predicate (`lib/family/links.ts`, `lib/family/repair.ts`)

**Files:** `lib/family/links.ts`, `lib/family/repair.ts` (new), `lib/family/index.ts` (barrel export), `components/family-app.tsx` (**6 surgical call sites**: `:162`, `:171`, `:174`, `:187`, `:199`, `:216` — plus `:226` reviewed and left as-is), `test/family.links.test.ts` (new), `test/family.repair.test.ts` (new), `e2e/bug-spouse-backfill.spec.ts` (new), `e2e/repair-banner.spec.ts` (new)

- **`LinkResult`** = `{ state: FamilyState; applied: Array<{ childId: string; parentId: string }>; ambiguous: Array<{ childId: string; candidates: string[] }> }`.
- **`addParentLink(state, childId, parentId, role): LinkResult`** — promoted from a raw literal-writer (`lib/family.ts:102-116`) to **the only function that constructs a `parents` value**, and now symmetric: after binding `role`, if the child's *other* slot is empty and `isUnambiguousBackfill(next, childId, parentId)` holds for the child's existing parent, backfill the other slot and record it in `applied`; otherwise record in `ambiguous`. **This is what makes the `:162` call site symmetric rather than merely relocated (B1/P1).**
- **`isUnambiguousBackfill(state, childId, parentId): boolean` — with the evaluation point pinned.** Returns true iff: `state.parents[childId]` exists; exactly one of its two slots equals `parentId`; the other slot is empty; and `getSpouseIds(state, parentId).length === 1`. **`state` MUST be the state that already contains the pair under consideration** — `addSpouseLink` passes `next` (post-add), the detector passes the loaded state. Iteration 1 never specified this; the pre-add reading makes the count always 0, the predicate never fires, and AC-17 recurs verbatim. The contract is documented at the definition and pinned by tests 5a/5b below.
- **`addSpouseLink(state, a, b): LinkResult`** — adds the pair, then for each child `C` where exactly one of `{a,b}` is `C`'s recorded parent **and** `C`'s other slot is empty: evaluate `isUnambiguousBackfill(next, C, parentOfC)` **on `next`**; if true, backfill and record in `applied`; otherwise record in `ambiguous` with `candidates = getSpouseIds(next, parentOfC)`. Never overwrites an occupied slot. **AC-17 (write half), AC-18, P4's declared exception.**
- **`linkChildWithParents(state, childId, parentId): LinkResult`** — replaces the silent `spouseIds[0]` at `lib/family.ts:136`. 0 spouses → bind one side only; **1 spouse → bind it**; **≥2 spouses → bind *neither*, emit `ambiguous`**. Composed over `addParentLink`, so its symmetry cannot drift from `addSpouseLink`'s. **AC-20**
- **Gender-unknown fix** (`lib/family.ts:130-131` currently sends `"unknown"` to the `"father"` branch): `"unknown"` binds **the free slot**; if both are free, `"father"`; if both are occupied by someone else, the state is returned unchanged with a reason rather than silently overwriting a real parent. **AC-18**
- **`removeSpouseLink` semantics (AC-19) — decided: keep the parent links.** Removing a spouse pair does **not** retroactively clear `motherId`/`fatherId` previously established. Rationale: 删除关系 ≠ 删除事实; the existing code at `lib/family.ts:159-166` already behaves this way, and the spec's own risk register (spec line 339) recommends this. It is now *documented* (CLAUDE.md, Step 8) and *tested*, which is what AC-19 actually demands. It also does **not** trigger backfill — a newly-freed slot is surfaced by the detector, never auto-filled. This is also P4's declared reversibility mechanism.
- **Call-site edits in `components/family-app.tsx` — 6 sites, precisely enumerated (B1):**

  | Line | Function | Today | v2 |
  |---|---|---|---|
  | **`:162`** | `handleAddRelation`, father/mother branch | raw `parents: { … }` object literal | **`next = addParentLink(next, focus, person.id, mode).state`** — `mode` is the user's explicit 父亲/母亲 choice, so it must win over a gender-derived role. (Iteration 1's edit list omitted this line entirely, which made the plan's own gate `grep -rn "parents:" components/` = 0 unreachable at 1 hit.) |
  | `:171` | `handleAddRelation`, spouse branch | `addSpouseLink` | use `.state`; toast on `ambiguous` |
  | `:174` | `handleAddRelation`, child branch | `linkChildWithParents` | use `.state`; toast on `ambiguous` |
  | `:187` | `handleLinkExistingAsChild` | `linkChildWithParents` | use `.state`; toast on `ambiguous` |
  | **`:199`** | `handleLinkExistingAsParent` | raw `parents: { … }` object literal | **`addParentLink(s, focus, parentId, role).state`** — the fifth unguarded write path |
  | `:216` | `handleLinkExistingAsSpouse` | `addSpouseLink` | use `.state`; toast on `ambiguous` |
  | `:226` | `removeSpouse` | `removeSpouseLink` | **no edit** — this is a removal, not an add/link path. Reviewed and correct as-is. |

  Correction to iteration 1's own summary line: the count is **2 literals + 4 add/link call sites (`:171`, `:174`, `:187`, `:216`) + 1 removal call site (`:226`)**, not "2 literals + 4 call sites" showing five line numbers.
- **AC:** AC-17 (write path), AC-18, AC-19, AC-20.
- **Effort:** medium. **Cannot be split** from the call-site edits — a signature change without callers does not build.
- **Verification:** `pnpm build` green; `test/family.links.test.ts` and `test/family.repair.test.ts` green; **`grep -rn "parents: {" components/ hooks/` drops from 2 to 0**; `pnpm e2e` green including the two new specs.

**Step 2 tests** (`test/family.links.test.ts`):

1. **`INVARIANT: ∀C, parents[C]={F,M} ⟹ areSpouses(state,F,M)`** — asserted after every mutating operation over a matrix of ~12 fixtures. **AC-18**
2. **`AC-17 exact shape`**: seed via `importState('<raw v1 JSON>')` with `A` + child `C` (fatherId=A only) + `B`; run `addSpouseLink(A,B)`; assert `C.motherId === B`. **AC-17**
3. `addSpouseLink never overwrites an occupied slot` — child with a recorded other parent is left alone.
4. `addSpouseLink with ≥2 existing spouses → ambiguous, no write`.
5. **`isUnambiguousBackfill evaluation point`** — the two assertions that pin the pre/post question: **5a** `A` had 0 spouses, `addSpouseLink(A,B)` → predicate fires on `next`, `applied.length === 1`; **5b** `A` already has spouse `X`, `addSpouseLink(A,B)` → `applied.length === 0`, `ambiguous.length === 1`. A future refactor that accidentally passes the pre-add state fails 5a loudly instead of silently regressing AC-17.
6. `linkChildWithParents with 1 spouse backfills`; `with 2 spouses → ambiguous, neither bound`. **AC-20**
7. `gender "unknown" binds the free slot; does not overwrite`. **AC-18**
8. `removeSpouseLink preserves existing parent links`. **AC-19**
9. `removeSpouseLink then addSpouseLink again is idempotent` (no duplicate pairs — `lib/family.ts:155` guard preserved).

**Step 2 tests** (`test/family.repair.test.ts`):

10. **repair predicate** — seed the broken shape through `importState('<raw JSON>')`, **not** through builder calls (P-2 mitigation 4); assert `findRepairableLinks(state).repairable.length === 1`.
11. **repair is conservative** — the 2-spouse fixture yields `repairable.length === 0` **and** `ambiguous.length === 1` (P-2 mitigation 3: iteration 1 asserted only the first half, which would pass on an implementation that drops the ambiguity entirely).
12. `applyRepairs` is idempotent — running it twice yields an identical state and an empty `applied` on the second pass.

### Phase B — Shared surfaces (serial · single writer)

#### Step 3 · Design token layer + contrast guard — **single writer, then closed** (lands together with 3b)

**Files:** `app/globals.css`, `scripts/check-contrast.mjs` (new), `test/fixtures/contrast-baseline.json` (new), `e2e/contrast.spec.ts` (new)

> **Owning step for `scripts/check-contrast.mjs` (B3).** Iteration 1 registered the script in `package.json` at Step 0 and invoked it as Step 3's verification while Step 3's Files said "`app/globals.css` only" — at Step 3 the script did not exist. It is created here.

- `@import "tw-animate-css";` after `@import "tailwindcss";` (line 1). Fixes the D3 defect with **zero** edits to `components/ui/sheet.tsx`.
- `@custom-variant dark (&:where(.dark, .dark *));` — matches `lib/theme.ts:31-36` `applyTheme()`.
- **`@theme inline { … }`**, with **`--text-*: initial;` as its first line** (B5). Map semantic tokens only: `--color-background: var(--bg-0)`, `--color-foreground: var(--ink)`, `--color-muted-foreground: var(--ink-soft)`, `--color-faint-foreground: var(--ink-faint)`, `--color-primary: var(--accent)`, `--color-destructive: var(--danger)`, `--color-border: var(--glass-edge)`, `--color-ring: var(--me-ring)`, `--radius-card: 1.75rem`. **Do not map `--glass*`** — glass is a material, not a semantic colour (D2).
- **Typography scale — 5 levels (AC-2)** via `--text-*` + `--text-*--line-height` + `--text-*--letter-spacing` + `--text-*--font-weight`:

  | token | size | use | AC-2 requirement |
  |---|---|---|---|
  | `--text-caption` | 0.8125rem (13px) | card years, hints, chips | **the AC-2 floor: 正文最小字号 ≥13px** |
  | `--text-body` | 0.9375rem (15px) | card names, form values | |
  | `--text-heading` | 1.25rem (20px) | sheet titles, section headings | |
  | `--text-title` | 1.75rem (28px), `-0.02em`, 600 | **h1 mobile** | |
  | `--text-display` | 2.125rem (34px), `-0.02em`, 600 | **h1 desktop (`lg:text-display`)** | |

- **`--text-*: initial` is the load-bearing line.** Verified against Tailwind docs and by compiling: without it, `.text-xs{font-size:var(--text-xs)}` (12px) keeps generating, the repo's 10 surviving `text-xs` uses keep rendering at 12px, and **AC-2's 13px floor is violated while every iteration-1 gate returns green** — the AC-2 check grepped only `text-\[1[0-2]px\]` and never `text-xs`. With it, `text-xs/sm/base/lg/xl/2xl` generate nothing and the migration in Step 3b becomes *mandatory* rather than optional. **Scope note:** `initial` clears the *named* namespace only. Arbitrary values (`text-[11px]`, `text-[10px]`, `text-[15px]`, `text-[22px]`) still compile — which is why 3b's gate is "zero remaining non-scale size utilities", not "build fails".
- **Spacing (AC-3)** — named tokens only: `--spacing-card: 1rem` (16px, card padding floor) and `--spacing-section: 2rem` (32px, block gap floor); usable as `p-card`, `gap-section`, `mb-section`. **⚠️ Never redefine the base `--spacing`** (`node_modules/tailwindcss/theme.css:325` → `0.25rem`) — that rescales every numeric utility (`p-3`, `gap-3`, `h-5`, `w-10`, `space-y-4`, `inset-x-0`) and silently reflows the whole app. *(Iteration 1's example, `max-w-3xl`, belongs to the `--container-*` namespace and is unaffected — corrected, non-blocking 13.)*
- **Contrast tokens (AC-4) — values are now derived from measurement, not from a model (B8).** Iteration 1's model was materially wrong in five ways, each of which moves the answer: `.glass-card`'s background is a **three-stop gradient** whose ends use `--glass-strong` (`globals.css:176-181`) at **0.11**, not `--glass` at 0.07 (`:57-58`) — and the worst case is at the *most opaque* end; `.ambient span { opacity: 0.7 }` (`:106-112`) was unmodelled; line 227 of iteration 1 paired the LIGHT orb colour `#38bdf8` with the DARK alpha (dark is `rgba(125,211,252,0.22)`, `:68`); and `.glass-card::before` (`:197-208`) is an `position:absolute; inset:0` white sweep peaking at `rgba(255,255,255,0.12)` that **paints above in-flow text** (positioned descendants paint after inline content) and was entirely absent. With the true values, `--ink-faint`@0.72 re-computes to ≈4.4, not 4.87 — **below AA**. The modelled margin (0.37) was smaller than the model's own error band, and the errors point in both directions. Therefore:

  - **`scripts/check-contrast.mjs` is demoted to a token-drift regression guard.** It parses the CSS custom properties out of `app/globals.css` at runtime, compares the declared alphas against the committed `test/fixtures/contrast-baseline.json`, and **exits non-zero only on drift**. It additionally *prints* its modelled ratio as advisory output. **It can never return red on the real AC-4 question, and the plan says so instead of implying otherwise.**
  - **AC-4's real evidence is `e2e/contrast.spec.ts` sampling real pixels**, because the browser already implements `blur(28px) saturate(170%)`, the three-stop gradient, `::before`, and the 0.7-opacity orbs exactly. Method, per worst-case spot, per theme:
    1. Locate the target text node (light: the 生卒年 caption on a card overlapping `--orb-1`; dark: same). Read `getComputedStyle(el).color`.
    2. Inject a stylesheet hiding `.glass-card::before` for one measurement and screenshot the clip with the element's text transparent (`el.style.color = "transparent"`) → **unswept background `B`**.
    3. Restore `::before` and screenshot the same clip with text still transparent → **swept background `Bₛ`**.
    4. Derive the sweep alpha at that point: `a = 1 - (255 - Bₛ) / (255 - B)` per channel (white sweep), take the max across channels.
    5. Composite the token colour over `B`, then apply the same sweep transform → **`Tₛ`**. Compute the WCAG ratio `(L(Tₛ)+0.05)/(L(Bₛ)+0.05)`.
    6. Assert `≥ 4.5`. Measurement repeatability is ±0.1 and is asserted by running step 5 twice on two separate page loads and requiring agreement within that band — so the gate cannot silently drift into noise.

  - **Initial token values** are seeded by running that sampler once against the pre-change build (recorded in `test/fixtures/contrast-baseline.json`), then tuned until both themes clear AA at the measured worst case across all three `.glass-card` gradient stops and all three orbs. Only **then** are the values frozen into `globals.css`.
  - **Named findings that survive the correction and are confirmed design inputs:**
    1. **`--ink-soft` at 0.62 currently FAILS AA in dark mode** over the cyan orb (`--orb-1`, dark `rgba(125,211,252,0.22)` at `:68`) showing through 7% dark glass — the composited backdrop is *lighter* than the page. AC-4 is a real defect fix, not polish.
    2. In dark mode the two sub-`ink` tiers converge because AA over that backdrop leaves little room. **Intentional and aligned with AC-2**: hierarchy moves from colour tiering to the typographic scale. Rule recorded in CLAUDE.md — *in dark mode `--ink-faint` is for non-content affordances (drag handle, dividers, disabled icons); all content text uses `--ink` or `--ink-soft`.*
- **Delete dead code (non-blocking 11).** Verified zero references repo-wide for **all eight** soft-text helper classes — `globals.css:364-395` `.text-ink`, `.text-ink-soft`, `.text-ink-faint`, `.text-accent`, `.bg-danger-soft`, `.text-danger`, `.border-soft`, `.hover-glass` (each `grep -rn` over `components/ app/ lib/` → 0 hits). Iteration 1 deleted only `select option`. Delete all nine blocks (`:359-395`).
- **AC:** AC-2 (declaration half), AC-3 (declaration half), AC-4; enables AC-1 (untouched glass) and AC-34.
- **Effort:** medium. **Cannot be split** — a half-migrated theme is worse than either state.
- **Verification (B4 — the impossible check is gone).** Iteration 1 verified Step 3 with "`shasum` of `out/index.html` unchanged", which is **structurally impossible**: `out/index.html` inlines a content-hashed CSS reference (e.g. `/_next/static/chunks/3qruufrwcuehv.css`), so editing `globals.css` changes the chunk hash and therefore `index.html`, on every run, forever. Replacement gates:
  1. `pnpm build` green.
  2. `pnpm check:contrast` green (drift guard).
  3. `pnpm e2e -- contrast` green (real AA evidence).
  4. **`git diff app/globals.css` is reviewed against a closed list of intended deltas** — the `@theme` block, the two ink tiers, the `@import`, the `@custom-variant`, and the deletions. `blur(28px) saturate(170%)` (`:186`), the `125deg` `::before` (`:201-206`), and the three `.ambient span` rules (`:114-138`) must show **no** diff. This is §6's AC-1 gate and it is exact; the chunk-hash check added nothing and is not replaced.

#### Step 3b · 字阶迁移 (type-scale migration) — **same agent as Step 3, same landing, before Step 6**

**Files:** `components/family-app.tsx`, `components/ui/button.tsx`, `components/ui/label.tsx`, `components/ui/input.tsx`, `components/ui/sheet.tsx`, `e2e/type-scale.spec.ts` (new)

**Why this step must exist (B5).** With `--text-*: initial` in place, every named type utility stops generating CSS. The repo has **37 occurrences** of named/arbitrary size utilities across 35 lines (measured: `grep -rno` — 30 in `components/family-app.tsx`, 7 in `components/ui/`). Until they are migrated, the app renders at inherited sizes. **3b MUST run before Step 6**, or Step 6's moves stop being verbatim and the DOM-hash oracle is destroyed.

**Write set and mapping** (every occurrence, by line):

| Source | Today | v2 |
|---|---|---|
| `family-app.tsx:284` (h1) | `text-[22px] … sm:text-2xl` | `text-title lg:text-display` |
| `family-app.tsx:287` (h1 subtitle) | `text-xs … sm:text-sm` | `text-caption` |
| `:306` (breadcrumb row) | `text-xs` | `text-caption` |
| `:321`, `:875` (我 / role pills) | `text-[10px]` | `text-caption` (pills keep their own visual weight via `font-medium`, not via sub-13px type) |
| `:353`, `:397`, `:415`, `:425`, `:506`, `:563`, `:780`, `:830`, `:1203`, `:1178`, `:1228`, `:1246`, `:1255`, `:271`, `:617` | `text-xs` / `text-sm` | `text-caption` / `text-body` per the table in Step 3 |
| `:457`, `:791`, `:886`, `:889`, `:953`, `:1258` | `text-[11px]` | `text-caption` |
| `:871` | `text-[15px]` | `text-body` |
| `:560` | `text-xl` | `text-heading` |
| `:880` | `text-[10px]` | `text-caption` |
| `components/ui/button.tsx:7` `text-sm` → `text-body`; `:23` `text-xs` → `text-caption`; `:24` `text-base` → `text-body` | | |
| `components/ui/label.tsx:12` `text-xs` → `text-caption` | | |
| `components/ui/input.tsx:13` `text-sm` → `text-body` | | |
| `components/ui/sheet.tsx:77` `text-lg` → `text-heading`; `:91` `text-sm` → `text-body` | | |
| `components/ui/sheet.tsx:41` | `sm:max-w-lg` | **`sm:max-w-md`** (P5 edge — see §1.1 P5) |

- **Fold-in (B5, B7):** `components/ui/{button,label}.tsx` were in *no* ownership row in iteration 1; they are 3b's write set here, and `input.tsx`/`sheet.tsx` join them for the same reason (a half-migrated primitive set is a P-3 event waiting to happen). §3.7 gets the row.
- **Rationale for the 10px pills:** AC-2 says 正文最小字号 ≥13px. Pills are chrome, not 正文 — but iteration 1's AC-2 check drew that line by grepping *pixel literals only*, which is why the 10 surviving `text-xs` sites (several of them body copy: `:287` h1 subtitle, `:306` breadcrumb, `:425` settings copy, `:1203` add-child hint, `ui/label.tsx:12`, `ui/button.tsx:23`) went undetected. v2 migrates everything to the 5-level scale and lets the *scale* enforce the floor: there is no 10px or 12px step to land on, so chrome and body alike read ≥13px, and hierarchy is carried by weight/colour instead.
- **AC:** AC-2 (consumption half), AC-3-adjacent.
- **Effort:** medium, mechanical, single writer, one file at a time within the step.
- **Verification:**
  1. `pnpm build` green.
  2. **`grep -rn "text-xs\|text-sm\|text-base\|text-lg\|text-xl\|text-2xl\|text-3xl\|text-\[1[0-4]px\]" components/` → 0.** Note what this gate is: it asserts the *absence* of the utilities that violate AC-2, including `text-xs` — the check iteration 1 was missing. It is a real gate now because `--text-*: initial` means a surviving `text-xs` would also be a *visible* defect, so the grep and the rendering cannot disagree.
  3. `e2e/type-scale.spec.ts`: `getComputedStyle(h1).fontSize === "28px"` at 375, `"34px"` at 1280; `fontWeight === "600"`; `letterSpacing` `-0.56px` / `-0.68px` (−0.02em × 28/34). Computed style, not a screenshot hash.
  4. `pnpm e2e` green.
- **AC-3 status — recorded as partially met (non-blocking 3).** Tailwind 4's base `--spacing: 0.25rem` makes `p-3` = 12px and `gap-3` = 12px, and the existing utilities are not on an 8px grid. Redefining `--spacing` is correctly judged **Severe** (§1.3 D2). v2 therefore: (a) introduces `--spacing-card` (16px) and `--spacing-section` (32px) as named tokens, and (b) **swaps them in at the named sites** — Step 7a replaces `compact ? "p-3" : "p-3.5"` (`family-app.tsx:845`) with `p-card` in both card variants, and Step 7f replaces `mb-1` on the three `<section>` elements (`:668`, `:695`, `:715`) with `mb-section`. Result: card padding = 16px ✓ and inter-block spacing = 32px + the grid's existing 8px = 40px ≥ 32px ✓. **The literal clause "全套切换到 8px 基准网格" is NOT met** — the surrounding utilities remain on Tailwind's 4px scale. **AC-3 is recorded as partially met with this reason stated**, exactly as the plan handles the `d = 0` label. The plan does not claim it met.

#### Step 4 · Sheet primitive: responsive side + live animation (`components/ui/sheet.tsx`)

**Files:** `components/ui/sheet.tsx`, `e2e/sheet.spec.ts` (new)

- `side?: "bottom" | "center" | "responsive"`, default `"responsive"`. **AC-15**
- `"responsive"` = the existing bottom classes (`:41`) plus `lg:` overrides for the centre geometry already written at `:43` (`lg:left-1/2 lg:top-1/2 lg:bottom-auto lg:inset-x-auto lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-[28px] lg:max-w-md`). **Pure CSS — no `useMediaQuery`, no resize listener, no hydration risk** (P5).
- **Width monotonicity (P5 edge fixed):** `sm:max-w-lg` (512px) is **changed to `sm:max-w-md`** (448px). With `sm:max-w-lg` retained, 768–1023px would be 512px wide and ≥1024px would *shrink* to 448px — the opposite of "桌面端只放大". v2 gives 375 → 448 → 448.
- Animation (now live thanks to Step 3): `animate-in fade-in-0 slide-in-from-bottom-4 duration-300 lg:slide-in-from-bottom-0 lg:zoom-in-95` + `data-[state=closed]:animate-out data-[state=closed]:fade-out-0`. `--tw-enter-translate-y` and `--tw-enter-scale` are independent custom properties, so the responsive composition works.
- **AC-16: the `min-h-0` belongs at the CALL SITES, not here (non-blocking 7).** Iteration 1 put it in `sheet.tsx`, but `SheetContent` renders `{children}` directly with **no body wrapper** (`sheet.tsx:49`) — there is nothing to make scrollable. `SheetContent` gets `max-h-[92dvh]` at bottom and `lg:max-h-[85vh]`; the three call-site scroll containers get `min-h-0`:
  - `components/family-app.tsx:384` (settings sheet) — **Step 4's write set** (pre-move; Step 6 relocates it to `settings-sheet.tsx`)
  - `components/family-app.tsx:961` (person edit sheet) — **Step 7d's write set**
  - `components/family-app.tsx:1190` (add-relation sheet) — **Step 7j's write set**
  Step 4 owns `:384`; the other two are re-stated in their owning steps so the fix is not lost in the move.
- The drag-handle `<div>` (`:48`) is currently rendered for **all** sides; gate it `aria-hidden` + hidden at `lg:` so the centred dialog does not carry a bottom-sheet affordance.
- **AC:** AC-15, AC-16; repairs the dead-animation defect (spec line 347).
- **Effort:** small.
- **Verification:** `pnpm e2e -- sheet` green at 375×667 / 1023 / 1025 / 1440×900 — invoking a spec that now exists (Step 0b made the runner valid; Step 4 adds this spec).

#### Step 5 · Layout skeleton — Header / Main / Footer (`components/family-app.tsx`)

**Files:** `components/family-app.tsx`, `e2e/shell.spec.ts` (new), `e2e/key-hygiene.spec.ts` (new)

- Wrap the root in `flex min-h-dvh flex-col`; replace the current single wrapper at `:280` (`mx-auto … max-w-3xl … lg:max-w-5xl`) with three siblings:
  - `<header className="w-full …">` — **exactly 3 visual elements: 品牌 / 查找入口 / 主题切换**. The settings button (`:293-300`) **leaves** the header. **Each of the three carries `data-header-item` (non-blocking 4).** AC-6 says "3 个视觉元素", and the brand is not focusable (`:283-290` has no interactive element), so iteration 1's check — "`header button, header [role=button], header a` → length 3" — could only ever match 2. The gate becomes `header [data-header-item]` length 3, which counts *visual* elements and is bound to an explicit contract rather than to a selector category.
  - **Where `SearchPanel` mounts (non-blocking 4, second half):** **as a sibling of `<header>`, not a descendant** — an overlay `<div data-search-root>` rendered in the root flex column, opened by the header's search entry. If the panel's markup lived inside `<header>`, expanding it would make the header contain far more than 3 elements and AC-6 would be true only while collapsed. Stating the mount point removes that ambiguity, and the AC-6 gate is asserted **in both collapsed and expanded states**.
  - `<main className="mx-auto w-full max-w-3xl px-4 lg:max-w-5xl lg:px-8 flex flex-1 flex-col …">` — inherits the `max-w` constraint that header/footer must not, **and carries `flex flex-1 flex-col`** (non-blocking 8): `TreeSection:666` (`flex flex-1 flex-col fade-node`) and `EmptyState:555` (`flex-1`) depend on a flex parent for their `flex-1` to do anything. Without it both silently collapse.
  - `<footer className="w-full …">` — 导出 / 导入 / 设置 / 清空 + 「N 位成员 · 数据仅保存在本机」 (`:457-459`). The three buttons move out of the settings sheet (`:428-453`) into a `DataActionBar`. **AC-7**
- **Breadcrumb row `:304-336` gets an owner (non-blocking 8).** Iteration 1 left it unassigned. It is part of the Main region: Step 5 rewrites it in place inside `<main>`, and Step 6 moves it to `components/tree/breadcrumb.tsx` (7f then redesigns it).
- **Note on `app/layout.tsx`:** it is a Server Component; theme/search state lives in the client `FamilyApp`. Rendering `<header>` in `layout.tsx` would force the state up or split it. Rendering the three regions **inside the client tree** keeps `app/layout.tsx` out of Phase B's write set entirely (P-3 mitigation). `layout.tsx` is still touched once, in Step 8.
- **AC:** AC-5, AC-6, AC-7, AC-32; AC-10-adjacent.
- **Effort:** medium, single file, single writer.
- **Verification:** `pnpm e2e -- shell key-hygiene` green:
  - `header`/`footer` `getBoundingClientRect().width === innerWidth` at 375 and 1440; main container `maxWidth` ∈ {768, 1024}. **AC-5**
  - `header [data-header-item]` length === 3, **collapsed and expanded**. **AC-6**
  - `header` contains no 导出/导入/设置/清空 text; all four present in `footer`. **AC-7**
  - `documentElement.scrollWidth <= clientWidth` at 375 across every route state. **AC-32**
  - `Object.keys(localStorage).sort()` deep-equals `["laotagong:family:v1","laotagong:theme"]` after a full pass (open/close sheets, expand search, dismiss the repair banner). **P2's closure of its own hole** — this is where a persisted dismiss-flag would be caught.

### Phase C — Dismantle the monolith (serial · single writer · verbatim moves only)

#### Step 6 · Split `components/family-app.tsx` to target boundaries

> **Verbatim moves only.** No behaviour, no className, no JSX changes in this step. The oracle is §4.3's visual-freeze test: after **all** moves, the normalised DOM of a seeded page must hash identically to the pre-Step-6 baseline. `pnpm build` must be green after **every** individual move. **Steps 3 and 3b must have landed first** or the moves are not verbatim.

**Target file map** (line ranges are pre-edit, from the current file):

| New file | Source in `family-app.tsx` | Lines |
|---|---|---|
| `components/common/theme-cycle-button.tsx` | `ThemeCycleButton` | 515-535 |
| `components/common/gender-picker.tsx` | `GenderPicker` (used 3×: `:581`, `:972`, `:1201`) | 594-629 |
| `components/common/section-label.tsx` | `SectionLabel` | 788-797 |
| `components/common/toast.tsx` | inline toast JSX | 504-510 |
| `components/common/empty-state.tsx` | `EmptyState` | 546-592 |
| `components/cards/person-card.tsx` | `PersonCard` (verbatim; split in Step 7a) | 801-914 |
| `components/tree/breadcrumb.tsx` | breadcrumb row (Step 5's rewrite) | 304-336 |
| `components/tree/tree-section.tsx` | `TreeSection` | 633-786 |
| `components/sheets/settings-sheet.tsx` | settings `Sheet` | 377-462 |
| `components/sheets/person-edit-sheet.tsx` | `PersonEditSheet` | 918-1073 |
| `components/sheets/add-relation-sheet.tsx` | `AddRelationSheet` | 1077-1277 |
| `components/layout/app-header.tsx` | Step 5's `<header>` block | — |
| `components/layout/app-footer.tsx` | Step 5's `<footer>` block | — |
| `hooks/use-family-store.ts` | state + hydration + persistence + all 11 handlers | 73-264 |
| `hooks/use-theme.ts` | theme state + `changeTheme` | 80, 83-108 |
| `hooks/use-toast.ts` | toast state + 2200ms timeout | 78, 98-102 |
| `lib/family/query.ts` (`firstPersonId`) | `firstPersonId` | 537-542 |
| `lib/theme.ts` (`THEME_META`) | `THEME_META` | 66-70 |
| `components/family-app.tsx` | **composition root only — target ≤160 lines** | — |

`components.json:17-18` already declares the `hooks` alias while `hooks/` does not exist — this step creates it, so no config change is needed.

- **Why the split is serial:** the file being dismantled *is* the shared resource. Parallelising it means N conflicting rewrites of `family-app.tsx`. Expand-contract is a legitimate variant but defers 100% of verification to one integration commit; at 1277 lines the coordination cost exceeds the serial cost. **This step cannot be meaningfully split further** — it is ~7 mechanical moves plus one composition-root rewrite.
- **AC:** none directly; it is the precondition for AC-11/12/14/28/29/30/31 landing in disjoint files.
- **Effort:** medium (~1h). **Not parallelisable** — say so rather than pretend.
- **Verification:** `pnpm build` green after each move; §4.3 visual-freeze hash identical; `pnpm e2e` green throughout.

### Phase D — Redesign + new capability (layered DAG · disjoint files)

#### Step 7 · Per-file redesign and new features

**Iteration 1 claimed "7a–7i are parallel-safe because the files are disjoint." That is false (B6), and it contradicted the plan's own "every step ends with `pnpm build` green."** The real dependencies, verified against the target file map:

- **7a ← 7b** — `me-card.tsx` / `relative-card.tsx` import `components/cards/person-avatar.tsx`, which 7b creates.
- **7f ← 7a** — `tree-section.tsx` consumes `MeCard` / `RelativeCard`.
- **7d ← 7c** — `person-edit-sheet.tsx` mounts `<FamilyEventList>`, created by 7c.
- **7e ← 7i**, **7h ← 7i** — `groupByRelationDistance` and `findRepairableLinks` / `applyRepairs` are created by 7i.

**v2 therefore specifies an explicit DAG. Only same-layer items run in parallel. `components/family-app.tsx` is single-writer throughout, and all its wiring is isolated into 7k so no sub-step needs it.**

```
Layer 0 (parallel):  7i  7b  7c  7g  7j
Layer 1 (parallel):  7a(←7b)   7d(←7c)   7e(←7i)   7h(←7i)
Layer 2:             7f(←7a)
Layer 3 (serial):    7k  ← every one of the above   [single writer, family-app.tsx]
```

| Sub-step | Layer | File | Change | AC |
|---|---|---|---|---|
| **7b** | 0 | `components/cards/person-avatar.tsx` (new) | One avatar component: `photoUrl` → `<img>`; `onError` sets a `failed` flag that **stops rendering the `<img>`** and swaps to the 姓名首字 + 性别渐变 fallback (an `onError` that merely styles the broken image still shows the broken-image glyph — this is what AC-29 forbids). Sizes 56px (我) / 36px (亲属) via a `size` prop. Plain `<img>`, not `next/image`: `next.config.ts:4-7` sets `output: "export"` + `images.unoptimized: true`, so there is no optimiser. `loading="lazy"`, `referrerPolicy="no-referrer"`, `alt=""` (the name is adjacent). **basePath trap:** `photoUrl` is a user-supplied absolute URL and must **not** be prefixed with `next.config.ts:9-10`'s `basePath`; validate on save that it starts with `http://` or `https://` and show an inline hint otherwise — a site-relative `/photos/x.jpg` would 404 under a GitHub Pages project site. | AC-14, AC-29, AC-28 (render half) |
| **7i** | 0 | `lib/family/query.ts`, `lib/family/repair.ts` | The BFS (`getRelationDistances`, `groupByRelationDistance`, see §3.6), plus `findRepairableLinks` returning `{ repairable, ambiguous }` and `applyRepairs`. `repairable` and `ambiguous` are both derived from `isUnambiguousBackfill` quantified over the graph — the predicate is reused, not re-derived. | AC-9, AC-10 |
| **7c** | 0 | `components/sheets/family-event-list.tsx` (new) | Collapsible (reuse `components/ui/collapsible.tsx`) list of `FamilyEvent`; add / edit inline / delete; type chosen from the 6-value enum; date is a free-text `<input>` (AC-22 tolerance). Rendered **only** inside the edit sheet, never on a card face. | AC-30, AC-31 |
| **7g** | 0 | `components/layout/app-header.tsx` | Brand + search entry + ThemeCycleButton, each marked `data-header-item`. Exactly 3. The search entry toggles the sibling `[data-search-root]` layer (Step 5's contract). | AC-6 |
| **7j** | 0 | `components/sheets/add-relation-sheet.tsx` | **Newly owned (non-blocking 5).** Iteration 1 gave this file no step at all, though it is `linkChildWithParents`'s only caller and therefore where AC-20's picker must live. v2: surface the `LinkResult` returned by `linkChildWithParents` / `addSpouseLink` / `addParentLink` — on `ambiguous`, render the 选择另一位亲长 / 暂不指定 picker, and on `applied` show what was backfilled. Add AC-16's `min-h-0` to the scroll container at `family-app.tsx:1190` (which 7j inherits from Step 6's move). | AC-20, AC-16 |
| **7a** | 1 | `components/cards/me-card.tsx` (new), `components/cards/relative-card.tsx` (new), `components/cards/person-card.tsx` (deleted) | Split on information density, not size. **MeCard** = 姓名 / 生卒年 / 籍贯 / 户籍 / 备注 / 头像. **RelativeCard** = 姓名 + 生卒年 + 头像 only (the 籍贯/户籍 block at `:888-895` is removed from relative cards). Both are `w-full` inside the existing `grid-cols-2` (`:670`, `:716`), so width is already equal by construction — AC-13's "宽度一致" needs no new CSS, only removal of size-based variants. Connector anchors are sibling `div`s (`:690`, `:710`, `:757`) centred by `mx-auto` on the container, **not** positioned relative to card height, so height differences cannot misalign them. **`data-card` is created here (B9):** the card root carries `data-card={isMe ? "me" : "relative"}`. Additionally swap `compact ? "p-3" : "p-3.5"` (`:845`) → `p-card` in both variants (AC-3 consumption). | AC-12, AC-13, AC-14, AC-3 (consumption) |
| **7d** | 1 | `components/sheets/person-edit-sheet.tsx` | Add the 照片链接 input (AC-28) with absolute-URL validation; mount `<FamilyEventList>`; **fix AC-22**: `inputMode="numeric"` at `:982`, `:993` blocks Chinese input on iOS numeric keypads — change to `inputMode="text"` and raise `maxLength` from 12 (`:986`, `:997`) so `约1950` / `1949-` are typeable; switch `SheetContent` to `side="responsive"`; add `min-h-0` to the scroll container at `:961`. | AC-22, AC-28, AC-30, AC-31, AC-15, AC-16 |
| **7e** | 1 | `components/search/search-panel.tsx` (new) | **One** control: a single `<Input>`, with filter chips rendered **inside its trailing area** — there is no second, separate filter box (AC-8). The whole panel is wrapped in `data-search-root` and each chip carries `data-filter-chip`, so the AC-8 gate is a bound selector rather than an unbound one (non-blocking 4 — iteration 1's "≥3 chips are descendants of that input's wrapper" had no named wrapper). Results grouped by `RelationDistance` via `groupByRelationDistance`, with a 未连接 group for `null` (AC-9). Group labels: `d ≤ -2` 祖辈（上溯 N 代）/ `d = -1` 父辈 / `d = 0` 同辈（我 · 配偶 · 兄弟姐妹）/ `d = +1` 子辈 / `d ≥ +2` 孙辈（下延 N 代）/ 未连接. Selecting a result sets `focusId` and scrolls: `document.getElementById('focus-card')?.scrollIntoView({ block: 'center', behavior: 'smooth' })` (AC-11). **Under-specification, recorded for the reviewer:** the spec writes `我(0)`, but with spouse edges weighted 0 the `d = 0` ring also contains 配偶 and 兄弟姐妹, so a literal "我" label would be wrong. Labelled 同辈 with 我 marked inside. | AC-8, AC-9, AC-11 |
| **7h** | 1 | `components/layout/app-footer.tsx` | `DataActionBar` (导出 / 导入 / 设置 / 清空) + 本机存储提示 + the **repair banner consuming BOTH buckets** (non-blocking 6): "发现 N 条可修复的双亲关系" + 修复 → `applyRepairs`; **and** "M 条需指定另一位亲长" → opens 7j's picker. Never automatic (P-4 mitigation 2). Dismissal is `useState`, memory-only (P2 hole closure). `applied[]` is echoed in a toast after 修复. | AC-7 |
| **7f** | 2 | `components/tree/tree-section.tsx`, `components/tree/breadcrumb.tsx` | Consume MeCard / RelativeCard / PersonAvatar; add `id="focus-card"` to the focus card for 7e's scroll target; keep the three connector `div`s and the `key={focusId}` `fade-node` remount (`:666`). Replace `mb-1` with `mb-section` on the three `<section>`s at `:668`, `:695`, `:715` (AC-3 consumption). | AC-11, AC-12, AC-13, AC-14, AC-3 (consumption) |
| **7k** | 3 | `components/family-app.tsx` | **Integration, single writer, serial.** Mount `AppHeader` / `SearchPanel` (as a sibling, per Step 5) / `TreeSection` / `AppFooter` / `DataActionBar` / repair banner; wire `focusId` from 7e's selection into 7f's scroll; wire the 7j picker to 7h's ambiguous bucket. **This is the only sub-step that touches `family-app.tsx`.** | AC-7, AC-11, AC-20 integration |

- **AC:** AC-8..AC-14, AC-20, AC-22, AC-28..AC-31 + AC-32/34 re-verified.
- **Effort:** large — this is the bulk of the work. It **is** splittable, and the DAG above is the splittable shape. Iteration 1's "files are disjoint ⇒ parallel-safe" was the wrong invariant: disjointness of *files* says nothing about disjointness of *symbols*, and four of the nine edges above are symbol dependencies, not file dependencies.

### Phase E — Documentation and configuration (parallel-safe)

#### Step 8 · Docs, config, layout defects

| File | Change | AC |
|---|---|---|
| `CLAUDE.md` (new, ~150 lines) | Must contain: 项目定位 / 命令 / 文件地图 / **数据不变量** (关系双写对称 · 世代不落库 · STORAGE_KEY 变更须配迁移 · `sanitizeState`/`normalizePerson` 是字段白名单 · **P4: 仅在无歧义证据下回填，且必须显式、可审计、可恢复（非可撤销）**) / **易踩的坑** (Tailwind 4 需 `@theme inline` 且 `--text-*: initial` 会清空整个字号命名空间 · 不可重定义基础 `--spacing` · `output: "export"` 无服务端能力 · `basePath` 构建期注入，硬编码绝对路径会 404 · `next lint` 在 Next 16 已不存在) / 设计约定 (玻璃参数不动 · 尺寸差 = 信息密度差 · 卡片宽度必须一致 · 暗色下 `--ink-faint` 仅用于非正文 · **回填例外条款**). | AC-24 |
| `.gitignore` | Append `.omc/`, `.remember/`, `.vercel/`, `*.log` (plus Step 0's `coverage/`, `playwright-report/`, `test-results/`). **Must not ignore `public/.nojekyll`** — verified tracked via `git ls-files public/.nojekyll`. Do **not** add a blanket `public/` or `out`-style pattern that would shadow it. | AC-25, AC-26 |
| `README.md` | Add 照片外链 + 家族事件 to 功能; Apple Style / Liquid Glass 设计说明; the `Person` / `FamilyState` data-model sketch; **`npx playwright install --with-deps chromium` in the setup section** (non-blocking 9). | AC-27 |
| `app/layout.tsx` | Two incidental defects: (a) `:26` hardcodes the literal `"laotagong:theme"` — replace with `THEME_STORAGE_KEY` from `lib/theme.ts:3`, which cannot be imported into an inline `<script>` string, so *generate* the script string from the constant in module scope (template literal) rather than duplicating the literal; (b) `:20` `themeColor: "#eef2f7"` is fixed-light — replace with a `Viewport` `themeColor` array carrying `{ media: "(prefers-color-scheme: light)", color: "#eef2f7" }` and `{ media: "(prefers-color-scheme: dark)", color: "#0b1220" }`. Note this tracks **OS** preference, not the app's 3-way mode — the app's `light`/`dark` override cannot drive `themeColor` from a static export. Record that limitation in CLAUDE.md. | AC-34 (adjacent) |
| `.github/workflows/deploy.yml` | Owned by Step 0 (B2). Step 8 verifies the three changes landed: `--frozen-lockfile`, `verify` job, `e2e` job. | Driver 3 |
| `e2e/basepath.spec.ts`, `e2e/theme.spec.ts` (new) | The two cross-cutting E2E specs, owned here. | AC-33, AC-34 |

### 3.6 · `getRelationDistances` — the BFS specification

Graph: undirected adjacency over `persons`, with **signed edge weights**.
- parent `P` ↔ child `C`: `P → C` weighs `+1`, `C → P` weighs `−1`.
- spouse `A` ↔ `B`: weighs `0` both ways.

**Signature: `getRelationDistances(state: FamilyState): Map<string, number | null>`** (non-blocking 1 — `tsconfig.json:9` is `strict: true`, so `Map<string, number>` does not compile once an unvisited node is inserted, and it contradicts the next sentence).

Algorithm: BFS by **hop count** from `meId`; a node's distance is the sum of weights along its BFS parent chain, assigned on first visit. Neighbour iteration is **sorted by id** so traversal (and therefore every test) is deterministic. Unvisited nodes get `null` → the 未连接 group (AC-9).

Why hop-count BFS is correct enough: on a well-formed family graph the weights satisfy `w(path)` is path-independent for any two paths between the same nodes (it is a potential function). Contradictory cycles (e.g. A and B recorded as both spouses and parent/child) are malformed *data*, not an algorithm failure; the BFS result is then "distance along the shortest-hop path", which is well-defined and documented. Complexity `O(V+E)` — irrelevant at family scale.

`meId === null` ⇒ every person is `null` → 未连接. This is an explicit test case. **AC-9, AC-10**

### 3.7 · File-ownership table (normative)

Iteration 1's table was self-described as normative and then contradicted its own Step lists in three places: `family-app.tsx`'s window omitted Step 2, `lib/family/**`'s window omitted Step 6, and **`lib/theme.ts` had no row at all** while Step 6 moves `THEME_META` into it and Step 8 reads `THEME_STORAGE_KEY` from it. v2 reconciles every row against the Step lists and adds the missing globs (B3, B7).

| File / glob | Writer | Window |
|---|---|---|
| `package.json`, `pnpm-lock.yaml` | **1 agent, once** | Step 0 only; frozen after |
| `.github/workflows/deploy.yml` | same 1 agent | Step 0 (B2); Step 8 verifies only |
| `vitest.config.ts`, `test/setup.ts`, `test/fixtures/**` | 1 agent | Step 0 (`vitest.config.ts`), Step 0b (`test/fixtures/*.json`), Step 3 (contrast baseline) |
| `playwright.config.ts`, `e2e/helpers/**`, `e2e/fixtures/**`, `e2e/smoke.spec.ts` | 1 agent | Step 0b only |
| `lib/family/types.ts`, `normalize.ts`, `model.ts`, `query.ts`, `links.ts`, `sanitize.ts`, `index.ts` | 1 agent | **Steps 1, 2** (creation + links/repair); then **Step 6** (`firstPersonId` moves in), then **Step 7i** (`getRelationDistances`, `groupByRelationDistance`) |
| `app/globals.css` | **1 agent** | Steps **3 + 3b** as one landing; **closed after** |
| `scripts/check-contrast.mjs` | same 1 agent | Step 3 |
| `components/family-app.tsx` | **1 agent** | **Steps 2, 5, 6**, and integration **7k** |
| `components/ui/sheet.tsx` | 1 agent | **Step 3b** (type-scale swap + `sm:max-w-md`) and **Step 4** (side/animation/height) — same agent, sequential |
| `components/ui/button.tsx`, `label.tsx`, `input.tsx` | same 1 agent | Step 3b |
| `lib/theme.ts` | 1 agent | **Step 6** (`THEME_META` moves in); read-only in Step 8 — **new row (B7)** |
| `hooks/**` | 1 agent | Step 6 (created) then Step 7 |
| `components/cards/**` | 1 agent | Step 6 (move) then 7b → 7a |
| `components/tree/**` | 1 agent | Step 6 (move) then 7f |
| `components/search/**` | 1 agent | Step 6 (move) then 7e |
| `components/sheets/**` | 1 agent | Step 6 (move) then 7c → 7d, and 7j |
| `components/common/**`, `components/layout/**` | 1 agent | Step 6 (move) then 7g, 7h |
| `test/**` | 1 agent | Step 1 (`family.sanitize`), Step 2 (`family.links`, `family.repair`), Step 3b (`theme`, `utils`), Step 6 (visual-freeze baseline) |
| `e2e/**` | 1 agent | Step 0b (harness) then **per-step**: 2 (bug-spouse-backfill, repair-banner), 3 (contrast), 3b (type-scale), 4 (sheet), 5 (shell, key-hygiene), 6 (visual-freeze), 7 (per sub-step), 8 (basepath, theme) |
| `CLAUDE.md`, `.gitignore`, `README.md`, `app/layout.tsx` | 1 agent each | Step 8 |

Any need to write outside your window is an escalation, not a judgement call. `app/globals.css` reopens are the P-3 trigger to watch. **No file in this table is created by a step that does not own it — that is the specific defect B3 identified.**

---

## 4. Expanded Test Plan (DELIBERATE mode)

Starting state: **0 test files, 0 test runners, and a CI pipeline with no test step.**

### 4.1 Unit — `lib/family/**` first, symmetry invariant highest-value

**Runner: vitest 5.** Justification against `node:test`:
- `node:test` has no TS path-alias resolution; the project uses `@/*` (`tsconfig.json:25-29`) everywhere. `node --experimental-strip-types` (default-on in Node 22.23) also cannot resolve `@/…` without a loader.
- The localStorage round-trip tests need a real `window.localStorage` — the `typeof window === "undefined"` guard means plain Node returns the empty state and tests nothing. vitest + `jsdom` does.
- vitest is a devDependency only: it never enters `out/` and cannot interact with `output: "export"`.

| File | Covers | AC | Owner step |
|---|---|---|---|
| `test/family.sanitize.test.ts` | round-trip key parity · unknown-key drop · `photoUrl`/`events` coercion · non-canonical years · v1 JSON load · 5-key `FamilyState` · P-1 drift grep | AC-21, 22, 23, 10; P3 | 1 |
| `test/family.links.test.ts` | **symmetry invariant as a property over ~12 fixtures** · AC-17 exact shape · no-overwrite · multi-spouse ambiguous · **`isUnambiguousBackfill` evaluation point (5a/5b)** · gender-unknown free-slot · removeSpouseLink preserves links · idempotence | AC-17, 18, 19, 20 | 2 |
| `test/family.repair.test.ts` | repairable detection from raw seeded bytes · **ambiguity is surfaced, not dropped** · `applyRepairs` idempotence | AC-17, 20, P4 | 2 |
| `test/family.derive.test.ts` | BFS distances on a hand-built 3-generation fixture · spouse = 0 · sibling = 0 · 祖辈 = −2 · disconnect → `null` · `meId === null` → all `null` · determinism across 100 shuffles of `persons` insertion order | AC-9, 10 | 3b |
| `test/theme.test.ts` | `resolveTheme` / `loadThemeMode` / `saveThemeMode` round-trip under jsdom (`lib/theme.ts:15-29`) | AC-34 (adjacent) | 3b |
| `test/utils.test.ts` | `cn()` merge semantics (`lib/utils.ts`) | — | 3b |

### 4.2 Integration — no browser required

| Test | Method | AC |
|---|---|---|
| localStorage round-trip | jsdom `window.localStorage`; `saveState(s)` → `loadState()` deep-equals `sanitizeState(s)`; includes `photoUrl` + 3 `events` | AC-21, 23 |
| `sanitizeState` hostile input | `null`, `[]`, `"str"`, `{persons: null}`, `{persons: {x: 42}}`: never throws, always returns a valid `FamilyState` | AC-23 |
| referential integrity | `sanitizeState` drops a `parents` entry whose child or parent is missing (`lib/family.ts:219`), drops a spouse pair with a missing member (`:233`), dedupes pairs (`:234-237`), nulls a dangling `meId` (`:242-243`) — each asserted | AC-23 |
| **v1→v2 compatibility** | A raw literal of the **current** on-disk format (`birthYear: ""`, no `photoUrl`, no `events`) parses; all 10 original fields survive; `photoUrl === undefined`; `events === []`. Plus a document with forward-compatible junk keys is accepted with junk dropped | AC-23 |
| **repair predicate** | Seed the broken shape through `importState('<raw JSON>')` — **not** through builder calls (P-2 mitigation 4) | AC-17 |
| **repair is conservative** | 2-spouse fixture yields `repairable.length === 0` **and** `ambiguous.length === 1` — the second half is the assertion that proves ambiguity is not silently dropped | AC-20, P4 |

### 4.3 E2E — Playwright (`@playwright/test` 1.63)

Serve the real static artefact, not the dev server (`playwright.config.ts` `webServer` → `pnpm e2e:serve` on `out/` at :4173). A second pass builds with `NEXT_PUBLIC_BASE_PATH=/laotagong` and serves `out/` under that prefix to reproduce a GitHub Pages project site.

**Every `[data-card]` assertion asserts a non-empty NodeList first (B9).** AC-12/13 target `[data-card=me]` / `[data-card=relative]` and AC-31 targets `[data-card]`, but iteration 1's plan never added the attribute — the card root was a bare `div.glass-card` (`family-app.tsx:842-848`). AC-12/13 would fail loudly (recoverable), but **AC-31's "no `[data-card]` innerText contains event text" was vacuously true on an empty NodeList** — green while the AC was violated. v2 creates the attribute in 7a and makes emptiness a failure everywhere:

```ts
const cards = page.locator("[data-card]");
await expect(cards).not.toHaveCount(0);   // ← the gate iteration 1 lacked
```

| Spec file | Named test | Assertion | AC | Owner step |
|---|---|---|---|---|
| `e2e/smoke.spec.ts` | `app boots and renders the brand` | Non-empty `header [data-header-item]` | — | 0b |
| **`e2e/bug-spouse-backfill.spec.ts`** | **`AC-17: 先加子女后加配偶，子女设为「我」后另一位亲长可见`** | Seed the exact AC-17 pre-state from `e2e/fixtures/broken-v1.json`; add spouse B; set C as 我; assert B's card is in the DOM and B is reachable in the search panel under 父辈/母辈. Also assert `JSON.parse(localStorage['laotagong:family:v1']).parents[C].motherId === B`. | **AC-17** | 2 |
| `e2e/repair-banner.spec.ts` | `orphaned v1 data surfaces both a repairable count and an ambiguous count, and repair is explicit` | Seed broken v1 JSON; assert the banner reads `发现 1 条` **and** `0 条需指定`; assert **no** mutation before the button is clicked; click; assert the link is written. Second case: seed `two-spouse.json`; assert `0 条可修复` and `1 条需指定`, and that the 需指定 affordance opens the picker. | AC-17, 20, P-2, P-4 | 2 |
| `e2e/contrast.spec.ts` | `worst-case card text meets AA in both themes` | The pixel-sampling method in Step 3, at the 生卒年 caption over `--orb-1` in light and dark; run twice per theme and require agreement within ±0.1. | **AC-4** | 3 |
| `e2e/type-scale.spec.ts` | `h1 is 28px mobile / 34px desktop; no sub-13px body type remains` | `getComputedStyle(h1)` at 375 and 1280; plus a scan asserting no *content* element computes `fontSize < 13px`. | **AC-2** | 3b |
| `e2e/sheet.spec.ts` | `at 375px the edit sheet is bottom-anchored` · `at 1023/1025 the form flips` · `long content scrolls, never clips` · `width is monotonic` | bottom: content box `bottom ≈ innerHeight`, `borderTopLeftRadius === 28px`. Centred: `\|centerX − innerWidth/2\| < 2`, `\|centerY − innerHeight/2\| < 2`. **Monotonicity: `offsetWidth` at 768 ≤ `offsetWidth` at 1440** (the P5 edge). Overflow: with a 12-event person, the scroll container `scrollHeight > clientHeight` and 保存 stays clickable. | AC-15, 16 | 4 |
| `e2e/shell.spec.ts` | `header and footer are full-bleed at 1440px` · `375px has no horizontal scroll` | `header`/`footer` `getBoundingClientRect().width === innerWidth`; `documentElement.scrollWidth <= clientWidth` at 375×667 on every route state (empty / tree / search open / sheet open); **`header [data-header-item]` length === 3 in BOTH collapsed and expanded search states**; `header` contains none of 导出/导入/设置/清空. | AC-5, 6, 7, 32 | 5 |
| `e2e/key-hygiene.spec.ts` | `no sixth localStorage key appears` | After a full pass (open all sheets, expand search, dismiss the repair banner), `Object.keys(localStorage).sort()` deep-equals `["laotagong:family:v1","laotagong:theme"]`. | AC-10, P2 | 5 |
| `e2e/visual-freeze.spec.ts` | `DOM hash matches the pre-split baseline` | Seed the same fixture, `innerText`-normalise `document.body.innerHTML`, SHA-256. Recorded before Step 6; compared after. | Step 6 exit gate | 6 |
| `e2e/search.spec.ts` | `one input drives both search and filter` · `results group by relation distance` | `[data-search-root]` contains exactly **one** `input` and `≥3 [data-filter-chip]`; assert there is no second bare `<input>` anywhere in the panel. Assert group headers appear in the order 祖辈/父辈/同辈/子辈/孙辈/未连接; assert an isolated person lands in 未连接. | AC-8, 9, 10, 11 | 7e |
| `e2e/cards.spec.ts` | `MeCard shows all six fields, RelativeCard shows three` · `all card widths are equal` · `connector anchors are aligned` | `[data-card]` non-empty (B9 gate); MeCard text includes 籍贯/户籍/备注; RelativeCard does not. Every card in a grid row has identical `offsetWidth`. Connector `div` centres within 1px of the corresponding card-column centre across a 2-generation fixture at 375/768/1024/1440. | AC-12, 13, 14 | 7a |
| `e2e/spacing.spec.ts` | `named spacing tokens are actually consumed` | `getComputedStyle(card).paddingTop === "16px"`; `getComputedStyle(section).marginBottom === "32px"`. **Computed style on the real UI — not a grep** (non-blocking 2/3's consumption gate). | AC-3 (partial) | 7a/7f |
| `e2e/photo.spec.ts` | `a broken photoUrl falls back without a broken-image glyph` | Point `photoUrl` at a 404 origin; assert **no** `<img>` remains in the avatar slot and the initial-letter fallback is rendered. | AC-28, 29 | 7d |
| `e2e/events.spec.ts` | `family events are editable in the sheet and absent from the card face` | Add/edit/delete an event; then assert `[data-card]` is non-empty **and** the event text appears in none of them. | AC-30, 31 | 7c/7d |
| `e2e/ambiguous-picker.spec.ts` | `a multi-spouse link asks instead of guessing` | Seed `two-spouse.json`, attempt to link a child; assert the picker appears, that 暂不指定 leaves both slots empty, and that choosing one writes exactly that slot. | AC-20 | 7j |
| `e2e/export.spec.ts` | `exported JSON contains photoUrl and events` | Intercept the download; parse; assert both fields present — the end-to-end proof against P-1. | AC-21 | 7k |
| `e2e/basepath.spec.ts` | `no 404s at the project-site path` | Build with `NEXT_PUBLIC_BASE_PATH=/laotagong`; assert every network response is `< 400`; assert the external `photoUrl` is requested **without** the basePath prefix. | AC-33 | 8 |
| `e2e/theme.spec.ts` | `every new surface renders in both themes` | Screenshot header/main/footer/search-panel/edit-sheet at both `applyTheme` values; assert no element's computed `color` equals its composited `background-color`. | AC-34 | 8 |

### 4.4 Observability / manual verification — and how to make it cheap

**Automate what can be automated; the rest gets a checklist, not a vibe. And state each instrument's actual reach.**

1. **`scripts/check-contrast.mjs`** (new; wired to `pnpm check:contrast`; created in Step 3). **Its reach is stated, not implied:** it parses the CSS custom properties out of `app/globals.css` at runtime, compares the declared alphas against `test/fixtures/contrast-baseline.json`, and exits non-zero **on drift**. It also prints its modelled ratio as advisory output. **It cannot return red on the real AC-4 question** — iteration 1 presented a five-layer-wrong model as AC-4's machine check, and a verification that returns green while the AC is violated is worse than no verification. AC-4's machine check is now `e2e/contrast.spec.ts`'s pixel sampling (§4.3), which delegates the compositing to the browser.
2. **What a human must actually eyeball (2 items, ~3 minutes).**
   - **AC-4 spot-check.** Light: the 生卒年 caption on a card overlapping `--orb-1`. Dark: the same spot. Browser DevTools' contrast checker reading, screenshot attached to the PR. These are the only two spots where the worst case is reachable in the default layout. The automated sampler covers them; the human reading is the cross-check that the *sampler* is not measuring the wrong pixel.
   - **AC-13, connector alignment.** Resize 375 → 768 → 1024 → 1440 and confirm the three `.connector` rules (`family-app.tsx:690, 710, 757`) stay visually centred. Cheap because the connectors are container-centred, not card-height-dependent — if this ever fails, the cause is a `grid-cols` change, not a card change, which localises the bug immediately.
3. **Not worth automating, and the plan says so:**
   - **AC-1** (glass parameters unchanged) — `git diff app/globals.css` against a closed list of intended deltas. A diff against a known-good baseline is cheaper and more reliable than any pixel test, and unlike iteration 1's `shasum` check it is **possible** (B4).
   - **AC-3's remaining half** — the 8px grid is *partially* met and recorded as such (§3 Step 3b); the met half is verified by `e2e/spacing.spec.ts`'s computed-style assertions, which prove UI consumption rather than a token's existence.

---

## 5. Risks and Mitigations

| # | Risk | Likelihood | Impact | Concrete mitigation |
|---|---|---|---|---|
| R1 | `sanitizeState`'s white-list silently drops `photoUrl`/`events` on read (**P-1**) | **High** — it is the default behaviour of `lib/family.ts:196-210` | **Severe** — silent loss of the headline feature | Collapse to one `normalizePerson` in `normalize.ts` (Step 1) + round-trip key-parity test as a hard gate before Step 7d starts; drift grep scoped to catch a *second* field list, not the intended one |
| R2 | The Bug is fixed for new data only; existing broken rows stay broken (**P-2**) | **High** — write-path-only fixes are the default outcome | High — user concludes the fix failed | `isUnambiguousBackfill` shared by write path and detector, **evaluation point pinned to post-add**; detector surfaces an explicit banner; repair test seeds through `importState` |
| R3 | Auto-repair fabricates a parent in the multi-spouse case | Medium if auto-repair is attempted | **Severe** — silently wrong genealogy | No auto-repair on load, by construction (P4). Detector is exactly-one-spouse only. Tests assert **0** repairable **and 1 ambiguous** on a 2-spouse fixture |
| R4 | `pnpm-lock.yaml` / `globals.css` / `family-app.tsx` contention (**P-3**) | **High** with >1 agent | High — unmergeable conflicts | §3.7 ownership table (now complete); Step 0 is the only lockfile writer; `globals.css` closed after the Steps 3+3b landing |
| R5 | `@theme` written **without** `inline` | Low — corrected in v2: `:root` and `.dark` are on the same element (`layout.tsx:43` + `lib/theme.ts:32-33`), so non-inline works here | Low | `inline` still mandated for clarity of semantics; `dark:` variant rendering is asserted by `theme.spec.ts` in both themes |
| R6 | Redefining base `--spacing` rescales every existing numeric utility | Medium — it reads like the "right" way to build an 8px grid | **Severe** — whole-app reflow, misread as a redesign regression | Explicit prohibition in Step 3; §3.7 keeps `globals.css` single-writer; AC-3's unmet half is recorded rather than pursued via `--spacing` |
| **R7** | **`--text-*: initial` lands without 3b → every named type utility renders at inherited size (B5)** | **High if 3+3b are ever split across agents or commits that diverge** | High — app-wide typographic collapse | 3+3b declared **one landing**, same agent, and 3b sequenced **before Step 6** so the move oracle survives. Gate: `grep … text-xs …` → 0 plus `type-scale.spec.ts` |
| R8 | Deleting `lib/family.ts` breaks a call site missed by the barrel | Low — the barrel makes it a pure move | Medium — build failure | `pnpm build` after every move; `pnpm test` covers the public surface |
| R9 | `photoUrl` pasted as a site-relative path 404s under the project site | Medium — `/photos/x.jpg` looks valid in dev | Medium — broken avatar, and AC-29's fallback would hide it, masking the cause | Validate `http(s)://` on save with an inline hint (7b); `basepath.spec.ts` asserts the external URL is not prefixed |
| R10 | E2E flake from `fade-node`/`me-pulse` animations (`globals.css:312-339`) | Medium | Low — noise erodes trust in the suite | `reducedMotion: "reduce"` set globally in `playwright.config.ts`; assert on geometry + text, never on opacity |
| R11 | A quality gate that is dead or vacuous trains people to distrust red/green | **Certain** (it already happened: `next lint`, and iteration 1's three vacuous checks) | High — the failure mode Driver 3 exists to prevent | `lint` script deleted this round (no step gates on it); `check-contrast` demoted with its reach documented; `[data-card]` assertions must be non-empty; AC-6/AC-8 selectors bound to `data-*` contracts |
| R12 | `themeColor` cannot follow the app's 3-way mode from a static export (only OS preference) | **Certain** | Low | `Viewport.themeColor` media-array (Step 8) + the limitation documented rather than silently half-fixed |
| R13 | 1024px breakpoint is unvalidated (spec risk #5, line 344) | Medium | Low — one CSS number | Step 4 implements it as a single `lg:` token; tested at 1023/1025, and width monotonicity is now an assertion |
| R14 | Four stacked `backdrop-filter` layers cost frames on low-end mobile (spec risk #4, line 342) | Medium | Medium | Out of scope to weaken glass (spec Non-Goal, line 85). Instrument: Playwright `page.evaluate` frame-timing on the tree while scrolling; if p95 frame > 32ms, escalate glass strength as the first lever, as the spec pre-authorises |
| R15 | The `repairable` / `ambiguous` split is added but only one bucket is rendered | Medium — it is exactly the shape of iteration 1's defect | High — P4 degrades to "ambiguity gets a one-shot toast" | Both buckets are rendered by 7h and asserted in `repair-banner.spec.ts`'s second case (`0 条可修复` **and** `1 条需指定`) |

---

## 6. Verification Steps

Concrete commands. Every AC maps to at least one line. **No gate is listed that cannot mechanically fail on the violation it guards.**

**Build gate (run after every step):**
```bash
cd /d/XiaomiMiMoProjects/laotagong && pnpm build            # exit 0, out/ regenerated
```

| AC | Verification | Command / check |
|---|---|---|
| AC-1 | Glass parameters byte-identical | `git diff app/globals.css` against the closed delta list (Step 3's verification item 4): no change to `blur(28px) saturate(170%)` (`:186`), the `125deg` `::before` (`:201-206`), or the three `.ambient span` rules (`:114-138`). **The `shasum out/index.html` check is deleted — it was impossible to satisfy (B4).** |
| **AC-2** | 5-level scale; h1 28/34; body ≥13px | `grep -cE '^\s*--text-[a-z]+:' app/globals.css` = **5**; and **`grep -cE '^\s*--text-\*: initial' app/globals.css` = 1**; and **`grep -rn "text-xs\|text-sm\|text-base\|text-lg\|text-xl\|text-2xl\|text-\[1[0-4]px\]" components/` → 0** (from 37 occurrences); `e2e/type-scale.spec.ts` computed-style assertions. **Iteration 1's check grepped only `text-\[1[0-2]px\]` and never `text-xs`, which is why 10 live `text-xs` uses — several of them body copy — passed while AC-2 was violated.** |
| **AC-3** | 8px grid — **PARTIALLY MET, reason recorded** | Named tokens exist: `grep -cE '^\s*--spacing-' app/globals.css` = **2**; base untouched: `grep -cE '^\s*--spacing:' app/globals.css` = **0**. **Consumption (non-blocking 2 — iteration 1 never checked this):** `e2e/spacing.spec.ts` asserts `getComputedStyle(card).paddingTop === "16px"` and `getComputedStyle(section).marginBottom === "32px"` on the real UI. **Not met:** the literal "全套切换到 8px 基准网格" — the surrounding utilities remain on Tailwind's base `--spacing: 0.25rem` (12px `p-3`, 12px `gap-3`), and redefining it is Severe. Recorded as partial, not claimed. |
| AC-4 | AA ≥4.5 both themes | **`e2e/contrast.spec.ts`** pixel sampling at the two worst-case spots in both themes, run twice for repeatability ±0.1; **`pnpm check:contrast`** exits 0 on token drift — and is documented as *unable* to answer AC-4 (B8). Plus the 2-spot DevTools reading (§4.4 item 2). |
| AC-5 | header/footer 100% width | `e2e/shell.spec.ts`: `header.getBoundingClientRect().width === innerWidth` at 375 and 1440; main container `maxWidth` ∈ {768, 1024} |
| **AC-6** | Header = exactly 3 **visual** elements | `e2e/shell.spec.ts`: `header [data-header-item]` length === **3**, asserted in **both collapsed and expanded search states**. Iteration 1 counted focusable elements while AC-6 says 视觉元素 and the brand is not focusable (`family-app.tsx:283-290`) — it could only ever match 2, and it would have "passed" only by an unrelated coincidence. |
| AC-7 | No data action in Header | `e2e/shell.spec.ts`: `header` contains no 导出/导入/设置/清空 text; all four present in `footer` |
| **AC-8** | Search + filter unified | `e2e/search.spec.ts`: `[data-search-root]` contains exactly one `input` and `≥3 [data-filter-chip]`. Iteration 1's "≥3 chips are descendants of that input's wrapper" was an unbound-selector class of defect — same as AC-6's. |
| AC-9 | Grouped by relation distance | `e2e/search.spec.ts`: group headers in order 祖辈/父辈/同辈/子辈/孙辈/未连接; an isolated fixture person is under 未连接; `test/family.derive.test.ts` for the BFS itself |
| AC-10 | No persisted generation | `test/family.sanitize.test.ts`: `Object.keys(createEmptyState())` deep-equals `["version","persons","parents","spouses","meId"]`; `e2e/key-hygiene.spec.ts`: exact localStorage key set after a full pass; `grep -rn "generation:" lib/ components/` → 0 |
| AC-11 | Selecting a result focuses + scrolls | `e2e/search.spec.ts`: click a result → `#focus-card` `boundingBox` within `[0, innerHeight]` and the breadcrumb name matches |
| AC-12 | MeCard 6 fields, RelativeCard 3 | `e2e/cards.spec.ts`: **`[data-card]` non-empty first**; then `[data-card=me]` innerText contains 籍贯/户籍/备注/生卒 and `[data-card=relative]` contains name + years only |
| AC-13 | Equal widths, aligned anchors | `e2e/cards.spec.ts`: all `offsetWidth` in a grid row equal; each `.connector` centre within **1px** of its column centre across a 2-generation fixture at 375/768/1024/1440 |
| AC-14 | 56px / 36px avatars, fallback | `e2e/cards.spec.ts`: `offsetWidth` = 56 for the 我 avatar, 36 for relatives; with no `photoUrl`, the element renders `person.name[0]` |
| AC-15 | Sheet form at 1024px, width monotonic | `e2e/sheet.spec.ts` at 375/1023/1025/1440, **plus `offsetWidth@768 ≤ offsetWidth@1440`** (the P5 edge) |
| AC-16 | No clipping; scrolls | `e2e/sheet.spec.ts`: with a 12-event person, the scroll container `scrollHeight > clientHeight`; 保存 still clickable. `min-h-0` is at the three call sites (`:384` owned by Step 4, `:961` by 7d, `:1190` by 7j), not in `sheet.tsx` |
| **AC-17** | **Bug fixed** | `e2e/bug-spouse-backfill.spec.ts` → **`AC-17: 先加子女后加配偶，子女设为「我」后另一位亲长可见`**; plus `test/family.links.test.ts` case 2 (from seeded raw JSON) and case 5a (the evaluation point) |
| AC-18 | Symmetric writes | `test/family.links.test.ts` case 1 (invariant over ~12 fixtures); **`grep -rn "parents: {" components/ hooks/` → 0 hits** (from 2) |
| AC-19 | `removeSpouseLink` semantics defined + tested | `test/family.links.test.ts` case 8 asserts parent links **survive**; the rule is written in `CLAUDE.md` |
| AC-20 | Multi-spouse defined, not silent | `test/family.links.test.ts` case 6 asserts `ambiguous.length === 1` and **no** parent bound; `test/family.repair.test.ts` case 11 asserts the ambiguity is surfaced; `e2e/ambiguous-picker.spec.ts` asserts the picker appears and 暂不指定 writes nothing |
| AC-21 | `photoUrl` + `events` exist | `test/family.sanitize.test.ts` cases 1-4; `grep -c 'photoUrl' lib/family/normalize.ts` ≥ 2 **and** `grep -rn 'photoUrl' lib/family/ \| grep -v -e types.ts -e normalize.ts` = 0 |
| AC-22 | Non-canonical dates tolerated | `test/family.sanitize.test.ts` case 5: `"约1950"`, `"?"`, `"1949-"` round-trip byte-identical; `grep -c 'inputMode="numeric"' components/sheets/person-edit-sheet.tsx` = **0** |
| AC-23 | Migration policy honoured | `test/family.sanitize.test.ts` case 6 (raw current-format v1 loads without loss); `grep -n 'STORAGE_KEY' lib/family/types.ts` = `"laotagong:family:v1"` unchanged; the "why no key bump" reasoning is in `CLAUDE.md` |
| AC-24 | CLAUDE.md complete | `wc -l CLAUDE.md` ∈ [120, 180]; contains all required sections (`grep -c` for 项目定位/命令/文件地图/数据不变量/易踩的坑/设计约定 = 6) and the P4 backfill exception clause |
| AC-25 | .gitignore additions | `grep -c '\.omc/\|\.remember/\|\.vercel/\|\*\.log' .gitignore` ≥ 4 |
| AC-26 | `.nojekyll` not ignored | `git check-ignore -v public/.nojekyll` → exit **1**; `git ls-files public/.nojekyll` → prints the path |
| AC-27 | README updated | `grep -c '照片\|家族事件\|Apple Style\|Liquid Glass' README.md` ≥ 4; `grep -c 'playwright install' README.md` ≥ 1 |
| AC-28 | Photo URL input → immediate update | `e2e/photo.spec.ts`: enter an absolute URL → the avatar's `<img src>` matches within one paint |
| AC-29 | Failed load → graceful fallback | `e2e/photo.spec.ts`: 404 origin → **no `<img>` remains**, initial-letter fallback rendered |
| AC-30 | Events CRUD in the sheet | `e2e/events.spec.ts`: add → appears; edit → text changes; delete → removed |
| **AC-31** | Events absent from card faces | `e2e/events.spec.ts`: **`await expect(page.locator('[data-card]')).not.toHaveCount(0)`** then assert no `[data-card]` innerText contains event text. Iteration 1's identical-looking check passed **vacuously on an empty NodeList** because no step created the attribute (B9). |
| AC-32 | No horizontal scroll at 375px | `e2e/shell.spec.ts`: `documentElement.scrollWidth <= clientWidth` at 375×667 on every route state (empty / tree / search open / sheet open) |
| AC-33 | Build + no 404 at the project path | `NEXT_PUBLIC_BASE_PATH=/laotagong pnpm build` exit 0; `e2e/basepath.spec.ts` asserts every response `< 400` |
| AC-34 | Both themes render | `pnpm test` (`test/theme.test.ts`) + `e2e/theme.spec.ts` screenshot pass in light and dark |

**Full gate before declaring done** (this is also, line for line, what `.github/workflows/deploy.yml` now runs — B2):
```bash
cd /d/XiaomiMiMoProjects/laotagong
pnpm install --frozen-lockfile                                     # proves the lockfile was written once and is stable
pnpm build                                                         # AC-33
pnpm test                                                          # unit + integration
pnpm check:contrast                                                # token-drift guard (NOT the AC-4 answer)
pnpm e2e                                                           # AC-2,4,5..17,20,28..34
NEXT_PUBLIC_BASE_PATH=/laotagong pnpm build && pnpm e2e            # AC-33 under project-site prefix
git diff --stat main..HEAD -- app/globals.css                      # AC-1: glass block untouched
git diff --stat main..HEAD -- .github/workflows/deploy.yml         # Driver 3: the gates actually run in CI
```

**Effort honesty.** Phase A (Steps 0-2) is the highest-value and lowest-risk third. Phase B (Steps 3, 3b, 4, 5) is shared-surface work that must be serial, and 3+3b are one landing. Step 6 is mechanical but **cannot be parallelised** and must not be attempted concurrently. Phase D (Step 7) is the largest block by wall-clock and is the only genuinely parallelisable phase — **as a 3-layer DAG, not as a flat fan-out**. Phase E is small and independent.

---

## 7. Changelog — how each blocking defect was addressed

| ID | Defect | v2 resolution |
|---|---|---|
| **B1** | Missed call site `family-app.tsx:162`; `parents:` gate unreachable at 1 hit; self-contradictory count | Step 2's edit table now enumerates **6 sites** (`:162`, `:171`, `:174`, `:187`, `:199`, `:216`) with `:226` explicitly reviewed-and-unchanged. `:162` routes through `addParentLink(next, focus, person.id, mode)` — **`addParentLink`, not `linkChildWithParents`**, because `mode` is the user's explicit 父亲/母亲 choice and `linkChildWithParents` derives the role from `gender`, which would silently override it. `addParentLink` is promoted to the **only** constructor of a `parents` value, so it becomes the single named target of the gate. Gate restated: `grep -rn "parents: {" components/ hooks/` 2 → 0. |
| **B2** | CI runs none of the new tests | `deploy.yml` added to Step 0's Files and §3.7. New `verify` job (`pnpm test` + `pnpm check:contrast`), new `e2e` job with `actions/cache` on `~/.cache/ms-playwright` + `playwright install --with-deps chromium` + `playwright-report` upload on failure; `build` job gains `needs: e2e`. `:36` changed from `--no-frozen-lockfile` to **`--frozen-lockfile`**. |
| **B3** | Required scripts had no creating Step and no owner | `scripts/check-contrast.mjs` + `test/fixtures/contrast-baseline.json` are **Step 3's** Files. `playwright.config.ts`, `e2e/helpers/**`, `e2e/fixtures/**`, `e2e/smoke.spec.ts` are **Step 0b's** — a new step that exists solely so `pnpm e2e` is valid from day one and no verification invokes a runner with zero inputs. Every later spec is owned by the step that needs it, and every spec appears in §4.3's owner column and in §3.7's `e2e/**` row. `scripts/`, `e2e/`, `test/` all have §3.7 rows. |
| **B4** | Step 3's `shasum of out/index.html unchanged` is structurally impossible | **Deleted.** `out/index.html` inlines a content-hashed CSS reference, so any `globals.css` edit changes it. Replaced by the AC-1 diff against a closed delta list (§6), which is the check that actually targets the AC. |
| **B5** | `@theme` only ADDs; AC-2 violated with a false-green check; no migration step | Added **`--text-*: initial;`** as the first `@theme` declaration (with the ordering caveat). Added **Step 3b 字阶迁移**, same agent as Step 3, same landing, mapped occurrence-by-occurrence (37 occurrences / 35 lines), **sequenced before Step 6** to preserve the move oracle. `components/ui/{button,label,input,sheet}.tsx` folded into 3b's write set and §3.7. AC-2's check rewritten to assert **zero remaining `text-xs`** (and the rest of the named namespace), from 37 → 0. |
| **B6** | Phase D's "disjoint files ⇒ parallel-safe" is false and contradicts the per-step build gate | 7a–7k rewritten as an explicit **3-layer DAG**: `7b→7a→7f`, `7c→7d`, `7i→7e/7h`, with `7g`/`7j` at layer 0 and a new serial **7k** holding all `family-app.tsx` integration. Only same-layer items run in parallel; `family-app.tsx` is single-writer throughout. |
| **B7** | Split boundaries unspecified; §3.7 contradicted the Step lists; P-1's signal false-alarmed | **Complete export ownership map** assigning all 16 previously-unowned exports (plus `firstPersonId`) to named files, with an acyclic dependency DAG and the reason for the split (`derive.ts` holding both getters and the repair detector would be circular). §3.7 reconciled against every Step list, with **`lib/theme.ts` given its own row**. P-1's signal replaced: it now detects a *second* field list (`normalize.ts` ≥2 hits, zero hits elsewhere) instead of demanding the intended duplication. |
| **B8** | AC-4's check re-ran the plan's own (five-layer-wrong) model | The five missing layers are documented (three-stop gradient at `--glass-strong` 0.11, `.ambient span { opacity: 0.7 }`, light/dark orb-alpha mix-up, the `::before` white sweep painting above in-flow text, and the true ≈4.4 for `--ink-faint`@0.72). `check-contrast.mjs` is **demoted to a token-drift regression guard** with its reach stated in the plan and in §4.4. AC-4's machine check is now **`e2e/contrast.spec.ts`**, which samples real pixels from a browser that already implements `blur(28px) saturate(170%)`, derives the sweep alpha from two measurements, and asserts ≥4.5 with a ±0.1 repeatability check. Token values are seeded from that sampler, not from arithmetic. |
| **B9** | `[data-card]` never created; AC-31 passed vacuously | **7a creates `data-card={isMe ? "me" : "relative"}`** on the card root. **Every** `[data-card]` assertion in §4.3 begins with `await expect(page.locator("[data-card]")).not.toHaveCount(0)`, and AC-31/AC-12/AC-13 in §6 all restate the non-empty precondition. |
| — | P1 violated (Step 2) | Resolved via B1: 2 literals → 0, `addParentLink` is the single constructor. |
| — | P4 violated (declared as a principle, narrowed in the execution column, violated by `addSpouseLink`'s backfill; `isUnambiguousBackfill` evaluation point unstated → AC-17 would recur) | **P4 rewritten** as "backfill only on unambiguous evidence, and it must be auditable and opt-in", with the AC-17 exception **declared as an exception** rather than hidden. Evaluation point **pinned to post-add**, documented at the definition, and pinned in both directions by tests 5a/5b. Auditability = `applied[]` surfaced in the banner and toast; reversibility honestly scoped as *recoverable, not undoable*, and recorded in CLAUDE.md. |
| — | P2 hole (banner dismissal location unspecified) | Dismissal is `useState` in `FamilyApp`, **memory-only, never persisted**, enforced by `e2e/key-hygiene.spec.ts`'s exact-key-set assertion rather than by a comment. |
| — | P5 edge (`sm:max-w-lg` → `lg:max-w-md` shrinks on desktop) | `sm:max-w-lg` **changed to `sm:max-w-md`**; width monotonicity (375 → 448 → 448) is asserted in `e2e/sheet.spec.ts` and listed under AC-15. |
| 1 | `getRelationDistances` return type | `Map<string, number \| null>`, with the `strict: true` compile-error reason stated. |
| 2 | AC-3's check never verified UI consumption | Named the swapping steps: **7a** for card padding (`family-app.tsx:845` → `p-card`), **7f** for section gaps (`:668/:695/:715` → `mb-section`). Gate is `e2e/spacing.spec.ts`'s computed-style assertions, not a grep. |
| 3 | AC-3 literally unsatisfiable | Recorded as **partially met + reason** in Step 3b, §5 R6, and §6's AC-3 row. Not claimed met. |
| 4 | AC-6 counted focusable elements; AC-8's chip selector unbound; where `SearchPanel` mounts unstated | AC-6 gate is `header [data-header-item]` length 3 in **both** search states. `SearchPanel` mounts as a **sibling** of `<header>` (stated in Step 5). AC-8 gate binds `[data-search-root]` / `[data-filter-chip]`. |
| 5 | `add-relation-sheet.tsx` had no owning step | New sub-step **7j** owns it, added to §3.7 and §4.3 (`e2e/ambiguous-picker.spec.ts`), and carries AC-16's `min-h-0` for `family-app.tsx:1190`. |
| 6 | Footer banner only consumed `repairable` | `findRepairableLinks` returns `{ repairable, ambiguous }`; **7h renders both buckets**; `repair-banner.spec.ts` asserts `0 条可修复` **and** `1 条需指定` on the two-spouse fixture (R15). |
| 7 | Step 4's AC-16 write set was wrong | `min-h-0` assigned to the call sites (`:384` Step 4, `:961` 7d, `:1190` 7j); `sheet.tsx` gets only `max-h`/`lg:max-h-[85vh]`, with the reason (`SheetContent` has no body wrapper) stated. |
| 8 | `<main>` missing `flex flex-1 flex-col`; `:304-336` unowned | `<main>` carries `flex flex-1 flex-col` (Step 5), with the reason (`TreeSection:666` and `EmptyState:555` lose their `flex-1` without it). The breadcrumb row is assigned: rewritten in place by Step 5, moved to `components/tree/breadcrumb.tsx` in Step 6, redesigned by 7f. |
| 9 | Step 0 missing `playwright install` / `serve` | Both added to Step 0; `e2e:serve` script defined; `README.md` documents the install command (Step 8). |
| 10 | Dead `lint` script | **Deleted** in Step 0, with the rationale (a dead gate trains distrust of red/green). |
| 11 | 8 helper classes with zero references | All eight (`globals.css:364-395`) verified 0-reference and deleted alongside `select option` (`:359-362`). |
| 12 | `@theme inline` reasoning wrong for this repo | Conclusion kept; rationale replaced — `:root` and `.dark` land on the same element (`layout.tsx:43` + `lib/theme.ts:32-33`), so non-inline would work here; `inline` is chosen for semantics and to avoid the implicit premise. The false claim is dropped. |
| 13 | `max-w-3xl` example wrong for the `--spacing` claim | Example replaced with utilities actually in the `--spacing` namespace (`p-3`, `gap-3`, `h-5`, `w-10`, `space-y-4`, `inset-x-0`); citation added (`node_modules/tailwindcss/theme.css:325`). |

---

## Appendix · Open items for the reviewer

1. **`d = 0` group label.** The spec writes `我(0)` (AC-9), but with spouse edges weighted 0 the ring also holds 配偶 and 兄弟姐妹. The plan labels it **同辈** with 我 marked inside. Flagged for confirmation, not re-litigated.
2. **`--ink-faint` tier collapse in dark mode.** Forced by AA over the cyan orb. The plan absorbs it into AC-2's scale-based hierarchy. If the reviewer prefers a visually distinct fourth grey, the only alternatives are weakening the dark orbs or a scrim — both barred by the spec's glass constraint.
3. **Repair banner is beyond the letter of the ACs.** AC-17 does not require it. It is included because without it, pre-existing broken data has no discoverable fix path, which is P-2. It now also carries the ambiguous bucket (item 6), so cutting it would leave P4's ambiguity handling unreachable — the cut is no longer free.
4. **`applyRepairs` is recoverable, not undoable.** A true undo needs a history log, which this plan does not build. The claim in P4 is scoped accordingly. If the reviewer wants real undo, it is a new sub-step with a new risk surface, and should be raised as a scope change rather than smuggled into 7h.
5. **AC-3's unmet half** is the one place the plan knowingly ships less than the AC's literal text. The alternative (`--spacing` redefinition) was judged Severe; the plan records the gap instead of negotiating it away.
