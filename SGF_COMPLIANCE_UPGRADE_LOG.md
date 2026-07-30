# SGF FF[4] Compliance Upgrade Log

**Date:** 2026-06-28  
**Project:** baduk-notes (Go Board Diagram Annotator)  
**Spec references:**
- https://red-bean.com/sgf/sgf4.html (FF[4] core)
- https://red-bean.com/sgf/go.html (Go / GM[1])
- https://red-bean.com/sgf/properties.html (property definitions)

**Purpose:** Bring SGF parsing, serialization, import, and export into alignment with SGF FF[4] for Go. This log supports reverting changes if needed.

---

## Files changed

| File | Action |
|------|--------|
| `sgf-parser.js` | **Major rewrite** — FF[4] engine |
| `annotation_v4.js` | **Updated** — `loadSGF`, `exportEditedSgf`, `goToMove`, `applyFilters`, state |
| `index.html` | **Minor** — cache-bust `sgf-parser.js?v=2.0` |
| `sgf-compliance-test.js` | **Added** — automated smoke tests |
| `SGF_COMPLIANCE_UPGRADE_LOG.md` | **Added** — this file |

---

## Revert instructions

If you need to undo this upgrade:

1. **With git** (if repo is tracked):
   ```bash
   git checkout HEAD -- sgf-parser.js annotation_v4.js index.html
   rm sgf-compliance-test.js SGF_COMPLIANCE_UPGRADE_LOG.md
   ```

2. **Without git:** Restore the pre-upgrade behavior by reversing the changes listed in each section below. The previous `sgf-parser.js` was ~229 lines; the previous `loadSGF` used manual `charCodeAt(0)-97` coordinate parsing and did not handle compressed lists, `AE`, or unknown properties.

3. **Verify after revert:** Open `index.html`, import an SGF, replay moves, export — confirm basic flow works.

---

## sgf-parser.js — changes

### Added (new public API)

| Symbol | Purpose |
|--------|---------|
| `parseSgfCollection(sgfStr)` | Parse all `(;...)` trees in a collection |
| `writeCollection(trees)` | Serialize multiple game trees |
| `cloneTree(tree)` | Deep clone for round-trip editing |
| `replaceMainLineNodes(tree, nodePropertyList)` | Update main line while keeping variations |
| `letterToIndex(ch)` / `indexToLetter(idx)` | Go coords a–z (0–25) and A–Z (26–51) |
| `parseBoardSize(szValues)` | Parse `SZ[n]` and `SZ[w:h]` |
| `parseGoPoint(str, w, h)` | Point/move incl. pass `[]` and legacy `tt` |
| `formatGoPoint(c, r)` | Encode indices to SGF point string |
| `expandPointValue(val, w, h)` | Single point or compressed rectangle `ul:lr` |
| `expandPointList(values, w, h)` | Full FF[4] point list expansion |
| `applySetupProperties(board, props, w, h)` | Apply `AB`/`AW`/`AE` without captures |
| `parseMarkupProperties(props, w, h)` | TR/SQ/CR/MA/SL/LB/CXR/CXG + TB/TW |
| `validateNodeProperties(props)` | FF[4] node constraint warnings |
| `extractUnknownProperties(props)` | Private/non-standard props for round-trip |
| `mergeUnknownProperties(nodeProps, unknown)` | Re-attach on export |
| `annotationsToProperties(anns)` | Internal annotations → SGF markup props |

### Parser improvements

- **Compressed point lists:** `AB[aa:cc]` rectangles expanded per §3.5.1
- **Duplicate properties in one node:** merged with console warning (illegal in spec)
- **Node validation:** warns on move+setup mix, B+W same node, KO without move
- **Collections:** multiple game trees parsed; `parseSgf` uses first with warning

### Serializer improvements

