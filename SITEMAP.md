---
title: Project Sitemap
description: baduk-notes — Go/Weiqi board diagram annotator & SGF re-Player
version: 0.2.019
---

> A browser-based tool for annotating Go game records with board diagram exports, move-term detection, phase analysis, and interactive study mode.
> Serve at `http://localhost:8577/`

### Web Architect Diagram

How the application files interact — UI shell, script load order, scoring pipeline, docs build, and reference assets.

<div style={{ border: '1px solid #e0e0e0', borderRadius: '8px', overflow: 'hidden', margin: '1.5rem 0' }}>
  <iframe src="/tech-log-dist/diagrams/arch-web-architect.html" width="100%" height="500" style={{ border: 'none', display: 'block' }} title="Web Architect Diagram — application file interactions" />
</div>

<div style={{ border: '1px solid #e0e0e0', borderRadius: '8px', overflow: 'hidden', margin: '1.5rem 0' }}>
  <iframe src="/tech-log-dist/diagrams/arch-docs-pipeline.html" width="100%" height="380" style={{ border: 'none', display: 'block' }} title="Docs Build Pipeline — SITEMAP.md to tech-log-dist" />
</div>


---


---


---

## Changelog

### v0.2.019 — Split the Manual Scoring Module Out of the Monolith

#### Added & Improved

| Scope | Type | Description |
| --- | --- | --- |
| **arch** | `refactor` | **`annotation_v4.js` split (pass 4)**: Extracted the entire manual-scoring subsystem into `scoring.js` (~2,701 lines) — `window.scoringState` singleton + `scoringHistory`/`scoringFuture` undo stacks, ``getScoringSnapshot``/`undoScoring`/`redoScoring`, `initScoringModal`/`openScoringModal`/`updateScoringUI`/`handleScoringBoardClick`, `persistScoringSessionData`, `saveScoringBoard`, the scoring board renderer (`renderScoringBoardToCtx`) and the `_deferredScoringInit` scheduling tail. `annotation_v4.js` shrank from 13,687 to 10,992 lines. |

##### Details
The scoring slice is self-contained: `window.scoringState`/history ride along as top-level globals, and the shared scoring-model helpers (`computeScoringPropsFromSession` etc.) intentionally remain in `annotation_v4.js` because the replayer/comment UI also uses them. Cross-file references are all call-time (`drawBoard`, `loadSGF` which resets `scoringState`, `replayToTerminal`, `updateBoardWrapperSize`), so the defer ordering — `scoring.js` before `annotation_v4.js` — stays safe.

##### Verification
- `node --check` clean on `annotation_v4.js` and `scoring.js`.
- Real-Brave smoke check: app boots, board draws, `openScoringModal`/`updateScoringUI`/`renderScoringBoardToCtx` exposed, zero page errors.
- Script cache busters synced to `v=0.2.019`.

---

### v0.2.018 — Split the Export/Diagram Module Out of the Monolith

#### Added & Improved

| Scope | Type | Description |
| --- | --- | --- |
| **arch** | `refactor` | **`annotation_v4.js` split (pass 3)**: Extracted the export & diagram module into `export-diagram.js` (~2,084 lines) — `loadRecoloredSvg`, `generateDiagramDataURL`, `openExportModal`, `configureModalInputs`, `updateExportPreview`, `serializeState`/`deserializeState`, `updateReplicationCode`, `triggerBrowserDownload`/`triggerBrowserImageDownload`, `updateLegendUI`. `annotation_v4.js` shrank from 15,766 to 13,687 lines. |

##### Details
`export-diagram.js` is pure function declarations (no top-level effects), loaded after `board-renderer.js` and before `annotation_v4.js` in the defer chain. It calls `drawBoard`/`renderBoardToCtx` (exported by board-renderer.js) only at call time. No references to the `setupEventListeners` closure-local functions.

##### Verification
- `node --check` clean on `annotation_v4.js` and `export-diagram.js`.
- Export smoke check on the served app (open export modal, serialize/replication code still exposed on `window`).
- Script cache busters synced to `v=0.2.018`.

---

### v0.2.017 — Split the Board Rendering Pipeline Out of the Monolith

#### Added & Improved

| Scope | Type | Description |
| --- | --- | --- |
| **arch** | `refactor` | **`annotation_v4.js` split (pass 2)**: Extracted the entire board-rendering pipeline into its own `board-renderer.js` (~3,583 lines) — canvas tools (`getGoTerm`, `getCanvasCoords`, `getSelectionRect`, `handleMouseDown/Move/Up`, `applyToolToCell`, `flipBoard180`), the board renderer (`drawBoard`, `renderBoardToCtx`), the stone/texture library (`drawGoStone`, hamaguri/slate textures), cell-content drawing (`drawCellContent`) and the rich-text renderer (`applyFormatting`, `parseRichText`, `wrapRichText`, `drawRichTextLine`, `drawCenteredRichText`). |

##### Details
`board-renderer.js` is a pure function-declaration module with no top-level execution effects, so it evaluates safely before `annotation_v4.js` in the defer chain. It shares the global lexical scope (reading `state`/`elements`/geometry `const`s and calling `window.*` helpers) only at call time, so load order stays safe. `annotation_v4.js` shrank from 19,343 to 15,766 lines. `updateSaveRecGameButton()` is still reachable unreserved from the moved code because `setupEventListeners` continues to publish it on `window` during init.

##### Verification
- `node --check` clean on `annotation_v4.js` and `board-renderer.js`.
- Existing study-dir-store + setup-flow tests green; board-render smoke check on the served app.
- Script cache busters synced to `v=0.2.017`.

---

### v0.2.016 — Split Study Record Storage Out of the Monolith

#### Added & Improved

| Scope | Type | Description |
| --- | --- | --- |
| **arch** | `refactor` | **`annotation_v4.js` split begins (pass 1 of safe wins)**: Extracted the entire study-record storage subsystem into its own `study-storage.js` (~730 lines) — `formatStudyAccessTime`, `StudyRecordDB` (IndexedDB/localStorage engine), `StudyDirStore` (File System Access API folder engine) and the directory-setup UI (`connectStudyDirectory`, `initStudyDirStorage`, `wireStudyDirSetupUI`, etc.). |
| **arch** | `feat` | `window.formatStudyAccessTime` is now exported at the top of `study-storage.js`, so the record-dating helper is available before the deferred event-hub runs (previously set inside the `setupEventListeners` closure). |
| **arch** | `chore` | `study-storage.js` added to `index.html` as a `defer` script between `game-tree.js` and `annotation_v4.js`, keeping load order and all `window.*` globals intact. This is the first step toward editing features without wading through the 20k-line monolith. |

##### Details
The storage block (formerly `annotation_v4.js` lines 1656–2385) moved byte-for-byte into `study-storage.js`; `annotation_v4.js` shrank from 20,069 to 19,343 lines. No behavior change: every `window.*` export (`window.StudyRecordDB`, `window.StudyDirStore`, `window.formatStudyAccessTime`) and all guarded cross-references (`renderResumeStudyTable`, `updateSaveRecGameButton` via `typeof` checks) are preserved, and `wireStudyDirSetupUI()` is still called from `setupEventListeners`. Defer script order guarantees it evaluates before `annotation_v4.js`.

##### Verification
- `node --check` clean on `annotation_v4.js` and `study-storage.js`.
- `test/verify_study_dir_store.js` (10 checks) green against the split files.
- Script cache busters synced to `v=0.2.016`.

---

### v0.2.015 — Folder Import Fallback for Browsers Without the File System Access API

#### Added & Improved

| Scope | Type | Description |
| --- | --- | --- |
| **storage** | `feat` | **Brave/FS-API-Less Folder Import Fallback**: When `showDirectoryPicker` is unavailable (Brave disables the whole File System Access API by default), the **Rec Folder** flow now falls back to a hidden `<input webkitdirectory>`: the user picks a folder and every Rec in it (`.json` sidecar + `.sgf`, or bare `.sgf` files) is read and merged into the study list. No browser-flag change required. |
| **storage** | `refactor` | **Reusable merge + parse helpers**: `StudyRecordDB.loadAllFromDir()` now delegates to a new `StudyRecordDB.mergeDirRecords(records)` (dedup by id, dir records win, syncs cache+IndexedDB+localStorage), and the folder file parsing was extracted into a testable `StudyDirStore._recordsFromFiles(files)`. |
| **storage** | `feat` | **Clearer diagnostics**: On unsupported browsers the setup overlay now offers the import fallback and explains that new Recs still save to browser storage (full folder write-back needs the FS Access API enabled in Brave). |

##### Details
The root cause of "does not support local-folder storage" in Brave was identified empirically: Brave ships with the entire File System Access API (`showDirectoryPicker`/`showOpenFilePicker`/`showSaveFilePicker`) disabled by default, even on a secure `http://localhost` context — verified by launching the installed Brave binary headlessly. This version adds `webkitdirectory` folder selection (supported in all Chromium browsers regardless of the FS Access API flag) as a read/import path, keeping browser storage as the write target when the API is off.

##### Verification
- `test/verify_study_dir_store.js` extended to 10 checks: added `hasFolderFallback`/`isUsingFallback` wiring, `mergeDirRecords` dedup/merge, and the webkitdirectory import function presence.
- Verified in a real Brave headless session (default flags, FS API disabled): `isSupported=false`, `hasFolderFallback=true`; `_recordsFromFiles` returns a full Rec from a `.json`+`.sgf` sidecar pair and a synthesized Rec from a bare `.sgf` (PB name extracted); `mergeDirRecords` lands them in storage (2 records).
- `node --check` clean on `annotation_v4.js`. Script cache busters synced to `v=0.2.015`.

---

### v0.2.014 — Study Record Directory Storage (Real .sgf Files in a User-Chosen Folder)

#### Added

| Scope | Type | Description |
| --- | --- | --- |
| **storage** | `feat` | **User-Chosen Rec Storage Folder**: On first use (or when none is set) the app asks the user to pick a local folder; every study Rec is then persisted as a real `.sgf` file (plus a `.json` metadata sidecar) in that folder via the File System Access API — no more losing games when browser cache/localStorage is cleared. |
| **storage** | `feat` | **Folder Handle Remembered Across Sessions**: The `FileSystemDirectoryHandle` is stored in IndexedDB, restored on the next session, and re-granted read/write permission, so the user picks the folder once. A **📂 Rec Folder** button in the Resume Study (Kifu) modal opens the setup to change it anytime. |
| **storage** | `feat` | **Directory Is the Authoritative Source**: On startup the app loads every Rec from the chosen folder and syncs into the in-memory cache, IndexedDB, and the existing localStorage mirror (kept as a fallback so it still works in browsers without the File System Access API). |
| **storage** | `feat` | **Graceful Browser Fallback**: When the File System Access API is unavailable, records continue to persist via the existing IndexedDB/localStorage browser storage without interruption. |

##### Details
The new `StudyDirStore` (annotation_v4.js) wraps `showDirectoryPicker`/`getFileHandle`/`createWritable` and persists the directory handle in a dedicated `BadukNotesDirStore` IndexedDB database. Each record maps to deterministic filenames `rec-<recNo>-<slug>.sgf` and `rec-<recNo>-<slug>.json`; the JSON sidecar holds all non-SGF fields (recNo, fileNm, blk, wht, lastAccess, currentMoveIndex, currentBranchPath, settings, scoringData) plus a pointer to its `.sgf`. `saveRecord`/`deleteRecord`/`loadAllFromDir` on `StudyRecordDB` now write/read/merge through the directory while still mirroring to browser storage. A "Choose Folder" setup overlay (plus the `📂 Rec Folder` button in the Kifu modal) drives configuration.

##### Verification
- Added `test/verify_study_dir_store.js` (7 checks): `saveRecord` returns true, the record is retrievable, the row renders in the Resume Study table, `StudyDirStore`/setup overlay/Rec Folder button exist, graceful fallback when the FS API is unsupported, and a saved record survives a page reload.
- Existing `npm run test:all` suites remain green (replace-click 10, replace-fix 7, rearrange 6, msm 110, territory-freeze 21+7 skip, bm-edge-mask 22, white-rim 7, stone-offset 18, study-dir-store 7).
- `node --check` clean on `annotation_v4.js`. Script cache busters synced to `v=0.2.014`.

---

### v0.2.013 — Study Session Create Render Pipeline Fix

#### Added & Improved

| Scope | Type | Description |
| --- | --- | --- |
| **study** | `fix` | **Immediate Board Render on Record Creation**: Fixed canvas blanking and scaling desync when dropping an SGF file and clicking "Yes" to record by ensuring `applyAppSettings`, `drawBoard`, and `applyCustomPanelState` execute cleanly immediately upon session creation. |
| **rendering** | `fix` | **Guarded Wrapper Sizing in loadSGF**: Prevented premature canvas clear and coordinate desync during study session loading by wrapping initial wrapper sizing in `!state.isSgfLoading`. |

##### Verification
- Verified end-to-end drop $\rightarrow$ record $\rightarrow$ move 0 and move 2 rendering in headless browser test (`boardStoneCount: 1` at move 0, `3` at move 2).
- `node --check` clean on `annotation_v4.js`. Script cache busters synced to `v=0.2.013`.

---

### v0.2.012 — StudyRecordDB IndexedDB Persistence & Quota Resolution

#### Added & Improved

| Scope | Type | Description |
| --- | --- | --- |
| **storage** | `fix` | **IndexedDB Backing for StudyRecordDB**: Study records are now stored in an in-memory cache backed by IndexedDB (`BadukNotesDB` $\rightarrow$ `study_records`), completely eliminating `QuotaExceededError` when saving large games, SGF collections, or custom board styles. |
| **storage** | `feat` | **Automatic Migration & Synchronous Memory Access**: On first startup, existing localStorage study sessions migrate seamlessly into IndexedDB. `StudyRecordDB.getAllRecords()` and `getRecord()` remain instantaneous via synchronized in-memory caching. |
| **study** | `fix` | **Study Record Persistence across Hard Reload**: Dropping an SGF file, recording it, and navigating moves now persists 100% reliably to disk and reloads on fresh browser page loads. |

##### Verification
- Verified end-to-end drop $\rightarrow$ record $\rightarrow$ move $\rightarrow$ page reload in headless browser test (`allRecordsCount: 1`, move index and SGF fully retained).
- `node --check` clean on `annotation_v4.js`. Script cache busters synced to `v=0.2.012`.

---

### v0.2.010 — Board BG Transparent Toggle

#### Added & Improved

