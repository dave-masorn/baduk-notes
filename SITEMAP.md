---
title: Project Sitemap
description: baduk-notes — Go/Weiqi board diagram annotator & SGF re-Player
version: 0.1.032
---

> A browser-based tool for annotating Go game records with board diagram exports, move-term detection, phase analysis, and interactive study mode.
> Serve at `http://localhost:8577/`

### Web Architect Diagram

How the application files interact — UI shell, script load order, scoring pipeline, docs build, and reference assets.

```
                        ┌───────────────────────────────────────────────┐
                        │                  index.html                  │
                        │  UI shell · boards · modals · study mode ·   │
                        │  export · style palette · score estimate     │
                        └───────┬───────────────────────────┬──────────┘
                                │ <script> load order       │ register
                     ┌──────────▼──────────┐     ┌──────────▼────────┐
                     │  sgf-parser.js      │     │  manifest.json    │
                     │  └─ SgfEngine       │     └───────────────────┘
                     ├─────────────────────┤     ┌─────────────┐
                     │  deadstones.bundle  │──┐  │  sw.js      │
                     │  └─ deadstones_bg   │  └─▶│ cache v3   │
                     │     .wasm           │     └─────────────┘
                     ├─────────────────────┤
                       │  board-estimate.js  │   BoardEstimate
                       │  └─ evaluateJapan-  │   evaluateJapaneseTerritory
                       │     eseTerritory    │   (TB/TW explicit ─┬─ flood-fill
                       ├─────────────────────┤    markup path     │  + freed dead-
                       │  goscorer.js        │    stone points)
                      │  goscorer.js        │   GoScorer.finalTerritoryScore
                     ├─────────────────────┤
                     │  liberties.js       │   Liberties (qi / BFS groups)
                     ├─────────────────────┤
                     │  move-term-detector │   _termHL (Sabaki patterns +
                     │  └─ _termHL         │   Tenuki/Sente/Gote detection)
                     ├─────────────────────┤
                     │  phase-detector.js  │   detectGamePhaseDynamic
                     ├─────────────────────┤   (Fuseki/Chuban/Yose)
                     │  game-tree.js       │   refreshGameTree
                     └─────────┬───────────┘
                               ▼
        ┌───────────────────────────────────────────────────────────┐
        │                    annotation_v4.js  (THE HUB)            │
        │  window.state · event listeners · canvas draw · exports  │
        │                                                            │
        │  loadSGF ───────────▶ SgfEngine.parseSgf / extractMainLine │
        │  runScoreEstimate ──▶ yellow panel (own AI + influence;  │
        │      never consumes recorded TB/TW markup)               │
        │      └─ Computational Method: blue panel + "Run / Compute >" at Game End │
        │           └─ markup DD/MA/TB/TW ──▶ explicit TB/TW card   │
        │           └─ no markup ──▶ amber warn → Manual Scoring    │
        │  resumeStudySession ──▶ loadSGF(rec.workingSgf) as-is       │
        │  findEndgameMarkup ──▶ DD/MA/TB/TW lookup (any node)        │
        │  replayToTerminal ──▶ score endgame position (any cursor)   │
        │  GoScorer ─────────▶ territory tally in scoring modal     │
        │  deadstones.guess ─▶ AI dead map (yellow panel, iter 200) │
        │  Liberties · phase-detector · _termHL · game-tree         │
        └───────────────────────────────────────────────────────────┘
```

```
 Docs build pipeline                     Reference / assets / build
 ─────────────────────                   ────────────────────────────
 SITEMAP.md ──┐                          Flexoki-light.json · Cupertino-light.json
 board-      │  sync-docs.js             Documentation-light.json · Github-light.json
 estimate.md ├─▶ tech-log/content/       ── palette references for the highlight
 liberties.md┘    docs/*.mdx             color system
                  │ next build           diff.txt ── Block 2 diff analysis
                  ▼                      fix_flipped.py ── flipped-board patch
              tech-log/out/              obsidian-things-main.zip ── Obsidian
                  │ cp -r                 theme reference
                  ▼                      package.json + package-lock.json
            tech-log-dist/ ──▶ http://   ──▶ esbuild ──▶ deadstones.bundle.js
                localhost:8577/              + deadstones_bg.wasm
                tech-log-dist/docs/
```

### v0.1.032 — Scoring Modal buckets no longer double-count dead stones (REC 002)

After v0.1.031 closed the blue-panel ⇄ modal score gap, the Scoring Modal's **Stone Buckets** still showed an inflated dead count: 6 White stones marked dead on the board appeared as **Dead: × 12** in Black's bucket. The score itself was already correct — this version fixes the bucket display (and the replace-availability counts) at its source.

1. **The score was never wrong, because it never reads the buckets.** The computing formulas and the Final read `countMarkedDeadStones` over the canonical `markedDead` grid — the game's true Life & Death set — so 6 dead White stones always counted once there (the v0.1.028 "marks, not buckets" principle).
2. **The bucket pills display the stack arrays, which the markup seed double-filled.** `updateScoringUI` renders the Black bucket's *Dead:* pill from `scoringState.deadWhite.length`, and `resetScoringBoardFromState` seeds those stacks by calling `applyMark` four times — `DD`, `MA`, `TB` (marks opponent stones inside declared territory dead), `TW`. That seed had **no duplicate guard**: a dead White stone that appears in both the `DD`/`MA` dead list *and* inside the `TB` Black-territory bounds was pushed into `deadWhite`/`bucketBlack` **twice** → 6 stones became × 12. Manual clicks and the auto-seed (`seedAutoDeadMarks`) already guard with `!markedDead`; the markup seed was the only path that didn't.
3. **Two fixes, both mirroring "the marks are canonical":**
   - **Seed dedupe** — `applyMark` now skips any point already in `markedDead`, so the four markup passes can never double-push a stone that legitimately belongs to more than one list (dead + enclosed-by-territory).
   - **Restore self-heal** — `restoreScoringFromSavedData` rebuilds `deadWhite`/`deadBlack` from `markedDead`/`deadStonesInfo` instead of trusting the persisted arrays, so sessions saved before this fix show the true count on reopen (the bucket arrays are pure mirrors of the marks, so this is always exact).

(Headless-verified: a 5×5 ring harness where the same stones sit in both the dead list and the territory bounds shows the bucket count matching the marks (was 2× before the guard); the restore-rebuild path turns a persisted 18-entry stack for 9 marks back into 9; `test_estimate.js` passes; `node --check` clean.)

### v0.1.031 — Blue panel ⇄ Scoring Modal: dead-stone points now count as territory (REC 002)

The blue Computational Method (JTS) and the Manual Scoring Modal (MSM) must read the **same** Japanese score for a saved record. On REC 002 they did not: JTS showed Black territory 43 with a W+11 result, while MSM showed Black territory 49 → W+5. The two surfaces agreed on arithmetic (territory + prisoners + komi) but disagreed by exactly **6** on Black territory — and that 6 is precisely the number of White stones marked dead. This version closes the gap at its source.

