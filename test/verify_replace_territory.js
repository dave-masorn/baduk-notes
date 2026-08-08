// Verify: Replacing Dead Stones targets ALL and ONLY the intersections the overlay marks
// as Territory, each accepting ONLY the stone of its marked color.
//
//   ALL   — every displayed territory point accepts a prisoner, including explicitly
//           manual-marked territory on an algorithmic-dame point and a re-arranged
//           (lifted) stone's vacated point inside its own territory.
//   ONLY  — points with no territory defined (dame/seki) and squareless vacated points
//           (a lifted boundary stone adjacent to dame) accept nothing.
//   COLOR — the marked territory color decides the prisoner: manual marks override the
//           auto-derived score, so a point marked White takes a White prisoner and a
//           point marked Black takes a Black prisoner.
//
// Seed: a WHITE cage ring (rows/cols 2-6) enclosing the empty 3x3 block rows 3-5, cols
// 3-5, all bounded by a BLACK outer ring (rows/cols 0-8). Interior = white territory,
// the annulus between the rings = dame, everything beyond the black ring = dame.
// Manual marks: (9,9)=White (a dame point hand-marked as territory) and (3,3)=Black
// (hand-override of the algorithmic white territory).
const path = require('path');
const http = require('http');
const fs = require('fs');
const { launchLightpanda, probeCapabilities } = require('./lightpanda-launcher.js');

