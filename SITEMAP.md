---
title: Project Sitemap
description: baduk-notes — Go/Weiqi board diagram annotator & SGF re-Player
version: 0.1.059
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

### v0.1.059 — Locking freezes the score: once Dead Stones + Territory are Locked the computation is DONE — the formula, totals, and result badge freeze to the committed locked resolution, and every post-lock counting action (replace / re-arrange) becomes a pure cosmetic display aid that can never move the displayed score

The Lock stage (v0.1.058) committed the resolution, but only the SGF Properties bars froze: the modal's own read-out — the section-8 formula, the totals, and the result badge — still recomputed from the LIVE board/marks/captures, so a post-lock fill moved the displayed score in the modal while the bars stayed pinned, and a user could close the modal with a "counted" resolution that no longer matched the frozen commit. v0.1.059 makes the freeze total.

**One source of truth for the read-out.** A new `computeScoringSummary(ss)` computes territory (raw per-cell counts from `computeScoringPropsFromSession`, with the occupied-cell guard and `manualTerritory` override), dead (from the marks), captures, komi, and both totals for either the live `scoringState` or a `lockedSnapshot`. The section-8 formula AND the `#scoring-result-display` badge both read it, selecting the `lockedSnapshot` when locked — the badge and the formula are computed from exactly the same numbers (they previously ran two separate GoScorer passes over different inputs), and neither can move while locked. The old two-loop territory counting in `renderScoringBoardToCtx` and the `countTerritoryFromScores` helper are deleted.

**Post-lock counting actions are cosmetic.** `placeScoringStoneByMode` early-returns before any stack/capture mutation when locked; the replace branches, rearrange pickup/placement, the color-picker dialog's Dead source buttons, and clear-buckets all skip their pops/decrements while locked. The stone still lands on the live board (the physical-count display aid), but nothing can consume a prisoner, move a capture counter, or clear a dead mark; the tray buckets (Dead/Caps/Re-arrange) render from the locked resolution. Dead marks never clear — unchanged.

**Undo gets a boundary.** `applyScoringLock` records `lockBoundaryIndex = scoringHistory.length` and RETAINS the pre-lock marking history; while locked, `undoScoring` caps at the boundary and the Undo button disables there, so undo can never step back onto a pre-lock board mid-count. `applyUnlockReset` restores the locked snapshot, truncates history at the boundary, and re-enables Undo — so Reset → Unlock → Undo×N walks the marking phase back to the pristine terminal board.

**Save/close agrees with the frozen read-out.** `buildScoringSessionSnapshot` and `computeSgfPropertyBars` serialize the `lockedSnapshot` board/props while locked, so Saved `DD`/`MA`/`TB`/`TW`, the blue panel's Run, the SGF Properties bars, and a reopened modal all show the committed resolution — the cosmetic post-lock board is never persisted. Reset Board while locked restores ONLY the post-D&T locked resolution (`resetScoringBoardFromState({pristine:true})` never restores pristine or the cosmetic board); the reset dialog's message is now dynamic (`#scoring-reset-confirm-msg`) so it explains the post-lock restoration. While locked the rule-mode select, the komi input + ±0.5 buttons, and clear-buckets are no-ops, and `restoreScoringFromSavedData` backfills `komi` onto legacy `lockedSnapshot`s so the frozen formula still renders "+ 6.5 (komi)".

Headless-verified (puppeteer against the repo, 56 checks across sections A–L, harness extended from 47): (A/B) a locked plain-territory fill places the stone on the live board but the formula/totals/result read-out, the tray buckets, `DD`/`MA`, the capture counters, and the `lockedSnapshot` board are byte-for-byte frozen across four fills; (C) a dead-X cell fill keeps its mark and `DD`/`MA`, dropping only the cosmetic territory; (F) fresh files open unlocked while file markup pre-engages the lock; (G) the SGF Properties bars freeze while locked; (H) editing a locked stone shows the unlock dialog and applies the parked click after the reset; (I) `locked` + `lockedSnapshot` persist through close/reopen; (J) Undo while locked caps exactly at the lock commit point (a third Undo is a no-op) and can never reach a pre-lock board; (K) Reset while locked restores the post-D&T resolution with the undo stack capped, and Unlock → Undo×N walks back to the pristine terminal board; (L) Save while locked persists the COMMITTED resolution to the terminal node — reopen shows the frozen resolution, not the cosmetic fill. All regression harnesses pass (`verify_no_autoseed`, `verify_gate_btn`, `verify_result_tag`, `verify_see_scoring`; the two pre-v0.1.055 `verify_source_note*` harnesses are stale). `node --check` clean; annotation_v4.js is now 16,865 lines, index.html 2,616 lines.

### v0.1.058 — The Manual Scoring Modal now runs on a committed "Lock" stage: Mark Dead Stones + Mark Territories are the mandatory first stage, locking freezes the SGF Properties read-out and unlocks Replace/Re-arrange, and dead marks NEVER clear — the dead X survives every fill

The counting tools exposed a deep inconsistency. *Replacing Dead Stones* and *Re-arranging* existed only as a physical-count ritual that is meaningless before the Life & Death resolution exists, yet they were always available; and the previous mark-clearing behavior (v0.1.057 kept it only for the dead-X cell: "marks survive replacing" everywhere except a fill into a cell that already carried the dead X) meant the one spot the physical ritual most wants to fill — the dead-marked point — silently erased its own dead-stone resolution from `DD`/`MA`. This version introduces a real professional workflow: **resolve → Lock → count**, with the dead X as an immutable overlay that never clears.

**The Lock stage.** Mark Dead Stones + Mark Territories are now the mandatory first stage. A **🔒 Lock Dead Stones + Territory** button (`#btn-scoring-lock`, next to Save) commits the resolution: it captures a `lockedSnapshot` of the exact board/marks/territory/buckets/captures, flips the lock on, and only then enables *Replacing Dead Stones* and *Re-arranging* — before the lock both options render disabled-but-visible with the amber hint ("Mark dead stones first — Replace/Re-arrange unlock after locking"). Files whose SGF already carries `DD`/`MA`/`TB`/`TW` **pre-engage the lock** on open (a file markup is a committed resolution); fresh files open unlocked. While locked, the SGF Properties bars (`DD`/`MA`/`TB`/`TW`) **freeze to the locked snapshot** and show a lock badge (`#sgf-prop-lock-badge`) — fills become display aids that cannot move the committed read-out.

**Marks never clear (the v0.1.043 exception is deleted).** Every replace/re-arrange action keeps `markedDead`/`deadStonesInfo` untouched. Filling a dead-X cell now places the territory-colored prisoner AND keeps the X over it (`DD`/`MA` never shrink); the dead stone remains a prisoner through the mark, while its freed point stops being territory (the cell is occupied), so a dead-X fill drops only the territory side (−1) and the prisoner term stays — captured in the harness as "dead stone stays a prisoner via the mark." The GoScorer read-out had to be made consistent: `territoryScoring` reports territory on a transparent occupied cell, so `countTerritoryFromScores` and the score-breakdown loop in `renderScoringBoardToCtx` now skip occupied cells (`ss.board[y][x] !== 0`), matching the territory shading and the `computeScoringPropsFromSession` occupied-skip — all three read-outs now agree that an occupied point is a stone, never territory.