- **Escape `\`, `]`, and `:`** in property values (Text/SimpleText/Compose safety)

### Unchanged behavior

- `parseSgf` still returns first game tree (app entry point)
- `extractMainLine` still follows leftmost variation branch
- `writeSgf` alias for `writeTree`

---

## annotation_v4.js — changes

### State additions

```javascript
sgfTree: null,        // cloned parsed tree for variation preservation
boardWidth: 19,
boardHeight: 19,
plColor: null         // PL property from root
baselineUnknownProps: null
```

### `loadSGF(sgfString)`

| Before | After |
|--------|-------|
| Manual `charCodeAt - 97` for coords | `SgfEngine.parseGoPoint`, `expandPointList` |
| Only `AB`/`AW` on root | `applySetupProperties` incl. **`AE`** |
| No `SZ` handling | Reads size; warns if not 19×19 |
| No `PL`, `HA`, `RU` in metadata | Stored in `sgfMetadata` |
| Inline `parseAnnotations` | `parseMarkupProperties` (+ **SL** support) |
| Unknown props dropped | `extractUnknownProperties` → `baselineUnknownProps` / per-move `unknownProps` |
| No tree stored | `state.sgfTree = cloneTree(tree)` |

### `exportEditedSgf()`

| Before | After |
|--------|-------|
| `AP[Go Diagram Annotator]` (invalid) | `AP[Go Diagram Annotator:4.0]` (composed) |
| Manual coord encoding | `SgfEngine.formatGoPoint` |
| Variations lost on export | `replaceMainLineNodes` preserves branches when `isSgfDirty` |
| Unknown props lost | Merged via `mergeUnknownProperties` |
| Pass as `B[]` | Unchanged (FF[4] correct) |
| Exports `RU`, `HA`, `PL` when present | Yes |

### `goToMove(index)`

- **Pass moves:** skips `playStoneWithCaptures` when `m.isPass` (FF[4] pass has no board point)

### `applyFilters()`

- Pre-range moves applied with **`playStoneWithCaptures`** (correct Go capture rules per spec move algorithm)

---

## index.html

- Script tag: `sgf-parser.js` → `sgf-parser.js?v=2.0`

---

## sgf-compliance-test.js (new)

Run: `node sgf-compliance-test.js`

Covers: compressed lists, pass moves, 52×52 coords, escape round-trip, variations, unknown props, AE setup, validation, board size, main line.

**Last run:** 19 passed, 0 failed (2026-06-28)

---

## Intentional limits (not bugs)

These remain by design; full UI support would require larger refactors:

| Topic | Status |
|-------|--------|
| **Canvas size** | UI fixed at 19×19; other `SZ` values parse but coords outside 19×19 are ignored with warning |
| **Variation replay** | Replayer still plays **main line only**; variations are preserved in file on export |
| **Mid-game setup nodes** | Warned in console; not replayed on board |
| **Inherited props** | `VW`, `DD`, `PM`, `FG` parsed in tree but not applied to viewer crop/dim |
| **Territory TB/TW** | Parsed into markup metadata; not drawn on canvas |
| **Timing BL/WL/OB/OW** | Preserved in tree if present; not displayed |
| **KO property** | Parsed; moves always executed (spec-correct for viewers) |
| **CXR/CXG** | Private extensions (not in FF[4] standard); preserved for app round-trip |

---

## Compliance checklist (Go / FF[4])

| Requirement | Status |
|-------------|--------|
| Tree structure `(;node...(...)(...))` | ✅ |
| Property escape `\`, `]`, `:` | ✅ |
| Go point a–z and A–Z (≤52×52) | ✅ |
| Compressed point lists | ✅ |
| Pass `B[]` / `W[]` and legacy `tt` | ✅ |
| Move algorithm (place → capture → self-capture) | ✅ (existing + filter fix) |
| Setup AB/AW/AE without captures | ✅ |
| Move/setup not mixed (warn) | ✅ |
| B and W not same node (warn) | ✅ |
| Unknown properties preserved | ✅ |
| Variations preserved on export | ✅ (when tree loaded) |
| AP composed name:version | ✅ |
| FF[4] pass format on export | ✅ |
| GM[1], FF[4], CA, SZ on export | ✅ |

---

## Post-upgrade verification (manual)

1. Open `index.html` in browser (hard refresh).
2. Drop `pre_sgf/2ipk-gokifu-20160309-AlphaGo-Lee_Sedol.sgf` — players, moves, replayer work.
3. Step through moves; confirm captures increment correctly.
4. Filter move range — baseline position should respect captures.
5. Export edited SGF — open in Sabaki/CGoban; confirm valid FF[4].
6. Run `node sgf-compliance-test.js` — all green.

---

*End of log.*
