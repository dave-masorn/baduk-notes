// Verify: clicking a replaced Dead stone in Replace mode removes it from the board and
// returns the prisoner to its pool (Dead pile or Caps counter); non-replaced stones are untouched.
const path = require('path');
const http = require('http');
const fs = require('fs');
const { launchLightpanda } = require('./lightpanda-launcher.js');

const REPO = '/Users/davemasorn/AntiGravity/baduk-notes';
const FIXTURE = path.join(REPO, 'kifu/Go Seigen [1928–1978 — 147 games]/1963-10-16__3rd-Old-Meijin-League__Go-Seigen__Nakamura-Yutaro__(W+2).sgf');
const PORT = 3945;

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
    const rec = { id: 'rf2', recNo: '01', fileNm: 'test.sgf', workingSgf: sgf, currentMoveIndex: -1 };
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

  // Seed pools: deadWhite=2, blackCaptures=2, deadBlack=1, whiteCaptures=1
  await page.evaluate(() => {
    window.scoringState.deadWhite = ['W', 'W'];
    window.scoringState.bucketBlack = ['W', 'W'];
    window.scoringState.blackCaptures = 2;
    window.scoringState.deadBlack = ['B'];
    window.scoringState.bucketWhite = ['B'];
    window.scoringState.whiteCaptures = 1;
    window.updateScoringUI();
  });
  await page.evaluate(() => document.getElementById('btn-scoring-lock').click());
  await page.evaluate(() => new Promise((r) => setTimeout(r, 200)));

  const pools = () => page.evaluate(() => ({
    dW: window.scoringState.deadWhite.length,
    bC: window.scoringState.blackCaptures || 0,
    dB: window.scoringState.deadBlack.length,
    wC: window.scoringState.whiteCaptures || 0,
    map: JSON.parse(JSON.stringify(window.scoringState.replacedStoneMap)),
    mode: window.scoringState.interactionMode
  }));

  const findTerrCell = (terrColor) => page.evaluate((want) => {
    const st = window.scoringState;
    const stonesWithDead = st.board.map((row, ri) =>
      row.map((val, ci) => {
        if (st.markedDead[ri][ci] && val === 0) return st.deadStonesInfo[ri][ci] || 0;
        return val;
      })
    );
    const loc = st.ruleMode === 'japanese' ? window.GoScorer.territoryScoring(stonesWithDead, st.markedDead, false) : null;
    for (let r = 0; r < 19; r++) for (let c = 0; c < 19; c++) {
      if (st.board[r][c] !== 0) continue;
      const tc = loc && loc[r] && loc[r][c] ? (loc[r][c].isTerritoryFor || 0) : 0;
      if (tc === want) return { r, c };
    }
    return null;
  }, terrColor);

  // ── White side, dead source ─────────────────────────────────────────────
  let a = await findTerrCell(2);
  await clickCell(page, a.r, a.c);
  let p = await pools();
  const pa = await page.evaluate((x) => window.scoringState.board[x.r][x.c], a);
  check('R1 fill consumes dead pile, records map', pa === 2 && p.dW === 1 && p.bC === 2 && p.map[`${a.r},${a.c}`] && p.map[`${a.r},${a.c}`].type === 'dead',
    `placed=${pa} ${JSON.stringify(p)}`);

  await clickCell(page, a.r, a.c);
  p = await pools();
  const pa2 = await page.evaluate((x) => window.scoringState.board[x.r][x.c], a);
  check('R2 click removes replaced stone, restores dead pile', pa2 === 0 && p.dW === 2 && p.bC === 2 && !p.map[`${a.r},${a.c}`],
    `cell=${pa2} ${JSON.stringify(p)}`);

  // ── White side, cap source (dead exhausted) ─────────────────────────────
  await clickCell(page, a.r, a.c); // refill A (dead 2→1)
  const b = await findTerrCell(2); // different cell
  await clickCell(page, b.r, b.c); // fill B (dead 1→0)
  const c = await findTerrCell(2);
  await clickCell(page, c.r, c.c); // fill C (dead empty → caps 2→1)
  p = await pools();
  check('R3 caps fill recorded as cap', p.bC === 1 && p.map[`${c.r},${c.c}`] && p.map[`${c.r},${c.c}`].type === 'cap',
    JSON.stringify(p));

  await clickCell(page, c.r, c.c); // reverse C → caps back
  p = await pools();
  const pc = await page.evaluate((x) => window.scoringState.board[x.r][x.c], c);
  check('R4 click removes cap-source stone, restores caps', pc === 0 && p.bC === 2 && !p.map[`${c.r},${c.c}`],
    `cell=${pc} ${JSON.stringify(p)}`);

  await clickCell(page, b.r, b.c); // reverse B → dead back
  p = await pools();
  check('R5 reverse dead-source stone restores dead pile', p.dW === 1 && p.bC === 2, JSON.stringify(p));

  // ── Non-replaced live stone is untouched ────────────────────────────────
  const live = await page.evaluate(() => {
    for (let r = 0; r < 19; r++) for (let c = 0; c < 19; c++) {
      if (window.scoringState.board[r][c] === 2 && !window.scoringState.replacedStoneMap[`${r},${c}`]) return { r, c };
    }
    return null;
  });
  const liveBefore = await page.evaluate((x) => window.scoringState.board[x.r][x.c], live);
  const liveMapBefore = await page.evaluate(() => JSON.parse(JSON.stringify(window.scoringState.replacedStoneMap)));
  await clickCell(page, live.r, live.c);
  const liveAfter = await page.evaluate((x) => window.scoringState.board[x.r][x.c], live);
  p = await pools();
  check('R6 non-replaced live stone click is a no-op', liveAfter === liveBefore && p.dW === 1 && p.bC === 2,
    `before=${liveBefore} after=${liveAfter} ${JSON.stringify(p)}`);

  // ── Black side, dead source ─────────────────────────────────────────────
  const bk = await findTerrCell(1);
  await clickCell(page, bk.r, bk.c);
  p = await pools();
  const pbk = await page.evaluate((x) => window.scoringState.board[x.r][x.c], bk);
  check('R7 black fill consumes deadBlack, records map', pbk === 1 && p.dB === 0 && p.wC === 1 && p.map[`${bk.r},${bk.c}`] && p.map[`${bk.r},${bk.c}`].type === 'dead',
    `placed=${pbk} ${JSON.stringify(p)}`);
  await clickCell(page, bk.r, bk.c);
  p = await pools();
  const pbk2 = await page.evaluate((x) => window.scoringState.board[x.r][x.c], bk);
  check('R8 black-side reversal restores deadBlack', pbk2 === 0 && p.dB === 1 && p.wC === 1 && !p.map[`${bk.r},${bk.c}`],
    `cell=${pbk2} ${JSON.stringify(p)}`);

  // ── Persistence: Save Board → close → reopen → still reversible ────────
  await clickCell(page, bk.r, bk.c); // refill black (dB 1→0)
  await page.evaluate(() => document.getElementById('btn-scoring-save').click());
  await page.evaluate(() => new Promise((r) => setTimeout(r, 250)));
  await page.evaluate(() => window.closeScoringModal());
  await page.evaluate(() => window.openScoringModal());
  await page.evaluate(() => new Promise((r) => setTimeout(r, 350)));
  await page.evaluate(() => document.getElementById('btn-scoring-edit').click());
  await page.evaluate(() => new Promise((r) => setTimeout(r, 150)));
  const bkStill = await page.evaluate((x) => window.scoringState.board[x.r][x.c], bk);
  p = await pools();
  check('R9 reopen restores replaced stone + map', bkStill === 1 && p.dB === 0 && p.map[`${bk.r},${bk.c}`] && p.map[`${bk.r},${bk.c}`].type === 'dead',
    `cell=${bkStill} ${JSON.stringify(p)}`);
  await page.evaluate(() => {
    window.__probe = [];
    const canvas = document.getElementById('go-board-canvas-scoring');
    canvas.addEventListener('click', (e) => {
      const rect = canvas.getBoundingClientRect();
      const PADDING = 36, CELL = (600 - 72) / 18;
      const clickX = ((e.clientX - rect.left) / rect.width) * 600;
      const clickY = ((e.clientY - rect.top) / rect.height) * 600;
      window.__probe.push({
        rect: { l: rect.left, t: rect.top, w: rect.width, h: rect.height },
        row: Math.round((clickY - PADDING) / CELL), col: Math.round((clickX - PADDING) / CELL)
      });
    }, { once: true });
  });
  await clickCell(page, bk.r, bk.c);
  const probe = await page.evaluate(() => window.__probe);
  console.log('R10 probe:', JSON.stringify(probe), 'target:', JSON.stringify(bk));
  p = await pools();
  const diag = await page.evaluate(() => {
    const c = document.getElementById('go-board-canvas-scoring');
    const r = c.getBoundingClientRect();
    const PADDING = 36, CELL = (600 - 72) / 18;
    const x = r.x + ((PADDING + 2 * CELL) / 600) * r.width;
    const y = r.y + ((PADDING + 6 * CELL) / 600) * r.height;
    const el = document.elementFromPoint(x, y);
    const walk = [];
    let n = el;
    while (n) { walk.push(n.id || n.className || n.tagName); n = n.parentElement; }
    return {
      frozen: window.scoringState.frozen,
      locked: window.scoringState.locked,
      boardCell: window.scoringState.board[6][2],
      mapHas: !!window.scoringState.replacedStoneMap['6,2'],
      canvasRect: { x: r.x, y: r.y, w: r.width, h: r.height, display: getComputedStyle(c).display, vis: getComputedStyle(c).visibility },
      hitEl: el ? (el.id || el.className || el.tagName) : 'none',
      hitChain: walk.slice(0, 8).join(' < ')
    };
  });
  console.log('R10 diag:', JSON.stringify(diag));
  const bkNow = await page.evaluate((x) => window.scoringState.board[x.r][x.c], bk);
  check('R10 reopened replaced stone is still reversible', bkNow === 0 && p.dB === 1 && !p.map[`${bk.r},${bk.c}`],
    `cell=${bkNow} ${JSON.stringify(p)}`);

  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  console.log(`\nreplace-click verify: ${passed} passed, ${failed} failed`);
  if (consoleErrors.length) console.log('page errors:', consoleErrors.slice(0, 5).join(' | '));
  await close();
  server.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error('CRASHED:', e); process.exit(2); });
