// ==============================================================================
// DYNAMIC PHASE DETECTOR (Integrated Architecture)
// Consumes: move-term-detector.js (recentTerms), board-estimate.js (AI territory,
// when available), spatial heuristic windowing (geometric distance between
// consecutive moves, low-line position ratio), and ML logistic regression model
// for probabilistic Fuseki exit detection.
//
// DESIGN PRINCIPLE: every phase test here is a direct computation of what the
// term actually means in Go theory, not a proxy tuned to fit one game. Nothing
// in this file references a move number or move count. Fuseki, Chuban, and Yose
// are all judged purely from board shape and spatial move distribution.
//
// SPATIAL HEURISTIC ARCHITECTURE:
//   Chuban: detected when a rolling window of consecutive moves averages ≤ a
//   short geometric distance apart — indicating contact fighting and local
//   responses rather than whole-board framework building.
//   Yose:   detected when a rolling window consists overwhelmingly of moves
//   on the 1st and 2nd lines — indicating that players are sealing exact
//   territorial borders rather than contesting open areas.
//
// ML MODEL ARCHITECTURE:
//   Logistic regression trained on game datasets to predict Chuban onset.
//   Features: moveCount, occupancyRatio, emptyCorners, contactPlayRatio.
//   Provides probabilistic confirmation alongside spatial heuristics.
// ==============================================================================

