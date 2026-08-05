// Verify the replace-fill fix: 5 dead White + 4 caps = 9 replaceable, one pool per fill.
const path = require('path');
const http = require('http');
const fs = require('fs');
const { launchLightpanda } = require('./lightpanda-launcher.js');

const REPO = '/Users/davemasorn/AntiGravity/baduk-notes';
const FIXTURE = path.join(REPO, 'kifu/Go Seigen [1928–1978 — 147 games]/1963-10-16__3rd-Old-Meijin-League__Go-Seigen__Nakamura-Yutaro__(W+2).sgf');
const PORT = 3943;

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
    const rec = { id: 'rf', recNo: '01', fileNm: 'test.sgf', workingSgf: sgf, currentMoveIndex: -1 };
    window.StudyRecordDB.saveRecord(rec);
    window.state.activeStudyId = rec.id;
  }, fixture);
  await page.evaluate(() => {
    const ge = document.getElementById('game-end-popup');
    if (ge) ge.style.display = 'none';
    window.openScoringModal();
  });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 400)));

  // Edit → seed pools directly (5 dead White + 4 caps). No UI marking: the fixture's
  // terminal position already has defined White territory, and the pools drive the replace.
  await page.evaluate(() => document.getElementById('btn-scoring-edit').click());
  await page.evaluate(() => new Promise((r) => setTimeout(r, 150)));

  await page.evaluate(() => {
    window.scoringState.deadWhite = ['W', 'W', 'W', 'W', 'W'];
    window.scoringState.bucketBlack = ['W', 'W', 'W', 'W', 'W'];
    window.scoringState.blackCaptures = 4;
    window.updateScoringUI();
  });
  const deadAfterMarks = await page.evaluate(() => window.scoringState.deadWhite.length);
  check('setup: 5 dead White + 4 caps', deadAfterMarks === 5 && await page.evaluate(() => window.scoringState.blackCaptures) === 4, `deadWhite=${deadAfterMarks}`);

  // Lock → mode auto-switches to replace
  await page.evaluate(() => document.getElementById('btn-scoring-lock').click());
  await page.evaluate(() => new Promise((r) => setTimeout(r, 200)));
  const modeAfterLock = await page.evaluate(() => ({ locked: window.scoringState.locked, mode: window.scoringState.interactionMode }));
  check('setup: lock engaged + mode=replace', modeAfterLock.locked === true && modeAfterLock.mode === 'replace', JSON.stringify(modeAfterLock));

  // Helper: find first empty cell that is White territory (terrColor===2), replicating handler logic
  const findWhiteTerr = () => page.evaluate(() => {
    const st = window.scoringState;
    const stonesWithDead = st.board.map((row, ri) =>
      row.map((val, ci) => {
        if (st.markedDead[ri][ci] && val === 0) return st.deadStonesInfo[ri][ci] || 0;
        return val;
      })
    );
    const loc = st.ruleMode === 'japanese'
      ? window.GoScorer.territoryScoring(stonesWithDead, st.markedDead, false)
      : null;
    for (let r = 0; r < 19; r++) for (let c = 0; c < 19; c++) {
      if (st.board[r][c] !== 0) continue;
      const tc = loc && loc[r] && loc[r][c] ? (loc[r][c].isTerritoryFor || 0) : 0;
      if (tc === 2) return { r, c };
    }
    return null;
  });

  const snap = () => page.evaluate(() => ({
    deadWhite: window.scoringState.deadWhite.length,
    blackCaptures: window.scoringState.blackCaptures || 0,
    bucketTotal: window.scoringState.deadWhite.length + (window.scoringState.blackCaptures || 0)
  }));

  const clicks = [];
  let prev = await snap();
  for (let i = 0; i < 11; i++) {
    const cell = await findWhiteTerr();
    if (!cell) break;
    const box = await page.evaluate(() => {
      const el = document.getElementById('go-board-canvas-scoring');
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    const PADDING = 36, CELL = (600 - 72) / 18;
    const cx = box.x + ((PADDING + cell.c * CELL) / 600) * box.w;
    const cy = box.y + ((PADDING + cell.r * CELL) / 600) * box.h;
    await page.mouse.click(cx, cy);
    await page.evaluate(() => new Promise((r) => setTimeout(r, 100)));
    const cur = await snap();
    const placed = await page.evaluate((p) => window.scoringState.board[p.r][p.c], cell);
    const drained = prev.bucketTotal - cur.bucketTotal;
    const which = prev.deadWhite - cur.deadWhite === 1 ? 'dead' : (prev.blackCaptures - cur.blackCaptures === 1 ? 'cap' : 'none');
    clicks.push({ i: i + 1, placed, drained, which, deadWhite: cur.deadWhite, blackCaptures: cur.blackCaptures });
    prev = cur;
  }

  console.log('  fill trace:', JSON.stringify(clicks));
  const successful = clicks.filter(c => c.placed !== 0);
  check('all 9 replaces land (stones placed)', successful.length === 9, `placed=${successful.length}`);
  check('one pool drains per fill (no double deduction)', clicks.slice(0, 9).every(c => c.drained === 1), 'drain=1 per fill');
  check('dead pile used first, then caps', clicks.slice(0, 5).every(c => c.which === 'dead')
    && clicks.slice(5, 9).every(c => c.which === 'cap'), JSON.stringify(clicks.map(c => c.which)));
  const end = await snap();
  check('all 9 consumed by fill 9', end.bucketTotal === 0 && end.deadWhite === 0 && end.blackCaptures === 0, JSON.stringify(end));
  check('10th+ fill blocked (nothing to place)', clicks.length >= 9 && (clicks[9] ? clicks[9].placed === 0 : true), `attempts=${clicks.length}`);

  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  console.log(`\nreplace-fix verify: ${passed} passed, ${failed} failed`);
  if (consoleErrors.length) console.log('page errors:', consoleErrors.slice(0, 5).join(' | '));
  await close();
  server.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error('CRASHED:', e); process.exit(2); });
