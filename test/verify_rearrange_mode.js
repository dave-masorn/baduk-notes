// Verify re-Arrange mode places ONLY from the Re-arrange piles — never Dead or Caps.
const path = require('path');
const http = require('http');
const fs = require('fs');
const { launchLightpanda } = require('./lightpanda-launcher.js');

const REPO = '/Users/davemasorn/AntiGravity/baduk-notes';
const FIXTURE = path.join(REPO, 'kifu/Go Seigen [1928–1978 — 147 games]/1963-10-16__3rd-Old-Meijin-League__Go-Seigen__Nakamura-Yutaro__(W+2).sgf');
const PORT = 3944;

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
  await page.waitForFunction(() => window.scoringState && document.getElementById('btn-scoring-lock'), { timeout: 15000 });

  const fixture = fs.readFileSync(FIXTURE, 'utf8').trim();
  await page.evaluate((sgf) => {
    window.loadSGF(sgf);
    if (window.state.sgfMoves && window.state.sgfMoves.length > 0) {
      window.goToMove(window.state.sgfMoves.length - 1);
    }
    const rec = { id: 'rr', recNo: '01', fileNm: 'test.sgf', workingSgf: sgf, currentMoveIndex: -1 };
    window.StudyRecordDB.saveRecord(rec);
    window.state.activeStudyId = rec.id;
  }, fixture);
  await page.evaluate(() => {
    const ge = document.getElementById('game-end-popup');
    if (ge) ge.style.display = 'none';
    window.openScoringModal();
  });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 400)));
  await page.evaluate(() => document.getElementById('btn-scoring-edit').click());
  await page.evaluate(() => new Promise((r) => setTimeout(r, 150)));

  // seed pools: rearrangeBlack=3, rearrangeWhite=0, deadWhite=3, blackCaptures=2, deadBlack=2, whiteCaptures=2
  await page.evaluate(() => {
    window.scoringState.rearrangeBlack = ['B', 'B', 'B'];
    window.scoringState.rearrangeWhite = [];
    window.scoringState.deadWhite = ['W', 'W', 'W'];
    window.scoringState.deadBlack = ['B', 'B'];
    window.scoringState.blackCaptures = 2;
    window.scoringState.whiteCaptures = 2;
    window.updateScoringUI();
  });

  // Lock, then force mode to 'rearrange'
  await page.evaluate(() => document.getElementById('btn-scoring-lock').click());
  await page.evaluate(() => new Promise((r) => setTimeout(r, 200)));
  await page.evaluate(() => {
    window.scoringState.interactionMode = 'rearrange';
    const sel = document.getElementById('scoring-interaction-mode');
    if (sel) sel.value = 'rearrange';
    window.updateScoringUI();
  });

  const findEmpty = () => page.evaluate(() => {
    for (let r = 0; r < 19; r++) for (let c = 0; c < 19; c++) {
      if (window.scoringState.board[r][c] === 0) return { r, c };
    }
    return null;
  });
  const pools = () => page.evaluate(() => ({
    rB: window.scoringState.rearrangeBlack.length,
    rW: window.scoringState.rearrangeWhite.length,
    dW: window.scoringState.deadWhite.length,
    dB: window.scoringState.deadBlack.length,
    bC: window.scoringState.blackCaptures || 0,
    wC: window.scoringState.whiteCaptures || 0,
    dialog: document.getElementById('scoring-color-picker-dialog') ?
      getComputedStyle(document.getElementById('scoring-color-picker-dialog')).display : 'n/a'
  }));

  // ── Test 1: only Black has re-arrange stones → auto-place BLACK from the Re-arrange pile ──
  let cell = await findEmpty();
  await clickCell(page, cell.r, cell.c);
  let p = await pools();
  let placed = await page.evaluate((x) => window.scoringState.board[x.r][x.c], cell);
  check('T1 black auto-place from Re-arrange pile', placed === 1 && p.rB === 2 && p.dW === 3 && p.bC === 2 && p.dB === 2 && p.wC === 2,
    `placed=${placed} ${JSON.stringify(p)}`);

  // ── Test 2: BOTH Re-arrange piles empty → click is a NO-OP (no dialog, no placement, Dead/Caps untouched) ──
  await page.evaluate(() => {
    window.scoringState.rearrangeBlack = [];
    window.scoringState.rearrangeWhite = [];
    window.updateScoringUI();
  });
  cell = await findEmpty();
  await clickCell(page, cell.r, cell.c);
  p = await pools();
  placed = await page.evaluate((x) => window.scoringState.board[x.r][x.c], cell);
  check('T2 empty Re-arrange piles → no-op click', placed === 0 && p.dialog === 'none' && p.dW === 3 && p.bC === 2 && p.dB === 2 && p.wC === 2,
    `placed=${placed} ${JSON.stringify(p)}`);

  // ── Test 3: only White has re-arrange stones → auto-place WHITE from the Re-arrange pile ──
  await page.evaluate(() => {
    window.scoringState.rearrangeBlack = [];
    window.scoringState.rearrangeWhite = ['W', 'W'];
    window.updateScoringUI();
  });
  cell = await findEmpty();
  await clickCell(page, cell.r, cell.c);
  p = await pools();
  placed = await page.evaluate((x) => window.scoringState.board[x.r][x.c], cell);
  check('T3 white auto-place from Re-arrange pile', placed === 2 && p.rW === 1 && p.dW === 3 && p.bC === 2,
    `placed=${placed} ${JSON.stringify(p)}`);

  // ── Test 4: BOTH colors have re-arrange stones → color picker (step1 only, no sub-type step) ──
  await page.evaluate(() => {
    window.scoringState.rearrangeBlack = ['B'];
    window.scoringState.rearrangeWhite = ['W'];
    window.updateScoringUI();
  });
  cell = await findEmpty();
  await clickCell(page, cell.r, cell.c);
  const dlg = await page.evaluate(() => ({
    display: document.getElementById('scoring-color-picker-dialog') ? getComputedStyle(document.getElementById('scoring-color-picker-dialog')).display : 'n/a',
    step2: document.getElementById('scoring-picker-step2') ? getComputedStyle(document.getElementById('scoring-picker-step2')).display : 'n/a'
  }));
  check('T4 both piles non-empty → color picker shown, step-2 hidden', dlg.display === 'block' && dlg.step2 === 'none', JSON.stringify(dlg));
  // Pick Black → places black from Re-arrange pile only
  await page.evaluate(() => document.getElementById('btn-place-black-stone').click());
  await page.evaluate(() => new Promise((r) => setTimeout(r, 120)));
  p = await pools();
  placed = await page.evaluate((x) => window.scoringState.board[x.r][x.c], cell);
  check('T4 pick Black consumes only Re-arrange Black', placed === 1 && p.rB === 0 && p.dW === 3 && p.bC === 2 && p.dB === 2 && p.wC === 2,
    `placed=${placed} ${JSON.stringify(p)}`);

  // ── Test 5: re-arrange with ONLY Dead/Caps available (both Re-arrange piles empty) stays a no-op even via picker ──
  await page.evaluate(() => {
    window.scoringState.rearrangeBlack = [];
    window.scoringState.rearrangeWhite = [];
    window.scoringState.deadWhite = ['W', 'W', 'W'];
    window.scoringState.blackCaptures = 2;
    window.updateScoringUI();
  });
  cell = await findEmpty();
  await clickCell(page, cell.r, cell.c);
  p = await pools();
  check('T5 only Dead/Caps available → re-arrange click still a no-op', p.dialog === 'none' && p.dW === 3 && p.bC === 2, JSON.stringify(p));

  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  console.log(`\nrearrange-mode verify: ${passed} passed, ${failed} failed`);
  if (consoleErrors.length) console.log('page errors:', consoleErrors.slice(0, 5).join(' | '));
  await close();
  server.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error('CRASHED:', e); process.exit(2); });