| Scope | Type | Description |
| --- | --- | --- |
| **ui** | `feat` | Board BG ON/OFF Toggle (mirrors Board's Border): the BG row in the Board &amp; BG inspector section gains a switch — **OFF (default) = 100% transparent** canvas behind the board (see through to the page behind), **ON = fill with the picked color**. The color picker and code badge dim when OFF. |
| **ui** | `feat` | Right-Panel Shadow Scoped to Study Mode: the main app `.right-panel` drops its box-shadow (now matches the left panels), and the full shadow (`-8px 0 24px`, `-2px 0 8px`, `0 10px 30px -10px`) applies only to the study modal's right panel, gated by `.study-mode-active .study-modal-right` so it's visible only while the user is on the Study Mode. |

##### Details
1. **Style key**: `DEFAULT_INITIAL_BOARD_STYLE.bg` gains `solid: false` (OFF/transparent default). The checkbox (`#ib-bg-solid`) is wired through `bindStyleInputsEvents` as `{ section: 'bg', key: 'solid', isCheckbox: true }`, `populateStyleInputs` sets it, and `updateBgUI()` refreshes the ON/OFF label + dims the color controls — the same pattern as the Border Override toggle.
2. **Rendering**: `renderBoardToCtx` fills the canvas with `style.bg.color` only when the main/study board BG is solid ON; when OFF the main/study canvas stays transparent (no fill) so the page behind shows through. The export preview and scoring board keep their fixed canvas fills unchanged.
3. **Reset**: the existing `data-section="bg"` reset button restores OFF/transparent, and both the initial and study views keep independent toggle state.

##### Verification
- `npm run test:all` green — 7 suites, 0 failures (replace-click 10, replace-fix 7, rearrange 6, msm 110, territory-freeze 22, bm-edge-mask 22, white-rim 7, stone-offset 18). S16 updated to assert the new transparent-by-default render, the OFF/ON toggle, section reset, and per-view (initial/study) independence.
- `node --check` clean on `annotation_v4.js` and the test harness. `index.html` cache-busters to `v=0.2.010`.

---

### v0.2.009 — SGF Sanitizer Whitespace Scanner, Variation Sequence Addition & Branch Pinning

#### Added & Improved

| Scope | Type | Description |
| --- | --- | --- |
| **sgf** | `fix` | Fixed `SgfSanitizer.sanitize` start scanner: replaced `rawSgf.indexOf('(;')` with whitespace-aware `(` + optional whitespace + `;` scanner to prevent formatted SGFs `(\n\n;` from stripping metadata and truncating root moves at the first variation subtree |
| **sgf** | `feat` | Clean Variation Continuation: consecutive moves placed along an active variation branch append directly to `segTree.nodes` rather than creating redundant 1-node child forks for each move |
| **sgf** | `fix` | Full AST & Metadata Preservation: `exportEditedSgf`, `generateCurrentSgfString`, and `autoSaveActiveStudySettings` use `state.sgfTree` directly to preserve all header properties (`EV`, `PB`, `PW`, `KM`, `RE`, etc.) and all sibling branches |
| **ui** | `fix` | Main Game Tree Progress Pinning: `updatePhaseBar` and `renderStudyList` calculate progress against the Main Game Tree; moves inside variation trees stay pinned to the main line branch fork point (e.g. 4%) |
| **ui** | `fix` | Game End & Endgame Scoring Exclusivity: `isGameEnd`, `checkAndShowGameEndPopup`, and `updateEndgameScoringUI` (`⚑ Endgame Scoring`) only activate at the terminal move of the Main Game Tree, never on variations |
| **study** | `feat` | Exact Variation Resume: study sessions now persist `rec.currentBranchPath` across navigation, autosave, and reloads; resuming immediately restores the exact variation branch and target move index |
| **ui** | `feat` | Switched Variation Button Controls: `btn-var-prev` (Up icon) now navigates to Next variation (`+1`) and `btn-var-next` (Down icon) navigates to Previous variation (`-1`) with corresponding title and disable state updates |

##### Details
1. **SgfSanitizer Idempotency**: `SgfSanitizer` formats SGFs with an opening `(\n\n;`. Previous strict `indexOf('(;')` skipped past the formatted root container and matched the first inner subtree `(;W[...]...)`, slicing off the entire root sequence and discarding metadata. The new scanner scans for `(` followed by whitespace and `;`, making sanitization idempotent across repeated autosaves.
2. **Sequential Variation Moves**: In `addVariationAt`, when standing at the tip of an existing variation segment (`atLineEnd === true` with no child subtrees), clicks append directly to `segTree.nodes.push(newNode)` creating clean FF[4] variations `(;W[oe]N[Var B];B[pd];W[pc])`.
3. **Branch Progress & Resume**: Pinned variation progress to the main game tree branch point percentage to prevent false 100% completions on short variation branches. Restored `rec.currentBranchPath` in `resumeStudySession` so reloading or exiting a study session reopens at the exact variation and move.

##### Verification
- All 45 SGF FF[4] compliance tests and 64 `ff4_ex.sgf` stress tests passing.
- Verified round-trip preservation of 18 root metadata fields and multi-move variation sequences on real-game SGFs (Lee Sedol vs AlphaGo).

---

### v0.2.008 — List All Variants (Filter Removed)

#### Bug Fixes

| Scope | Type | Description |
| --- | --- | --- |
| **sgf** | `fix` | v0.2.007 made move-less branches enterable but forgot to remove the variant-list filter, so Setup/Markup demo branches still weren't offered — root fork showed 3 of 5 |

##### Details
`buildVariantList` now returns ALL children unfiltered. Safe since v0.2.007 guarantees every switch lands somewhere: move-bearing branches via the normal pipeline, move-less ones via `enterStaticBranch` static rendering. `sgfSubtreeHasMoves` helper deleted.

##### Verification
- ff4_ex Game 1 root fork: variation counter shows 5; cycling reaches Moves → Setup → Markup → Style → TimeLimits.

---

### v0.2.007 — Enterable Move-less Branches (Static Position Mode)

#### Added

| Scope | Type | Description |
| --- | --- | --- |
| **sgf** | `feat` | Move-less branches (setup/markup demo subtrees) are now **enterable**: they render as a static board position with their setup stones, markup and node comments, and Var ◀ stays alive to cycle back |

##### Details
replaces the v0.2.006 refusal: `enterStaticBranch()` rebuilds the board from root setup + every node's `AB`/`AW`/`AE` along the branch line, merges each node's markup into the baseline annotations, concatenates `C[]` texts into the info panel, sets `currentMoveIndex = -1` (the renderer's baseline position), and pins a **synthetic branch point at absolute index −1** — exactly where `navigateVariation`'s `absIdx = Math.max(-1, currentMoveIndex)` lands, so cycling out to a move-bearing sibling restores the normal pipeline through `switchBranchAndGoToNode`. All five root branches of the FF[4] spec file are now selectable; arrows/slider are inert inside static branches by design (there is nothing to step through).

##### Verification
- `node --check` clean; `node sgf-compliance-test.js` 34/34.
- ff4_ex Game 1 root fork: all 5 variants cycle; Setup/Markup show stones + explanatory comments; Style/TimeLimits behave as before.

---

### v0.2.006 — Variation Cycling Dead-Spot & Pass-Move Crash

#### Bug Fixes

| Scope | Type | Description |
| --- | --- | --- |
| **sgf** | `fix` | Refused switches didn't advance the variant position, so Var ▶ retried the same move-less branch forever and appeared dead — move-less branches are excluded from the list again (v0.2.005 regression) |
| **terms** | `fix` | `move-term-detector.js` crashed with `Cannot read properties of undefined (reading '-1')` on **pass moves** (stored as r=c=-1): `interactsLocally` indexed `board[-1][-1]`; pass guards added at all three entry points |

##### Details
the v0.2.005 "list every sibling" change backfired on forks containing demo branches: a refused switch left `bp.current` untouched, so the next click proposed the same impossible variant in an endless loop. Variant lists are filtered to move-bearing subtrees again (the visible count now matches what can actually be entered), while the exact-at-fork activation, `treeIndex` mapping and pre-mutation refusal guard from v0.2.005 are kept. Move-term detection gained negative-coordinate guards in `interactsLocally`, `evaluateTenuki` (current + previous + next move) so SGF files with passes (e.g. the FF[4] spec file's `W[]`/`B[tt]`) no longer throw on every step.

##### Verification
- `node --check` clean on both files; `node sgf-compliance-test.js` 34/34.
- ff4_ex Game 1: Var ▶ cycles Moves → Style → TimeLimits without dead clicks; walking through the pass moves produces no console errors.

---

### v0.2.005 — Sabaki-True Variation Semantics

#### Changes

| Scope | Type | Description |
| --- | --- | --- |
| **sgf** | `fix` | Var ◀▶ now lists **all** sibling branches at a fork (v0.2.004 hid move-less ones, undercounting) |
| **sgf** | `fix` | Variation cycling applies **exactly at the fork node** — past it the buttons disable instead of staying active for the whole branch |
| **study** | `fix` | Entering a genuinely move-less branch (property-demo subtrees in the FF[4] spec file) is refused cleanly with a console note instead of emptying the move list and freezing navigation |

##### Details
semantics ported from Sabaki's `goToSiblingVariation` (bundle.js: cycles nodes within the fork's sibling section; `goToMainVariation` returns). Both the Var-button state updater and `navigateVariation` now match the branch point whose `moveIndex` **equals** the current absolute index (previously `<=`, keeping the nearest fork active forever). `buildVariantList` no longer filters by move content; `switchBranchAndGoToNode` bails out *before any state mutation* when a target branch yields zero moves, so the app can never lock.

##### Verification
- `node --check` clean; `node sgf-compliance-test.js` 34/34.
- ff4_ex Game 1: root fork shows 5 variants; Setup/Markup selections refuse silently; Style/TimeLimits branches enter normally; past any fork Var buttons render disabled.

---

### v0.2.004 — Variation Navigation Lock Fix (Move-less Branches)

#### Bug Fixes

| Scope | Type | Description |
| --- | --- | --- |
| **sgf** | `fix` | Var ◀▶ switching into a branch containing **no moves** (e.g. setup/markup demo branches in the official FF[4] spec file) emptied the move list and dead-locked every navigation control |

##### Details
the official SGF FF[4] complex example uses sibling branches to *demonstrate properties* — several contain only `AB`/`AW`/`AE`/markup nodes with zero `B[]`/`W[]` moves. Selecting such a branch via Var ▶ rebuilt `state.allSgfMoves` as an empty array; every navigation handler (`goToMove` arrows, `navigateVariation`, `toggleVariationEditMode`, board clicks) early-returns on an empty move list, so the app appeared completely frozen with no error. **Fix:** new `sgfSubtreeHasMoves()` helper + shared `buildVariantList()` used by BOTH branch-point builders (`loadSGF` and `switchBranchAndGoToNode`) — branch points now only offer move-bearing alternatives, and fork points whose filtered variant count drops below 2 are not registered at all. `navigateVariation` now maps the filtered position through `variants[i].treeIndex` instead of using it as a raw child index. Also removed the temporary `[picker]`/`[osp]` diagnostics from v0.2.003.

##### Verification
- `node --check` clean; `node sgf-compliance-test.js` 34/34.
- ff4_ex Game 1: walking main line then cycling Var ◀▶ no longer locks; move-less Setup/Markup branches are excluded from variation cycling.

---

### v0.2.003 — Picker Diagnostics (temporary)

#### Maintenance

| Scope | Type | Description |
| --- | --- | --- |
| **study** | `chore` | Temporary `[picker]`/`[osp]` console diagnostics in game-picker flow (removed again in v0.2.004) |

---

### v0.2.002 — Multi-Game Picker Hotfix

#### Bug Fixes

| Scope | Type | Description |
| --- | --- | --- |
| **study** | `fix` | Missing `let _gamePickerOverlay = null;` declaration crashed the game picker on first drop (`ReferenceError`) |

##### Details
the v0.2.001 multi-game picker referenced its overlay-tracking variable without declaring it, so the very first `showGamePicker()` call threw `_gamePickerOverlay is not defined` inside `openStudyPrompt` and a dropped collection file appeared to do nothing at all. Declaration added in the same closure scope as the other picker helpers.

---

### v0.2.001 — Add Variation Branching & Record Integrity

#### Added

| Scope | Type | Description |
| --- | --- | --- |
| **study** | `feat` | Sabaki-style **Add Variation**: arm via Add button, click empty point to branch; alternative (replaces move X) or continuation (after move N) modes |
| **study** | `feat` | View jumps **onto the placed stone** after branching (Sabaki parity); second click on same point rejected as occupied |
| **study** | `feat` | Transparent preview: while armed mid-line, move X's stone renders at 35% alpha (`varFadeStone`) in both board-draw passes |
| **study** | `feat` | Multi-game SGF collections show a Sabaki-style **game picker** ("This file contains N games") instead of silently merging |

#### Fixed

| Scope | Type | Description |
| --- | --- | --- |
| **sgf** | `fix` | `switchBranchAndGoToNode` collected only up to `nodeIndex+1` nodes of the final segment, truncating the flat move list after any variation add; now always collects full segments |
| **study** | `fix` | Study-record cross-contamination: loading different content while attached overwrote the active record via `autoSaveActiveStudySettings`; `loadSGF`/`initBlankGame` now detach (`activeStudyId = null`) unless wrapped in `isSgfLoading` |
| **study** | `fix` | Record-create flow attaches the new record *then* calls `loadSGF`; now wraps with `isSgfLoading` like resume does so the Save/Update button survives |

##### Details
**Add Variation (`addVariationAt`, annotation_v4.js ~1394):** two creation modes — ALTERNATIVE inserts a sibling of move X (same colour, legality checked against position before X); CONTINUATION appends opposite-colour at line end. Split keeps the main line as child[0]; label `'Var ' + letter`. Linear-tip continuations set `_suppressGameEndOnce` so the game-end popup doesn't misfire on landing (consumed in goToMove tail between `_scoringResume` and `checkAndShowGameEndPopup`). Landing uses `landPath.push(childIndex)` + `switchBranchAndGoToNode(landPath, 0)`. **Truncation fix:** collection loop limit is now `currentTree.nodes.length` for every segment. **Contamination fixes:** detach guards in `loadSGF` (~13210) and `initBlankGame`; record-create flow (~3710) wrapped in `isSgfLoading=true/false`. **Game picker:** `splitTopLevelGametrees` is a bracket/escape-aware scanner extracting top-level gametrees; hooked at the top of `openStudyPrompt` so drag-drop, file-picker and file-handle paths all funnel through it; rows parse each block for PB/PW/EV/DT/RE + move count.

##### Verification
- `node --check` clean; `node sgf-compliance-test.js` 34/34.
- ff4_ex.sgf splitter test: exactly 2 top-level trees (3784 + 1161 chars), single-game file → 1 block, parens-inside-comments hostile case → 2 blocks.
- Parser round-trip on the official FF[4] complex example: 54 nodes / 15 branches / 45 moves preserved through `writeSgf→reparse` and `sanitize`.

---

### v0.2.000 — Perceived Load Speed Overhaul (Parallel Loading & Deferred Init)

#### Performance Improvements

| Scope | Type | Description |
| --- | --- | --- |
| **stones** | `perf` | Perceived Load Speed Overhaul (Parallel Loading & Deferred Init) |

##### Details
parallel script loading, lazy audio, deferred non-critical init. The app's initial load felt sluggish despite running locally — three bottlenecks were identified and eliminated. **Item 1 — Parallel script download (`index.html:2661-2669`):** all 9 `<script>` tags in the body gained `defer`, so the browser downloads all scripts in parallel during HTML parsing instead of blocking each other sequentially. With `defer`, scripts execute in order after the DOM is fully parsed, preserving the existing dependency chain (sgf-parser → deadstones → … → annotation_v4.js). **Item 2 — Lazy SFX (`annotation_v4.js:26-47`):** the 8 sound effects (`stone`, `remove`, `capture`, `annot`, `annot-long`, `double-click`, `double-click-w`, `mode`) were eagerly decoded at load via `createSfx()` calls — each creating an `Audio` object and calling `.load()` on a ~25 KB base64-encoded MP3. Now replaced with a lazy `_getOrCreateSfx(key)` cache (a `Map` keyed by string); `playSfx()` accepts either a string key or an `Audio` object. The sound is created and decoded only on first play. The fast-forward animation pool (`_getSfxPool`) resolves lazily too — zero audio decoding happens at startup. **Item 3 — Deferred non-critical init (`annotation_v4.js:1351-1405`):** `init()` now loads saved board styles from localStorage (`_loadSavedBoardStyles`), sets the canvas wrapper sizes (`_applySavedBoardSizes`), and calls `drawBoard()` synchronously so the board is visible on first paint. The heavy secondary work — `setupEventListeners()` (~248 listeners), `setupGameInfoEdit()`, `initFloatingToolbar()` (panel DOM setup, accordion, drag handlers, style-input binding), `setupStudyMode`, deadstones WASM preload, scoring modal init, liberties/phase-bar wiring — is deferred via `requestIdleCallback` (with `setTimeout` fallback). `StudyRecordDB` and the four `window.*` phase/strategic functions were extracted to module scope so tests can access them immediately. **Key invariant:** `updateBoardWrapperSize()` sets `canvas.width` which **clears all canvas pixels** (standard canvas API behaviour), so it must run before `drawBoard()`, not after — the saved-style loading + wrapper sizing was extracted from `initFloatingToolbar()` into `_loadSavedBoardStyles()` + `_applySavedBoardSizes()` and placed in `init()` before the first draw, preventing the deferred init from blanking the canvas.

##### Verification
- `node --check` clean. `npm run test:all` green (196+ checks, 0 failed) — all 8 suites pass: bm_edge_mask 22, white-rim 7, two-step 108, replace-click 10, replace-fix 7, rearrange 6, stone-offset 18, custom-stones 24+. annotation_v4.js is now 18,394 lines (lazy SFX 26-47, deferred init 1351-1405, `_loadSavedBoardStyles` 1298-1337, `_applySavedBoardSizes` 1339-1349); index.html is 2,671 lines (cache-busters to 0.2.000, all 9 script tags deferred).

---

### v0.1.095 — Stone X/Y Offset (Layer 1 Surface Only)

#### Bug Fixes

| Scope | Type | Description |
| --- | --- | --- |
| **stones** | `fix` | Stone X/Y Offset (Layer 1 Surface Only) |

##### Details
the Stones (Black & White) style section gains a **Stone Offset** sub-section inside Custom Stones (last item), with X Offset and Y Offset rows (slider ±10 px, step 0.01, number input). A single shared `stoneOffset: { x, y }` on the style object drives both colours — one setting applied to both Black and White stones. **Scope:** the offset applies to **LAYER 1 (Stone Surface) ONLY** — the visible stone disk (gradient / custom image / solid colour) shifts while LAYER 3 (Board Mask composite), LAYER 2 (Border Ring), labels, annotations, highlights (quarter/hoshi/cell, CIRCLE_F), move numbers and territory overlays all stay centered on the intersection. At offset 0 no `translate()` calls are emitted (zero overhead). The Stone Offset has its own reset button (`data-section="stoneOffset"`) in the Stones accordion header. **Reset Stones button fix:** the Stones header reset button (`data-section="stones"`) now resets **both** Black and White stone styles (and clears both B/W image caches), instead of only Black — `resetSectionGroups` map expands the virtual `'stones'` key to `['blackStone', 'whiteStone']` in the section-reset handler. **Style keys:** `stoneOffset: { x: 0, y: 0 }` added to `state.initialBoardStyle`, `state.studyBoardStyle`, `state.exportBoardStyle`, and `DEFAULT_INITIAL_BOARD_STYLE`; UI inputs `ib-stone-offset-x` / `ib-stone-offset-y` wired via `populateStyleInputs()` and `bindStyleInputsEvents()`.

##### Verification
- `test/verify_stone_offset.js` (new, 18 checks) drives `drawCellContent()` with a recording mock 2D context: default offset 0 emits no translate calls; offset (3,−2) shifts the surface arc to (303,298); the BM mask arc stays at (300,300); the BR ring arc stays at (300,300) (with `brSize: 10` enabled); the CIRCLE_F highlight stays at (300,300); exactly 1 translate call (surface block only); the label stays at the intersection; `populateStyleInputs` fills the inputs; `DEFAULT_INITIAL_BOARD_STYLE` carries `stoneOffset`; HTML inputs have ±10 px range and 0.01 step; Reset Stones button restores both Black and White defaults while leaving `stoneOffset` untouched. Full `npm run test:all` green — 7 suites, 0 failed (replace-click 10, replace-fix 7, rearrange 6, two-step 108, bm_edge_mask 22, white-rim 7, stone-offset 18). `node --check` clean. annotation_v4.js is now 18,299 lines; index.html cache-busters to 0.1.095.

---

### v0.1.094 — Stone Set C Black Texture (Procedural fBm Noise)

#### Features

| Scope | Type | Description |
| --- | --- | --- |
| **stones** | `feat` | Stone Set C Black Texture (Procedural fBm Noise) |

##### Details
** `_hash2D`, `_smoothstep`, `_valueNoise2D`, `_fbm` (fBm: 4 octaves default, amplitude 0.5, lacunarity **2.15**, lattice hash `ix·374761393 + iy·668265263 + seed·1442695040888963407`, seed per octave `seed + o·101`) — inserted after `_lerpColor` in both `annotation_v4.js` and the test renderer. **`_getSlateTexture` rewritten:** for every pixel inside the stone circle it computes the classic Inigo Quilez domain warp — two 3-octave warp fields at offset frequencies/offsets (`_fbm(nx + cloudSeed·3.1, ny + cloudSeed·1.7, cloudSeed·7 + 1, 3)` and `_fbm(nx + cloudSeed·5.3 + 5.2, ny + cloudSeed·2.9 + 1.3, cloudSeed·11 + 2, 3)`), then a final 4-octave field offset by `warpStrength·(q−0.5)` with `warpStrength = 2.6`, `freq = 3.2/radius` (tied to radius so grain reads at the same visual scale on every stone size) and `grainAmp = 30` → `gray = clamp(round(128 + (warped − 0.5)·2·grainAmp))`, stamped into `createImageData` with alpha 255 inside / 0 outside the circle (no clip needed — the alpha channel is the mask, `putImageData` ignores clips). **Micro-flecks:** sparser and fainter (`FLECK_COUNT = min(30, floor(radius·0.4))`, `fleckBrightness = 0.15 + rand()·0.35` → 0.15–0.5, alpha `(0.05 + rand()·0.09)·fleckBrightness`, `rgba(225,230,240,…)`). **KEY CHANGE — `drawGoStone` composite:** the slate texture is now drawn with `ctx.globalCompositeOperation = 'overlay'` at `globalAlpha = 0.55` (was normal alpha compositing at 0.85), then reset to `source-over`. The texture is pure grayscale so 'overlay' can only scale luminance, never shift hue — color is carried solely by the base radial gradient, so "texture only, color untouched" holds and none of the `_lerpColor` color logic changed. Cache key unchanged (`slate_${Math.round(radius)}_${cloudSeed}`). Hamaguri/`getStoneVariant` untouched. **Scope:** both `annotation_v4.js` and `test/stoneSetC/go-stone-renderer.js` (standalone copy for `stone-preview.html`) kept in sync.

##### Verification
- `node --check` clean on both files; `npm run test:all` green (7 suites — bm_edge_mask 22, white-rim 7, two-step 108, replace-click 10, replace-fix 7, rearrange 6, territory-freeze 21+7 skip), plus `verify_stone_set_c` (13 pass, 12 skip) and `verify_custom_stones_expand` (27/27). No flow-field/cloud-blob residue (`rg` clean of `FLOW_LINE_COUNT`, `flowAlpha`, `CLOUD_COUNT`); single definitions of `_getSlateTexture`/`drawGoStone`/`getStoneVariant` in each file. index.html cache-busters to 0.1.094.

---

### v0.1.093 — Composite Board Mask Edge Stone Margin Fix

#### Bug Fixes

| Scope | Type | Description |
| --- | --- | --- |
| **stones** | `fix` | Composite Board Mask Edge Stone Margin Fix |

##### Details
THE BORDER FRAME COLOUR PAINTED UNDERNEATH EVERY STONE'S BOARD MASK (VISIBLE WHEN BOARD'S BORDER IS ON). When `borderOverrideOn` is ON, the composite Board Mask first filled the **border frame colour** (`marginColor`) across the entire mask circle, then clipped to the playing grid and painted the board surface (`bgColor`/`boardImage`) on top. On a clean solid-colour board the frame colour is the same as the surface, so the under-layer was invisible — but on **image-background boards the frame colour differs from the board surface**, and canvas 2D sub-pixel anti-aliasing along the 360° mask-circle boundary let the frame colour bleed out from underneath, producing the yellow-gold halo ring around **every** stone (this is what v0.1.091's grid-line re-stroke was symptom-patching). **Fix:** the composite mask now draws the board surface **directly** into the mask circle inside the playing grid — no frame colour is ever painted underneath an interior stone — and the border margin colour is drawn **only** when an edge stone's mask actually overhangs the playing grid onto the outer frame (`isOverhangingEdge`), using an **evenodd clip** (`wood rect` minus `board-area rect`) so the frame colour is restricted strictly to the outer margin band ∩ mask circle. **Two-pass rendering:** because the BM now carries the frame/margin layer, `drawCellContent` gained a `renderPass` parameter (`'all'` default, `'bm'`, `'stone'`) and the three board renderers — `renderBoardToCtx` (initial + study), `generateDiagramDataURL` (export), `renderScoringBoardToCtx` (MSM) — now draw all BMs first (Pass 1), then all stone surfaces + labels (Pass 2), so a stone's BM and frame-colour overhang can never paint over a neighbouring stone (previously each cell drew BM-then-stone in row-major order, so a later cell's BM could cover an earlier cell's stone edge). The MSM scoring board keeps its legacy single-fill BM. **Also fixed while reviewing:** the What-If preview call passed a `styleObj` into the new `renderPass` slot (was a previously-ignored 12th arg; with the new signature it suppressed both the BM and stone layers, so the What-If hover/stone would render nothing) — now passes `'all'`; and `isOverhangingEdge` compares the mask against the actual `boardArea` rect (grid when override ON) instead of the on-screen `PADDING` constants, which were wrong for the export renderer (right/bottom edge stones in small exports would miss the frame-colour overhang).

##### Verification
- `test/verify_bm_edge_mask.js` (re-scoped to the new order, 22 checks): the board-surface fill is the first wood-rect fill after the mask clip; an edge stone's margin fill comes **after** the board-surface layer and is **evenodd-clipped** to the outer frame (`clip('evenodd')` precedes the margin `fillRect`); the frame colour appears in fills for edge stones; a **centre stone draws NO margin fill and no evenodd clip** (the key regression guard — interior stones can no longer carry the frame colour underneath); study mirrors initial; the export BM is clipped to the wood rect inset by the margin with the margin fill after the board layer; Border Override OFF draws no margin fill even on an edge stone; MSM keeps the legacy single-fill mask. Full `npm run test:all` green (7 suites — bm_edge_mask 22, white-rim 7, two-step 108, replace-click 10, replace-fix 7, rearrange 6, territory-freeze 21+7 skip), plus `verify_stone_set_c` (13 pass, 12 skip) and `verify_custom_stones_expand` (27/27) on Brave. `node --check` clean. annotation_v4.js is now 18,279 lines (BM composite 6901-7026, two-pass at 5537/5564/8498/8517/17984/17999, `renderPass` signature 6622); index.html cache-busters to 0.1.093.

---

### v0.1.092 — Stone Set C Slate Flow-Field Texture Upgrade

#### Refactoring

| Scope | Type | Description |
| --- | --- | --- |
| **stones** | `refactor` | Stone Set C Slate Flow-Field Texture Upgrade |

##### Details
the slate texture that reads as "surface grain" instead of cracks. Full write-up: `stone_set_c_upgrade.md` (new). **Scope:** only `_getSlateTexture()` was modified — in both the test renderer (`test/stoneSetC/go-stone-renderer.js`, a standalone copy used by `test/stoneSetC/stone-preview.html`) and `annotation_v4.js`. Lighting, color, shape, white stones and `getStoneVariant` are untouched. The macro photo of real nachiguro shows the surface marks are NOT sparse random cracks — they are a DENSE FLOWING NETWORK of curved lines, like geological strata or a fingerprint whorl. The old 2-layer function (cloud blobs + fine speckle) becomes 4 layers: cloud blobs **adjusted** (7→8, highlight `rgba(200,205,208)` → `rgba(190,200,215)` to match nachiguro's blue-grey cast); fine speckle **unchanged**; **flow-field streamlines (new)**; **bright micro-flecks (new)**. The key addition is a sine-based flow field — a direction angle at every point `(px, py)` from two harmonics (`sin(rx·k·1.0 + ry·k·1.618 + phaseX)·π + sin(rx·k·2.414 − ry·k·0.866 + phaseY)·π·ampB`, `k = 2.0/radius`). **28 streamlines** seed across the stone and each follows the local field direction step by step (`flowStep = radius·0.032`); because the angle varies continuously across space, the lines naturally curve, loop and form enclosed regions — the organic whorl/strata quality — with no hand-authored paths. Per-stone variety comes from `phaseR/X/Y` derived from `cloudSeed` via a separate RNG stream (`_mulberry32(cloudSeed·6271 + 1777)`), so every stone gets a unique grain orientation that stays stable across redraws; `phaseR` also rotates the field. Micro-flecks: `fleckBrightness = 0.15 + rand()·0.4` is rolled once per stone (0.15–0.55), and each fleck's alpha is `(0.04 + rand()·0.08) · fleckBrightness` — effective per-fleck alpha **0.006–0.044**, barely perceptible, never glittery.

##### Verification
- `node --check` clean. annotation_v4.js is now 18,193 lines (texture block: cloud blobs ~6174-6198, flow field ~6205-6276, micro-flecks ~6278-6293); `test/stoneSetC/go-stone-renderer.js` 630 lines. Full `npm run test:all` green — the Set C texture change is additive (all suites pass); index.html cache-busters to 0.1.092. Version synced via `sync-docs.js` (SITEMAP frontmatter SSOT → index.html badge + `?v=` cache-busters, `tech-log/src/lib/version.ts`, `tech_log-0.1.092.html` redirect).

---

### v0.1.091 — Grid Lines Restoration Under Board Mask

#### Bug Fixes

| Scope | Type | Description |
| --- | --- | --- |
| **stones** | `fix` | Grid Lines Restoration Under Board Mask |

##### Details
the bright/dark ring around every stone on image-background boards is gone. Root cause found by pixel-probing the real initial canvas in Brave (headless): `drawCellContent`'s composite Board Mask fills the mask circle with the board surface, which **erases the grid lines** that cross the stone out to the mask edge (`bmSize` r=15 vs stone r=13.2). On an image board the mask band reads as a visible "hollow ring" where the grid visibly stops short of the stone — identical on Stone Sets A/B/C and solid stones (so v0.1.090's shadow tweak was not the culprit). Scanline proof along grid line 9 through a centre stone: inside the mask the sampled pixel jumped to the raw texture gold `#f1c937` while the board beyond showed the grid-line-darkened `#8b7314`. **Fix:** after the BDL layer, the BM re-strokes this cell's own interior row/column lines across the mask band, clipped to the mask circle, using the board's own grid colour and width (`style.grid.lineColor` with the same `|| '#1C1917'` fallback as the base loop; raw `lineSize` on initial/study, `max(1.2, cellSize*0.035)*lineSize` on export). Boundary lines (r/c = 0/18) were already restored by the BDL layer, so edge stones on the 1/19/A/T lines keep their proper border overhang. After-pixel proof: the mask band now matches the board tone (`#968337` vs board `#8a7214`) and the bright gap is gone on centre, top-edge and black stones; corner stones render identically before/after.

##### Verification
- `test/_pixel_probe.js` (scratch, deleted) drove the real canvas in headless Brave with an image BG and stones on the 0/9/18 lines, before/after via `git stash`: every scanline through a stone now shows the grid line restored in the mask band, matching the board. Full `npm run test:all` green (7 suites, 183 checks — bm_edge_mask 17, white-rim 7, two-step 108, replace-click 10, replace-fix 7, rearrange 6, territory-freeze 21+7 skip). `node --check` clean. annotation_v4.js is now 18,133 lines (interior grid-line restoration after the BDL block in the composite mask); index.html cache-busters to 0.1.091.

---

### v0.1.090 — Stone Set A/B Drop Shadow & Halo Removal

#### Bug Fixes

| Scope | Type | Description |
| --- | --- | --- |
| **stones** | `fix` | Stone Set A/B Drop Shadow & Halo Removal |

##### Details
the grey ring/halo around stones on the **initial board** (both colours, most visible with an image board BG) is gone. Root cause was **Stone Sets A and B**, not the BM/BR layers: `drawCellContent`'s gradient path for Sets A/B cast a heavier drop shadow (`shadowColor rgba(0,0,0,0.5)`, `shadowBlur max(3, radius·0.25)`, offsets `max(2, radius·0.15)` both axes) and stroked a grey rim on white stones (`#888888` Set A, `#a09880` Set B) at the stone perimeter — together reading as a thin dark/grey hollow ring around every A/B stone on the large initial canvas, while **Set C (`drawGoStone`) and custom/image stones stayed clean** because `drawGoStone` uses a lighter 0.45-alpha shadow and clears it (`:6298`) before any texture work, with no grey rim stroke. **Fix:** Set A/B now use exactly Set C's shadow (`rgba(0,0,0,0.45)`, `shadowBlur max(3, radius·0.28)`, offsets `max(2, radius·0.14)` / `max(2, radius·0.18)`) and the two grey white-rim strokes are removed, so all three sets render with the same clean edge (verified: A/B/C now record identical `shadowColor`/`shadowBlur`/offsets and no `#a09880`/`#888888` stroke). **Session-style rim migration:** the legacy white-rim downgrade (`brSize: 1` + `br: '#111827'` → `0`) from v0.1.089 is now also applied inside `getEffectiveInitialStyle()` (`annotation_v4.js:13857-13860`) — session styles captured in a Rec's `settings` never went through the page-load localStorage migration, so an open session could still draw the old white BR ring; `migrateLegacyWhiteRim` was hoisted to module scope (`:13846-13851`) and is applied to `gameBoardStyle` on every call (idempotent, null-safe).

##### Verification
- `test/_dump_sets.js` (scratch, deleted) drove `drawCellContent` for Set A/B/C × white/black against a recording mock ctx on lightpanda: all six now share Set C's shadow params with no grey rim stroke. Full `npm run test:all` green (7 suites, 183 checks — bm_edge_mask 17, white-rim 7, two-step 108, replace-click 10, replace-fix 7, rearrange 6, territory-freeze 21+7 skip). `node --check` clean. annotation_v4.js is now 18,101 lines; index.html cache-busters to 0.1.090.

---

### v0.1.089 — White Stone Grey Rim Removal (BR Layer Default)

#### Bug Fixes

| Scope | Type | Description |
| --- | --- | --- |
| **stones** | `fix` | White Stone Grey Rim Removal (BR Layer Default) |

##### Details
the thin dark/grey halo seen around the edge of white Go stones is gone. Root cause: every default stone style had `whiteStone.br: '#111827'` with `brSize: 1`, and `drawCellContent`'s BR layer stroked that colour as a ring hugging the stone edge — `currentStoneBrSize = (brSize/10)·currentStoneRadius·0.3` (`annotation_v4.js:6615-6619`), arc at `currentStoneRadius + currentStoneBrRadius + currentStoneBrSize/2` (`:7049-7062`) — visible against any non-white background, most obviously on the study board and on the initial board when its BG is set to an image. Pixel probing showed the artifact as a 1.3px band (`#ac976a`/`#aa8f57`) at r≈12.2–13.4 just inside the stone edge. **Fix:** all four default styles (initial, study, export, scoring) now use `brSize: 0`, so the BR block is skipped entirely and the stone edge blends cleanly into the board (probe: the dark band is replaced by a natural wood-blend `#f9d340`/`#e1be79`), while the stone's silhouette and shading are untouched. The BR feature is still fully honoured whenever a user explicitly sets `brSize > 0`. **Migration:** `initFloatingToolbar` applies `window.migrateLegacyWhiteRim()` to every saved board style loaded from localStorage — a saved `whiteStone.brSize: 1` with `br: '#111827'` (the old default) is downgraded to `0`, so already-saved styles lose the ring too; any non-default rim colour is preserved exactly. No rendering logic was touched beyond the defaults and the migration; grid loops draw exactly as before.

##### Verification
- `test/verify_white_rim_removed.js` (new, 7 checks) drives `drawCellContent` against a recording mock ctx on lightpanda (no Brave): a default white stone draws **no** `#111827` stroke; an explicit `brSize: 1` still draws the BR ring at exactly `stoneRadius + brSize/2` (13.398px vs 13.2 stone, 15 mask); black stones are unaffected; `migrateLegacyWhiteRim` downgrades the legacy `brSize: 1` style, preserves a user's own rim colour, and is null-safe; no page errors. All suites pass — bm_edge_mask 17, white-rim 7, two-step 108, replace-click 10, replace-fix 7, rearrange 6, territory-freeze 21+7 skip. `node --check` clean. annotation_v4.js is now 18,095 lines (BR block 7049-7062, brSize scaling 6615-6619, migration in `initFloatingToolbar`), index.html cache-busters to 0.1.089, `npm run test:all` now also runs the BM-edge-mask and white-rim suites.

---

### v0.1.088 — Stones Documentation & Composite Board Mask

#### Bug Fixes

| Scope | Type | Description |
| --- | --- | --- |
| **stones** | `fix` | Stones Documentation & Composite Board Mask |

##### Details
the docs page `system-design/stone-sets` is renamed to `system-design/stones` — a **Stones** section (with "Stone Sets" as a sub-section), served at `localhost:8577/tech-log-dist/docs/system-design/stones/` — and gains two new sub-sections. **The Stone's Elements** documents the 11-field per-element table (`bmSize`, `bgSize`, `bg`, `br`, `brSize`, `brRadius`, `brBlur`, `fg`, `fgSize`, `useColor`, `imgSrc`) and **How The Elements Compose** the 4 render layers (BM → BRr → surface → labels). **Edge Stones and the Board Mask** documents the new composite Board Mask: on every board except the Manual Scoring Modal, `drawCellContent`'s BM is no longer a single board-surface fill but a composite that mirrors the real draw order — the frame margin colour (`border.color`, or the board colour when the border override is OFF) fills the whole mask circle, the board surface (wood texture / solid bg) is painted on top clipped to the playing area, and finally the outer grid lines (the **BDL**: `grid.boundaryColor` / `grid.boundarySize`) are re-stroked where they cross the mask so an edge stone on the A/T/1/19 lines reads as Board's Border/BG exactly like the board behind it instead of erasing the boundary line under the mask. The mask region beyond the wood rect stays transparent so the pre-rendered canvas background shows through; the MSM scoring board keeps the legacy single-fill mask. **The BDL now joins as a perfect corner, and the interior grid lines are untouched.** The outer boundary line (the BDL) is stroked as a single `strokeRect` (`annotation_v4.js:5332-5343`) — the same way the MSM scoring board strokes its wood outline (`strokeRect` at :5197-5200) — so its 4 corners are clean miter joins instead of two independently butt-capped line ends meeting (a sub-pixel notch that shows up at thick boundary sizes); the export renderer gets a matching BDL corner fill at each shared boundary corner (`annotation_v4.js:8305-8326`). The interior grid lines (`i = 1..17`) and the export's solid/dashed grid loops draw exactly as before.

##### Verification
- `test/verify_bm_edge_mask.js` (new, 17 checks) drives `drawCellContent` against a recording mock ctx: the BM composite clips to the mask, the margin layer fills the full wood rect, the board surface clips to the playing area (19×19 grid on initial, wood-rect inset by margin on export, whole wood rect when the border override is OFF), the BDL is stroked after the board-surface layer at the raw `boundarySize` on initial/study and at the export-scaled width, a center stone's BDL is clipped invisible, the MSM board emits no composite layers and keeps its legacy single fill, and override-OFF uses the board colour as the margin. Corner joint pixel-verified in Brave: with an 8px boundary the whole corner region (including the previously-notched outer square) renders `#111111` boundary — a fully merged corner — while a default 1.5px boundary renders pixel-identical to before. All prior suites pass — two-step 108, custom-stones 27+3 skip, territory-counts 36+4 skip, territory-freeze 21+7 skip, replace-territory 12+1 skip, replace-click 10, replace-fix 7, rearrange 6, Set C 13+12 skip. `node --check` clean. annotation_v4.js is now 18,079 lines (BDL strokeRect 5332-5343, export BDL corner fill 8305-8326, composite BM block 6716-6895), docs nav maps `'Stones': 'stones'` in `sync-docs.js`, the old `stone-set-a-debug-log.mdx` cross-link now points at `/tech-log-dist/docs/system-design/stones`, index.html cache-busters to 0.1.088.

---

### v0.1.085 — Stone Set C True Materials Specification (v4)

#### Bug Fixes

| Scope | Type | Description |
| --- | --- | --- |
| **stones** | `fix` | Stone Set C True Materials Specification (v4) |

##### Details
Set C's renderer (`annotation_v4.js:5982-6392`) is replaced with the v4 spec, calibrated against real photos of Kuroki Goishiten hamaguri and nachiguro slate. The two material fixes that matter most: (1) **hamaguri grain is nearly-parallel diagonal bands with a gentle bow from a FAR origin** — real photos show growth rings as parallel-ish bands, NOT tight concentric loops, because the shell hinge sits far outside the stone's patch; `_getHamaguriTexture(radius, ringCount=14, jitter=1, originAngle=-2.3, originDistMult=6)` places the origin at `radius·6` and draws ~40-point jittered polylines over `[originDist ± radius·1.15]` as 2:1 light `rgba(255,252,240,0.05-0.11)` vs shadow `rgba(150,124,80,0.06-0.14)` bands, seed 2024; and (2) **slate is matte, mottled, near-uniform black with NO specular overlay and NO rim darkening** — v3's bright glassy core + drop to near-black `#020303` rim were both wrong; v4's base gradient keeps the whole disk near one dark value (`core #333739→#37403f` by tint, `brightCore` lifted toward `#4a5153` by only `specStrength·0.6`, `rimColor` lerped toward `#000000` just 0.4, stops 0.00/0.45/1.00), the black specular overlay is deleted, and `_getSlateTexture(radius, cloudSeed=0)` renders 7 broad soft cloud blobs plus fine speckle capped at `min(700, radius·9)` (fixing v3's `radius²·0.35` compounding crush on large stones), seed `9911 + cloudSeed`.

`_parseColor` now accepts both `#rrggbb` and `rgb(r,g,b)` and `_lerpColor` routes through it — this fixes a real v3 bug where chained lerps fed the rgb output of one `_lerpColor` call into a hex-only parser, NaN-coerced by bitwise ops to black, silently collapsing every slate stone regardless of tint/value. `drawGoStone` destructures `ringCount, ringJitter, originAngle, originDistMult, whiteness, cloudSeed, tintAmount, valueShift, specularStrength`. Hamaguri now draws whites `#fffdf6`/`#f8f0da`, mid `#efdfbb`→`#f6eeda` and edge `#dcc593`→`#e6d4a8` by `whiteness`, a warm translucent rim band over radius 0.72→1.0 (`rgba(200,160,90,0)`→`rgba(160,120,60,0.22)`), a glint peaked at `0.75·specularStrength` at `(cx+0.1r, cy+0.02r)`, and a thin `rgba(150,120,70,0.4)` rim stroke (`max(0.5, r·0.02)`). `getStoneVariant` (seed `(row·19+col)·137 + (B?911:313)`) rolls per position: Black → `tintAmount rand()`, `valueShift (rand()-0.5)·1.2`, `cloudSeed floor(rand()·10000)`, `specularStrength rand()·0.5` (HARD CAP 0.5); White → `snowProbability 0.2` (ADJUSTABLE; real incidence ~5-10%), Snow grade `ringCount 30-46 / ringJitter 0.3-0.65 / originDistMult 7-10 / whiteness 0.75-1.0`, Blossom `8-17 / 0.7-1.5 / 3.5-6 / 0.1-0.65`. The `useGradientC` hook (6843-6850) passes the live loop vars `r`/`c` to `getStoneVariant` — no code change needed there.

**Test infrastructure — lightpanda is now the ONLY test runner** (per user directive; Brave removed). `test/lightpanda-launcher.js` gains `probeCapabilities(page)` (probes `createRadialGradient` on a fresh canvas → `caps.gradients`, and a 123px div's `getBoundingClientRect().height` → `caps.layout`, since lightpanda measures layout ≈5px) and spawns `lightpanda serve ... --enable-external-stylesheets` (CSS required). Pixel/layout-reliant checks are `[SKIP]`ped on lightpanda (`caps.gradients` gates render/pixel checks, `caps.layout` gates layout-height and real-click-through-overlay checks) so the harnesses stay green — excluded from pass/fail, counted in the skipped column. `test/verify_territory_counts.js` (575 → 609 lines) adds the probe + `skip()` helper, gates the three badge-fill checks (merged-fill count, dame badge disappearance, post-lock badge render) and replaces the real `page.click` through the frozen overlay with a `LAYOUT_OK`-gated click + a direct state/redraw fallback so the frozen-regular-font check still runs everywhere.

##### Verification
- All 9 suites green on lightpanda (239 passed, 0 failed, 27 skipped = 266 checks): two-step 108, custom-stones-expand 27+3 skip, territory-counts 36+4 skip, territory-frozen 21+7 skip, replace-territory 12+1 skip, replace-click 10, replace-fix 7, rearrange 6, Set C 12+12 skip (render/pixel checks gated — lightpanda has no canvas gradients, so stone rendering is unreachable there; the variant/purity/determinism/bucket logic runs). `test/verify_stone_set_c.js` restored to 24 checks re-calibrated to v4: `valueShift` in `-0.6..0.6`, integer `cloudSeed`, `originDistMult` range, Snow/Blossom bucket consistency, both grades present across a 19×19 board of white stones. `node --check` clean. annotation_v4.js is now 17,807 lines (renderer block 5982-6392, useGradientC hook 6843-6850), territory-counts harness 609 lines, Set C harness 215 lines, index.html 2,641 (cache-busters to 0.1.085).

---

### v0.1.084 — Territory Count Font Italic State on Edit/Save

#### Features

| Scope | Type | Description |
| --- | --- | --- |
| **scoring** | `feat` | Territory Count Font Italic State on Edit/Save |

##### Details
the v0.1.082 italic trigger was tied to `interactionMode` only, but after Save the lock keeps `interactionMode` FORCED to `'replace'` — so the digits stayed italic even in the frozen "Board Saved ✓" state. The editing cue is now gated on the frozen state: `countsEditing = !scoringState.frozen && (interactionMode === 'replace' || interactionMode === 'rearrange')` (`annotation_v4.js:17610-17614`). So the digits render ITALIC while editing (post-lock Replacing / re-Arranging AND the Edit-unfrozen post-Save view) and return to REGULAR Figtree-SemiBold once the session is frozen — the frozen flag is the only reliable "not editing" signal since the lock permanently pins the mode to 'replace'.

##### Verification
- `test/verify_territory_counts.js` (562 → 575 lines, 38 → 40 checks) added two checks around the Save/Edit transition: with `setScoringFrozen(true)` ("Board Saved ✓") a real toggle click's redraw captures all 6 digits as REGULAR (`16px Figtree, sans-serif` — no `italic`); after `setScoringFrozen(false)` (the Edit button) a manual redraw captures all 6 as `italic ... px 'Figtree'` again. The pre-lock marking and post-lock replace/re-arrange italic checks are unchanged. All 9 suites pass — two-step 108, custom-stones-expand 30, territory-counts 40, territory-frozen 28, replace-territory 13, replace-click 10, replace-fix 7, rearrange 6, Set C 22 = 264 checks total. `node --check` clean. annotation_v4.js is now 17,744 lines (font block 17610-17614), territory-counts harness 575 lines, index.html 2,638 (cache-busters to 0.1.084).

---

### v0.1.083 — Display Options Sidebar Clickability on Frozen Board

#### Features

| Scope | Type | Description |
| --- | --- | --- |
| **stones** | `feat` | Display Options Sidebar Clickability on Frozen Board |

##### Details
the `#scoring-frozen-overlay` (index.html:1701) is an absolute `inset: 0` layer at `z-index: 100` that `setScoringFrozen(true)` shows over the whole modal body — so once Save Board froze the session, it silently swallowed EVERY pointer event beneath it, including the left sidebar's Display Options checkboxes (Show territory / w/# / Show dead stones / Show coordinates), which looked available but would not click. The frozen overlay still dims and locks the BOARD, but the left sidebar now rides ABOVE it (`position: relative; z-index: 101`, index.html:1704-1706) so the four Display Options toggles work in the "Board Saved ✓" state. That is safe because every sidebar control self-gates on frozen/locked anyway (board click `handleScoringBoardClick` returns on `frozen`, undo/redo, komi, rule-mode, lock, and clear-buckets are all no-ops), and the board canvas remains physically overlay-locked so a frozen board cannot be edited until the Edit button unfreezes.

##### Verification
- `test/verify_territory_counts.js` (528 → 562 lines, 35 → 38 checks) added three frozen-state checks: `setScoringFrozen(true)` shows the overlay (`display: block`) with w/# unchecked; a REAL Puppeteer/CDP hit-test click on `#scoring-opt-territory-counts` lands on the checkbox through the overlay and flips `scoringState.showTerritoryCounts` to true (proving the z-index 101 sidebar is clickable post-Save — the previous full-body overlay would have intercepted this click); and a dispatched canvas click at a grid intersection leaves `scoringState.board[3][3]` untouched (the board is still click-locked while frozen). All 9 suites pass — two-step 108, custom-stones-expand 30, territory-counts 38, territory-frozen 28, replace-territory 13, replace-click 10, replace-fix 7, rearrange 6, Set C 22 = 262 checks total. `node --check` clean. index.html is 2,638 lines (cache-busters to 0.1.083; sidebar z-index 101 at 1704-1706), territory-counts harness 562 lines.

---

### v0.1.082 — Territory Counter Figtree-SemiBold Typography

#### Features

| Scope | Type | Description |
| --- | --- | --- |
| **stones** | `feat` | Territory Counter Figtree-SemiBold Typography |

##### Details
the MSM "w/#" group-count numbers swap their `bold ... 'Pretendard'` canvas font for `'Figtree', sans-serif` (`annotation_v4.js:17603-17612`) — the registered 400-weight 'Figtree' face IS `f0nts/Figtree-SemiBold.ttf`, so the digits render in the semi-bold weight with no `bold` keyword (which would only stack a faux-bold on top of it). While an EDITING mode is active — the post-D&T-Lock counting modes `interactionMode === 'replace'` (Replacing Dead Stones) or `'rearrange'` (re-Arranging Stones) — the digits switch to the matching italic face (`figtree-SemiBoldItalic.ttf`) as a visual cue that the counts are still adapting to the playground edits; pre-lock marking (Mark Dead Stones / Mark Territories) and the frozen "Board Saved ✓" view stay non-italic. This is exactly when Display Options are all live anyway: the w/# checkbox (like Show territory / Show dead / Show coords) is never disabled, so after Save/Lock the full Display Options row — w/# included — remains available and the digits italicize only in the replace/re-arrange editing modes.

##### Verification
- `test/verify_territory_counts.js` (506 → 528 lines, 32 → 35 checks) re-scoped the digit-capture patch from `/bold|700/` to Figtree-non-`normal` (`/Figtree/ && !/normal/` — the `normal ... 'Figtree'` comment labels and `system-ui` coordinate row digits are excluded, so the six count numbers are still captured exactly) and the font check now asserts Figtree-SemiBold with NO `bold`/`normal`/`italic`/Pretendard while marking; three new checks prove the italic: post-lock `applyScoringLock()` forces `interactionMode` to `'replace'`, so the locked 6-group shots all read `italic 17.4/21.6/... px 'Figtree'`, a replace that shrinks the black 6→5 keeps the italic on the adapted group, and forcing `'rearrange'` italicizes too (all six shots `italic ... px 'Figtree'`). All 9 suites pass — two-step 108, custom-stones-expand 30, territory-counts 35, territory-frozen 28, replace-territory 13, replace-click 10, replace-fix 7, rearrange 6, Set C 22 = 259 checks total (territory-frozen's pre-existing exact-pixel flake reproduced once 26/28 then passed 28/28; the badge code is fully gated behind `showTerritoryCounts`, false there). `node --check` clean. annotation_v4.js is now 17,741 lines (font block 17603-17612), territory-counts harness 528 lines, index.html 2,638 (cache-busters to 0.1.082).

---

### v0.1.081 — GoogleSansCode Monospace Font Family Integration

#### Bug Fixes

| Scope | Type | Description |
| --- | --- | --- |
| **scoring** | `fix` | GoogleSansCode Monospace Font Family Integration |

##### Details
the 'SGF Properties' code text is no longer Courier New — the DD/MA/TB/TW labels and value lists (index.html:1918-1959) now render in the GoogleSansCode family (`'GoogleSansCode', 'GoogleSansCodeProp', monospace`), backed by a new `@font-face` that actually registers the `'GoogleSansCode'` family name (annotation.css:41-51) to `f0nts/GoogleSansCode_Proportional-Regular.ttf` (previously only referenced inline and silently falling through to `GoogleSansCodeProp`); and the main text now matches the site-wide body font — the Manual Scoring Modal root (index.html:1668) dropped `system-ui` for `'Anthropic Sans', -apple-system, ...` (the same stack the `body` rule uses), and the kifu status hint (index.html:2050) swapped its `-apple-system/Inter` stack for Anthropic Sans too. annotation.css cache-buster bumped 4.2 → 4.3.

##### Verification
- Static font-fix sweep, verified by grep: the eight SGF Properties code-font spots in index.html (DD/MA/TB/TW labels + value lists, ~1918-1959) all read `'GoogleSansCode', 'GoogleSansCodeProp', monospace` and the remaining `Courier New` occurrences drop to 4 — every one a fallback position inside the separate SGF code-editor modal, where `'GoogleSansCode'` sits first; the `'GoogleSansCode'` family name is now genuinely registered (`@font-face` at annotation.css:41-51 → `f0nts/GoogleSansCode_Proportional-Regular.ttf`), so those inline references no longer silently fall through; the MSM root (index.html:1668) and the kifu status hint (index.html:2050) both carry the site-wide `'Anthropic Sans', -apple-system, ...` body stack. No behavior changes, so no harness churn — all 9 suites still pass at 256 checks. `node --check` clean. index.html is 2,638 lines (cache-busters to 0.1.081, `annotation.css?v=4.3`), annotation.css is now 4,192 lines.

---

### v0.1.080 — Territory Counter Pop-In Animation Replay

#### Bug Fixes

| Scope | Type | Description |
| --- | --- | --- |
| **scoring** | `fix` | Territory Counter Pop-In Animation Replay |

##### Details
the pop-in is no longer first-click-only — the checkbox `change` handler (`annotation_v4.js:15474-15489`) now bumps every `territoryBoxAnims` entry's `t0` to `performance.now()` whenever w/# turns ON, so the very next draw starts the ease-out-back scale over for ALL groups even when no count or extent changed; turning the toggle off draws nothing (fresh badges on a first-ever ON click still create their own entries). The self-driving `requestAnimationFrame` loop completes each replay on its own. Harness gained two re-pop regression checks (toggle off→on with NO data change → badges must be mid-animation at ~120ms with fresh timestamps, then reach full scale without a manual redraw): 32 checks, all suites green at 256.

##### Verification
- `test/verify_territory_counts.js` (473 → 506 lines, 30 → 32 checks) added the re-pop regression right after the first-click pop proof: it toggles w/# off then back on with the SAME count and extent, waits 120ms, and asserts all 24 captured cells are mid-scale (between 5% and 99% of `CELL`) with all six `territoryBoxAnims` entries still inside their 350ms window (fresh `t0`), then waits out the rest and asserts the replay reached full scale on its own. All 9 suites pass — two-step 108, custom-stones-expand 30, territory-counts 32, territory-frozen 28, replace-territory 13, replace-click 10, replace-fix 7, rearrange 6, Set C 22 = 256 checks total. `node --check` clean. annotation_v4.js is now 17,733 lines (toggle handler 15474-15489), territory-counts harness 506 lines, index.html 2,638 (cache-busters to 0.1.080).

---

### v0.1.079 — Continuous Crossword Shape Territory Area Merging

#### Features

| Scope | Type | Description |
| --- | --- | --- |
| **scoring** | `feat` | Continuous Crossword Shape Territory Area Merging |

##### Details
the per-cell badges from v0.1.078 now merge into a single seam-free shape — all of a group's CELL-sized member squares join into ONE path (single `beginPath()` + per-corner subpaths + one `fill()`, nonzero winding) so the badge is a solid crossword-block outline with NO seams between cells and NO empty bounding-box padding. A member's corner is ROUNDED (`CELL·0.45`) only at an exposed OUTER corner — where BOTH the orthogonal neighbor and the next cell along that edge are outside the group — and stays SQUARE along straight edges; a cell whose four orthogonal neighbors are all in the group (interior) is a plain square. New shared `roundedRectPathCorners(ctx,x,y,w,h,rTL,rTR,rBR,rBL)` (17292-17317) takes per-corner radii (each clamped to `[0, min(r, w/2, h/2)]`) and builds a subpath WITHOUT `beginPath()`, so callers can accumulate one group's cells and fill once; `roundedRectPath` is now a single-radius wrapper that begins a fresh path then delegates (legacy callers keep fresh-path semantics). The ease-out-back pop-in still scales the whole merged shape about the group's intersection midpoint with re-pop on count OR extent change. Harness re-scoped: 24 member cells (each CELL-sized, radius rules per corner) + ONE merged fill per group (6 fills), 15 cells + 5 fills after dame removal, 24 cells + 6 fills post-lock — 30 checks, all suites green at 254.

##### Verification
- `test/verify_territory_counts.js` (457 → 473 lines) re-scoped from per-cell fills to the merged model: `__tcBoxes` now captures `roundedRectPathCorners` calls (per-corner radii), and the color check moved from a per-cell 1:1 pairing to ONE merged fill per group (6 fills in row-major group order). The 30 checks now assert: 24 member cells each CELL-sized and centered on its intersection; the radius rule per corner (`CELL·0.45` only where the orthogonal neighbor AND the edge-adjacent cell are both outside the group — interior cells and straight-edge corners are square 0, verified across the "6" rect, the "9" square, the "2" domino, and the "5" bar); exactly 6 merged fills in black/white/black/black/black/white order; full-scale extents equal the intersection-oriented bboxes; dame removal drops 9 cells and ONE fill (24→15 cells, 6→5 fills); post-lock keeps 24 cells/6 fills. All 9 suites pass — two-step 108, custom-stones-expand 30, territory-counts 30, territory-frozen 28, replace-territory 13, replace-click 10, replace-fix 7, rearrange 6, Set C 22 = 254 checks total. `node --check` clean. annotation_v4.js is now 17,725 lines (merged badge block, `roundedRectPathCorners`/`roundedRectPath` at 17292-17317), territory-counts harness 473 lines, index.html 2,638 (cache-busters to 0.1.079).

---

### v0.1.078 — Per-Intersection Territory Box Union Fix

#### Bug Fixes

| Scope | Type | Description |
| --- | --- | --- |
| **scoring** | `fix` | Per-Intersection Territory Box Union Fix |

##### Details
every territory intersection now gets its own box — the v0.1.077 crossword badge drew only ONE cell per group because `roundedRectPath` begins a fresh path internally, so each member cell in the merged union wiped the previous ones and only the last cell of each group survived the `fill()`; now each member square is drawn AND filled on its own, so a group shows one distinct 40%-translucent rounded box per territory square, clustering along its actual area like letter cells in a crossword

**The union never happened — `roundedRectPath` resets the path.** v0.1.077 built the crossword shape as `beginPath()` → loop `roundedRectPath(...)` for every member → one `ctx.fill()`. But `roundedRectPath` itself calls `ctx.beginPath()` (`annotation_v4.js:17294`), so every cell after the first discarded the accumulating path — only the LAST member of each group was in the path when the single `fill()` ran. Result: exactly one box per territory area (the user's report: "boxes being drawn only one intersect per territory area"), even though the app intended a box per intersection.

**Fix: one fill per cell.** The badge block (`annotation_v4.js:17622-17636`) now draws each member square and immediately fills it: for every `(my, mx)` it computes the cell (`CELL`-sized, centered on the grid intersection, radius `CELL·0.45`, scaled by the pop-in about the group's intersection midpoint) and runs `roundedRectPath` + `fill()` with the group's 40% territory color. Since each `roundedRectPath` legitimately starts its own path, each fill is exactly one cell. Every territory square in the group now renders its own distinct box; adjacent boxes abut edge-to-edge (each cell spans half a grid spacing from its center, so neighbors touch at their outer edges with the rounded-corner notches between), reading as a cluster of crossword letter cells that follows the group's actual shape. The digits, the pop-in bookkeeping (`territoryBoxAnims` keyed by centroid, count-or-extent re-pop), and the self-driving `requestAnimationFrame` loop that completes the first-click pop are unchanged.

##### Verification
- `test/verify_territory_counts.js` (452 → 457 lines) re-scoped the color check to the per-cell model: `__tcBoxes[i]` pairs 1:1 with `__tcBoxFills[i]` (each cell's fill call immediately follows its path call), and every one of the 24 cells must carry its group's color — black 40% on black territory, white 40% on white. All 29 checks pass: 24 cells each centered on its member intersection at `CELL` size with `CELL·0.45` radius; per-cell fill colors; full-scale union extents equal the intersection-oriented bboxes; size scaling; digits inside their group's extent; the first-click pop regression (boxes reach full scale with no manual redraw); dame removal drops 9 cells and 9 fills (24→15); post-lock keeps 24 cells/24 fills. All 9 suites pass — two-step 108, custom-stones-expand 30, territory-counts 29, territory-frozen 28, replace-territory 13, replace-click 10, replace-fix 7, rearrange 6, Set C 22 = 253 checks total. `node --check` clean. annotation_v4.js is now 17,705 lines (per-cell badge loop 17622-17636), territory-counts harness 457 lines, index.html 2,638 (cache-busters only).

---

### v0.1.077 — MSM Crossword-Style Territory Box

#### Bug Fixes

| Scope | Type | Description |
| --- | --- | --- |
| **scoring** | `fix` | MSM Crossword-Style Territory Box |

##### Details
The MSM "w/#" badge is now a CROSSWORD-STYLE shape that hugs the actual territory area — every territory square the group owns draws as a rounded cell centered on its grid intersection, merged into ONE fill (nonzero winding) so the box follows the group's outline with rounded outer corners and notched inner corners instead of a bounding rectangle — AND the pop-in drives itself to completion so the boxes appear on the first w/# click

**Bug 1 — the first w/# click drew nothing.** Every fresh badge starts its pop-in at `boxScale 0.05` (ease-out-back at `t=0`), and the toggle handler's single `drawBoard()` is the only redraw — so on the first click the badges were rendered at 5% scale and stayed there, invisible, until some unrelated redraw happened. Fix: the counter block now schedules its own follow-ups — while any `territoryBoxAnims` entry is still animating (`(now − t0) / 350 < 1`), it `requestAnimationFrame`s a full `window.drawBoard()` (`annotation_v4.js:17663-17671`). The loop self-terminates: once every entry reaches `t=1` no further frame is scheduled, and it stops naturally if the scoring canvas goes away. A harness can opt out via `window.__tcDisableTerritoryAnim` to keep capture draws deterministic.

**Bug 2 — the box was a bounding rectangle, not the territory shape.** v0.1.075/076 drew one rounded rect over the group's bbox, so a non-rectangular territory got an empty padding box. Now each group draws a crossword-style union: for every member square `(my, mx)`, a `CELL`-sized rounded cell centered on its grid intersection (`roundedRectPath` with radius `CELL·0.45`, all added to one `beginPath`), then a single `fill()` — the nonzero winding rule merges abutting cells into one continuous shape that follows the group's outline. Rounded outer corners come from each cell's own corner arcs; a diagonal pair renders as two cells that touch only at a point (notched inner corner); a 2×3 block renders as a smooth 2×3 rounded plate. The pop-in still pivots about the group's intersection midpoint (`boxCX = PADDING + (fcMin+fcMax)/2·CELL`), scaling every cell about it, so at `scale=1` each cell lands exactly on its intersection. Digits, fills (`rgba(17,24,39,0.4)` black / `rgba(255,255,255,0.4)` white), and the count-or-extent re-pop trigger are unchanged.

##### Verification
- `test/verify_territory_counts.js` (414 → 452 lines, 28 → 29 checks) gained the bug-1 regression — after the real toggle click the harness waits 450ms with NO manual redraw and asserts the pop-in loop drew every one of the 24 member cells to full scale (`framesDrew=528 fullScaleCells=144 shots=132 anims=6`) — and re-scoped the badge checks to the crossword model: 24 cells each centered on its member intersection at `CELL` size with `CELL·0.45` radius; the six fills in row-major group order are black/white 40% as owned (`[B,W,B,B,B,W]`); at full scale each group's union extent equals its intersection-oriented bbox exactly; size scaling holds (3-cell-tall 6/9, 5-wide 5); every digit inside its group's union; dame removal drops 9 cells (24→15) and one fill; post-lock keeps 24 cells / 6 fills. All 9 suites pass — two-step 108, custom-stones-expand 30, territory-counts 29, territory-frozen 28, replace-territory 13, replace-click 10, replace-fix 7, rearrange 6, Set C 22 = 253 checks total (territory-frozen clean; the pop-in loop is fully gated behind `showTerritoryCounts`, which stays `false` there). `node --check` clean. annotation_v4.js is now 17,706 lines (badge union 17595-17637, pop-in loop 17663-17671), territory-counts harness 452 lines, index.html 2,638 (cache-busters only).

---

### v0.1.076 — MSM Intersection-Oriented Territory Counter

#### Bug Fixes

| Scope | Type | Description |
| --- | --- | --- |
| **stones** | `fix` | MSM Intersection-Oriented Territory Counter |

##### Details
its rounded box anchors to the grid INTERSECTIONS — edges midway between grid lines, half a grid spacing outside the group's outermost points — instead of sitting on the outer grid lines, so a single territory point gets a box centered on its intersection and a multi-point group's box is centered on the group's intersection midpoint

**The v0.1.075 box was anchored to cells, not points.** The v0.1.075 badge spanned `PADDING + fcMin·CELL .. PADDING + (fcMax+1)·CELL` (and the same for rows) — i.e., its edges sat ON the outer grid lines of the group. But a Go group's territory points sit ON those grid lines (each territory square renders centered on an intersection, `CELL·0.45` half-size), so the box was offset half a grid spacing from the territory: it clipped the squares that straddle the top/left grid lines, and a single "1" got a box whose corner coincided with its intersection rather than one centered on it. The box must be intersection-oriented — the natural frame for points lying on grid lines.

**Fix: shift the box half a grid spacing outward on each axis.** The badge block in `renderScoringBoardToCtx` (`annotation_v4.js:17595-17621`) now anchors the box to the mid-gap between grid lines: `boxX0 = PADDING + (fcMin − 0.5)·CELL`, `boxY0 = PADDING + (frMin − 0.5)·CELL`, spanning to `PADDING + (fcMax + 0.5)·CELL` / `PADDING + (frMax + 0.5)·CELL`. Width and height are unchanged (`(fcMax−fcMin+1)·CELL`, `(frMax−frMin+1)·CELL`) — only the origin moves, so each box shifts −0.5·CELL in both axes and its center becomes the group's intersection midpoint (`PADDING + (fcMin+fcMax)/2·CELL`), the exact spot the count digit already sits for the odd groups and the natural center for the even ones. Every territory square is now fully enclosed with a uniform half-spacing frame, a single-point group gets a `CELL`-sized box centered on its intersection, and the ease-out-back pop-in (which pivots about that box center) grows from the territory's middle. The digit, fills (`rgba(17,24,39,0.4)` black / `rgba(255,255,255,0.4)` white), pure Pretendard text, and the count-or-extent re-pop trigger are unchanged.

##### Verification
- `test/verify_territory_counts.js` (413 → 414 lines) re-anchored every expected box to the intersection frame — `[PADDING−0.5·CELL, PADDING−0.5·CELL, 2·CELL, 3·CELL]` for the black 2×3 "6", `[PADDING+13.5·CELL, PADDING+17.5·CELL, 5·CELL, CELL]` for the white 1×5 "5", `[PADDING+9.5·CELL, PADDING+3.5·CELL, 3·CELL, 3·CELL]` for the white "9", `[PADDING+3.5·CELL, PADDING+7.5·CELL, CELL, CELL]` for each black "1" — and the color/center mapping now matches the intersection midpoints (the "6" centers at `PADDING+0.5·CELL, PADDING+1.0·CELL`, the "5" at `PADDING+16·CELL, PADDING+18·CELL`, etc.). All 28 checks pass: one box per group covering its territory, black/white 40% fills, full-scale rects equal the intersection-oriented bboxes exactly, size scaling (3-cell-tall 6/9, 5-wide 5, 2-wide 2), every digit inside its box (the "6" digit now sits dead-center of its box at the group's intersection midpoint), and pop-in bookkeeping. All 9 suites pass — two-step 108, custom-stones-expand 30, territory-counts 28, territory-frozen 28, replace-territory 13, replace-click 10, replace-fix 7, rearrange 6, Set C 22 = 252 checks total (territory-frozen clean this run). `node --check` clean. annotation_v4.js is now 17,687 lines (badge block 17595-17621), territory-counts harness 414 lines, index.html 2,638 (cache-busters only).

---

### v0.1.075 — MSM Group Territory Area Coverage

#### Bug Fixes

| Scope | Type | Description |
| --- | --- | --- |
| **scoring** | `fix` | MSM Group Territory Area Coverage |

##### Details
the box is sized to the group's full-cell bounding box (every territory square it owns) instead of hugging just the digits — so a big territory shows one translucent rounded box around its entire region, while the count digit, colors, translucency, and pop-in animation stay exactly as v0.1.074

**The badge grew from the digits to the territory.** v0.1.074 sized each rounded box to the measured count text (`boxW = textWidth + 2·padX`, `boxH = fontPx·1.68`) — a small pill around the number. The request was that the box cover the entire territory area, so the counter block in `renderScoringBoardToCtx` (`annotation_v4.js:17571-17630`) now tracks each group's extent while BFS-ing members — `frMin/frMax/fcMin/fcMax` join the existing centroid sums in the member loop (`:17569-17580`) — and draws the box as the group's FULL-CELL bounding box: `boxX0 = PADDING + fcMin·CELL`, `boxY0 = PADDING + frMin·CELL`, `boxW = (fcMax−fcMin+1)·CELL`, `boxH = (frMax−frMin+1)·CELL`. The box therefore spans every territory square the group owns (plus the half-cell frame around them, since territory squares render at `CELL·0.45`), so a 3×3 territory shows one rounded rectangle around all nine squares and a single "1" shows a cell-sized box. Corner radius is `min(CELL·0.45, boxW/2, boxH/2)` (a modest rounded corner, no longer a pill); fill stays 40%-translucent in the territory color (`rgba(17,24,39,0.4)` black / `rgba(255,255,255,0.4)` white); the digits stay the v0.1.073 pure Pretendard text at the group centroid.

**The pop-in now pivots about the box's own center.** Because the box is anchored to the territory's bbox (its settled position is `(boxX0, boxY0, boxW, boxH)`), the ease-out-back scale animation scales about the bbox center `boxCX/boxCY` — `roundedRectPath(ctx, boxCX−bw/2, boxCY−bh/2, bw, bh, rad)` — so at `scale=1` the box lands exactly on the territory bbox, and mid-pop it grows outward from the territory's middle. The `territoryBoxAnims` Map entry now also records the four extent values, and the re-pop trigger is `count` OR any extent change — so a replace/re-arrange that moves a group's boundary re-pops the box even when the count is unchanged. The centroid-based key (`Math.round(fr·10),Math.round(fc·10)`) is unchanged, and the per-draw prune against `seenKeys` is unchanged.

##### Verification
- `test/verify_territory_counts.js` (383 → 413 lines, 26 → 28 checks) re-scoped the badge checks to the new geometry: each of the 6 badges' centers match its group's bbox center (stable under the scale pivot) and its fill is still black-40% on black territory / white-40% on white territory; at full scale (animation settled after 450ms) every badge rect equals the group's full-cell bbox exactly (`[36,36,59,88]` for the black 2×3 "6", `[447,564,147,29]` for the white 1×5 "5", `[153,359,59,29]` for the 1×2 "2", etc., each within 1px); badge size scales with territory size (the 3-cell-tall "6"/"9" boxes are taller than the "5"/"2", and the 5-cell-wide "5" is wider than "9" > "2"); and every count digit renders inside its own territory box (including the "6" digit, whose centroid sits at the group's grid-crossing rather than the bbox center). All 8 stable suites pass — two-step 108, custom-stones-expand 30, territory-counts 28, replace-territory 13, replace-click 10, replace-fix 7, rearrange 6, Set C 22 = 224 checks, plus territory-frozen 28 with its pre-existing ~1-in-5 exact-pixel flake (reproduces on the unmodified baseline; the badge code is fully gated behind `showTerritoryCounts`, which stays `false` in that suite). `node --check` clean. annotation_v4.js is now 17,686 lines (member loop bbox tracking 17569-17580, badge block 17589-17630), territory-counts harness 413 lines, index.html 2,638 (cache-busters only).

---

### v0.1.074 — MSM Rounded Badge with Ease-Out-Back Animation

#### Performance Improvements

| Scope | Type | Description |
| --- | --- | --- |
| **stones** | `perf` | MSM Rounded Badge with Ease-Out-Back Animation |

##### Details
a pill-shaped badge sized to the measured digits, filled 40%-translucent with the territory's own color (black box on black territory, white box on white territory), that pops in with a smooth ease-out-back 2D scale animation on its first draw or on a count change — while the digits themselves stay the same pure Pretendard text as v0.1.073

**The badge adapts to the text.** The territory-group counter block in `renderScoringBoardToCtx` (`annotation_v4.js:17586-17620`) now measures each label via `ctx.measureText(label)` and draws a rounded-rect box behind it before the digits — `padX = fontPx * 0.42`, `padY = fontPx * 0.34`, so `boxW = textWidth + 2·padX` and `boxH = fontPx + 2·padY`, i.e. a pill whose short sides are the two `padY` stubs (corner radius `r = bh/2`). The fill is 40%-translucent and matches the territory color: `rgba(17, 24, 39, 0.4)` (Black `#111827`) behind a Black territory count, `rgba(255, 255, 255, 0.4)` behind a White count — the two 0.4-alpha fills are unique to these badges (no other draw op uses a 0.4 alpha). The corner geometry is drawn by a new shared path helper `roundedRectPath(ctx, x, y, w, h, r)` (`:17292-17301`) built on `arcTo` (works on Brave/Chrome, no `ctx.roundRect()` dependency); it respects the stroke state and saves/restores nothing, so the caller's `ctx.save()`/`restore()` pairing is unchanged.

**The pop-in is a smooth 2D simple animation.** A module-level `territoryBoxAnims` Map (`:17290`) keys each badge by its group centroid (`Math.round(fr*10),Math.round(fc*10)` — centroid-relative, so it re-keys automatically when a replace/re-arrange moves a group) plus the count, storing `{ count, t0 }`. On the first draw of a badge (or when its count changes) `t0 = performance.now()` is set and the box renders at an animated scale: `t = min(1, (now − t0)/350)` with a cubic ease-out-back (`1 + 2.70158(t−1)³ + 1.70158(t−1)²`) that overshoots ~10% before settling at 1.0 — the badge scales about its own center (`bw/bh = boxW·scale`, drawn at `cx−bw/2, cy−bh/2`), so the digits never shift. Steady redraws reuse the entry and render the box at full scale instantly; only a fresh badge or a count change re-animates. Stale entries are pruned each draw against the `seenKeys` set (`:17617-17620`), so `territoryBoxAnims` holds exactly the current groups — clearing a group (DamE) or a post-lock replace that shrinks a group (6 → 5) drops the old entry and grows a fresh one. The digits are untouched: still `bold {fontPx}px 'Pretendard', sans-serif` in `#FCD102`/`#101389`, still zeroed shadow state, still pure text — the box is painted strictly behind them.

##### Verification
- `test/verify_territory_counts.js` (295 → 383 lines, 18 → 26 checks) patches `roundedRectPath` and the 0.4-alpha `fill()` calls (both unique to the badges) to prove: exactly one rounded badge per number, each centered on its digit's position (scale preserves the center); black territories get `rgba(17, 24, 39, 0.4)`, white get `rgba(255, 255, 255, 0.4)`, one-to-one in draw order; at full scale (animation settled after 450ms) badge heights equal `fontPx·1.68` within ±3px and scale with group size (9 > 6 > 5); `territoryBoxAnims` holds exactly one entry per group after a draw, shrinks to 5 when a group is cleared, and re-keys a fresh entry (count 5 at `12,4`) while dropping the old one when a post-lock replace shrinks the black 6-group. All 8 stable suites pass — two-step 108, custom-stones-expand 30, territory-counts 26, replace-territory 13, replace-click 10, replace-fix 7, rearrange 6, Set C 22 = 222 checks, plus territory-frozen 28 which has a pre-existing ~1-in-5 exact-pixel timing flake at the (4,4) vacated-point probe (reproduces on the unmodified baseline; runtime probes confirm `showTerritoryCounts` stays `false` with zero badge draws in that suite, and the badge code is fully gated behind that flag). `node --check` clean. annotation_v4.js is now 17,676 lines (`territoryBoxAnims` 17290, `roundedRectPath` 17292-17301, badge block 17586-17620, prune 17617-17620), territory-counts harness 383 lines, index.html 2,638 unchanged.

---

### v0.1.073 — MSM Territory Counter Pure Pretendard Font

#### Performance Improvements

| Scope | Type | Description |
| --- | --- | --- |
| **scoring** | `perf` | MSM Territory Counter Pure Pretendard Font |

##### Details
The MSM "w/#" Territory Counter now renders every group count as PURE font text in Pretendard Medium — no shadow, no halo, no border — with Black territory counts inked in #FCD102 and White territory counts in #101389

**The halo is gone; the digits are plain text.** The territory-group counter inside `renderScoringBoardToCtx` (`annotation_v4.js:17556-17576`) previously drew each 4-connected group's point count with `700 {px}px system-ui, sans-serif`, black fill `#111827` / white fill `#ffffff`, and a soft contrast halo (a `shadowBlur` at the 0° point behind the digits). Now the count is pure text: `ctx.font` is `bold {fontPx}px 'Pretendard', sans-serif` — the `@font-face` table (`annotation.css:49-55`) maps the `bold` weight exactly to `f0nts/PretendardEN-Medium.otf`, the requested face — and the fill is `#FCD102` for Black territory (`color === 1`) / `#101389` for White (`color === 2`), the same ink the app already uses for study opponent terms, so the read stays on-brand. The halo's shadow state is explicitly zeroed (`shadowBlur 0`, `shadowColor rgba(0, 0, 0, 0)`) so a leftover shadow from a prior draw op can never leak onto the digits — the old code set shadow state explicitly, so the new code must too. Text size still scales with group size (`Math.min(CELL_SIZE * 0.9, 9 + count * 1.4)`); the group/count/centroid algorithm is untouched.

**Font readiness.** The board font warm-up (`init`, `annotation_v4.js:1281`) now also loads `bold 12px 'Pretendard'` so the Medium face is ready before the first board draw (the `@font-face` uses `font-display: swap`, and the same family was already canvas-used by comment rendering).

##### Verification
- `test/verify_territory_counts.js` (289 → 295 lines, 17 → 18 checks) re-scoped the old halo check to assert the opposite — every count shot has `shadowBlur 0`, `shadowColor rgba(0, 0, 0, 0)`, and no bold-digit `strokeText` (pure text) — re-scoped the color checks to `#FCD102` / `#101389` (compared case-normalized, since Chrome's canvas `fillStyle` getter lowercases hex: `#FCD102` reads back as `#fcd102`), and added a new font check proving every count uses a bold `Pretendard` family string (which resolves to `PretendardEN-Medium.otf`). `test/verify_custom_stones_expand.js` also gained a small robustness pass: the accordion-content assertions now allow sub-pixel layout drift (±4px, headless Brave measures the accordion's inline max-height a hair under the later `scrollHeight`), and it inits `window._scoringDirty = false` after each load — mirroring the modal path — so the app's pre-existing bare-global `_scoringDirty` read in the `beforeunload` handler never throws on a reload of a page that never opened MSM. All 9 suites pass — two-step 108, custom-stones-expand 30, territory-frozen 28, territory-counts 18, replace-territory 13, replace-click 10, replace-fix 7, rearrange 6, Set C 22 = 242 checks total. `node --check` clean. annotation_v4.js is now 17,630 lines (counter block 17556–17576, `fillStyle` 17570, font warm-up 1286), territory-counts harness 295 lines, index.html 2,638 unchanged.

---

### v0.1.072 — Custom Stones Panel Expansion for Default Sets

#### Bug Fixes

| Scope | Type | Description |
| --- | --- | --- |
| **stones** | `fix` | Custom Stones Panel Expansion for Default Sets |

##### Details
selecting Set A/B/C auto-collapses it (instead of hard-locking it), and it stays expandable afterward — with the header click re-fitting the enclosing Stones accordion so the expanded controls are never clipped

**The lock is gone; the collapse is now just a default state.** Since the Set A/B/C renderers arrived, the Custom Stones section (manual BG/FG/BR colors + stone-image uploads) was hard-LOCKED whenever a stone set was active: `syncCustomStonesSection()` (`annotation_v4.js:13233`) added a `.locked` class, the header click handler (`:13055`) early-returned on `.locked`, and `.custom-stones-section.locked .custom-stones-header` dimmed it to 0.38 opacity with a `not-allowed` cursor. Now the controls are available under every set — the section auto-collapses on set selection but the header stays fully clickable, so the user can expand it to view/edit the custom colors, which take effect the moment the set is deselected (the no-set base path draws from the same custom style unchanged).

**One shared expand/collapse helper carries the accordion re-fit.** Both the auto-collapse-on-set-select and the manual header toggle now route through a single `setCustomStonesExpanded(section, expanded)` helper (`annotation_v4.js:13220`), replacing the duplicated inline max-height animations in `syncCustomStonesSection` (`:13250`) and the header click handler (`:13052-13058`). The helper preserves the re-fit fix for the Stones accordion: the accordion opens by setting a FIXED inline max-height measured at open time (`initAccordion`, `:14224`), so an accordion opened while a set is active (custom body collapsed) measures SHORT — expanding Custom Stones would then clip its growth behind the accordion's `overflow:hidden` and appear to never expand. `setCustomStonesExpanded` measures the body at natural size, then re-fits the enclosing `.accordion-content` to its final `scrollHeight` in the same frame the body starts expanding, so the accordion grows with the section. The now-dead `.custom-stones-section.locked` CSS block is removed from annotation.css.

##### Verification
- New harness `test/verify_custom_stones_expand.js` (30 checks, run against Brave Chrome for real layout metrics — lightpanda's layout engine measures the form-control-rich custom body as ~5px, so the pixel assertions need a full browser): initial no-set state expands the section with the accordion open at full content height (body 545px / accordion 693px); selecting Set A auto-collapses (`expanded` off, body `max-height: 0px`) with no `locked` class while the radio and `style.stoneSet` both persist; reopening the accordion under A measures SHORT (148px vs the 693px full), then a header click re-fits the accordion back to 693px with the body fully visible (545px == `scrollHeight`); collapse-under-A works; switching to Set B auto-collapses and stays expandable; deselecting B auto-expands; Set C collapses, survives a reload (radio pre-selected, section collapsed-but-expandable on the restored page). All 9 suites pass — custom-stones-expand 30, two-step 108, territory-frozen 28, territory-counts 17, replace-territory 13, replace-click 10, replace-fix 7, rearrange 6, Set C 22 = 241 checks total. `node --check` clean. annotation_v4.js is now 17,629 lines (`setCustomStonesExpanded` 13220, `syncCustomStonesSection` 13250, header wiring 13052-13058), new harness 30 checks, index.html 2,638 unchanged, annotation.css 4,181 lines (locked block removed).

---

### v0.1.071 — SGF Komi Default Tag & Canvas BG Color Picker

#### Bug Fixes

| Scope | Type | Description |
| --- | --- | --- |
| **stones** | `fix` | SGF Komi Default Tag & Canvas BG Color Picker |

##### Details
The komi "(default)" tag now shows the real SGF komi on every MSM open path (a reopened saved D&T session no longer displays the static "0 (default)" placeholder while the input/formula/session correctly held 5), and the Floating Panel's "Board & Border" section grows a Canvas BG color picker (c-BG) that only tints the initial and study board canvases — export and scoring renderers stay untouched

**Komi display regression, display-only fix.** `#scoring-komi-default-tag` is written only in `resetScoringBoardFromState()` — the modal's first-entry path — so after Save Board → close → reopen, the restore branch (`openScoringModal` → saved-session path) never ran it and the reopened modal kept the static HTML placeholder `0 (default)` (index.html) while the editable input, the formula, and the persisted session all held the real komi (5 for `KM[5]`). `openScoringModal` (`annotation_v4.js:16151`) now sets the tag on EVERY open — restore AND first-entry — right after the result tag block (`:16190-16199`), mirroring `#scoring-result-default-tag`: `elKomiDefaultTag.textContent` is set to the SGF komi followed by `" (default)"`. `extractSgfKomi()` (`:10907`) stays the SSOT komi resolver (SGF `km` → `gameInfo` km/KM/komi → `DEFAULT_KOMI` 6.5 fallback), so `KM[0]` games render "0 (default)" correctly and the komi input/±0.5 remain editable exactly as before — this is a display-only fix, the editable komi control is unchanged.

**Canvas BG (c-BG) picker.** `DEFAULT_INITIAL_BOARD_STYLE` (`:13424`) gains `bg: { color: '#ffffff' }` (after `border`); `populateStyleInputs` (`:13632`) fills `#ib-canvas-bg-color` with a `#ffffff` guard, `bindStyleInputsEvents` (`:13743`) registers it as `{ section: 'bg', key: 'color' }` (so the shared handler at `:13820` updates the `#ib-canvas-bg-color-val` badge and `saveStyleAndRedraw` persists it), and the panel gets a third `data-section="bg"` reset button reading the default from `DEFAULT_INITIAL_BOARD_STYLE['bg']`. Rendering scope: `renderBoardToCtx` (`:5050-5054`) fills the canvas with `style.bg.color` ONLY when the canvas is the initial board (`isInitialCanvas`) or the study board (`isStudyMode`) — export preview and scoring keep `#ffffff` (scoring already routes through the separate `renderScoringBoardToCtx`, which never reads `bg`). The panel section title is renamed to "Board, Border & BG"; the bg picker is a per-view style like border/stone images, so the study board tints its own `studyBoardStyle` when the panel targets the study view and the initial board keeps its own.

##### Verification
- `test/verify_msm_2step.js` (668 → 911 lines) added S15 (komi regression: fresh open, same-page reopen after Save Board, and saved-session value all read `5 (default)` / input `5` / formula `5 (komi)` / `scoringData.komi === 5`), S16 (c-BG: section title, picker default `#ffffff`, reset button; renderer fill-style spy — lightpanda's `getImageData` returns zeros even on freshly filled detached canvases, so the harness spies on the first `fillRect` fillStyle instead of pixels — proves the initial render honors the chosen bg while study/export/scoring stay white, the study view tints its own style, the section reset restores white, and the two views never clobber each other) and S17 (fresh-page restore: reload, re-apply the SGF, reopen the saved session → tag still `5 (default)`, input 5, session komi 5) — 77 → 108 checks. All 8 suites pass — two-step 108, territory-frozen 28, territory-counts 17, replace-territory 13, replace-click 10, replace-fix 7, rearrange 6, Set C 22 = 211 checks total. `node --check` clean. annotation_v4.js is now 17,637 lines (`openScoringModal` 16151, komi tag 16190–16199, `bg` in `DEFAULT_INITIAL_BOARD_STYLE` ~13452, `populateStyleInputs` 13632, `bindStyleInputsEvents` 13743, `canvasBgColor` 5050–5054), harness 911 lines, index.html 2,638 lines (section title, bg reset button, bg picker row after Border).

---

### v0.1.070 — MSM Unsaved Scoring Changes Close Warning

#### Performance Improvements

| Scope | Type | Description |
| --- | --- | --- |
| **scoring** | `perf` | MSM Unsaved Scoring Changes Close Warning |

##### Details
the '✕' button and a backdrop click both route through a new close-without-saving confirm dialog whenever `_scoringDirty` is set, mirroring the v0.1.069 beforeunload warning — a close discards the unsaved edits and the reopen restores the last Saved Board, so the user gets the same heads-up on every close path instead of only on page refresh

**Every user-initiated close path now intercepts a dirty scoring board.** v0.1.069 added the unsaved-changes warning to `beforeunload` only — a refresh warns, but clicking the '✕' (`#btn-close-scoring-modal`) or clicking the backdrop outside the panel closed the modal silently, discarding the unsaved edits without a word (the reopen restores the last Saved Board, so the edit was lost either way). Both paths now call `requestCloseScoringModal()` instead of `closeScoringModal()` directly (`annotation_v4.js:15408`, `:15413`): when the modal is active and `_scoringDirty`, the close is intercepted by a new `#scoring-close-confirm-dialog` ("Close without saving?", with **Close Without Saving** / **Cancel** buttons), and only **Close Without Saving** proceeds to `closeScoringModal()` (`:16295`, which also hides the dialog on any close). **Cancel** dismisses the dialog and keeps the modal open, so a user who actually wants to keep the work can stay and press Save Board.

**The message adapts to whether a Save exists.** With `_scoringHasSaved` the text reads "You have unsaved changes on the scoring board. Closing will discard them and restore the last Saved Board on reopen — press Save Board to keep them first."; in the pre-Save first-entry flow it reads "You have unsaved changes on the scoring board. Close without saving?" (`:16319-16329`). A clean board (no `_scoringDirty`) closes directly with no dialog, and the raw `closeScoringModal()` (`window.closeScoringModal`, `:16582`) stays as the programmatic path the v0.1.069 persistence tests use — user closes warn, scripted closes do not.

##### Verification
- `test/verify_msm_2step.js` (668 lines) added S13 (post-Save: a dirty '✕' click shows the dialog with the modal still open; Cancel hides it and keeps the modal; a dirty backdrop click also shows it; confirm closes and the reopen lands frozen "Board Saved ✓"; a clean '✕' closes directly with no dialog; a backdrop close-without-saving discards the unsaved edit) and S14 (pre-Save: an Edit-first first-entry mark is dirty and unlocked, a '✕' close shows the dialog, confirm closes, and the reopen restores the live marks) — 64 → 77 checks. All 8 suites pass — two-step 77, territory-frozen 28, territory-counts 17, replace-territory 13, replace-click 10, replace-fix 7, rearrange 6, Set C 22 = 180 checks total. `node --check` clean. annotation_v4.js is now 17,608 lines (wiring 15408/15413, `closeScoringModal` 16295, `requestCloseScoringModal` 16319, confirm/cancel 16334/16340, window alias 16582), harness 668 lines, index.html 2,632 lines (dialog after the unlock dialog).

---

### v0.1.069 — MSM Saved Board Persistence & Territory Reveal

#### Performance Improvements

| Scope | Type | Description |
| --- | --- | --- |
| **stones** | `perf` | MSM Saved Board Persistence & Territory Reveal |

##### Details
once a Save exists, unsaved post-Save edits (playground re-arranges, Reset Board/Score) can never survive a close/reopen or a page refresh, every reopen lands on the frozen "Board Saved ✓" resolution, and an unsaved scoring board now warns before close/refresh — plus the w/# territory-counts display toggle with its vacated-square reveal and contrast halo

**One source of truth for what survives.** Previously the modal persisted whatever live `scoringState` was current when it closed — so a post-Save playground session (re-arranged stones, a Reset Board, a Reset Score) could overwrite the committed resolution, and a reopen could land on a board that had drifted from the saved one. `saveScoringBoard` now captures the committed state into a new module-level source of truth `_lastSavedSession` (`annotation_v4.js:15069`, cleared on every fresh `loadSGF` at `:12488`), and both `persistScoringSessionData` (`:16053`) and `closeScoringModal` (`:16287`) persist `_lastSavedSession` — not the live board — whenever a Save exists (`:16058`, `:16293`). Before the first Save (no `savedBoard`/`_scoringHasSaved`) the original live-persist first-entry flow is untouched, so the pre-Save experience is identical.

**Reopen always lands "Board Saved ✓"; unsaved edits never leak.** `openScoringModal` (`:16125`) forces the frozen post-Save state whenever a Save exists: `_scoringDirty` is forced `false` (`:16127`, `:16173`) and `hasSaved` is computed from `savedData._scoringHasSaved || savedData.savedBoard` (`:16171`, so legacy dirty snapshots and old saves both count as saved), the modal re-engages the frozen lock presentation, and `_lastSavedSession` is restored as the discard reference for the rest of the page load (`:16179`). Because the playground is a pure display aid after Lock, its edits are discardable by design — S10/S11 verify a close→reopen discards an unsaved post-Save edit and a Reset-Board+edit, restoring exactly the last Saved Board and nothing else.

**Native close/refresh now warns on unsaved scoring work.** `setupEventListeners`' `beforeunload` handler (`:3572`) gained a `_scoringDirty` check ahead of the Rec/File SGF-dirty warnings (`:3576`): a scoring board carrying unpersisted mark/territory/re-arrange edits prompts before the page unloads, and the warning clears the moment Save Board commits (`saveScoringBoard` sets `_scoringDirty = false` at `:16383`). Verified via a synthetic `beforeunload` event in the harness (lightpanda cannot drive the native navigation prompt); the real browser dialog is a manual smoke test.

**w/# territory-counts display toggle + contrast halo.** The per-point territory counts are now a user toggle (`scoringState.showTerritoryCounts`, `:15086`, wired to the `w/#` checkbox at `:15456`); `renderScoringBoardToCtx` draws the point numbers (`:17455`) using `computeVacatedTerritory` (`:16816`, shared with the Replace-mode placement check) for the vacated-square reveal nuance and `scoringTerritoryColorForPoint` (`:16867`) for the ink color, each number backed by a soft contrast halo so it stays readable on both flood-fill shades.

##### Verification
- `test/verify_msm_2step.js` (556 lines) re-scoped S5/S6 to "Reset Board / Reset Score KEEP the last Saved Board in `rec.scoringData`" and added, via a new `findStoneNot` helper, S10 (unsaved post-Save edit → close → reopen discards it and lands frozen "Board Saved ✓"), S11 (Reset Board → change → close → reopen keeps ONLY the last Saved Board), and S12 (the `beforeunload` warning fires only while dirty and clears on Save Board) — 53 → 64 checks. `test/verify_territory_freeze.js` (263 lines) grew 19 → 28 checks covering the vacated-square territory reveal nuance. All 8 suites pass — two-step 64, territory-frozen 28, territory-counts 17, replace-territory 13, replace-click 10, replace-fix 7, rearrange 6, Set C 22 = 167 checks total; `node --check` clean. annotation_v4.js is now 17,567 lines (`_lastSavedSession` 15069/12488, persist 16053/16287/16293, open 16125–16179, save 16369–16400, `beforeunload` 3576, w/# toggle 15086/15456, territory-counts rendering 17455), harnesses 556 + 263 lines, index.html 2,620 lines.

---

### v0.1.068 — Territory Freezing After D&T Lock

#### Bug Fixes

| Scope | Type | Description |
| --- | --- | --- |
| **stones** | `fix` | Territory Freezing After D&T Lock |

##### Details
post-lock re-arrange / replace "playground" edits can never move the marked territory overlay or a manually marked territory point — the fix closes the last live-read inside the frozen scoring resolution

Since v0.1.059 the score itself has been frozen at the Lock commit: the formula, totals, result badge, `DD`/`MA`/`TB`/`TW` bars, and every post-lock consumer read `lockedSnapshot`, so the counting-phase Replace / Re-arrange ritual is a pure cosmetic display aid. But the TERRITORY **overlay** still had two live reads. In `renderScoringBoardToCtx`, section 5 built the GoScorer input from the LIVE `scoringState.board` / `markedDead` / `deadStonesInfo` (`locScores`/`areaScores` for the flood-fill squares) and section 7 drew the manual-territory marks from LIVE `scoringState.manualTerritory` — so after Lock, re-arranging or replacing stones would re-flood-fill the playground board and visibly re-draw (move) the marked territory area, contradicting the frozen score sitting next to it.

**One committed source for territory, one live source for the ritual.** The renderer now builds `terrSrc = (scoringState.locked && scoringState.lockedSnapshot) ? scoringState.lockedSnapshot : scoringState` (`annotation_v4.js:17186`) and derives every territory input from it: `terrBoard`, `terrMarkedDead`, and `terrDeadStonesInfo` feed the GoScorer calc (`:17190-17198`, still restoring dead-stone colors into the stones array because goscorer removes them internally via the markedDead transparency flag), and `terrManualTerritory` drives the manual overlay (`:17283`). The STONES still render from the live playground board (`:17220-17243`) — that is the point of the counting ritual — only the territory/area overlay, the manual territory marks, and the score read-outs are frozen. Persisted/reopened locked sessions freeze correctly because `copySnapshotShape` (`annotation_v4.js:16228`) carries `board`/`markedDead`/`deadStonesInfo`/`manualTerritory` through the Save Board → reopen path.

**Verified both ways (the test must prove the freeze is lock-specific).** Headless-verified against Brave via puppeteer-core with a new harness (`test/verify_territory_freeze.js`, 19 checks): a seeded white cage (interior 3×3 = white territory) bounded by a black ring. While UNLOCKED, lifting one cage stone flips the interior territory 2 → 0 in both the GoScorer read-out and the rendered overlay (the white squares actually disappear — proves the test would catch the old behavior), and restoring the stone brings the overlay back byte-for-byte. A pre-lock manual territory mark renders. After `applyScoringLock` the overlay equals the pre-lock pixels, and after a post-lock live cage removal + manual-mark clear the overlay and the manual mark are byte-for-byte unchanged (FROZEN), black/white score totals are identical, `lockedSnapshot` is unmodified while the live board provably did change, `countPostLockActions()` reports the discarded playground edits, and Unlock restores the committed resolution. All prior suites still pass (replace-click 10, replace-fix 7, rearrange 6, two-step 53) plus the new 19 — 95 checks total. `node --check` clean. annotation_v4.js is now 17,357 lines (territory freeze inside `renderScoringBoardToCtx` 17090–17337, `terrSrc` at 17186), new harness 214 lines, index.html unchanged at 2,615 lines.

---

### v0.1.067 — Set C Physical Material Modeling (Hamaguri & Slate)

#### Bug Fixes

| Scope | Type | Description |
| --- | --- | --- |
| **stones** | `fix` | Set C Physical Material Modeling (Hamaguri & Slate) |

##### Details
slate variation comes from POLISH/TONE (kuro neutral-black vs ao blue-green cast), not surface grain, and hamaguri grades (Snow vs Blossom) drive both tone and ring density/width

v0.1.065/066 rendered Set C from a reasonable "generic shell/slate" look, but the research behind the real materials points a different way. Chapter 3 of Kuroki Goishiten's Go Story (kurokigoishiten.com/en/pages/go-story-03) describes nachiguro-ishi as "a beautiful jet-black stone that gives off a greater and greater shine the more it is finely polished" — essentially uniform jet-black, with NO visible grain listed as a feature. So the fix for "every black stone looks identical" is not more texture, it is varying **polish and tone** per stone. For white stones, the grades page (www.kurokigoishi.co.jp/goworks) is explicit: "Snow Grade" stones have "unparalleled whiteness and the delicate, exquisite grain that runs through each stone" (the highest grade, only a small percentage of shells qualify), while "Blossom Grade" stones "have a wider grain than Snow Grade" — a concrete, implementable difference in **ring density/width**, not just ring direction.

**Slate: tone/polish is the variation.** `drawGoStone`'s black branch now blends the core gradient color through the new `_lerpColor('#rrggbb', '#rrggbb', t)` helper (`annotation_v4.js:5980`) between neutral charcoal `#454a4d` and blue-green-tinted `#4b565a`. The blend factor `tintAmount` is rolled per position in `getStoneVariant` (`0.15 + rand() * 0.7`, `annotation_v4.js:6309`), so neighboring black stones drift between a purer "kuro" cast and an "ao" blue-tinted cast — the same natural drift Kuroki describes between different pieces of the same slate, rather than a small fixed set of identical beads. The faint grain streaks stay but are no longer the star; the polish gradient is.

**Hamaguri: grade drives tone AND ring density.** The white branch now lerps its mid/edge gradient stops by `whiteness` (Snow = `#f6eeda`/`#e6d4a8` brightest-purest, Blossom = `#efdfbb`/`#dcc593` warmest-creamiest, `annotation_v4.js:6184-6186`), and — the concrete grade difference — `ringCount` is now DERIVED from the grade instead of rolled independently: `10 + Math.floor(whiteness * 28)` (`annotation_v4.js:6304`). A Snow-grade stone (whiteness → 1) rolls up to ~38 tight, delicate rings; a Blossom-grade stone (whiteness → 0) rolls ~10 wide, coarse rings — since rings always span the same radius band, the count directly sets spacing/width. Tone and grain density move together exactly as the grades do in reality. `getStoneVariant` is unchanged in structure (still a pure function of `(row, col, player)`, position-seeded, deterministic across redraws) and both new params are `ADJUSTABLE` via the same min/range rolls.

Set A, Set B, the custom-image path, and the solid-color fallback remain byte-for-byte unchanged — the upgrade touches only Set C's renderer (`annotation_v4.js:5939-6313`) and the variant it feeds, so the set stays purely additive. References: https://www.kurokigoishi.co.jp/goworks/ (Snow/Blossom grades), https://kurokigoishiten.com/en/pages/go-story-03 (Chapter 3 — nachiguro black stones), https://kurokigoishiten.com/en/pages/go-story-02 (white stones).

Headless-verified against Brave via puppeteer-core (harness `test/verify_stone_set_c.js` extended 19 → 22 checks): three new checks pass — `tintAmount` is in 0–1 and deterministic per position, `whiteness` is in 0–1 and deterministic per position, and the grade link holds exactly (`ringCount === 10 + Math.floor(whiteness * 28)`), i.e. a Snow-grade stone provably gets more/denser rings than a Blossom-grade one. All prior Set C checks pass (variant purity/determinism, per-position + per-player variety, originAngle range/determinism/variety, 0.5 specular cap, error-free A/B/C renders, dark/light stones, byte-for-byte stable redraws, A/B/C distinct, per-position variety, texture cache stability) plus the four legacy suites (replace-click 10, rearrange 6, replace-fill 7, two-step 53) — 98 checks total. `node --check` clean. annotation_v4.js is now 17,345 lines (renderer block 5939–6313, Set C branch 6765–6771), harness 173 lines, index.html unchanged at 2,615 lines.

---

### v0.1.066 — Set C Hamaguri Grain Origin Variation

#### Bug Fixes

| Scope | Type | Description |
| --- | --- | --- |
| **stones** | `fix` | Set C Hamaguri Grain Origin Variation |

##### Details
the ring-origin angle is randomized across the full 0–2π circle instead of every stone sharing one fixed hinge, so neighboring white stones visibly curve their growth rings in different directions

v0.1.065's hamaguri renderer fixed the ring "hinge" at a single angle (`originAngle = -2.3` radians), so every Set C white stone on a board showed its growth rings curving the same way — like a whole set cut from one spot on a shell. Real hamaguri sets are cut across the shell, so adjacent stones angle their grain differently. The renderer now derives a per-position ring direction from the same mulberry32 seed that already drives the other texture params.

**A single thread from variant to texture.** `getStoneVariant()` now returns `originAngle: rand() * Math.PI * 2` — a full-circle roll from the position-keyed seed (`(row * 19 + col) * 137 + player offset`), so it is deterministic per POSITION, not per placement: replaying a stone on the same point keeps the exact same shell direction (stable across redraws, undo, resize, export preview) while every position on the board rolls its own. `drawGoStone()` reads it as `options.originAngle ?? -2.3` (`annotation_v4.js:6119`) and hands it to `_getHamaguriTexture(radius, ringCount, ringJitter, originAngle)` (`annotation_v4.js:6169`), which drops the hardcoded local constant and uses the parameter directly for the off-center hinge. The texture-cache key grew from `hamaguri_${radius}_${ringCount}_${jitter}` to include `${originAngle.toFixed(2)}` (`annotation_v4.js:5985`), so each ring direction caches as its own canvas instead of colliding — at 0.01-radian resolution a 19×19 board's worth of distinct directions still dedupe aggressively, and the cache stays stable across redraws. Set A, Set B, the custom-image path, and the solid-color fallback are byte-for-byte unchanged; only Set C's hamaguri direction behavior differs. Slate black stones don't use `originAngle` (they use `grainCount`), so they are untouched.

Headless-verified against Brave via puppeteer-core (harness `test/verify_stone_set_c.js` extended 16 → 19 checks): three new checks pass — `originAngle` always lands in the full-circle range 0–2π, is byte-identical for identical `(row, col, player)` calls (deterministic per position), and differs across positions (grain-direction variety, so two stones on the same board don't share a direction by default). All 16 v0.1.065 checks still pass (purity, per-position variety, A/B/C distinct, stable redraws, cache stability) plus the prior suites: replace-click 10, rearrange-mode 6, replace-fill 7, and two-step 53 (95 checks total). `node --check` clean. annotation_v4.js is now 17,278 lines (renderer block 5940–6246, Set C branch 6697–6705), test harness 167 lines, index.html unchanged at 2,615 lines.

---

### v0.1.065 — Stone Set C Clam-Shell & Slate Materials

#### Bug Fixes

| Scope | Type | Description |
| --- | --- | --- |
| **stones** | `fix` | Stone Set C Clam-Shell & Slate Materials |

##### Details
a true-to-material renderer for hamaguri (clam-shell white) and nachiguro-style slate black stones, replacing the Set C placeholder

The floating panel's Default Stone Set selector has always offered a third option, Set C, but it was a placeholder that rendered no differently from the solid-color default. Set C now renders each stone from its actual material — white as warm ivory hamaguri shell with concentric growth-ring lines radiating from an off-center hinge and a translucent amber rim, black as matte-glossy nachiguro slate with a faint blue-green mineral tint and sparse, roughly-parallel grain streaks.

**A pure Canvas 2D material renderer, additive over the existing sets.** A self-contained renderer block was added above `drawCellContent()` (`annotation_v4.js:5940-6251`): `_getHamaguriTexture()` and `_getSlateTexture()` build the shell-ring / slate-grain textures once per (radius, variant) into an off-screen canvas cache (`_stoneTextureCache`), `drawGoStone()` paints the 3D-shaded material stone with its own drop shadow and a specular highlight, and `getStoneVariant()` derives each stone's texture params deterministically from board position. The Set C branch is a new leading `if (useGradientC)` in `drawCellContent()`'s stone-surface chain (`annotation_v4.js:6687-6695`) — Set A, Set B, the custom-image path, and the solid-color fallback are byte-for-byte unchanged, so the set is purely additive. Because the branch lives inside `drawCellContent()`, Set C works across all three boards (initial, study, export), the export preview, and the scoring board automatically.

**Per-position, not per-placement: every stone keeps its grain.** The texture parameters are NOT rolled from `Math.random()` at draw time — that would make every stone visibly "reroll" its grain on every redraw (hover, undo, resize, export preview). Instead `getStoneVariant(row, col, player)` seeds a mulberry32 PRNG from the board position `(row * 19 + col)` with a per-player seed offset, so the same point always renders the same grain (stable across redraws, no flicker) while every stone still looks different from its neighbors — exactly like real stones cut from the same shell region. Specular strength is hard-capped at 0–0.5 (50%) so the finish stays matte-glossy, never glassy. Seeding by position also means capturing and replaying a stone on the same point keeps its shell pattern (the requested "each position", not "each placement", behavior).

Headless-verified against Brave via puppeteer-core (new harness `test/verify_stone_set_c.js`, 16 checks): `getStoneVariant` is a pure function of `(row, col, player)` — identical calls return identical variants, different positions differ, different players differ, and specular is capped at 0.5; Sets A/B/C each render without errors with stones visibly dark/light; Set C pixels are byte-for-byte identical across repeated `drawBoard()` calls (no flicker); the three sets render visually distinct from each other; two different black stones differ from each other (per-position variety); and the texture cache holds both hamaguri and slate textures and stays stable across redraws. All prior harnesses still pass: the v0.1.064 replace-click 10 checks, the v0.1.063 rearrange-mode 6 checks, the v0.1.062 replace-fill 7 checks, and the v0.1.061 two-step 53 checks (S1–S9). `node --check` clean. annotation_v4.js is now 17,268 lines, index.html unchanged at 2,615 lines.

---

### v0.1.064 — Replaced Dead Stone Removal & Prisoner Return

#### Performance Improvements

| Scope | Type | Description |
| --- | --- | --- |
| **stones** | `perf` | Replaced Dead Stone Removal & Prisoner Return |

##### Details
replace-fill placements are now trackable and reversible, so a fill placed from the Dead pile goes back to the Dead pile and one drawn from the Caps counter restores the capture

Reported: on the Manual Scoring Modal, once a replace fill placed a stone (from the Dead pile or the Caps counter), there was no way to take it back — clicking the placed stone did nothing, because fill accounting happens in the bucket pools, not on the board, so the point just read as an ordinary live stone. The user's requirement: in Replace mode, clicking a replaced Dead stone must remove it from the board and add it back to its bucket.

**Reversible replace fills via `replacedStoneMap`.** Every replace-mode placement now records `scoringState.replacedStoneMap["r,c"] = { type: 'dead'|'cap', color: 1|2 }` at the moment it drains its pool. The replace-mode click handler checks the map BEFORE the non-empty-cell early-return: clicking a tracked stone clears the cell, deletes the entry, and returns the prisoner to exactly the pool it came from — a dead-source fill pushes back onto the dead pile plus its bucket mirror (`deadBlack`+`bucketWhite`, or `deadWhite`+`bucketBlack`), a cap-source fill increments the capture counter. Stones that were never replaced are untouched (live-stone clicks remain a no-op). The map is carried through every snapshot path (undo history, live board snapshot, session save/restore, close/reopen persistence) so a reopened replaced stone is still reversible, and it is cleared wherever the committed resolution is restored (Unlock, Reset Score, fresh SGF load, Reset Board) so stale tracking can never outlive the board it describes. Rearrange-mode pickups of a replaced stone also delete the map entry, keeping the two ritual modes from double-tracking the same stone.

Headless-verified (puppeteer against the repo, 10 checks): a seeded replace session locks and fills — a dead-source White fill drains `deadWhite` and records the map entry; clicking the placed stone removes it and restores `deadWhite`; after the dead pile empties, a cap-source fill drains `blackCaptures` and is recorded as `cap`, and clicking it restores the capture; reversing a dead-source fill restores the dead pile; a non-replaced live-stone click is a byte-for-byte no-op; black-side symmetric; and a Save Board → close → reopen cycle restores the replaced stone WITH its map entry, still reversible on click. All prior harnesses still pass: the v0.1.061 two-step 53 checks (S1–S9), the v0.1.062 replace-fill 7 checks, and the v0.1.063 rearrange-mode 6 checks. `node --check` clean. annotation_v4.js is now 16,961 lines, index.html 2,615 lines.

---

### v0.1.063 — Re-Arranging Stones Pool Isolation

#### Features

| Scope | Type | Description |
| --- | --- | --- |
| **stones** | `feat` | Re-Arranging Stones Pool Isolation |

##### Details
an empty-point click in re-Arranging mode places ONLY from the Re-arrange piles — never Dead or Caps — so when both Re-arrange piles are empty the click is a no-op

Reported: with both bucket Re-arrange piles empty, clicking an empty point in re-Arranging mode still let the user "re-arrange" — because the rearrange empty-point branch fell back to the Dead/Caps pools. When the mode-type pile was empty, the handler opened the color picker's sub-type step (`showPickerStep2`), which listed the Dead and Cap. sources for the chosen color and placed a dead stone (or consumed a capture) as if it were a re-arranged stone. Re-Arranging should only move stones the user actually picked up into the Re-arrange pile.

**Re-Arranging is Re-arrange-only.** `handleScoringBoardClick`'s rearrange empty-point branch now gates purely on the Re-arrange piles: both empty → the click is a no-op (no dialog, no placement); one color has stones → auto-place from that color's Re-arrange pile; both colors have stones → the color-only picker is shown and the sub-type (Dead/Cap.) step is never reachable. The Dead/Caps fallback block is deleted. As defense-in-depth, `placeScoringStoneByMode` in `rearrange` mode now consumes ONLY the Re-arrange pile (`rearrangeX.pop()` + bucket mirror) and can never drain `deadX` or the capture counters, even through the picker buttons. `showPickerStep2` is now uncalled; the step-2 dialog stays in the markup but no flow opens it anymore. Other modes are untouched: the replace flow keeps its dead-first-then-caps fill, mark mode still toggles dead marks, and mark-territory still assigns territory colors.

Headless-verified (puppeteer against the repo, 6 checks): with Re-arrange Black = 3 and Dead/Caps seeded, an empty-point click auto-places Black and drains ONLY `rearrangeBlack` (2) with `deadWhite`, `deadBlack`, `blackCaptures`, `whiteCaptures` all pinned; with both Re-arrange piles empty the click is a no-op — nothing placed, picker stays hidden, Dead/Caps unchanged; symmetric for White; with both piles non-empty the color picker shows with the sub-type step hidden, and picking Black consumes only Re-arrange Black; with only Dead/Caps available the click remains a no-op. The v0.1.062 two-step harness still passes all 53 checks (S1–S9); the v0.1.062 replace-fill verify still passes 7 checks. `node --check` clean. annotation_v4.js is now 16,904 lines, index.html 2,615 lines.

---

### v0.1.062 — Replace Dead Stones Single-Pool Deduction

#### Features

| Scope | Type | Description |
| --- | --- | --- |
| **stones** | `feat` | Replace Dead Stones Single-Pool Deduction |

##### Details
a fill consumes exactly ONE prisoner pool — the Dead pile first, then the Caps counter — so 5 dead + 4 caps = 9 replaceable and the buckets drain one stone per placement

Reported in the MSM Buckets: for Black's score 68 territory + 5 dead + 4 caps, the user expected to replace all 9 dead/captured White stones back onto the board, but only 5 could be placed — and each fill visibly cost the tray two stones. Root cause: a single replace fill consumed BOTH pools. `handleScoringBoardClick`'s replace branch popped the dead pile AND decremented the capture counter (`deadWhite.pop()` then `blackCaptures--` for a White-territory fill, mirrored for Black), and `placeScoringStoneByMode`'s replace branches plus the color-picker dialog's "Dead" source did the same. Because the fill guard only permits a placement while *some* pool is non-empty, the coupled drain collapsed both pools at the same rate (5 dead → 0 and 4 caps → 0 after 5 fills): the 6th placement was blocked and the tray read a double deduction (9 → 7 → 5 → …). The non-replace branches (`mark` mode and the fallbacks) already drained a single pool, confirming the coupling was an oversight, not intent.

**One stone, one pool.** In all three sites the capture-counter decrement now happens ONLY in the `else` — when the dead pile still holds a stone, the fill pops just that pile (plus its bucket mirror) and leaves the capture counter untouched; once the dead pile empties, fills draw from the caps counter. Dead-first priority, so 5 dead + 4 caps = 9 placements, the bucket drains exactly 1 per fill, and a 10th click is a no-op. The frozen score is untouched by design: while LOCKED the displayed score, SGF Properties bars, and blue-panel Run all read `lockedSnapshot`, so this changes only the cosmetic tray mirror of the counting ritual.

Headless-verified (puppeteer against the repo): a targeted test seeds 5 dead White + 4 caps, locks, and replaces — fills 1–5 drain Dead 5→0 with caps pinned at 4, fills 6–9 drain Caps 4→0, all 9 stones land, the 10th+ is blocked, and every fill drains exactly one pool (no double deduction). The v0.1.061 two-step harness still passes all 53 checks (S1–S9), `node --check` clean. annotation_v4.js is now 16,937 lines, index.html 2,615 lines.

---

### v0.1.061 — Manual Scoring 2-Step Save Ritual

#### Bug Fixes

| Scope | Type | Description |
| --- | --- | --- |
| **stones** | `fix` | Manual Scoring 2-Step Save Ritual |

##### Details
Lock Score COMMITS the D&T resolution to the SGF (DD/MA/TB/TW + isSgfDirty + workingSgf), then Save Board freezes the modal and captures the post-lock playground to memory — the SGF is never rewritten by saving

v0.1.060 ended with a single `saveScoringResult` (the old "Save Scoring") that did both jobs at once: it baked the committed `lockedSnapshot` into the terminal SGF node AND froze the modal. The user's refinement splits the ceremony — "Lock the Score" should be the moment the file changes, and "Save Board" should only preserve the counting playground the user just built. Lock Score now owns the SGF write; Save Board is memory-only.

**Step 1 — Lock Score writes the file.** `applyScoringLock` now calls the new `writeScoringPropsToSgf()`: it computes `computeSgfPropertyBars()` and writes the committed `DD`/`MA`/`TB`/`TW` into the terminal `state.sgfMoves[last]` node (both the `unknownProps` copy and the direct fields), sets `state.isSgfDirty = true`, regenerates `rec.workingSgf` via `generateCurrentSgfString()`, persists the record, and lights `#sgf-prop-bars-save-badge`. It also calls `updateScoringSaveButton()` — the harness caught that Save Board stayed disabled after Lock until the fix.

**Step 2 — Save Board is memory-only.** `saveScoringResult` is renamed `saveScoringBoard()`. It captures `_savedBoardSnapshot = captureLiveBoardSnapshot()` — the post-lock playground board plus its dead/rearrange stacks and capture counters — finalizes `_scoringDirty = false`, `_scoringHasSaved = true`, `setScoringFrozen(true)`, and persists `rec.scoringData = buildScoringSessionSnapshot()`. It never touches the SGF; the file was already written at Lock.

**The playground survives reopen without moving the committed score.** `buildScoringSessionSnapshot()` now carries a `savedBoard` field (the `_savedBoardSnapshot` playground), and `restoreScoringFromSavedData()` restores it exactly — skipping the dead-stack rebuild-from-marks and the stone-lift self-heal, which would undo the fills the user saved. The committed resolution (marks/territory/buckets in `lockedSnapshot`) stays the source of the frozen score, the SGF Properties bars, and the blue-panel Run — verified byte-for-byte: after a saved playground removes a stone and the modal reopens, the display shows the playground while Run and the locked board keep the committed stone and all six marks.

**Resets and fresh loads clear the playground.** `applyUnlockReset()` and the top of `resetScoringBoardFromState()` null `_savedBoardSnapshot`; the locked-pristine Reset Board persists its cleared session via the new `persistScoringSessionData()`; and `loadSGF` now resets the lock stage on a fresh file (`locked`, `lockedSnapshot`, `lockBoundaryIndex`, `frozen`, `_scoringDirty`, `_scoringHasSaved`) so a new game never reopens mid-lock. `applyUnlockReset` also gained the missing `updateScoringSaveButton()` call, so Save Board grays out again the moment the user unlocks. Buttons relabeled to match the two steps: Lock Score / Reset Score (pre-D&T) → 🔓 Unlock Score? / Reset Board (post-D&T), Save → "Save Board" / "Board Saved ✓" (frozen).

Headless-verified (puppeteer against the repo, 51 checks across S1–S9): fresh opens unlocked with Save Board grayed; marking → Lock writes DD and mirrors it onto the direct field, sets isSgfDirty, and shows the badge; Save Board freezes the modal, shows "Board Saved ✓", captures `savedBoard`, and provably does NOT rewrite the terminal DD or `workingSgf`; reopen restores the playground while `lockedSnapshot` and Run keep the committed board and marks; Reset Board restores the committed board, keeps the lock, and drops `savedBoard` from `rec.scoringData`; unlock restores pre-lock labels, grays Save Board, and Reset Score rebuilds the pristine board with no marks and no `savedBoard`; a file carrying its own DD/MA/TB/TW pre-engages the lock WITHOUT touching the SGF (isSgfDirty stays false, terminal DD stays exactly the file's 3); a fresh load clears `savedBoard`/persist data and opens unlocked; unlock after save clears `savedBoard` and retains the pre-lock marks. The harness also surfaced two test-side fixes (the modal must be opened before stone clicks, and the game-end popup must be dismissed because its 99999 z-index card overlays the board) and one real blocker: the game-end popup literally sits on top of the scoring canvas, so board clicks in a fresh headless open hit the popup instead of the board. `node --check` clean; annotation_v4.js is now 16,933 lines, index.html unchanged at 2,616 lines.

---

### v0.1.060 — Post-Lock Counting Playground & Bucket Sync

#### Bug Fixes

| Scope | Type | Description |
| --- | --- | --- |
| **stones** | `fix` | Post-Lock Counting Playground & Bucket Sync |

##### Details
the Stone Buckets (Dead/Caps/Re-arrange) now MIRROR the ritual — a post-lock fill visibly consumes a prisoner and shrinks the piles — while the score stays frozen at the committed resolution, and the Mark Dead Stones / Mark Territories tools are now UNAVAILABLE after Lock, exactly as Replace/Re-arrange are unavailable before it

v0.1.059 froze the read-out but left the counting tools' *tray* frozen too: a post-lock replace fill landed the stone on the board, yet the Dead/Caps buckets and capture counters stayed pinned to the locked resolution, and the Lock hint simply vanished. The user's refinement is that the board after Lock is a playground — "just have fun with replacing / rearranging stones, without affecting real Score" — so the tray is *also* cosmetics: it should move with the ritual (mirror the fill) while the Score itself never does. And because Mark Dead Stones / Mark Territories are resolution tools that cannot exist after the resolution is committed, they are now disabled after Lock — symmetric to Replace/Re-arrange being disabled before it.

**The tray is a cosmetic mirror of the ritual.** The bucket display source in `updateScoringUI` is back on the LIVE `scoringState` (it had frozen to the `lockedSnapshot` in v0.1.059), and every post-lock mutation guard is removed from the counting tools: a replace fill again pops its prisoner from the Dead pile and decrements the capture counter, a re-arrange pickup/placement again moves the stone between the Re-arrange and Dead piles, the color-picker dialog's Dead source buttons and `placeScoringStoneByMode` mutate normally, and clear-buckets is a live action. All of it is display-only — the frozen score read-out (section-8 formula, totals, `#scoring-result-display` badge) still reads the `lockedSnapshot` via `computeScoringSummary`, and Save/bars/Run still serialize the committed resolution, so nothing the playground does can move the real Score.

**Symmetric stage gating.** `updateScoringUI` disables Mark Dead Stones + Mark Territories when locked and Replace + Re-arrange when unlocked, with a forced fallback snapping the interaction mode to `'replace'` when locked / `'mark'` when unlocked, and `#scoring-lock-hint` is now ALWAYS visible — "🔒 Lock dead stones & territory to enable Replacing / Re-arranging." while unlocking, "🔓 Unlock to edit dead stones & territory." while locked. The obsolete `pendingLockEdit` parked-click flow (v0.1.058's lock-break on a locked mark/territory click) is deleted — those modes are unreachable while locked, so `confirmScoringUnlock` is just `applyUnlockReset()`, `cancelScoringUnlock` only closes the dialog, and `applyScoringLock` no longer clears a parked click. The Undo boundary, locked Reset Board, and dead-marks-never-clear behavior are unchanged.

Headless-verified (puppeteer against the repo, 66 checks across sections A–L, harness extended from 56): (A/B) locked plain-territory fills now shrink the prisoner pool and change the tray pills (the mirror) while the frozen read-out and `lockedSnapshot` board stay byte-for-byte identical across four fills; (C) a dead-X cell fill keeps its mark and `DD`/`MA`, dropping only the cosmetic territory; (F) fresh files open unlocked with Mark Dead + Mark Territories enabled and Replace/Re-arrange disabled, while file markup pre-engages the lock with the inverse gating and the hint shows the Unlock message; (H) Mark Dead + Mark Territories are disabled while locked, selecting them snaps back to a counting mode, and Unlock restores the resolution stage with marking working again; (I) the gating persists through close/reopen; (J) Undo while locked still caps at the lock commit point; (K) locked Reset still restores the post-D&T resolution; (L) Save while locked still persists the COMMITTED resolution, not the cosmetic board. All regression harnesses pass (`verify_no_autoseed`, `verify_gate_btn`, `verify_result_tag`, `verify_see_scoring`). `node --check` clean; annotation_v4.js is now 16,839 lines, index.html unchanged at 2,616 lines.

---

### v0.1.059 — Score Freezing on D&T Lock

#### Bug Fixes

| Scope | Type | Description |
| --- | --- | --- |
| **stones** | `fix` | Score Freezing on D&T Lock |

##### Details
once Dead Stones + Territory are Locked the computation is DONE — the formula, totals, and result badge freeze to the committed locked resolution, and every post-lock counting action (replace / re-arrange) becomes a pure cosmetic display aid that can never move the displayed score

The Lock stage (v0.1.058) committed the resolution, but only the SGF Properties bars froze: the modal's own read-out — the section-8 formula, the totals, and the result badge — still recomputed from the LIVE board/marks/captures, so a post-lock fill moved the displayed score in the modal while the bars stayed pinned, and a user could close the modal with a "counted" resolution that no longer matched the frozen commit. v0.1.059 makes the freeze total.

**One source of truth for the read-out.** A new `computeScoringSummary(ss)` computes territory (raw per-cell counts from `computeScoringPropsFromSession`, with the occupied-cell guard and `manualTerritory` override), dead (from the marks), captures, komi, and both totals for either the live `scoringState` or a `lockedSnapshot`. The section-8 formula AND the `#scoring-result-display` badge both read it, selecting the `lockedSnapshot` when locked — the badge and the formula are computed from exactly the same numbers (they previously ran two separate GoScorer passes over different inputs), and neither can move while locked. The old two-loop territory counting in `renderScoringBoardToCtx` and the `countTerritoryFromScores` helper are deleted.

**Post-lock counting actions are cosmetic.** `placeScoringStoneByMode` early-returns before any stack/capture mutation when locked; the replace branches, rearrange pickup/placement, the color-picker dialog's Dead source buttons, and clear-buckets all skip their pops/decrements while locked. The stone still lands on the live board (the physical-count display aid), but nothing can consume a prisoner, move a capture counter, or clear a dead mark; the tray buckets (Dead/Caps/Re-arrange) render from the locked resolution. Dead marks never clear — unchanged.

**Undo gets a boundary.** `applyScoringLock` records `lockBoundaryIndex = scoringHistory.length` and RETAINS the pre-lock marking history; while locked, `undoScoring` caps at the boundary and the Undo button disables there, so undo can never step back onto a pre-lock board mid-count. `applyUnlockReset` restores the locked snapshot, truncates history at the boundary, and re-enables Undo — so Reset → Unlock → Undo×N walks the marking phase back to the pristine terminal board.

**Save/close agrees with the frozen read-out.** `buildScoringSessionSnapshot` and `computeSgfPropertyBars` serialize the `lockedSnapshot` board/props while locked, so Saved `DD`/`MA`/`TB`/`TW`, the blue panel's Run, the SGF Properties bars, and a reopened modal all show the committed resolution — the cosmetic post-lock board is never persisted. Reset Board while locked restores ONLY the post-D&T locked resolution (`resetScoringBoardFromState({pristine:true})` never restores pristine or the cosmetic board); the reset dialog's message is now dynamic (`#scoring-reset-confirm-msg`) so it explains the post-lock restoration. While locked the rule-mode select, the komi input + ±0.5 buttons, and clear-buckets are no-ops, and `restoreScoringFromSavedData` backfills `komi` onto legacy `lockedSnapshot`s so the frozen formula still renders "+ 6.5 (komi)".

Headless-verified (puppeteer against the repo, 56 checks across sections A–L, harness extended from 47): (A/B) a locked plain-territory fill places the stone on the live board but the formula/totals/result read-out, the tray buckets, `DD`/`MA`, the capture counters, and the `lockedSnapshot` board are byte-for-byte frozen across four fills; (C) a dead-X cell fill keeps its mark and `DD`/`MA`, dropping only the cosmetic territory; (F) fresh files open unlocked while file markup pre-engages the lock; (G) the SGF Properties bars freeze while locked; (H) editing a locked stone shows the unlock dialog and applies the parked click after the reset; (I) `locked` + `lockedSnapshot` persist through close/reopen; (J) Undo while locked caps exactly at the lock commit point (a third Undo is a no-op) and can never reach a pre-lock board; (K) Reset while locked restores the post-D&T resolution with the undo stack capped, and Unlock → Undo×N walks back to the pristine terminal board; (L) Save while locked persists the COMMITTED resolution to the terminal node — reopen shows the frozen resolution, not the cosmetic fill. All regression harnesses pass (`verify_no_autoseed`, `verify_gate_btn`, `verify_result_tag`, `verify_see_scoring`; the two pre-v0.1.055 `verify_source_note*` harnesses are stale). `node --check` clean; annotation_v4.js is now 16,865 lines, index.html 2,616 lines.

---

### v0.1.058 — Manual Scoring Modal Committed Lock Stage

#### Bug Fixes

| Scope | Type | Description |
| --- | --- | --- |
| **stones** | `fix` | Manual Scoring Modal Committed Lock Stage |

##### Details
Mark Dead Stones + Mark Territories are the mandatory first stage, locking freezes the SGF Properties read-out and unlocks Replace/Re-arrange, and dead marks NEVER clear — the dead X survives every fill

The counting tools exposed a deep inconsistency. *Replacing Dead Stones* and *Re-arranging* existed only as a physical-count ritual that is meaningless before the Life & Death resolution exists, yet they were always available; and the previous mark-clearing behavior (v0.1.057 kept it only for the dead-X cell: "marks survive replacing" everywhere except a fill into a cell that already carried the dead X) meant the one spot the physical ritual most wants to fill — the dead-marked point — silently erased its own dead-stone resolution from `DD`/`MA`. This version introduces a real professional workflow: **resolve → Lock → count**, with the dead X as an immutable overlay that never clears.

**The Lock stage.** Mark Dead Stones + Mark Territories are now the mandatory first stage. A **🔒 Lock Dead Stones + Territory** button (`#btn-scoring-lock`, next to Save) commits the resolution: it captures a `lockedSnapshot` of the exact board/marks/territory/buckets/captures, flips the lock on, and only then enables *Replacing Dead Stones* and *Re-arranging* — before the lock both options render disabled-but-visible with the amber hint ("Mark dead stones first — Replace/Re-arrange unlock after locking"). Files whose SGF already carries `DD`/`MA`/`TB`/`TW` **pre-engage the lock** on open (a file markup is a committed resolution); fresh files open unlocked. While locked, the SGF Properties bars (`DD`/`MA`/`TB`/`TW`) **freeze to the locked snapshot** and show a lock badge (`#sgf-prop-lock-badge`) — fills become display aids that cannot move the committed read-out.

**Marks never clear (the v0.1.043 exception is deleted).** Every replace/re-arrange action keeps `markedDead`/`deadStonesInfo` untouched. Filling a dead-X cell now places the territory-colored prisoner AND keeps the X over it (`DD`/`MA` never shrink); the dead stone remains a prisoner through the mark, while its freed point stops being territory (the cell is occupied), so a dead-X fill drops only the territory side (−1) and the prisoner term stays — captured in the harness as "dead stone stays a prisoner via the mark." The GoScorer read-out had to be made consistent: `territoryScoring` reports territory on a transparent occupied cell, so `countTerritoryFromScores` and the score-breakdown loop in `renderScoringBoardToCtx` now skip occupied cells (`ss.board[y][x] !== 0`), matching the territory shading and the `computeScoringPropsFromSession` occupied-skip — all three read-outs now agree that an occupied point is a stone, never territory.

**Unlock = reset to the locked resolution, not pristine.** Editing a locked mark/territory (or pressing Unlock) parks the click in `pendingLockEdit`, and when post-lock counting work exists (placed/removed stones, capture drift, manual-territory edits — `countPostLockActions`) shows the amber "Unlock & Reset" confirmation dialog listing what would be discarded. Confirming restores the locked snapshot (board, marks, territory, buckets, captures; the counting phase's undo history is dropped and the mode reverts to the resolution stage) and replays the parked edit click so the user's intended mark change still lands. Unlock with nothing pending applies directly. Lock state persists: `locked` + `lockedSnapshot` are written to the session snapshot (`copySnapshotShape` deep-copy) and restored on reopen, so a saved/reopened resolution re-engages the lock and re-enables Replace/Re-arrange.

Headless-verified (puppeteer against the repo, 44 checks across sections A–I): (A/B) markup-file plain-territory fills keep `DD`/`MA` and the mark set byte-for-byte unchanged with the margin pinned (−1 per player per fill); (C) a dead-X cell fill places the stone, keeps its mark, keeps `DD`/`MA`, stops being territory (−1 total), and keeps the dead stone a prisoner via the mark (only the territory side drops); (D) manual marks → Lock → replace fills keep `DD`/`MA` intact; (E) Save writes the FULL pre-fill `DD` set to the terminal node; (F) fresh SGF opens unlocked with Replace/Re-arrange disabled + hint visible, and file `DD`/`MA`/`TB`/`TW` pre-engages the lock with both enabled + badge visible; (G) while locked the SGF Properties bars stay frozen through a counting fill while the live read-out moves, the pending-action unlock shows the confirm dialog, confirming restores the locked resolution, and Replace re-disables; (H) clicking a live stone while locked shows the dialog, and the intended mark edit is APPLIED after the reset; (I) `locked` + `lockedSnapshot` persist through close/reopen and Replace re-enables. All regression harnesses pass (`verify_no_autoseed`, `verify_gate_btn`, `verify_result_tag`, `verify_see_scoring`; the two pre-v0.1.055 `verify_source_note*` harnesses are stale — they assert the removed auto-seed behavior). `node --check` clean; annotation_v4.js is now 16,880 lines, index.html 2,616 lines.

Replacing a dead stone (clicking a territory point in *Replacing Dead Stones* mode) must never shrink the game's resolved Life & Death set: the "Marked Dead Stones" value in SGF Properties (the `DD`/`MA` counts derived from `markedDead`/`deadStonesInfo` via `computeSgfPropertyBars`) dropped by 1 on every fill, even though the user was only physically counting prisoners — the game's dead-stone resolution was silently being erased.

Root cause: the replace branch cleared one dead mark per fill through the `consumeDeadMarkFromState` helper (introduced in v0.1.042 to keep the score's dead term falling with the fill), and since the SGF Properties bars and the score both read the marks, each fill subtracted one from `DD`/`MA`. That mark-clearing existed only to make the score arithmetic work — it conflated the counting ritual with the Life & Death resolution.

Fix in `annotation_v4.js`: `consumeDeadMarkFromState` is deleted and every replacement fill now keeps the marks untouched and instead decrements the capture counter (`whiteCaptures` for a fill of Black's territory with a dead Black stone, `blackCaptures` for a fill of White's territory with a dead White stone). The prisoner term in the score still drops by exactly 1 per fill — the dead stone stays in the marks (it is still resolved as dead) while its prisoner accounting for the score runs through the captures counter — so the final margin stays pinned (both players still lose exactly 1 per fill) AND `DD`/`MA` in SGF Properties stay at their full pre-fill values. The dead-marked cell itself is the single exception (unchanged v0.1.043 behavior the user chose to keep): filling a cell that already carries the dead X still clears only that cell's mark, relocating it `mark → capture`, so that path remains the only replace action that reduces `DD`/`MA` by one. `node --check` clean; file is now 16,664 lines.

Headless-verified (puppeteer against the repo): on the Go Seigen test SGF — a plain-territory replace fill leaves `DD`/`MA` counts and the mark set byte-for-byte unchanged while both totals drop by exactly 1 (B 16→15, W 41→40, margin pinned); three further fills keep `DD`/`MA` intact with the margin pinned through all of them; a fill on a dead-marked cell still succeeds and drops `DD`/`MA` by exactly 1 (only its own cell); manual-mark fills keep `DD`/`MA` intact; and Save after a replace writes the FULL pre-fill `DD` set to the terminal node — the marks are never consumed by replacing. All checks pass.

---

### v0.1.056 — Manual Scoring Modal Result Display

#### Bug Fixes

| Scope | Type | Description |
| --- | --- | --- |
| **scoring** | `fix` | Manual Scoring Modal Result Display |

##### Details
a "Result ... (default)" row directly below the "Komi ... (default)" row, derived from the SGF's `RE` value, or "n/a (default)" when the record defines none

The modal's sidebar showed the game's komi (with its SGF-derived "(default)" tag) but gave no read-out of the recorded result. The Scoring Modal is where a user confirms a game's end state, so the game's own `RE` (e.g. `W+2`) belongs right next to it.

Fix: a new `scoring-result-default-tag` span was added to the modal sidebar immediately after the Komi Control row (`index.html`, same style as the komi default tag), and `openScoringModal()` populates it on every open — both the fresh path and the restore-from-saved-session path — from the SGF's `RE` metadata (`state.sgfMetadata.re`, falling back to `state.gameInfo`), trimmed, with "n/a" when the record defines none.

Verified with puppeteer against the repo (3 checks): the repo's test SGF (`RE[W+2]`) → tag reads `W+2 (default)`; the Result row sits directly below the Komi Control row in the sidebar; a copy of the SGF with `RE` stripped → tag reads `n/a (default)`. `node --check` clean. Bump to v0.1.056 with changelog narrative; annotation_v4.js table (16,691 lines) updated; docs rebuilt and all version consumers synced.

---

### v0.1.055 — Manual Scoring Initial Zero Dead Marks

#### Bug Fixes

| Scope | Type | Description |
| --- | --- | --- |
| **stones** | `fix` | Manual Scoring Initial Zero Dead Marks |

##### Details
first open on a record without DD/MA/TB/TW starts with zero dead marks (only territory may auto-derive); dead stones are recorded only from the user's manual marks when they hit Save

The dead-stone heuristic (goscorer/Sabaki `detectDeadStonesHeuristic`) auto-seeded dead marks on the FIRST open of the Manual Scoring Modal whenever the loaded record declared no endgame markup — and closing the modal persisted that "auto-seeded" session, so the Estimation panel's Run then computed a score from machine-guessed dead stones (15 in the test game) instead of showing the Dead-Stone Gate. The v0.1.050–v0.1.054 work only *labeled* this provenance (red "auto-seeded"); the spec is now explicit: dead stones are always the file's own DD/MA/TB/TW *or* the user's manual marks — never a heuristic.

Fix: `resetScoringBoardFromState()` no longer calls `seedAutoDeadMarks()` on first entry (the call block and the now-dead function were removed). First open on a markup-less record now shows the board exactly as played with ZERO auto-marked dead stones; only territory is allowed to auto-derive (GoScorer derives it from whatever dead marks exist — none at open). Dead stones are recorded exclusively when the user marks them manually with the X tool and hits Save, which writes DD/MA/TB/TW into the terminal SGF node and persists `rec.scoringData`. Because a session-only resolution on a markup-less file is now by definition the user's own manual marks, the Run panel's red note text was updated from the now-impossible "auto-seeded" to **Deterministic JTS from manual dead-stone marks (marked in Manual Scoring).** (yellow "(SGF)" and gray default unchanged). Stale comments referencing the heuristic were updated throughout.

Verified with puppeteer against the repo (13 checks): (A) first MSM open on a no-markup file → zero auto-marked dead stones, empty dead buckets (previously 15); (B) open+close MSM with no marks → the session does not resolve and Run still shows the "No DD/MA/TB/TW Endgame Markup Found" gate; (C) a file WITH DD/MA/TB/TW still seeds dead stones from its own markup and stays yellow "(SGF)"; (D) manual click → Save → DD written to the terminal SGF node, `computeSgfPropertyBars()` derives it, `isSgfDirty` set, and Run after Save computes JTS with the yellow "(SGF)" note; (E) manual marks closed WITHOUT Save → session resolves, Run computes JTS with the red "manual dead-stone marks" note (no "auto-seeded" text anywhere). `node --check` clean. Bump to v0.1.055 with changelog narrative; annotation_v4.js table (16,684 lines) updated; docs rebuilt and all version consumers synced.

---

### v0.1.054 — Deterministic JTS SGF Source Attribution

#### Bug Fixes

| Scope | Type | Description |
| --- | --- | --- |
| **stones** | `fix` | Deterministic JTS SGF Source Attribution |

##### Details
a scoring session on a record whose SGF carries the markup still reads yellow "Deterministic JTS from DD/MA/TB/TW endgame markup (SGF)." — red "auto-seeded" is reserved for resolutions that exist only through the dead-stone heuristic with no SGF markup

The v0.1.052 note labeled by provenance, so a game like REC_NO 003 whose SGF declares DD/MA/TB/TW still showed the red "auto-seeded" note once a Manual Scoring session existed on the record — even though the modal seeds that session from the record's own DD/MA/TB/TW (never the heuristic when markup exists), so the JTS was in fact computing from SGF markup. The "(SGF)" yellow text the v0.1.052 spec called for was not honored in that case.

Fix: `scoringSourceNote` now decides by `findEndgameMarkup(false)` (pure SGF sources — moves, root props, main line; session fallback skipped) in front of provenance: snapshot resolves AND the SGF file itself declares markup → yellow **Deterministic JTS from DD/MA/TB/TW endgame markup (SGF).**; snapshot is session-resolved with no SGF markup anywhere → red **Deterministic JTS from "auto-seeded" endgame markup.**; no resolution (Dead-Stone Gate) → the original gray text. Rendered at panel build time and refreshed at Run-click time from the exact snapshot being scored.

Verified with puppeteer against the repo (4 checks): no-markup fresh load → gray default; SGF with terminal DD/MA/TB/TW, no session → yellow "(SGF)"; SGF with DD/MA/TB/TW PLUS a persisted/closed scoring session (prov=`Manual Scoring session`) → still yellow "(SGF)"; no-markup game with an auto-seeded session → red "auto-seeded". `node --check` clean. Bump to v0.1.054 with changelog narrative; annotation_v4.js table (16,725 lines) updated; docs rebuilt and all version consumers synced.

---

### v0.1.053 — Dead-Stone Gate Open Scoring Modal Shortcut

#### Bug Fixes

| Scope | Type | Description |
| --- | --- | --- |
| **stones** | `fix` | Dead-Stone Gate Open Scoring Modal Shortcut |

##### Details
it closes the Estimation panel (⌘⇧E toggle) and then opens the Manual Scoring Modal

Inside the "No DD/MA/TB/TW Endgame Markup Found" gate card, clicking "Open Manual Scoring Modal" opened the modal while the Estimation panel stayed open underneath — inconsistent with the "See Scoring" button, which closes the panel first.

Fix: the `#btn-open-manual-scoring` click handler now mirrors the "See Scoring" handler exactly — stop propagation, invoke the same `runScoreEstimate()` toggle that ⌘⇧E triggers (removes the `#estimate-rich-panel`, clears the estimate map/dead X marks, resets the Estimate toolbar button, redraws the board) and THEN calls `openScoringModal()` — the same call behind the ⚑ Endgame Scoring shortcut, so the modal restores the latest saved/live scoring session identically.

Verified with puppeteer against the repo (3 checks): no-markup game at the final move → Run → Dead-Stone Gate card with the button shows; clicking it removes the `#estimate-rich-panel` (panel and Run button gone from the DOM) AND reveals the `#scoring-modal-overlay` (hidden class removed, display flex). `node --check` clean. Bump to v0.1.053 with changelog narrative; annotation_v4.js table (16,722 lines) updated; docs rebuilt and all version consumers synced.

---

### v0.1.052 — Computational Method JTS Source Indicator

#### Bug Fixes

| Scope | Type | Description |
| --- | --- | --- |
| **stones** | `fix` | Computational Method JTS Source Indicator |

##### Details
red "Deterministic JTS from \"auto-seeded\" endgame markup." when the compute runs off the Manual Scoring session (its auto-seeded dead-stone heuristic), yellow "Deterministic JTS from DD/MA/TB/TW endgame markup (SGF)." when the SGF itself declares DD/MA/TB/TW

When a game with no endgame markup had its Manual Scoring Modal opened (auto-seeded dead stones from the goscorer heuristic) and closed again, the Run control still carried the generic subtitle "Deterministic Japanese territory scoring from DD/MA/TB/TW endgame markup." — so the deterministic JTS appeared to be scoring from markup the SGF never actually declared.

Fix: the subtitle under "Run / Compute >" is now a source-aware `#scoring-source-note` driven by `resolveScoringInputs()`'s provenance. It is rendered at panel build time and refreshed at Run-click time from the exact snapshot being scored, so the label can never drift from the computation: provenance `Manual Scoring session` → red **Deterministic JTS from "auto-seeded" endgame markup.**; provenance `SGF endgame markup (DD/MA/TB/TW)` → yellow **Deterministic JTS from DD/MA/TB/TW endgame markup (SGF).**; no resolution (Dead-Stone Gate case) → the original gray text.

Verified with puppeteer against the repo (8 checks): fresh no-markup load → gray default note + gate fires; an SGF with terminal DD/MA/TB/TW markup → yellow "(SGF)" note + JTS computes and the note stays yellow after Run; opening/closing the MSM on a no-markup game (auto-seeds 15 dead stones, persists the session) → red "auto-seeded" note + JTS computes and the note stays red after Run. `node --check` clean. Bump to v0.1.052 with changelog narrative; annotation_v4.js table (16,717 lines) updated; docs rebuilt and all version consumers synced.

---

### v0.1.051 — Estimation Panel Close on Scoring Open

#### Bug Fixes

| Scope | Type | Description |
| --- | --- | --- |
| **stones** | `fix` | Estimation Panel Close on Scoring Open |

##### Details
Clicking "See Scoring" now closes the Estimation panel (exactly like pressing ⌘⇧E) and then opens the Manual Scoring Modal

After the "Run / Compute >" button morphs into "See Scoring", clicking it opened the Manual Scoring Modal while the Estimation panel stayed open underneath — the user had to close it manually to get back to the board.

Fix: the "See Scoring" click handler now closes the Estimation panel first by invoking the same `runScoreEstimate()` toggle that the ⌘⇧E keyboard shortcut triggers (removes the `#estimate-rich-panel`, clears the estimate map/dead X marks, resets the Estimate toolbar button, redraws the board) and THEN calls `openScoringModal()` — the same call behind the ⚑ Endgame Scoring shortcut, so the modal restores the latest saved/live scoring session identically. The panel is rebuilt fresh (back to "Run / Compute >") whenever the Estimate panel is closed and reopened or the move navigation changes.

Verified with puppeteer against the repo: load an SGF, jump to the final move, open the estimate panel → button reads "Run / Compute >"; clicking it morphs the text to "See Scoring" and the result block (Dead-Stone Gate card, no markup in the test game) still renders below; clicking "See Scoring" removes the `#estimate-rich-panel` (panel and Run button gone from the DOM) AND reveals the `#scoring-modal-overlay` (hidden class removed, display flex). `node --check` clean. Bump to v0.1.051 with changelog narrative; docs rebuilt and all version consumers synced.

---

### v0.1.050 — Computational Method Post-Run Scoring Button

#### Bug Fixes

| Scope | Type | Description |
| --- | --- | --- |
| **stones** | `fix` | Computational Method Post-Run Scoring Button |

##### Details
After running the Computational Method (Japanese Territory Rules), the "Run / Compute >" button becomes "See Scoring", which opens the Manual Scoring Modal exactly like the ⚑ Endgame Scoring shortcut

At game end, running the deterministic Japanese territory scorer once still rendered the full score detail inside the blue panel, but the green button above it stayed "Run / Compute >" — clicking it just re-ran the computation, with no quick way back to the Manual Scoring Modal from the result.

Fix: the first click on "Run / Compute >" runs the scorer exactly as before (dead-stone gate, incomplete-markup warning, and full score breakdown all unchanged — every path still renders its result below), then the button text morphs to "See Scoring". From then on, clicking it opens the Manual Scoring Modal through `openScoringModal()` — the same call behind the ⚑ Endgame Scoring shortcut, so the modal restores the latest saved/live scoring session identically. The panel is rebuilt fresh (back to "Run / Compute >") whenever the Estimate panel is closed and reopened or the move navigation changes.

Verified with puppeteer against the repo: load an SGF, jump to the final move, open the estimate panel → button reads "Run / Compute >"; clicking it morphs the text to "See Scoring" and the result block (Dead-Stone Gate card, no markup in the test game) still renders below; clicking "See Scoring" reveals the `#scoring-modal-overlay` (hidden class removed, display flex). `node --check` clean. Bump to v0.1.050 with changelog narrative; annotation_v4.js table (16,689 lines) updated; docs rebuilt and all version consumers synced.

---

### v0.1.049 — Board Border Override & Image Clipping

#### Bug Fixes

| Scope | Type | Description |
| --- | --- | --- |
| **renderer** | `fix` | Board Border Override & Image Clipping |

##### Details
max border size is hard-capped at 100%, and a board set from an image file is clipped to the 19×19 grid so it stays out of the border margin in every size and in repeat mode

The Border section's size slider previously allowed values well past 100%, which, combined with an image board, let the wood/texture bleed over — and a board image would always paint over the margin regardless of the chosen border color, so the picked border color never actually showed.

Fix: the Border size is now capped at 100% (the slider's `max` went 200→100 and the typed number input 300→100, with the style value hard-clamped to 0–100 on every write). The Border section gained an **Override** toggle (default ON): with Override ON the picked border color fills the margin exactly as before (image boards are clipped to the grid rect so they can never cover it), and with Override OFF the margin takes the board's own background — for a color board the board color extends into it, and for an image board the image fills the margin; the size stays adjustable in both modes, and 0% leaves no border beyond the 19×19 grid. The same clip/override logic was applied to the export renderer (`generateDiagramDataURL`) so exported diagrams behave identically.

Verified with puppeteer against the repo: override ON + image board → margin shows picked red, grid shows the image, outside-wood stays white canvas, repeat mode stays clean; override OFF → margin shows the image; size forced to 200 clamps to 100%; size 0 leaves no border band; the toggle flips `style.border.override`, the ON/OFF label and the dimmed color controls update, and typing 250 in the size field clamps to 100 in the style, input, and slider. Export renders show red bands on all four sides with Override ON (image confined to the grid) and the image filling the margin with Override OFF. `node --check` clean. Bump to v0.1.049 with changelog narrative; annotation_v4.js table (16,679 lines) updated; docs rebuilt and all version consumers synced.

---

### v0.1.048 — Manual Stone Placement Sound Effects

#### Bug Fixes

| Scope | Type | Description |
| --- | --- | --- |
| **stones** | `fix` | Manual Stone Placement Sound Effects |

##### Details
hand-drawn stones were the one silent path

v0.1.047 made every sound bulletproof (base64 data URIs + re-armed unlock), and replay sounded right, but drawing on the board by hand was still silent. Root cause: `recordMoveAt()` (the manual stone/play-mode placement path, annotation_v4.js:1133) commits the move and then calls `goToMove(state.currentMoveIndex)` to rebuild the display — but `goToMove` only plays the stone sound when the target is a **single-step forward** (`isSingleStepForward = index === state.currentMoveIndex + 1`, annotation_v4.js:10728), and `recordMoveAt` has already advanced `currentMoveIndex` before that call, so the rebuild is a zero-step refresh and never played anything. Manual stones were therefore the one board action with no sound while replay (`goToMove` ±1) clicked away.

Fix: a successful placement in `recordMoveAt` now plays `playSfx(stoneSound)` directly (right after the move is committed, before the display rebuild), and `removeLastMove()` (clicking the last stone again in play mode) plays `playSfx(removeSound)` — matching replay's forward=stone / backward=remove behavior exactly. Both sounds go through the same `playSfx` → `sfxGlobalPool` pipeline as everything else, so the v0.1.047 unlock and data-URI guarantees apply unchanged.

Verified with puppeteer against the repo: select `stone-b` → click board center → a stone is placed and an unmuted `stone` play resolves; `removeLastMove()` empties the cell and an unmuted `remove` play resolves; replay (`goToMove` forward after loading an SGF) still produces its unmuted stone play. `node --check` clean. Bump to v0.1.048 with changelog narrative; annotation_v4.js table (16,625 lines) updated; docs rebuilt and all version consumers synced.

---

### v0.1.047 — Embedded Base64 Sound Effects & Autoplay Resilience

#### Bug Fixes

| Scope | Type | Description |
| --- | --- | --- |
| **stones** | `fix` | Embedded Base64 Sound Effects & Autoplay Resilience |

##### Details
all six SFX are embedded as base64 data URIs and the autoplay unlock re-arms on every gesture until a real sound actually plays

The `_sfx` sound kept failing across browser updates and environments even though the files and code paths were verified intact. Two separate weaknesses made the old design permanently fragile, and both are now gone.

**1. SFX were file-based, so serving could silently kill them.** Every audio element was built from a `_sfx/*` file path — including the non-ASCII stone sample `碁石を打つ.mp3` — and each play depended on the file being fetched fresh from the HTTP cache on top of the service worker on top of GitHub Pages. Any one of those links failing (stale cache entry, SW serving a stale copy, an odd filename encoding on a given server/browser combo) produces a `readyState` stuck below `HAVE_ENOUGH_DATA`, so `play()` never makes a sound even though no JS error is thrown. Fix: all six sounds (`stone`, `remove`, `branch`/replay, `annot`, `annot_undo`, `brd_flip`) are now embedded directly in `annotation_v4.js` as base64 data URIs in a `SFX_BASE64` map (annotation_v4.js:15) and loaded through a `createSfx(dataUri, volume)` factory (annotation_v4.js:24) with `preload='auto'` + `load()`. A data URI is decoded in-memory by the browser — there is no file fetch, no cache, no SW, no filename encoding to fail. The `_sfx/*` files remain in the repo only as the source of truth (each embedded payload is byte-identical to its file, verified by decoding). The board-flip sound previously created a fresh `new Audio('_sfx/brd_flip.mp3')` on every click; it is now a single shared `flipSound` element, and the fast-forward stone pool builds from `SFX_BASE64.stone` instead of the file path.

**2. The unlock was one-shot, so one blocked first attempt killed sound for the whole session.** The old `unlockSfxOnFirstGesture()` removed its `pointerdown`/`keydown`/`touchstart` listeners after the **first** gesture no matter what, so if that first muted pre-play was blocked (autoplay policy, media-engagement drop, a file that hadn't loaded yet), the pre-unlock never ran again and no sound could ever play. Fix: the unlock is re-armed — `unlockSfxOnGesture()` (annotation_v4.js:397) stays attached on every gesture until a **real unmuted play has actually succeeded**, tracked by the `sfxUnlocked` flag which only `playSfx()` (annotation_v4.js:422) can set. All six elements live in one `sfxGlobalPool` so no sound can bypass the unlock; the muted pre-play pauses itself only if nothing else started playing (`audio.muted` is still true), so it can never cut off the very first sound the user triggers in the same gesture. `playSfx()` (unmute → restart → play → flip the flag on resolve) is now the only path that plays any SFX — every call site (stone, remove, annotation, annot-undo, branch replay, board flip, fast-forward pool) routes through it.

Verified with puppeteer against the repo (15 checks): all six pool elements use `data:` URIs and decode to the exact source byte sizes; **zero** network requests to `_sfx/` over a full session; a simulated autoplay block (all six muted pre-plays reject) on the first *and* second gesture leaves the unlock armed, then one real `playSfx(stoneSound)` resolves unmuted and flips `sfxUnlocked` so later gestures make no further play calls; clicking `btn-flip-pov` plays `flipSound` through `playSfx` and flips the board; the fast-forward pool creates from `SFX_BASE64.stone` (volume 0.4) and registers itself into `sfxGlobalPool`. `node --check` clean; no `new Audio('_sfx/…')` file paths and no direct `.play()` calls remain outside the two sanctioned paths.

---

### v0.1.046 — Session-Scoped Board Style Isolation

#### Bug Fixes

| Scope | Type | Description |
| --- | --- | --- |
| **stones** | `fix` | Session-Scoped Board Style Isolation |

##### Details
a Rec game's style no longer leaks into (or clobbers) the page-load initial-board setting

v0.1.045 stopped Resume from overwriting the page-load initial-board setting with the rec's stale snapshot, but in-session edits went the other way: while a Rec game was open, editing the game board style (toolbar inputs, Stone Set radio, Reset-to-default, Derive from source, board-size slider) wrote straight into `state.initialBoardStyle` and `baduk_initial_board_style`, so a customization made **during** a session clobbered the user's page-load setting. The result was two-way leakage between boards that should be independent: the empty page-load board and the active game board each ended up carrying the other's style, and a session could not even reopen with its own look after a hard refresh.

Fix: the main board now has a session-scoped style while a Rec game is active. `state.gameBoardStyle` holds the style the main board renders with during a session; every render site for the main board (`renderBoardToCtx`, `drawCellContent`, hover-stone ghosting, comment-coord highlight sizing, `getActiveStyleObject`) reads `getEffectiveInitialStyle()` — `gameBoardStyle` while `state.activeStudyId` is set, otherwise `initialBoardStyle` (annotation_v4.js:12984). Resume and the "Yes" (record) study flow load `gameBoardStyle` from the rec's own `settings.initialBoardStyle` so a session reopens looking exactly as left; in-session writes route through `setEffectiveInitialStyle()` (session → `gameBoardStyle`, else page-load `initialBoardStyle`) and `persistBoardStyles()` + `captureActiveRecSettings()` persist into the rec's settings while a session is active — never into `baduk_initial_board_style`. Paste, sample-load, and `loadSGF` clear the session + `gameBoardStyle` so the main board returns to the page-load style.

Browser-verified (puppeteer against the repo): set initial color `#aa1111` on page load → seed a Rec with initial `#333333` / study `#4444ff` / export `#00ff00` → resume → edit the game board to `#7722cc` and pick Stone Set B, hit Reset, and Derive-from-study. In-session edits update the game board and are saved into the rec (`rec.settings.initialBoardStyle` = `#7722cc` + set B) while `#aa1111` stays untouched in memory and in localStorage; after a hard refresh the empty board shows `#aa1111`, and re-opening the Rec shows the rec's own customized `#7722cc`. Fresh `loadSGF`/paste clears the game style back to the page-load `#aa1111`; editing with no Rec active still writes the page-load setting. All 23 style-routing harness checks + the v0.1.045 regression harness pass; `test_estimate.js` passes; `node --check` clean.

---

### v0.1.045 — Initial Board Style Preservation on Game Select

#### Bug Fixes

| Scope | Type | Description |
| --- | --- | --- |
| **sgf** | `fix` | Initial Board Style Preservation on Game Select |

##### Details
selecting a Rec Game no longer clobbers it

Setting the board style on the empty page-load board (via the floating panel), then selecting a Rec Game, then hard-refreshing showed the **game's** board style on the initial board instead of the setting made on page load. Root cause: every Resume applies `applyAppSettings(rec.settings)`, and that function **overwrote** `state.initialBoardStyle` from the rec's snapshot — the initial style captured during the rec's last play session, i.e. the "game play setting" — and **re-persisted** it to `baduk_initial_board_style`. So the moment a Rec Game was selected, the user's page-load initial setting was replaced (and written back to localStorage), and after a refresh the empty board showed the stale game-era style.

Fix in `applyAppSettings` (annotation_v4.js:1845): the initial board style is no longer restored from the rec snapshot — the initial page-load board (no game) always keeps the user's own persisted `initialBoardStyle`. The game-specific restores are untouched: `studyBoardStyle` (the study/game board appearance), `exportBoardStyle`, and the SGF replayer options are still applied so a resumed session looks exactly as the user left it. Behavior is unchanged for the common case where the persisted initial style already equals the snapshot's value (main-board styling writes to the same persisted key), so nothing that used to work regresses — only the stale-snapshot clobber is gone.

Browser-verified (puppeteer against the repo): set initial board color `#aa1111` on page load → seed a Rec whose snapshot carries initial `#333333` / study `#4444ff` / export `#00ff00` / replayer `showMoveNumbers:false` → select the Rec → hard refresh. Pre-fix: after selecting the Rec the persisted initial color became `#333333` and stayed after refresh (bug). Post-fix: `#aa1111` survives selection AND refresh, while study `#4444ff`, export `#00ff00`, and replayer options are still restored. `test_estimate.js` passes; `node --check` clean.

---

### v0.1.044 — Floating Style Palette Persistence

#### Bug Fixes

| Scope | Type | Description |
| --- | --- | --- |
| **stones** | `fix` | Floating Style Palette Persistence |

##### Details
unselecting a Stone Set now auto-expands the Custom Stones section even while the Stones accordion is open

When a Stone Set is selected (by default or from a previous session) the Custom Stones section is locked and collapsed, so the Stones accordion — which opens by setting a **fixed inline `max-height` measured at open time** (`initAccordion` at annotation_v4.js:13554) — measures itself *short* if it is opened in that state. Unselecting the stone set then expands the Custom Stones body to its full height, but the accordion's stale fixed `max-height` plus its `overflow: hidden` clipped the growth — the Custom Stones options looked like they never appeared.

Fix in `syncCustomStonesSection()` (annotation_v4.js:12663): on the expand path the body is measured at natural size (`maxHeight: none` → `scrollHeight`), the enclosing `.accordion-content`'s final `scrollHeight` is captured in the same frame, and both are started from zero together — the body animates `0 → bodyH` while the accordion re-fits `short → full`, so nothing is clipped. When the Stones accordion is closed at unselect time no re-fit is needed (a later open measures the already-expanded content correctly). The locked/collapsed behavior for an active stone set is unchanged.

Verified in a real browser (puppeteer against the repo): with stone set A persisted, opening the Stones accordion measures 148 px; unselecting expands the body to 545 px and re-fits the accordion to 693 px (== its `scrollHeight`, last control fully visible, body opacity 1) — pre-fix the 148 px clip hid the 545 px body entirely. Regressions pass: re-selecting a stone set re-locks and collapses the section, and clicking the Custom Stones header while locked does nothing.

---

### v0.1.043 — Dead Stone Replacement on Marked Intersection

#### Bug Fixes

| Scope | Type | Description |
| --- | --- | --- |
| **stones** | `fix` | Dead Stone Replacement on Marked Intersection |

##### Details
Replacing Dead Stones works on the dead-marked cell itself (freed point = territory), dame stays prohibited

v0.1.042 guarded the replace branch against clicking a cell that already carried a dead X — that guard over-reached: the dead-marked cell is itself a *territory point*. The dead stone was lifted, so its intersection reads as territory (the freed point) and a prisoner of that territory's color must be placeable there, exactly like on any other territory point. Blocking it meant the user literally could not fill the spots the physical ritual most wants to fill.

Behavior now:

- **A dead-marked cell fills like any other territory point.** Clicking a dead-white X (freed point = Black territory) places a BLACK prisoner; a dead-black X (freed point = White territory) places a WHITE prisoner. The stone that *was* on the clicked point stays a prisoner — its accounting is relocated from the mark set to the capture counter (`mark → capture` is a wash inside that side's prisoner total: dead white → `blackCaptures`, dead black → `whiteCaptures`, popped out of its `deadWhite`/`deadBlack` + transfer buckets). So the totals still drop by exactly 1 per player and the margin never moves — the same invariant as any plain territory fill.

- **Dame stays prohibited.** Any intersection whose territory is not defined (`terrColor === 0` — dame or seki) still refuses the replace: a dame fill would cost only the prisoner's side (−1) and drift the margin, and the physical count never fills neutral ground.

- **No prisoner → no fill.** A fill requires a prisoner of the territory's color (`deadBlack`/`deadWhite` bucket or the capture counter); with an empty pool the click does nothing.

- **Marks survive replacing (v0.1.057, extended in v0.1.058).** Filling any territory point pops the dead bucket for placement but leaves `markedDead`/`deadStonesInfo` untouched — the prisoner term in the score drops by decrementing the capture counter instead, so the `DD`/`MA` counts in SGF Properties never shrink while Replacing Dead Stones. v0.1.058 extends this to the dead-marked cell itself (the v0.1.043 exception is deleted: a fill into a dead-X cell keeps the X) and gates the tools behind the Lock stage; dead-X fills drop only the territory side while the mark keeps the stone a prisoner, and occupied cells are never counted as territory (`countTerritoryFromScores` + the score loop skip `board[y][x] !== 0`).

- **Undo covers captures.** `getScoringSnapshot`/`restoreScoringSnapshot` now capture and restore `blackCaptures`/`whiteCaptures` (they previously omitted them, so undoing any fill that consumed or relocated a capture left the counters out of sync with the restored board).

Headless-verified: the `replace_marked_dead.js` harness mirrors the modal's exact click + scoring path over a sandwich board (black box with 6 dead white inside, white box with 4 dead black inside, captures 4/2) — dead-white Xs read as Black territory and dead-black Xs as White territory; a fill on each succeeds, the fill cell ends occupied by the territory color with its dead mark cleared, and BOTH players drop by exactly 1 per fill (B 129→128→127, W 110→109→108, margin pinned at 19); a full sequence of marked-cell + plain-territory fills keeps the margin fixed with zero drift; a dame click is prohibited and leaves the state byte-for-byte unchanged. `test_estimate.js` passes; `node --check` clean.

---

### v0.1.042 — Scoring Margin Stability During Stone Replacement

#### Bug Fixes

| Scope | Type | Description |
| --- | --- | --- |
| **stones** | `fix` | Scoring Margin Stability During Stone Replacement |

##### Details
each prisoner fill drops BOTH players by exactly 1

The Manual Scoring Modal's *Replacing Dead Stones* tool fills a dead stone into the territory of its own color — click a Black-territory empty cell and a dead BLACK stone (one of White's prisoners) is placed there; click a White-territory cell and a dead WHITE stone (Black's prisoner) is placed there. The Go-domain score identity is `margin = (W_T + W_C) − (B_T + B_C)`, so the physical count must cancel exactly: filling a prisoner into the opponent's territory does `W_C − 1` (the prisoner is gone) **and** `B_T − 1` (the fill point is no longer territory) — the ±1 cancels and the margin never moves.

It was drifting by exactly 1 per fill. Root cause: the score formulas read the dead term from the **marks** (`markedDead`/`deadStonesInfo`), the true Life & Death set, but the replace branch consumed the stone by popping the dead-**bucket** counter (`deadBlack`/`deadWhite` + the `bucketWhite`/`bucketBlack` transfer) without clearing the corresponding mark. The bucket and the marks diverged, the dead term never dropped, and only the filler's territory −1 landed — the margin slid one point per replaced stone (harness: initial B 129 / W 110, margin 19 → after 10 fills B 119 / W 110, margin 9).

Fix in `annotation_v4.js`:

- **New `consumeDeadMarkFromState(ss, colorVal)` helper** (next to `countMarkedDeadStones`): clears exactly ONE dead mark of the given color — the last one in traversal, pairing with the bucket's LIFO pop — leaving the lifted cell empty so its freed point stays territory. Added to every consumption path: the `replace` branches of `placeScoringStoneByMode` (both colors) and the color-picker dialog's "Dead" source buttons. (Superseded in v0.1.057: the helper is deleted and replacement fills no longer clear marks — the prisoner term drops via the capture counter so `DD`/`MA` stay intact; see the v0.1.057 entry.)

- **Board-click replace branch**: on a fill it now also clears one matching dead mark, and two guards enforce the invariant physically — clicking a cell already marked dead is rejected (its freed point is already territory; filling it would re-place the stone and desync the bucket/mark pairing), and **dame is no longer fillable in replace mode** (dame belongs to neither player, so a dame fill costs only the prisoner's side −1 and the margin would drift; the physical count never fills dame). Fills are allowed only into the territory of the stone's own color.

- Undo/redo restore the cleared mark via the existing snapshot (`getScoringSnapshot`/`restoreScoringSnapshot` copy `markedDead` + `deadStonesInfo`), so a replace-then-restore cycle is exact.

Headless-verified: the `replace_invariance.js` harness mirrors the modal's exact scoring path (`territoryScoring` on `stonesWithDead`, manual-territory overrides, `countMarkedDead`, captures, komi) over a sandwich board (black box with 6 dead white inside, white box with 4 dead black inside, captures 4/2) — reproduces the pre-fix drift (margin 19 → 9 after 10 fills) and post-fix performs all 10 fills with margin 19 → 19 and each fill dropping BOTH players by exactly 1. All prior harnesses (komi SSOT, terr_gap, auto_seed_lift, result badge, reset_pristine, markup_warning, territory parity) + `test_estimate.js` still pass; `node --check` clean.

---

### v0.1.041 — JTS Dead Stone Freed Points Double-Count Fix

#### Bug Fixes

| Scope | Type | Description |
| --- | --- | --- |
| **stones** | `fix` | JTS Dead Stone Freed Points Double-Count Fix |

##### Details
JTS blue panel no longer double-counts dead-stone freed points (B+3 → B+2 parity with the MSM)

Same game, same saved session, two answers: the Manual Scoring Modal said **B+2** (territory 68/69) but the blue Computational Method panel said **B+3** (territory 73/73). Investigation proved the dead-stone *freed points* were counted **twice** in the blue panel's session path:

- `computeScoringPropsFromSession` derives the `TB`/`TW` lists from GoScorer, which treats marked-dead stones as transparent during flood-fill (goscorer.js:1416-1423) — so a dead stone's freed point is already territory and enters the `TB` list (dead *white* stones → Black territory) / `TW` list (dead *black* stones → White territory).

- `evaluateJapaneseTerritory` then counted `tbOnBoard.length`/`twOnBoard.length` (which already contained those 9 points) **and** re-added every dead stone's freed point by flood-fill owner (board-estimate.js:650-657). That loop was written for the SGF-markup path, where `TB`/`TW` only mark empty intersections and the freed points genuinely are absent from the lists.

The math matched the report exactly: 73 = 68 + 5 (five dead white stones) and 73 = 69 + 4 (four dead black stones) — a +9 territory over-count, all of it the 9 dead stones' freed points — which flipped the margin B+2 → B+3. The modal's 68/69 is the correct Japanese count (a dead stone counts once as a prisoner *and* its enclosed point counts once as territory).

Fix: the freed-point loop now skips any point already present in the explicit `TB`/`TW` lists. The SGF-markup path is unchanged (freed points still added exactly once), the flood-fill fallback is unchanged, and session-path territory now equals the modal exactly. Headless-verified: a synthetic board (6 dead white inside a black enclosure, 4 dead black inside a white enclosure) reproduces the pre-fix double count (JTS territory = modal + 6/+4) and, post-fix, JTS territory == modal territory on all three paths (session lists, SGF-style lists, flood-fill fallback); all prior harnesses + `test_estimate.js` pass; `node --check` clean.

---

### v0.1.040 — Mandatory DD/MA Prerequisite for JTS Score

#### Bug Fixes

| Scope | Type | Description |
| --- | --- | --- |
| **stones** | `fix` | Mandatory DD/MA Prerequisite for JTS Score |

##### Details
Missing DD/MA now REFUSES the JTS score (hard prerequisite), not just warns

v0.1.039 warned alongside the result; this hardens it. Resolved dead stones (`DD`/`MA`) are the true prerequisite for a correct Japanese-rules score — without them the scorer can only assume every stone is alive, which is not a Japanese score. The blue panel's Dead-Stone Gate now refuses whenever `snapshot.deadStones` is empty:

- **No markup at all** (`DD`/`MA`/`TB`/`TW` none) — unchanged amber gate: *"No DD/MA/TB/TW Endgame Markup Found"*.

- **TB/TW declared but dead stones absent** (the reported game) — NEW amber gate: *"No DD/MA Dead-Stone Resolution Found"* — *"This game declares TB/TW territory but no dead stones, so every stone would be assumed alive — no score is rendered for an unresolved Life & Death state."*

Both gates carry the **Open Manual Scoring Modal** button: mark the dead stones with the X tool, save, re-run — then the score renders (territory from explicit TB/TW or flood-fill, dead prisoners added). The incomplete-markup card from v0.1.039 now only ever appears for territory: when `DD`/`MA` are resolved but `TB`/`TW` are absent, the score still renders with flood-fill territory plus the "Not Defined in the SGF" card and its Define-in-MSM button. A completely unresolved position can therefore never silently produce a number again. Headless-verified: the gate condition (`!hasSgfMarkup || snapshot.deadStones.length === 0`), both gate titles/bodies, the MSM wiring on both buttons, and the surviving TB/TW-only warning card; helper + all prior harnesses + `test_estimate.js` pass; `node --check` clean.

---

### v0.1.039 — Endgame Markup Missing Warning & Resolution

#### Bug Fixes

| Scope | Type | Description |
| --- | --- | --- |
| **stones** | `fix` | Endgame Markup Missing Warning & Resolution |

##### Details
JTS warns when any DD/MA/TB/TW is missing and offers to define it in the MSM

The blue Computational Method panel computes a deterministic score from whatever endgame markup the SGF declares — but when the SGF declares only PART of it, the missing pieces are silently assumed. Example (the reported game): SGF had `TB`/`TW` but no `DD`/`MA`, so every stone was treated as alive and zero dead prisoners were added (`Scrubbed Dead: 0/0`); the score was still computed because the No-Markup Gate only fires when NONE of DD/MA/TB/TW exists. Now, whenever the scorer runs with any of the four missing, the panel appends an amber **"Incomplete Endgame Markup — Not Defined in the SGF"** warning listing exactly which elements are missing and the implication the scorer assumed:

- `Dead stones (DD/MA)` — no stone is treated as dead, so dead prisoners are not counted

- `Black territory (TB)` — computed by flood-fill instead of explicit markup

- `White territory (TW)` — computed by flood-fill instead of explicit markup

A **"Define in Manual Scoring Modal"** button opens the MSM so the user can mark the missing elements (dead stones with the X tool, territory via click) and re-run — turning an assumed score into the locked, exact Japanese score. The all-missing case still short-circuits in the existing No-Markup Gate (no score rendered at all); this warning only appears alongside a computed result. Verified headlessly: the real `buildScoringMarkupWarnings(snapshot)` covers TB/TW-only (warns DD/MA), DD/MA-only (warns TB+TW), complete (none), and empty (all three); source audit confirms the warning card, button id, and `openScoringModal` wiring; all prior harnesses + `test_estimate.js` still pass; `node --check` clean.

---

### v0.1.038 — MSM Reset Board SGF Terminal Rebuild

#### Performance Improvements

| Scope | Type | Description |
| --- | --- | --- |
| **stones** | `perf` | MSM Reset Board SGF Terminal Rebuild |

##### Details
MSM "Reset Board" now rebuilds the pristine SGF terminal, exactly like opening the file in goscorer

"Reset Board" promised a clean slate but produced a board that did not match the source game: it rebuilt from the main app's **current** position (not the SGF terminal) and then re-applied the recorded DD/MA/TB/TW markup (or the dead-stone heuristic) — marking stones dead and **lifting them off the board**. goscorer's test page (`lightvector.github.io/goscorer/web_test/test.html`) behaves differently: it loads the SGF and plays to the **last move** with **every stone present and zero dead marks** (dead marking is manual there), but its `TerritoryLayer` then overlays the **computed** territory — `territoryScoring(stones, markedDead)` with `markedDead` all-false — plus the score line. Verified from goscorer's source: `player.loadSgf(contents)` → WGo plays to the end; `markedDead` starts all-false; territory shading is an always-on computed layer, not marks.

1. **Reset is now the "re-open the file" action.** `resetScoringBoardFromState({ pristine: true })` (wired to both the Reset button and its confirm dialog) rebuilds the board from `replayToTerminal()` — the full SGF replayed to its last move, independent of where the user is in the move tree — with the replay's own in-game captures and the SGF's komi. No dead marks, no territory marks, no buckets — exactly the inputs goscorer's test page has after `Last` (it draws the SGF's final position and then overlays the COMPUTED territory from `territoryScoring(stones, markedDead)` with `markedDead` all-false). The modal draws the same computed overlay from the same inputs (`locScores = territoryScoring(stonesWithDead, markedDead, false)`, `showTerritory` on by default), so Reset shows the identical territory shading and score as the page — territory + 0 dead + game captures + SGF komi.

2. **First-open behavior is unchanged.** Opening the modal without a saved session still seeds from the game's recorded DD/MA/TB/TW (or the Sabaki dead-stone heuristic when none exists), so a fresh session still starts from the game's resolved Life & Death marks. Only the explicit Reset is pristine — the user can then mark dead stones manually, exactly as on the goscorer page.

(Verified: a harness extracts the real `resetScoringBoardFromState()` and drives both modes with stubs — pristine yields the replayed terminal with zero marks, replay captures, and SGF komi, and never calls `findEndgameMarkup`/`seedAutoDeadMarks`; first-open still runs the markup seed and (when no markup) the heuristic; the Reset handlers pass `{ pristine: true }`. Komi SSOT harness, `test_estimate.js`, the v0.1.034 lift harness, and the v0.1.035 badge harness all pass; `node --check` clean.)

---

### v0.1.037 — Komi SSOT Synchronization

#### Bug Fixes

| Scope | Type | Description |
| --- | --- | --- |
| **scoring** | `fix` | Komi SSOT Synchronization |

##### Details
every komi default is one named constant, zero literals left (REC 004)

v0.1.036 fixed the blue panel's `KM[0]`→6.5 slip, but an audit for remaining hardcoded `6.5` values found more: the codebase had **8 hardcoded `6.5` sites** in 3 files. Two were real drift risks and are fixed here; the rest are now routed through one constant.

1. **YSE yellow panel had its own third komi reader.** `runScoreEstimate` kept a private `let komi = 6.5` plus its own `parseFloat(state.sgfMetadata.km)` block — it never used the `extractSgfKomi()` resolver v0.1.036 introduced, only checked `sgfMetadata.km` (ignoring the `gameInfo` fallbacks), and carried its own default. It happened to keep `KM[0]` at 0 thanks to its `isNaN` guard, but three independent readers is exactly the drift shape that produced the v0.1.036 bug. It now calls `extractSgfKomi()` like every other surface.

2. **Legacy-session restore hardcoded 6.5.** `restoreScoringFromSavedData` used `data.komi != null ? data.komi : 6.5` — a saved session missing a komi field was forced to 6.5 even when the SGF says `KM[0]`. The fallback is now `extractSgfKomi()`, so a zero-komi game restores as zero.

3. **One named default.** `const DEFAULT_KOMI = 6.5` is now the *only* `6.5` literal in the scoring paths: `extractSgfKomi()`'s fallback and the `scoringState` initial value reference the constant directly. The `board-estimate.js` library still has `komi = 6.5` as its public API default params (`getScore`/`estimate`/`evaluateJapaneseTerritory`), which is intentional and inert — every app caller passes komi explicitly, so they never fire in-app.

(Verified: the komi harness now also audits the source — it asserts zero `6.5` literals survive outside `DEFAULT_KOMI`, the YSE panel routes through `extractSgfKomi()`, and the legacy restore falls back to it; all 7 komi cases, the B+31.5→B+38 reproduction, `test_estimate.js`, the v0.1.034 lift harness, and the v0.1.035 badge harness all pass; `node --check` clean.)

---

### v0.1.036 — Komi 0 SGF Parsing Fix

#### Bug Fixes

| Scope | Type | Description |
| --- | --- | --- |
| **stones** | `fix` | Komi 0 SGF Parsing Fix |

##### Details
Komi 0 in the SGF no longer turns into a default 6.5 (REC 004)

REC 004 ships `KM[0]` — a no-komi game — yet the blue Computational Method panel computed `White Total = 8 + 2 + 6.5 = 16.5` and reported **B+31.5**. The SGF's komi was being read through a `parseFloat(km) || 6.5` default: `parseFloat('0')` is `0`, which is **falsy**, so a legitimate zero-komi game fell through to the 6.5 fallback. The modal's own session init had always parsed komi with an `isNaN()` guard (0 stays 0), so the two surfaces disagreed on a real zero.

1. **One falsy-`0` slip in the blue panel's komi default.** `resolveScoringInputs` initializes the snapshot with `parseFloat(state.sgfMetadata.km) || 6.5`. The `|| 6.5` is only meant to catch an unparsable/missing value, but `0` is falsy too — so `KM[0]` was silently upgraded to 6.5, inflating White by 6.5 and deflating Black's margin by the same amount (B+31.5 instead of the correct B+38). The modal never had this bug, which is why REC 002's parity drive did not catch it: both surfaces agreed on the *sources* (session vs SGF), but the blue panel's default corrupted a real zero.

2. **The fix — one SSOT komi resolver, isNaN-guarded.** A new `extractSgfKomi()` now owns komi extraction from the SGF (`state.sgfMetadata.km`, then `state.gameInfo.km/KM/komi`) with an `isNaN(parseFloat(...))` guard so `0` survives and only missing/garbage falls back to 6.5. Both the blue panel's `resolveScoringInputs` and the modal's session init call the same function — the modal's inline extraction is gone, so the two surfaces structurally cannot drift on komi again (SSOT-and-Synced).

(Verified: a harness extracts the real `extractSgfKomi()` source from annotation_v4.js and asserts `KM[0]` → 0, `KM[0.0]` → 0, `KM[6.5]` → 6.5, `KM[7.5]` → 7.5, `gameInfo.KM[0]` → 0, no komi → 6.5, garbage → 6.5; it also reproduces the exact report arithmetic — pre-fix `B+31.5`, post-fix `B+38`. `test_estimate.js` passes; terr_gap still reports MSM B10 == JTS B10 MATCH; the v0.1.034 dead-stone lift and v0.1.035 result-badge harnesses still pass; `node --check` clean.)

---

### v0.1.035 — Scoring Modal Result Badge Formula Parity

#### Bug Fixes

| Scope | Type | Description |
| --- | --- | --- |
| **stones** | `fix` | Scoring Modal Result Badge Formula Parity |

##### Details
Scoring Modal result badge now always equals the formula shown (REC 002)

A user reported the modal displaying `Black 51 (territory) + 6 (dead) + 0 (caps) = 57` / `White 57 (territory) + 0 (dead) + 4 (caps) + 0 (komi) = 61` next to a **`W+6`** badge — but 61 − 57 is 4, so the badge should read `W+4`. The two displays were computing from **different** state, and the split only shows up after Replacing / Re-Arranging stones.

1. **The formula is live; the badge was anchored — so they drifted.** The per-color Computing formula (territory + dead + caps + komi) reads the *display* board (`scoringState.board`) and the *editable* captures (`blackCaptures`/`whiteCaptures`), so every Replace/Re-arrange edit is reflected immediately. The result badge (`scoring-result-display`), anchored since v0.1.028, instead read `baseBoard` (untouched position) + `baseCaptures` (captures at session start). In the reported session White had captured 6 black stones in-game; the user Replaced 2 of them back onto the board, dropping live `whiteCaptures` 6 → 4. The formula showed 61 (W+4 arithmetic) while the badge — still on the original `baseCaptures.W = 6` — showed `W+6`. Same story for territory after a Re-arrange moved stones: the badge ignored the corrected position.

2. **The anchor was the wrong tool for the job.** v0.1.028/029 anchored the badge so Replace/Re-arrange "could never move the game's real result", but that produced a modal whose own arithmetic disagreed with its headline — a contradiction the user cannot resolve. Re-arranging/Replacing is the user *correcting* the board; the definitive Japanese score (territory + dead prisoners + captures, per the scoring domain goal) must reflect that correction.

3. **The fix — one live source of truth for the score.** Every reader now computes from the same live session:

- The modal's result badge reads `scoringState.board` + live `blackCaptures`/`whiteCaptures` — identical inputs to the formula, so the badge is the formula's arithmetic by construction.

- `computeScoringPropsFromSession` derives `DD`/`MA`/`TB`/`TW` from `session.board` (not `baseBoard`), so the blue-panel Run score, the saved markup, and the modal all reflect the last-edited board.

- `resolveScoringInputs` feeds the session's live captures (not `baseCaptures`), keeping blue-panel ⇄ modal parity.

- `baseBoard`/`baseCaptures` are retained in the snapshot only as the untouched-position seed `seedAutoDeadMarks` reads on first entry; they no longer drive any score.

(Verified: an arithmetic harness reproduces the exact report — formula `W+4`, anchored badge `W+6` — and shows the live badge matching the formula precisely; `test_estimate.js` passes; terr_gap still reports MSM B10 == JTS B10 MATCH; the v0.1.034 dead-stone lift harness still passes; `node --check` clean.)

---

### v0.1.034 — Auto-Detected Dead Stones Lift Parity

#### Bug Fixes

| Scope | Type | Description |
| --- | --- | --- |
| **stones** | `fix` | Auto-Detected Dead Stones Lift Parity |

##### Details
Auto-detected dead stones now lift off the board exactly like manual marks (REC 002)

The initial auto-detect (`seedAutoDeadMarks`) and the recorded-markup seed (`applyMark`) marked stones dead **without lifting them**: `markedDead`/`deadStonesInfo`/the buckets said "dead", but `scoringState.board` still held the stone — so the board drew a stone with a red X on top of it, while a manually clicked dead mark lifts the stone to an empty intersection and draws the X there. That inconsistency surfaced in **Replacing Dead Stones / Re-Arranging Stones**: a Replace click popped a `deadWhite` entry to place a prisoner while the "dead" stone itself was still sitting on the board, and a Re-arrange click on such a stone collected it into the rearrange bucket **on top of** its existing dead-bucket entry — the same stone counted in two buckets.

1. **Manual marks lift; the seeds didn't.** `handleScoringBoardClick` sets `board[r][c] = 0` (annotation_v4.js:15659) when a stone is clicked dead. `seedAutoDeadMarks` and the `applyMark` seed only wrote `markedDead` + `deadStonesInfo` + the bucket stacks, leaving the display cell full. The comment at the seed sites claimed "behave EXACTLY like manually clicked marks" — the lift was the missing half.

2. **The fix — every dead-mark seed lifts, and restore self-heals.** All three `markedDead = true` write sites now also zero the display cell (the canonical `baseBoard` snapshot never changes, so the game's final result and saved `DD`/`MA`/`TB`/`TW` stay anchored):

- `seedAutoDeadMarks` — the goscorer heuristic auto-detect lifts each detected dead stone.

- `applyMark` — the `DD`/`MA`/`TB`/`TW` markup seed lifts each recorded dead stone.

- `restoreScoringFromSavedData` — self-heals sessions saved before this fix (same pattern as the v0.1.032 restore rebuild): any stone sitting at a `markedDead` position is lifted on restore.

3. **Scores are unchanged by design.** GoScorer already reconstructs `stonesWithDead` from `deadStonesInfo` at lifted positions, so the territory/prisoner computation sees the identical board whether the dead stones were lifted or not. The change is purely visual (X on an empty intersection, stone in its bucket) and in Replace/Re-arrange bookkeeping (no more double-sourced stones).

(Verified: a 5×5 ring harness — auto-detect lifts all 9 dead white stones while `baseBoard` stays intact, the lifted mark is display-identical to a manual click, the markup seed lifts + still dedupes to 9, the restore self-heal lifts a legacy persisted board, and the `stonesWithDead` reconstruction is byte-identical lifted vs not-lifted; `test_estimate.js` passes; terr_gap harness still reports MSM B10 == JTS B10 MATCH; `node --check` clean.)

---

### v0.1.033 — Version-Driven Script Cache Busting

#### Bug Fixes

| Scope | Type | Description |
| --- | --- | --- |
| **stones** | `fix` | Version-Driven Script Cache Busting |

##### Details
Version-driven script cache-busting (why the YSE fix "didn't take")

After v0.1.030 isolated the Score Estimate, the yellow panel **still** replayed the recorded `TB`/`TW` on the final move of a saved REC. The source was already correct — the browser was running a **stale copy of the JavaScript**.

1. **The source never feeds territory to YSE anymore.** `runScoreEstimate` passes empty `territoryBlack`/`territoryWhite` into `BoardEstimate.estimate`, which only short-circuits its AI when those arrays are non-empty; `deadstones.guess` is seeded with `Date.now()`, so a fresh YSE genuinely varies per run. The "fixed output matching the recorded markup" symptom is precisely the pre-v0.1.030 behavior.

2. **The browser HTTP cache kept serving the old script.** Every `<script>` tag in `index.html` carried a hard-coded cache-buster (`annotation_v4.js?v=4.3`, `board-estimate.js?v=1.0`, …) set once in the initial commit and **never bumped** across a dozen releases. The service worker is network-first, but the browser's own HTTP cache can answer `annotation_v4.js?v=4.3` with the pre-fix body it stored — so the page ran the old estimator even though the file on disk had changed. This also explains why the ×12 dead-bucket bug stayed visible after v0.1.032.

3. **The fix — tie cache-busting to the release version (SSOT).** `sync-docs.js`'s `syncVersion()` now also rewrites every `<script src="*.js?v=…">` to `?v=<version>` from the `SITEMAP.md` frontmatter. Bumping only the `version:` field forces every browser to fetch fresh JavaScript on that release — no stale body can survive a reload. The service worker's network-first fetch then always reaches the current file.

(Verified: `node sync-docs.js` rewrites all nine script `?v=` params to the frontmatter version; `node --check` clean.)

**User action:** reload the page once after this release — the new `?v=0.1.033` URLs guarantee a fresh fetch, and the YSE on the final move will run its own random AI estimation again.

---

### v0.1.032 — Scoring Modal Dead Stone Bucket Double-Count Fix

#### Bug Fixes

| Scope | Type | Description |
| --- | --- | --- |
| **stones** | `fix` | Scoring Modal Dead Stone Bucket Double-Count Fix |

##### Details
Scoring Modal buckets no longer double-count dead stones (REC 002)

After v0.1.031 closed the blue-panel ⇄ modal score gap, the Scoring Modal's **Stone Buckets** still showed an inflated dead count: 6 White stones marked dead on the board appeared as **Dead: × 12** in Black's bucket. The score itself was already correct — this version fixes the bucket display (and the replace-availability counts) at its source.

1. **The score was never wrong, because it never reads the buckets.** The computing formulas and the Final read `countMarkedDeadStones` over the canonical `markedDead` grid — the game's true Life & Death set — so 6 dead White stones always counted once there (the v0.1.028 "marks, not buckets" principle).

2. **The bucket pills display the stack arrays, which the markup seed double-filled.** `updateScoringUI` renders the Black bucket's *Dead:* pill from `scoringState.deadWhite.length`, and `resetScoringBoardFromState` seeds those stacks by calling `applyMark` four times — `DD`, `MA`, `TB` (marks opponent stones inside declared territory dead), `TW`. That seed had **no duplicate guard**: a dead White stone that appears in both the `DD`/`MA` dead list *and* inside the `TB` Black-territory bounds was pushed into `deadWhite`/`bucketBlack` **twice** → 6 stones became × 12. Manual clicks and the auto-seed (`seedAutoDeadMarks`) already guard with `!markedDead`; the markup seed was the only path that didn't.

3. **Two fixes, both mirroring "the marks are canonical":**

- **Seed dedupe** — `applyMark` now skips any point already in `markedDead`, so the four markup passes can never double-push a stone that legitimately belongs to more than one list (dead + enclosed-by-territory).

- **Restore self-heal** — `restoreScoringFromSavedData` rebuilds `deadWhite`/`deadBlack` from `markedDead`/`deadStonesInfo` instead of trusting the persisted arrays, so sessions saved before this fix show the true count on reopen (the bucket arrays are pure mirrors of the marks, so this is always exact).

(Headless-verified: a 5×5 ring harness where the same stones sit in both the dead list and the territory bounds shows the bucket count matching the marks (was 2× before the guard); the restore-rebuild path turns a persisted 18-entry stack for 9 marks back into 9; `test_estimate.js` passes; `node --check` clean.)

---

### v0.1.031 — Blue Panel & Scoring Modal Synchronization

#### Bug Fixes

| Scope | Type | Description |
| --- | --- | --- |
| **stones** | `fix` | Blue Panel & Scoring Modal Synchronization |

##### Details
dead-stone points now count as territory (REC 002)

The blue Computational Method (JTS) and the Manual Scoring Modal (MSM) must read the **same** Japanese score for a saved record. On REC 002 they did not: JTS showed Black territory 43 with a W+11 result, while MSM showed Black territory 49 → W+5. The two surfaces agreed on arithmetic (territory + prisoners + komi) but disagreed by exactly **6** on Black territory — and that 6 is precisely the number of White stones marked dead. This version closes the gap at its source.

1. **MSM counts a scrubbed dead stone's point as territory; JTS did not.** MSM's territory tally runs `territoryScoring` (GoScorer) over the board with dead stones lifted — a White stone marked dead becomes a Black prisoner **and** its intersection is counted as Black territory (49 total). JTS's blue panel, by contrast, counts territory from the explicit `TB`/`TW` point lists the session converter (`computeScoringPropsFromSession`) writes. That converter only marks **empty** intersections — `if (row[c] !== 0) continue;` — so a cell still holding a stone was never emitted as a territory point. The 6 dead White stones were therefore missing from `TB` → Black territory 43. Both surfaces then summed the same way, so the 6-point hole surfaced as a 6-point score difference (W+11 vs W+5).

2. **Japanese rules side with MSM.** A stone marked dead is captured; its point is enclosed by the opponent and becomes opponent territory. So the dead-stone cells belong in Black territory, and the blue panel was shortchanging Black by exactly the dead count.

3. **The fix — count freed dead-stone points in the explicit path.** `evaluateJapaneseTerritory` already scrubs dead stones from its working grid before scoring. When it counts an explicit `TB`/`TW` list (which knows nothing about the dead stones' points), it now also flood-fills the scrubbed grid and adds each scrubbed dead stone's freed point as territory for its enclosing color — a freed point in a mixed (dame) region stays uncounted. The flood-fill owner map is computed once and shared, so the markup-less fallback path is unchanged.

(Verified: a 5×5 harness with one dead White stone inside a Black ring previously reported JTS Black territory 8 vs GoScorer's 9 — now 9 == 9 with full totals matching (MSM 10 == JTS 10); `test_estimate.js` passes; `node --check` clean.)

For REC 002 this changes the blue panel from Black 43 / W+11 to Black 49 / W+5, matching the modal.

---

### v0.1.030 — Score Estimate & Computational Method Integration

#### Bug Fixes

| Scope | Type | Description |
| --- | --- | --- |
| **stones** | `fix` | Score Estimate & Computational Method Integration |

##### Details
YSE now always runs its own estimation

The yellow Score Estimate (YSE) and the blue Computational Method (JTS) must always compute **separately** — JTS scores recorded markup, YSE estimates on its own. They were not: on the last move of a saved study record, YSE silently stopped estimating and replayed JTS's recorded territory as a fixed value. This version breaks that link at the one point where it could form.

1. **YSE varies per run because its AI is seeded randomly.** `deadstones.guess` seeds its Monte Carlo search with `Date.now()` (deadstones.bundle.js), so every Estimate gets a different dead-stone map — that is the "gives a different estimation each time" behavior. `board-estimate.js` has no randomness of its own, so a **fixed** YSE output can only mean the AI never ran.

2. **On the last move, YSE stopped estimating and replayed recorded territory.** `runScoreEstimate` read the last move's `territory` (`TB`/`TW`) from `state.sgfMoves[last]`, and `BoardEstimate.estimate` short-circuits the whole AI whenever `territoryBlack`/`territoryWhite` are non-empty — it builds the map purely from those recorded points. Deterministic. Fixed.

3. **That recorded territory IS the JTS source.** Since v0.1.026, `saveScoringResult` writes the scoring session's `DD`/`MA`/`TB`/`TW` into `rec.workingSgf`; on resume, `loadSGF` parses them back into the last move's `.territory`. The "fixed" last-move value was literally the markup JTS produced — JTS writes, YSE consumes. The recorded-territory read itself is ancient (initial commit) but stayed dormant while saved games carried no `TB`/`TW`; it activated once saves began writing territory into the SGF, which is why the interference only appeared recently.

**Not a culprit:** `DD`/`MA` never reach `estimate()` — only `TB`/`TW` can short-circuit it. So the fix needed to stop feeding recorded territory, and nothing else.

**The fix — isolation at the single feed point:** `runScoreEstimate` no longer passes recorded `baselineTerritory`/`move.territory` into `estimate()` — `territoryBlack`/`territoryWhite` are always empty, so YSE **always runs its own AI + influence estimation**, regardless of any `TB`/`TW` in the SGF or saved by a scoring session. `BoardEstimate.estimate` has exactly one caller, so no other surface changes behavior.

(Verified: `node --check` clean; `test_estimate.js` passes; with empty territory `estimate()` runs the AI path.)

---

### v0.1.029 — Blue Panel & Modal Capture Parity

#### Bug Fixes

| Scope | Type | Description |
| --- | --- | --- |
| **stones** | `fix` | Blue Panel & Modal Capture Parity |

##### Details
Blue-panel ⇄ Modal-final capture parity (REC 002)

Closes the last parity gap between the blue "Computational Method" Run score and the Manual Scoring Modal's FINAL badge. When a saved scoring session exists, the blue panel and the modal's Final now derive from the **same canonical captures**:

1. **The blue panel reads `baseCaptures`, not the editable capture fields.** The modal's FINAL badge (`scoring-result-display`) is anchored to `baseCaptures` — the game's actual captures, which Replace/capture edits (`blackCaptures`/`whiteCaptures`) never move. `resolveScoringInputs` previously fed the session's editable `blackCaptures`/`whiteCaptures` into `BoardEstimate.evaluateJapaneseTerritory`, so after the user replaced captured stones the blue panel showed a different total than the modal's Final (e.g. `W+7.5` vs `W+6.5`). The resolver now mirrors the Final's expression verbatim: `baseCaptures` wins, legacy sessions without `baseCaptures` fall back to `blackCaptures`/`whiteCaptures` (identical to `restoreScoringFromSavedData`'s fallback), so the two surfaces can never drift on the captures term.

(Headless-verified: 23 harness scenarios — the new scenario W asserts a saved session carrying both `baseCaptures: {0,0}` and editable `blackCaptures: 3 / whiteCaptures: 4` feeds the scorer `0/0` — plus 10 regression probes; Probe J reverts the resolver to the editable fields and W fails.)

---

### v0.1.028 — Manual Scoring Modal Workflow

#### Bug Fixes

| Scope | Type | Description |
| --- | --- | --- |
| **stones** | `fix` | Manual Scoring Modal Workflow |

##### Details
goscorer auto-dead seeding + canonical Final anchor

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

---

### v0.1.027 — Manual Scoring Snapshot Persistence & SGF Sync

#### Bug Fixes

| Scope | Type | Description |
| --- | --- | --- |
| **stones** | `fix` | Manual Scoring Snapshot Persistence & SGF Sync |

##### Details
Manual Scoring snapshot persistence + session ⇄ SGF sync (single source of truth)

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

---

### v0.1.026 — Unified Scoring Input Resolution

#### Bug Fixes

| Scope | Type | Description |
| --- | --- | --- |
| **stones** | `fix` | Unified Scoring Input Resolution |

##### Details
Unified scoring-input resolution (blue panel ⇄ Manual Scoring parity)

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

---

### v0.1.025 — Algorithmic Endgame Markup Resolution

#### Bug Fixes

| Scope | Type | Description |
| --- | --- | --- |
| **stones** | `fix` | Algorithmic Endgame Markup Resolution |

##### Details
Algorithmic Endgame Markup Resolution + Fresh Manual Scoring

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
| `index.html` | 2,641 | Main HTML — all UI layout, floating panels, study modal, canvas elements, game tree, ref-Area/ref-Point buttons. v0.1.081: the 8 SGF Properties code-font spots (~1918-1959) swap Courier New → `'GoogleSansCode', 'GoogleSansCodeProp', monospace`, the Manual Scoring Modal root (1668) and kifu status hint (2050) adopt the site-wide `'Anthropic Sans'` body stack, cache-busters to 0.1.081 / `annotation.css?v=4.3`; v0.1.083: the MSM left sidebar (1704-1706) rides at `position: relative; z-index: 101` above `#scoring-frozen-overlay` (z-index 100) so the Display Options stay clickable in the frozen "Board Saved ✓" state while the board stays overlay-locked, cache-busters to 0.1.083; v0.1.085: cache-busters to 0.1.085 |
| `annotation_v4.js` | 17,807 | Main app — state, SGF parsing, board rendering, canvas drawing, event listeners, export, capture animation, comment coord highlights, hoshi highlights, ref-Area/ref-Point modes, SGF comments toggle, study-record resume (loads `workingSgf` as-is via `loadSGF`), algorithmic endgame-markup resolution (`findEndgameMarkup` searches current move → full/filtered sequences → root props → raw main line → saved scoring session), unified scoring-input resolution (`resolveScoringInputs`: live session → saved `rec.scoringData` → SGF markup; consumed identically by the Run panel and the modal for exact blue-panel ⇄ modal parity), score-estimate isolation (`runScoreEstimate` never feeds recorded `TB`/`TW` territory into `estimate()`, so YSE always runs its own AI + influence estimation), terminal-markup fold over all annotation-only nodes after the last move, Computational Method blue panel with "Run / Compute >" control (shown only at Game End; DEAD-STONE GATE: refuses a score — not merely warns — whenever no dead stones are resolved, both for no markup at all *"No DD/MA/TB/TW Endgame Markup Found"* and for TB/TW-only *"No DD/MA Dead-Stone Resolution Found"*, each with an Open Manual Scoring Modal button; with DD/MA resolved, territory missing TB/TW renders via flood-fill plus the amber "Incomplete Endgame Markup — Not Defined in the SGF" card from `buildScoringMarkupWarnings(snapshot)` with a Define-in-MSM button; the modal restores the latest persisted/saved session and seeds dead stones from `DD`/`MA`/`TB`/`TW`; after the first Run the button morphs into "See Scoring", which closes the Estimation panel like ⌘⇧E and opens the Manual Scoring Modal like the ⚑ Endgame Scoring shortcut), v0.1.071 komi default-tag fix (`openScoringModal` writes the SGF komi + `" (default)"` to `#scoring-komi-default-tag` on every open — restore AND first-entry — so a reopened saved D&T session shows the real SGF komi instead of the static HTML `0 (default)`) and Canvas BG picker (`DEFAULT_INITIAL_BOARD_STYLE.bg`, `#ib-canvas-bg-color` wired through `populateStyleInputs`/`bindStyleInputsEvents` with a `data-section="bg"` reset, section renamed "Board, Border & BG"; `renderBoardToCtx` fills with `style.bg.color` only for the initial and study canvases — export/scoring stay white), LOCK STAGE (v0.1.058: Mark Dead Stones + Mark Territories are the mandatory first stage — `#btn-scoring-lock` commits `buildLockedSnapshot()` and flips `scoringState.locked`, Replace/Re-arrange render disabled-but-visible with the `#scoring-lock-hint` until locked, SGF files carrying `DD`/`MA`/`TB`/`TW` pre-engage the lock on open, while locked the SGF Properties bars freeze to the locked snapshot (`updateSgfPropBarsUI` reads `lockedSnapshot` when locked) with the `#sgf-prop-lock-badge`; the parked-click `pendingLockEdit` flow is gone in v0.1.060 — Mark Dead + Mark Territories are disabled while locked, so `confirmScoringUnlock` = `applyUnlockReset()` and `cancelScoringUnlock` only closes the dialog), LOCKED SCORE IS FROZEN (v0.1.059: the computation is DONE at Lock — `computeScoringSummary(ss)` is the single read-out SSOT for both the section-8 formula and the `#scoring-result-display` badge, selecting the `lockedSnapshot` when locked so neither can move; v0.1.060 makes the post-lock tray a cosmetic MIRROR of the ritual — the tray buckets render from the live `scoringState`, a post-lock replace fill again consumes a prisoner (Dead pile pop + capture-counter decrement), re-arrange pickup/placement again moves stones between the Re-arrange and Dead piles, the dialog Dead-source buttons and `placeScoringStoneByMode` mutate normally, and clear-buckets is live — while the displayed score never moves and Save/`computeSgfPropertyBars`/Run still serialize the `lockedSnapshot` board/props; `applyScoringLock` records `lockBoundaryIndex` and RETAINS the pre-lock history while `undoScoring` caps there (never a pre-lock board) and `applyUnlockReset` truncates back to the boundary, so Reset → Unlock → Undo×N walks to the pristine terminal; Reset Board while locked restores only the post-D&T resolution with a dynamic `#scoring-reset-confirm-msg`; rule-mode select, komi input/±0.5, and clear-buckets are no-ops while locked; `restoreScoringFromSavedData` backfills `komi` onto legacy snapshots), 2-STEP MANUAL SCORING SAVE (v0.1.061: Lock Score now OWNS the SGF write — `applyScoringLock` → new `writeScoringPropsToSgf()` writes the committed `DD`/`MA`/`TB`/`TW` into the terminal node (`unknownProps` + direct fields), sets `state.isSgfDirty`, regenerates `rec.workingSgf`, persists the record, and lights `#sgf-prop-bars-save-badge`; Save Board is memory-only — `saveScoringResult` renamed `saveScoringBoard()` captures `_savedBoardSnapshot = captureLiveBoardSnapshot()` (playground board + dead/rearrange stacks + captures), finalizes `_scoringDirty=false`/`_scoringHasSaved=true`/`setScoringFrozen(true)`, persists `rec.scoringData = buildScoringSessionSnapshot()` (now carrying a `savedBoard` field), and NEVER touches the SGF; `restoreScoringFromSavedData` restores the playground exactly (skipping the rebuild-from-marks and stone-lift self-heal) while the frozen score, bars, and Run keep reading the `lockedSnapshot`; `_savedBoardSnapshot` is cleared by `applyUnlockReset`, `resetScoringBoardFromState` (which also persists via the new `persistScoringSessionData()`), and a fresh `loadSGF` (which now also resets `locked`/`lockedSnapshot`/`lockBoundaryIndex`/`frozen`/`_scoringDirty`/`_scoringHasSaved`); `applyScoringLock` + `applyUnlockReset` both call `updateScoringSaveButton()` so Save Board is enabled only while locked; buttons relabeled Lock Score / Reset Score → 🔓 Unlock Score? / Reset Board, Save → "Save Board" / "Board Saved ✓"), SYMMETRIC MODE GATING (v0.1.060: `updateScoringUI` disables Mark Dead Stones + Mark Territories when locked and Replace + Re-arrange when unlocked, with a forced fallback snapping the interaction mode to `'replace'` when locked / `'mark'` when unlocked, and `#scoring-lock-hint` is always visible — "🔒 Lock dead stones & territory to enable Replacing / Re-arranging." unlocked / "🔓 Unlock to edit dead stones & territory." locked), MARKS NEVER CLEAR (v0.1.058 deletes the v0.1.043 dead-X exception: every replace/re-arrange fill keeps `markedDead`/`deadStonesInfo`, the dead X renders over the placed prisoner, and occupied cells are excluded from territory in `countTerritoryFromScores` and the `renderScoringBoardToCtx` score loop — `ss.board[y][x] !== 0` — so a filled dead-X point reads as a stone in every read-out), explicit `DD`/`MA`/`TB`/`TW` scoring, dead-bucket dedupe in markup seeding + restore-time rebuild from marks (buckets always mirror the canonical `markedDead` set), dead marks LIFT the stone off the display board in every seed path — auto-detect, markup seed, and restore self-heal — exactly like a manual click, so Replace/Re-arrange never see the same stone on the board and in its bucket, **Replacing Dead Stones is margin-invariant AND never erases dead marks from SGF Properties** (a fill consumes a prisoner by popping the dead bucket as before, but the `markedDead`/`deadStonesInfo` marks are preserved and the prisoner term drops via the capture counter — `whiteCaptures`/`blackCaptures` decremented per fill — so both players still lose exactly 1 and the margin stays pinned while the `DD`/`MA` counts derived from the marks stay at their full pre-fill values; dame/seki with undefined territory and cells with no prisoner of the territory's color are PROHIBITED, so the final margin never moves — since v0.1.058 even a fill into a dead-marked cell keeps the mark (the v0.1.043 `mark → capture` relocation is deleted), undo snapshots now capture `blackCaptures`/`whiteCaptures` too, result badge computed from the SAME live state as the Computing formula (display board + live captures; `baseBoard`/`baseCaptures` only keep the untouched-position reference), SSOT komi (`DEFAULT_KOMI` is the only 6.5 literal; `extractSgfKomi` reads the SGF with an `isNaN` guard so `KM[0]` stays 0 — shared by the modal session init, legacy restore, YSE panel, and blue-panel snapshot), "Reset Board" rebuilds the PRISTINE SGF terminal (`replayToTerminal()`, all stones present, zero dead/territory marks, replay captures + SGF komi — the computed territory overlay then renders from `territoryScoring(terminal, all-false)`, the exact inputs and shading of goscorer's test page after `Last`) — the record's own DD/MA/TB/TW is the ONLY dead-stone seed: opening the modal on a markup-less game auto-marks NOTHING (the dead-stone heuristic was removed; dead stones come only from the file's markup or the user's manual X-marks, recorded at Save), STONE SET C MATERIAL RENDERER (v0.1.065: `_stoneTextureCache`, `_mulberry32`, `_getHamaguriTexture`, `_getSlateTexture`, `drawGoStone`, `getStoneVariant` at 5982–6392, `useGradientC` branch at 6843–6850 — a pure Canvas 2D true-to-material hamaguri/slate renderer, purely additive over Sets A/B; v0.1.066: `getStoneVariant` rolls `originAngle: rand() * Math.PI * 2` from the position-keyed seed, `drawGoStone` passes `options.originAngle ?? -2.3` through to `_getHamaguriTexture`, whose cache key now includes `originAngle.toFixed(2)` so per-position ring directions cache separately; v0.1.067 material-accurate upgrade — new `_lerpColor` helper (5980), slate core-tint blend via `tintAmount` (kuro neutral-black ↔ ao blue-green cast, the polish/tone variation real nachiguro exhibits per Kuroki Go Story Ch.3), hamaguri gradient stops lerped by `whiteness` (Snow ↔ Blossom) and `ringCount` derived from the grade (`10 + Math.floor(whiteness * 28)`) so Snow rolls dense delicate rings and Blossom wide coarse ones), `replayToTerminal()`; v0.1.085 Set C is the v4 renderer — hamaguri grain is nearly-parallel diagonal bands bowing from a FAR origin (`_getHamaguriTexture` at 6040, origin `radius·6`, `originDistMult` param), NOT concentric loops, and slate is matte mottled near-uniform black with no specular overlay and no rim darkening (`drawGoStone` 6192, `_getSlateTexture` 6111 with speckle capped at `min(700, radius·9)`); `_parseColor` (6001) accepts hex + rgb so `_lerpColor` chaining no longer collapses slate to black; `getStoneVariant` (6353) rolls `valueShift`/`cloudSeed`/`specularStrength≤0.5` for black and Snow/Blossom buckets (`snowProbability 0.2`) for white; `useGradientC` hook at 6843-6850 passes live loop vars `r`/`c` — v4 spec documented in the header comment at 5955-5980; v0.1.069 persistence rules — `_lastSavedSession` is the ONLY state that survives modal close/reopen and page refresh once a Save Board exists (unsaved post-Save playground edits / Reset Board / Reset Score are discarded; reopen always lands frozen "Board Saved ✓" via `openScoringModal`'s `hasSaved` forcing) and `beforeunload` warns on `_scoringDirty`; w/# territory-counts display toggle (`showTerritoryCounts`) with the vacated-square reveal (`computeVacatedTerritory`) and contrast-halo point numbers; v0.1.070 close-without-saving confirm dialog — the '✕' button and backdrop click route through `requestCloseScoringModal`, which intercepts a `_scoringDirty` close with `#scoring-close-confirm-dialog` (Close Without Saving / Cancel, message adapts to whether a Save exists) and clean closes skip the dialog; v0.1.072 Custom Stones available for every stone set — `setCustomStonesExpanded` (13220) is the single expand/collapse helper (auto-collapse on set select, manual header toggle, accordion re-fit to final `scrollHeight` when expanding inside a SHORT-measured open accordion), `syncCustomStonesSection` (13250) just calls it, the `.locked` gate and its CSS are deleted; v0.1.073 territory counter is pure Pretendard text — the MSM "w/#" group counts draw with `bold {px}px 'Pretendard', sans-serif` (the `@font-face` `bold` weight IS `f0nts/PretendardEN-Medium.otf`) in `#FCD102` for Black territory / `#101389` for White, with the halo's shadow state explicitly zeroed (`shadowBlur 0`, `shadowColor rgba(0,0,0,0)`) so pure text — no border, no shadow, no halo; v0.1.074 adaptive rounded-corner badges behind every count — each MSM "w/#" number now draws a pill-shaped rounded box sized to its measured text (`boxW = textWidth + 2·fontPx·0.42`, `boxH = fontPx·1.68`, corner `r = bh/2`) via the new shared `roundedRectPath` helper (17292-17301), filled 40%-translucent with the territory color (`rgba(17,24,39,0.4)` for Black, `rgba(255,255,255,0.4)` for White — the only 0.4-alpha fills in the app), with a smooth ease-out-back pop-in driven by the module-level `territoryBoxAnims` Map (17290, keyed by centroid + count, pruned to live groups each draw) that re-animates only on a fresh badge or a count change while steady redraws settle instantly; the digits themselves stay the v0.1.073 pure text; v0.1.075 the badge COVERS THE WHOLE TERRITORY AREA — the box is now the group's full-cell bounding box: the member loop tracks `frMin/frMax/fcMin/fcMax`, so the badge spans every territory square the group owns (`boxX0 = PADDING + fcMin·CELL`, `boxY0 = PADDING + frMin·CELL`, `boxW = (fcMax−fcMin+1)·CELL`, `boxH = (frMax−frMin+1)·CELL`, corner `min(CELL·0.45, boxW/2, boxH/2)`), the ease-out-back pop-in scales about the bbox center so at `scale=1` the box lands exactly on the territory bbox, and the re-pop trigger is `count` OR any extent change (a replace that moves a group's boundary re-pops even with an unchanged count); v0.1.076 the box is INTERSECTION-ORIENTED — anchored to the grid intersections (`boxX0 = PADDING + (fcMin − 0.5)·CELL`, `boxY0 = PADDING + (frMin − 0.5)·CELL`, same width/height), so its edges sit midway between grid lines, half a grid spacing outside the group's outermost points, its center is the group's intersection midpoint (`PADDING + (fcMin+fcMax)/2·CELL`), and a single-point group gets a `CELL`-sized box centered on its intersection; v0.1.077 the badge is CROSSWORD-STYLE — every member square draws as a `CELL`-sized rounded cell centered on its grid intersection, all unioned into ONE path with the nonzero winding rule and a single fill, so the box hugs the group's actual outline (rounded outer corners, notched inner corners at diagonal touches) instead of a bounding rectangle — and the pop-in DRIVES ITSELF: while any `territoryBoxAnims` entry is still animating the counter block `requestAnimationFrame`s a `window.drawBoard()` (17663-17671, opt-out `window.__tcDisableTerritoryAnim` for tests), so the first w/# click's 5%-scale badges grow to full scale without any further user interaction; v0.1.078 per-cell FIX — the v0.1.077 union silently drew only the LAST member of each group because `roundedRectPath` begins a fresh path internally (`annotation_v4.js:17294`), so each cell in the merged path wiped the previous ones; now each member square is drawn AND filled on its own (`17622-17636`), giving every territory intersection its own distinct 40%-translucent rounded box that clusters along the group's actual area like crossword letter cells; v0.1.079 ONE CONTINUOUS BOX PER TERRITORY AREA — the per-cell badges merge into a single seam-free shape: all of a group's `CELL`-sized member squares join into ONE path (`beginPath()` once, each member as its own subpath, one `fill()`, nonzero winding) so the badge is a solid crossword-block outline with no seams and no bounding-box padding; new `roundedRectPathCorners(ctx,x,y,w,h,rTL,rTR,rBR,rBL)` (17292-17317) builds a subpath per corner WITHOUT `beginPath()` (radii clamped to `[0,min(r,w/2,h/2)]`) so callers accumulate a group and fill once, while `roundedRectPath` remains a fresh-path single-radius wrapper for legacy callers; a member's corner is rounded (`CELL·0.45`) ONLY at exposed outer corners (both the orthogonal neighbor AND the edge-adjacent cell outside the group), straight-edge and interior (all 4 orthogonal neighbors in-group) corners are square 0 — the merged badge block draws with `inGroup(rr,cc)` neighbor tests, one `fill()` per group, and the ease-out-back pop-in still pivots about the group's intersection midpoint (re-pop on count OR extent change); v0.1.080 EVERY w/# TOGGLE REPLAYS THE POP-IN — the checkbox `change` handler (15474-15489) bumps every `territoryBoxAnims` entry's `t0` to `performance.now()` on toggle-ON, so the very next draw starts the ease-out-back scale over for all groups even with unchanged count/extent (toggle-OFF draws nothing; a first-ever ON click creates fresh entries), and the self-driving `requestAnimationFrame` loop completes each replay on its own; v0.1.082 w/# digits switch to Figtree-SemiBold (`'Figtree'` sans `bold`, 17603-17612) and turn italic while an editing mode is active — `interactionMode` `'replace'`/`'rearrange'` (post-lock Replacing/re-Arranging) renders `italic {px}px 'Figtree'` as an editing cue, pre-lock marking and the frozen "Board Saved ✓" view stay upright; v0.1.084 the italic is gated on the frozen state (`!frozen && replace/rearrange`, 17610-17614) so "Board Saved ✓" always renders REGULAR and Edit-unfrozen returns to italic — the lock pins `interactionMode` to 'replace' after Save, so frozen is the only reliable "not editing" signal |
| `annotation.css` | 4,192 | All styles — board canvases, floating panels, badges, progress bar, responsive layout. v0.1.081: registers the `'GoogleSansCode'` @font-face (41-51, `f0nts/GoogleSansCode_Proportional-Regular.ttf`) so the inline code-font references resolve to the actual font |
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

## Stones

A stone on the board is never drawn from a single image. Inside `drawCellContent()`, each stone is a **stack of independently-styled elements** — a board mask underneath, a border ring, the stone surface itself, and finally any labels — and every element is a user-editable property on the per-colour `blackStone` / `whiteStone` style objects. A "stone" as it appears on the board is simply the sum of those elements, plus whichever *Stone Set* preset is active (if any).

### The Stone's Elements

Each of the three board styles (`initialBoardStyle`, `studyBoardStyle`, `exportBoardStyle`) carries a `blackStone` and a `whiteStone` object with the same element fields. Defaults:

| Field | Black default | White default | Element it drives | What it does |
|-------|---------------|---------------|-------------------|--------------|
| `bmSize` | 15 | 15 | Board Mask (BM) | Radius of the board-surface circle painted *under* the stone, at the export cell scale (`bmSize × (cellSize / 29.3333)`). When missing, falls back to the stone radius + 1px |
| `bgSize` | 0.45 | 0.45 | Stone Surface | Radius of the stone disk: a fraction of the cell when ≤ 2.0 (`bgSize × cellSize`), an absolute px value when > 2.0 (`bgSize × (cellSize / 29.3333)`) |
| `bg` | `#111827` | `#f3f4f6` | Stone Surface | Solid surface colour — the fallback fill when no stone set or custom image is active |
| `br` | `#ffffff` | `#111827` | Border Ring (BRr) | Stroke colour of the thin ring drawn around the stone |
| `brSize` | 0 | 1 | Border Ring (BRr) | Ring thickness, scaled as `(brSize / 10) × stoneRadius × 0.3`. 0 hides the ring entirely (the black default) |
| `brRadius` | 0 | 0 | Border Ring (BRr) | Radial offset of the ring as a multiple of the stone radius — 0 hugs the stone edge, > 0 floats the ring outward, < 0 sinks it under the surface |
| `brBlur` | 0 | 0 | Border Ring (BRr) | Gaussian blur (px) applied to the ring stroke |
| `fg` | `#ffffff` | `#111827` | Labels & annotations | Foreground colour for move numbers/letters drawn on the stone and for annotation strokes (circles, triangles…) on a stone |
| `fgSize` | 11 | 11 | Labels & annotations | Font size (px, at the export cell scale) for labels sitting on a stone |
| `useColor` | true | true | Stone Surface | true → paint the solid `bg` circle; false → draw the custom `imgSrc` image |
| `imgSrc` | '' | '' | Stone Surface | Custom stone image URL or data-URI, used when `useColor` is false |

`stoneSet` lives on the style object itself (not inside `blackStone`/`whiteStone`); when non-null it overrides the surface element entirely (see *Stone Sets* below).

### How The Elements Compose (bottom → top)

`drawCellContent()` (`annotation_v4.js:6503+`) paints every stone as four stacked layers:

1. **LAYER 3 — Board Mask (BM).** A circle of board surface painted at the `bmSize` radius, between the board and the stone, so the area under a stone reads as plain board instead of grid lines bleeding out to the stone edge. Because it is clipped to the board surface, a mask that overhangs the board frame behaves like the frame (see *Edge Stones and the Board Mask*).
2. **LAYER 2 — Border Ring (BRr).** The `br` ring stroked at `stoneRadius + brRadius + brSize / 2` with `brSize` width and `brBlur` blur (`annotation_v4.js:7015-7029`). Always above the BM, always below the stone surface.
3. **LAYER 1 — Stone Surface.** The visible stone disk (`annotation_v4.js:7031-7132`): a Set A/B/C gradient or material renderer when a set is active, else the custom `imgSrc` image, else a flat `bg` circle at the `bgSize` radius.
4. **Labels & annotations.** Move numbers, letters and annotation strokes drawn on top, coloured `fg` and sized `fgSize` (`annotation_v4.js:7180-7290`). `fg` also supplies `markerColor`, so the same colour drives annotation strokes on stones.

The surface is clipped to the cell so the stone sits flush with it, while the BM and BRr can bleed past the cell by design.

### Edge Stones and the Board Mask

When a stone sits on the A/T/1/19 edge lines, its BM circle overhangs the board frame margin (`marginSize = (cellSize / 2) × min(1, border.size / 100)`). On every board except the Manual Scoring Modal (`go-board-canvas-scoring`) the mask is a **composite** that mirrors the real draw order (`annotation_v4.js:6716-6895`): the frame margin colour (`border.color` when the border override is ON, else the board colour) fills the whole mask, then the board surface (wood texture or solid `bg`) is painted on top clipped to the playing area, and finally the outer grid lines — the **BDL**, the Grids & Hoshi element (`grid.boundaryColor` / `grid.boundarySize`) — are re-stroked where they cross the mask so the boundary line is recognized as Board's Border/BG instead of being erased — so the overhang reads as frame, not wood, exactly like the board behind it. The MSM scoring board keeps the legacy single-fill mask. Mask area beyond the wood rect stays transparent so the pre-rendered canvas background shows through.

### Stone Style State

Each board style object (`initialBoardStyle`, `studyBoardStyle`, `exportBoardStyle`) has a `stoneSet` property (`null` by default). When a user clicks a set, `stoneSet` is set to `"A"`, `"B"`, or `"C"` and saved to localStorage across all three style objects.

`stoneOffset: { x: 0, y: 0 }` is a top-level property on each board style object (like `stoneSet`, not inside `blackStone`/`whiteStone`). It shifts **LAYER 1 (Stone Surface) only** — the visible stone disk moves by `(x, y)` px while the Board Mask (LAYER 3), Border Ring (LAYER 2), labels, annotations, highlights and overlays stay centered on the intersection. Shared by both Black and White stones; the palette exposes X/Y rows inside the Custom Stones sub-section of the Stones (Black & White) accordion.

### Rendering Priority

Inside `drawCellContent()`, stone rendering follows this priority:

1. **Stone set active** (Set A / Set B gradient, or Set C material renderer) — fixed preset wins
2. **Custom stone image** — user-uploaded image
3. **Solid color** — fallback from custom color picker

### Stone Sets

The floating panel's **Stones (Black & White)** accordion contains a **Default Stone Set** selector with three options: Set A, Set B, and Set C. When a stone set is active, the Custom Stones section collapses and locks.

#### Set A — 3D Gradient (Default)

Set A renders stones with a warm directional lighting gradient + drop shadow:

| Stone | Gradient | Rim |
|-------|----------|-----|
| Black | `#5a5a5a` → `#1a1a1a` → `#000000` | None |
| White | `#ffffff` → `#e6e6e6` → `#a0a0a0` | `#888888` |

Light source is offset to top-left. Drop shadow: `rgba(0,0,0,0.5)` with proportional blur/offset.

#### Set B — Matcap 3D

Set B renders stones with a matcap-inspired 3D finish using a tighter highlight spot and cooler/warmer tones:

| Stone | Gradient | Rim |
|-------|----------|-----|
| Black (Slate) | `#6b7280` → `#1f2937` → `#030712` | None |
| White (Ivory Pearl) | `#fffef5` → `#f0ead6` → `#bab5a0` | `#a09880` |

**Rendering code** (`annotation_v4.js:7039-7121`):

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

#### Set C — Hamaguri & Slate (Material Renderer, v4)

Set C renders each stone from its actual material with a pure Canvas 2D renderer (no image assets), calibrated against real photos of Kuroki Goishiten hamaguri (Snow/Blossom grade) and nachiguro slate:

| Stone | Material | Signature |
|-------|----------|-----------|
| Black | Slate (那智黒 nachiguro) | Matte, mottled, near-uniform black — no grain, no tight glint, no rim darkening. Stone-to-stone variation is POLISH/TONE: a subtle neutral-kuro ↔ faint blue-green "ao" cast (`tintAmount`), a gentle overall value drift (`valueShift`), a different cloud-mottle pattern per position (`cloudSeed`), and a soft broad diffuse highlight (specular hard-capped at 0–0.5) |
| White | Hamaguri (蛤 clam-shell) | Ivory/cream base with a warm translucent amber band near the rim; growth rings render as nearly-parallel DIAGONAL bands with a gentle bow from a FAR origin (`originDistMult`) — like real photos show, NOT tight concentric loops. Snow grade = dense fine rings (`ringCount` 30–46), near-pure white, straighter bands; Blossom grade = wider coarse rings (8–17), warm cream, more visible bow |

The renderer is self-contained and additive (`annotation_v4.js:5992-6496`): `_getHamaguriTexture()` / `_getSlateTexture()` build the textures once per (radius, variant) into an off-screen canvas cache (`_stoneTextureCache`), `drawGoStone()` paints the stone with its own drop shadow, material texture, warm rim band (white), and a hamaguri-only specular glint, and `getStoneVariant()` derives per-stone texture params deterministically from board position.

**v4 material fixes.** (1) Hamaguri grain: `_getHamaguriTexture(radius, ringCount=14, jitter=1, originAngle=-2.3, originDistMult=6)` places the ring origin at `radius·6` — far outside the stone — and draws ~40-point jittered polylines over `[originDist ± radius·1.15]` as 2:1 light `rgba(255,252,240,0.05-0.11)` vs shadow `rgba(150,124,80,0.06-0.14)` bands (seed 2024), so the stone shows near-parallel bands, not concentric circles. (2) Slate: no specular overlay and no rim darkening to near-black (v3's bright glassy core + `#020303` rim were both wrong) — the base gradient keeps the whole disk near one dark value (core `#333739→#37403f` by `tintAmount`, `brightCore` lifted toward `#4a5153` by only `specStrength·0.6`, `rimColor` lerped toward `#000000` just 0.4, stops 0.00/0.45/1.00) and `_getSlateTexture(radius, cloudSeed=0)` renders 7 broad soft cloud blobs plus fine speckle capped at `min(700, radius·9)` (fixing v3's `radius²·0.35` compounding crush on large stones), seed `9911 + cloudSeed`. (3) Color parsing: `_parseColor` accepts `#rrggbb` AND `rgb(r,g,b)` and `_lerpColor` routes through it — v3's hex-only parser silently collapsed chained lerp output to black.

**Per-position, not per-placement.** Texture params are derived deterministically from `(row * 19 + col)` with a per-player seed offset (`(row·19+col)·137 + (B?911:313)`), so a stone's grain is stable across every redraw (hover, undo, resize, export preview — no flicker) while each position still looks distinct from its neighbors. Capturing and replaying a stone on the same point keeps the same pattern. Black rolls `tintAmount rand()` / `valueShift (rand()-0.5)·1.2` / `cloudSeed floor(rand()·10000)` / `specularStrength rand()·0.5` (HARD CAP 0.5). White rolls `snowProbability 0.2` (ADJUSTABLE — real incidence ~5-10%) into Snow (`ringCount 30-46`, `ringJitter 0.3-0.65`, `originDistMult 7-10`, `whiteness 0.75-1.0`) or Blossom (`8-17`, `0.7-1.5`, `3.5-6`, `0.1-0.65`).

**Code** (`annotation_v4.js:7041-7048`) — a leading branch in the stone-surface chain; Set A/B, image, and solid-color paths are untouched:

```javascript
const useGradientC = (style && style.stoneSet === 'C' && cell.player);
if (useGradientC) {
    targetCtx.save();
    const variant = getStoneVariant(r, c, cell.player);
    drawGoStone(targetCtx, cx, cy, currentStoneRadius, cell.player, variant);
    targetCtx.restore();
} else if (useGradient || useGradientB) {
```

`drawGoStone()` sets its own shadow internally, so the Set C path is self-contained. Because the branch lives inside `drawCellContent()`, Set C works across all three boards (initial, study, export) and the scoring board automatically.

#### UI

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

#### Files Changed

| File | Lines | Action |
|------|-------|--------|
| `index.html` | 2009 | Enabled Set B (removed `disabled` class, updated title) |
| `annotation_v4.js` | 7039-7121 | Added `useGradientB` check and Set B rendering block |
| `annotation_v4.js` | 5992-6496 | Added Set C material renderer (`_stoneTextureCache`, `_mulberry32`, `_getHamaguriTexture`, `_getSlateTexture`, `drawGoStone`, `getStoneVariant`) |
| `annotation_v4.js` | 7041-7048 | Added `useGradientC` check and Set C rendering branch |
| `annotation_v4.js` | 5940-6246 | v0.1.066: per-position `originAngle` randomization — `_getHamaguriTexture` gains `originAngle` param + cache-key angle suffix, `drawGoStone` reads `options.originAngle ?? -2.3` and threads it, `getStoneVariant` rolls `originAngle: rand() * Math.PI * 2` |
| `annotation_v4.js` | 6697-6705 | v0.1.066: `useGradientC` branch unchanged (renderer is self-contained; only the variant it receives differs) |
| `test/verify_stone_set_c.js` | 16-167 | v0.1.066: harness extended 16 → 19 checks — `originAngle` range 0–2π, determinism per position, cross-position variety |
| `annotation_v4.js` | 5939-6313 | v0.1.067: material-accurate upgrade — `_lerpColor` helper, slate `tintAmount` kuro↔ao core blend + hamaguri `whiteness` Snow↔Blossom gradient stops in `drawGoStone`, `ringCount` derived from grade (`10 + Math.floor(whiteness * 28)`) + `tintAmount`/`whiteness` rolls in `getStoneVariant`, v3 header documenting the research |
| `annotation_v4.js` | 6765-6771 | v0.1.067: `useGradientC` branch unchanged (renderer is self-contained; only the variant it receives differs) |
| `test/verify_stone_set_c.js` | 16-173 | v0.1.067: harness extended 19 → 22 checks — `tintAmount` range/determinism, `whiteness` range/determinism, grade→ring-density link |
| `annotation_v4.js` | 5982-6392 | v0.1.085: GO STONE RENDERER v4 replaces the v3 renderer — hamaguri grain as nearly-parallel diagonal bands from a far origin (`_getHamaguriTexture` 6040, `originDistMult` param, ~40-pt jittered polylines, seed 2024), slate as matte mottled near-uniform black with no specular overlay and no rim darkening (`drawGoStone` 6192, `_getSlateTexture` 6111 with speckle capped `min(700, radius·9)`, seed `9911 + cloudSeed`); `_parseColor` (6001) + `_lerpColor` (6011) accept hex AND rgb (fixes the v3 chained-lerp slate-black collapse); `getStoneVariant` (6353) rolls `valueShift`/`cloudSeed`/`specularStrength≤0.5` (black) and Snow/Blossom buckets (`snowProbability 0.2`); `drawGoStone` destructures `ringCount, ringJitter, originAngle, originDistMult, whiteness, cloudSeed, tintAmount, valueShift, specularStrength`; hamaguri gradient whites `#fffdf6`/`#f8f0da`, mid/edge lerped by `whiteness`, warm rim band 0.72→1.0, glint `0.75·spec`, rim stroke `rgba(150,120,70,0.4)` — v4 spec in the header comment at 5955-5980 |
| `annotation_v4.js` | 6843-6850 | v0.1.085: `useGradientC` hook unchanged (passes live loop vars `r`/`c` — already v4-compatible, verified no code change needed) |
| `test/verify_stone_set_c.js` | 1-215 | v0.1.085: harness re-calibrated to v4 — 24 checks (12 variant checks run everywhere + 12 render/cache checks SKIPPED on lightpanda, which has no canvas gradients); new v4 checks for `valueShift` range, integer `cloudSeed`, `originDistMult` range, Snow/Blossom bucket consistency, both grades present across 19×19 white stones |
| `test/lightpanda-launcher.js` | 1-77 | v0.1.085: added `probeCapabilities(page)` (probes `caps.gradients` via a fresh canvas's `createRadialGradient` and `caps.layout` via a 123px div's `getBoundingClientRect().height`) and `--enable-external-stylesheets` on the `lightpanda serve` spawn |
| `annotation_v4.js` | 6716-6895 | Composite Board Mask for edge stones — non-MSM boards mirror the border/board draw order so a mask overhanging the frame reads as frame (see *Edge Stones and the Board Mask*); MSM scoring board keeps the legacy single-fill mask |
| `annotation_v4.js` | 5311-5343 | v0.1.088: BDL drawn as ONE `strokeRect` (miter corners), exactly like the MSM wood outline (:5197-5200) — interior grid lines (i = 1..17) draw exactly as before |
| `annotation_v4.js` | 8305-8326 | v0.1.088: export BDL corner fill — fills the (boundaryLineWidth/2)² notch at each corner where two boundary edges meet; export grid loops untouched |

## UI Architecture

### Layout Overview

<div style={{ border: '1px solid #e0e0e0', borderRadius: '8px', overflow: 'hidden', margin: '1.5rem 0' }}>
  <iframe src="/tech-log-dist/diagrams/layout-ui-overview.html" width="100%" height="580" style={{ border: 'none', display: 'block' }} title="UI Layout Overview — panel regions and current state" />
</div>


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

<div style={{ border: '1px solid #e0e0e0', borderRadius: '8px', overflow: 'hidden', margin: '1.5rem 0' }}>
  <iframe src="/tech-log-dist/diagrams/tree-script-load-order.html" width="100%" height="420" style={{ border: 'none', display: 'block' }} title="Script Load Order — dependency tree" />
</div>

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

<div style={{ border: '1px solid #e0e0e0', borderRadius: '8px', overflow: 'hidden', margin: '1.5rem 0' }}>
  <iframe src="/tech-log-dist/diagrams/tree-annotation-structure.html" width="100%" height="520" style={{ border: 'none', display: 'block' }} title="annotation_v4.js Structure — module map" />
</div>

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

<div style={{ border: '1px solid #e0e0e0', borderRadius: '8px', overflow: 'hidden', margin: '1.5rem 0' }}>
  <iframe src="/tech-log-dist/diagrams/flow-game-loading.html" width="100%" height="600" style={{ border: 'none', display: 'block' }} title="Game Loading — SGF input to render pipeline" />
</div>

### Move Navigation

<div style={{ border: '1px solid #e0e0e0', borderRadius: '8px', overflow: 'hidden', margin: '1.5rem 0' }}>
  <iframe src="/tech-log-dist/diagrams/flow-move-navigation.html" width="100%" height="620" style={{ border: 'none', display: 'block' }} title="Move Navigation — user input to render pipeline" />
</div>

### Highlight Hover

<div style={{ border: '1px solid #e0e0e0', borderRadius: '8px', overflow: 'hidden', margin: '1.5rem 0' }}>
  <iframe src="/tech-log-dist/diagrams/flow-highlight-hover.html" width="100%" height="540" style={{ border: 'none', display: 'block' }} title="Highlight Hover — badge mouseenter/mouseleave event flow" />
</div>


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

<div style={{ border: '1px solid #e0e0e0', borderRadius: '8px', overflow: 'hidden', margin: '1.5rem 0' }}>
  <iframe src="/tech-log-dist/diagrams/arch-ssot-sync.html" width="100%" height="400" style={{ border: 'none', display: 'block' }} title="SSOT Sync System — one source of truth, zero drift" />
</div>

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

<div style={{ border: '1px solid #e0e0e0', borderRadius: '8px', overflow: 'hidden', margin: '1.5rem 0' }}>
  <iframe src="/tech-log-dist/diagrams/tree-project-structure.html" width="100%" height="460" style={{ border: 'none', display: 'block' }} title="Project File Structure — baduk-notes directory overview" />
</div>


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

<div style={{ border: '1px solid #e0e0e0', borderRadius: '8px', overflow: 'hidden', margin: '1.5rem 0' }}>
  <iframe src="/tech-log-dist/diagrams/layout-tenuki-zones.html" width="100%" height="480" style={{ border: 'none', display: 'block' }} title="Tenuki Detection Zones — 9 board partition zones and adjacency" />
</div>

| Zone | Column Range (`c`) | Row Range (`r`) | Coordinates (19×19) | Adjacency |
| --- | --- | --- | --- | --- |
| **Top-Left Corner** | `c < 6` | `r < 6` | A19–F14 (6×6) | Top Side, Left Side, Center |
| **Top Side** | `c ∈ [6, 12]` | `r < 6` | G19–N14 (7×6) | Top-Left Corner, Top-Right Corner, Center |
| **Top-Right Corner** | `c > 12` | `r < 6` | O19–T14 (6×6) | Top Side, Right Side, Center |
| **Left Side** | `c < 6` | `r ∈ [6, 12]` | A13–F7 (6×7) | Top-Left Corner, Bottom-Left Corner, Center |
| **Center Zone** | `c ∈ [6, 12]` | `r ∈ [6, 12]` | G13–N7 (7×7 Tengen) | **Adjacent to ALL 8 surrounding zones** |
| **Right Side** | `c > 12` | `r ∈ [6, 12]` | O13–T7 (6×7) | Top-Right Corner, Bottom-Right Corner, Center |
| **Bottom-Left Corner** | `c < 6` | `r > 12` | A6–F1 (6×6) | Bottom Side, Left Side, Center |
| **Bottom Side** | `c ∈ [6, 12]` | `r > 12` | G6–N1 (7×6) | Bottom-Left Corner, Bottom-Right Corner, Center |
| **Bottom-Right Corner** | `c > 12` | `r > 12` | O6–T1 (6×6) | Bottom Side, Right Side, Center |

**Tenuki Detection Criteria (`evaluateTenuki`):**
1. **Manhattan Distance**: `|Δc| + |Δr| ≥ 5` between the current move and the previous move.
2. **Non-Adjacent Zone**: `areZonesAdjacent(currZone, prevZone) === false`.
3. **No Local Interaction**: `interactsLocally() === false` (no contact with friendly or opponent virtual stone clusters).
4. **Urgent Atari Blunder Guard**: If `hasUrgentAtari()` is true on the opponent's previous move, classified as `Tenuki (Blunder - Ignored Urgent Atari)`.