1. **MSM counts a scrubbed dead stone's point as territory; JTS did not.** MSM's territory tally runs `territoryScoring` (GoScorer) over the board with dead stones lifted — a White stone marked dead becomes a Black prisoner **and** its intersection is counted as Black territory (49 total). JTS's blue panel, by contrast, counts territory from the explicit `TB`/`TW` point lists the session converter (`computeScoringPropsFromSession`) writes. That converter only marks **empty** intersections — `if (row[c] !== 0) continue;` — so a cell still holding a stone was never emitted as a territory point. The 6 dead White stones were therefore missing from `TB` → Black territory 43. Both surfaces then summed the same way, so the 6-point hole surfaced as a 6-point score difference (W+11 vs W+5).
2. **Japanese rules side with MSM.** A stone marked dead is captured; its point is enclosed by the opponent and becomes opponent territory. So the dead-stone cells belong in Black territory, and the blue panel was shortchanging Black by exactly the dead count.
3. **The fix — count freed dead-stone points in the explicit path.** `evaluateJapaneseTerritory` already scrubs dead stones from its working grid before scoring. When it counts an explicit `TB`/`TW` list (which knows nothing about the dead stones' points), it now also flood-fills the scrubbed grid and adds each scrubbed dead stone's freed point as territory for its enclosing color — a freed point in a mixed (dame) region stays uncounted. The flood-fill owner map is computed once and shared, so the markup-less fallback path is unchanged.

(Verified: a 5×5 harness with one dead White stone inside a Black ring previously reported JTS Black territory 8 vs GoScorer's 9 — now 9 == 9 with full totals matching (MSM 10 == JTS 10); `test_estimate.js` passes; `node --check` clean.)

For REC 002 this changes the blue panel from Black 43 / W+11 to Black 49 / W+5, matching the modal.

### v0.1.030 — Score Estimate ⇄ Computational Method: YSE now always runs its own estimation

The yellow Score Estimate (YSE) and the blue Computational Method (JTS) must always compute **separately** — JTS scores recorded markup, YSE estimates on its own. They were not: on the last move of a saved study record, YSE silently stopped estimating and replayed JTS's recorded territory as a fixed value. This version breaks that link at the one point where it could form.

1. **YSE varies per run because its AI is seeded randomly.** `deadstones.guess` seeds its Monte Carlo search with `Date.now()` (deadstones.bundle.js), so every Estimate gets a different dead-stone map — that is the "gives a different estimation each time" behavior. `board-estimate.js` has no randomness of its own, so a **fixed** YSE output can only mean the AI never ran.
2. **On the last move, YSE stopped estimating and replayed recorded territory.** `runScoreEstimate` read the last move's `territory` (`TB`/`TW`) from `state.sgfMoves[last]`, and `BoardEstimate.estimate` short-circuits the whole AI whenever `territoryBlack`/`territoryWhite` are non-empty — it builds the map purely from those recorded points. Deterministic. Fixed.
3. **That recorded territory IS the JTS source.** Since v0.1.026, `saveScoringResult` writes the scoring session's `DD`/`MA`/`TB`/`TW` into `rec.workingSgf`; on resume, `loadSGF` parses them back into the last move's `.territory`. The "fixed" last-move value was literally the markup JTS produced — JTS writes, YSE consumes. The recorded-territory read itself is ancient (initial commit) but stayed dormant while saved games carried no `TB`/`TW`; it activated once saves began writing territory into the SGF, which is why the interference only appeared recently.

**Not a culprit:** `DD`/`MA` never reach `estimate()` — only `TB`/`TW` can short-circuit it. So the fix needed to stop feeding recorded territory, and nothing else.

**The fix — isolation at the single feed point:** `runScoreEstimate` no longer passes recorded `baselineTerritory`/`move.territory` into `estimate()` — `territoryBlack`/`territoryWhite` are always empty, so YSE **always runs its own AI + influence estimation**, regardless of any `TB`/`TW` in the SGF or saved by a scoring session. `BoardEstimate.estimate` has exactly one caller, so no other surface changes behavior.

(Verified: `node --check` clean; `test_estimate.js` passes; with empty territory `estimate()` runs the AI path.)

### v0.1.029 — Blue-panel ⇄ Modal-final capture parity (REC 002)

Closes the last parity gap between the blue "Computational Method" Run score and the Manual Scoring Modal's FINAL badge. When a saved scoring session exists, the blue panel and the modal's Final now derive from the **same canonical captures**:

1. **The blue panel reads `baseCaptures`, not the editable capture fields.** The modal's FINAL badge (`scoring-result-display`) is anchored to `baseCaptures` — the game's actual captures, which Replace/capture edits (`blackCaptures`/`whiteCaptures`) never move. `resolveScoringInputs` previously fed the session's editable `blackCaptures`/`whiteCaptures` into `BoardEstimate.evaluateJapaneseTerritory`, so after the user replaced captured stones the blue panel showed a different total than the modal's Final (e.g. `W+7.5` vs `W+6.5`). The resolver now mirrors the Final's expression verbatim: `baseCaptures` wins, legacy sessions without `baseCaptures` fall back to `blackCaptures`/`whiteCaptures` (identical to `restoreScoringFromSavedData`'s fallback), so the two surfaces can never drift on the captures term.

(Headless-verified: 23 harness scenarios — the new scenario W asserts a saved session carrying both `baseCaptures: {0,0}` and editable `blackCaptures: 3 / whiteCaptures: 4` feeds the scorer `0/0` — plus 10 regression probes; Probe J reverts the resolver to the editable fields and W fails.)

### v0.1.028 — Manual Scoring Modal: goscorer auto-dead seeding + canonical Final anchor

Completes the Manual Scoring Modal's L&D edits with three fixes:

1. **First-entry goscorer dead stones are shown and counted like manual marks.** On the first open of the Manual Scoring Modal per game, when no endgame `DD`/`MA`/`TB`/`TW` markup resolves, `resetScoringBoardFromState` now runs `seedAutoDeadMarks()`: it runs `BoardEstimate.detectDeadStonesHeuristic` (Sabaki) on the **canonical game board** and folds every detected stone into the same `markedDead` / `deadStonesInfo` / dead-bucket structures a manual click writes. The modal shows the marks (X) and their territory immediately, and they count in the Computing formulas, the Final, and the saved props as ONE combined set with the user's own marks.
2. **The Final W+1 is anchored to the untouched game position.** `resetScoringBoardFromState` captures `baseBoard` (deep copy of the game board) and `baseCaptures`; the Final badge (`scoring-result-display`) is recomputed from `baseBoard` + the current mark set + `baseCaptures` (falling back to the display board for legacy sessions). Re-Arranging/Replacing dead stones still mutates `scoringState.board` — which is exactly what the per-color Computing lines (territory + dead + caps + komi) are meant to teach — but they can **never** move the game's real result, nor the saved `DD`/`MA`/`TB`/`TW` (that converter also derives from `baseBoard`). Marking/unmarking a stone dead remains a legitimate edit that moves both.
3. **Dead-stone accounting now comes from the marks, not the buckets.** The formulas' dead term is `countMarkedDeadStones()` over `markedDead`/`deadStonesInfo`, so recorded, auto-seeded and manual marks count identically, and Replacing a dead stone (which pops a bucket for placement) never changes the count.

Also in this version:

4. **Recorded markup dead stones seed the mark set on reset.** The `applyMark` seeding path now also fills `deadStonesInfo` and the dead/bucket stacks, so a resolved `DD` markup is indistinguishable from the user clicking the same stone.
5. **The dead "Auto Dead / Unselect Dead Stones Button" is removed** from the modal sidebar (`index.html` block, the `updateScoringUI` wiring, and the now-unused `autoMarkDeadStones` / `hasAnyDeadStones` helpers are gone) — dead-stone detection is automatic and unified.

(Headless-verified: 22 harness scenarios — auto-seed parity, canonical-Final anchoring across rearrange/replace, snapshot persistence of `baseBoard`/`baseCaptures` with legacy fallback, recorded-mark seeding, button removal — plus 9 regression probes, each confirming a fix has a failing test when reverted.)

Three-part fix completing the v0.1.026 parity work:

1. **Manually marked territory no longer falls back to auto-derived territory.** `saveScoringResult` previously wrote `rec.scoringData` without `manualTerritory` (and without `frozen`/dirty flags), so reopening the modal or re-running the score silently discarded the user's explicit territory marks and re-derived them automatically. `saveScoringResult` now persists the **exact last-edited board** as the per-REC snapshot.
2. **The Scoring Modal's educational edits are remembered per REC**, stored in localStorage (not SGF): lifted dead stones, manual territory marks, rearrange/replace buckets, captures, komi, rule/interaction mode, and frozen state. Only `DD`/`MA`/`TB`/`TW` go into the SGF (`rec.workingSgf`), regenerated on save.
3. **All consumers derive identical `DD`/`MA`/`TB`/`TW`** from one shared converter, so the REC SGF file, the export, the modal prop-bars, and the main board can never drift.

Also in this version:

4. **Sound restored across browsers.** All SFX (`stone`, `remove`, `annot`, `board flip`, `replay`) are pre-unlocked on the first user interaction — modern browsers (Chrome/Safari/Firefox) block `HTMLAudioElement.play()` until the page receives a user-activation gesture, so after a browser update or a drop in media-engagement status sounds can stop even though the files load fine. `unlockSfxOnFirstGesture()` (in `annotation_v4.js`, right after the SFX element declarations) silently plays each element muted on the first `pointerdown`/`keydown`/`touchstart` and pauses it, satisfying the autoplay policy for the whole session. No mute toggle involved; the code path and audio files were verified intact (the logs show all `_sfx/*` files served successfully).
5. **Version-sync system is now self-maintaining and documented.** `sync-docs.js` derives the version from the `SITEMAP.md` frontmatter and auto-patches the `index.html` header label, `TECH_LOG_VERSION` in `tech-log/src/lib/version.ts`, and the `tech_log-{version}.html` redirect (see *SSOT Sync System* in the Tech Log System chapter).

### v0.1.027 — Manual Scoring snapshot persistence + session ⇄ SGF sync (single source of truth)

#### Shared converter — `computeScoringPropsFromSession(session)`

Module-level SSOT function that turns a session-shaped object (`scoringState` or `rec.scoringData`) into `{ dd, ma, tb, tw, board: stonesWithDead, rawCounts }`:

- `DD`/`MA` from `markedDead`; `stonesWithDead` like before;
- `TB`/`TW` = explicit `manualTerritory` wins (1 = black, 2 = white); else GoScorer auto-derived;
- guards null `markedDead`/board rows; honors `session.ruleMode || 'japanese'`.

Both `computeSgfPropsFromScoringData(data)` (export/viewer/inject/session-fallback — kept its `null` guard, which some consumers depend on) and `computeSgfPropertyBars()` (modal bar widget) now delegate to it, replacing two implementations that could drift.

#### `buildScoringSessionSnapshot()` — one builder for every persisted copy

Single snapshot builder used by both `closeScoringModal` (→ `_scoringPersistData`) and `saveScoringResult` (→ `rec.scoringData`). `saveScoringResult` finalizes the session state **before** building the snapshot: `_scoringDirty = false`, `_scoringHasSaved = true`, `setScoringFrozen(true)` (all unconditional — record-or-not), then persists the snapshot and regenerates `rec.workingSgf` so downloaded SGFs carry `DD`/`MA`/`TB`/`TW`.

#### Legacy migration — `normalizeScoringSession(session)`

Records saved before v0.1.027 have `scoringData` with no `manualTerritory` key. `normalizeScoringSession` returns the session unchanged if it already has manual territory marks; otherwise it looks up `findEndgameMarkup(false)` (SGF tree only — never the session being normalized) and, if the tree has `TB`/`TW`, returns a **new** session object with `manualTerritory` backfilled (1 = black, 2 = white) on empty, non-dead intersections. Used in `resolveScoringInputs`'s session tiers and in `restoreScoringFromSavedData` (which swaps in the backfilled `manualTerritory`). So a legacy record's recorded territory is treated as the user's explicit territory, not re-derived.

#### `findEndgameMarkup(includeSession)`

New opt-out param on the session fallback tier (`includeSession !== false`), so backfill reads only the SGF tree.

#### Territory seeding on reset

`resetScoringBoardFromState` now also seeds `manualTerritory` from the resolved markup's `TB`/`TW` (empty, non-dead intersections only) — a freshly opened session shows the recorded territory explicitly instead of silently auto-deriving.

#### Export/viewer backstop sync

Both injection sites (export ~line 2165 and viewer ~line 2255) now use `hasAllSgfScoringProps(sgfStr, props)` (checks each non-empty prop's `DD[`/`MA[`/`TB[`/`TW[` presence in the SGF string) and inject session-derived props whenever any is missing — replacing the old `!DD[ && !TB[` guard.

(Headless-verified: 17 harness scenarios — snapshot persistence incl. manual territory + frozen; prop-bar vs converter identity; legacy backfill; reopened-modal restore; plus probes confirming each fix has a failing test when reverted.)

### v0.1.026 — Unified scoring-input resolution (blue panel ⇄ Manual Scoring parity)

Fixes the residual mismatch where the blue-panel Run score differed from the Manual Scoring Modal's score for a saved study record. The fix is **not** a per-record patch and **not** a `source` flag branching the scorer — it is a single canonical resolution chain consumed identically by both surfaces.

#### `resolveScoringInputs()` — one canonical snapshot, one precedence chain

New module-level helper returns a single `{ board, captures, komi, handicap, deadStones, tbPoints, twPoints, hasMarkup, positionLabel, provenance, markupMove }` snapshot. `runComputationalMethod` no longer extracts markup itself; it consumes this snapshot only. Precedence (strict, game-agnostic — the most recent, user-confirmed resolution wins):

1. **Live session memory** (`_scoringPersistData`) — the first source `openScoringModal` restores;
2. **Persisted study `scoringData`** (`rec.scoringData`) — the second source the modal restores;
3. **SGF endgame markup** (`DD`/`MA`/`TB`/`TW`) resolved anywhere in the record (`findEndgameMarkup`).

A session that carries **no resolution** (no dead marks, no territory) is skipped so the record's own markup can still drive the score; a session that resolves anything is authoritative over markup — because it is the exact board+marks snapshot the modal displays. Because tiers 1–2 mirror `openScoringModal`'s restore order, the Run control always scores what the reopened modal shows.

Session parity is exact: the snapshot feeds the scorer the session's own board (dead stones re-inserted via `deadStonesInfo`), the session's captures, the session's komi, and territory derived by the same `computeSgfPropsFromScoringData`/`GoScorer` path the modal's bar widget uses — with `handicap` forced to 0 because the modal's displayed formula (`territory + dead + captures + komi`) never includes a handicap term. The blue panel's provenance caption states the source (`Manual Scoring session` vs `SGF endgame markup (DD/MA/TB/TW)`).

#### Single source of truth for session → markup

`computeSgfPropsFromScoringData(data)` was hoisted from inside `setupEventListeners` to module top level (it is a pure function of `data`). It now also returns `board` — the session board with lifted dead stones restored to their original colors — and is shared by the modal export path, `findEndgameMarkup`'s session fallback (step 6 below), and `resolveScoringInputs`, so every consumer derives identical `DD`/`MA`/`TB`/`TW` sets.

#### `findEndgameMarkup()` — step 6 (session fallback) now uses the shared converter

The session fallback previously hand-derived `DD`/`MA` from `markedDead` and `TB`/`TW` only from `manualTerritory`. It now delegates to `computeSgfPropsFromScoringData`, so its territory derivation (GoScorer / `manualTerritory`) always matches the modal's for the same session.

`window.resolveScoringInputs` and `window.findEndgameMarkup` are exposed for console diagnostics.

(Headless-verified: 13 harness scenarios; a saved session wins over a stale raw-main-line `DD`/`MA` node with no record-specific logic, and the scorer receives the session's exact dead/captures/komi inputs.)

### v0.1.025 — Algorithmic Endgame Markup Resolution + Fresh Manual Scoring

Fixes for the "No DD/MA/TB/TW Endgame Markup Found" false-negative (REC 002) and the stale-dead-marks bug in Manual Scoring. Both are **algorithmic and game-agnostic** — they resolve markup for any record regardless of where loadSGF placed (or failed to fold) the props, instead of per-game patches.

#### Algorithmic markup lookup — `findEndgameMarkup()`

New module-level helper that returns the first node carrying `DD`/`MA`/`TB`/`TW`, searching in order:

1. the move currently under the replayer (`state.sgfMoves[state.currentMoveIndex]`),
2. the **last** markup-bearing move in `state.allSgfMoves` (full sequence),
3. the **last** markup-bearing move in the (possibly filtered) `state.sgfMoves`,
4. root-level props (`state.sgfRootProps` / `state.sgfMetadata.tb` / `.tw`),
5. the **last** markup-bearing raw node in `SgfEngine.extractMainLine(state.sgfTree)` — covers terminal annotation-only nodes that loadSGF could not fold onto a move,
6. the study record's **saved scoring session** (`rec.scoringData`) via the shared `computeSgfPropsFromScoringData` converter — for records whose `workingSgf` string never received the props.

`runComputationalMethod` uses this instead of the old "current move, else last `allSgfMoves`" check, so a game whose markup sits on the root, on a non-move terminal node, or anywhere in the main line scores explicitly and never halts with the warning. (Headless-verified: markup node beyond the old 12-node fold window and root-level `TB`/`TW` both resolve.)

#### Terminal-markup fold — full main-line scan

The loadSGF fold previously scanned only the last 12 main-line nodes (`mainLine.length - 12`). It now finds the last **move** node in the main line and scans **only the annotation-only nodes strictly after it** for endgame markup, folding it onto the final move. No arbitrary window — and mid-game markup is never folded onto the final move.

#### Manual Scoring Modal — fresh marks on every open

Two changes fix the "reopened modal shows outdated dead-stone marks" bug:

- **`openScoringModal(savedData)`** now restores the most recent session when called without explicit data (e.g. from the Estimation panel's **Open Manual Scoring Modal** button): first `_scoringPersistData` (the session closed most recently), then `StudyRecordDB.getRecord(state.activeStudyId).scoringData` — so a fresh page load still shows the latest saved marks.
- **`resetScoringBoardFromState()`** now seeds `scoringState.markedDead` from the game's own `DD`/`MA`/`TB`/`TW` markup (via `findEndgameMarkup`): `DD`/`MA` points are marked dead directly; opponent stones inside `TB`/`TW` territory bounds are dead. A fresh session starts from the game's resolved Life & Death marks instead of an empty board.

#### Resume vs Download markup parity (correction)

Earlier docs claimed `resumeStudySession` injects `DD`/`MA`/`TB`/`TW` before `loadSGF`. That is **not** what the code does: `resumeStudySession` calls `loadSGF(rec.workingSgf)` as-is (annotation_v4.js:3019), and markup injection exists only in the export/viewer paths (`exportStudySessionSgf` / `openSgfCodeViewerModal`). Persisted markup in a resumed game comes from `saveScoringResult`, which writes the four properties into the terminal node's `unknownProps` **and** mirrors them onto its direct `DD`/`MA`/`TB`/`TW` fields. With `findEndgameMarkup()`, a resumed game scores explicitly whenever its `workingSgf` carries the markup anywhere — no injection step required.

#### Computational Method (Estimation modal) — blue panel + gated Run control

On `⌘+Shift+E` the yellow Estimation overlay always renders the **"Computational Method (Japanese Territory Rules)"** blue panel (`#computational-estimate-card`). Its Run control is gated on Game End:

- **Before the final move** — the blue panel shows an *"Available Only Upon Game End"* notice (no button); an exact Japanese score only makes sense once the replayer reaches the final move.
- **At the final move** — the panel shows the **"Run / Compute >"** button.
- **Run with markup** → renders the explicit scoring detail (`#computational-method-result`, section *3. Explicit Territory Counting (TB/TW Markup)*).
- **Run without `DD`/`MA`/`TB`/`TW`** → renders an amber warning (*"No DD/MA/TB/TW endgame markup found"*) with an **Open Manual Scoring Modal** button — instead of any automatic flood-fill fallback.

## Project Purpose

baduk-notes is a single-page web application for Go players and annotators.

- **Import SGF game records** via file drop, paste, or file picker
- **Navigate moves** with keyboard, mouse wheel, or playback controls
- **Annotate boards** with stones, markers (triangle/square/circle/cross), labels, and comments
- **Detect move terms** automatically (Stretch, Hane, Cut, etc.) using Sabaki's pattern library, plus custom add-on detection (Tenuki, Sente, Gote, Skirmish, Local Response)
- **Detect game phase** dynamically (Fuseki → Chuban → Yose) using spatial heuristics, board geometry, group safety analysis, and ML logistic regression
- **Study games** in a dedicated fullscreen study mode with cropped/zoomed board views
- **Export high-resolution PNG diagrams** with customizable board appearance
- **Customize board appearance** live via a draggable floating palette (stone colors, board textures, grid, coordinates)
- **Insert coordinate references** into comments using ref-Point (intersection coords) and ref-Area (board block regions)

## Application Files

### Core (~25,000 lines total)

| File | Lines | Description |
| --- | --- | --- |
| `index.html` | 2,588 | Main HTML — all UI layout, floating panels, study modal, canvas elements, game tree, ref-Area/ref-Point buttons |
| `annotation_v4.js` | 16,330 | Main app — state, SGF parsing, board rendering, canvas drawing, event listeners, export, capture animation, comment coord highlights, hoshi highlights, ref-Area/ref-Point modes, SGF comments toggle, study-record resume (loads `workingSgf` as-is via `loadSGF`), algorithmic endgame-markup resolution (`findEndgameMarkup` searches current move → full/filtered sequences → root props → raw main line → saved scoring session), unified scoring-input resolution (`resolveScoringInputs`: live session → saved `rec.scoringData` → SGF markup; consumed identically by the Run panel and the modal for exact blue-panel ⇄ modal parity), score-estimate isolation (`runScoreEstimate` never feeds recorded `TB`/`TW` territory into `estimate()`, so YSE always runs its own AI + influence estimation), terminal-markup fold over all annotation-only nodes after the last move, Computational Method blue panel with "Run / Compute >" control (shown only at Game End; no markup → amber warn to use Manual Scoring Modal; the modal restores the latest persisted/saved session and seeds dead stones from `DD`/`MA`/`TB`/`TW`), explicit `DD`/`MA`/`TB`/`TW` scoring, dead-bucket dedupe in markup seeding + restore-time rebuild from marks (buckets always mirror the canonical `markedDead` set), `replayToTerminal()` |
| `annotation.css` | — | All styles — board canvases, floating panels, badges, progress bar, responsive layout |
| `move-term-detector.js` | 1,237 | Move-term system — Sabaki pattern matching, Tenuki/Sente/Gote detection, `_termHL` highlight object, badge UI, hover/leave handlers, polling, CSS injection |
| `game-tree.js` | 1,003 | Game tree rendering — main tree + footer tree, node properties, branch paths, wheel navigation, polling, `refreshGameTree()` |
| `sgf-parser.js` | 800 | `SgfEngine` namespace — SGF parsing, board size, setup properties, markup, cloneTree, extractMainLine |
| `board-estimate.js` | 702 | Score estimation engine — `evaluateJapaneseTerritory` (explicit `DD`/`MA`/`TB`/`TW` scoring; the explicit path additionally flood-fills the scrubbed grid and counts each dead stone's freed point as territory for its capturer, matching the Scoring Modal; the flood-fill fallback is retained internally but is no longer surfaced by the Computational Method, which instead warns the user to mark dead stones in the Manual Scoring Modal) and `estimate` (the YSE path — when called from `runScoreEstimate` with empty territory it always runs its own AI dead-map + influence computation, never short-circuited by recorded `TB`/`TW`; uses `deadstones.bundle.js` for the AI pass) |
| `goscorer.js` | 1,504 | `GoScorer` namespace — scoring-modal territory counting, `finalTerritoryScore()`, komi/captures tally |
| `deadstones.bundle.js` | — | WASM bundle — dead stone detection (`@sabaki/deadstones`, esbuild build) |
| `deadstones_bg.wasm` | — | WASM binary for dead stones |
| `liberties.js` | 284 | Liberty counting and group analysis |
| `phase-detector.js` | 757 | Game phase detection (Fuseki/Chuban/Yose) — spatial heuristics, group safety, ML logistic regression |
| `sw.js` | — | Service worker (`go-annotator-cache-v3`, network-first) |
| `manifest.json` | — | Web app manifest |
| `playai.html` / `playai.css` | — | Play AI interface (separate page) |

### Configuration

| File | Description |
| --- | --- |
| `package.json` | npm config |
| `package-lock.json` | npm lock file |
| `.agents/AGENTS.md` | Agent instructions |

### Test / Dev Scripts

| File | Description |
| --- | --- |
| `test3.js`, `test4.js` | General tests |
| `test_ascii.js` | ASCII board rendering tests |
| `test_board.js` | Board logic tests |
| `test_border.html` | Border rendering test page |
| `test_ds.js`, `test_ds_node.js`, `test_ds_node2.js` | Dead stones tests |
| `test_estimate.js` | Score estimation tests |
| `test_exact.js` | Exact pattern matching tests |
| `test_grad.html` | Gradient rendering test page |
| `test_heuristic.js` | Heuristic detection tests |
| `test_mock.js` | Mock data tests |
| `test_puppeteer.js` | Puppeteer screenshot tests |

### Python Patches

| File | Description |
| --- | --- |
| `fix_flipped.py` | Fix flipped board positions |
| `patch_border.py`, `patch_border_w.py` | Border drawing patches |
| `patch_detector.py` | Detector patches |
| `patch_gradient.py` | Gradient patches |
| `patch_names.py` | Name display patches |
| `patch_section_borders.py` | Section border patches |
| `revert_gradient.py` | Gradient revert patches |

### WASM Build Scripts

| File | Description |
| --- | --- |
| `wasm_b64.js` | WASM base64 encoding |
| `write_ds_node.js` through `write_ds_node4.js` | Dead stones node builds |
| `write_ds_test.js` | Dead stones test build |

### Documentation

| File | Description |
| --- | --- |
| `SITEMAP.md` | This file — project architecture sitemap |
| `SGF_COMPLIANCE_UPGRADE_LOG.md` | SGF FF[4] compliance upgrade log |
| `board-estimate.md` | Board estimation docs |
| `liberties.md` | Liberties docs |

### Reference / Theme Files

| File | Description |
| --- | --- |
| `Flexoki-light.json`, `Cupertino-light.json`, `Documentation-light.json`, `Github-light.json` | VS Code theme JSONs — reference palettes for the board highlight color system |
| `diff.txt` | Block 2 diff analysis artifact |
| `obsidian-things-main.zip` | Obsidian "Things" theme reference zip |

## Comment Reference Tools

Two new tools in the comment editor allow annotators to insert board references directly into SGF comments. Both are toggle buttons in the comment control bar (next to "Edit / Add").

### ref-Point

**Button:** `#btn-ref-point` — "Click intersection to insert coord (e.g. C11)"

**State:** `state.refPointMode`, `state.refPointCells[]`, `state.refPointInsertPos`

**Algorithm:**
1. User clicks the ref-Point button while editing a comment → mode activates, cursor position is recorded
2. Each click on a board intersection toggles that point in/out of the selection set (`state.refPointCells`)
3. The coordinate string is rebuilt from all selected points (format: `C11, D12, E13`) and inserted at the saved cursor position in the textarea
4. Coordinate computation respects POV flip: `colIndex = fc >= 8 ? fc + 1 : fc` (skips 'I'), row = `19 - fr`
5. Clicking the same point again deselects it; the coord string updates live
6. Toggling the button off clears all selected points

**Visual:** Selected points are rendered on the canvas as highlighted cells during ref-Point mode.

### ref-Area

**Button:** `#btn-ref-area` — "Select board blocks to reference in comment"

**State:** `state.refAreaMode`, `state.refAreaCells[]`, `state.refAreaHoverCell`, `state.refAreaInsertPos`

**Algorithm:**
1. User clicks the ref-Area button while editing a comment → mode activates, `{` is inserted at cursor position
2. The board is divided into an 18×18 grid of "blocks" (each block spans one cell-width between intersections)
3. Each click on a block toggles it in/out of the selection set (`state.refAreaCells`)
4. The cell list is rebuilt from selected blocks (format: `cell(A1), cell(B2), cell(C3)`) and inserted between the `{` and `}` delimiters in the textarea
5. On hover, the current block is previewed via `state.refAreaHoverCell` and drawn on the canvas
6. Toggling the button off: if no cells were selected, the `{` is removed; if cells were selected, a closing `}` is ensured

**Output format in comment:** `{cell(A1), cell(B2), cell(C3)}` — this is parsed by the comment highlight system to render board highlights.

## Highlight Color System

The move-term detector uses two independent highlight layers to classify each move. Both are extracted simultaneously by `detectCurrentMoveTerm()` and stored in the `_termHL` object.

### Blue Highlights — Sabaki Pattern Matches

| Aspect | Detail |
| --- | --- |
| **Source** | `findPatternInMove()` in move-term-detector.js — ported from @sabaki/boardmatcher v1.3.0 |
| **What it detects** | Classical Go shapes: Stretch, Hane, Cut, Diagonal, Turn, Wedge, Mouth Shape, Tiger's Mouth, Empty Triangle, Bamboo Joint, Table Shape, etc. (~40 patterns) |
| **Data origin** | `patternMatch.match.anchors` + `patternMatch.match.vertices` — board positions that form the matched shape |
| **Visual (fill)** | Blue `rgba(0, 130, 240, 0.4)` circle on each matched stone position |
| **Visual (ring)** | Blue `#0082F0` circle outline, 3px, around matched stones |
| **Visual (connection)** | Blue dashed rectangle connecting two matched stones (when exactly 2) |
| **Badge label** | Pattern name (e.g., "Hane", "Cut", "Stretch") |
| **Sensei's Library link** | Yes (e.g., `https://senseis.xmp.net/?Hane`) |
| **Global variable** | `window._highlightedCells` (array of `[col, row]` pairs) |

### Green Highlights — Add-on Term Detection (Tenuki / Sente / Gote)

The `evaluateTenuki()` function detects tactical and strategic context beyond simple shape patterns. It evaluates the relationship between the current move and surrounding moves using board zones, Manhattan distance, and local interaction analysis.

| Term | Japanese | Definition | Detection Logic |
| --- | --- | --- | --- |
| **Tenuki** | 手抜き | Ignoring your opponent's local move to play somewhere else on the board | Current move is far from previous move (Manhattan distance ≥ 5) AND in a different/non-adjacent zone AND no local opponent stones nearby |
| **Sente** | 先手 | A move that forces your opponent to reply locally; if they ignore it, they suffer a major loss | After playing the current move, the next move in the game responds locally (distance < 5 or interacts with played stones) — indicating the opponent *had* to answer |
| **Gote** | 後手 | A move that does not force an immediate local reply, meaning the player who plays it gives up the initiative to the opponent | After playing the current move, the next move in the game goes elsewhere (distance ≥ 5 and no local interaction) — indicating the opponent was free to play away |
| **Skirmish** | — | Part of a local fighting sequence | Multiple consecutive moves within Manhattan distance ≤ 5 of each other, traced back to the skirmish start via `getSkirmishStart()` |
| **Local Response** | — | Answering an opponent's earlier move in the same area | Current move is near an earlier opponent move (distance < 5, same/adjacent zone) with no friendly stones nearby confirming local engagement |
| **Tenuki (Blunder)** | — | Ignoring an urgent atari to play elsewhere | Tenuki detected + `hasUrgentAtari()` confirms the opponent has a group in atari that was ignored |
| **Local Shift** | — | Nearby move that doesn't directly respond to opponent | Distance < 5 but no opponent interaction detected |

**Detection algorithm (`evaluateTenuki()`):**
1. Compute current zone and previous zone (9 zones: 4 corners, 4 sides, center)
2. Check Manhattan distance between current and previous move
3. If distance < 5 or zones are adjacent: check `interactsLocally()` (virtual component analysis)
4. If distant: search backwards up to 5 moves for earlier opponent moves in the same zone
5. Look ahead 1 move to determine Sente/Gote classification
6. Return `classString` and optional `responseVertex` for green highlight placement

| Aspect | Detail |
| --- | --- |
| **Source** | `evaluateTenuki()` in move-term-detector.js — custom detection built on top of Sabaki's pattern library |
| **Data origin** | `tenukiResult.responseVertex` — the single `[col, row]` of the move being responded to |
| **Visual (fill)** | Green `rgba(34, 197, 94, 0.4)` circle on the response vertex position |
| **Visual (ring)** | Green `#22c55e` circle outline, 3px, around the response vertex |
| **Visual (connection)** | Green dashed rectangle connecting matched stones to response vertex |
| **Badge label** | Appended to pattern name with " : " separator (e.g., "Hane : Local Response to Move 12") |
| **Global variable** | `window._responseVertices` (array of `[col, row]` pairs) |

### How Both Layers Coexist

```
detectCurrentMoveTerm()
  ├─ findPatternInMove(board, sign, vertex)  →  patternMatch  (blue data)
  ├─ evaluateTenuki(currC, currR, player, prevMove, ...)  →  tenukiResult  (green data)
  └─ returns { patternMatch, blueVertices, greenVertices }
```

A move can have:
- **Blue only** — Sabaki pattern match, no tenuki detected
- **Green only** — tenuki/skirmish detected, no Sabaki pattern
- **Both** — Sabaki pattern + tenuki context (badge merges names: `"Hane : Tenuki (gote)"`)
- **Neither** — no badge displayed

### Rendering Pipeline

Both colors go through the **exact same rendering pipeline** with identical behavior:

| Step | Fills (always visible when board renders) | Rings + connectors (hover-only) |
| --- | --- | --- |
| **Data stored** | `_termHL.set(blue, green, ...)` on every move change | Same data |
| **Synced to canvas** | `_termHL.show()` on badge hover enter | `_termHL._active = true` gates drawing |
| **Cleared from canvas** | `_termHL.hide()` on badge hover leave | `_termHL._active = false` stops drawing |
| **Read by** | `drawCellContent()` reads `window._highlightedCells` + `window._responseVertices` | `_termHL.drawBottom()` / `_termHL.drawTop()` read `this.blue` + `this.green` directly |
| **drawBoard step** | Step 3 (stone rendering inside `drawCellContent`) | Step 9 (connection rects), Step 11 (ring outlines + atari triangles) |

### Red Highlights — Comment Coordinate Highlights

| Aspect | Detail |
| --- | --- |
| **Source** | `parseCommentCoords()` in annotation_v4.js — reads SGF comment text |
| **What it highlights** | Coordinates mentioned in comments: `word={A1}`, `word={here}`, `word={qrt1}`, `word={ho(5)}` |
| **Visual** | Red circle, square, quadrant, or hoshi overlay |
| **Global variable** | `window._commentCoordHighlights` |
| **Note** | Completely independent from the blue/green move-term system |

### Color Summary

| Color | Meaning | Source | When Visible |
| --- | --- | --- | --- |
| **Blue** `#0082F0` | Sabaki pattern match | `findPatternInMove()` | On badge hover |
| **Green** `#22c55e` | Add-on term (Tenuki/Sente/Gote/Skirmish/Local Response) | `evaluateTenuki()` | On badge hover |
| **Red** `rgba(255, 0, 0, ...)` | Comment coordinate highlight | `parseCommentCoords()` | On comment span hover |
| **Dark red** `#D90429` | Atari caution triangle | `drawTop()` when name contains "Atari" | On badge hover |

## Phase Detection System

`phase-detector.js` implements a multi-signal phase detector that classifies each move into one of three Go game phases: **Fuseki** (Opening), **Chuban** (Middlegame), or **Yose** (Endgame). The detector uses no move-count heuristics — all signals are derived from board shape and spatial move distribution.

### Design Principle

> Every phase test is a direct computation of what the phase *actually means* in Go theory, not a proxy tuned to fit one game. Fuseki, Chuban, and Yose are judged purely from board shape and spatial move distribution.

### Phase Definitions & Detection Signals

#### Fuseki (Opening) — `return 'fuseki'`

**Definition:** Not all four quadrants of the board have received at least one stone.

**Detection:** `allQuadrantsTouched(board, size)` — scans the board to check if each of the four quadrants (top-left, top-right, bottom-left, bottom-right) has at least one stone. Fuseki lasts exactly as long as some quadrant hasn't been addressed — the literal meaning of "opening."

**Algorithm:**
```
allQuadrantsTouched(board, 19):
  mid = 9.5
  seen = [[false, false], [false, false]]
  for each occupied cell (r, c):
    seen[r < mid ? 0 : 1][c < mid ? 0 : 1] = true
  return seen[0][0] && seen[0][1] && seen[1][0] && seen[1][1]
```

#### Chuban (Middlegame) — `return 'chuban'`

**Definition:** All quadrants are addressed (Fuseki over) and territory isn't yet settled (Yose not reached). Chuban is confirmed by multiple converging signals:

| Signal | Algorithm | Threshold |
| --- | --- | --- |
| **Spatial proximity** | Rolling window of 10 consecutive non-pass moves; if average Euclidean distance between consecutive moves ≤ 4.0, players are in local contact fighting | `spatialChubanWindowSize: 10`, `spatialChubanDistanceThreshold: 4.0` |
| **Weak groups** | Loose shape grouping (8-connected) → groups with ≤ 2 real liberties are "tactically weak"; ≥ 3 weak groups signals ongoing combat | `chubanWeakGroupMaxLiberties: 2`, `chubanWeakGroupCount: 3` |
| **Aggressive terms** | Recent move-term detections include Cut, Invasion, or Cross-cut; ≥ 2 aggressive terms confirms Chuban | `chubanAggressiveTerms: ['Cut', 'Invasion', 'Cross-cut']`, `chubanAggressiveCount: 2` |
| **ML model** | Logistic regression trained on game datasets; features: moveCount, occupancyRatio, emptyCorners, contactPlayRatio; probability ≥ 0.50 triggers Chuban | `mlFusekiThreshold: 0.50` |

**ML Model weights:**
```
moveCount: 0.085, occupancyRatio: 1.240, emptyCorners: -0.950,
contactPlayRatio: 2.150, bias: -3.850
```

#### Yose (Endgame) — `return 'yose'`

**Definition:** Territory boundaries have stabilized and all groups are settled. Detected by six independent signals (any one suffices, subject to a combat guard):

| Signal | Algorithm | Threshold |
| --- | --- | --- |
| **A: AI territory** | `window.state.baselineTerritory` from KataGo/deadstones: if total settled intersections > 250, Yose confirmed | `yoseSettledThreshold: 250` |
| **B: Geometric territory ratio** | Flood-fill empty regions; regions bordered by exactly one color = enclosed territory; if ≥ 85% of empty space is enclosed territory (with ≥ 50% board fill), Yose confirmed | `yoseTerritoryRatio: 0.85`, `yoseMinBoardFillRatio: 0.5` |
| **C: Spatial low-line ratio** | Rolling window of 15 recent moves; if ≥ 80% are on lines 1-2 (sealing territorial borders), Yose confirmed | `spatialYoseWindowSize: 15`, `spatialYoseRatioThreshold: 0.8` |
| **D: Group safety / vitality** | Every group (≥ 3 stones) must be "settled": vitality (liberties/size) either ≥ 2.5 (clearly alive) or ≤ 0.15 (clearly dead). No group in the "uncertain" range. | `yoseGroupSettledHighLibRatio: 2.5`, `yoseGroupSettledLowLibRatio: 0.15` |
| **E: Territory derivative stability** | Track board fill ratio over a rolling window of 8 moves; average rate of change < 0.008 means territory boundaries have stabilized (ΔM̄ < ε) | `yoseTerritoryDerivativeWindow: 8`, `yoseTerritoryDerivativeThreshold: 0.008` |
| **F: Max move value** | Flood-fill largest empty region; estimated max single-move value = regionSize / 2; if < 15 points, no large areas remain to fight over | `yoseMaxMoveValueThreshold: 15` |

**Combat guard:** Even if territory/AI/spatial signals say "Yose," the detector won't confirm it while a fight is still structurally live (weak groups present or aggressive terms in recent moves).

### Debug Mode

```javascript
window.PhaseDetectorConfig.debug = true;   // enable per-move diagnostics
window._phaseDebug = [];                    // clear stale entries
// ... step through moves ...
console.table(window._phaseDebug);          // inspect results
```

## Board Canvas System

The app has **three independent board representations**, each with its own canvas element, style settings, and rendering context.

### Physical vs Drawing

- **Physical** — a real `<canvas>` DOM element that exists in the page, receives mouse events, and is redrawn live by `drawBoard()`. The user sees and interacts with it directly.
- **Drawing** — an off-screen `<canvas>` created dynamically via `document.createElement('canvas')`, rendered into, converted to a data URL, and displayed as an `<img>` element. The user sees a static image, not a live canvas.

### The Three Boards

| | Initial Board | Study Board | Export Board |
| --- | --- | --- | --- |
| **Element** | `<canvas id="go-board-canvas-initial">` | `<canvas id="go-board-canvas-study">` | `<img id="export-preview-image">` (rendered via off-screen canvas) |
| **Type** | Physical (live canvas) | Physical (live canvas) | Drawing (static image) |
| **Container** | `#board-canvas-wrapper-initial` inside `#annotable-workspace` (main page layout) | `#board-canvas-wrapper-study` inside `#study-board-viewport` inside `#study-modal-overlay` (fullscreen modal) | `.export-preview-container` inside `#export-modal-overlay` (fullscreen modal) |
| **JS Reference** | `elements.canvasInitial` | `elements.canvasStudy` | `document.getElementById('export-preview-image')` |
| **Style Object** | `state.initialBoardStyle` | `state.studyBoardStyle` | `state.exportBoardStyle` |
| **BG Image Cache** | `window.initialBoardBgImage` | `window.studyBoardBgImage` | `window.exportBoardBgImage` |
| **Drawn By** | `renderBoardToCtx(ctx, true, false, false)` | `renderBoardToCtx(ctx, false, true, false)` | `generateDiagramDataURL()` — separate rendering path |
| **Drop Shadows** | Yes (enhanced 3D shadows) | No | No |
| **Visible When** | Main page (always in workspace) | `study-mode-active` CSS class on `<body>`; modal overlay shown | Export modal overlay shown |
| **Interactive** | Yes (mousedown, mousemove, wheel) | Yes (mousedown, mousemove, no wheel) | No (preview image only) |
| **Grid Border Style** | `#1C1917`, width 1 | `#000000`, width 1.5 | Computed dynamically |
| **Has `hint` property** | No | Yes (next-move hint circle) | No |

> Each board serves a different visual context. The initial board is the main editing canvas (default 600px). The study board is an interactive fullscreen replay view. The export board is the high-resolution PNG export diagram. All three are independently styled via `state.initialBoardStyle`, `state.studyBoardStyle`, and `state.exportBoardStyle`.

### How `drawBoard()` Renders

`drawBoard()` only renders the two physical canvases. The export canvas has its own path via `generateDiagramDataURL()`.

```javascript title="annotation_v4.js:2773"
function drawBoard() {
    const canvases = [
        { el: elements.canvasInitial, isPlayerMode: true, isStudyMode: false, isExportMode: false },
        { el: elements.canvasStudy, isPlayerMode: false, isStudyMode: true, isExportMode: false }
    ];
    canvases.forEach(c => {
        if (c.el) {
            const context = c.el.getContext('2d');
            renderBoardToCtx(context, c.isPlayerMode, c.isStudyMode, c.isExportMode);
        }
    });
}
```

### Canvas Detection Inside `renderBoardToCtx`

```javascript
const isInitialCanvas = (ctx.canvas && ctx.canvas.id === 'go-board-canvas-initial');
```

Style selection is then:
- `isInitialCanvas` → `state.initialBoardStyle`
- `isStudyMode` → `state.studyBoardStyle`
- Neither → `state.exportBoardStyle`

### High-DPI Initialization

Both physical canvases are scaled for Retina displays at startup:

```javascript
const dpr = window.devicePixelRatio || 1;
[elements.canvasInitial, elements.canvasStudy].forEach(c => {
    c.width = CANVAS_SIZE * dpr;
    c.height = CANVAS_SIZE * dpr;
    c.getContext('2d').scale(dpr, dpr);
});
```

## Stone Sets

The floating panel's **Stones (Black & White)** accordion contains a **Default Stone Set** selector with three options: Set A, Set B, and Set C (placeholder). When a stone set is active, the Custom Stones section collapses and locks.

### Stone Style State

Each board style object (`initialBoardStyle`, `studyBoardStyle`, `exportBoardStyle`) has a `stoneSet` property (`null` by default). When a user clicks a set, `stoneSet` is set to `"A"` or `"B"` and saved to localStorage across all three style objects.

### Rendering Priority

Inside `drawCellContent()`, stone rendering follows this priority:

1. **Stone set active** (Set A or Set B) — fixed preset gradient wins
2. **Custom stone image** — user-uploaded image
3. **Solid color** — fallback from custom color picker

### Set A — 3D Gradient (Default)

Set A renders stones with a warm directional lighting gradient + drop shadow:

| Stone | Gradient | Rim |
|-------|----------|-----|
| Black | `#5a5a5a` → `#1a1a1a` → `#000000` | None |
| White | `#ffffff` → `#e6e6e6` → `#a0a0a0` | `#888888` |

Light source is offset to top-left. Drop shadow: `rgba(0,0,0,0.5)` with proportional blur/offset.

### Set B — Matcap 3D

Set B renders stones with a matcap-inspired 3D finish using a tighter highlight spot and cooler/warmer tones:

| Stone | Gradient | Rim |
|-------|----------|-----|
| Black (Slate) | `#6b7280` → `#1f2937` → `#030712` | None |
| White (Ivory Pearl) | `#fffef5` → `#f0ead6` → `#bab5a0` | `#a09880` |

**Rendering code** (`annotation_v4.js:5251-5326`):

```javascript
const useGradient = (style && style.stoneSet === 'A' && cell.player);
const useGradientB = (style && style.stoneSet === 'B' && cell.player);
if (useGradient || useGradientB) {
    targetCtx.save();
    targetCtx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    targetCtx.shadowBlur = Math.max(3, currentStoneRadius * 0.25);
    targetCtx.shadowOffsetX = Math.max(2, currentStoneRadius * 0.15);
    targetCtx.shadowOffsetY = Math.max(2, currentStoneRadius * 0.15);

    if (useGradientB) {
        if (cell.player === 'B') {
            const gradient = targetCtx.createRadialGradient(
                cx - currentStoneRadius * 0.25, cy - currentStoneRadius * 0.25, currentStoneRadius * 0.08,
                cx - currentStoneRadius * 0.1, cy - currentStoneRadius * 0.1, currentStoneRadius * 1.2
            );
            gradient.addColorStop(0.0, '#6b7280');
            gradient.addColorStop(0.35, '#1f2937');
            gradient.addColorStop(1.0, '#030712');
            targetCtx.fillStyle = gradient;
            targetCtx.beginPath();
            targetCtx.arc(cx, cy, currentStoneRadius, 0, Math.PI * 2);
            targetCtx.fill();
        } else {
            const gradient = targetCtx.createRadialGradient(
                cx - currentStoneRadius * 0.35, cy - currentStoneRadius * 0.35, currentStoneRadius * 0.15,
                cx - currentStoneRadius * 0.1, cy - currentStoneRadius * 0.1, currentStoneRadius * 1.2
            );
            gradient.addColorStop(0.0, '#fffef5');
            gradient.addColorStop(0.5, '#f0ead6');
            gradient.addColorStop(1.0, '#bab5a0');
            targetCtx.fillStyle = gradient;
            targetCtx.beginPath();
            targetCtx.arc(cx, cy, currentStoneRadius, 0, Math.PI * 2);
            targetCtx.fill();
            targetCtx.shadowColor = 'transparent';
            targetCtx.lineWidth = Math.max(0.5, currentStoneRadius * 0.02);
            targetCtx.strokeStyle = '#a09880';
            targetCtx.stroke();
        }
    } else if (cell.player === 'B') {
        // Set A Black
    } else {
        // Set A White
    }
    targetCtx.restore();
}
```

All three boards (initial, study, export) and scoring mode share the same `drawCellContent()` rendering, so Set B works across all of them automatically.

### UI

The stone set options are `<label class="stone-set-option" data-set="A|B|C">` pills in `index.html:2005-2016`. Click handler at `annotation_v4.js:10861-10879`:

```javascript
document.querySelectorAll('.stone-set-option:not(.disabled)').forEach(opt => {
    opt.addEventListener('click', () => {
        const wasActive = opt.classList.contains('active');
        document.querySelectorAll('.stone-set-option').forEach(o => o.classList.remove('active'));
        if (!wasActive) opt.classList.add('active');
        const activeStyle = getActiveStyleObject();
        if (activeStyle) {
            activeStyle.stoneSet = wasActive ? null : opt.dataset.set;
            localStorage.setItem('baduk_initial_board_style', JSON.stringify(state.initialBoardStyle));
            localStorage.setItem('baduk_study_board_style', JSON.stringify(state.studyBoardStyle));
            localStorage.setItem('baduk_export_board_style', JSON.stringify(state.exportBoardStyle));
        }
        syncCustomStonesSection();
        drawBoard();
        if (typeof updateExportPreview === 'function') updateExportPreview();
    });
});
```

When any set is active, `syncCustomStonesSection()` locks the Custom Stones section (collapsed, non-interactive). On panel open, `populateStyleInputs()` restores the radio state from `activeStyle.stoneSet`.

### Files Changed

| File | Lines | Action |
|------|-------|--------|
| `index.html` | 2009 | Enabled Set B (removed `disabled` class, updated title) |
| `annotation_v4.js` | 5251-5326 | Added `useGradientB` check and Set B rendering block |

## UI Architecture

### Layout Overview

```
┌─────────────────────────────────────────────────────────┐
│  Header (title, mode buttons, tech_log-{ver} link)      │
├──────────┬──────────────────────────────────────────────┤
│  Left    │  Main Workspace                              │
│  Panel   │  ┌──────────────────────────────────────┐    │
│  (tools) │  │  #annotable-workspace                │    │
│          │  │  ┌────────────────────────────────┐  │    │
│          │  │  │  #go-board-canvas-initial       │  │    │
│          │  │  │  (physical board - always live) │  │    │
│          │  │  └────────────────────────────────┘  │    │
│          │  └──────────────────────────────────────┘    │
├──────────┴──────────────────────────────────────────────┤
│  Right Panel                                            │
│  ┌────────────────────────────┐                         │
│  │  SGF re-Player (green)     │ ← expanded after SGF load │
│  │  ├ Move playback controls  │                         │
│  │  ├ Game tree               │                         │
│  │  ├ Comments                │                         │
│  │  │  ├ ref-Area button      │ ← board block references│
│  │  │  ├ ref-Point button     │ ← coordinate references │
│  │  │  └ Edit / Save          │                         │
│  │  └ "Enter Study Mode" btn  │                         │
│  ├────────────────────────────┤                         │
│  │  SGF Importer (yellow)     │ ← collapsed after load   │
│  │  ├ File drop zone          │                         │
│  │  ├ Paste SGF textarea      │                         │
│  │  ├ Kifu-DB explorer        │                         │
│  │  ├ Move range filter       │                         │
│  │  └ Export SGF              │                         │
│  └────────────────────────────┘                         │
└─────────────────────────────────────────────────────────┘

┌──────────────────────────────┐   (floating, always on top)
│  Custom Floating Panel       │ ← toggled by FAB button
│  (Draggable Style Palette)   │
│  ├ Stones (Black & White)    │
│  ├ Board & Border            │
│  ├ Grids & Hoshi             │
│  ├ Coordinates               │
│  ├ Next Move Hint            │
│  └ Reset All                 │
└──────────────────────────────┘
```

### Panel Types

#### A. Left Toolbar Panel (static, in-flow)

**HTML:** `<section class="panel toolbar-panel">` (line 350)

Annotation tools — stone placement, markers, labels, undo/redo, export button, replication code. Always visible in the main layout.

#### B. Right Panel (static, in-flow)

**HTML:** `<section class="panel right-panel">` (line 586)

Contains SGF re-player and SGF Importer sections. Two sub-panels function as a **mutually exclusive accordion** — expanding one collapses the other via inline `onclick` handlers.

#### C. Custom Floating Panel (draggable, position: fixed)

**HTML:** `<div id="custom-floating-panel" class="custom-floating-panel hidden">` (line 1423)

Live board appearance customization — the "style palette". Toggle via FAB button (`#fab-toggle-floating`). Draggable header saves position to localStorage. Dynamically adapts when opened — `populateStyleInputs()` loads values from whichever board view is active. The Stones accordion contains a **Default Stone Set** selector (Set A / Set B / Set C) and a collapsible **Custom Stones** section with color/image/filter controls. Active stone sets lock the Custom Stones section.

#### D. Study Modal (fullscreen overlay)

**HTML:** `<div id="study-modal-overlay" class="modal-overlay hidden">` (line 1313)

Full interactive study/review mode with the study board viewport, cropping/zooming, and right panel settings. Entered via "Enter Study Mode" button in SGF re-player panel. CSS class: `study-mode-active` on `<body>`.

#### E. Export Modal (fullscreen overlay)

**HTML:** `<div id="export-modal-overlay" class="modal-overlay hidden">` (line 1029)

Configure and preview high-resolution PNG export. Left pane: export settings. Right pane: live preview via `<img id="export-preview-image">`.

#### F. Kifu-DB Explorer Modal (fullscreen overlay)

**HTML:** `<div id="kifu-modal-overlay" class="modal-overlay hidden">` (line 1354)

Browse and search a folder of SGF files.

### Style Settings Persistence

| Style Object | localStorage Key | Purpose |
| --- | --- | --- |
| `state.initialBoardStyle` | `baduk_initial_board_style` | Main editing board appearance |
| `state.studyBoardStyle` | `baduk_study_board_style` | Study board appearance |
| `state.exportBoardStyle` | `baduk_export_board_style` | Export diagram appearance |

> All three are saved/loaded via `saveStyleAndRedraw()`. The floating panel writes to whichever style object matches the currently visible board (determined by `getActiveStyleObject()` → `getCurrentBoardView()`).

### Board Style Properties

Shared across all three boards:

```javascript
{
    stoneSet:   null,             // 'A' | 'B' | null (default set overrides custom)
    blackStone: { useColor, bg, imgSrc, bgSize, fg, fgSize, br, brSize, brRadius, brBlur, bmSize },
    whiteStone: { useColor, bg, imgSrc, bgSize, fg, fgSize, br, brSize, brRadius, brBlur, bmSize },
    board:      { useColor, color, imgSrc, imgRepeat, imgZoom, size },
    border:     { color, size },
    grid:       { lineColor, lineSize, hoshiColor, hoshiSize, boundaryColor, boundarySize },
    coord:      { show, primary: {show, type, color, size, pad}, secondary: {show, type, color, size, pad} },
    hint:       { color, size, alpha }       // studyBoardStyle only
}
```

### App Modes

| Mode | CSS Class | Effect |
| --- | --- | --- |
| **Compact** (default) | none | Normal layout |
| **Enlarge** | `enlarge-mode` on `.app-main` | Larger board view |
| **Study** | `study-mode-active` on `<body>` | Fullscreen study modal with cropped/zoomed board |

### SGF Importer vs SGF re-Player

| | SGF Importer | SGF re-Player |
| --- | --- | --- |
| **Theme** | Yellow/green (`#fffde7`, `#fbc02d` border) | Green (`var(--success-glow)`, `var(--success)` border) |
| **Initially** | Expanded (when no game loaded) | Hidden (shown after SGF load) |
| **After SGF load** | Collapsed | Expanded |
| **Contains** | File upload, paste, kifu DB, range filter | Move playback, game tree, comments, study mode entry |

## Architecture

### Script Load Order

```
index.html
  └─ annotation_v4.js     (loaded first — sets up state, board, UI)
      └─ sgf-parser.js    (SgfEngine — loaded inside annotation_v4.js)
  └─ game-tree.js         (game tree rendering)
  └─ move-term-detector.js (move term detection & highlights)
  └─ board-estimate.js    (score estimation)
  └─ liberties.js         (liberty analysis)
  └─ phase-detector.js    (game phase detection)
```

### move-term-detector.js Structure (IIFE)

```javascript title="move-term-detector.js"
(function(){"use strict"
  1. PATTERN LIBRARY    — SHAPE_PATTERNS, CORNER_PATTERNS, CLAW_PATTERNS (from @sabaki/boardmatcher)
  2. HELPER FUNCTIONS   — mod, hasVertex, getNeighbors, getSymmetries, etc.
  3. PATTERN MATCHING   — findPatternInMove(), evaluateTenuki(), getSkirmishStart()
  4. HIGHLIGHT DATA     — _termHL object, getMatchedVertices()
  5. BADGE UI           — makeBadgeEl(), updateBadge(), ensureBadgeRow()
  6. BOARD DRAWING      — drawCellContent wrappers
  7. REACTIVITY         — onMoveChanged(), polling, goToMove hook, flipBoard hook
  8. CSS INJECTION      — badge styles, animation keyframes
  9. INIT               — DOMContentLoaded → _hookGoToMove(), _hookFlipBoard(), startPolling()
})()
```

### annotation_v4.js Structure

```text title="annotation_v4.js — module map"
State initialization (lines 26–331)
  └─ state object with 3 board style objects, board data, active tool, move display, export settings
  └─ ref-Area state (refAreaMode, refAreaCells[], refAreaHoverCell, refAreaInsertPos)
  └─ ref-Point state (refPointMode, refPointCells[], refPointInsertPos)

SGF Engine integration (sgf-parser.js loaded inline)
  └─ SgfEngine.parseSgf(), parseGoPoint(), parseMarkupProperties(), etc.

Board rendering (lines 2773–4200+)
  └─ drawBoard() → renderBoardToCtx() → drawCellContent()
      ├─ Step 1: Board background (color or image)
      ├─ Step 2: Grid lines + hoshi points
      ├─ Step 3: Stones + annotations + labels + move-term fills
      ├─ Step 4: Coordinate labels
      ├─ Step 5: Crop overlay
      ├─ Step 6: What-if preview stone
      ├─ Step 7: Move numbers
      ├─ Step 8: Current move marker
      ├─ Step 9: Capture animation
      ├─ Step 9.5: Capture animation overlay
      ├─ Step 10: Connection rectangles (drawMoveTermHighlights)
      └─ Step 11: Ring outlines + atari triangles (drawMoveTermTopHighlights)

Comment parsing (lines 6400–6600+)
  └─ parseCommentCoords(), comment highlight rendering
  └─ ref-Area/ref-Point canvas rendering (lines 4083–4213)

UI event listeners (lines 1100–2500+)
  └─ Mouse, keyboard, wheel, file drop, panel toggles
  └─ ref-Area toggle handler (lines 2397–2443)
  └─ ref-Point toggle handler (lines 2445–2473)
  └─ ref-Area/ref-Point board click handlers (lines 3132–3211)

Floating panel system (lines 8945–9630)
  └─ initFloatingToolbar(), populateStyleInputs(), bindStyleInputsEvents()

Export system (lines 4800–5900)
  └─ generateDiagramDataURL(), updateExportPreview()

Study mode (lines 8663–8927)
  └─ setupStudyMode(), updateStudyCrop()
```

## Custom Functions Reference

All custom functions introduced in baduk-notes, organized by module.

---

### move-term-detector.js

#### Pattern Matching

| Function | Signature | Description |
| --- | --- | --- |
| `findPatternInMove` | `(board, sign, vertex) → patternMatch \| null` | Core pattern matcher — tests the current move against SHAPE_PATTERNS, CORNER_PATTERNS, and CLAW_PATTERNS from @sabaki/boardmatcher. Returns `{ name, anchors, vertices, url }` or null. |
| `hasVertex` | `(vertices, v) → boolean` | Check if a vertex exists in a vertex array. |
| `getNeighbors` | `(vertex, size) → [v, v, v, v]` | Returns 4-connected neighbors of a vertex, filtering out-of-bounds. |
| `getSymmetries` | `(vertex, size) → [v, v, v, v]` | Returns 4 rotational/reflective symmetries of a vertex for pattern matching. |
| `mod` | `(n, m) → number` | Safe modulo that handles negative numbers. |

#### Tenuki / Sente / Gote Detection

| Function | Signature | Description |
| --- | --- | --- |
| `evaluateTenuki` | `(currC, currR, player, prevMove, allMoves, currIdx) → { classString, responseVertex }` | Main add-on term detector. Evaluates tactical context: Tenuki, Sente, Gote, Skirmish, Local Response, Tenuki (Blunder), Local Shift. Uses zone analysis, Manhattan distance, and local interaction. |
| `getSkirmishStart` | `(currIdx, allMoves, maxLookback) → number` | Traces backwards from current move to find the start of a local fighting sequence (multiple consecutive moves within Manhattan distance ≤ 5). |
| `getZone` | `(col, row) → number` | Maps a board position to one of 9 zones: 4 corners, 4 sides, center. |
| `areZonesAdjacent` | `(z1, z2) → boolean` | Checks if two zones share a border (corner↔side, side↔side, center↔all). |
| `manhattanDist` | `(c1, r1, c2, r2) → number` | Manhattan distance between two board positions. |
| `getConnectedComponent` | `(stones, startIdx) → [stone, ...]` | BFS flood-fill from a stone, collecting all connected stones of the same color (4-connected). |
| `getVirtualComponent` | `(stones, allStones) → [stone, ...]` | Extended component analysis — considers virtual connections (stones that share liberties). |
| `interactsLocally` | `(currV, prevV, board, sign) → boolean` | Checks if the current move directly interacts with the previous move's stones via local connection/enclosure analysis. |
| `hasUrgentAtari` | `(board, sign) → boolean` | Scans the board for any group of `sign`'s opponent with exactly 1 liberty (atari). Used to detect Tenuki blunders. |

#### Highlight Object

| Function | Signature | Description |
| --- | --- | --- |
| `_termHL.set` | `(blue, green, name, url)` | Store highlight data for current move (blue pattern vertices, green response vertices, badge info). |
| `_termHL.show` | `()` | Activate highlights — sets `_active = true`, syncs to `window._highlightedCells` and `window._responseVertices`, triggers `drawBoard()`. |
| `_termHL.hide` | `()` | Deactivate highlights — sets `_active = false`, clears globals, triggers `drawBoard()`. |
| `_termHL.clear` | `()` | Remove all stored highlight data and deactivate. |
| `_termHL.drawBottom` | `(ctx)` | Draw blue/green fill circles and connection rectangles on canvas (called during board render when `_active`). |
| `_termHL.drawTop` | `(ctx)` | Draw blue/green ring outlines and atari caution triangles on canvas (called during board render when `_active`). |

#### Badge UI & Polling

| Function | Signature | Description |
| --- | --- | --- |
| `detectCurrentMoveTerm` | `() → { patternMatch, blueVertices, greenVertices }` | Orchestrator — calls `findPatternInMove()` and `evaluateTenuki()` simultaneously, returns combined result. |
| `updateBadge` | `(patternMatch, blueVertices, greenVertices)` | Creates or updates the move-term badge element in the DOM. Merges pattern name + tenuki class with " : " separator. |
| `makeBadgeEl` | `(name, url) → HTMLElement` | Creates a styled badge `<span>` with click-to-Sensei's link. |
| `ensureBadgeRow` | `()` | Ensures the badge container row exists in the DOM. |
| `onMoveChanged` | `()` | Hook called on every move change — clears highlights, detects term, updates badge. |
| `startPolling` | `()` | Polls `state.currentMoveIndex` every 100ms to detect move changes and trigger `onMoveChanged()`. |
| `_hookGoToMove` | `()` | Monkey-patches `window.goToMove` to inject `onMoveChanged()` after navigation. |
| `_hookFlipBoard` | `()` | Monkey-patches `window.flipBoard` to refresh highlights after board flip. |

---

### phase-detector.js

#### Core Detection

| Function | Signature | Description |
| --- | --- | --- |
| `detectGamePhaseDynamic` | `(board, size, moveCount, recentMoves, opts) → 'fuseki' \| 'chuban' \| 'yose'` | Main API — classifies the current game phase using board shape and spatial distribution only. No move-count heuristics. |
| `allQuadrantsTouched` | `(board, size) → boolean` | Checks if all 4 quadrants have at least one stone. Returns false → Fuseki. |
| `computeSpatialChuban` | `(recentMoves, windowSize, threshold) → boolean` | Rolling window of N consecutive moves — if average Euclidean distance ≤ threshold, players are in local fighting → Chuban. |
| `computeWeakGroups` | `(board, size) → number` | Loose shape grouping (8-connected) → counts groups with ≤ 2 real liberties. ≥ 3 weak groups → Chuban. |
| `computeAggressiveTerms` | `(recentTerms) → number` | Counts aggressive move terms (Cut, Invasion, Cross-cut) in recent moves. ≥ 2 → Chuban. |
| `computeMLPhase` | `(features) → 'fuseki' \| 'chuban'` | Logistic regression model — features: moveCount, occupancyRatio, emptyCorners, contactPlayRatio. Probability ≥ 0.50 → Chuban. |
| `computeTerritoryRatio` | `(board, size) → number` | Flood-fill empty regions; regions bordered by exactly one color = enclosed territory. Returns ratio of enclosed to total empty space. |
| `computeSpatialYose` | `(recentMoves, windowSize, threshold) → boolean` | Rolling window — if ≥ threshold of recent moves are on lines 1-2 (sealing borders) → Yose. |
| `computeGroupSafety` | `(board, size) → boolean` | Every group (≥ 3 stones) must be "settled": vitality (liberties/size) either ≥ 2.5 (alive) or ≤ 0.15 (dead). No group in the uncertain range → Yose. |
| `computeTerritoryDerivative` | `(fillRatios, windowSize) → boolean` | Tracks board fill ratio over rolling window — average rate of change < ε means territory boundaries stabilized → Yose. |
| `computeMaxMoveValue` | `(board, size) → number` | Flood-fill largest empty region; estimated max single-move value = regionSize / 2. < 15 points → Yose. |
| `checkCombatGuard` | `(weakGroups, aggressiveTerms) → boolean` | Guard: even if territory signals say Yose, won't confirm while a fight is structurally live. |

#### Helpers

| Function | Signature | Description |
| --- | --- | --- |
| `getNeighbors8` | `(r, c, size) → [[r,c], ...]` | Returns 8-connected neighbors of a position. |
| `floodFillEmpty` | `(board, size, startR, startC) → Set` | BFS flood-fill of empty region from a starting point. Returns set of all connected empty cells. |
| `getRegionBorderColors` | `(board, size, region) → Set` | For a flood-filled empty region, returns the set of colors that border it. |
| `getGroupLiberties` | `(board, size, r, c) → { stones, liberties }` | BFS to find a connected group and count its liberties. |

---

### liberties.js — `Liberties` Namespace

> An original implementation inspired by the concept of **qi (气)** — the vital life force, breath, or energy that circulates through all living things — as described in classical Chinese Weiqi philosophy. In Go, liberties represent a group's qi: the open intersections where its stones can breathe.

| Function | Signature | Description |
| --- | --- | --- |
| `Liberties.fromBoard` | `(board) → string[][]` | Convert baduk-notes board (`[{player}]`) to simple string grid (`'B'`/`'W'`/`''`). |
| `Liberties.computeLibertyMap` | `(board) → Map<"col,row", Set<"libCol,libRow">>` | BFS for each stone group, records all adjacent empty intersections. Every stone in a group maps to the same Set of liberty coordinates. |
| `Liberties.getGroups` | `(board) → [{color, stones, liberties, libertyCount}]` | Returns every group on the board with its stones and liberty count. |
| `Liberties.countByColor` | `(board) → {black, white, shared}` | Returns total liberty counts. Shared liberties (adjacent to both colors) are counted separately. |
| `Liberties.getLibertyPoints` | `(board) → Map<"libCol,libRow", Set<"B"\|"W">>` | Inverse map: each liberty coordinate → which colors claim it. For drawing markers on the board. |
| `Liberties.drawOnCanvas` | `(ctx, board, opts)` | Draw liberty dots directly onto a canvas context. Configurable colors, dot size, opacity, square/circle shape. |

---

### board-estimate.js — `BoardEstimate` Namespace

| Function | Signature | Description |
| --- | --- | --- |
| `BoardEstimate.estimate` | `(board, komi, deadStones) → {black, white, total}` | Full score estimation — counts territory + captures + komi. Uses `deadstones.bundle.js` (WASM) for dead stone detection. |
| `BoardEstimate.evaluateJapaneseTerritory` | `(board, options) → {bTerritory, wTerritory, ..., resultStr}` | Deterministic Japanese territory scorer — resolves dead stones from `DD`/`MA`/`TB`/`TW` markup (current node first, else in-memory replay to the terminal position); flood-fill fallback retained internally for programmatic callers, but the Computational Method stops short of it and warns the user to mark dead stones when no endgame markup exists anywhere |
| `BoardEstimate.countTerritory` | `(board, deadStones) → {black, white}` | Flood-fill empty regions; regions bordered by exactly one color → that color's territory. |
| `BoardEstimate.countStones` | `(board) → {black, white}` | Count living stones (excluding dead stones). |
| `BoardEstimate.findDeadStones` | `(board) → [vertex, ...]` | Calls WASM deadstones bundle to detect dead stones on the board. |
| `BoardEstimate.getScoreBreakdown` | `(board, komi) → {blackTerritory, whiteTerritory, blackCaptures, whiteCaptures, komi, total}` | Detailed breakdown of all scoring components. |

---

### sgf-parser.js — `SgfEngine` Namespace

| Function | Signature | Description |
| --- | --- | --- |
| `SgfEngine.parseSgf` | `(sgfString) → tree` | Main parser — converts SGF text into a game tree structure. Handles FF[4] properties, branches, variations. |
| `SgfEngine.parseGoPoint` | `(pointStr, boardSize) → [col, row]` | Convert SGF coordinate (e.g. `"pd"`) to internal `[col, row]` format. |
| `SgfEngine.parseMarkupProperties` | `(node) → markup[]` | Extract markup properties (TR, SQ, CR, MA, LB, etc.) from an SGF node. |
| `SgfEngine.parseSetupProperties` | `(node) → {addBlack, addWhite, addEmpty}` | Extract setup properties (AB, AW, AE) from an SGF node. |
| `SgfEngine.cloneTree` | `(tree) → tree` | Deep clone an entire game tree (used to avoid mutating the original). |
| `SgfEngine.extractMainLine` | `(tree) → move[]` | Extract the main line (longest variation) from a game tree as a flat array of moves. |
| `SgfEngine.getBoardSize` | `(tree) → number` | Read the board size from the root node's `SZ` property. |
| `SgfEngine.getGameInfo` | `(tree) → {name, event, date, result, ...}` | Extract metadata (GN, EV, DT, RE, etc.) from root node. |

---

### game-tree.js

| Function | Signature | Description |
| --- | --- | --- |
| `renderGameTree` | `()` | Main renderer — draws the game tree in both the main tree panel and footer tree strip. |
| `refreshGameTree` | `()` | Forces a full re-render of the game tree (called after structural changes). |
| `buildTreeLayout` | `(tree) → layoutNode` | Computes x/y positions for all nodes in the tree, handling branching paths and depth. |
| `renderFooterTree` | `()` | Renders the compact footer strip showing move progress and current position. |
| `navigate` | `(idx) → void` | Handles click-to-navigate on tree nodes — calls `goToMove(idx)`. |
| `centerOnNode` | `(idx, animated) → void` | Scrolls the tree view to center on a specific move node. |
| `initFooterTree` | `()` | Initializes the footer tree strip — sets up wheel navigation and click handlers. |
| `getMovePropsForRender` | `(moveNum) → {color, x, y, isCurrent, isBranch}` | Returns rendering properties for a move node (color, position, branch status). |
| `buildDOM` | `()` | Builds the DOM structure for the game tree panel. |
| `animateY` | `(targetY, duration) → void` | Smooth scroll animation for tree navigation. |
| `getActiveMoveLabels` | `() → string[]` | Returns visible move labels (coordinates) for the current branch path. |
| `getMoveLabelForIndex` | `(idx) → string` | Returns the coordinate label (e.g. "D4") for a move index. |

---

### annotation_v4.js — Core App Functions

#### Board Rendering

| Function | Signature | Description |
| --- | --- | --- |
| `drawBoard` | `()` | Renders both physical canvases (initial + study) by calling `renderBoardToCtx()` for each. |
| `renderBoardToCtx` | `(ctx, isPlayerMode, isStudyMode, isExportMode)` | Full board rendering pipeline — background, grid, stones, highlights, coordinates, overlays. 11-step process. |
| `drawCellContent` | `(ctx, x, y, cell, col, row)` | Draws a single cell — stone, marker, label, move number, highlight fills (blue/green/red). |
| `drawMoveTermHighlights` | `(ctx)` | Draws connection rectangles between highlighted stones (blue/green dashed lines). |
| `drawMoveTermTopHighlights` | `(ctx)` | Draws ring outlines and atari caution triangles on highlighted stones. |

#### SGF & Game State

| Function | Signature | Description |
| --- | --- | --- |
| `loadSGF` | `(sgfString) → void` | Main SGF loader — parses SGF, extracts main line, initializes board state, navigates to move 0. |
| `goToMove` | `(index) → void` | Navigate to a specific move — rebuilds board from baseline, triggers rendering, capture animation, and move-term detection. |
| `handleFileSelect` | `(file) → void` | Handles SGF file import via file picker or drag-and-drop. |
| `applyFilters` | `()` | Applies move range filter to the move list (for studying specific game segments). |

#### Comment & Coordinate System

| Function | Signature | Description |
| --- | --- | --- |
| `parseCommentCoords` | `(commentText) → highlights[]` | Parses `{...}` syntax in comments — extracts coordinates, hoshi refs, quadrant refs, stone groups. Returns renderable highlight data. |
| `renderCommentHighlights` | `(ctx, highlights)` | Renders red highlights from comment coordinates on the board canvas. |
| `insertRefPoint` | `(coord) → void` | Inserts a coordinate string (e.g. "D12") at the saved cursor position in the comment textarea. |
| `insertRefArea` | `(cells) → void` | Inserts `{cell(A1), cell(B2)}` syntax at the saved cursor position in the comment textarea. |

#### ref-Area / ref-Point Modes

| Function | Signature | Description |
| --- | --- | --- |
| `toggleRefPointMode` | `()` | Toggles ref-Point mode — activates coordinate insertion, records cursor position. |
| `toggleRefAreaMode` | `()` | Toggles ref-Area mode — activates board block selection, inserts `{` delimiter. |
| `handleBoardClickRefPoint` | `(col, row)` | Processes board click in ref-Point mode — toggles point in/out of selection, rebuilds coord string. |
| `handleBoardClickRefArea` | `(col, row)` | Processes board click in ref-Area mode — toggles block in/out of selection, rebuilds cell list. |
| `drawRefPointOverlay` | `(ctx)` | Renders selected ref-Point cells on the canvas during ref-Point mode. |
| `drawRefAreaOverlay` | `(ctx)` | Renders hovered/selected ref-Area blocks on the canvas during ref-Area mode. |

#### Export System

| Function | Signature | Description |
| --- | --- | --- |
| `generateDiagramDataURL` | `(opts) → string` | Renders the board to an off-screen canvas at high resolution and returns a data URL for PNG export. |
| `updateExportPreview` | `()` | Updates the export modal preview image with current board state and export settings. |
| `exportAsPNG` | `()` | Triggers the full export flow — renders, creates download link, triggers download. |

#### Style & Appearance

| Function | Signature | Description |
| --- | --- | --- |
| `saveStyleAndRedraw` | `()` | Saves the current board style to localStorage and triggers a redraw. |
| `getActiveStyleObject` | `() → styleObj` | Returns the style object for whichever board is currently visible (initial/study/export). |
| `getCurrentBoardView` | `() → 'initial'\|'study'\|'export'` | Determines which board view is active based on CSS classes and modal state. |
| `populateStyleInputs` | `()` | Loads current style values into the floating panel's input controls. |

#### Capture Animation

| Function | Signature | Description |
| --- | --- | --- |
| `captureAnimation` | `(capturedStones, callback)` | Animates captured stones shrinking and fading out before being removed from the board. |
| `renderCaptureOverlay` | `(ctx)` | Draws the capture animation frames on the canvas during the animation sequence. |

---

## Data Flow

### Game Loading

```text
SGF Drop/Paste/File Picker
  → handleFileSelect(file)
    → FileReader.readAsText(file)
      → loadSGF(sgfString)
        → SgfEngine.parseSgf(sgfString) → tree
        → state.sgfTree = cloneTree(tree)
        → Extract main line → state.allSgfMoves[]
        → applyFilters() → state.sgfMoves[]
          → goToMove(0)
            → renderBoardToCtx() × 2 (initial + study)
            → onMoveChanged() → detectCurrentMoveTerm() → updateBadge()
            → renderGameTree()
```

### Move Navigation

```text
User clicks Next/Prev/Wheel/Keyboard
  → goToMove(index)
    → Cancel what-if mode, clear highlights
    → Rebuild board from baselineBoard + moves[0..index]
    → renderBoardToCtx() × 2
    → captureAnimation() if captures occurred
    → onMoveChanged()
      → _termHL.clear()
      → detectCurrentMoveTerm()
        → findPatternInMove() → blueVertices
        → evaluateTenuki() → greenVertices
      → updateBadge(patternMatch, blueVertices, greenVertices)
        → _termHL.set(blue, green, name, url)
    → renderGameTree()
```

### Highlight Hover

```text
Badge mouseenter
  → _termHL.show()
    → _active = true
    → window._highlightedCells = this.blue
    → window._responseVertices = this.green
    → drawBoard()
      → drawCellContent reads globals → blue + green CIRCLE_F fills
      → drawBottom reads this.blue/this.green → connection rects (if _active)
      → drawTop reads this.blue/this.green → ring outlines + atari triangles (if _active)

Badge mouseleave
  → _termHL.hide()
    → _active = false
    → window._highlightedCells = []
    → window._responseVertices = []
    → drawBoard() → clean board, no highlights
```

## Comment Highlight Syntax

Comments in SGF files support special `{...}` syntax for board highlights:

| Syntax | Effect |
| --- | --- |
| `word={A1}` | Highlight single coordinate with red circle |
| `word={A1,B2,C3}` | Highlight multiple coordinates |
| `word={here}` | Highlight the current move position |
| `word={qrt1}` | Highlight quadrant 1 (top-left hoshi area) |
| `word={qrt3--{qrt2}}` | Highlight sub-quadrant within parent quadrant |
| `word={ho(1)}` | Circle highlight around hoshi point 1 |
| `word={ho[1]}` | Rectangle highlight around hoshi point 1 |
| `tenuki={M12}` | "tenuki" as hyperlink highlighting M12 on board |
| `Here={qrt1, ho(2), ho(5)}` | Mixed groups — multiple highlights in one `{}` |
| `this={B[P5, Q4, R3], W[Q5, R4, S3]}` | Stone group highlight — B dark halos, W golden halos (hover highlights both) |
| `{cell(A1), cell(B2)}` | ref-Area cell block references — legacy format (inserted by ref-Area tool) |

### Hoshi Positions (0-indexed)

| ID | SGF Coord | Internal (col,row) |
| --- | --- | --- |
| ho(1) | D16 | (3,3) |
| ho(2) | K16 | (9,3) |
| ho(3) | Q16 | (15,3) |
| ho(4) | D10 | (3,9) |
| ho(5) | K10 | (9,9) |
| ho(6) | Q10 | (15,9) |
| ho(7) | D4 | (3,15) |
| ho(8) | K4 | (9,15) |
| ho(9) | Q4 | (15,15) |

## Comment Markdown Renderer

The comment display supports Markdown formatting in addition to the `{...}` highlight syntax. SGF comments are processed through `renderMarkdown()` before `parseCommentCoords()`, so both systems work together.

### Rendering Pipeline

```
Raw SGF comment text
  → renderMarkdown()         (Markdown → HTML)
    → parseCommentCoords()   ({COORD} → clickable <span> highlights)
      → innerHTML             (displayed in #sgf-comment-display)
```

### Supported Syntax

#### Block Elements

| Syntax | Output | Example |
| --- | --- | --- |
| `# heading` | `<h1>` | `# Strategy` → large heading |
| `## heading` | `<h2>` | `## The Shape` → section heading |
| `### heading` through `######` | `<h3>`–`<h6>` | Smaller sub-headings |
| `- item` or `* item` | `<ul><li>` | Unordered list |
| `1. item` | `<ol><li>` | Ordered list |
| `> text` | `<blockquote>` | Indented quote block |
| `---` or `***` or `___` | `<hr>` | Horizontal rule |
| `\| col1 \| col2 \|` | `<table>` | Pipe-delimited table |
| `\`\`\`lang` ... `\`\`\`` | `<pre><code>` | Fenced code block |
| blank line between blocks | paragraph break | `<p>` tags |

#### Inline Elements

| Syntax | Output | Example |
| --- | --- | --- |
| `**text**` | `<strong>` | Bold |
| `*text*` or `_text_` | `<em>` | Italic |
| `***text***` | `<strong><em>` | Bold italic |
| `~~text~~` | `<del>` | Strikethrough |
| `` `code` `` | `<code>` | Inline code with background |
| `[text](url)` | `<a href>` | Clickable link |
| `![alt](url)` | `<img>` | Inline image |

### Unicode Support

The highlight syntax supports Unicode characters in labels (not just ASCII):

| Syntax | Result |
| --- | --- |
| `台形={B[N6, M5, P6, P5]}` | "台形" rendered as clickable highlight spanning those stones |
| `石={D4}` | "石" (stone) rendered as clickable highlight on D4 |
| `corner={A1, B1, A2}` | "corner" rendered as clickable highlight on those coords |

The regex uses `(?<![A-Za-z0-9_-])` lookbehind + `[^\s=]+` to match any non-whitespace, non-equals characters as the label, including full Unicode text.

### Integration with Coordinate Highlights

Both systems coexist — Markdown is applied first, then coordinate highlights:

```javascript
// In updateCommentUI():
const mdRendered = renderMarkdown(comment);     // Markdown → HTML
const parsed = parseCommentCoords(mdRendered);  // {COORD} → <span>
elements.sgfCommentDisplay.innerHTML = parsed;
```

Coordinate patterns like `word={COORD}` survive Markdown processing because `renderMarkdown` only generates HTML tags (`<p>`, `<h1>`, etc.) — the `{COORD}` text content is preserved for `parseCommentCoords` to process.

### Comment Display Locations

| Location | Uses Markdown? | Uses Coordinate Highlights? |
| --- | --- | --- |
| Per-move comment (`#sgf-comment-display`) | Yes | Yes |
| Baseline/root comment (move 0) | Yes | Yes |
| Info panel note (`#info-comment-display`) | Yes | Yes |
| Export diagram (canvas) | No (plain text) | No |

### CSS Styling

All Markdown elements are styled via `#sgf-comment-display` descendant selectors in `index.html`:

| Element | Style |
| --- | --- |
| `h1`–`h6` | Bold, sized 1.15rem–0.9rem, margin 8px top |
| `p` | Margin 4px, line-height 1.5 |
| `ul`/`ol` | Margin 4px, padding-left 16px |
| `li` | Margin 2px, line-height 1.45 |
| `blockquote` | Left border 3px gray, italic, gray background |
| `code` | Monospace, gray background, 0.85em |
| `pre` | Gray background, 8px padding, overflow-x auto |
| `hr` | 1px solid gray, margin 8px |
| `table` | Collapsed borders, 4px 8px padding |
| `a` | Blue, dotted underline |

## Tech Log System

The project includes a **tech_log** — a standalone Next.js (Fumadocs) documentation site that renders the `SITEMAP.md` content as navigable web pages. It is built and served as static files from `tech-log-dist/`.

### SSOT Sync System — one source of truth, zero drift

Every user-facing surface that shows a version or content keeps in sync automatically from a single source: **the `SITEMAP.md` frontmatter `version:` field** and the **`SITEMAP.md` headings** themselves. `sync-docs.js` is the one sync engine; nothing is hand-edited downstream.

```
                           ┌──────────────────────────────────────────┐
                           │        SITEMAP.md  (source of truth)     │
                            │  frontmatter: version: 0.1.032           │
                           │  H2/H3 headings + body text              │
                           └───────────────────┬──────────────────────┘
                                               │  node sync-docs.js
                                               ▼
                                     ┌────────────────────┐
                                     │     sync-docs.js    │
                                     │  (single sync point)│
                                     └──────┬──────┬───────┘
              version sync                  │      │  content sync
              (syncVersion)                 │      │  (H2 → MDX pages)
   ┌──────────────────────────────┐         │      │        ┌──────────────────────────────────┐
   │  index.html  header label    │◄────────┘      └───────►│  tech-log/content/docs/*.mdx       │
       │  "tech_log-0.1.032"          │                        │  index.mdx + meta.json            │
   ├──────────────────────────────┤                        └───────────────┬──────────────────┘
   │  tech-log/src/lib/version.ts │                                        │  npx next build --webpack
       │  TECH_LOG_VERSION='0.1.032'  │                                        ▼
   ├──────────────────────────────┤                        ┌──────────────────────────────────┐
       │  tech_log-0.1.032.html       │                        │  tech-log/out/  →  tech-log-dist/ │
   │  (redirect, auto-created)    │                        │  served at /tech-log-dist/docs/   │
   └──────────────────────────────┘                        └──────────────────────────────────┘
```

**Rules for "always in sync":**

1. **Version** — bump only `version:` in the `SITEMAP.md` frontmatter, then run `npm run build-docs` (or `node sync-docs.js`). `sync-docs.js`'s `syncVersion()` patches all three version consumers automatically: the `index.html` header link label (`tech_log-{version}`), `TECH_LOG_VERSION` in `tech-log/src/lib/version.ts` (docs nav badge), and creates the `tech_log-{version}.html` redirect file when missing. Running a second time reports *"Version … already in sync across all consumers."*
2. **Content** — edit only `SITEMAP.md` (or `board-estimate.md` / `liberties.md` / `SGF_COMPLIANCE_UPGRADE_LOG.md`); `sync-docs.js` splits `SITEMAP.md` H2 sections into `.mdx` pages, rebuilds `meta.json` sidebars, and the Next.js static export lands in `tech-log-dist/`.
3. **Never hand-edit downstream artifacts** — `index.html`'s label, `version.ts`, redirect files, and `tech-log/content/docs/*.mdx` are all generated/patched output. Hand edits are overwritten on the next sync.

**How to update these docs (flow)**

```
SITEMAP.md (edit: frontmatter version + content)
  → node sync-docs.js         (syncs version everywhere + regenerates content/docs/*.mdx)
    → cd tech-log && npx next build --webpack    (static export → tech-log/out/)
      → cp -r out/* ../tech-log-dist/            (served: http://localhost:8577/tech-log-dist/docs/)
```

One command does all of it: `npm run build-docs` (defined in the root `package.json`).

### How It Works

```
baduk-notes/
  ├── tech-log/                    ← Next.js source project
  │   ├── source.config.ts         ← Fumadocs: defineDocs({ dir: 'content/docs' })
  │   ├── content/docs/            ← MDX content files (GENERATED by sync-docs.js from SITEMAP.md)
  │   │   ├── index.mdx            ← Landing page
  │   │   ├── meta.json            ← Page ordering for sidebar
  │   │   ├── overview/            ← Overview section
  │   │   │   ├── meta.json
  │   │   │   ├── project-purpose.mdx
  │   │   │   └── application-files.mdx
  │   │   ├── system-design/       ← System design section
  │   │   │   ├── meta.json
  │   │   │   ├── board-canvas-system.mdx
  │   │   │   ├── ui-architecture.mdx
  │   │   │   └── highlight-color-system.mdx
  │   │   ├── internals/           ← Internals section
  │   │   │   ├── meta.json
  │   │   │   ├── architecture.mdx
  │   │   │   ├── data-flow.mdx
  │   │   │   └── comment-highlight-syntax.mdx
  │   │   └── reference/           ← Reference section
  │   │       ├── meta.json
  │   │       ├── assets.mdx
  │   │       ├── reference-data.mdx
  │   │       ├── agents-skills.mdx
  │   │       └── reference-tables.mdx
  │   ├── src/lib/
  │   │   ├── source.ts            ← Fumadocs loader: loader({ baseUrl: '/docs', source: docs.toFumadocsSource() })
  │   │   └── version.ts           ← TECH_LOG_VERSION (auto-synced to SITEMAP.md frontmatter by sync-docs.js)
  │   └── src/app/docs/
  │       ├── layout.tsx           ← DocsLayout with nav title + version badge
  │       └── [[...slug]]/page.tsx ← Catch-all route: resolves slug → MDX page
  └── tech-log-dist/               ← Built static output (served by main app)
      └── docs/                    ← All pages rendered as static HTML
```

### Content Loading Pipeline

1. **`source.config.ts`** tells Fumadocs to scan `content/docs/` for `.mdx` files
2. **`meta.json`** files in each directory define page ordering and section titles for the sidebar
3. **`src/lib/source.ts`** creates a Fumadocs loader with `baseUrl: '/docs'` — this maps URL slugs to content files
4. **`src/app/docs/[[...slug]]/page.tsx`** is the catch-all route — it receives the slug (e.g. `['system-design', 'highlight-color-system']`), looks up the page via `source.getPage(params.slug)`, and renders the MDX body
5. **`src/app/docs/layout.tsx`** wraps pages in `DocsLayout` with the sidebar tree and version badge (reads `TECH_LOG_VERSION` from `src/lib/version.ts`)

### Version Display

The version string (`TECH_LOG_VERSION`) is displayed in two places, both auto-synced by `sync-docs.js` from the `SITEMAP.md` frontmatter `version:` field:
1. **Tech log nav bar** — `<span style={{ color: '#9F2627' }}>{TECH_LOG_VERSION}</span>` next to the "baduk-notes" title in the docs layout
2. **Main app header** — `<a href="/tech-log-dist/docs/">tech_log-{version}</a>` link in `index.html` (line 298)

`sync-docs.js` also creates the `tech_log-{version}.html` redirect file when missing. To bump the version, change **only** the `version:` field in the `SITEMAP.md` frontmatter and run `npm run build-docs` (or `node sync-docs.js`); every consumer is patched automatically.

### URL Routing

| URL | Content |
| --- | --- |
| `/tech-log-dist/docs/` | Landing page (`content/docs/index.mdx`) |
| `/tech-log-dist/docs/overview/project-purpose` | Project purpose page |
| `/tech-log-dist/docs/system-design/highlight-color-system` | Highlight color system page |
| `/tech-log-dist/docs/internals/architecture` | Architecture page |
| `/tech-log-dist/docs/reference/assets` | Assets reference page |

### Adding New Pages

1. Create a `.mdx` file in the appropriate `content/docs/` subdirectory
2. Add the filename (without `.mdx`) to the `pages` array in that directory's `meta.json`
3. Rebuild: `cd tech-log && npm run build` → output goes to `tech-log-dist/`

### Searching

The tech log includes a search API at `/api/search` (route handler in `src/app/api/search/route.ts`) that indexes all MDX content for full-text search via Fumadocs.

### How to Update These Docs

When `SITEMAP.md` or any project documentation changes, the tech-log MDX pages must be updated, rebuilt, and synced (structure overview: *SSOT Sync System* above). Here is the exact workflow:

#### Update Flow

```
SITEMAP.md (source of truth)
  → node sync-docs.js (generates tech-log/content/docs/*.mdx)
    → cd tech-log && npx next build --webpack (static export → tech-log/out/)
      → cp -r out/* ../tech-log-dist/ (sync to served directory)
        → http://localhost:8577/tech-log-dist/docs/ (live)
```

#### Step-by-Step Instructions

1. **Edit `SITEMAP.md` or standalone doc files (`board-estimate.md`, `liberties.md`)**:
   - `SITEMAP.md` is the primary source of truth. Running `node sync-docs.js` automatically parses `SITEMAP.md` H2 headers into matching `.mdx` pages in `tech-log/content/docs/`.

2. **Bump the version**:
   - Edit the `SITEMAP.md` frontmatter `version:` field (single source of truth):
     ```yaml
version: 0.1.032
     ```
   - `sync-docs.js` automatically propagates it everywhere: patches the `index.html` header link label (`tech_log-0.1.032`), updates `TECH_LOG_VERSION` in `tech-log/src/lib/version.ts`, and creates the `tech_log-0.1.032.html` redirect file if missing. No manual edits to those files needed.

3. **Run the One-Line Sync & Build Command**:
   ```bash
   npm run build-docs
   ```
   *Alternative manual command:*
   ```bash
   node sync-docs.js && cd tech-log && npx next build --webpack && rm -rf ../tech-log-dist/* && cp -r out/* ../tech-log-dist/
   ```

4. **Verify**:
   Open `http://localhost:8577/tech-log-dist/docs/` and confirm:
   - Version badge shows the new version (`0.1.032`) in the sidebar
   - Updated content renders cleanly

---

#### Error Prevention & Webpack Troubleshooting Guidelines

To prevent `Build failed because of webpack errors` or build stalls during Next.js export, enforce the following critical rules:

##### Rule 1: Prevent MDX Acorn Syntax Parsing Errors (`Could not parse expression with acorn`)
- **Cause**: MDX2/MDX3 in Fumadocs parses all unescaped `{` and `}` characters outside code fences as JavaScript JSX expressions.
- **Prevention**:
  - **Never** write unescaped object types, template literals, or curly brace syntax in plain MDX text or headers.
  - *Wrong*: `{r, c}` or `W+${wTotal - bTotal}` or `{player: 'B'|'W'}`
  - *Correct*: Always wrap curly brace structures in code backticks: `` `{r, c}` ``, `` `W+${wTotal - bTotal}` ``, or code blocks (` ``` `).
  - **LaTeX Math in MDX**: Math is supported via `remark-math` + `rehype-katex` (configured in `source.config.ts` with `rehypePlugins: (v) => [rehypeKatex, ...v]` so katex runs before the syntax highlighter). Use `$ ... $` for inline and `$$ ... $$` for display math. Curly braces *inside* math blocks are safe (they are parsed by remark-math before acorn), but never leave `{`/`}` unescaped in plain prose.

##### Rule 2: Prevent Offline Font Fetching Failures (`Failed to fetch Geist from Google Fonts`)
- **Cause**: Standard `next/font/google` in `layout.tsx` attempts to fetch font CSS from Google Fonts over HTTP. In sandboxed or offline build environments without internet access, `next build` fails.
- **Prevention**: Keep `layout.tsx` clean of `next/font/google` imports. Use standard system font classes (`font-sans`) in `<body className="antialiased font-sans">`.

##### Rule 3: Resolve Stale Next.js Build Locks (`Another next build process is already running`)
- **Cause**: A previous build process was interrupted or left running in the background.
- **Prevention**: Kill stale `next` node processes before starting a build:
  ```bash
  pkill -f next || true
  ```

##### Rule 4: Fix Turbopack Root Workspace Misdetection (`Turbopack panic reading dir /Users/...`)
- **Cause**: Next 16 Turbopack scans parent directories if a root `package-lock.json` exists in `~`.
- **Prevention**: Ensure `turbopack: { root: path.resolve(__dirname) }` is present in `tech-log/next.config.ts` or build using `npx next build --webpack`.
3. Build and sync (steps 3–4 above)

## Assets

### `_img-svg/` — Board & Stone Graphics

| Subdir/File | Contents |
| --- | --- |
| `Go_00.svg` – `Go_99.svg` | Numbered stone SVGs (00-99) |
| `Go_b.svg`, `Go_w.svg` | Base black/white stones |
| `Go_b1.svg`–`Go_b9.svg`, `Go_w1.svg`–`Go_w9.svg` | Capture count stones |
| `Go_bS.svg`, `Go_bT.svg`, `Go_bX.svg` | Black star/triangle/cross marks |
| `Go_wS.svg`, `Go_wT.svg`, `Go_wX.svg` | White star/triangle/cross marks |
| `Go_-S.svg`, `Go_-T.svg`, `Go_-X.svg` | Empty position marks |
| `Go_*c.svg` variants | Circle-marked stones (b/w/empty, directional) |
| `Go_board_diagram_image.svg` | Board diagram background |
| `letters/Go_A.svg` – `Go_Z.svg` | Letter overlay SVGs |
| `numbers/Go_1.svg` – `Go_99.svg` | Number overlay SVGs |
| `reset-svgrepo-com.svg` | Reset button icon |
| `exc-ataried-mark.svg` | Atari warning mark |
| Various `.png` | Stone textures, board textures, UI screenshots |

### `_sfx/` — Sound Effects

| File | Sound |
| --- | --- |
| `stone_takk.wav` | Stone placement |
| `annot.wav` / `annot_undo.wav` | Annotation on/off |
| `branch_7.wav` | Branch navigation |
| `brd_flip.mp3` | Board flip |
| `remove1.wav` | Stone removal |
| `undo.wav` | Undo |
| `spo_ge_igo_utu03.mp3` / `碁石を打つ.mp3` | Japanese stone placement |

### `f0nts/` — Typography

| Font | Usage |
| --- | --- |
| `anthropic_sans_text_*.ttf` | Primary UI font (12 weights) |
| `Figtree-SemiBold.ttf` | Secondary heading font |
| `GoogleSansCode_Proportional-*.ttf` | Code/monospace |
| `PretendardEN-*.otf` | Korean/Japanese text |
| `iGo-RodinPro.otf` | Go-specific typography |
| `Courgette-Regular.ttf` | Cursive accent |
| `PPLX-Sans-Beta-v2-VF.woff2` | Variable sans-serif |

## Reference & Data

### `red-bean/` — SGF Specification

| File | Description |
| --- | --- |
| `sgf-spec.html` | SGF specification (HTML) |
| `sgf-spec.pdf` | SGF specification (PDF) |
| `book.md` / `book.tex` | SGF book content |
| `index.html` | Reference index |
| `crawl/` | 100+ crawled SGF reference pages (.md/.json) |

### `kifu/` — Game Records

| Dir | Contents |
| --- | --- |
| `Go Seigen [1928-1978 -- 147 games]/` | 147 SGF game files |

### `pre_sgf/` — Working SGFs

Mixed SGF files, PNGs, and reference images for testing.

## Agents & Skills

### `.agents/skills/` — 18 Skill Directories

| Skill | Purpose |
| --- | --- |
| `agents-sdk/` | Cloudflare Agents SDK development |
| `banner-design/` | Social media / ad banner generation |
| `brand/` | Brand voice, identity, asset management |
| `cloudflare/` | Cloudflare platform (Workers, Pages, storage, AI) |
| `cloudflare-email-service/` | Email sending/routing with Cloudflare |
| `cloudflare-one/` | Zero Trust and SASE work |
| `cloudflare-one-migrations/` | Migrations from Zscaler/Palo Alto/VPN |
| `customize-opencode/` | OpenCode configuration editing |
| `design/` | Logo, CIP, icon, slides, social photos |
| `design-system/` | Token architecture, component specs, slide generation |
| `durable-objects/` | Cloudflare Durable Objects |
| `sandbox-sdk/` | Sandboxed applications for secure code execution |
| `slides/` | HTML presentation creation |
| `turnstile-spin/` | Cloudflare Turnstile CAPTCHA setup |
| `ui-styling/` | shadcn/ui, Tailwind CSS, canvas design |
| `ui-ux-pro-max/` | Comprehensive UX guide (67 styles, 161 palettes, 57 fonts) |
| `web-perf/` | Web performance analysis via Chrome DevTools |
| `workers-best-practices/` | Cloudflare Workers best practices |
| `wrangler/` | Cloudflare Workers CLI |

### `.codex/` — Mirror of `.agents/skills/`

## Reference Tables

### Board Canvas Constants

| Constant | Value |
| --- | --- |
| `CANVAS_SIZE` | 600 |
| `PADDING` | 36 |
| `CELL_SIZE` | `GRID_SIZE / 18` |
| `COLS` | `A B C D E F G H J K L M N O P Q R S T` (no I) |

### Key Global Variables

| Variable | Set By | Read By | Purpose |
| --- | --- | --- | --- |
| `window._highlightedCells` | `_termHL.show()`, cleared by `_termHL.hide()`/`clear()` | `drawCellContent()` | Blue fill positions |
| `window._responseVertices` | `_termHL.show()`, cleared by `_termHL.hide()`/`clear()` | `drawCellContent()` | Green fill positions |
| `window._commentCoordHighlights` | `parseCommentCoords()` on comment hover | `drawCellContent()` | Red comment highlights |
| `window.state` | annotation_v4.js init | All modules | Central app state |
| `window._termHL` | move-term-detector.js init | Both JS files | Unified highlight object |
| `window.PhaseDetectorConfig` | phase-detector.js defaults + user overrides | `detectGamePhaseDynamic()` | Phase detection tuning |
| `window._phaseDebug` | phase-detector.js (when debug=true) | `console.table()` | Per-move phase diagnostics |
| `window.detectGamePhaseDynamic` | phase-detector.js | annotation_v4.js | Phase classification API |
| `window.runScoreEstimate` | annotation_v4.js (per-game init) | annotation_v4.js, test harnesses | Score-estimate trigger (`⌘+Shift+E`) — opens the yellow Estimation panel with the Computational Method blue panel (Run/Compute control at Game End); exposes the estimate pipeline to headless tests |
| `window.openScoringModal` | annotation_v4.js | estimation modal, scoring modal, test harnesses | Opens the Manual Scoring Modal — fresh (from current board state) or restored from `savedData` (`rec.scoringData`) |
| `window.estimatePanel` | annotation_v4.js | annotation_v4.js, test harnesses | Reference to the estimate modal panel element |

### Tenuki Detection Zones

The board is divided into 9 zones for Tenuki evaluation:

```
┌───────────────────┬───────────────────┬───────────────────┐
│  Top-Left Corner   │   Top Side        │  Top-Right Corner │
│  (c<6, r<6)       │  (c∈[6,12], r<6)  │  (c>12, r<6)     │
├───────────────────┼───────────────────┼───────────────────┤
│  Left Side         │   Center          │  Right Side       │
│  (c<6, r∈[6,12])  │  (c∈[6,12], r∈[6,12]) │ (c>12, r∈[6,12]) │
├───────────────────┼───────────────────┼───────────────────┤
│  Bottom-Left       │   Bottom Side     │  Bottom-Right     │
│  Corner            │  (c∈[6,12], r>12) │  Corner           │
│  (c<6, r>12)      │                   │  (c>12, r>12)     │
└───────────────────┴───────────────────┴───────────────────┘
```

Adjacent zones are: corners adjacent to their two sides; sides adjacent to their two corners; center adjacent to all 8 zones.