const REPO = '/Users/davemasorn/AntiGravity/baduk-notes';
const PORT = 3949;

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
  results.push({ name, pass: !!cond });
  console.log(`[${cond ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
}
function skip(name, reason) {
  skipped++;
  console.log(`[SKIP] ${name} — ${reason}`);
}

function samePx(a, b, tol = 2) {
  return Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol && Math.abs(a[2] - b[2]) <= tol;
}

async function clickCell(page, r, c) {
  const box = await page.evaluate(() => {
    const el = document.getElementById('go-board-canvas-scoring');
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  const PADDING = 36, CELL = (600 - 72) / 18;
  const cx = box.x + ((PADDING + c * CELL) / 600) * box.w;
  const cy = box.y + ((PADDING + r * CELL) / 600) * box.h;
  await page.mouse.click(cx, cy);
  await page.evaluate(() => new Promise((r) => setTimeout(r, 120)));
}

async function main() {
  await new Promise((r) => server.listen(PORT, r));
  const { page, close } = await launchLightpanda();
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.scoringState && typeof window.drawBoard === 'function' && window.GoScorer, { timeout: 20000 });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 400)));

  // Lightpanda's canvas is a stub (getImageData always zeros): the single
  // pixel-based display check below is SKIPPED there; all replace/freeze
  // state logic checks run everywhere.
  const caps = await probeCapabilities(page);
  const RENDER_OK = caps.gradients;

  const SGF = '(;GM[1]FF[4]SZ[19]PB[Black]PW[White]RE[W+6.5]KM[6.5]RU[Japanese];B[pd];W[pp];B[dp];W[dd])';
  await page.evaluate(({ sgf, id }) => {
    window.loadSGF(sgf);
    if (window.state.sgfMoves && window.state.sgfMoves.length > 0) {
      window.goToMove(window.state.sgfMoves.length - 1);
    }
    window.StudyRecordDB.saveRecord({ id, recNo: '03', fileNm: 'replace-terr.sgf', workingSgf: sgf, currentMoveIndex: -1 });
    window.state.activeStudyId = id;
  }, { sgf: SGF, id: 'replace-terr' });
  await page.evaluate(() => {
    const ge = document.getElementById('game-end-popup');
    if (ge) ge.style.display = 'none';
    window.openScoringModal();
  });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 300)));

  const CAGE = [[2, 3], [2, 4], [2, 5], [3, 2], [4, 2], [5, 2], [6, 3], [6, 4], [6, 5], [3, 6], [4, 6], [5, 6]];

  await page.evaluate(({ cage }) => {
    const empty = () => Array.from({ length: 19 }, () => Array.from({ length: 19 }, () => 0));
    const board = empty();
    for (let i = 0; i <= 8; i++) { board[0][i] = 1; board[8][i] = 1; board[i][0] = 1; board[i][8] = 1; } // black outer ring
    for (const [r, c] of cage) board[r][c] = 2; // white cage
    board[4][4] = 2; // a white stone sitting INSIDE the enclosed white territory
    scoringState.board = board;
    scoringState.markedDead = empty();
    scoringState.deadStonesInfo = empty();
    scoringState.manualTerritory = empty();
    scoringState.showTerritory = true;
    scoringState.showDead = false;
    scoringState.ruleMode = 'japanese';
    scoringState.locked = false;
    scoringState.lockedSnapshot = null;
    window.setScoringFrozen(false); // hides the frozen overlay + updates UI (keeps frozen=false)
    // Pools: 3 white prisoners (dead) + 2 (caps), 3 black prisoners (dead) + 2 (caps).
    scoringState.deadWhite = ['W', 'W', 'W'];
    scoringState.bucketBlack = ['W', 'W', 'W'];
    scoringState.blackCaptures = 2;
    scoringState.deadBlack = ['B', 'B', 'B'];
    scoringState.bucketWhite = ['B', 'B', 'B'];
    scoringState.whiteCaptures = 2;
    scoringState.rearrangeBlack = [];
    scoringState.rearrangeWhite = [];
    // Manual territory marks (marked BEFORE locking, so they freeze into the resolution):
    // (9,9) = White territory on a dame point (the ALL gap), (3,3) = Black hand-override
    // of the algorithmic white interior (the COLOR truth).
    scoringState.manualTerritory[9][9] = 2;
    scoringState.manualTerritory[3][3] = 1;
    const st = state.scoringBoardStyle || JSON.parse(JSON.stringify(state.initialBoardStyle));
    st.board = st.board || {};
    st.board.useColor = true; // solid board so territory-square pixels are identical everywhere
    state.scoringBoardStyle = st;
    window.scoringBoardBgImage = null;
    window.drawBoard();
  }, { cage: CAGE });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 250)));

  const probe = (r, c) => page.evaluate(([pr, pc]) => {
    const canvas = document.getElementById('go-board-canvas-scoring');
    const ctx = canvas.getContext('2d');
    const PADDING = 36, CELL = (canvas.width - 72) / 18;
    const d = ctx.getImageData(PADDING + pc * CELL, PADDING + pr * CELL, 1, 1).data;
    return [d[0], d[1], d[2]];
  }, [r, c]);

  const pools = () => page.evaluate(() => ({
    dB: window.scoringState.deadBlack.length,
    wC: window.scoringState.whiteCaptures || 0,
    dW: window.scoringState.deadWhite.length,
    bC: window.scoringState.blackCaptures || 0
  }));
  const cell = (r, c) => page.evaluate(([pr, pc]) => window.scoringState.board[pr][pc], [r, c]);
  const setCell = (r, c, v) => page.evaluate(([pr, pc, pv]) => { scoringState.board[pr][pc] = pv; window.drawBoard(); }, [r, c, v]);
  const lockedCell = (r, c) => page.evaluate(([pr, pc]) =>
    scoringState.lockedSnapshot ? scoringState.lockedSnapshot.board[pr][pc] : null, [r, c]);

  // Display truth check before locking: (9,9) manual square shows light, (1,1) dame dark.
  const pManual99 = await probe(9, 9);
  const pDame = await probe(1, 1);
  if (RENDER_OK) {
    check('display: manual White mark on dame point renders as a territory square',
      pManual99[0] > 150, JSON.stringify(pManual99));
  } else {
    skip('display: manual White mark on dame point renders as a territory square', 'no canvas pixel reads');
  }
  check('display: unmarked dame point renders dark',
    pDame[0] < 100, JSON.stringify(pDame));

  await page.evaluate(() => window.applyScoringLock());
  await page.evaluate(() => new Promise((r) => setTimeout(r, 250)));
  check('lock commits + mode auto-switches to replace',
    await page.evaluate(() => !!(scoringState.locked && scoringState.lockedSnapshot && scoringState.interactionMode === 'replace')));

  const base = await pools();
  check('seed pools: dW3 bC2 dB3 wC2', base.dW === 3 && base.bC === 2 && base.dB === 3 && base.wC === 2, JSON.stringify(base));

  // ALL: algorithmic territory point accepts a prisoner of the territory's color.
  await clickCell(page, 3, 4); // interior White territory
  let p = await pools();
  check('A1 algorithmic White territory places a White prisoner (dead pile)',
    await cell(3, 4) === 2 && p.dW === 2 && p.bC === 2, `cell=${await cell(3, 4)} ${JSON.stringify(p)}`);

  // ALL: manual-marked territory on a dame point accepts a prisoner.
  await clickCell(page, 9, 9);
  p = await pools();
  check('A2 manual White territory on dame point places a White prisoner',
    await cell(9, 9) === 2 && p.dW === 1 && p.bC === 2, `cell=${await cell(9, 9)} ${JSON.stringify(p)}`);

  // ONLY: unmarked dame point accepts nothing.
  await clickCell(page, 1, 1);
  p = await pools();
  check('O1 unmarked dame point accepts no prisoner',
    await cell(1, 1) === 0 && p.dW === 1 && p.bC === 2, `cell=${await cell(1, 1)} ${JSON.stringify(p)}`);

  // ONLY: a vacated point that touches dame (lifted cage stone) shows no square, accepts nothing.
  await setCell(2, 3, 0); // lift the cage stone — its point connects to the dame annulus
  await clickCell(page, 2, 3);
  p = await pools();
  check('O2 squareless vacated point (adjacent to dame) accepts no prisoner',
    await cell(2, 3) === 0 && p.dW === 1 && p.bC === 2, `cell=${await cell(2, 3)} ${JSON.stringify(p)}`);
  await setCell(2, 3, 2); // restore the cage stone

  // COLOR: the marked territory color decides the prisoner — Black-marked point takes Black.
  await clickCell(page, 3, 3); // manual Black override of algorithmic White
  p = await pools();
  check('C1 Black-marked territory takes a BLACK prisoner',
    await cell(3, 3) === 1 && p.dB === 2 && p.wC === 2, `cell=${await cell(3, 3)} ${JSON.stringify(p)}`);

  // ALL: a re-arranged interior stone's vacated point (inside its own territory) is placeable.
  await setCell(4, 4, 0); // lift the interior stone — its vacated point is bounded by White territory
  await clickCell(page, 4, 4);
  p = await pools();
  check('A3 vacated point inside its own territory places a White prisoner',
    await cell(4, 4) === 2 && p.dW === 0 && p.bC === 2, `cell=${await cell(4, 4)} ${JSON.stringify(p)}`);

  // Reversal still works for a vacated-fill stone.
  await clickCell(page, 4, 4);
  p = await pools();
  check('R1 vacated-fill reversal restores the prisoner and clears the point',
    await cell(4, 4) === 0 && p.dW === 1, `cell=${await cell(4, 4)} ${JSON.stringify(p)}`);

  // Sanity: every placement happened only on the live playground; the frozen resolution is intact.
  check('frozen resolution untouched by all replace fills',
    await lockedCell(3, 4) === 0 && await lockedCell(9, 9) === 0 && await lockedCell(3, 3) === 0 && await lockedCell(4, 4) === 2);

  const errs = consoleErrors.filter((e) => !/favicon/i.test(e));
  check('no console/page errors', errs.length === 0, errs.slice(0, 3).join(' | ') || 'clean');

  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  console.log(`\nreplace-territory verify: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  if (errs.length) console.log('page errors:', errs.slice(0, 5).join(' | '));
  await close();
  server.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error('CRASHED:', e); process.exit(2); });
