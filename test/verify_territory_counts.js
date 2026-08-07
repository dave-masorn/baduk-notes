// Verify: MSM Display Options "w/#" territory group counts.
//
//   GROUPS   — each 4-connected same-color territory region shows ONE number = its point
//             count, placed at the group centroid: odd groups center on a stone point,
//             even groups on the grid-line crossing. (User examples: A19..B17 = "6" on
//             horizontal line 18 between columns A/B; P1..T1 = "5" over R1.)
//   SPLIT    — points touching only diagonally are NOT one group.
//   MERGE    — orthogonally adjacent points join into one group.
//   COLOR    — number fill color = territory color (black #FCD102, white #101389), rendered
//             as PURE font text in 'Pretendard' (bold → PretendardEN-Medium.otf): no shadow,
//             no halo, no stroked border.
//   SIZE     — text size scales with group size.
//   TOGGLE   — the w/# checkbox wires scoringState.showTerritoryCounts and redraws; with
//             it off (or "Show territory" off) no numbers render.
//   POST-LOCK — w/# is the ONLY display value that ADAPTS after D&T Lock: the counter
//             re-counts on the current playground board (replaces/re-arranges shrink or
//             grow a group) while the frozen score never moves.
const path = require('path');
const http = require('http');
const fs = require('fs');
const puppeteer = require('puppeteer-core');

