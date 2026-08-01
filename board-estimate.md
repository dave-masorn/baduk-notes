# Board Estimate — Score Estimation & Computational Method for Go

A standalone JavaScript module that computes board evaluation, area estimation, and deterministic Japanese territory scoring for Go board positions.

## Overview

The `BoardEstimate` module provides two distinct evaluation architectures:

1. **Sabaki Influence / Area Estimator (Yellow Modal)**: Ported from Sabaki's `@sabaki/influence` package and WASM AI (`@sabaki/deadstones`). Evaluates territory and area influence via heat-diffusion radiance maps and Monte Carlo playouts.
2. **Computational Method (Blue Card)**: A deterministic, rule-accurate **Japanese Territory Scorer** that parses SGF action logs, extracts player-agreed dead stones directly from SGF markup properties (`DD` / `MA`), natively ignores neutral *dame*, and computes the exact point differential without WASM dependencies or Monte Carlo variance.

## Files

- `board-estimate.js` — Core estimation algorithms and `evaluateJapaneseTerritory` pipeline.
- `sgf-parser.js` — `SgfEngine` namespace for parsing SGF markup (`DD`, `MA`, `TB`, `TW`) and coordinate expansion.

---

## 1. Computational Method (Japanese Territory Scoring Pipeline)

### What It Is

The **Computational Method** is a pure, deterministic Go scoring engine embedded directly into the `⌘ + Shift + E` Score Estimation modal (rendered in the dark navy blue card). Unlike heuristic vision approximations or stochastic AI playouts, it evaluates terminal board positions using strict **Japanese Territory Rules**:

$$
\text{White Total} = W_{\text{territory}} + W_{\text{prisoners}} + \text{Komi} + \text{Handicap}
$$

$$
\text{Black Total} = B_{\text{territory}} + B_{\text{prisoners}}
$$

$$
\text{Result} = \text{White Total} - \text{Black Total}
$$

### Mathematical Foundation: The Area ↔ Territory Equivalence Theorem

The scoring engine is built on a single mathematical identity that makes a static terminal board position yield an exact point differential without any Monte Carlo playouts:

**Area form** (Chinese / AGA / NZ rules): a player's score is *living stones plus surrounded empty points*.

$$
W_{\text{area}} = W_{\text{living}} + W_{\text{territory}}
$$

$$
B_{\text{area}} = B_{\text{living}} + B_{\text{territory}}
$$

$$
\text{Result} = W_{\text{area}} - B_{\text{area}}
$$

**Territory form** (Japanese rules): a player's score is *surrounded empty points plus captured opponent stones*.

$$
W_{\text{total}} = W_{\text{territory}} + B_{\text{captured}} + \text{Komi} + \text{Handicap}
$$

$$
B_{\text{total}} = B_{\text{territory}} + W_{\text{captured}}
$$

$$
\text{Result} = W_{\text{total}} - B_{\text{total}}
$$

**Equivalence**: When both sides have played the same number of stones (i.e. White played the last move, so $W_{\text{played}} = B_{\text{played}}$), the two forms are *provably identical*:

$$
W_{\text{area}} - B_{\text{area}} = (W_{\text{territory}} + B_{\text{captured}}) - (B_{\text{territory}} + W_{\text{captured}})
$$

Proof sketch: since $W_{\text{played}} = B_{\text{played}}$, the difference in living stones equals the difference in captured stones ($W_{\text{living}} - B_{\text{living}} = B_{\text{captured}} - W_{\text{captured}}$). Substituting into $W_{\text{area}} - B_{\text{area}}$ collapses to the territory form.

**What this means for the Computational Method**: because the SGF action log supplies *both* the in-game capture tallies (`state.captures`) *and* the endgame dead-stone markup, the engine already knows `B_captured` and `W_captured` exactly. It therefore computes the **territory form directly** (`evaluateJapaneseTerritory`), which is mathematically guaranteed to equal the area form of the same terminal position. The engine never needs to count stones — the markup + captures give the same differential with 100% historical fidelity.

