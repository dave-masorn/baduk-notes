// Verify: MSM Display Options "w/#" territory group counts.
//
//   GROUPS   — each 4-connected same-color territory region shows ONE number = its point
//             count, placed at the group centroid: odd groups center on a stone point,
//             even groups on the grid-line crossing. (User examples: A19..B17 = "6" on
//             horizontal line 18 between columns A/B; P1..T1 = "5" over R1.)
//   SPLIT    — points touching only diagonally are NOT one group.
//   MERGE    — orthogonally adjacent points join into one group.
//   COLOR    — number fill color = territory color (black #FCD102, white #101389), rendered
//             as PURE font text in 'Figtree' (the registered 400-weight face IS
//             Figtree-SemiBold.ttf): no shadow, no halo, no stroked border; while an EDITING
//             mode is active (Replacing Dead Stones / re-Arranging Stones) the digits switch
//             to the matching italic (Figtree-SemiBoldItalic.ttf) as an editing cue.
//   SIZE     — text size scales with group size.
//   TOGGLE   — the w/# checkbox wires scoringState.showTerritoryCounts and redraws; with
//             it off (or "Show territory" off) no numbers render.
//   POST-LOCK — w/# is the ONLY display value that ADAPTS after D&T Lock: the counter
//             re-counts on the current playground board (replaces/re-arranges shrink or
//             grow a group) while the frozen score never moves.
const path = require('path');
const http = require('http');
const fs = require('fs');
const { launchLightpanda, probeCapabilities } = require('./lightpanda-launcher.js');

const REPO = '/Users/davemasorn/AntiGravity/baduk-notes';
const PORT = 3951;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const filePath = path.join(REPO, urlPath === '/' ? 'index.html' : urlPath);
  if (!filePath.startsWith(REPO)) { res.writeHead(403); res.end(); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
});