const REPO = '/Users/davemasorn/AntiGravity/baduk-notes';
const PORT = 3951;
const CHROME = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';

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
function check(name, cond, detail) {
  results.push({ pass: !!cond, name });
  console.log(`[${cond ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
}

async function main() {
  await new Promise((r) => server.listen(PORT, r));
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage();
  page.setDefaultTimeout(20000);
  await page.setViewport({ width: 1600, height: 1200 });
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.scoringState && typeof window.drawBoard === 'function' && window.GoScorer, { timeout: 20000 });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 400)));

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

  // Patch fillText BEFORE drawing: capture count draws (font resolves to bold) with position,
  // font, color. The coordinate labels render weight 500 / plain, never bold, so bold digits
  // are exactly the territory-group numbers.
  await page.evaluate(() => {
    if (!window.__tcPatched) {
      window.__tcShots = [];
      const orig = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxW) {
        if (this.font && /bold|700/.test(this.font) && /^\d+$/.test(String(text))) {
          window.__tcShots.push({
            text: String(text), x, y, font: this.font, fillStyle: this.fillStyle,
            shadowOffsetX: this.shadowOffsetX, shadowOffsetY: this.shadowOffsetY,
            shadowBlur: this.shadowBlur, shadowColor: this.shadowColor
          });
        }
        return orig.call(this, text, x, y, maxW);
      };
      // Count-number borders must NOT be drawn: any bold-digit strokeText is a regression.
      window.__tcStrokes = [];
      const origStroke = CanvasRenderingContext2D.prototype.strokeText;
      CanvasRenderingContext2D.prototype.strokeText = function (text, x, y, maxW) {
        if (this.font && /bold|700/.test(this.font) && /^\d+$/.test(String(text))) {
          window.__tcStrokes.push(String(text));
        }
        return origStroke.call(this, text, x, y, maxW);
      };
      // Adaptive rounded badges: roundedRectPath is a global classic-script function, so it is
      // patchable here. Every 40%-translucent fill (black box / white box) is unique to these
      // badges (no other draw op uses a 0.4 alpha), so capturing fill() with those colors
      // isolates exactly the badge fills.
      window.__tcBoxes = [];
      const origRR = window.roundedRectPath;
      window.roundedRectPath = function (ctx, x, y, w, h, r) {
        window.__tcBoxes.push({ x, y, w, h, r });
        return origRR.call(this, ctx, x, y, w, h, r);
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

  check('font: numbers use Pretendard (bold → PretendardEN-Medium.otf)',
    shotList.length === 6 && shotList.every((s) => /Pretendard/.test(s.font) && /bold/.test(s.font)),
    JSON.stringify(shotList.map((s) => s.font)));

  check('size: font scales with group size (9 > 6 > 5)',
    sizeOf(s9.font) > sizeOf(s6.font) && sizeOf(s6.font) > sizeOf(s5.font),
    `9@${sizeOf(s9.font)} 6@${sizeOf(s6.font)} 5@${sizeOf(s5.font)}`);

  // ADAPTIVE ROUNDED BADGES — one rounded box behind every number, COVERING the whole territory
  // area of its group (the bounding box anchored to the grid INTERSECTIONS — edges midway
  // between grid lines, half a grid spacing outside the outermost intersections), filled
  // 40%-translucent with the territory color, with a smooth pop-in scale animation. Box
  // centers equal each group's intersection midpoint and stay fixed under the scale animation
  // (which pivots about that center), so they are identifiable even mid-pop.
  const expectedBoxes = [ // [x0, y0, w, h] canvas units — intersection-oriented bbox of each fixture group
    [PADDING - 0.5 * CELL, PADDING - 0.5 * CELL, 2 * CELL, 3 * CELL],   // black "6": rows 0-2, cols 0-1
    [PADDING + 13.5 * CELL, PADDING + 17.5 * CELL, 5 * CELL, CELL],    // white "5": row 18, cols 14-18
    [PADDING + 9.5 * CELL, PADDING + 3.5 * CELL, 3 * CELL, 3 * CELL],  // white "9": rows 4-6, cols 10-12
    [PADDING + 3.5 * CELL, PADDING + 7.5 * CELL, CELL, CELL],          // black "1" at (8,4)
    [PADDING + 4.5 * CELL, PADDING + 8.5 * CELL, CELL, CELL],          // black "1" at (9,5)
    [PADDING + 3.5 * CELL, PADDING + 10.5 * CELL, 2 * CELL, CELL]      // black "2": row 11, cols 4-5
  ];
  let boxList = await page.evaluate(() => window.__tcBoxes.map((b) => ({ ...b })));
  let fillList = await page.evaluate(() => window.__tcBoxFills.slice());
  const boxCenter = (b) => [b.x + b.w / 2, b.y + b.h / 2];
  const boxOf = (list, x0, y0, w, h) => list.find((b) => near(boxCenter(b), [x0 + w / 2, y0 + h / 2]));
  const boxColorIsBlack = (b) => {
    if (near(boxCenter(b), [PADDING + 0.5 * CELL, PADDING + 1.0 * CELL])) return true;   // black "6"
    if (near(boxCenter(b), [PADDING + 16 * CELL, PADDING + 18 * CELL])) return false;    // white "5"
    if (near(boxCenter(b), [PADDING + 11 * CELL, PADDING + 5 * CELL])) return false;     // white "9"
    if (near(boxCenter(b), [PADDING + 4 * CELL, PADDING + 8 * CELL])) return true;       // black "1"
    if (near(boxCenter(b), [PADDING + 5 * CELL, PADDING + 9 * CELL])) return true;       // black "1"
    if (near(boxCenter(b), [PADDING + 4.5 * CELL, PADDING + 11 * CELL])) return true;    // black "2"
    return null;
  };

  check('box: one rounded badge per group (6 badges), each covering its territory area',
    boxList.length === 6 && expectedBoxes.every(([x0, y0, w, h]) => !!boxOf(boxList, x0, y0, w, h)),
    JSON.stringify(boxList.map((b) => [Math.round(b.x), Math.round(b.y), Math.round(b.w), Math.round(b.h)])));

  check('box: black territories get a black 40% badge, white a white 40% badge',
    fillList.length === 6 && boxList.every((b, i) => {
      const black = boxColorIsBlack(b);
      return black !== null ? (black ? fillList[i] === 'rgba(17, 24, 39, 0.4)' : fillList[i] === 'rgba(255, 255, 255, 0.4)') : false;
    }),
    JSON.stringify(fillList));

  // Settle the animation (pop-in runs ~350ms) so boxes are measured at full scale.
  await page.evaluate(() => { territoryBoxAnims.clear(); window.drawBoard(); });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 450)));
  await page.evaluate(() => { window.__tcShots = []; window.__tcBoxes = []; window.drawBoard(); });
  const settledBoxes = await page.evaluate(() => window.__tcBoxes.map((b) => ({ ...b })));
  const settledShots = await shots();
  check('box: at full scale each badge rect equals the group\'s full territory bbox',
    settledBoxes.length === 6 && expectedBoxes.every(([x0, y0, w, h]) =>
      !!settledBoxes.find((b) => Math.abs(b.x - x0) <= 1 && Math.abs(b.y - y0) <= 1 &&
        Math.abs(b.w - w) <= 1 && Math.abs(b.h - h) <= 1)),
    JSON.stringify(settledBoxes.map((b) => [Math.round(b.x), Math.round(b.y), Math.round(b.w), Math.round(b.h)])));

  check('box: badge size scales with territory size (6/9 boxes 3 cells tall, 5 box 5 cells wide)',
    (() => {
      const b6 = boxOf(settledBoxes, PADDING - 0.5 * CELL, PADDING - 0.5 * CELL, 2 * CELL, 3 * CELL);
      const b9 = boxOf(settledBoxes, PADDING + 9.5 * CELL, PADDING + 3.5 * CELL, 3 * CELL, 3 * CELL);
      const b5 = boxOf(settledBoxes, PADDING + 13.5 * CELL, PADDING + 17.5 * CELL, 5 * CELL, CELL);
      const b2 = boxOf(settledBoxes, PADDING + 3.5 * CELL, PADDING + 10.5 * CELL, 2 * CELL, CELL);
      return !!b6 && !!b9 && !!b5 && !!b2 &&
        Math.abs(b6.h - b9.h) <= 1 && b6.h > b5.h && b6.h > b2.h &&
        b5.w > b9.w && b9.w > b2.w;
    })());

  check('box: every count digit renders inside its territory box',
    settledShots.length === 6 && expected.every(([, x, y], i) => {
      const [x0, y0, w, h] = expectedBoxes[i];
      const b = boxOf(settledBoxes, x0, y0, w, h);
      return !!b && x >= b.x - 1 && x <= b.x + b.w + 1 && y >= b.y - 1 && y <= b.y + b.h + 1;
    }));

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
  check('dame: its rounded badge disappears too (5 badges remain)',
    await page.evaluate(() => window.__tcBoxes.length === 5 && window.__tcBoxFills.length === 5));
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
  check('post-lock: badges render for all 6 locked groups',
    await page.evaluate(() => window.__tcBoxes.length === 6 && window.__tcBoxFills.length === 6));
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

  const errs = consoleErrors.filter((e) => !/favicon/i.test(e));
  check('no console/page errors', errs.length === 0, errs.slice(0, 3).join(' | ') || 'clean');

  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  console.log(`\nterritory-counts verify: ${passed} passed, ${failed} failed`);
  if (errs.length) console.log('page errors:', errs.slice(0, 5).join(' | '));
  await browser.close();
  server.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error('CRASHED:', e); process.exit(2); });
