# Liberties — Group & Liberty Detection for Go

A standalone JavaScript module that computes groups, liberties, and liberty counts on a Go board. This is an original implementation developed for baduk-notes, inspired by the concept of **qi (气)** — the vital life force, breath, or energy that circulates through all living things — as described in classical Chinese Weiqi philosophy. In Go, liberties represent a group's qi: the open intersections where its stones can breathe. A group with no liberties has lost its qi and is captured.

## File

`liberties.js` — load as a `<script>` tag or `require()` in Node.

## API

### `Liberties.fromBoard(board)`
Convert baduk-notes board (`[{player: 'B'|'W'|null}]`) to simple string grid (`'B'`/`'W'`/`''`).

### `Liberties.computeLibertyMap(board)`
→ `Map<"col,row", Set<"libCol,libRow">>`

BFS for each stone group, records all adjacent empty intersections. Every stone in a group maps to the same Set of liberty coordinates.

### `Liberties.getGroups(board)`
→ `[{color, stones: [[r,c],...], liberties: Set, libertyCount: number}]`

Returns every group on the board with its stones and liberty count.

### `Liberties.countByColor(board)`
→ `{black: number, white: number, shared: number}`

Returns total liberty counts. Shared liberties (adjacent to both colors) are counted separately.

### `Liberties.getLibertyPoints(board)`
→ `Map<"libCol,libRow", Set<"B"|"W">>`

Inverse map: each liberty coordinate => which colors claim it. For drawing markers on the board.

### `Liberties.drawOnCanvas(ctx, board, opts)`
Draw liberty dots directly onto a canvas context:

| Style | Value |
|-------|-------|
| Black liberties | `#11FfEE` solid square |
| White liberties | `#FF0033` solid square |
| Shared liberties | Diagonal gradient: bottom-left `#11FfEE`, top-right `#FF0033` |
| Dot size | `3.5px × 3.5px` square |
| Opacity | `0.45` |
| Position | Centered on vertex |
| Border | None |

**Options:**

| Option | Default | Description |
|--------|---------|-------------|
| `padding` | `36` | Pixel offset from edge to first grid line |
| `cellSize` | auto | Computed from canvas size if null |
| `dotSize` | `3.5` | Side length of liberty square in pixels |
| `blackColor` | `'#11ffee'` | Color for Black's liberties |
| `whiteColor` | `'#ff0033'` | Color for White's liberties |
| `opacity` | `0.45` | Global alpha for liberty dots |
| `drawSquare` | `true` | `true` for squares, `false` for circles |

## Integration into baduk-notes

### 1. Add the script

```html
<script src="liberties.js"></script>
```

### 2. Draw liberty dots on the board

Call `Liberties.drawOnCanvas()` inside `renderBoardToCtx()` in `annotation_v4.js`, after drawing stones and before finishing:

```js
// In renderBoardToCtx(), after drawing all cells (~line 2741):
if (state.showLiberties) {
  Liberties.drawOnCanvas(ctx, state.board, {
    padding: PADDING,
    cellSize: CELL_SIZE,
    dotRadius: 2,
    opacity: 0.45
  })
}
```

### 3. Add a toggle

Add a checkbox or keyboard shortcut to toggle liberties display:

```js
// Add to state
state.showLiberties = false

// Toggle function
function toggleLiberties() {
  state.showLiberties = !state.showLiberties
  drawBoard()
}

// Keyboard shortcut
document.addEventListener('keydown', e => {
  if (e.shiftKey && e.metaKey && e.key === 'L') {
    toggleLiberties()
  }
})
```

### 4. Show liberty counts

Display a summary of liberty counts:

```js
let counts = Liberties.countByColor(state.board)
console.log(`Liberty Count: B = ${counts.black}  ·  W = ${counts.white}`)
```

### 5. Add a "Count Liberties" button

```js
// Trigger from UI
function showLibertyNotification() {
  const counts = Liberties.countByColor(state.board)
  const text = `Liberty Count:  B = ${counts.black}  ·  W = ${counts.white}`
  // Display in a toast/notification element
  document.getElementById('liberty-toast').textContent = text
}
```

## Algorithm

The algorithm uses **BFS flood-fill** per stone group:

1. Scan every intersection
2. When a stone is found (unvisited), start BFS to collect the entire connected group (same color, 4-directional)
3. During BFS, record all adjacent **empty** intersections as liberties (deduplicated with a Set)
4. Map every stone in the group to the same Set of liberties

For the inverse liberty→color map, each liberty coordinate tracks which colors it neighbors. A liberty adjacent to both colors is a **shared liberty** (edge of a capturing race/ko fight).

## Notes

- Works for any rectangular board size (not just 19×19).
- No external dependencies.
- Pure functions — no side effects.
