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
- **No-Markup Gate (Run Button Warns First)**:
  Japanese territory ideally requires resolving dead stones *before* counting. A game with **no** endgame markup (`DD`, `MA`, `TB`, `TW`) anywhere no longer renders an automatic result. The Computational Method Run button demands markup: when pressed with no `DD`/`MA`/`TB`/`TW` present, it shows an **amber warning** — *"No DD/MA/TB/TW endgame markup found"* — with an **Open Manual Scoring Modal** button so the user can mark dead stones (X tool), save, and run again. This replaces the earlier automatic flood-fill fallback card: an unannotated dead stone anchored inside a territorial wall makes that wall multi-colored during any flood-fill, so the historical `W+1` Go Seigen 1930 game reads `B+3` (and WASM `deadstones.guess` recovers only ~9 of ~20 dead stones → `W+33`). Dead-stone markup is the only exact source; the flood-fill path still exists inside `evaluateJapaneseTerritory` but is no longer surfaced by the Run button.
- **SGF FF[4] Territory Derivation (`TB` / `TW`)**:
  When endgame territory properties are present, the engine cross-references the board matrix against `TB` (Territory Black) and `TW` (Territory White). Any White stone (`-1`) residing inside marked Black territory (`TB`) is deduced as a dead Black prisoner (`W_prisoners += 1`). Any Black stone (`1`) residing inside marked White territory (`TW`) is deduced as a dead White prisoner (`B_prisoners += 1`). This allows automatic dead-stone resolution with 100% historical fidelity without requiring explicit `DD` tags or neural network overhead.

### Terminal-Position Resolution (Markup on the Last Move)

The scorer requires Life & Death data for the *position it scores*. Historically this created a false halt: a game whose endgame markup lives on the **terminal move** (which is where `loadSGF` folds trailing `DD`/`MA`/`TB`/`TW` properties) would halt whenever the replayer sat on an earlier node that carried no markup — even though the game was fully resolvable.

The estimator now resolves the markup source in two steps:

1. **Current node first**: if the move under the replayer carries `DD`/`MA`/`TB`/`TW`, that markup is used directly and the *current* board position is scored.
2. **Terminal fallback**: otherwise, if the game's terminal move carries markup, the engine **replays the entire game in memory** onto a fresh board using `playStoneWithCaptures`, accumulating full-game capture tallies (`compCaptures`) and reconstructing the exact terminal position (`compBoard`). The terminal position is then scored, and the card is labelled `Endgame position (move N)`.

This guarantees a game that *does* carry endgame markup never halts just because the replayer is parked mid-game. Games with **no** endgame markup anywhere now get a gated warning directing the user to the Manual Scoring Modal (see the Computational Method Gate below).

### Computational Method Gate (Run Button) & No-Markup Warning

The Computational Method is no longer rendered automatically. The Estimation modal (`⌘ + Shift + E`) now contains a **"Computational Method (Japanese Territory Rules)"** row with a Run button:

- **Locked until Game End**: the button is disabled — labelled **Locked** with the hint *"Available upon Game Ended, Dead Stones, Territories identified."* — until the replayer sits on the **final move** (`currentMoveIndex === sgfMoves.length - 1`). The game must have ended before an exact Japanese score is meaningful.
- **Enabled at the final move**: the button unlocks and shows a **▶ Run** (Play icon) state.
- **Run with markup**: `runComputationalMethod` resolves the markup source (current move → terminal move, replaying in memory when needed), runs `evaluateJapaneseTerritory` with the explicit `DD`/`MA`/`TB`/`TW` point lists, and renders the dark-navy card (`#computational-estimate-card`, section *3. Explicit Territory Counting (TB/TW Markup)*).
- **Run without markup**: `runComputationalMethod` **does not** render a score. It shows an amber warning card (`#computational-estimate-warning`) — *"No DD/MA/TB/TW endgame markup found"* — telling the user to mark dead stones with the X tool in the **Manual Scoring Modal** (via the *Open Manual Scoring Modal* button), save, then run again.

The flood-fill fallback still exists inside `evaluateJapaneseTerritory` for programmatic callers, but the Run gate stops short of it: without markup it warns instead of approximating.

### How It Works (Step-by-Step Pipeline)