let results = [];
let skipped = 0;
function check(name, cond, detail) {
  results.push({ pass: !!cond, name });
  console.log(`[${cond ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
}
function skip(name, reason) {
  skipped++;
  console.log(`[SKIP] ${name} — ${reason}`);
}

async function main() {
  await new Promise((r) => server.listen(PORT, r));
  const { page, close } = await launchLightpanda();
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.scoringState && typeof window.drawBoard === 'function' && window.GoScorer, { timeout: 20000 });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 400)));

  // Lightpanda capabilities: canvas is a stub (no gradients, getImageData zeros) and
  // layout/hit-testing is unreliable (getBoundingClientRect ≈ 5px), so the merged-fill
  // badge checks and the real-click-through-overlay check are SKIPPED there. The
  // count-text (fillText capture), geometry (roundedRectPathCorners capture) and all
  // state/logic checks run everywhere.
  const caps = await probeCapabilities(page);
  const RENDER_OK = caps.gradients;
  const LAYOUT_OK = caps.layout;
  const fillOrSkip = (name, cond, detail) => {
    if (!RENDER_OK) { skip(name, 'no canvas gradient rendering (badge fills unverifiable)'); return; }
    check(name, cond, detail);
  };

  const SGF = '(;GM[1]FF[4]SZ[19]PB[Black]PW[White]RE[W+6.5]KM[6.5]RU[Japanese];B[pd];W[pp];B[dp];W[dd])';
  await page.evaluate(({ sgf, id }) => {
    window.loadSGF(sgf);
    if (window.state.sgfMoves && window.state.sgfMoves.length > 0) {
      window.goToMove(window.state.sgfMoves.length - 1);
    }
    window.StudyRecordDB.saveRecord({ id, recNo: '04', fileNm: 'territory-counts.sgf', workingSgf: sgf, currentMoveIndex: -1 });
    window.state.activeStudyId = id;
  }, { sgf: SGF, id: 'territory-counts' });
  await page.evaluate(() => {
    const ge = document.getElementById('game-end-popup');
    if (ge) ge.style.display = 'none';
    window.openScoringModal();
  });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 300)));

  // Patch fillText BEFORE drawing: capture count draws (Figtree non-`normal` digits — the
  // `normal ... 'Figtree'` coordinate labels and any `normal` text are excluded) with position,
  // font, color. The scoring canvas coordinate row labels render in `system-ui`, never Figtree,
  // so Figtree digits are exactly the territory-group numbers.
  await page.evaluate(() => {
    if (!window.__tcPatched) {
      window.__tcShots = [];
      const isCount = (ctx) => ctx.font && /Figtree/.test(ctx.font) && !/normal/.test(ctx.font);
      const orig = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxW) {
        if (isCount(this) && /^\d+$/.test(String(text))) {
          window.__tcShots.push({
            text: String(text), x, y, font: this.font, fillStyle: this.fillStyle,
            shadowOffsetX: this.shadowOffsetX, shadowOffsetY: this.shadowOffsetY,
            shadowBlur: this.shadowBlur, shadowColor: this.shadowColor
          });
        }
        return orig.call(this, text, x, y, maxW);
      };
      // Count-number borders must NOT be drawn: any count-digit strokeText is a regression.
      window.__tcStrokes = [];
      const origStroke = CanvasRenderingContext2D.prototype.strokeText;
      CanvasRenderingContext2D.prototype.strokeText = function (text, x, y, maxW) {
        if (isCount(this) && /^\d+$/.test(String(text))) {
          window.__tcStrokes.push(String(text));
        }
        return origStroke.call(this, text, x, y, maxW);
      };
      // Merged crossword badges: roundedRectPathCorners is a global classic-script function, so it
      // is patchable here. Every 40%-translucent fill (black box / white box) is unique to these
      // badges (no other draw op uses a 0.4 alpha), so capturing fill() with those colors
      // isolates exactly the badge fills.
      window.__tcBoxes = [];
      const origRRC = window.roundedRectPathCorners;
      window.roundedRectPathCorners = function (ctx, x, y, w, h, rTL, rTR, rBR, rBL) {
        window.__tcBoxes.push({ x, y, w, h, rTL, rTR, rBR, rBL });
        return origRRC.call(this, ctx, x, y, w, h, rTL, rTR, rBR, rBL);
      };
      window.__tcBoxFills = [];
      const origFill = CanvasRenderingContext2D.prototype.fill;
      CanvasRenderingContext2D.prototype.fill = function () {
        const fs = String(this.fillStyle);
        if (fs === 'rgba(17, 24, 39, 0.4)' || fs === 'rgba(255, 255, 255, 0.4)') {
          window.__tcBoxFills.push(fs);
        }
        return origFill.apply(this, arguments);
      };
      window.__tcPatched = true;
    }
    window.__tcShots = [];
    window.__tcStrokes = [];
    window.__tcBoxes = [];
    window.__tcBoxFills = [];
  });

  // Fixture: EMPTY board (no algorithmic territory) + manual territory marks only.
  await page.evaluate(() => {
    const empty = () => Array.from({ length: 19 }, () => Array.from({ length: 19 }, () => 0));
    scoringState.board = empty();
    scoringState.markedDead = empty();
    scoringState.deadStonesInfo = empty();
    scoringState.manualTerritory = empty();
    scoringState.showTerritory = true;
    scoringState.showTerritoryCounts = false;
    scoringState.showDead = false;
    scoringState.ruleMode = 'japanese';
    scoringState.locked = false;
    scoringState.lockedSnapshot = null;
    window.setScoringFrozen(false);
    const st = state.scoringBoardStyle || JSON.parse(JSON.stringify(state.initialBoardStyle));
    st.board = st.board || {};
    st.board.useColor = true;
    state.scoringBoardStyle = st;
    window.scoringBoardBgImage = null;
    // Black group (user example): A19,A18,A17,B19,B18,B17 = rows 0-2, cols 0-1  -> "6"
    for (const r of [0, 1, 2]) for (const c of [0, 1]) scoringState.manualTerritory[r][c] = 1;
    // White group (user example): P1,Q1,R1,S1,T1 = row 18, cols 14-18          -> "5"
    for (const c of [14, 15, 16, 17, 18]) scoringState.manualTerritory[18][c] = 2;
    // White 3x3 block: rows 4-6, cols 10-12                                     -> "9"
    for (const r of [4, 5, 6]) for (const c of [10, 11, 12]) scoringState.manualTerritory[r][c] = 2;
    // Black diagonal pair: (8,4),(9,5) touch only diagonally -> two "1"s, NOT "2"
    scoringState.manualTerritory[8][4] = 1;
    scoringState.manualTerritory[9][5] = 1;
    // Black orthogonal pair: (11,4),(11,5) -> one "2"
    scoringState.manualTerritory[11][4] = 1;
    scoringState.manualTerritory[11][5] = 1;
    window.drawBoard();
  });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 200)));

  const shots = () => page.evaluate(() => window.__tcShots.map((s) => ({ ...s })));
  const sizeOf = (font) => parseFloat(String(font).match(/([\d.]+)px/)[1]);
  const PADDING = 36, CELL = (600 - 72) / 18;
  const near = (a, b, tol = 2.5) => Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol;
  const findShot = (list, text, x, y) => list.find((s) => s.text === text && near([s.x, s.y], [x, y]));

  // Toggle: w/# checkbox drives the state flag. The fixture drew with w/# OFF, so no numbers
  // yet; the click turns the flag on AND redraws (6 numbers). Reset the shot buffer and redraw
  // once more so the group assertions below see exactly one draw pass.
  check('toggle: w/# unchecked initially rendered no numbers',
    (await page.evaluate(() => window.__tcShots)).length === 0,
    'no bold-digit shots captured with w/# off');
  await page.evaluate(() => document.getElementById('scoring-opt-territory-counts').click());
  check('toggle: clicking w/# sets scoringState.showTerritoryCounts',
    await page.evaluate(() => scoringState.showTerritoryCounts === true));

  // BUG-1 REGRESSION: the toggle's own redraw starts each fresh badge at boxScale 0.05 (nearly
  // invisible). The app must schedule its own follow-up redraws so the boxes become visible
  // WITHOUT any further user interaction. Wait out the 350ms pop with NO manual drawBoard, then
  // verify the boxes landed at full scale — proving the pop-in loop drew them to completion.
  await page.evaluate(() => { window.__tcShots = []; window.__tcBoxes = []; window.__tcBoxFills = []; });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 450)));
  check('first-click pop: boxes draw themselves to full scale (no manual redraw needed)',
    await page.evaluate((cell) => {
      const full = window.__tcBoxes.filter((b) => Math.abs(b.w - cell) <= 1 && Math.abs(b.h - cell) <= 1);
      return full.length >= 24 && window.__tcShots.length >= 6 && territoryBoxAnims.size === 6;
    }, CELL),
    await page.evaluate((cell) => {
      const full = window.__tcBoxes.filter((b) => Math.abs(b.w - cell) <= 1);
      return `framesDrew=${window.__tcBoxes.length} fullScaleCells=${full.length} shots=${window.__tcShots.length} anims=${territoryBoxAnims.size}`;
    }, CELL));
  // RE-POP REGRESSION: the pop-in is NOT first-click-only — every w/# toggle-ON must replay it.
  // Toggle off then back on with NO data change (same count, same extent): the map entries must
  // get fresh t0 timestamps and the badges must be visibly mid-animation right after the re-enable
  // draw, not silently settled at full scale. The app's own self-driving loop then finishes the
  // replay on its own.
  await page.evaluate(() => {
    window.__tcBoxes = [];
    document.getElementById('scoring-opt-territory-counts').click(); // off
    window.__tcBoxes = [];
    document.getElementById('scoring-opt-territory-counts').click(); // back on -> must re-pop
  });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 120)));
  check('re-pop: every w/# toggle-ON replays the pop-in (badges mid-animation, not settled)',
    await page.evaluate((cell) => {
      const mid = window.__tcBoxes.filter((b) => b.w > cell * 0.05 && b.w < cell * 0.99);
      const nowT = performance.now();
      const animating = [...territoryBoxAnims.values()].every((a) => (nowT - a.t0) / 350 < 1);
      return mid.length >= 24 && animating && territoryBoxAnims.size === 6;
    }, CELL),
    await page.evaluate((cell) => {
      const mid = window.__tcBoxes.filter((b) => b.w > cell * 0.05 && b.w < cell * 0.99);
      const nowT = performance.now();
      const ages = [...territoryBoxAnims.values()].map((a) => Math.round((nowT - a.t0) / 10) / 10);
      return `midScale=${mid.length} anims=${territoryBoxAnims.size} ages=${JSON.stringify(ages)}`;
    }, CELL));
  await page.evaluate(() => new Promise((r) => setTimeout(r, 350)));
  check('re-pop: the replay completes to full scale on its own',
    await page.evaluate((cell) => {
      const full = window.__tcBoxes.filter((b) => Math.abs(b.w - cell) <= 1 && Math.abs(b.h - cell) <= 1);
      const nowT = performance.now();
      return full.length >= 24 && [...territoryBoxAnims.values()].every((a) => (nowT - a.t0) / 350 >= 1);
    }, CELL));

  // From here on the harness draws manually; stop the app's animation loop so captures stay
  // deterministic (one draw = exactly the records that draw emits).
  await page.evaluate(() => { window.__tcDisableTerritoryAnim = true; });
  await page.evaluate(() => { window.__tcShots = []; window.__tcBoxes = []; window.__tcBoxFills = []; window.drawBoard(); });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 200)));

  let shotList = await shots();
  const expected = [
    ['6', PADDING + 0.5 * CELL, PADDING + 1.0 * CELL],   // A19..B17 at line-18 crossing
    ['5', PADDING + 16 * CELL, PADDING + 18 * CELL],     // P1..T1 over R1
    ['9', PADDING + 11 * CELL, PADDING + 5 * CELL],      // 3x3 white block at stone centroid
    ['1', PADDING + 4 * CELL, PADDING + 8 * CELL],       // diagonal pair member 1
    ['1', PADDING + 5 * CELL, PADDING + 9 * CELL],       // diagonal pair member 2
    ['2', PADDING + 4.5 * CELL, PADDING + 11 * CELL]     // orthogonal pair at centroid
  ];
  check('one number per group: all 6 expected numbers drawn and nothing extra',
    shotList.length === 6 && expected.every(([t, x, y]) => !!findShot(shotList, t, x, y)),
    `drew ${shotList.length}: ${JSON.stringify(shotList.map((s) => [s.text, Math.round(s.x), Math.round(s.y)]))}`);

  const s6 = findShot(shotList, '6', PADDING + 0.5 * CELL, PADDING + 1.0 * CELL);
  const s5 = findShot(shotList, '5', PADDING + 16 * CELL, PADDING + 18 * CELL);
  const s9 = findShot(shotList, '9', PADDING + 11 * CELL, PADDING + 5 * CELL);

  check('pure: numbers render with NO shadow, NO border (pure font text)',
    shotList.length === 6 &&
      shotList.every((s) => s.shadowOffsetX === 0 && s.shadowOffsetY === 0 && s.shadowBlur === 0) &&
      shotList.every((s) => s.shadowColor === 'rgba(0, 0, 0, 0)') &&
      (await page.evaluate(() => window.__tcStrokes)).length === 0,
    JSON.stringify(shotList.map((s) => [s.text, s.shadowOffsetX, s.shadowOffsetY, s.shadowBlur, s.shadowColor])));

  check('color: black territory numbers fill warm yellow (#FCD102)',
    shotList.filter((s) => ['6', '1', '2'].includes(s.text)).every((s) => String(s.fillStyle).toUpperCase() === '#FCD102'),
    'black numbers use #FCD102');
  check('color: white territory numbers fill deep blue (#101389)',
    shotList.filter((s) => ['5', '9'].includes(s.text)).every((s) => s.fillStyle === '#101389'),
    'white numbers use #101389');

  check('font: numbers use Figtree-SemiBold (no `bold` faux-weight, no Pretendard) — non-italic while marking',
    shotList.length === 6 && shotList.every((s) => /Figtree/.test(s.font) && !/bold/.test(s.font) && !/normal/.test(s.font) && !/italic/.test(s.font) && !/Pretendard/.test(s.font)),
    JSON.stringify(shotList.map((s) => s.font)));

  check('size: font scales with group size (9 > 6 > 5)',
    sizeOf(s9.font) > sizeOf(s6.font) && sizeOf(s6.font) > sizeOf(s5.font),
    `9@${sizeOf(s9.font)} 6@${sizeOf(s6.font)} 5@${sizeOf(s5.font)}`);

  // MERGED CROSSWORD-STYLE BADGES — ONE continuous box per territory area: every member square is a
  // CELL-sized cell centered on its grid intersection, and all of a group's cells join into a
  // single path + single fill (nonzero winding) so the box is a solid crossword-block shape — no
  // seams between cells, no empty bounding-box padding. A cell's corner is ROUNDED only at an
  // exposed outer corner (both the orthogonal neighbor AND the next cell along that edge are
  // outside the group); corners along straight edges and cells with all four orthogonal neighbors
  // in the group (interior cells) are plain SQUARE (radius 0). Group scan order is row-major, so
  // the six fills come in that order. The pop-in scales the whole shape about the group's
  // intersection midpoint; at full scale every cell lands exactly on its intersection.
  const groups = [
    { label: '6', color: 'black', cells: [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [2, 1]] },
    { label: '9', color: 'white', cells: [[4, 10], [4, 11], [4, 12], [5, 10], [5, 11], [5, 12], [6, 10], [6, 11], [6, 12]] },
    { label: '1a', color: 'black', cells: [[8, 4]] },
    { label: '1b', color: 'black', cells: [[9, 5]] },
    { label: '2', color: 'black', cells: [[11, 4], [11, 5]] },
    { label: '5', color: 'white', cells: [[18, 14], [18, 15], [18, 16], [18, 17], [18, 18]] }
  ];
  const BLACK_FILL = 'rgba(17, 24, 39, 0.4)';
  const WHITE_FILL = 'rgba(255, 255, 255, 0.4)';
  const cellCenter = (b) => [b.x + b.w / 2, b.y + b.h / 2];
  const squareAt = (list, r, c) => list.find((b) => near(cellCenter(b), [PADDING + c * CELL, PADDING + r * CELL]));
  const inGroup = (g, r, c) => g.cells.some(([gr, gc]) => gr === r && gc === c);
  const cornerRadii = (g, r, c) => ({
    rTL: (!inGroup(g, r - 1, c) && !inGroup(g, r, c - 1)) ? CELL * 0.45 : 0,
    rTR: (!inGroup(g, r - 1, c) && !inGroup(g, r, c + 1)) ? CELL * 0.45 : 0,
    rBR: (!inGroup(g, r + 1, c) && !inGroup(g, r, c + 1)) ? CELL * 0.45 : 0,
    rBL: (!inGroup(g, r + 1, c) && !inGroup(g, r, c - 1)) ? CELL * 0.45 : 0
  });
  const radiiMatch = (b, g, r, c) => {
    const e = cornerRadii(g, r, c);
    return Math.abs(b.rTL - e.rTL) <= 1.5 && Math.abs(b.rTR - e.rTR) <= 1.5 &&
      Math.abs(b.rBR - e.rBR) <= 1.5 && Math.abs(b.rBL - e.rBL) <= 1.5;
  };
  const extent = (list, g) => {
    const s = g.cells.map(([r, c]) => squareAt(list, r, c)).filter(Boolean);
    const minX = Math.min(...s.map((b) => b.x));
    const minY = Math.min(...s.map((b) => b.y));
    const maxX = Math.max(...s.map((b) => b.x + b.w));
    const maxY = Math.max(...s.map((b) => b.y + b.h));
    return [minX, minY, maxX - minX, maxY - minY];
  };

  let boxList = await page.evaluate(() => window.__tcBoxes.map((b) => ({ ...b })));
  let fillList = await page.evaluate(() => window.__tcBoxFills.slice());

  check('box: one merged box per territory area — 24 member cells, each CELL-sized on its intersection',
    boxList.length === 24 && groups.every((g) => g.cells.every(([r, c]) => {
      const sq = squareAt(boxList, r, c);
      return !!sq && Math.abs(sq.w - CELL) <= 1 && Math.abs(sq.h - CELL) <= 1;
    })),
    JSON.stringify(boxList.map((b) => [Math.round(b.x), Math.round(b.y), Math.round(b.w), Math.round(b.h)])));

  check('box: exposed outer corners are rounded, straight-edge and interior corners stay square',
    boxList.length === 24 && groups.every((g) => g.cells.every(([r, c]) => {
      const sq = squareAt(boxList, r, c);
      return !!sq && radiiMatch(sq, g, r, c);
    })),
    JSON.stringify(boxList.map((b) => [Math.round(b.x), Math.round(b.y), b.rTL, b.rTR, b.rBR, b.rBL])));

  fillOrSkip('box: each territory area is ONE merged fill — black 40% on black, white 40% on white',
    fillList.length === 6 && fillList.every((f, i) => f === (groups[i].color === 'black' ? BLACK_FILL : WHITE_FILL)),
    JSON.stringify(fillList));

  // Settle the animation deterministically (the pop is ~350ms; forcing t0=0 renders every badge
  // at full scale on the very next draw, no waiting needed) so boxes are measured settled.
  await page.evaluate(() => {
    for (const a of territoryBoxAnims.values()) a.t0 = 0;
    window.__tcShots = [];
    window.__tcBoxes = [];
    window.__tcBoxFills = [];
    window.drawBoard();
  });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 200)));
  const settledBoxes = await page.evaluate(() => window.__tcBoxes.map((b) => ({ ...b })));
  const settledShots = await shots();

  const expectedExtents = [ // [x0, y0, w, h] canvas units — intersection-oriented bbox of each group
    [PADDING - 0.5 * CELL, PADDING - 0.5 * CELL, 2 * CELL, 3 * CELL],   // black "6": rows 0-2, cols 0-1
    [PADDING + 9.5 * CELL, PADDING + 3.5 * CELL, 3 * CELL, 3 * CELL],  // white "9": rows 4-6, cols 10-12
    [PADDING + 3.5 * CELL, PADDING + 7.5 * CELL, CELL, CELL],          // black "1" at (8,4)
    [PADDING + 4.5 * CELL, PADDING + 8.5 * CELL, CELL, CELL],          // black "1" at (9,5)
    [PADDING + 3.5 * CELL, PADDING + 10.5 * CELL, 2 * CELL, CELL],     // black "2": row 11, cols 4-5
    [PADDING + 13.5 * CELL, PADDING + 17.5 * CELL, 5 * CELL, CELL]     // white "5": row 18, cols 14-18
  ];

  check('box: at full scale the badge covers exactly the group\'s territory bbox',
    settledBoxes.length === 24 && expectedExtents.every(([x0, y0, w, h], i) => {
      const [ex, ey, ew, eh] = extent(settledBoxes, groups[i]);
      return Math.abs(ex - x0) <= 1 && Math.abs(ey - y0) <= 1 && Math.abs(ew - w) <= 1 && Math.abs(eh - h) <= 1;
    }),
    JSON.stringify(settledBoxes.map((b) => [Math.round(b.x), Math.round(b.y), Math.round(b.w), Math.round(b.h)])));

  check('box: badge size scales with territory size (6/9 boxes 3 cells tall, 5 box 5 cells wide)',
    (() => {
      const e6 = extent(settledBoxes, groups[0]);
      const e9 = extent(settledBoxes, groups[1]);
      const e5 = extent(settledBoxes, groups[5]);
      const e2 = extent(settledBoxes, groups[4]);
      return Math.abs(e6[3] - e9[3]) <= 1 && e6[3] > e5[3] && e6[3] > e2[3] &&
        e5[2] > e9[2] && e9[2] > e2[2];
    })());

  check('box: every count digit renders inside its territory box',
    settledShots.length === 6 && settledShots.every((s) =>
      groups.some((g) => {
        const [ex, ey, ew, eh] = extent(settledBoxes, g);
        return s.x >= ex - 1 && s.x <= ex + ew + 1 && s.y >= ey - 1 && s.y <= ey + eh + 1;
      })));

  check('anim: pop-in bookkeeping holds one entry per group',
    await page.evaluate(() => territoryBoxAnims instanceof Map && territoryBoxAnims.size === 6),
    'territoryBoxAnims has 6 entries after a full draw');

  // TOGGLE off: no numbers.
  await page.evaluate(() => {
    window.__tcShots = [];
    document.getElementById('scoring-opt-territory-counts').click();
    window.drawBoard();
  });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 200)));
  check('toggle: unchecking w/# stops number rendering',
    await page.evaluate(() => scoringState.showTerritoryCounts === false && window.__tcShots.length === 0));

  // HIDE: "Show territory" off also hides counts even with w/# on.
  await page.evaluate(() => {
    document.getElementById('scoring-opt-territory-counts').click(); // back on
    scoringState.showTerritory = false;
    window.__tcShots = [];
    window.drawBoard();
  });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 200)));
  check('hide: "Show territory" off hides numbers even with w/# on',
    await page.evaluate(() => scoringState.showTerritoryCounts === true && window.__tcShots.length === 0));

  // DamE points render nothing: clearing a group removes its number.
  await page.evaluate(() => {
    scoringState.showTerritory = true;
    for (const r of [4, 5, 6]) for (const c of [10, 11, 12]) scoringState.manualTerritory[r][c] = 0;
    window.__tcShots = [];
    window.__tcBoxes = [];
    window.__tcBoxFills = [];
    window.drawBoard();
  });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 200)));
  const shrunk = await shots();
  check('dame: clearing the 3x3 white group removes its "9" (5 groups remain)',
    shrunk.length === 5 && !findShot(shrunk, '9', PADDING + 11 * CELL, PADDING + 5 * CELL),
    `drew ${shrunk.length}`);
  fillOrSkip('dame: its crossword badge disappears too (15 member squares, 5 merged fills remain)',
    await page.evaluate(() => window.__tcBoxes.length === 15 && window.__tcBoxFills.length === 5));
  check('anim: clearing a group drops its pop-in entry (map shrinks to 5)',
    await page.evaluate(() => territoryBoxAnims.size === 5));

  // POST-LOCK ADAPTABILITY: w/# is the ONLY value that adapts after D&T Lock. Restore the
  // fixture, lock (commits manual territory into the frozen resolution), then replace a stone
  // onto a territory point: the counter re-counts the current playground board (6 -> 5) while
  // the frozen score text never moves and the frozen resolution never gains the stone.
  await page.evaluate(() => {
    for (const r of [4, 5, 6]) for (const c of [10, 11, 12]) scoringState.manualTerritory[r][c] = 2;
    scoringState.board[0][1] = 0; // restore (not a replaced stone yet)
    window.__tcShots = [];
    window.__tcBoxes = [];
    window.__tcBoxFills = [];
    window.applyScoringLock();
  });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 250)));

  const scoreText = () => page.evaluate(() => [
    document.getElementById('scoring-black-formula').textContent,
    document.getElementById('scoring-black-total').textContent,
    document.getElementById('scoring-white-formula').textContent,
    document.getElementById('scoring-white-total').textContent
  ].join(' | '));

  let lockedShots = await shots();
  check('post-lock: counter still counts frozen manual territory (6 groups)',
    lockedShots.length === 6 && !!findShot(lockedShots, '6', PADDING + 0.5 * CELL, PADDING + 1.0 * CELL),
    `drew ${lockedShots.length}`);
  fillOrSkip('post-lock: badges render for all 6 locked groups',
    await page.evaluate(() => window.__tcBoxes.length === 24 && window.__tcBoxFills.length === 6));
  check('font: post-lock editing mode (Replacing) renders the digits in Figtree italic',
    lockedShots.length === 6 && lockedShots.every((s) => /Figtree/.test(s.font) && /italic/.test(s.font)),
    JSON.stringify(lockedShots.map((s) => s.font)));
  const scoreBefore = await scoreText();
  check('post-lock: lock commits (locked + snapshot)',
    await page.evaluate(() => scoringState.locked && !!scoringState.lockedSnapshot));

  // Simulate a Replace fill: a stone now occupies (0,1) of the black 6-group.
  await page.evaluate(() => {
    window.__tcShots = [];
    window.__tcBoxes = [];
    window.__tcBoxFills = [];
    scoringState.board[0][1] = 1;
    window.drawBoard();
  });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 200)));
  const adapted = await shots();
  // Remaining 5 black points (0,0),(1,0),(1,1),(2,0),(2,1): centroid r1.2 c0.4.
  check('post-lock replace: counter adapts to current board (6 -> 5 at new centroid)',
    adapted.length === 6 && !findShot(adapted, '6', PADDING + 0.5 * CELL, PADDING + 1.0 * CELL) &&
      !!findShot(adapted, '5', PADDING + 0.4 * CELL, PADDING + 1.2 * CELL),
    JSON.stringify(adapted.map((s) => [s.text, Math.round(s.x), Math.round(s.y)])));
  check('post-lock replace: a fresh badge re-keys to the adapted group (old entry gone)',
    await page.evaluate(() => {
      const counts = [...territoryBoxAnims.values()].map((a) => a.count);
      return territoryBoxAnims.size === 6 &&
        !territoryBoxAnims.has('10,5') &&          // old black "6" centroid (fr1.0 fc0.5)
        territoryBoxAnims.has('12,4') &&           // adapted black "5" centroid (fr1.2 fc0.4)
        counts.includes(5) && !counts.includes(6);
    }),
    await page.evaluate(() => JSON.stringify([...territoryBoxAnims.entries()].map(([k, v]) => [k, v.count]))));
  check('font: replace editing keeps the italic after the board adapts',
    adapted.length === 6 && adapted.every((s) => /Figtree/.test(s.font) && /italic/.test(s.font)),
    JSON.stringify(adapted.map((s) => s.font)));
  // re-Arranging Stones is the OTHER editing mode — it must italicize the digits too.
  await page.evaluate(() => {
    scoringState.interactionMode = 'rearrange';
    window.__tcShots = [];
    window.drawBoard();
  });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 200)));
  const rearrangeShots = await shots();
  check('font: re-Arranging mode renders the Figtree italic as well',
    rearrangeShots.length === 6 && rearrangeShots.every((s) => /Figtree/.test(s.font) && /italic/.test(s.font)),
    JSON.stringify(rearrangeShots.map((s) => s.font)));
  await page.evaluate(() => { scoringState.interactionMode = 'replace'; });
  const scoreAfter = await scoreText();
  check('post-lock replace: frozen score text does NOT move',
    scoreAfter === scoreBefore, scoreBefore === scoreAfter ? scoreBefore : `${scoreBefore} -> ${scoreAfter}`);
  check('post-lock replace: frozen resolution untouched by the replace',
    await page.evaluate(() => scoringState.lockedSnapshot.board[0][1] === 0));
  check('post-lock: w/# toggling never mutates scoringState (display-only)',
    await page.evaluate(() => {
      const normalized = (o) => { const c = JSON.parse(JSON.stringify(o)); c.showTerritoryCounts = null; return JSON.stringify(c); };
      const before = normalized(scoringState);
      document.getElementById('scoring-opt-territory-counts').click();
      document.getElementById('scoring-opt-territory-counts').click();
      const after = normalized(scoringState);
      return before === after;
    }));

  // FROZEN ("Board Saved ✓") DISPLAY OPTIONS: the #scoring-frozen-overlay must NOT swallow
  // sidebar clicks. The overlay is shown (dimming the board), but the sidebar rides above it
  // (z-index 101) so a REAL browser hit-test click on the w/# checkbox still lands — proving
  // Display Options are usable after Save. The board canvas itself stays click-locked via
  // handleScoringBoardClick's own frozen gate.
  await page.evaluate(() => {
    window.setScoringFrozen(true);
    scoringState.showTerritoryCounts = false;
    document.getElementById('scoring-opt-territory-counts').checked = false;
  });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 150)));
  check('frozen: overlay is visible ("Board Saved ✓") and w/# is unchecked',
    await page.evaluate(() => {
      const ov = document.getElementById('scoring-frozen-overlay');
      return getComputedStyle(ov).display === 'block' &&
        scoringState.showTerritoryCounts === false && scoringState.frozen === true;
    }));
  await page.evaluate(() => {
    window.__tcShots = [];
  });
  if (LAYOUT_OK) {
    // Real browser hit-testing only — this is the v0.1.083 regression proof that the
    // sidebar rides above the frozen overlay (z-index 101 > 100) so a REAL click on
    // the w/# checkbox still lands instead of being swallowed by the overlay.
    await page.click('#scoring-opt-territory-counts');
    await page.evaluate(() => new Promise((r) => setTimeout(r, 150)));
    check('frozen: a real click through the overlay flips w/# (Display Options clickable post-Save)',
      await page.evaluate(() => scoringState.showTerritoryCounts === true));
  } else {
    // Lightpanda can't hit-test reliably (getBoundingClientRect ≈ 5px); the overlay
    // z-index stack is verified there by the DOM check above. The w/# toggle is driven
    // directly below so the frozen-font check still runs on every engine.
    skip('frozen: a real click through the overlay flips w/# (Display Options clickable post-Save)', 'no reliable hit-testing');
  }
  // Ensure the count toggle is ON (real click on full browsers, direct state here) and
  // re-capture the frozen digits — engine-agnostic font verification of v0.1.084.
  await page.evaluate(() => {
    scoringState.showTerritoryCounts = true;
    const cb = document.getElementById('scoring-opt-territory-counts');
    if (cb) cb.checked = true;
    window.__tcShots = [];
    window.drawBoard();
  });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 150)));
  const frozenShots = await shots();
  check('font: "Board Saved ✓" renders the w/# digits REGULAR (no italic after Save)',
    frozenShots.length === 6 && frozenShots.every((s) => /Figtree/.test(s.font) && !/italic/.test(s.font)),
    JSON.stringify(frozenShots.map((s) => s.font)));
  check('frozen: the board itself is still click-locked (canvas click changes nothing)',
    await page.evaluate(() => {
      const canvas = document.getElementById('go-board-canvas-scoring');
      const rect = canvas.getBoundingClientRect();
      const x = rect.left + (36 + 3 * ((600 - 72) / 18)) / 600 * rect.width;
      const y = rect.top + (36 + 3 * ((600 - 72) / 18)) / 600 * rect.height;
      const before = scoringState.board[3][3];
      const ev = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y });
      canvas.dispatchEvent(ev);
      return scoringState.board[3][3] === before;
    }));
  await page.evaluate(() => window.setScoringFrozen(false));
  await page.evaluate(() => { window.__tcShots = []; window.drawBoard(); });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 150)));
  const editShots = await shots();
  check('font: pressing Edit (unfrozen) returns the digits to italic',
    editShots.length === 6 && editShots.every((s) => /Figtree/.test(s.font) && /italic/.test(s.font)),
    JSON.stringify(editShots.map((s) => s.font)));

  const errs = consoleErrors.filter((e) => !/favicon/i.test(e));
  check('no console/page errors', errs.length === 0, errs.slice(0, 3).join(' | ') || 'clean');

  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  console.log(`\nterritory-counts verify: ${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}`);
  if (errs.length) console.log('page errors:', errs.slice(0, 5).join(' | '));
  await close();
  server.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error('CRASHED:', e); process.exit(2); });