> **Application to the Go Seigen 1930 game**: the terminal position yields $W_{\text{territory}} = 60$, $B_{\text{territory}} = 60$, $B_{\text{captured}} = 14$ (5 in-game + 9 dead Black), $W_{\text{captured}} = 13$ (2 in-game + 11 dead White). The theorem gives $(60 + 14) - (60 + 13) = +1$ → **W+1**, matching the recorded result exactly.

### Why We Need It

1. **Catastrophic Failure of Naive Area Scoring on Unfilled Dame Boards**:
   Under Area rules, a player's score is living stones plus surrounded empty points. However, Area scoring fundamentally mandates that all neutral *dame* (unoccupied points between living groups of different colors) must be filled with stones before counting. In historical games (such as Kitani Minoru vs. Go Seigen, 1930) and standard SGF records, games end with *dame* left unplayed (e.g. 44 empty points). Naive Area scoring on an unfilled dame board leaks points into the void, miscalculating a 1-point game as a 33-point victory.
2. **Elimination of Probabilistic Playout Variance**:
   Probabilistic engines (such as `@sabaki/deadstones` WASM) run Monte Carlo simulations (`iterations: 200`). On borderline endgame groups, random seeds produce slight classification jitter across repeated runs. The Computational Method runs 100% deterministic algorithms, ensuring that scoring the same position always yields the exact same fixed result.
3. **Historical Fidelity via SGF Action Logs**:
   Static image vision models hallucinate stone counts and lack prisoner history. SGF FF[4] action logs provide an immutable record of moves, captured stones (`state.captures`), and player-agreed endgame dead stones markup (`DD` for dimmed, `MA` for marked cross).

### Crucial Failure Mode Diagnosis & Topological Wall Preservation

- **Root Cause (Static L&D Hallucination & Boundary Breach)**:
  When an SGF action log lacks explicit `DD`/`MA` endgame markup, relying on a naive static L&D heuristic (`detectDeadStonesHeuristic`) causes catastrophic hallucinations (e.g. misclassifying 16 living White boundary stones as dead and scrubbing them from the board).
- **Cascading Logic Error (Territory Wall Collapse & Flood-Fill Leakage)**:
  Territory scoring relies strictly on topological enclosure. Scrubbing living boundary stones blows massive holes in White's territorial walls. When Step 3 executes its flood-fill algorithm, the search leaks through the missing wall stones, causing enclosed White territory to merge with empty space and touch Black stones. The algorithm applies the Japanese rule: **Bounded by both colors = Neutral Dame / Seki (0 territory)**. Over a third of the board (107 pts) is nullified into neutral space, collapsing White's score to an erroneous `B+26` instead of `W+1`.
- **No-Markup Gate (Run Warns First)**:
  Japanese territory ideally requires resolving dead stones *before* counting. A game with **no** endgame markup (`DD`, `MA`, `TB`, `TW`) anywhere no longer renders an automatic result. The Computational Method Run/Compute button demands markup: when pressed with no `DD`/`MA`/`TB`/`TW` present, it shows an **amber warning** — *"No DD/MA/TB/TW endgame markup found"* — with an **Open Manual Scoring Modal** button so the user can mark dead stones (X tool), save, and run again. This replaces the earlier automatic flood-fill fallback card: an unannotated dead stone anchored inside a territorial wall makes that wall multi-colored during any flood-fill, so the historical `W+1` Go Seigen 1930 game reads `B+3` (and WASM `deadstones.guess` recovers only ~9 of ~20 dead stones → `W+33`). Dead-stone markup is the only exact source; the flood-fill path still exists inside `evaluateJapaneseTerritory` but is no longer surfaced by the Run/Compute control.
- **SGF FF[4] Territory Derivation (`TB` / `TW`)**:
  When endgame territory properties are present, the engine cross-references the board matrix against `TB` (Territory Black) and `TW` (Territory White). Any White stone (`-1`) residing inside marked Black territory (`TB`) is deduced as a dead Black prisoner (`W_prisoners += 1`). Any Black stone (`1`) residing inside marked White territory (`TW`) is deduced as a dead White prisoner (`B_prisoners += 1`). This allows automatic dead-stone resolution with 100% historical fidelity without requiring explicit `DD` tags or neural network overhead.