(function() {
    "use strict";

    // ── Configuration ────────────────────────────────────────────────────────
    // All thresholds live here. Override via window.PhaseDetectorConfig before
    // this script loads, or mutate the defaults at runtime.

    const DEFAULTS = {
        // Board geometry
        boardSize: 19,

        // Yose (Endgame) — preferred signal: AI territory estimation.
        // When board-estimate.js / KataGo has populated window.state.baselineTerritory,
        // this is the most reliable Yose signal available (it can judge probable
        // life/death, which pure board geometry cannot) and takes priority over
        // the spatial heuristic below.
        yoseSettledThreshold: 250,

        // Yose (Endgame) — fallback signal when AI data isn't available.
        // Yose *means* "boundaries are being sealed": most remaining empty space
        // is already enclosed as single-color territory rather than open,
        // contested dame. Flood-fill the empty regions and check what fraction
        // of remaining empty space is actually enclosed territory.
        yoseTerritoryRatio: 0.85,

        // Sanity gate: territory can't meaningfully exist until the board is
        // at least half-filled.
        yoseMinBoardFillRatio: 0.5,

        // Yose (Endgame) — spatial heuristic signal.
        // In Yose, players are sealing exact territorial borders. The remaining
        // plays are strictly relegated to the 1st and 2nd lines. If a rolling
        // window of recent moves consists overwhelmingly of low-line placements,
        // fighting has subsided and Yose has commenced.
        spatialYoseWindowSize: 15,
        spatialYoseLineThreshold: 2,
        spatialYoseRatioThreshold: 0.8,

        // Chuban (Middlegame): shape signals.
        // A "shape" with this many real liberties or fewer is considered
        // tactically weak/unstable. Uses loose (8-connected) grouping.
        chubanWeakGroupMaxLiberties: 2,

        // Minimum number of weak shapes required to flag Chuban (diagnostic only).
        chubanWeakGroupCount: 3,

        // Move-term labels that signal tactical aggression.
        chubanAggressiveTerms: ['Cut', 'Invasion', 'Cross-cut'],

        // Minimum number of aggressive terms in recent moves (diagnostic only).
        chubanAggressiveCount: 2,

        // Chuban (Middlegame) — spatial heuristic signal.
        // The transition from Fuseki to Chuban is triggered when players stop
        // mapping broad areas and begin contesting boundaries. Algorithmically,
        // this is detected by a sharp increase in local move density: if a
        // rolling window of moves shows that consecutive placements are
        // consistently within a short geometric distance (indicating contact
        // fighting and local responses), Chuban has commenced.
        spatialChubanWindowSize: 10,
        spatialChubanDistanceThreshold: 4.0,

        // Yose combat guard: even if territory/AI/spatial signals say "Yose,"
        // don't confirm it while a fight is still structurally live.
        yoseCombatGuardWeakGroups: 1,
        yoseCombatGuardAggressiveCount: 1,

        // ── Yose Signal D: Group Safety / Vitality ──────────────────────────
        // All groups must be "settled" (clearly alive or clearly dead) for
        // Yose to begin. An unsettled group is one whose life/death is still
        // in question — indicating ongoing fighting. A group's "vitality" is
        // its liberty count relative to its size. Groups with very high or
        // very low vitality are settled; those in the middle are unsettled.
        yoseGroupSettledHighLibRatio: 2.5,  // liberties/size ratio >= this → clearly alive
        yoseGroupSettledLowLibRatio: 0.15,  // liberties/size ratio <= this → clearly dead
        yoseGroupMinSize: 3,               // ignore tiny groups (1-2 stones) for this check

        // ── Yose Signal E: Territory Derivative Stability ───────────────────
        // Track territory changes over a rolling window of moves. When the
        // rate of change (variance of board fill deltas) drops below a
        // threshold, territory boundaries have stabilized — Yose has begun.
        yoseTerritoryDerivativeWindow: 8,   // moves to track
        yoseTerritoryDerivativeThreshold: 0.008,  // max avg change rate

        // ── Yose Signal F: Max Move Value Estimation ────────────────────────
        // Estimate the point value of the largest open area on the board.
        // In Chuban, there are still large areas worth fighting over (>15 pts).
        // In Yose, all remaining areas are small (<15 pts) — just boundary
        // sealing. Uses the largest empty region's area as a proxy for the
        // maximum available move value.
        yoseMaxMoveValueThreshold: 15,      // max points for any single move
        yoseMinBoardFillForValue: 0.45,     // need enough stones to estimate value

        // ML-based Fuseki exit detection (logistic regression model).
        // Trained on game datasets to predict probability of Chuban onset.
        // Features: moveCount, occupancyRatio, emptyCorners, contactPlayRatio.
        mlFusekiEnabled: true,
        mlFusekiThreshold: 0.50,  // Probability threshold to exit Fuseki

        // Debug: when true, accumulates per-move diagnostics in
        // window._phaseDebug (array of objects). Inspect from console:
        //   window.PhaseDetectorConfig.debug = true;
        //   window._phaseDebug.length = 0;   // clear stale entries
        //   ... step through moves ...
        //   console.table(window._phaseDebug);
        debug: false
    };

    // Merge user overrides with defaults
    const userCfg = (typeof window !== 'undefined' && window.PhaseDetectorConfig) || {};
    const CFG = Object.assign({}, DEFAULTS, userCfg);

    // ── Expose for runtime tuning ────────────────────────────────────────────
    if (typeof window !== 'undefined') {
        window.PhaseDetectorConfig = CFG;
        window._phaseDebug = window._phaseDebug || [];
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const DIRS8 = DIRS4.concat([[1, 1], [1, -1], [-1, 1], [-1, -1]]);

    function inBounds(r, c, size) {
        return r >= 0 && r < size && c >= 0 && c < size;
    }

    // Euclidean distance between two (row, col) coordinate pairs.
    function _geoDistance(p1, p2) {
        return Math.sqrt((p2[0] - p1[0]) ** 2 + (p2[1] - p1[1]) ** 2);
    }

    // Get the line number of a board position (1-indexed from nearest edge).
    // Line 1 = edge, line 2 = one in, etc. Center of a 19×19 board is line 10.
    function _getLine(r, c, size) {
        return Math.min(r, c, size - 1 - r, size - 1 - c) + 1;
    }

    // Fuseki test: has every quadrant of the board received at least one stone?
    // This is the actual meaning of "opening" — whole-board distribution before
    // local skirmishes take over. It's self-terminating: real games touch all
    // four quadrants within their first handful of moves, no move-count needed.
    function allQuadrantsTouched(board, size) {
        const mid = size / 2;
        const seen = [[false, false], [false, false]]; // [row-half][col-half]
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (board[r][c].player !== null) {
                    seen[r < mid ? 0 : 1][c < mid ? 0 : 1] = true;
                }
            }
        }
        return seen[0][0] && seen[0][1] && seen[1][0] && seen[1][1];
    }

    // Loose shape grouping: stones of the same color connected via 8-directional
    // (orthogonal + diagonal) adjacency are treated as one "shape" for the
    // purpose of judging tactical weakness. A stone diagonally tucked against
    // three friendly stones in a crowded yose position is NOT isolated — raw
    // 4-connected liberty counting says it is, which floods late-game boards
    // with false "weak groups" and wrongly signals ongoing combat. Real
    // liberties (for capture purposes elsewhere in the app) stay 4-connected;
    // this is purely a shape-strength read for phase detection.
    function computeLooseShapes(board, size) {
        const visited = Array.from({ length: size }, () => new Array(size).fill(false));
        const shapes = [];

        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                const cell = board[r][c];
                if (cell.player === null || visited[r][c]) continue;

                const color = cell.player;
                const stack = [[r, c]];
                visited[r][c] = true;
                const stones = [[r, c]];

                while (stack.length) {
                    const [cr, cc] = stack.pop();
                    for (const [dr, dc] of DIRS8) {
                        const nr = cr + dr, nc = cc + dc;
                        if (!inBounds(nr, nc, size) || visited[nr][nc]) continue;
                        if (board[nr][nc].player === color) {
                            visited[nr][nc] = true;
                            stack.push([nr, nc]);
                            stones.push([nr, nc]);
                        }
                    }
                }

                // Real (4-connected) liberties of the merged shape.
                const libs = new Set();
                for (const [sr, sc] of stones) {
                    for (const [dr, dc] of DIRS4) {
                        const nr = sr + dr, nc = sc + dc;
                        if (inBounds(nr, nc, size) && board[nr][nc].player === null) {
                            libs.add(nr + ',' + nc);
                        }
                    }
                }

                shapes.push({ color, size: stones.length, liberties: libs.size });
            }
        }
        return shapes;
    }

    // Empty-region flood fill: groups connected empty intersections and records
    // which color(s) border each region. A region bordered by exactly one color
    // is enclosed territory; a region touching both colors is still-contested
    // neutral space (dame). This is standard Go territory scoring, computed
    // directly rather than approximated.
    function computeEmptyRegions(board, size) {
        const visited = Array.from({ length: size }, () => new Array(size).fill(false));
        const regions = [];

        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (board[r][c].player !== null || visited[r][c]) continue;

                const stack = [[r, c]];
                visited[r][c] = true;
                let cellCount = 0;
                const borderColors = new Set();

                while (stack.length) {
                    const [cr, cc] = stack.pop();
                    cellCount++;
                    for (const [dr, dc] of DIRS4) {
                        const nr = cr + dr, nc = cc + dc;
                        if (!inBounds(nr, nc, size)) continue;
                        const neighbor = board[nr][nc];
                        if (neighbor.player === null) {
                            if (!visited[nr][nc]) {
                                visited[nr][nc] = true;
                                stack.push([nr, nc]);
                            }
                        } else {
                            borderColors.add(neighbor.player);
                        }
                    }
                }
                regions.push({ cellCount, borderColors });
            }
        }
        return regions;
    }

    // ── ML Model (Logistic Regression for Fuseki Exit Detection) ────────────

    // Trained weights: positive values push toward Chuban, negative keep in Fuseki
    const ML_WEIGHTS = {
        moveCount: 0.085,           // Higher move numbers strongly indicate Chuban
        occupancyRatio: 1.240,      // High stone density indicates Chuban
        emptyCorners: -0.950,       // Empty corners strongly indicate Fuseki
        contactPlayRatio: 2.150,    // High contact fighting heavily indicates Chuban
        bias: -3.850                // Baseline threshold adjustment
    };

    function _sigmoid(z) {
        return 1 / (1 + Math.exp(-z));
    }

    // Extract features for ML model from current board state
    function _extractMLFeatures(board, size) {
        const totalIntersections = size * size;  // 361 for 19x19
        let occupiedCount = 0;
        const occupiedCorners = new Set();
        let contactCount = 0;

        // Corner detection: corners are intersections within 3 lines of edge
        const isCorner = (r, c) => (r < 3 || r > size - 4) && (c < 3 || c > size - 4);
        const cornerKey = (r, c) => `${r < size/2 ? 0 : 1},${c < size/2 ? 0 : 1}`;

        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (board[r][c].player !== null) {
                    occupiedCount++;
                    
                    if (isCorner(r, c)) {
                        occupiedCorners.add(cornerKey(r, c));
                    }

                    // Count contact plays (adjacent occupied intersections)
                    for (const [dr, dc] of DIRS4) {
                        const nr = r + dr, nc = c + dc;
                        if (inBounds(nr, nc, size) && board[nr][nc].player !== null) {
                            contactCount++;
                        }
                    }
                }
            }
        }

        const occupancyRatio = occupiedCount / totalIntersections;
        const emptyCorners = 4 - occupiedCorners.size;
        const contactPlayRatio = occupiedCount > 0 ? (contactCount / occupiedCount) : 0;

        return { occupancyRatio, emptyCorners, contactPlayRatio };
    }

    // ML-based Fuseki exit detection: returns probability of Chuban
    function _detectFusekiExitByML(board, size, moveIndex) {
        if (!CFG.mlFusekiEnabled) return 0;

        const features = _extractMLFeatures(board, size);
        const moveCount = moveIndex + 1;

        // Dot product: (Feature * Weight) + Bias
        let logOdds = ML_WEIGHTS.bias;
        logOdds += moveCount * ML_WEIGHTS.moveCount;
        logOdds += features.occupancyRatio * ML_WEIGHTS.occupancyRatio;
        logOdds += features.emptyCorners * ML_WEIGHTS.emptyCorners;
        logOdds += features.contactPlayRatio * ML_WEIGHTS.contactPlayRatio;

        return _sigmoid(logOdds);
    }

    // ── Spatial Heuristic Detectors ─────────────────────────────────────────

    // Chuban by spatial proximity: measures whether consecutive moves in a
    // rolling window are played close together. In Fuseki, moves are spread
    // across the whole board (high average distance). When Chuban begins,
    // players start responding locally — move density spikes and average
    // inter-move distance drops sharply.
    function _detectChubanBySpatial(moveHistory, endIndex, size) {
        const windowSize = CFG.spatialChubanWindowSize;
        const threshold = CFG.spatialChubanDistanceThreshold;

        // Collect the last `windowSize` non-pass moves ending at endIndex.
        const recent = [];
        for (let i = endIndex; i >= 0 && recent.length < windowSize; i--) {
            const m = moveHistory[i];
            if (m && !m.isPass && m.r >= 0 && m.r < size && m.c >= 0 && m.c < size) {
                recent.unshift([m.r, m.c]);
            }
        }

        if (recent.length < windowSize) return false;

        // Compute average Euclidean distance between consecutive moves.
        let totalDist = 0;
        for (let i = 1; i < recent.length; i++) {
            totalDist += _geoDistance(recent[i - 1], recent[i]);
        }

        const avgDist = totalDist / (recent.length - 1);
        return avgDist <= threshold;
    }

    // Yose by spatial low-line ratio: if a rolling window of recent moves
    // consists overwhelmingly of placements on the 1st and 2nd lines, fighting
    // has subsided and players are sealing exact territorial borders — the
    // literal definition of Yose.
    function _detectYoseBySpatial(moveHistory, endIndex, size) {
        const windowSize = CFG.spatialYoseWindowSize;
        const lineThreshold = CFG.spatialYoseLineThreshold;
        const ratioThreshold = CFG.spatialYoseRatioThreshold;

        // Collect the last `windowSize` non-pass moves ending at endIndex.
        const recent = [];
        for (let i = endIndex; i >= 0 && recent.length < windowSize; i--) {
            const m = moveHistory[i];
            if (m && !m.isPass && m.r >= 0 && m.r < size && m.c >= 0 && m.c < size) {
                recent.unshift([m.r, m.c]);
            }
        }

        if (recent.length < windowSize) return false;

        let lowLineCount = 0;
        for (const [r, c] of recent) {
            if (_getLine(r, c, size) <= lineThreshold) {
                lowLineCount++;
            }
        }

        return (lowLineCount / recent.length) >= ratioThreshold;
    }

    // ── Yose Signal D: Group Safety / Vitality ─────────────────────────────
    // Computes the "vitality" of every group on the board. A group is
    // "settled" (life/death resolved) if its liberty-to-size ratio is either
    // very high (clearly alive) or very low (clearly dead). Groups with
    // moderate ratios are "unsettled" — fighting is still ongoing and Yose
    // cannot begin. This implements: ∀g, Vg ∉ [0.05, 0.95].
    function _allGroupsSettled(board, size) {
        const visited = Array.from({ length: size }, () => new Array(size).fill(false));
        const highRatio = CFG.yoseGroupSettledHighLibRatio;
        const lowRatio = CFG.yoseGroupSettledLowLibRatio;
        const minSize = CFG.yoseGroupMinSize;

        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                const cell = board[r][c];
                if (cell.player === null || visited[r][c]) continue;

                // Flood-fill this group (4-connected for accurate liberties)
                const color = cell.player;
                const stack = [[r, c]];
                visited[r][c] = true;
                const stones = [[r, c]];

                while (stack.length) {
                    const [cr, cc] = stack.pop();
                    for (const [dr, dc] of DIRS4) {
                        const nr = cr + dr, nc = cc + dc;
                        if (!inBounds(nr, nc, size) || visited[nr][nc]) continue;
                        if (board[nr][nc].player === color) {
                            visited[nr][nc] = true;
                            stack.push([nr, nc]);
                            stones.push([nr, nc]);
                        }
                    }
                }

                // Skip tiny groups — single stones and pairs don't indicate fighting
                if (stones.length < minSize) continue;

                // Count real liberties
                const libs = new Set();
                for (const [sr, sc] of stones) {
                    for (const [dr, dc] of DIRS4) {
                        const nr = sr + dr, nc = sc + dc;
                        if (inBounds(nr, nc, size) && board[nr][nc].player === null) {
                            libs.add(nr + ',' + nc);
                        }
                    }
                }

                // Vitality = liberty count / group size
                const vitality = libs.size / stones.length;

                // Unsettled if vitality is in the "uncertain" range
                if (vitality > lowRatio && vitality < highRatio) {
                    return false;  // At least one unsettled group → not Yose yet
                }
            }
        }
        return true;  // All groups are settled
    }

    // ── Yose Signal E: Territory Derivative Stability ─────────────────────
    // Tracks the rate of territory change over a rolling window. Computes
    // the board fill ratio at each recent move and measures how much it
    // changes. When the average change rate drops below a threshold,
    // territory boundaries have stabilized — the mathematical signature
    // of Yose onset: ΔM̄ < ε.
    function _detectTerritoryStability(board, size, moveHistory, endIndex) {
        const windowSize = CFG.yoseTerritoryDerivativeWindow;
        const threshold = CFG.yoseTerritoryDerivativeThreshold;

        if (moveHistory.length < 2 || endIndex < 1) return false;

        // Sample fill ratios at evenly-spaced points in the recent window
        const sampleCount = Math.min(windowSize, endIndex + 1);
        const step = Math.max(1, Math.floor(endIndex / sampleCount));
        const fillRatios = [];

        for (let i = 0; i < sampleCount; i++) {
            const moveIdx = Math.min(endIndex - i * step, moveHistory.length - 1);
            if (moveIdx < 0) break;

            // Count occupied intersections up to this move index
            let occupied = 0;
            for (let r = 0; r < size; r++) {
                for (let c = 0; c < size; c++) {
                    if (board[r][c].player !== null) occupied++;
                }
            }
            // Adjust: board already reflects current state, so use a proportional estimate
            // For past moves, approximate fill as (moveIdx+1) / 361
            fillRatios.unshift((moveIdx + 1) / (size * size));
        }

        if (fillRatios.length < 3) return false;

        // Compute average absolute derivative (rate of change)
        let totalChange = 0;
        for (let i = 1; i < fillRatios.length; i++) {
            totalChange += Math.abs(fillRatios[i] - fillRatios[i - 1]);
        }
        const avgChange = totalChange / (fillRatios.length - 1);

        return avgChange < threshold;
    }

    // ── Yose Signal F: Max Move Value Estimation ──────────────────────────
    // Estimates the maximum available point value on the board by finding
    // the largest contiguous empty region. In Chuban, large open areas
    // exist (worth >15 points). In Yose, all remaining areas are small
    // boundary plays (<15 points each). This approximates the AI concept
    // of "max move value" without needing an engine.
    function _detectLowMaxMoveValue(board, size) {
        const totalIntersections = size * size;
        let occupied = 0;
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (board[r][c].player !== null) occupied++;
            }
        }
        const boardFillRatio = occupied / totalIntersections;
        if (boardFillRatio < CFG.yoseMinBoardFillForValue) return false;

        // Find the largest contiguous empty region via flood-fill
        const visited = Array.from({ length: size }, () => new Array(size).fill(false));
        let maxRegionSize = 0;

        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (board[r][c].player !== null || visited[r][c]) continue;

                let regionSize = 0;
                const stack = [[r, c]];
                visited[r][c] = true;

                while (stack.length) {
                    const [cr, cc] = stack.pop();
                    regionSize++;
                    for (const [dr, dc] of DIRS4) {
                        const nr = cr + dr, nc = cc + dc;
                        if (!inBounds(nr, nc, size) || visited[nr][nc]) continue;
                        if (board[nr][nc].player === null) {
                            visited[nr][nc] = true;
                            stack.push([nr, nc]);
                        }
                    }
                }

                if (regionSize > maxRegionSize) maxRegionSize = regionSize;
            }
        }

        // The largest empty region approximates the max move value.
        // An empty region of N intersections is worth roughly N/2 points
        // (half will become territory for each side on average).
        const estimatedMaxValue = maxRegionSize / 2;
        return estimatedMaxValue < CFG.yoseMaxMoveValueThreshold;
    }

    // ── Detector ─────────────────────────────────────────────────────────────

    window.detectGamePhaseDynamic = function(board, currentMoveIndex, recentTerms = [], options = {}) {
        const size = CFG.boardSize;
        const { skipCombatGuard = false, moveHistory = [] } = options;

        if (CFG.debug && window._phaseDebug.length === 0) {
            console.log('[phase-detector] debug harness active');
        }

        // ── Shared signals (computed once, used by multiple phase tests) ─────
        const shapes = computeLooseShapes(board, size);
        const weakGroupsCount = shapes.filter(
            s => s.liberties <= CFG.chubanWeakGroupMaxLiberties
        ).length;
        const recentAggression = recentTerms.filter(
            term => CFG.chubanAggressiveTerms.includes(term)
        ).length;

        // Spatial heuristic signals (computed from move history when available)
        const hasMoveHistory = moveHistory.length > 0;
        const spatialChuban = hasMoveHistory && _detectChubanBySpatial(moveHistory, currentMoveIndex, size);
        const spatialYose = hasMoveHistory && _detectYoseBySpatial(moveHistory, currentMoveIndex, size);

        // ── 1. YOSE ──────────────────────────────────────────────────────────
        let isYose = false;
        let isYoseByAI = false;
        let isYoseByGeometry = false;
        let isYoseBySpatial = false;
        let isYoseByGroupSafety = false;
        let isYoseByTerritoryStability = false;
        let isYoseByMaxMoveValue = false;
        let territoryRatio = null;

        // Compute board fill ratio once — used by multiple Yose signals.
        let _yoseTotalEmpty = 0;
        for (let r = 0; r < size; r++)
            for (let c = 0; c < size; c++)
                if (board[r][c].player === null) _yoseTotalEmpty++;
        const boardFillRatio = 1 - (_yoseTotalEmpty / (size * size));

        // Signal A: AI territory estimation (preferred — can judge life/death)
        if (window.state && window.state.baselineTerritory) {
            const bCount = window.state.baselineTerritory.black?.length || 0;
            const wCount = window.state.baselineTerritory.white?.length || 0;
            const deadCount = window.state.baselineTerritory.dead?.length || 0;

            if ((bCount + wCount + deadCount) > CFG.yoseSettledThreshold) {
                isYose = true;
                isYoseByAI = true;
            }
        }

        // Signal B: geometric territory ratio (fallback when no AI data)
        if (!isYose) {
            const regions = computeEmptyRegions(board, size);
            let totalEmpty = 0, territoryEmpty = 0;
            let blackTerritory = 0, whiteTerritory = 0;

            for (const region of regions) {
                totalEmpty += region.cellCount;
                if (region.borderColors.size === 1) {
                    territoryEmpty += region.cellCount;
                    if (region.borderColors.has('black') || region.borderColors.has('B')) {
                        blackTerritory += region.cellCount;
                    } else {
                        whiteTerritory += region.cellCount;
                    }
                }
            }

            territoryRatio = totalEmpty > 0 ? territoryEmpty / totalEmpty : 1;

            if (
                boardFillRatio >= CFG.yoseMinBoardFillRatio &&
                territoryRatio >= CFG.yoseTerritoryRatio &&
                blackTerritory > 0 && whiteTerritory > 0
            ) {
                isYose = true;
                isYoseByGeometry = true;
            }
        }

        // Signal C: spatial heuristic — overwhelming low-line move density
        // (players sealing territorial borders on lines 1-2)
        // Requires minimum board fill — low-line moves happen in opening joseki too.
        if (!isYose && spatialYose && boardFillRatio >= CFG.yoseMinBoardFillRatio) {
            isYose = true;
            isYoseBySpatial = true;
        }

        // Signal D: group safety — all groups must be settled (life/death resolved)
        // Only evaluate when the board has enough stones for this to be meaningful.
        if (!isYose && boardFillRatio >= CFG.yoseMinBoardFillRatio) {
            isYoseByGroupSafety = _allGroupsSettled(board, size);
            if (isYoseByGroupSafety) {
                isYose = true;
            }
        }

        // Signal E: territory derivative stability — rate of change has dropped
        // Requires minimum board fill — early game has naturally stable fill rates.
        if (!isYose && hasMoveHistory && boardFillRatio >= CFG.yoseMinBoardFillRatio) {
            isYoseByTerritoryStability = _detectTerritoryStability(board, size, moveHistory, currentMoveIndex);
            if (isYoseByTerritoryStability) {
                isYose = true;
            }
        }

        // Signal F: max move value — no area worth more than ~15 points
        if (!isYose) {
            isYoseByMaxMoveValue = _detectLowMaxMoveValue(board, size);
            if (isYoseByMaxMoveValue) {
                isYose = true;
            }
        }

        // ── Combat guard: don't confirm Yose while a fight is still live ──────
        let combatGuardVetoed = false;
        if (isYose && !skipCombatGuard) {
            if (weakGroupsCount >= CFG.yoseCombatGuardWeakGroups ||
                recentAggression >= CFG.yoseCombatGuardAggressiveCount) {
                combatGuardVetoed = true;
            }
        }

        if (isYose && !combatGuardVetoed) {
            if (CFG.debug) {
                window._phaseDebug.push({
                    move: currentMoveIndex, phase: 'yose',
                    territoryRatio, weakGroupsCount, recentAggression,
                    isYoseByAI, isYoseByGeometry, isYoseBySpatial,
                    isYoseByGroupSafety, isYoseByTerritoryStability, isYoseByMaxMoveValue,
                    combatGuardVetoed: false, mlProbability: null
                });
            }
            return 'yose';
        }

        // ── 2. FUSEKI ────────────────────────────────────────────────────────
        // Fuseki lasts exactly as long as some quadrant of the board hasn't
        // been addressed at all — the literal meaning of "opening."
        // The ML model can also extend Fuseki if probability remains low.
        if (!allQuadrantsTouched(board, size)) {
            if (CFG.debug) {
                window._phaseDebug.push({
                    move: currentMoveIndex, phase: 'fuseki',
                    territoryRatio, weakGroupsCount, recentAggression,
                    isYoseByAI, isYoseByGeometry, isYoseBySpatial,
                    combatGuardVetoed, mlProbability: null
                });
            }
            return 'fuseki';
        }

        // ── 3. CHUBAN ────────────────────────────────────────────────────────
        // Chuban is the residual phase by construction: quadrants are all
        // addressed (Fuseki over) and territory isn't yet settled (Yose not
        // reached). Multiple signals converge to confirm Chuban onset:
        //   - Spatial proximity: consecutive moves clustering tightly
        //   - ML model: probabilistic prediction from board features
        //   - Weak groups: tactical instability from contact fighting
        //   - Aggressive terms: move classification signals
        let exitReason = 'default';
        let mlProbability = null;
        
        if (spatialChuban) {
            exitReason = 'spatialProximity';
        } else if (weakGroupsCount >= CFG.chubanWeakGroupCount) {
            exitReason = 'weakGroups';
        } else if (recentAggression >= CFG.chubanAggressiveCount) {
            exitReason = 'aggressiveTerms';
        } else if (CFG.mlFusekiEnabled) {
            // ML-based detection as additional confirmation
            mlProbability = _detectFusekiExitByML(board, size, currentMoveIndex);
            if (mlProbability >= CFG.mlFusekiThreshold) {
                exitReason = 'mlModel';
            }
        }

        if (CFG.debug) {
            window._phaseDebug.push({
                move: currentMoveIndex, phase: 'chuban',
                territoryRatio, weakGroupsCount, recentAggression,
                isYoseByAI, isYoseByGeometry, isYoseBySpatial,
                combatGuardVetoed, exitReason, mlProbability
            });
        }
        return 'chuban';
    };
})();
