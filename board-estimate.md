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

`White Total = W_territory + W_prisoners + Komi + Handicap`  
`Black Total = B_territory + B_prisoners`  
`Result = White Total - Black Total`

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
  Territory scoring relies strictly on topological enclosure. Scrubbing living boundary stones blows massive holes in White's territorial walls. When Step 3 executes its recursive flood-fill algorithm, the search leaks through the missing wall stones, causing enclosed White territory to merge with empty space and touch Black stones. The algorithm applies the Japanese rule: **Bounded by both colors = Neutral Dame / Seki (0 territory)**. Over a third of the board (107 pts) is nullified into neutral space, collapsing White's score to an erroneous `B+26` instead of `W+1`.
- **Architectural Tradeoff & Hard Failure Design Choice**:
  Japanese territory cannot be mathematically scored without resolving dead stones first. Applying a "Zero Scrub" fallback leaves dead opponent stones anchored inside territorial walls. During flood-fill, the search encounters multi-colored boundaries (the defending wall + internal unscrubbed dead stone), incorrectly nullifying secured territory into neutral *Dame* (e.g. converting a historical `W+1` victory into an algorithmic hallucination of `B+3`). Therefore, the engine enforces a **Hard Failure**: if an SGF node lacks explicit endgame markup (`DD`, `MA`, `TB`, `TW`) or neural AI L&D data, the pipeline halts execution and prompts the user to resolve dead stones rather than outputting a mathematically flawed score.
- **SGF FF[4] Territory Derivation (`TB` / `TW`)**:
  When endgame territory properties are present, the engine cross-references the board matrix against `TB` (Territory Black) and `TW` (Territory White). Any White stone (`-1`) residing inside marked Black territory (`TB`) is deduced as a dead Black prisoner (`W_prisoners += 1`). Any Black stone (`1`) residing inside marked White territory (`TW`) is deduced as a dead White prisoner (`B_prisoners += 1`). This allows automatic dead-stone resolution with 100% historical fidelity without requiring explicit `DD` tags or neural network overhead.

### How It Works (Step-by-Step Pipeline)

```
SGF Action Log & Board Matrix
     │
     ▼
Step 1: State Reconstruction (Grid Size, In-Game Prisoners B/W, Komi/Handicap)
     │
     ▼
Step 2: SGF Endgame Resolution (DD/MA Markup or TB/TW Territory Derivation)
        (Dead Black Stones → W Prisoners += 1; Dead White Stones → B Prisoners += 1; Scrub Dead from Grid)
     │
     ▼
Step 3: Flood-Fill Territory Counting
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

#### Step 2: SGF Endgame Markup Extraction & Territory Derivation
- Inspects the SGF node for FF[4] properties:
  - **Explicit Markup**: `DD` (Dimmed / Dead stones) and `MA` (Marked with X).
  - **Territory Derivation**: `TB` (Territory Black) and `TW` (Territory White).
- If `TB` or `TW` are present:
  - Any White stone (`-1`) located within `TB` bounds is deduced as a dead Black prisoner (`W_prisoners += 1`).
  - Any Black stone (`1`) located within `TW` bounds is deduced as a dead Black prisoner (`B_prisoners += 1`).
- Expands single coordinates (`[ab]`) and compressed rectangles (`[ab:cd]`) using `SgfEngine.expandPointList`.
- **Prisoner Allocation**:
  - Each Black dead stone is scrubbed from the grid and awarded to White's final prisoners (`W_prisoners += 1`).
  - Each White dead stone is scrubbed from the grid and awarded to Black's final prisoners (`B_prisoners += 1`).
  - Scrubbed intersections become empty points for territory flood-fill.

#### Step 3: Flood-Fill Territory Counting
- Executes a recursive flood-fill algorithm across unvisited empty intersections.
- Evaluates the set of surrounding stone colors for each contiguous empty region:
  - Bounded **ONLY by Black stones** → Black Territory (`B_territory += region_size`).
  - Bounded **ONLY by White stones** → White Territory (`W_territory += region_size`).
  - Bounded by **both Black and White stones** (dame / neutral / seki) → Ignored (0 territory).

#### Step 4 & 5: Final Japanese Territory Differential Execution
- Calculates total scores:
  - `Black Total = B_territory + B_prisoners`
  - `White Total = W_territory + W_prisoners + Komi + Handicap`
- Formats the exact result string: `W+<diff>`, `B+<diff>`, or `Draw`.

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