### Terminal-Position Resolution & Algorithmic Markup Lookup (`findEndgameMarkup`)

The scorer requires Life & Death data for the *position it scores*. Historically this created false halts: a game whose endgame markup lives somewhere other than the current node (terminal annotation-only node, root props, or a position the 12-node fold window missed) would halt with *"No DD/MA/TB/TW endgame markup found"* even though the game was fully resolvable.

`runComputationalMethod` now resolves the markup source through the module-level `findEndgameMarkup()` helper — **algorithmic and game-agnostic**, applied to every record rather than patched per game. Resolution order:

1. **Current node first**: if the move under the replayer carries `DD`/`MA`/`TB`/`TW`, that markup is used directly and the *current* board position is scored.
2. **Full move sequence**: the last markup-bearing move in `state.allSgfMoves` (unfiltered sequence).
3. **Filtered sequence**: the last markup-bearing move in `state.sgfMoves`.
4. **Root props**: `state.sgfRootProps` / `state.sgfMetadata.tb` / `.tw`.
5. **Raw main line**: the last markup-bearing node of `SgfEngine.extractMainLine(state.sgfTree)` — catches terminal annotation-only nodes that loadSGF could not fold onto a move.
6. **Saved scoring session**: the study record's `rec.scoringData`, converted through the shared `computeSgfPropsFromScoringData` (see *Unified Scoring-Input Resolution* below) — for records whose `workingSgf` string never received the props.

Whenever the resolved markup is **not** on the current node, the engine **replays the entire game in memory** onto a fresh board using `playStoneWithCaptures`, accumulating full-game capture tallies (`compCaptures`) and reconstructing the exact terminal position (`compBoard`), and labels the card `Endgame position (move N)`.

This guarantees a game that *does* carry endgame markup anywhere never halts just because the replayer is parked mid-game or the markup sits outside the old fold window. Games with **no** endgame markup anywhere still get a warning directing the user to the Manual Scoring Modal (see the Computational Method section below).

### Unified Scoring-Input Resolution (`resolveScoringInputs`)

Both the blue-panel Run control and the Manual Scoring Modal must score the *same* inputs, or the two numbers diverge. `runComputationalMethod` therefore no longer extracts markup itself: it calls the module-level `resolveScoringInputs()`, which returns one canonical `{ board, captures, komi, handicap, deadStones, tbPoints, twPoints, hasMarkup, positionLabel, provenance, markupMove }` snapshot, then feeds that snapshot to `evaluateJapaneseTerritory`. Precedence is a strict, game-agnostic chain — the most recent, user-confirmed resolution wins:

1. **Live session memory** (`_scoringPersistData`) — the first source `openScoringModal` restores;
2. **Persisted study `scoringData`** (`rec.scoringData`) — the second source the modal restores;
3. **SGF endgame markup** — `findEndgameMarkup()` (the 6-step order above).

A session that resolves **nothing** (no dead marks, no territory) is skipped so the record's own markup can still drive the score; a session that resolves anything is authoritative over markup, because it is the exact board+marks snapshot the modal displays. Because tiers 1–2 mirror `openScoringModal`'s restore order, Run always scores what the reopened modal shows.

**Session parity is exact**: the snapshot feeds the scorer the session's own board with lifted dead stones re-inserted (via `deadStonesInfo`), the session's captures, the session's komi, and territory derived by the same `computeSgfPropsFromScoringData`/`GoScorer` path the modal's DD/MA/TB/TW bar widget uses — with `handicap` forced to 0, because the modal's displayed formula (`territory + dead + captures + komi`) never includes a handicap term. The blue panel's *Dead Stones & Prisoners* caption labels the source (`Manual Scoring session` vs `SGF endgame markup (DD/MA/TB/TW)`).

`computeSgfPropsFromScoringData` was hoisted to module top level (it is a pure function of `data`) and now also returns the restored `board`; `findEndgameMarkup`'s step 6 delegates to it, so every consumer derives identical `DD`/`MA`/`TB`/`TW` sets. `window.resolveScoringInputs` and `window.findEndgameMarkup` are exposed for console diagnostics.

