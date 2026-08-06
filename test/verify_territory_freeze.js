// Verify: MSM territory is frozen after D&T Lock (Save D&T).
// Post-lock re-arrange/replace playground edits must NEVER move the marked
// territory overlay, the manual territory marks, or the displayed score —
// exactly like the already-frozen score/dead resolution. Unlocked, the same
// edit DOES adapt the overlay (sanity that the freeze is lock-specific).
//
// Seed: a WHITE cage ring (rows/cols 2-6) enclosing the empty 3x3 block rows
// 3-5, cols 3-5, all bounded by a BLACK outer ring (rows/cols 0-8). Interior
// 3x3 = white territory; the annulus between the rings is dame (adjacent to
// both colors). Lifting the cage stone at (2,3) connects the interior to the
// dame annulus, so live-based territory at (3,3)(3,4)(3,5) flips 2 → 0.
const path = require('path');
const http = require('http');
const fs = require('fs');
const puppeteer = require('puppeteer-core');

const REPO = '/Users/davemasorn/AntiGravity/baduk-notes';
const PORT = 3948;
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
  results.push({ name, pass: !!cond });
  console.log(`[${cond ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
}

function samePx(a, b, tol = 2) {
  return Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol && Math.abs(a[2] - b[2]) <= tol;
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
    window.StudyRecordDB.saveRecord({ id, recNo: '02', fileNm: 'terr-freeze.sgf', workingSgf: sgf, currentMoveIndex: -1 });
    window.state.activeStudyId = id;
  }, { sgf: SGF, id: 'terr-freeze' });
  await page.evaluate(() => {
    const ge = document.getElementById('game-end-popup');
    if (ge) ge.style.display = 'none';
    window.openScoringModal();
  });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 300)));

  const CAGE = [[2, 3], [2, 4], [2, 5], [3, 2], [4, 2], [5, 2], [6, 3], [6, 4], [6, 5], [3, 6], [4, 6], [5, 6]];
  const SAMPLES = [[3, 3], [3, 4], [3, 5]];
  const DAME = [1, 1];

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
    scoringState.frozen = false;
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

  const liveTerritory = () => page.evaluate(() => {
    const b = scoringState.board;
    const stones = b.map((row, r) => row.map((val, c) =>
      scoringState.markedDead[r][c] && val === 0 ? (scoringState.deadStonesInfo[r][c] || 0) : val));
    const undef = [];
    for (let r = 0; r < 19; r++) for (let c = 0; c < 19; c++) if (stones[r][c] === undefined) undef.push(r + ',' + c);
    if (undef.length) throw new Error('board undef at: ' + undef.slice(0, 25).join(' ') + ' (board rows ' + b.length + ', lens ' + JSON.stringify([...new Set(b.map(x => x.length))]) + ')');
    const loc = window.GoScorer.territoryScoring(stones, scoringState.markedDead, false);
    const out = {};
    for (let r = 0; r < 19; r++) for (let c = 0; c < 19; c++) if (loc[r][c]) out[r + ',' + c] = loc[r][c].isTerritoryFor;
    return out;
  });

  const setCell = (r, c, v) => page.evaluate(([pr, pc, pv]) => { scoringState.board[pr][pc] = pv; window.drawBoard(); }, [r, c, v]);
  const getCell = (r, c) => page.evaluate(([pr, pc]) => scoringState.board[pr][pc], [r, c]);
  const lockedBoardCell = (r, c) => page.evaluate(([pr, pc]) =>
    scoringState.lockedSnapshot ? scoringState.lockedSnapshot.board[pr][pc] : null, [r, c]);
  const lockedManual = (r, c) => page.evaluate(([pr, pc]) =>
    scoringState.lockedSnapshot && scoringState.lockedSnapshot.manualTerritory
      ? scoringState.lockedSnapshot.manualTerritory[pr][pc] : null, [r, c]);
  const scoreTotals = () => page.evaluate(() => ({
    b: document.getElementById('scoring-black-total').textContent,
    w: document.getElementById('scoring-white-total').textContent,
    result: document.getElementById('scoring-result-display') ? document.getElementById('scoring-result-display').textContent : null
  }));
  const postLockActions = () => page.evaluate(() => (window.countPostLockActions ? window.countPostLockActions() : null));

  // ── Phase A: UNLOCKED — territory adapts to live board edits ─────────────
  const terrLive = await liveTerritory();
  check('seed: interior 3x3 is white territory (unlocked, live)',
    SAMPLES.every(([r, c]) => terrLive[r + ',' + c] === 2), JSON.stringify(SAMPLES.map(([r, c]) => terrLive[r + ',' + c])));
  const damePx = await probe(...DAME);
  const pBase = [];
  for (const [r, c] of SAMPLES) pBase.push(await probe(r, c));
  check('seed: white territory squares render (light) vs dame (dark)',
    SAMPLES.every((_, i) => pBase[i][0] > 150) && damePx[0] < 100,
    JSON.stringify({ pBase, damePx }));

  await setCell(2, 3, 0);
  const terrLive2 = await liveTerritory();
  check('meaningful: live calc drops interior territory when cage breaks',
    SAMPLES.every(([r, c]) => (terrLive2[r + ',' + c] || 0) === 0), JSON.stringify(SAMPLES.map(([r, c]) => terrLive2[r + ',' + c])));
  const pMut = [];
  for (const [r, c] of SAMPLES) pMut.push(await probe(r, c));
  check('meaningful: unlocked overlay adapts (white squares disappear)',
    SAMPLES.some((_, i) => !samePx(pMut[i], pBase[i]) && pMut[i][0] < 100), JSON.stringify(pMut));

  await setCell(2, 3, 2); // restore cage
  const pRest = [];
  for (const [r, c] of SAMPLES) pRest.push(await probe(r, c));
  check('restore: overlay returns to the original pixels (deterministic redraw)',
    SAMPLES.every((_, i) => samePx(pRest[i], pBase[i])));

  const pStone44 = await probe(4, 4);
  check('unlocked: interior stone renders as a stone (no square under it)',
    pStone44[0] > 150 && !samePx(pStone44, pBase[0]), JSON.stringify({ pStone44, sq: pBase[0] }));
  await setCell(4, 4, 0); // lift it (unlocked → live recompute)
  const pVacUnlocked = await probe(4, 4);
  check('unlocked: lifting a stone inside its own territory reveals the square (live)',
    samePx(pVacUnlocked, pBase[0]), JSON.stringify({ pVacUnlocked, sq: pBase[0] }));
  await setCell(4, 4, 2); // restore it

  // ── Lock: seed a manual territory mark, then commit D&T ──────────────────
  await page.evaluate(() => { scoringState.manualTerritory[9][9] = 2; window.drawBoard(); });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 200)));
  const pManual = await probe(9, 9);
  check('pre-lock manual territory mark renders', pManual[0] > 150, JSON.stringify(pManual));

  await page.evaluate(() => window.applyScoringLock());
  await page.evaluate(() => new Promise((r) => setTimeout(r, 250)));
  check('lock commits (lockedSnapshot built)',
    await page.evaluate(() => !!(scoringState.locked && scoringState.lockedSnapshot)));
  check('lockedSnapshot board holds the cage', await lockedBoardCell(2, 3) === 2);
  check('lockedSnapshot keeps the manual territory mark', await lockedManual(9, 9) === 2);

  const totalsBefore = await scoreTotals();
  const pLock = [];
  for (const [r, c] of SAMPLES) pLock.push(await probe(r, c));
  check('LOCKED: territory overlay equals the pre-lock locked pixels',
    SAMPLES.every((_, i) => samePx(pLock[i], pBase[i])));

  // ── Post-lock playground edits: live board is cosmetic, territory must NOT move ──
  await page.evaluate(() => { scoringState.board[2][3] = 0; scoringState.manualTerritory[9][9] = 0; window.drawBoard(); });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 250)));

  const pAfter = [];
  for (const [r, c] of SAMPLES) pAfter.push(await probe(r, c));
  check('FROZEN: territory overlay unchanged after live cage removal',
    SAMPLES.every((_, i) => samePx(pAfter[i], pLock[i])), JSON.stringify({ pLock, pAfter }));
  const pManualAfter = await probe(9, 9);
  check('FROZEN: manual territory mark still rendered after live clear',
    samePx(pManualAfter, pManual), JSON.stringify({ pManual, pManualAfter }));

  const pCageVac = await probe(2, 3);
  check('NUANCE: lifting a boundary stone (adjacent to dame) reveals NO square',
    pCageVac[0] < 100, JSON.stringify(pCageVac));

  const totalsAfter = await scoreTotals();
  check('FROZEN: black score total unchanged after playground edit', totalsBefore.b === totalsAfter.b, `${totalsBefore.b} → ${totalsAfter.b}`);
  check('FROZEN: white score total unchanged after playground edit', totalsBefore.w === totalsAfter.w, `${totalsBefore.w} → ${totalsAfter.w}`);

  check('live board really did change (edit not a no-op)', await getCell(2, 3) === 0);
  check('lockedSnapshot NOT modified by live edit', await lockedBoardCell(2, 3) === 2);
  const actions = await postLockActions();
  check('post-lock work is visible as discardable playground edits', actions && actions.total >= 2, JSON.stringify(actions));

  // ── Phase C: NUANCE — a re-arranged stone inside its own marked territory ──
  // Restore the boundary stone (sealing the interior again), then lift the interior
  // stone. Its vacated point is bounded by White territory, so the counting ritual
  // must reveal a White square there while the frozen totals stay put.
  await page.evaluate(() => { scoringState.board[2][3] = 2; window.drawBoard(); });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 200)));
  const pCageBack = await probe(2, 3);
  check('NUANCE: restored boundary stone renders as a stone again',
    pCageBack[0] > 150 && !samePx(pCageBack, pBase[0]), JSON.stringify({ pCageBack, sq: pBase[0] }));
  const pVacStoneBefore = await probe(4, 4);
  check('NUANCE: interior stone still renders dark while present (frozen)',
    pVacStoneBefore[0] > 150 && !samePx(pVacStoneBefore, pBase[0]), JSON.stringify({ pVacStoneBefore, sq: pBase[0] }));

  await page.evaluate(() => { scoringState.board[4][4] = 0; window.drawBoard(); });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 200)));
  const pVacated = await probe(4, 4);
  check('NUANCE: LOCKED lift of an interior stone reveals its own territory square',
    samePx(pVacated, pBase[0]), JSON.stringify({ pVacated, sq: pBase[0] }));
  const pNeighbor = [];
  for (const [r, c] of [[3, 4], [4, 3], [4, 5], [5, 4]]) pNeighbor.push(await probe(r, c));
  check('NUANCE: neighbors of the vacated point stay territory squares',
    pNeighbor.every((p) => p[0] > 150), JSON.stringify(pNeighbor));
  const pVacSamples = [];
  for (const [r, c] of SAMPLES) pVacSamples.push(await probe(r, c));
  check('NUANCE: frozen territory samples unchanged by the vacated-point reveal',
    SAMPLES.every((_, i) => samePx(pVacSamples[i], pLock[i])));
  const totalsVac = await scoreTotals();
  check('NUANCE: score totals still frozen while vacated square is revealed',
    totalsVac.b === totalsBefore.b && totalsVac.w === totalsBefore.w, `${totalsBefore.b}:${totalsBefore.w} → ${totalsVac.b}:${totalsVac.w}`);

  // ── Unlock restores the committed resolution (no permanent leak) ──────────
  await page.evaluate(() => { scoringState.frozen = false; window.applyUnlockReset(); });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 200)));
  const pUnlock = [];
  for (const [r, c] of SAMPLES) pUnlock.push(await probe(r, c));
  check('unlock restores committed resolution (cage back, territory stable)',
    SAMPLES.every((_, i) => samePx(pUnlock[i], pBase[i])));

  const errs = consoleErrors.filter((e) => !/favicon/i.test(e));
  check('no console/page errors', errs.length === 0, errs.slice(0, 3).join(' | ') || 'clean');

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  await browser.close();
  server.close();
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