**Unlock = reset to the locked resolution, not pristine.** Editing a locked mark/territory (or pressing Unlock) parks the click in `pendingLockEdit`, and when post-lock counting work exists (placed/removed stones, capture drift, manual-territory edits — `countPostLockActions`) shows the amber "Unlock & Reset" confirmation dialog listing what would be discarded. Confirming restores the locked snapshot (board, marks, territory, buckets, captures; the counting phase's undo history is dropped and the mode reverts to the resolution stage) and replays the parked edit click so the user's intended mark change still lands. Unlock with nothing pending applies directly. Lock state persists: `locked` + `lockedSnapshot` are written to the session snapshot (`copySnapshotShape` deep-copy) and restored on reopen, so a saved/reopened resolution re-engages the lock and re-enables Replace/Re-arrange.

Headless-verified (puppeteer against the repo, 44 checks across sections A–I): (A/B) markup-file plain-territory fills keep `DD`/`MA` and the mark set byte-for-byte unchanged with the margin pinned (−1 per player per fill); (C) a dead-X cell fill places the stone, keeps its mark, keeps `DD`/`MA`, stops being territory (−1 total), and keeps the dead stone a prisoner via the mark (only the territory side drops); (D) manual marks → Lock → replace fills keep `DD`/`MA` intact; (E) Save writes the FULL pre-fill `DD` set to the terminal node; (F) fresh SGF opens unlocked with Replace/Re-arrange disabled + hint visible, and file `DD`/`MA`/`TB`/`TW` pre-engages the lock with both enabled + badge visible; (G) while locked the SGF Properties bars stay frozen through a counting fill while the live read-out moves, the pending-action unlock shows the confirm dialog, confirming restores the locked resolution, and Replace re-disables; (H) clicking a live stone while locked shows the dialog, and the intended mark edit is APPLIED after the reset; (I) `locked` + `lockedSnapshot` persist through close/reopen and Replace re-enables. All regression harnesses pass (`verify_no_autoseed`, `verify_gate_btn`, `verify_result_tag`, `verify_see_scoring`; the two pre-v0.1.055 `verify_source_note*` harnesses are stale — they assert the removed auto-seed behavior). `node --check` clean; annotation_v4.js is now 16,880 lines, index.html 2,616 lines.



Replacing a dead stone (clicking a territory point in *Replacing Dead Stones* mode) must never shrink the game's resolved Life & Death set: the "Marked Dead Stones" value in SGF Properties (the `DD`/`MA` counts derived from `markedDead`/`deadStonesInfo` via `computeSgfPropertyBars`) dropped by 1 on every fill, even though the user was only physically counting prisoners — the game's dead-stone resolution was silently being erased.

Root cause: the replace branch cleared one dead mark per fill through the `consumeDeadMarkFromState` helper (introduced in v0.1.042 to keep the score's dead term falling with the fill), and since the SGF Properties bars and the score both read the marks, each fill subtracted one from `DD`/`MA`. That mark-clearing existed only to make the score arithmetic work — it conflated the counting ritual with the Life & Death resolution.

Fix in `annotation_v4.js`: `consumeDeadMarkFromState` is deleted and every replacement fill now keeps the marks untouched and instead decrements the capture counter (`whiteCaptures` for a fill of Black's territory with a dead Black stone, `blackCaptures` for a fill of White's territory with a dead White stone). The prisoner term in the score still drops by exactly 1 per fill — the dead stone stays in the marks (it is still resolved as dead) while its prisoner accounting for the score runs through the captures counter — so the final margin stays pinned (both players still lose exactly 1 per fill) AND `DD`/`MA` in SGF Properties stay at their full pre-fill values. The dead-marked cell itself is the single exception (unchanged v0.1.043 behavior the user chose to keep): filling a cell that already carries the dead X still clears only that cell's mark, relocating it `mark → capture`, so that path remains the only replace action that reduces `DD`/`MA` by one. `node --check` clean; file is now 16,664 lines.

Headless-verified (puppeteer against the repo): on the Go Seigen test SGF — a plain-territory replace fill leaves `DD`/`MA` counts and the mark set byte-for-byte unchanged while both totals drop by exactly 1 (B 16→15, W 41→40, margin pinned); three further fills keep `DD`/`MA` intact with the margin pinned through all of them; a fill on a dead-marked cell still succeeds and drops `DD`/`MA` by exactly 1 (only its own cell); manual-mark fills keep `DD`/`MA` intact; and Save after a replace writes the FULL pre-fill `DD` set to the terminal node — the marks are never consumed by replacing. All checks pass.

### v0.1.056 — The Manual Scoring Modal now shows the record's result read-out: a "Result ... (default)" row directly below the "Komi ... (default)" row, derived from the SGF's `RE` value, or "n/a (default)" when the record defines none

The modal's sidebar showed the game's komi (with its SGF-derived "(default)" tag) but gave no read-out of the recorded result. The Scoring Modal is where a user confirms a game's end state, so the game's own `RE` (e.g. `W+2`) belongs right next to it.

Fix: a new `scoring-result-default-tag` span was added to the modal sidebar immediately after the Komi Control row (`index.html`, same style as the komi default tag), and `openScoringModal()` populates it on every open — both the fresh path and the restore-from-saved-session path — from the SGF's `RE` metadata (`state.sgfMetadata.re`, falling back to `state.gameInfo`), trimmed, with "n/a" when the record defines none.

Verified with puppeteer against the repo (3 checks): the repo's test SGF (`RE[W+2]`) → tag reads `W+2 (default)`; the Result row sits directly below the Komi Control row in the sidebar; a copy of the SGF with `RE` stripped → tag reads `n/a (default)`. `node --check` clean. Bump to v0.1.056 with changelog narrative; annotation_v4.js table (16,691 lines) updated; docs rebuilt and all version consumers synced.

### v0.1.055 — The Manual Scoring Modal never auto-marks dead stones: first open on a record without DD/MA/TB/TW starts with zero dead marks (only territory may auto-derive); dead stones are recorded only from the user's manual marks when they hit Save

The dead-stone heuristic (goscorer/Sabaki `detectDeadStonesHeuristic`) auto-seeded dead marks on the FIRST open of the Manual Scoring Modal whenever the loaded record declared no endgame markup — and closing the modal persisted that "auto-seeded" session, so the Estimation panel's Run then computed a score from machine-guessed dead stones (15 in the test game) instead of showing the Dead-Stone Gate. The v0.1.050–v0.1.054 work only *labeled* this provenance (red "auto-seeded"); the spec is now explicit: dead stones are always the file's own DD/MA/TB/TW *or* the user's manual marks — never a heuristic.

Fix: `resetScoringBoardFromState()` no longer calls `seedAutoDeadMarks()` on first entry (the call block and the now-dead function were removed). First open on a markup-less record now shows the board exactly as played with ZERO auto-marked dead stones; only territory is allowed to auto-derive (GoScorer derives it from whatever dead marks exist — none at open). Dead stones are recorded exclusively when the user marks them manually with the X tool and hits Save, which writes DD/MA/TB/TW into the terminal SGF node and persists `rec.scoringData`. Because a session-only resolution on a markup-less file is now by definition the user's own manual marks, the Run panel's red note text was updated from the now-impossible "auto-seeded" to **Deterministic JTS from manual dead-stone marks (marked in Manual Scoring).** (yellow "(SGF)" and gray default unchanged). Stale comments referencing the heuristic were updated throughout.

Verified with puppeteer against the repo (13 checks): (A) first MSM open on a no-markup file → zero auto-marked dead stones, empty dead buckets (previously 15); (B) open+close MSM with no marks → the session does not resolve and Run still shows the "No DD/MA/TB/TW Endgame Markup Found" gate; (C) a file WITH DD/MA/TB/TW still seeds dead stones from its own markup and stays yellow "(SGF)"; (D) manual click → Save → DD written to the terminal SGF node, `computeSgfPropertyBars()` derives it, `isSgfDirty` set, and Run after Save computes JTS with the yellow "(SGF)" note; (E) manual marks closed WITHOUT Save → session resolves, Run computes JTS with the red "manual dead-stone marks" note (no "auto-seeded" text anywhere). `node --check` clean. Bump to v0.1.055 with changelog narrative; annotation_v4.js table (16,684 lines) updated; docs rebuilt and all version consumers synced.

### v0.1.054 — The source note now keys on whether the SGF FILE declares DD/MA/TB/TW, not on provenance: a scoring session on a record whose SGF carries the markup still reads yellow "Deterministic JTS from DD/MA/TB/TW endgame markup (SGF)." — red "auto-seeded" is reserved for resolutions that exist only through the dead-stone heuristic with no SGF markup

The v0.1.052 note labeled by provenance, so a game like REC_NO 003 whose SGF declares DD/MA/TB/TW still showed the red "auto-seeded" note once a Manual Scoring session existed on the record — even though the modal seeds that session from the record's own DD/MA/TB/TW (never the heuristic when markup exists), so the JTS was in fact computing from SGF markup. The "(SGF)" yellow text the v0.1.052 spec called for was not honored in that case.

Fix: `scoringSourceNote` now decides by `findEndgameMarkup(false)` (pure SGF sources — moves, root props, main line; session fallback skipped) in front of provenance: snapshot resolves AND the SGF file itself declares markup → yellow **Deterministic JTS from DD/MA/TB/TW endgame markup (SGF).**; snapshot is session-resolved with no SGF markup anywhere → red **Deterministic JTS from "auto-seeded" endgame markup.**; no resolution (Dead-Stone Gate) → the original gray text. Rendered at panel build time and refreshed at Run-click time from the exact snapshot being scored.

Verified with puppeteer against the repo (4 checks): no-markup fresh load → gray default; SGF with terminal DD/MA/TB/TW, no session → yellow "(SGF)"; SGF with DD/MA/TB/TW PLUS a persisted/closed scoring session (prov=`Manual Scoring session`) → still yellow "(SGF)"; no-markup game with an auto-seeded session → red "auto-seeded". `node --check` clean. Bump to v0.1.054 with changelog narrative; annotation_v4.js table (16,725 lines) updated; docs rebuilt and all version consumers synced.

### v0.1.053 — The Dead-Stone Gate's "Open Manual Scoring Modal" button now behaves exactly like "See Scoring": it closes the Estimation panel (⌘⇧E toggle) and then opens the Manual Scoring Modal

Inside the "No DD/MA/TB/TW Endgame Markup Found" gate card, clicking "Open Manual Scoring Modal" opened the modal while the Estimation panel stayed open underneath — inconsistent with the "See Scoring" button, which closes the panel first.

Fix: the `#btn-open-manual-scoring` click handler now mirrors the "See Scoring" handler exactly — stop propagation, invoke the same `runScoreEstimate()` toggle that ⌘⇧E triggers (removes the `#estimate-rich-panel`, clears the estimate map/dead X marks, resets the Estimate toolbar button, redraws the board) and THEN calls `openScoringModal()` — the same call behind the ⚑ Endgame Scoring shortcut, so the modal restores the latest saved/live scoring session identically.

Verified with puppeteer against the repo (3 checks): no-markup game at the final move → Run → Dead-Stone Gate card with the button shows; clicking it removes the `#estimate-rich-panel` (panel and Run button gone from the DOM) AND reveals the `#scoring-modal-overlay` (hidden class removed, display flex). `node --check` clean. Bump to v0.1.053 with changelog narrative; annotation_v4.js table (16,722 lines) updated; docs rebuilt and all version consumers synced.

### v0.1.052 — The blue panel's Run subtitle now names the JTS input source in color: red "Deterministic JTS from \"auto-seeded\" endgame markup." when the compute runs off the Manual Scoring session (its auto-seeded dead-stone heuristic), yellow "Deterministic JTS from DD/MA/TB/TW endgame markup (SGF)." when the SGF itself declares DD/MA/TB/TW

When a game with no endgame markup had its Manual Scoring Modal opened (auto-seeded dead stones from the goscorer heuristic) and closed again, the Run control still carried the generic subtitle "Deterministic Japanese territory scoring from DD/MA/TB/TW endgame markup." — so the deterministic JTS appeared to be scoring from markup the SGF never actually declared.

Fix: the subtitle under "Run / Compute >" is now a source-aware `#scoring-source-note` driven by `resolveScoringInputs()`'s provenance. It is rendered at panel build time and refreshed at Run-click time from the exact snapshot being scored, so the label can never drift from the computation: provenance `Manual Scoring session` → red **Deterministic JTS from "auto-seeded" endgame markup.**; provenance `SGF endgame markup (DD/MA/TB/TW)` → yellow **Deterministic JTS from DD/MA/TB/TW endgame markup (SGF).**; no resolution (Dead-Stone Gate case) → the original gray text.

Verified with puppeteer against the repo (8 checks): fresh no-markup load → gray default note + gate fires; an SGF with terminal DD/MA/TB/TW markup → yellow "(SGF)" note + JTS computes and the note stays yellow after Run; opening/closing the MSM on a no-markup game (auto-seeds 15 dead stones, persists the session) → red "auto-seeded" note + JTS computes and the note stays red after Run. `node --check` clean. Bump to v0.1.052 with changelog narrative; annotation_v4.js table (16,717 lines) updated; docs rebuilt and all version consumers synced.

### v0.1.051 — Clicking "See Scoring" now closes the Estimation panel (exactly like pressing ⌘⇧E) and then opens the Manual Scoring Modal

After the "Run / Compute >" button morphs into "See Scoring", clicking it opened the Manual Scoring Modal while the Estimation panel stayed open underneath — the user had to close it manually to get back to the board.

Fix: the "See Scoring" click handler now closes the Estimation panel first by invoking the same `runScoreEstimate()` toggle that the ⌘⇧E keyboard shortcut triggers (removes the `#estimate-rich-panel`, clears the estimate map/dead X marks, resets the Estimate toolbar button, redraws the board) and THEN calls `openScoringModal()` — the same call behind the ⚑ Endgame Scoring shortcut, so the modal restores the latest saved/live scoring session identically. The panel is rebuilt fresh (back to "Run / Compute >") whenever the Estimate panel is closed and reopened or the move navigation changes.

Verified with puppeteer against the repo: load an SGF, jump to the final move, open the estimate panel → button reads "Run / Compute >"; clicking it morphs the text to "See Scoring" and the result block (Dead-Stone Gate card, no markup in the test game) still renders below; clicking "See Scoring" removes the `#estimate-rich-panel` (panel and Run button gone from the DOM) AND reveals the `#scoring-modal-overlay` (hidden class removed, display flex). `node --check` clean. Bump to v0.1.051 with changelog narrative; docs rebuilt and all version consumers synced.

### v0.1.050 — After running the Computational Method (Japanese Territory Rules), the "Run / Compute >" button becomes "See Scoring", which opens the Manual Scoring Modal exactly like the ⚑ Endgame Scoring shortcut

At game end, running the deterministic Japanese territory scorer once still rendered the full score detail inside the blue panel, but the green button above it stayed "Run / Compute >" — clicking it just re-ran the computation, with no quick way back to the Manual Scoring Modal from the result.

Fix: the first click on "Run / Compute >" runs the scorer exactly as before (dead-stone gate, incomplete-markup warning, and full score breakdown all unchanged — every path still renders its result below), then the button text morphs to "See Scoring". From then on, clicking it opens the Manual Scoring Modal through `openScoringModal()` — the same call behind the ⚑ Endgame Scoring shortcut, so the modal restores the latest saved/live scoring session identically. The panel is rebuilt fresh (back to "Run / Compute >") whenever the Estimate panel is closed and reopened or the move navigation changes.

Verified with puppeteer against the repo: load an SGF, jump to the final move, open the estimate panel → button reads "Run / Compute >"; clicking it morphs the text to "See Scoring" and the result block (Dead-Stone Gate card, no markup in the test game) still renders below; clicking "See Scoring" reveals the `#scoring-modal-overlay` (hidden class removed, display flex). `node --check` clean. Bump to v0.1.050 with changelog narrative; annotation_v4.js table (16,689 lines) updated; docs rebuilt and all version consumers synced.

### v0.1.049 — The Board's Border now has an Override toggle and can never be covered by a board image: max border size is hard-capped at 100%, and a board set from an image file is clipped to the 19×19 grid so it stays out of the border margin in every size and in repeat mode

The Border section's size slider previously allowed values well past 100%, which, combined with an image board, let the wood/texture bleed over — and a board image would always paint over the margin regardless of the chosen border color, so the picked border color never actually showed.

Fix: the Border size is now capped at 100% (the slider's `max` went 200→100 and the typed number input 300→100, with the style value hard-clamped to 0–100 on every write). The Border section gained an **Override** toggle (default ON): with Override ON the picked border color fills the margin exactly as before (image boards are clipped to the grid rect so they can never cover it), and with Override OFF the margin takes the board's own background — for a color board the board color extends into it, and for an image board the image fills the margin; the size stays adjustable in both modes, and 0% leaves no border beyond the 19×19 grid. The same clip/override logic was applied to the export renderer (`generateDiagramDataURL`) so exported diagrams behave identically.

Verified with puppeteer against the repo: override ON + image board → margin shows picked red, grid shows the image, outside-wood stays white canvas, repeat mode stays clean; override OFF → margin shows the image; size forced to 200 clamps to 100%; size 0 leaves no border band; the toggle flips `style.border.override`, the ON/OFF label and the dimmed color controls update, and typing 250 in the size field clamps to 100 in the style, input, and slider. Export renders show red bands on all four sides with Override ON (image confined to the grid) and the image filling the margin with Override OFF. `node --check` clean. Bump to v0.1.049 with changelog narrative; annotation_v4.js table (16,679 lines) updated; docs rebuilt and all version consumers synced.

### v0.1.048 — Manual stone placement now makes the same stone/remove sounds as replay: hand-drawn stones were the one silent path

v0.1.047 made every sound bulletproof (base64 data URIs + re-armed unlock), and replay sounded right, but drawing on the board by hand was still silent. Root cause: `recordMoveAt()` (the manual stone/play-mode placement path, annotation_v4.js:1133) commits the move and then calls `goToMove(state.currentMoveIndex)` to rebuild the display — but `goToMove` only plays the stone sound when the target is a **single-step forward** (`isSingleStepForward = index === state.currentMoveIndex + 1`, annotation_v4.js:10728), and `recordMoveAt` has already advanced `currentMoveIndex` before that call, so the rebuild is a zero-step refresh and never played anything. Manual stones were therefore the one board action with no sound while replay (`goToMove` ±1) clicked away.

Fix: a successful placement in `recordMoveAt` now plays `playSfx(stoneSound)` directly (right after the move is committed, before the display rebuild), and `removeLastMove()` (clicking the last stone again in play mode) plays `playSfx(removeSound)` — matching replay's forward=stone / backward=remove behavior exactly. Both sounds go through the same `playSfx` → `sfxGlobalPool` pipeline as everything else, so the v0.1.047 unlock and data-URI guarantees apply unchanged.

Verified with puppeteer against the repo: select `stone-b` → click board center → a stone is placed and an unmuted `stone` play resolves; `removeLastMove()` empties the cell and an unmuted `remove` play resolves; replay (`goToMove` forward after loading an SGF) still produces its unmuted stone play. `node --check` clean. Bump to v0.1.048 with changelog narrative; annotation_v4.js table (16,625 lines) updated; docs rebuilt and all version consumers synced.

### v0.1.047 — Sound effects are permanently immune to the browser: all six SFX are embedded as base64 data URIs and the autoplay unlock re-arms on every gesture until a real sound actually plays

The `_sfx` sound kept failing across browser updates and environments even though the files and code paths were verified intact. Two separate weaknesses made the old design permanently fragile, and both are now gone.

**1. SFX were file-based, so serving could silently kill them.** Every audio element was built from a `_sfx/*` file path — including the non-ASCII stone sample `碁石を打つ.mp3` — and each play depended on the file being fetched fresh from the HTTP cache on top of the service worker on top of GitHub Pages. Any one of those links failing (stale cache entry, SW serving a stale copy, an odd filename encoding on a given server/browser combo) produces a `readyState` stuck below `HAVE_ENOUGH_DATA`, so `play()` never makes a sound even though no JS error is thrown. Fix: all six sounds (`stone`, `remove`, `branch`/replay, `annot`, `annot_undo`, `brd_flip`) are now embedded directly in `annotation_v4.js` as base64 data URIs in a `SFX_BASE64` map (annotation_v4.js:15) and loaded through a `createSfx(dataUri, volume)` factory (annotation_v4.js:24) with `preload='auto'` + `load()`. A data URI is decoded in-memory by the browser — there is no file fetch, no cache, no SW, no filename encoding to fail. The `_sfx/*` files remain in the repo only as the source of truth (each embedded payload is byte-identical to its file, verified by decoding). The board-flip sound previously created a fresh `new Audio('_sfx/brd_flip.mp3')` on every click; it is now a single shared `flipSound` element, and the fast-forward stone pool builds from `SFX_BASE64.stone` instead of the file path.

**2. The unlock was one-shot, so one blocked first attempt killed sound for the whole session.** The old `unlockSfxOnFirstGesture()` removed its `pointerdown`/`keydown`/`touchstart` listeners after the **first** gesture no matter what, so if that first muted pre-play was blocked (autoplay policy, media-engagement drop, a file that hadn't loaded yet), the pre-unlock never ran again and no sound could ever play. Fix: the unlock is re-armed — `unlockSfxOnGesture()` (annotation_v4.js:397) stays attached on every gesture until a **real unmuted play has actually succeeded**, tracked by the `sfxUnlocked` flag which only `playSfx()` (annotation_v4.js:422) can set. All six elements live in one `sfxGlobalPool` so no sound can bypass the unlock; the muted pre-play pauses itself only if nothing else started playing (`audio.muted` is still true), so it can never cut off the very first sound the user triggers in the same gesture. `playSfx()` (unmute → restart → play → flip the flag on resolve) is now the only path that plays any SFX — every call site (stone, remove, annotation, annot-undo, branch replay, board flip, fast-forward pool) routes through it.

Verified with puppeteer against the repo (15 checks): all six pool elements use `data:` URIs and decode to the exact source byte sizes; **zero** network requests to `_sfx/` over a full session; a simulated autoplay block (all six muted pre-plays reject) on the first *and* second gesture leaves the unlock armed, then one real `playSfx(stoneSound)` resolves unmuted and flips `sfxUnlocked` so later gestures make no further play calls; clicking `btn-flip-pov` plays `flipSound` through `playSfx` and flips the board; the fast-forward pool creates from `SFX_BASE64.stone` (volume 0.4) and registers itself into `sfxGlobalPool`. `node --check` clean; no `new Audio('_sfx/…')` file paths and no direct `.play()` calls remain outside the two sanctioned paths.

### v0.1.046 — In-session board-style edits are session-scoped: a Rec game's style no longer leaks into (or clobbers) the page-load initial-board setting

v0.1.045 stopped Resume from overwriting the page-load initial-board setting with the rec's stale snapshot, but in-session edits went the other way: while a Rec game was open, editing the game board style (toolbar inputs, Stone Set radio, Reset-to-default, Derive from source, board-size slider) wrote straight into `state.initialBoardStyle` and `baduk_initial_board_style`, so a customization made **during** a session clobbered the user's page-load setting. The result was two-way leakage between boards that should be independent: the empty page-load board and the active game board each ended up carrying the other's style, and a session could not even reopen with its own look after a hard refresh.

Fix: the main board now has a session-scoped style while a Rec game is active. `state.gameBoardStyle` holds the style the main board renders with during a session; every render site for the main board (`renderBoardToCtx`, `drawCellContent`, hover-stone ghosting, comment-coord highlight sizing, `getActiveStyleObject`) reads `getEffectiveInitialStyle()` — `gameBoardStyle` while `state.activeStudyId` is set, otherwise `initialBoardStyle` (annotation_v4.js:12984). Resume and the "Yes" (record) study flow load `gameBoardStyle` from the rec's own `settings.initialBoardStyle` so a session reopens looking exactly as left; in-session writes route through `setEffectiveInitialStyle()` (session → `gameBoardStyle`, else page-load `initialBoardStyle`) and `persistBoardStyles()` + `captureActiveRecSettings()` persist into the rec's settings while a session is active — never into `baduk_initial_board_style`. Paste, sample-load, and `loadSGF` clear the session + `gameBoardStyle` so the main board returns to the page-load style.

Browser-verified (puppeteer against the repo): set initial color `#aa1111` on page load → seed a Rec with initial `#333333` / study `#4444ff` / export `#00ff00` → resume → edit the game board to `#7722cc` and pick Stone Set B, hit Reset, and Derive-from-study. In-session edits update the game board and are saved into the rec (`rec.settings.initialBoardStyle` = `#7722cc` + set B) while `#aa1111` stays untouched in memory and in localStorage; after a hard refresh the empty board shows `#aa1111`, and re-opening the Rec shows the rec's own customized `#7722cc`. Fresh `loadSGF`/paste clears the game style back to the page-load `#aa1111`; editing with no Rec active still writes the page-load setting. All 23 style-routing harness checks + the v0.1.045 regression harness pass; `test_estimate.js` passes; `node --check` clean.

### v0.1.045 — The initial page-load board keeps its own board style: selecting a Rec Game no longer clobbers it

Setting the board style on the empty page-load board (via the floating panel), then selecting a Rec Game, then hard-refreshing showed the **game's** board style on the initial board instead of the setting made on page load. Root cause: every Resume applies `applyAppSettings(rec.settings)`, and that function **overwrote** `state.initialBoardStyle` from the rec's snapshot — the initial style captured during the rec's last play session, i.e. the "game play setting" — and **re-persisted** it to `baduk_initial_board_style`. So the moment a Rec Game was selected, the user's page-load initial setting was replaced (and written back to localStorage), and after a refresh the empty board showed the stale game-era style.

Fix in `applyAppSettings` (annotation_v4.js:1845): the initial board style is no longer restored from the rec snapshot — the initial page-load board (no game) always keeps the user's own persisted `initialBoardStyle`. The game-specific restores are untouched: `studyBoardStyle` (the study/game board appearance), `exportBoardStyle`, and the SGF replayer options are still applied so a resumed session looks exactly as the user left it. Behavior is unchanged for the common case where the persisted initial style already equals the snapshot's value (main-board styling writes to the same persisted key), so nothing that used to work regresses — only the stale-snapshot clobber is gone.

Browser-verified (puppeteer against the repo): set initial board color `#aa1111` on page load → seed a Rec whose snapshot carries initial `#333333` / study `#4444ff` / export `#00ff00` / replayer `showMoveNumbers:false` → select the Rec → hard refresh. Pre-fix: after selecting the Rec the persisted initial color became `#333333` and stayed after refresh (bug). Post-fix: `#aa1111` survives selection AND refresh, while study `#4444ff`, export `#00ff00`, and replayer options are still restored. `test_estimate.js` passes; `node --check` clean.

### v0.1.044 — Floating panel: unselecting a Stone Set now auto-expands the Custom Stones section even while the Stones accordion is open

When a Stone Set is selected (by default or from a previous session) the Custom Stones section is locked and collapsed, so the Stones accordion — which opens by setting a **fixed inline `max-height` measured at open time** (`initAccordion` at annotation_v4.js:13554) — measures itself *short* if it is opened in that state. Unselecting the stone set then expands the Custom Stones body to its full height, but the accordion's stale fixed `max-height` plus its `overflow: hidden` clipped the growth — the Custom Stones options looked like they never appeared.

Fix in `syncCustomStonesSection()` (annotation_v4.js:12663): on the expand path the body is measured at natural size (`maxHeight: none` → `scrollHeight`), the enclosing `.accordion-content`'s final `scrollHeight` is captured in the same frame, and both are started from zero together — the body animates `0 → bodyH` while the accordion re-fits `short → full`, so nothing is clipped. When the Stones accordion is closed at unselect time no re-fit is needed (a later open measures the already-expanded content correctly). The locked/collapsed behavior for an active stone set is unchanged.

Verified in a real browser (puppeteer against the repo): with stone set A persisted, opening the Stones accordion measures 148 px; unselecting expands the body to 545 px and re-fits the accordion to 693 px (== its `scrollHeight`, last control fully visible, body opacity 1) — pre-fix the 148 px clip hid the 545 px body entirely. Regressions pass: re-selecting a stone set re-locks and collapses the section, and clicking the Custom Stones header while locked does nothing.

### v0.1.043 — Replacing Dead Stones works on the dead-marked cell itself (freed point = territory), dame stays prohibited

v0.1.042 guarded the replace branch against clicking a cell that already carried a dead X — that guard over-reached: the dead-marked cell is itself a *territory point*. The dead stone was lifted, so its intersection reads as territory (the freed point) and a prisoner of that territory's color must be placeable there, exactly like on any other territory point. Blocking it meant the user literally could not fill the spots the physical ritual most wants to fill.

Behavior now:

- **A dead-marked cell fills like any other territory point.** Clicking a dead-white X (freed point = Black territory) places a BLACK prisoner; a dead-black X (freed point = White territory) places a WHITE prisoner. The stone that *was* on the clicked point stays a prisoner — its accounting is relocated from the mark set to the capture counter (`mark → capture` is a wash inside that side's prisoner total: dead white → `blackCaptures`, dead black → `whiteCaptures`, popped out of its `deadWhite`/`deadBlack` + transfer buckets). So the totals still drop by exactly 1 per player and the margin never moves — the same invariant as any plain territory fill.
- **Dame stays prohibited.** Any intersection whose territory is not defined (`terrColor === 0` — dame or seki) still refuses the replace: a dame fill would cost only the prisoner's side (−1) and drift the margin, and the physical count never fills neutral ground.
- **No prisoner → no fill.** A fill requires a prisoner of the territory's color (`deadBlack`/`deadWhite` bucket or the capture counter); with an empty pool the click does nothing.
- **Marks survive replacing (v0.1.057, extended in v0.1.058).** Filling any territory point pops the dead bucket for placement but leaves `markedDead`/`deadStonesInfo` untouched — the prisoner term in the score drops by decrementing the capture counter instead, so the `DD`/`MA` counts in SGF Properties never shrink while Replacing Dead Stones. v0.1.058 extends this to the dead-marked cell itself (the v0.1.043 exception is deleted: a fill into a dead-X cell keeps the X) and gates the tools behind the Lock stage; dead-X fills drop only the territory side while the mark keeps the stone a prisoner, and occupied cells are never counted as territory (`countTerritoryFromScores` + the score loop skip `board[y][x] !== 0`).
- **Undo covers captures.** `getScoringSnapshot`/`restoreScoringSnapshot` now capture and restore `blackCaptures`/`whiteCaptures` (they previously omitted them, so undoing any fill that consumed or relocated a capture left the counters out of sync with the restored board).

Headless-verified: the `replace_marked_dead.js` harness mirrors the modal's exact click + scoring path over a sandwich board (black box with 6 dead white inside, white box with 4 dead black inside, captures 4/2) — dead-white Xs read as Black territory and dead-black Xs as White territory; a fill on each succeeds, the fill cell ends occupied by the territory color with its dead mark cleared, and BOTH players drop by exactly 1 per fill (B 129→128→127, W 110→109→108, margin pinned at 19); a full sequence of marked-cell + plain-territory fills keeps the margin fixed with zero drift; a dame click is prohibited and leaves the state byte-for-byte unchanged. `test_estimate.js` passes; `node --check` clean.

### v0.1.042 — "Replacing Dead Stones" never moves the final margin: each prisoner fill drops BOTH players by exactly 1

The Manual Scoring Modal's *Replacing Dead Stones* tool fills a dead stone into the territory of its own color — click a Black-territory empty cell and a dead BLACK stone (one of White's prisoners) is placed there; click a White-territory cell and a dead WHITE stone (Black's prisoner) is placed there. The Go-domain score identity is `margin = (W_T + W_C) − (B_T + B_C)`, so the physical count must cancel exactly: filling a prisoner into the opponent's territory does `W_C − 1` (the prisoner is gone) **and** `B_T − 1` (the fill point is no longer territory) — the ±1 cancels and the margin never moves.

It was drifting by exactly 1 per fill. Root cause: the score formulas read the dead term from the **marks** (`markedDead`/`deadStonesInfo`), the true Life & Death set, but the replace branch consumed the stone by popping the dead-**bucket** counter (`deadBlack`/`deadWhite` + the `bucketWhite`/`bucketBlack` transfer) without clearing the corresponding mark. The bucket and the marks diverged, the dead term never dropped, and only the filler's territory −1 landed — the margin slid one point per replaced stone (harness: initial B 129 / W 110, margin 19 → after 10 fills B 119 / W 110, margin 9).

Fix in `annotation_v4.js`:

- **New `consumeDeadMarkFromState(ss, colorVal)` helper** (next to `countMarkedDeadStones`): clears exactly ONE dead mark of the given color — the last one in traversal, pairing with the bucket's LIFO pop — leaving the lifted cell empty so its freed point stays territory. Added to every consumption path: the `replace` branches of `placeScoringStoneByMode` (both colors) and the color-picker dialog's "Dead" source buttons. (Superseded in v0.1.057: the helper is deleted and replacement fills no longer clear marks — the prisoner term drops via the capture counter so `DD`/`MA` stay intact; see the v0.1.057 entry.)
- **Board-click replace branch**: on a fill it now also clears one matching dead mark, and two guards enforce the invariant physically — clicking a cell already marked dead is rejected (its freed point is already territory; filling it would re-place the stone and desync the bucket/mark pairing), and **dame is no longer fillable in replace mode** (dame belongs to neither player, so a dame fill costs only the prisoner's side −1 and the margin would drift; the physical count never fills dame). Fills are allowed only into the territory of the stone's own color.
- Undo/redo restore the cleared mark via the existing snapshot (`getScoringSnapshot`/`restoreScoringSnapshot` copy `markedDead` + `deadStonesInfo`), so a replace-then-restore cycle is exact.

Headless-verified: the `replace_invariance.js` harness mirrors the modal's exact scoring path (`territoryScoring` on `stonesWithDead`, manual-territory overrides, `countMarkedDead`, captures, komi) over a sandwich board (black box with 6 dead white inside, white box with 4 dead black inside, captures 4/2) — reproduces the pre-fix drift (margin 19 → 9 after 10 fills) and post-fix performs all 10 fills with margin 19 → 19 and each fill dropping BOTH players by exactly 1. All prior harnesses (komi SSOT, terr_gap, auto_seed_lift, result badge, reset_pristine, markup_warning, territory parity) + `test_estimate.js` still pass; `node --check` clean.

### v0.1.041 — JTS blue panel no longer double-counts dead-stone freed points (B+3 → B+2 parity with the MSM)

Same game, same saved session, two answers: the Manual Scoring Modal said **B+2** (territory 68/69) but the blue Computational Method panel said **B+3** (territory 73/73). Investigation proved the dead-stone *freed points* were counted **twice** in the blue panel's session path:

- `computeScoringPropsFromSession` derives the `TB`/`TW` lists from GoScorer, which treats marked-dead stones as transparent during flood-fill (goscorer.js:1416-1423) — so a dead stone's freed point is already territory and enters the `TB` list (dead *white* stones → Black territory) / `TW` list (dead *black* stones → White territory).
- `evaluateJapaneseTerritory` then counted `tbOnBoard.length`/`twOnBoard.length` (which already contained those 9 points) **and** re-added every dead stone's freed point by flood-fill owner (board-estimate.js:650-657). That loop was written for the SGF-markup path, where `TB`/`TW` only mark empty intersections and the freed points genuinely are absent from the lists.

The math matched the report exactly: 73 = 68 + 5 (five dead white stones) and 73 = 69 + 4 (four dead black stones) — a +9 territory over-count, all of it the 9 dead stones' freed points — which flipped the margin B+2 → B+3. The modal's 68/69 is the correct Japanese count (a dead stone counts once as a prisoner *and* its enclosed point counts once as territory).

Fix: the freed-point loop now skips any point already present in the explicit `TB`/`TW` lists. The SGF-markup path is unchanged (freed points still added exactly once), the flood-fill fallback is unchanged, and session-path territory now equals the modal exactly. Headless-verified: a synthetic board (6 dead white inside a black enclosure, 4 dead black inside a white enclosure) reproduces the pre-fix double count (JTS territory = modal + 6/+4) and, post-fix, JTS territory == modal territory on all three paths (session lists, SGF-style lists, flood-fill fallback); all prior harnesses + `test_estimate.js` pass; `node --check` clean.

### v0.1.040 — Missing DD/MA now REFUSES the JTS score (hard prerequisite), not just warns

v0.1.039 warned alongside the result; this hardens it. Resolved dead stones (`DD`/`MA`) are the true prerequisite for a correct Japanese-rules score — without them the scorer can only assume every stone is alive, which is not a Japanese score. The blue panel's Dead-Stone Gate now refuses whenever `snapshot.deadStones` is empty:

- **No markup at all** (`DD`/`MA`/`TB`/`TW` none) — unchanged amber gate: *"No DD/MA/TB/TW Endgame Markup Found"*.
- **TB/TW declared but dead stones absent** (the reported game) — NEW amber gate: *"No DD/MA Dead-Stone Resolution Found"* — *"This game declares TB/TW territory but no dead stones, so every stone would be assumed alive — no score is rendered for an unresolved Life & Death state."*

Both gates carry the **Open Manual Scoring Modal** button: mark the dead stones with the X tool, save, re-run — then the score renders (territory from explicit TB/TW or flood-fill, dead prisoners added). The incomplete-markup card from v0.1.039 now only ever appears for territory: when `DD`/`MA` are resolved but `TB`/`TW` are absent, the score still renders with flood-fill territory plus the "Not Defined in the SGF" card and its Define-in-MSM button. A completely unresolved position can therefore never silently produce a number again. Headless-verified: the gate condition (`!hasSgfMarkup || snapshot.deadStones.length === 0`), both gate titles/bodies, the MSM wiring on both buttons, and the surviving TB/TW-only warning card; helper + all prior harnesses + `test_estimate.js` pass; `node --check` clean.

### v0.1.039 — JTS warns when any DD/MA/TB/TW is missing and offers to define it in the MSM

The blue Computational Method panel computes a deterministic score from whatever endgame markup the SGF declares — but when the SGF declares only PART of it, the missing pieces are silently assumed. Example (the reported game): SGF had `TB`/`TW` but no `DD`/`MA`, so every stone was treated as alive and zero dead prisoners were added (`Scrubbed Dead: 0/0`); the score was still computed because the No-Markup Gate only fires when NONE of DD/MA/TB/TW exists. Now, whenever the scorer runs with any of the four missing, the panel appends an amber **"Incomplete Endgame Markup — Not Defined in the SGF"** warning listing exactly which elements are missing and the implication the scorer assumed:

- `Dead stones (DD/MA)` — no stone is treated as dead, so dead prisoners are not counted
- `Black territory (TB)` — computed by flood-fill instead of explicit markup
- `White territory (TW)` — computed by flood-fill instead of explicit markup

A **"Define in Manual Scoring Modal"** button opens the MSM so the user can mark the missing elements (dead stones with the X tool, territory via click) and re-run — turning an assumed score into the locked, exact Japanese score. The all-missing case still short-circuits in the existing No-Markup Gate (no score rendered at all); this warning only appears alongside a computed result. Verified headlessly: the real `buildScoringMarkupWarnings(snapshot)` covers TB/TW-only (warns DD/MA), DD/MA-only (warns TB+TW), complete (none), and empty (all three); source audit confirms the warning card, button id, and `openScoringModal` wiring; all prior harnesses + `test_estimate.js` still pass; `node --check` clean.

### v0.1.038 — MSM "Reset Board" now rebuilds the pristine SGF terminal, exactly like opening the file in goscorer

"Reset Board" promised a clean slate but produced a board that did not match the source game: it rebuilt from the main app's **current** position (not the SGF terminal) and then re-applied the recorded DD/MA/TB/TW markup (or the dead-stone heuristic) — marking stones dead and **lifting them off the board**. goscorer's test page (`lightvector.github.io/goscorer/web_test/test.html`) behaves differently: it loads the SGF and plays to the **last move** with **every stone present and zero dead marks** (dead marking is manual there), but its `TerritoryLayer` then overlays the **computed** territory — `territoryScoring(stones, markedDead)` with `markedDead` all-false — plus the score line. Verified from goscorer's source: `player.loadSgf(contents)` → WGo plays to the end; `markedDead` starts all-false; territory shading is an always-on computed layer, not marks.

1. **Reset is now the "re-open the file" action.** `resetScoringBoardFromState({ pristine: true })` (wired to both the Reset button and its confirm dialog) rebuilds the board from `replayToTerminal()` — the full SGF replayed to its last move, independent of where the user is in the move tree — with the replay's own in-game captures and the SGF's komi. No dead marks, no territory marks, no buckets — exactly the inputs goscorer's test page has after `Last` (it draws the SGF's final position and then overlays the COMPUTED territory from `territoryScoring(stones, markedDead)` with `markedDead` all-false). The modal draws the same computed overlay from the same inputs (`locScores = territoryScoring(stonesWithDead, markedDead, false)`, `showTerritory` on by default), so Reset shows the identical territory shading and score as the page — territory + 0 dead + game captures + SGF komi.
2. **First-open behavior is unchanged.** Opening the modal without a saved session still seeds from the game's recorded DD/MA/TB/TW (or the Sabaki dead-stone heuristic when none exists), so a fresh session still starts from the game's resolved Life & Death marks. Only the explicit Reset is pristine — the user can then mark dead stones manually, exactly as on the goscorer page.

(Verified: a harness extracts the real `resetScoringBoardFromState()` and drives both modes with stubs — pristine yields the replayed terminal with zero marks, replay captures, and SGF komi, and never calls `findEndgameMarkup`/`seedAutoDeadMarks`; first-open still runs the markup seed and (when no markup) the heuristic; the Reset handlers pass `{ pristine: true }`. Komi SSOT harness, `test_estimate.js`, the v0.1.034 lift harness, and the v0.1.035 badge harness all pass; `node --check` clean.)

### v0.1.037 — Komi SSOT completed: every komi default is one named constant, zero literals left (REC 004)

v0.1.036 fixed the blue panel's `KM[0]`→6.5 slip, but an audit for remaining hardcoded `6.5` values found more: the codebase had **8 hardcoded `6.5` sites** in 3 files. Two were real drift risks and are fixed here; the rest are now routed through one constant.

1. **YSE yellow panel had its own third komi reader.** `runScoreEstimate` kept a private `let komi = 6.5` plus its own `parseFloat(state.sgfMetadata.km)` block — it never used the `extractSgfKomi()` resolver v0.1.036 introduced, only checked `sgfMetadata.km` (ignoring the `gameInfo` fallbacks), and carried its own default. It happened to keep `KM[0]` at 0 thanks to its `isNaN` guard, but three independent readers is exactly the drift shape that produced the v0.1.036 bug. It now calls `extractSgfKomi()` like every other surface.
2. **Legacy-session restore hardcoded 6.5.** `restoreScoringFromSavedData` used `data.komi != null ? data.komi : 6.5` — a saved session missing a komi field was forced to 6.5 even when the SGF says `KM[0]`. The fallback is now `extractSgfKomi()`, so a zero-komi game restores as zero.
3. **One named default.** `const DEFAULT_KOMI = 6.5` is now the *only* `6.5` literal in the scoring paths: `extractSgfKomi()`'s fallback and the `scoringState` initial value reference the constant directly. The `board-estimate.js` library still has `komi = 6.5` as its public API default params (`getScore`/`estimate`/`evaluateJapaneseTerritory`), which is intentional and inert — every app caller passes komi explicitly, so they never fire in-app.

(Verified: the komi harness now also audits the source — it asserts zero `6.5` literals survive outside `DEFAULT_KOMI`, the YSE panel routes through `extractSgfKomi()`, and the legacy restore falls back to it; all 7 komi cases, the B+31.5→B+38 reproduction, `test_estimate.js`, the v0.1.034 lift harness, and the v0.1.035 badge harness all pass; `node --check` clean.)

### v0.1.036 — Komi 0 in the SGF no longer turns into a default 6.5 (REC 004)

REC 004 ships `KM[0]` — a no-komi game — yet the blue Computational Method panel computed `White Total = 8 + 2 + 6.5 = 16.5` and reported **B+31.5**. The SGF's komi was being read through a `parseFloat(km) || 6.5` default: `parseFloat('0')` is `0`, which is **falsy**, so a legitimate zero-komi game fell through to the 6.5 fallback. The modal's own session init had always parsed komi with an `isNaN()` guard (0 stays 0), so the two surfaces disagreed on a real zero.

1. **One falsy-`0` slip in the blue panel's komi default.** `resolveScoringInputs` initializes the snapshot with `parseFloat(state.sgfMetadata.km) || 6.5`. The `|| 6.5` is only meant to catch an unparsable/missing value, but `0` is falsy too — so `KM[0]` was silently upgraded to 6.5, inflating White by 6.5 and deflating Black's margin by the same amount (B+31.5 instead of the correct B+38). The modal never had this bug, which is why REC 002's parity drive did not catch it: both surfaces agreed on the *sources* (session vs SGF), but the blue panel's default corrupted a real zero.
2. **The fix — one SSOT komi resolver, isNaN-guarded.** A new `extractSgfKomi()` now owns komi extraction from the SGF (`state.sgfMetadata.km`, then `state.gameInfo.km/KM/komi`) with an `isNaN(parseFloat(...))` guard so `0` survives and only missing/garbage falls back to 6.5. Both the blue panel's `resolveScoringInputs` and the modal's session init call the same function — the modal's inline extraction is gone, so the two surfaces structurally cannot drift on komi again (SSOT-and-Synced).

(Verified: a harness extracts the real `extractSgfKomi()` source from annotation_v4.js and asserts `KM[0]` → 0, `KM[0.0]` → 0, `KM[6.5]` → 6.5, `KM[7.5]` → 7.5, `gameInfo.KM[0]` → 0, no komi → 6.5, garbage → 6.5; it also reproduces the exact report arithmetic — pre-fix `B+31.5`, post-fix `B+38`. `test_estimate.js` passes; terr_gap still reports MSM B10 == JTS B10 MATCH; the v0.1.034 dead-stone lift and v0.1.035 result-badge harnesses still pass; `node --check` clean.)

### v0.1.035 — Scoring Modal result badge now always equals the formula shown (REC 002)

A user reported the modal displaying `Black 51 (territory) + 6 (dead) + 0 (caps) = 57` / `White 57 (territory) + 0 (dead) + 4 (caps) + 0 (komi) = 61` next to a **`W+6`** badge — but 61 − 57 is 4, so the badge should read `W+4`. The two displays were computing from **different** state, and the split only shows up after Replacing / Re-Arranging stones.

1. **The formula is live; the badge was anchored — so they drifted.** The per-color Computing formula (territory + dead + caps + komi) reads the *display* board (`scoringState.board`) and the *editable* captures (`blackCaptures`/`whiteCaptures`), so every Replace/Re-arrange edit is reflected immediately. The result badge (`scoring-result-display`), anchored since v0.1.028, instead read `baseBoard` (untouched position) + `baseCaptures` (captures at session start). In the reported session White had captured 6 black stones in-game; the user Replaced 2 of them back onto the board, dropping live `whiteCaptures` 6 → 4. The formula showed 61 (W+4 arithmetic) while the badge — still on the original `baseCaptures.W = 6` — showed `W+6`. Same story for territory after a Re-arrange moved stones: the badge ignored the corrected position.
2. **The anchor was the wrong tool for the job.** v0.1.028/029 anchored the badge so Replace/Re-arrange "could never move the game's real result", but that produced a modal whose own arithmetic disagreed with its headline — a contradiction the user cannot resolve. Re-arranging/Replacing is the user *correcting* the board; the definitive Japanese score (territory + dead prisoners + captures, per the scoring domain goal) must reflect that correction.
3. **The fix — one live source of truth for the score.** Every reader now computes from the same live session:
   - The modal's result badge reads `scoringState.board` + live `blackCaptures`/`whiteCaptures` — identical inputs to the formula, so the badge is the formula's arithmetic by construction.
   - `computeScoringPropsFromSession` derives `DD`/`MA`/`TB`/`TW` from `session.board` (not `baseBoard`), so the blue-panel Run score, the saved markup, and the modal all reflect the last-edited board.
   - `resolveScoringInputs` feeds the session's live captures (not `baseCaptures`), keeping blue-panel ⇄ modal parity.
   - `baseBoard`/`baseCaptures` are retained in the snapshot only as the untouched-position seed `seedAutoDeadMarks` reads on first entry; they no longer drive any score.

(Verified: an arithmetic harness reproduces the exact report — formula `W+4`, anchored badge `W+6` — and shows the live badge matching the formula precisely; `test_estimate.js` passes; terr_gap still reports MSM B10 == JTS B10 MATCH; the v0.1.034 dead-stone lift harness still passes; `node --check` clean.)

### v0.1.034 — Auto-detected dead stones now lift off the board exactly like manual marks (REC 002)

The initial auto-detect (`seedAutoDeadMarks`) and the recorded-markup seed (`applyMark`) marked stones dead **without lifting them**: `markedDead`/`deadStonesInfo`/the buckets said "dead", but `scoringState.board` still held the stone — so the board drew a stone with a red X on top of it, while a manually clicked dead mark lifts the stone to an empty intersection and draws the X there. That inconsistency surfaced in **Replacing Dead Stones / Re-Arranging Stones**: a Replace click popped a `deadWhite` entry to place a prisoner while the "dead" stone itself was still sitting on the board, and a Re-arrange click on such a stone collected it into the rearrange bucket **on top of** its existing dead-bucket entry — the same stone counted in two buckets.

1. **Manual marks lift; the seeds didn't.** `handleScoringBoardClick` sets `board[r][c] = 0` (annotation_v4.js:15659) when a stone is clicked dead. `seedAutoDeadMarks` and the `applyMark` seed only wrote `markedDead` + `deadStonesInfo` + the bucket stacks, leaving the display cell full. The comment at the seed sites claimed "behave EXACTLY like manually clicked marks" — the lift was the missing half.
2. **The fix — every dead-mark seed lifts, and restore self-heals.** All three `markedDead = true` write sites now also zero the display cell (the canonical `baseBoard` snapshot never changes, so the game's final result and saved `DD`/`MA`/`TB`/`TW` stay anchored):
   - `seedAutoDeadMarks` — the goscorer heuristic auto-detect lifts each detected dead stone.
   - `applyMark` — the `DD`/`MA`/`TB`/`TW` markup seed lifts each recorded dead stone.
   - `restoreScoringFromSavedData` — self-heals sessions saved before this fix (same pattern as the v0.1.032 restore rebuild): any stone sitting at a `markedDead` position is lifted on restore.
3. **Scores are unchanged by design.** GoScorer already reconstructs `stonesWithDead` from `deadStonesInfo` at lifted positions, so the territory/prisoner computation sees the identical board whether the dead stones were lifted or not. The change is purely visual (X on an empty intersection, stone in its bucket) and in Replace/Re-arrange bookkeeping (no more double-sourced stones).

(Verified: a 5×5 ring harness — auto-detect lifts all 9 dead white stones while `baseBoard` stays intact, the lifted mark is display-identical to a manual click, the markup seed lifts + still dedupes to 9, the restore self-heal lifts a legacy persisted board, and the `stonesWithDead` reconstruction is byte-identical lifted vs not-lifted; `test_estimate.js` passes; terr_gap harness still reports MSM B10 == JTS B10 MATCH; `node --check` clean.)

### v0.1.033 — Version-driven script cache-busting (why the YSE fix "didn't take")

After v0.1.030 isolated the Score Estimate, the yellow panel **still** replayed the recorded `TB`/`TW` on the final move of a saved REC. The source was already correct — the browser was running a **stale copy of the JavaScript**.

1. **The source never feeds territory to YSE anymore.** `runScoreEstimate` passes empty `territoryBlack`/`territoryWhite` into `BoardEstimate.estimate`, which only short-circuits its AI when those arrays are non-empty; `deadstones.guess` is seeded with `Date.now()`, so a fresh YSE genuinely varies per run. The "fixed output matching the recorded markup" symptom is precisely the pre-v0.1.030 behavior.
2. **The browser HTTP cache kept serving the old script.** Every `<script>` tag in `index.html` carried a hard-coded cache-buster (`annotation_v4.js?v=4.3`, `board-estimate.js?v=1.0`, …) set once in the initial commit and **never bumped** across a dozen releases. The service worker is network-first, but the browser's own HTTP cache can answer `annotation_v4.js?v=4.3` with the pre-fix body it stored — so the page ran the old estimator even though the file on disk had changed. This also explains why the ×12 dead-bucket bug stayed visible after v0.1.032.
3. **The fix — tie cache-busting to the release version (SSOT).** `sync-docs.js`'s `syncVersion()` now also rewrites every `<script src="*.js?v=…">` to `?v=<version>` from the `SITEMAP.md` frontmatter. Bumping only the `version:` field forces every browser to fetch fresh JavaScript on that release — no stale body can survive a reload. The service worker's network-first fetch then always reaches the current file.

(Verified: `node sync-docs.js` rewrites all nine script `?v=` params to the frontmatter version; `node --check` clean.)

**User action:** reload the page once after this release — the new `?v=0.1.033` URLs guarantee a fresh fetch, and the YSE on the final move will run its own random AI estimation again.

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

4. **Sound restored across browsers.** All SFX (`stone`, `remove`, `annot`, `board flip`, `replay`) are pre-unlocked on the first user interaction — modern browsers (Chrome/Safari/Firefox) block `HTMLAudioElement.play()` until the page receives a user-activation gesture, so after a browser update or a drop in media-engagement status sounds can stop even though the files load fine. The unlock re-arms on every gesture until a real unmuted play succeeds, and the sounds themselves are embedded as base64 data URIs (v0.1.047) — see the v0.1.047 entry for the permanent mechanism. No mute toggle involved.
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
| `index.html` | 2,616 | Main HTML — all UI layout, floating panels, study modal, canvas elements, game tree, ref-Area/ref-Point buttons |
| `annotation_v4.js` | 16,865 | Main app — state, SGF parsing, board rendering, canvas drawing, event listeners, export, capture animation, comment coord highlights, hoshi highlights, ref-Area/ref-Point modes, SGF comments toggle, study-record resume (loads `workingSgf` as-is via `loadSGF`), algorithmic endgame-markup resolution (`findEndgameMarkup` searches current move → full/filtered sequences → root props → raw main line → saved scoring session), unified scoring-input resolution (`resolveScoringInputs`: live session → saved `rec.scoringData` → SGF markup; consumed identically by the Run panel and the modal for exact blue-panel ⇄ modal parity), score-estimate isolation (`runScoreEstimate` never feeds recorded `TB`/`TW` territory into `estimate()`, so YSE always runs its own AI + influence estimation), terminal-markup fold over all annotation-only nodes after the last move, Computational Method blue panel with "Run / Compute >" control (shown only at Game End; DEAD-STONE GATE: refuses a score — not merely warns — whenever no dead stones are resolved, both for no markup at all *"No DD/MA/TB/TW Endgame Markup Found"* and for TB/TW-only *"No DD/MA Dead-Stone Resolution Found"*, each with an Open Manual Scoring Modal button; with DD/MA resolved, territory missing TB/TW renders via flood-fill plus the amber "Incomplete Endgame Markup — Not Defined in the SGF" card from `buildScoringMarkupWarnings(snapshot)` with a Define-in-MSM button; the modal restores the latest persisted/saved session and seeds dead stones from `DD`/`MA`/`TB`/`TW`; after the first Run the button morphs into "See Scoring", which closes the Estimation panel like ⌘⇧E and opens the Manual Scoring Modal like the ⚑ Endgame Scoring shortcut), LOCK STAGE (v0.1.058: Mark Dead Stones + Mark Territories are the mandatory first stage — `#btn-scoring-lock` commits `buildLockedSnapshot()` and flips `scoringState.locked`, Replace/Re-arrange render disabled-but-visible with the `#scoring-lock-hint` until locked, SGF files carrying `DD`/`MA`/`TB`/`TW` pre-engage the lock on open, while locked the SGF Properties bars freeze to the locked snapshot (`updateSgfPropBarsUI` reads `lockedSnapshot` when locked) with the `#sgf-prop-lock-badge`, and editing a locked mark/territory or Unlocking parks the click in `pendingLockEdit`, shows the `#scoring-unlock-confirm-dialog` (amber "Unlock & Reset", work count from `countPostLockActions`), and `applyUnlockReset` restores the locked resolution — never pristine — before replaying the parked click; `locked` + `lockedSnapshot` persist in the session snapshot via `copySnapshotShape`), LOCKED SCORE IS FROZEN (v0.1.059: the computation is DONE at Lock — `computeScoringSummary(ss)` is the single read-out SSOT for both the section-8 formula and the `#scoring-result-display` badge, selecting the `lockedSnapshot` when locked so neither can move; post-lock replace/re-arrange fills become pure cosmetic display aids that consume no prisoner, move no capture counter, and never clear a mark — `placeScoringStoneByMode` early-returns before mutation, the replace/rearrange branches and the dialog Dead-source buttons skip pops/decrements, trays render from the locked resolution; `applyScoringLock` records `lockBoundaryIndex` and RETAINS the pre-lock history while `undoScoring` caps there (never a pre-lock board) and `applyUnlockReset` truncates back to the boundary, so Reset → Unlock → Undo×N walks to the pristine terminal; Save/`computeSgfPropertyBars`/Run serialize the `lockedSnapshot` board/props while locked so nothing persists the cosmetic board; Reset Board while locked restores only the post-D&T resolution with a dynamic `#scoring-reset-confirm-msg`; rule-mode select, komi input/±0.5, and clear-buckets are no-ops while locked; `restoreScoringFromSavedData` backfills `komi` onto legacy snapshots), MARKS NEVER CLEAR (v0.1.058 deletes the v0.1.043 dead-X exception: every replace/re-arrange fill keeps `markedDead`/`deadStonesInfo`, the dead X renders over the placed prisoner, and occupied cells are excluded from territory in `countTerritoryFromScores` and the `renderScoringBoardToCtx` score loop — `ss.board[y][x] !== 0` — so a filled dead-X point reads as a stone in every read-out), explicit `DD`/`MA`/`TB`/`TW` scoring, dead-bucket dedupe in markup seeding + restore-time rebuild from marks (buckets always mirror the canonical `markedDead` set), dead marks LIFT the stone off the display board in every seed path — auto-detect, markup seed, and restore self-heal — exactly like a manual click, so Replace/Re-arrange never see the same stone on the board and in its bucket, **Replacing Dead Stones is margin-invariant AND never erases dead marks from SGF Properties** (a fill consumes a prisoner by popping the dead bucket as before, but the `markedDead`/`deadStonesInfo` marks are preserved and the prisoner term drops via the capture counter — `whiteCaptures`/`blackCaptures` decremented per fill — so both players still lose exactly 1 and the margin stays pinned while the `DD`/`MA` counts derived from the marks stay at their full pre-fill values; dame/seki with undefined territory and cells with no prisoner of the territory's color are PROHIBITED, so the final margin never moves — since v0.1.058 even a fill into a dead-marked cell keeps the mark (the v0.1.043 `mark → capture` relocation is deleted), undo snapshots now capture `blackCaptures`/`whiteCaptures` too, result badge computed from the SAME live state as the Computing formula (display board + live captures; `baseBoard`/`baseCaptures` only keep the untouched-position reference), SSOT komi (`DEFAULT_KOMI` is the only 6.5 literal; `extractSgfKomi` reads the SGF with an `isNaN` guard so `KM[0]` stays 0 — shared by the modal session init, legacy restore, YSE panel, and blue-panel snapshot), "Reset Board" rebuilds the PRISTINE SGF terminal (`replayToTerminal()`, all stones present, zero dead/territory marks, replay captures + SGF komi — the computed territory overlay then renders from `territoryScoring(terminal, all-false)`, the exact inputs and shading of goscorer's test page after `Last`) — the record's own DD/MA/TB/TW is the ONLY dead-stone seed: opening the modal on a markup-less game auto-marks NOTHING (the dead-stone heuristic was removed; dead stones come only from the file's markup or the user's manual X-marks, recorded at Save), `replayToTerminal()` |
| `annotation.css` | — | All styles — board canvases, floating panels, badges, progress bar, responsive layout |
| `move-term-detector.js` | 1,237 | Move-term system — Sabaki pattern matching, Tenuki/Sente/Gote detection, `_termHL` highlight object, badge UI, hover/leave handlers, polling, CSS injection |
| `game-tree.js` | 1,003 | Game tree rendering — main tree + footer tree, node properties, branch paths, wheel navigation, polling, `refreshGameTree()` |
| `sgf-parser.js` | 800 | `SgfEngine` namespace — SGF parsing, board size, setup properties, markup, cloneTree, extractMainLine |
| `board-estimate.js` | 709 | Score estimation engine — `evaluateJapaneseTerritory` (explicit `DD`/`MA`/`TB`/`TW` scoring; the explicit path additionally flood-fills the scrubbed grid and counts each dead stone's freed point as territory for its capturer — but only when that point is NOT already in the explicit `TB`/`TW` lists, because session-derived lists already contain the freed points via GoScorer's transparent dead stones, so re-adding them would double-count and drift the blue panel off the Scoring Modal; the flood-fill fallback is retained internally but is no longer surfaced by the Computational Method, which instead warns the user to mark dead stones in the Manual Scoring Modal) and `estimate` (the YSE path — when called from `runScoreEstimate` with empty territory it always runs its own AI dead-map + influence computation, never short-circuited by recorded `TB`/`TW`; uses `deadstones.bundle.js` for the AI pass) |
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
                             │  frontmatter: version: 0.1.046           │
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
   │  index.html: label + script │◄────────┘      └───────►│  tech-log/content/docs/*.mdx       │
   │  "tech_log-0.1.046"?v=0.1.046│                        │  index.mdx + meta.json            │
   ├──────────────────────────────┤                        └───────────────┬──────────────────┘
   │  tech-log/src/lib/version.ts │                                        │  npx next build --webpack
   │  TECH_LOG_VERSION='0.1.046'  │                                        ▼
   ├──────────────────────────────┤                        ┌──────────────────────────────────┐
   │  tech_log-0.1.046.html       │                        │  tech-log/out/  →  tech-log-dist/ │
   │  (redirect, auto-created)    │                        │  served at /tech-log-dist/docs/   │
   └──────────────────────────────┘                        └──────────────────────────────────┘
```

**Rules for "always in sync":**

1. **Version** — bump only `version:` in the `SITEMAP.md` frontmatter, then run `npm run build-docs` (or `node sync-docs.js`). `sync-docs.js`'s `syncVersion()` patches all version consumers automatically: the `index.html` header link label (`tech_log-{version}`), every `<script src="*.js?v=…">` cache-buster (rewritten to `?v={version}` so browsers always fetch fresh JS), `TECH_LOG_VERSION` in `tech-log/src/lib/version.ts` (docs nav badge), and creates the `tech_log-{version}.html` redirect file when missing. Running a second time reports *"Version … already in sync across all consumers."*
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
version: 0.1.046
     ```
   - `sync-docs.js` automatically propagates it everywhere: patches the `index.html` header link label (`tech_log-0.1.046`) and script cache-busters (`?v=0.1.046`), updates `TECH_LOG_VERSION` in `tech-log/src/lib/version.ts`, and creates the `tech_log-0.1.046.html` redirect file if missing. No manual edits to those files needed.

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
   - Version badge shows the new version (`0.1.046`) in the sidebar
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

Source-of-truth files for the six sounds played at runtime. Since v0.1.047 these are **not** fetched at runtime — each sound is embedded in `annotation_v4.js` as a base64 data URI in the `SFX_BASE64` map (byte-identical to the file below), so playing never depends on file serving, the HTTP cache, the service worker, or filename encoding. Keep a changed file and its embedded copy in sync.

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