### Terminal-Markup Fold — Full Main-Line Scan

`loadSGF` folds endgame markup from non-move terminal nodes onto the final move so scorers can resolve Life & Death. The fold previously scanned only the trailing 12 main-line nodes; it now finds the last **move** node in the main line and scans **only the annotation-only nodes strictly after it**, folding the last markup-bearing one onto the final move. No arbitrary window, and mid-game markup is never folded onto the final move.

### Manual Scoring Modal — Fresh Marks on Every Open

Two algorithmic changes fix stale dead-stone marks when reopening Manual Scoring:

- **`openScoringModal(savedData)`** restores the most recent session when called without explicit data (e.g. from the Estimation panel's **Open Manual Scoring Modal** button): first `_scoringPersistData` (the most recently closed session), then `StudyRecordDB.getRecord(state.activeStudyId).scoringData` — so a fresh page load still shows the latest saved marks.
- **`resetScoringBoardFromState()`** seeds `scoringState.markedDead` from the game's own `DD`/`MA`/`TB`/`TW` markup (via `findEndgameMarkup`): `DD`/`MA` points are marked dead directly; opponent stones inside `TB`/`TW` territory bounds are dead. A fresh session starts from the game's resolved Life & Death marks instead of an empty board.

### Computational Method (Blue Panel) & No-Markup Warning

The Estimation modal (`⌘ + Shift + E`) always renders the **Computational Method (Japanese Territory Rules)** blue panel (`#computational-estimate-card`). Its Run control is gated on Game End:

- **Before the final move**: the blue panel shows the notice *"Available Only Upon Game End"* — an exact Japanese score is only meaningful once the replayer reaches the final move (`currentMoveIndex === sgfMoves.length - 1`).
- **At the final move**: the panel shows the **"Run / Compute >"** button. Pressing it calls `runComputationalMethod`:
  - **Run with markup**: resolves the scoring inputs through `resolveScoringInputs()` (live/saved Manual Scoring session first, then `findEndgameMarkup()` — current move → full/filtered sequences → root props → raw main line → saved session; replaying in memory when the markup is elsewhere), runs `evaluateJapaneseTerritory` with the explicit `DD`/`MA`/`TB`/`TW` point lists, and renders the score detail inside the blue panel (section *3. Explicit Territory Counting (TB/TW Markup)*). For a saved session the inputs equal the modal's, so the two scores match.
  - **Run without markup**: `runComputationalMethod` **does not** render a score. It shows an amber warning — *"No DD/MA/TB/TW endgame markup found"* — telling the user to mark dead stones with the X tool in the **Manual Scoring Modal** (via the *Open Manual Scoring Modal* button), save, then run again.

The flood-fill fallback still exists inside `evaluateJapaneseTerritory` for programmatic callers, but the Run control stops short of it: without markup it warns instead of approximating.

### How It Works (Step-by-Step Pipeline)

```
SGF Action Log & Board Matrix
     │
     ▼
Run Gate (Computational Method Run/Compute control in Estimation modal)
     ├─ replayer NOT on final move ──▶ blue panel shows "Available Only Upon Game End" notice (no button)
     └─ replayer on final move ──▶ "Run / Compute >" button shown
     │
     ▼
Step 1: State Reconstruction (Grid Size, In-Game Prisoners B/W, Komi/Handicap)
     │
     ▼
Step 2: Markup Source Resolution & L&D Extraction
        (DD/MA Markup or TB/TW Territory Derivation;
         findEndgameMarkup: current move → allSgfMoves → sgfMoves → root props
         → raw main line; non-current markup replays in memory to the terminal move)
        (Dead Black Stones → W Prisoners += 1; Dead White Stones → B Prisoners += 1; Scrub Dead from Grid)
        └─ no markup anywhere ──▶ amber warning → Open Manual Scoring Modal
     │
     ▼
Step 3: Territory Counting (explicit TB/TW markup; flood-fill retained internally)
        (Single-color bounded empty regions → Territory; Multi-color bounded regions → Neutral Dame ignored)
     │
     ▼
Step 4 & 5: Final Japanese Territory Differential Execution
        Black Total = B_territory + B_prisoners
        White Total = W_territory + W_prisoners + Komi + Handicap
        Result = W+X / B+X / Draw
```

#### Step 1: State Reconstruction (SGF Action Log)
- Parses the N x N board matrix (`state.board`, e.g. 361 intersections for 19x19).
- Retrieves in-game captured stone tallies (`B_captures = state.captures.B`, `W_captures = state.captures.W`) and metadata (`komi`, `handicap`).

#### Step 2: Markup Source Resolution, SGF Endgame Markup Extraction & Territory Derivation
- **Resolve the markup source**: `findEndgameMarkup()` searches the current move, the full `allSgfMoves` sequence, the filtered `sgfMoves`, the root props, and finally the raw main line (see Terminal-Position Resolution above). If the resolved markup is not on the current node, an in-memory full-game replay produces the terminal position. If **no** node anywhere carries endgame markup, the Run/Compute control renders an amber warning that directs the user to the Manual Scoring Modal (see the Computational Method section above) — no score is produced.
- Inspects the resolved SGF node for FF[4] properties:
  - **Explicit Markup**: `DD` (Dimmed / Dead stones) and `MA` (Marked with X).
  - **Territory Derivation**: `TB` (Territory Black) and `TW` (Territory White).
- If `TB` or `TW` are present:
  - Any White stone (`-1`) located within `TB` bounds is deduced as a dead Black prisoner (`W_prisoners += 1`).
  - Any Black stone (`1`) located within `TW` bounds is deduced as a dead White prisoner (`B_prisoners += 1`).
- Expands single coordinates (`[ab]`) and compressed rectangles (`[ab:cd]`) using `SgfEngine.expandPointList`.
- **Prisoner Allocation**:
  - Each Black dead stone is scrubbed from the grid and awarded to White's final prisoners (`W_prisoners += 1`).
  - Each White dead stone is scrubbed from the grid and awarded to Black's final prisoners (`B_prisoners += 1`).
  - Scrubbed intersections become empty points for territory flood-fill.

#### Step 3: Territory Counting
- Executes territory assignment over the resolved empty intersections (explicit `TB`/`TW` markup is passed straight through; the flood-fill algorithm remains available internally for programmatic callers but is not reached by the Run/Compute control, which warns on missing markup instead).
- Evaluates the set of surrounding stone colors for each contiguous empty region:
  - Bounded **ONLY by Black stones** → Black Territory (`B_territory += region_size`).
  - Bounded **ONLY by White stones** → White Territory (`W_territory += region_size`).
  - Bounded by **both Black and White stones** (dame / neutral / seki) → Ignored (0 territory).

#### Step 4 & 5: Final Japanese Territory Differential Execution
- Calculates total scores:
  - $\text{Black Total} = B_{\text{territory}} + B_{\text{prisoners}}$
  - $\text{White Total} = W_{\text{territory}} + W_{\text{prisoners}} + \text{Komi} + \text{Handicap}$
- Formats the exact result string: `W+<diff>`, `B+<diff>`, or `Draw`.

### Web-Based Calculation Flow (`⌘ + Shift + E`)

1. **Trigger**: `window.runScoreEstimate()` runs on `⌘/Ctrl + Shift + E` (annotation_v4.js).
2. **AI pass (optional)**: if the `deadstones` WASM bundle is loaded, `BoardEstimate.fromBoard(state.board)` produces the sign map, and `deadstones.guess(..., {iterations: 200})` returns dead-stone vertices used for the yellow panel's area/territory influence map.
3. **Metadata**: `komi` is read from `state.sgfMetadata.km` (default `6.5`), `handicap` from `.ha`, `rules` from `.ru` (Japanese by default).
4. **Yellow panel**: `BoardEstimate.estimate(...)` renders the Sabaki-influence estimate (Area & Territory with 100% AI accuracy badge or a fallback notice).
5. **Run control**: the always-visible Computational Method blue panel shows the **"Run / Compute >"** button only when the replayer is on the final move (Game End); otherwise it shows an *"Available Only Upon Game End"* notice. Pressing Run calls `runComputationalMethod`:
   - With `DD`/`MA`/`TB`/`TW` present → renders the deterministic Japanese Territory score detail (`#computational-method-result`).
   - Without markup → renders the amber warning with an **Open Manual Scoring Modal** button.

<div style={{ border: '1px solid #f87171', background: 'linear-gradient(135deg, #450a0a 0%, #7f1d1d 100%)', borderRadius: '12px', padding: '16px 20px', marginTop: '20px', color: '#ffffff', boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)' }}>

<div style={{ color: '#fca5a5', fontWeight: 800, fontSize: '1.1rem', textTransform: 'uppercase', marginBottom: '10px', letterSpacing: '0.05em' }}>Caution / WIP / Bugs</div>

<p style={{ color: '#fecaca', fontSize: '0.9rem', lineHeight: 1.6, margin: 0 }}>The Computational Method does <strong style={{ color: '#ffffff' }}>not</strong> claim flawless operation. Known behavior and residual gaps in the deterministic scorer:</p>

<ul style={{ color: '#fecaca', fontSize: '0.9rem', lineHeight: 1.6, paddingLeft: '20px', marginTop: '8px', marginBottom: 0 }}>
<li><strong style={{ color: '#ffffff' }}>Computational Method is gated on Game End + markup</strong>: the blue panel's "Run / Compute >" button only appears once the replayer reaches the final move; before that the panel shows an "Available Only Upon Game End" notice. Pressing Run with no <code style={{ color: '#fecaca' }}>DD</code>/<code style={{ color: '#fecaca' }}>MA</code>/<code style={{ color: '#fecaca' }}>TB</code>/<code style={{ color: '#fecaca' }}>TW</code> shows an amber warning — <em style={{ color: '#fecaca' }}>"No DD/MA/TB/TW endgame markup found"</em> — directing the user to the Manual Scoring Modal instead of rendering an approximate score. Because unannotated dead stones stay anchored inside territorial walls, any automatic fallback is an approximation (the 1930 Go Seigen game reads <code style={{ color: '#fecaca' }}>B+3</code> instead of the true <code style={{ color: '#fecaca' }}>W+1</code>); explicit markup is the only exact source.</li>
<li><strong style={{ color: '#ffffff' }}>Blue panel ⇄ modal parity (fixed)</strong>: the blue-panel Run score previously differed from the Manual Scoring Modal's score for saved sessions (Run scored a raw main-line node's markup while the modal restored the saved session). <code style={{ color: '#fecaca' }}>resolveScoringInputs()</code> now scores from one canonical chain — live session → saved <code style={{ color: '#fecaca' }}>rec.scoringData</code> → SGF markup — feeding the scorer the session's board, dead stones, territory, captures, and komi (with handicap 0, matching the modal's formula), so the two scores agree. Residual gap: for a game with a nonzero handicap the modal's quick total omits the handicap term while the SGF-markup path includes it, so those two can still differ by the handicap.</li>
<li><strong style={{ color: '#ffffff' }}>Resume loads workingSgf as-is</strong>: <code style={{ color: '#fecaca' }}>resumeStudySession</code> calls <code style={{ color: '#fecaca' }}>loadSGF(rec.workingSgf)</code> without injecting markup (markup injection exists only in the export/viewer paths). A resumed game scores explicitly whenever its <code style={{ color: '#fecaca' }}>workingSgf</code> carries the markup anywhere — which the algorithmic <code style={{ color: '#fecaca' }}>findEndgameMarkup()</code> now resolves regardless of where the props live, falling back to the saved session when the string itself never received the props. Saving from the Manual Scoring Modal mirrors the properties onto the terminal move's direct fields so the Run control finds them immediately.</li>
<li><strong style={{ color: '#ffffff' }}>Markup resolution is algorithmic (fixed)</strong>: markup living outside the old "current move or last allSgfMoves move" check — e.g. root-level <code style={{ color: '#fecaca' }}>TB</code>/<code style={{ color: '#fecaca' }}>TW</code>, a terminal annotation-only node beyond the old 12-node fold window, or any other main-line position — previously halted with the false "No DD/MA/TB/TW endgame markup found" warning. <code style={{ color: '#fecaca' }}>findEndgameMarkup()</code> searches the current move, full/filtered move sequences, root props, raw main line, and saved session, and replays to the terminal position when the markup is elsewhere.</li>
<li><strong style={{ color: '#ffffff' }}>Historical halt bug (fixed)</strong>: a game whose DD/MA/TB/TW markup lives on the terminal node previously still halted whenever the replayer was parked mid-game. Fixed by folding terminal markup onto the final move and replaying the game in memory to the terminal position before scoring.</li>
<li><strong style={{ color: '#ffffff' }}>Manual Scoring restores fresh marks (fixed)</strong>: opening the modal without saved data (e.g. from the Estimation panel's Open Manual Scoring button) now restores the latest persisted session or the study record's saved <code style={{ color: '#fecaca' }}>scoringData</code>, and a fresh session seeds dead stones from the game's own <code style={{ color: '#fecaca' }}>DD</code>/<code style={{ color: '#fecaca' }}>MA</code>/<code style={{ color: '#fecaca' }}>TB</code>/<code style={{ color: '#fecaca' }}>TW</code> markup — so reopened modals never show stale/outdated dead-stone marks.</li>
<li><strong style={{ color: '#ffffff' }}>Stale-cache pitfall</strong>: the app's service worker keeps the <code style={{ color: '#fecaca' }}>go-annotator-cache-v3</code> cache. If the halt card still appears on a fully-marked game, the browser is almost certainly running an older <code style={{ color: '#fecaca' }}>annotation_v4.js</code>; hard-refresh with <code style={{ color: '#fecaca' }}>Cmd + Shift + R</code> (or clear site data) to pick up the current build.</li>
<li><strong style={{ color: '#ffffff' }}>TB/TW derivation is heuristic</strong>: an opponent stone inside a marked territory rectangle is assumed dead. A marked region that still contains a live opponent group will be over-counted; explicit DD/MA markup is the only exact source.</li>
</ul>

</div>

---

## 2. Sabaki Influence & Heuristic Pipeline (Yellow Panel)

### Sign Map Representation

Internal algorithms work with a 2D sign map: `+1` (Black), `-1` (White), `0` (Empty).

### Algorithm Functions

- **`BoardEstimate.areaMap(data)`**: Simple territory assignment using flood-fill. Connected empty regions bounded by a single color are assigned to that color.
- **`BoardEstimate.influenceMap(data, opts)`**: Computes discrete territory using nearest-neighbor Manhattan distance maps (`nearestNeighborMap`) and heat-diffusion radiance maps (`radianceMap`).

---

## 3. API Reference

### `BoardEstimate.evaluateJapaneseTerritory(board, options)`

Evaluates a board state under Japanese Territory rules.

**Parameters**:
- `board`: `state.board` (2D array of `{player: 'B'|'W'|null}`)
- `options`:
  - `deadStones`: Array of `{r, c}` objects identified as dead
  - `inGameCaptures`: `{B: number, W: number}`
  - `komi`: `number` (default: 6.5)
  - `handicap`: `number` (default: 0)

**Returns**:
```json
{
  "bTerritory": 48,
  "wTerritory": 65,
  "bPrisoners": 4,
  "wPrisoners": 12,
  "bInGameCaptures": 2,
  "wInGameCaptures": 5,
  "bDeadCount": 7,
  "wDeadCount": 2,
  "dameCount": 44,
  "bTotal": 52,
  "wTotal": 77,
  "diff": -25,
  "resultStr": "W+25"
}
```

### `BoardEstimate.fromBoard(board)`
Converts baduk-notes board structure to a 2D sign map (`+1`/`-1`/`0`).

### `BoardEstimate.detectDeadStonesHeuristic(data)`
Returns a 2D boolean array identifying dead stones via liberty counting and enemy radiance void tests.