```
SGF Action Log & Board Matrix
     │
     ▼
Run Gate (Computational Method button in Estimation modal)
     ├─ replayer NOT on final move ──▶ button Locked (prerequisite hint)
     └─ replayer on final move ──▶ button enabled (▶ Run)
     │
     ▼
Step 1: State Reconstruction (Grid Size, In-Game Prisoners B/W, Komi/Handicap)
     │
     ▼
Step 2: Markup Source Resolution & L&D Extraction
        (DD/MA Markup or TB/TW Territory Derivation;
         current node first, else in-memory replay to the terminal move)
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
- **Resolve the markup source**: the move under the replayer if it carries `DD`/`MA`/`TB`/`TW`; otherwise the game's terminal move. Using the terminal move triggers an in-memory full-game replay (see Terminal-Position Resolution above). If **no** node anywhere carries endgame markup, the Run gate renders an amber warning that directs the user to the Manual Scoring Modal (see Computational Method Gate above) — no score is produced.
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
- Executes territory assignment over the resolved empty intersections (explicit `TB`/`TW` markup is passed straight through; the flood-fill algorithm remains available internally for programmatic callers but is not reached by the Run gate, which warns on missing markup instead).
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
5. **Run gate**: the Computational Method row shows a **Locked** button until the replayer reaches the final move (Game End), then a **▶ Run** button. Pressing Run calls `runComputationalMethod`:
   - With `DD`/`MA`/`TB`/`TW` present → renders the deterministic Japanese Territory score card (`#computational-estimate-card`).
   - Without markup → renders the amber warning (`#computational-estimate-warning`) with an **Open Manual Scoring Modal** button.

<div style={{ border: '1px solid #f87171', background: 'linear-gradient(135deg, #450a0a 0%, #7f1d1d 100%)', borderRadius: '12px', padding: '16px 20px', marginTop: '20px', color: '#ffffff', boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)' }}>

<div style={{ color: '#fca5a5', fontWeight: 800, fontSize: '1.1rem', textTransform: 'uppercase', marginBottom: '10px', letterSpacing: '0.05em' }}>Caution / WIP / Bugs</div>

<p style={{ color: '#fecaca', fontSize: '0.9rem', lineHeight: 1.6, margin: 0 }}>The Computational Method does <strong style={{ color: '#ffffff' }}>not</strong> claim flawless operation. Known behavior and residual gaps in the deterministic scorer:</p>

<ul style={{ color: '#fecaca', fontSize: '0.9rem', lineHeight: 1.6, paddingLeft: '20px', marginTop: '8px', marginBottom: 0 }}>
<li><strong style={{ color: '#ffffff' }}>Computational Method is gated on Game End + markup</strong>: the Run button stays Locked until the replayer reaches the final move, and pressing Run with no <code style={{ color: '#fecaca' }}>DD</code>/<code style={{ color: '#fecaca' }}>MA</code>/<code style={{ color: '#fecaca' }}>TB</code>/<code style={{ color: '#fecaca' }}>TW</code> shows an amber warning — <em style={{ color: '#fecaca' }}>"No DD/MA/TB/TW endgame markup found"</em> — directing the user to the Manual Scoring Modal instead of rendering an approximate score. Because unannotated dead stones stay anchored inside territorial walls, any automatic fallback is an approximation (the 1930 Go Seigen game reads <code style={{ color: '#fecaca' }}>B+3</code> instead of the true <code style={{ color: '#fecaca' }}>W+1</code>); explicit markup is the only exact source.</li>
<li><strong style={{ color: '#ffffff' }}>Resume now restores markup (fixed)</strong>: resuming a study record whose <code style={{ color: '#fecaca' }}>workingSgf</code> lacked <code style={{ color: '#fecaca' }}>DD[</code>/<code style={{ color: '#fecaca' }}>TB[</code> previously scored via fallback because the markup was never injected (Download injected it, Resume did not). <code style={{ color: '#fecaca' }}>resumeStudySession</code> now injects the saved <code style={{ color: '#fecaca' }}>rec.scoringData</code> markup before <code style={{ color: '#fecaca' }}>loadSGF</code>, and saving from the Manual Scoring Modal mirrors the properties onto the terminal move's direct fields — so resumed games score explicitly again.</li>
<li><strong style={{ color: '#ffffff' }}>Historical halt bug (fixed)</strong>: a game whose DD/MA/TB/TW markup lives on the terminal node previously still halted whenever the replayer was parked mid-game. Fixed by folding terminal markup onto the final move and replaying the game in memory to the terminal position before scoring.</li>
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
