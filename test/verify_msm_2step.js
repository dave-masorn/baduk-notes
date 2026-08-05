// v0.1.061 verification harness: the two-step Save (Lock Score → Save Board).
// Rebuilt fresh after the prior temp-dir harness was wiped by the OS.
const path = require('path');
const http = require('http');
const fs = require('fs');
const { launchLightpanda } = require('./lightpanda-launcher.js');

const REPO = '/Users/davemasorn/AntiGravity/baduk-notes';
const FIXTURE = path.join(REPO, 'kifu/Go Seigen [1928–1978 — 147 games]/1963-10-16__3rd-Old-Meijin-League__Go-Seigen__Nakamura-Yutaro__(W+2).sgf');
const PORT = 3942;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf'
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  let filePath = path.join(REPO, urlPath === '/' ? 'index.html' : urlPath);
  if (!filePath.startsWith(REPO)) { res.writeHead(403); res.end(); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
});

let results = [];
function check(name, cond, detail) {
  results.push({ name, pass: !!cond, detail: detail || '' });
  const mark = cond ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${name}${detail ? ' — ' + detail : ''}`);
}

async function evalIn(page, fn, ...args) {
  return page.evaluate(fn, ...args);
}

async function main() {
  await new Promise((r) => server.listen(PORT, r));
  const { page, close } = await launchLightpanda();
  const consoleErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.scoringState && document.getElementById('btn-scoring-lock'), { timeout: 15000 });

  const fixture = fs.readFileSync(FIXTURE, 'utf8').trim();
  const variant = fixture.slice(0, fixture.lastIndexOf(';') + 1) + 'B[bi]DD[ea][ga][ra]MA[ea][ga][ra]TB[sa]TW[aa])';

  // ── page-side helpers ─────────────────────────────────────────────────────
  await page.exposeFunction('__noop', () => {});
  await evalIn(page, () => {
    window.__h = {
      loadScenario(sgf, id) {
        window.loadSGF(sgf);
        // loadSGF lands on the first move; navigate to the last move so state.board holds the
        // full terminal position (what the scoring modal's first-entry reset reads).
        if (window.state.sgfMoves && window.state.sgfMoves.length > 0) {
          window.goToMove(window.state.sgfMoves.length - 1);
        }
        const rec = {
          id, recNo: '0' + (Math.abs(id.length)), fileNm: 'test.sgf',
          workingSgf: sgf, currentMoveIndex: -1
        };
        window.StudyRecordDB.saveRecord(rec);
        window.state.activeStudyId = rec.id;
      },
      open() {
        const ge = document.getElementById('game-end-popup');
        if (ge) ge.style.display = 'none';
        window.openScoringModal();
      },
      close() { window.closeScoringModal(); },
      clickBtn(id) {
        const el = document.getElementById(id);
        if (el) el.click();
        return !!(el);
      },
      btn(id) {
        const el = document.getElementById(id);
        if (!el) return null;
        return { text: el.textContent, disabled: el.disabled, title: el.title, display: getComputedStyle(el).display };
      },
      state() {
        return {
          locked: window.scoringState.locked,
          frozen: window.scoringState.frozen,
          mode: window.scoringState.interactionMode,
          saved: window._savedBoardSnapshot,
          board: window.scoringState.board,
          markedDead: window.scoringState.markedDead,
          deadStonesInfo: window.scoringState.deadStonesInfo,
          deadWhite: window.scoringState.deadWhite,
          deadBlack: window.scoringState.deadBlack,
          blackCaptures: window.scoringState.blackCaptures,
          whiteCaptures: window.scoringState.whiteCaptures,
          lockedBoard: window.scoringState.lockedSnapshot ? window.scoringState.lockedSnapshot.board : null
        };
      },
      markCount() {
        let n = 0;
        for (let r = 0; r < 19; r++) for (let c = 0; c < 19; c++) if (window.scoringState.markedDead[r][c]) n++;
        return n;
      },
      terminalProps() {
        const mv = window.state.sgfMoves[window.state.sgfMoves.length - 1];
        const up = mv.unknownProps || {};
        return {
          DD: up.DD ? up.DD.slice() : (mv.DD ? mv.DD.slice() : null),
          MA: up.MA ? up.MA.slice() : (mv.MA ? mv.MA.slice() : null),
          TB: up.TB ? up.TB.slice() : (mv.TB ? mv.TB.slice() : null),
          TW: up.TW ? up.TW.slice() : (mv.TW ? mv.TW.slice() : null),
          directDD: mv.DD ? mv.DD.slice() : null,
          isSgfDirty: window.state.isSgfDirty
        };
      },
      workingSgf() {
        const rec = window.StudyRecordDB.getRecord(window.state.activeStudyId);
        return rec ? rec.workingSgf : null;
      },
      scoringData() {
        const rec = window.StudyRecordDB.getRecord(window.state.activeStudyId);
        return rec ? rec.scoringData : null;
      },
      runSnapshot() {
        const snap = window.resolveScoringInputs();
        return { board: snap.board, hasMarkup: snap.hasMarkup, provenance: snap.provenance };
      },
      // Find a live stone of the given color on the CURRENT live board.
      findStone(color) {
        for (let r = 0; r < 19; r++) for (let c = 0; c < 19; c++) {
          if (window.scoringState.board[r][c] === color) return { r, c };
        }
        return null;
      },
      findEmpty() {
        for (let r = 0; r < 19; r++) for (let c = 0; c < 19; c++) {
          if (window.scoringState.board[r][c] === 0) return { r, c };
        }
        return null;
      },
      removeStoneAt(r, c) {
        window.scoringState.board[r][c] = 0;
        window.drawBoard();
        return true;
      },
      resultDisplay() {
        const el = document.getElementById('scoring-result-display');
        return el ? el.textContent : null;
      },
      sgfPropsBadgeVisible() {
        const el = document.getElementById('sgf-prop-bars-save-badge');
        return el ? getComputedStyle(el).display !== 'none' : false;
      }
    };
  });

  const clickStone = async (page, stone) => {
    const box = await page.evaluate(() => {
      const el = document.getElementById('go-board-canvas-scoring');
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    const PADDING = 36, CELL = (600 - 72) / 18;
    const cx = box.x + ((PADDING + stone.c * CELL) / 600) * box.w;
    const cy = box.y + ((PADDING + stone.r * CELL) / 600) * box.h;
    console.log('  clickStone target', JSON.stringify(stone), 'box', JSON.stringify(box), 'click', Math.round(cx), Math.round(cy));
    await page.mouse.click(cx, cy);
    await page.evaluate(() => new Promise(r => setTimeout(r, 80)));
    const probe = await page.evaluate((p) => {
      const b = window.scoringState.board;
      let marks = 0;
      for (let r = 0; r < 19; r++) for (let c = 0; c < 19; c++) if (window.scoringState.markedDead[r][c]) marks++;
      return { cellVal: b[p.r] ? b[p.r][p.c] : 'OOB', marks };
    }, stone);
    console.log('  clickStone probe:', JSON.stringify(probe));
    const hit = await page.evaluate((p) => {
      const el = document.getElementById('go-board-canvas-scoring');
      const r = el.getBoundingClientRect();
      const PADDING = 36, CELL = (600 - 72) / 18;
      const cx = r.x + ((PADDING + p.c * CELL) / 600) * r.width;
      const cy = r.y + ((PADDING + p.r * CELL) / 600) * r.height;
      const top = document.elementFromPoint(cx, cy);
      return { cx, cy, topId: top ? top.id : 'null', topCls: top ? top.className : '', topTag: top ? top.tagName : '' };
    }, stone);
    console.log('  elementFromPoint:', JSON.stringify(hit));
  };

  // ── S1: pre-lock labels + Save Board grayed out ───────────────────────────
  await evalIn(page, (sgf) => __h.loadScenario(sgf, 's1'), fixture);
  await evalIn(page, () => __h.open());
  await page.evaluate(() => new Promise(r => setTimeout(r, 300)));
  {
    const d = await evalIn(page, () => {
      const b = window.scoringState.board;
      let n1 = 0, n2 = 0;
      for (let r = 0; r < 19; r++) for (let c = 0; c < 19; c++) { if (b[r][c] === 1) n1++; else if (b[r][c] === 2) n2++; }
      return { n1, n2 };
    });
    console.log('  S1 board diag:', JSON.stringify(d));
  }
  {
    const s = await evalIn(page, () => __h.state());
    const lock = await evalIn(page, () => __h.btn('btn-scoring-lock'));
    const reset = await evalIn(page, () => __h.btn('btn-scoring-reset'));
    check('S1 fresh file opens unlocked', s.locked === false && s.frozen === true);
    check('S1 pre-lock lock label = Save D&T', lock && lock.text === 'Save D&T');
    check('S1 pre-lock reset label = Reset Score', reset && reset.text === 'Reset Score');
    // Fresh opens frozen (Edit-first). Click Edit to reach the real pre-D&T editable stage.
    await evalIn(page, () => __h.clickBtn('btn-scoring-edit'));
    await page.evaluate(() => new Promise(r => setTimeout(r, 100)));
    const save = await evalIn(page, () => __h.btn('btn-scoring-save'));
    check('S1 pre-D&T Save Board grayed out', save && save.disabled === true && save.text === 'Save Board'
      && save.title === 'Lock the Score first to enable Save Board');
  }

  // ── S2: mark → Lock writes SGF + flips labels ─────────────────────────────
  // Fresh opens are frozen — Edit first to enable marking.
  await evalIn(page, () => __h.clickBtn('btn-scoring-edit'));
  await page.evaluate(() => new Promise(r => setTimeout(r, 100)));
  const stone = await evalIn(page, () => __h.findStone(1));
  await clickStone(page, stone);
  const preLockCount = await evalIn(page, () => __h.markCount());
  const diagAfterMark = await evalIn(page, () => {
    const b = window.scoringState.board;
    let n1 = 0, n2 = 0;
    for (let r = 0; r < 19; r++) for (let c = 0; c < 19; c++) { if (b[r][c] === 1) n1++; else if (b[r][c] === 2) n2++; }
    return { n1, n2, marks: (() => { let m = 0; for (let r = 0; r < 19; r++) for (let c = 0; c < 19; c++) if (window.scoringState.markedDead[r][c]) m++; return m; })() };
  });
  console.log('  S2 diag after mark:', JSON.stringify(diagAfterMark));
  check('S2 marking toggled a dead mark', preLockCount >= 1);
  await evalIn(page, () => __h.clickBtn('btn-scoring-lock'));
  await page.evaluate(() => new Promise(r => setTimeout(r, 200)));
  {
    const s = await evalIn(page, () => __h.state());
    const lock = await evalIn(page, () => __h.btn('btn-scoring-lock'));
    const reset = await evalIn(page, () => __h.btn('btn-scoring-reset'));
    const save = await evalIn(page, () => __h.btn('btn-scoring-save'));
    const props = await evalIn(page, () => __h.terminalProps());
    const badge = await evalIn(page, () => __h.sgfPropsBadgeVisible());
    check('S2 lock engages', s.locked === true);
    check('S2 lock label flips to Start D&T', lock && lock.text === 'Start D&T');
    check('S2 reset label flips to Reset Board', reset && reset.text === 'Reset Board');
    check('S2 Save Board enabled after lock', save && save.disabled === false && save.text === 'Save Board');
    check('S2 Lock wrote DD into terminal node', props.DD !== null && props.DD.length >= 1);
    check('S2 Lock mirrored DD onto direct field', props.directDD !== null && props.directDD.length === props.DD.length);
    check('S2 Lock set isSgfDirty', props.isSgfDirty === true);
    check('S2 sgf-prop-bars-save-badge shown', badge === true);
  }

  // ── S3: Save Board is memory-only (SGF unchanged by save) ─────────────────
  const sgfBeforeSave = await evalIn(page, () => __h.workingSgf());
  const propsBeforeSave = await evalIn(page, () => __h.terminalProps());
  await evalIn(page, () => __h.clickBtn('btn-scoring-save'));
  await page.evaluate(() => new Promise(r => setTimeout(r, 200)));
  {
    const s = await evalIn(page, () => __h.state());
    const save = await evalIn(page, () => __h.btn('btn-scoring-save'));
    const edit = await evalIn(page, () => __h.btn('btn-scoring-edit'));
    const propsAfter = await evalIn(page, () => __h.terminalProps());
    const sgfAfter = await evalIn(page, () => __h.workingSgf());
    check('S3 Save Board freezes the modal', s.frozen === true);
    check('S3 save button shows Board Saved ✓', save && save.text === 'Board Saved ✓');
    check('S3 Edit button visible', edit && edit.display !== 'none');
    check('S3 Save Board captured a savedBoard playground', s.saved !== null && !!s.saved.board);
    check('S3 Save did NOT rewrite terminal DD', JSON.stringify(propsAfter.DD) === JSON.stringify(propsBeforeSave.DD));
    check('S3 Save did NOT rewrite workingSgf', sgfAfter === sgfBeforeSave);
  }
  {
    const sd = await evalIn(page, () => __h.scoringData());
    check('S3 rec.scoringData.savedBoard present', !!sd && !!sd.savedBoard && !!sd.savedBoard.board);
  }

  // ── S4: playground edit → Save → reopen restores playground, score stays committed ──
  // Unfreeze via Edit, remove a live black stone (a post-lock playground edit), re-save.
  await evalIn(page, () => __h.clickBtn('btn-scoring-edit'));
  await page.evaluate(() => new Promise(r => setTimeout(r, 100)));
  const diag = await evalIn(page, () => {
    const b = window.scoringState.board;
    let n1 = 0, n2 = 0, obj = 0;
    for (let r = 0; r < 19; r++) for (let c = 0; c < 19; c++) {
      if (b[r][c] === 1) n1++; else if (b[r][c] === 2) n2++; else if (typeof b[r][c] === 'object') obj++;
    }
    return { n1, n2, obj, locked: window.scoringState.locked, frozen: window.scoringState.frozen, mode: window.scoringState.interactionMode };
  });
  console.log('  S4 diag:', JSON.stringify(diag));
  const liveBlack = await evalIn(page, () => __h.findStone(1));
  const committedHas = await evalIn(page, (p) => {
    const s = __h.state();
    return s.lockedBoard[p.r][p.c];
  }, liveBlack);
  await evalIn(page, (p) => __h.removeStoneAt(p.r, p.c), liveBlack);
  await evalIn(page, () => __h.clickBtn('btn-scoring-save'));
  await page.evaluate(() => new Promise(r => setTimeout(r, 200)));
  await evalIn(page, () => __h.close());
  await evalIn(page, () => __h.open());
  await page.evaluate(() => new Promise(r => setTimeout(r, 300)));
  {
    const s = await evalIn(page, () => __h.state());
    const save = await evalIn(page, () => __h.btn('btn-scoring-save'));
    const playgroundCell = await evalIn(page, (p) => __h.state().board[p.r][p.c], liveBlack);
    const run = await evalIn(page, () => __h.runSnapshot());
    const runCell = await evalIn(page, (p) => {
      const b = __h.runSnapshot().board;
      const v = b[p.r][p.c];
      return (v && v.player) || v || 0;
    }, liveBlack);
    const mc = await evalIn(page, () => __h.markCount());
    const mdSrc = await evalIn(page, () => {
      const sd = __h.scoringData();
      const pd = window._scoringPersistData;
      const c = (g) => { let n = 0; if (!g) return -1; for (let r = 0; r < 19; r++) for (let c2 = 0; c2 < 19; c2++) if (g[r][c2]) n++; return n; };
      return { persist: c(pd && pd.markedDead), rec: c(sd && sd.markedDead), live: c(window.scoringState.markedDead), persistHas: !!pd };
    });
    console.log('  S4 runCell:', JSON.stringify(runCell), 'markCount:', mc, 'mdSrc:', JSON.stringify(mdSrc));
    check('S4 reopen restores playground (stone removed) in modal display', playgroundCell === 0);
    check('S4 reopen is frozen with Board Saved ✓', s.frozen === true && save.text === 'Board Saved ✓');
    check('S4 committed board still has the stone (lockedSnapshot intact)', committedHas !== 0);
    check('S4 Run snapshot uses committed board (stone present)', (runCell === 1 || runCell === 'B') && s.lockedBoard[liveBlack.r][liveBlack.c] === 1);
    check('S4 committed marks survive reopen', (await evalIn(page, () => __h.markCount())) >= 1);
  }

  // ── S5: Reset Board (locked) restores committed board + clears savedBoard ──
  await evalIn(page, () => __h.clickBtn('btn-scoring-edit'));
  await page.evaluate(() => new Promise(r => setTimeout(r, 100)));
  await evalIn(page, () => __h.clickBtn('btn-scoring-reset'));
  await page.evaluate(() => new Promise(r => setTimeout(r, 100)));
  {
    const msg = await evalIn(page, () => document.getElementById('scoring-reset-confirm-msg').textContent);
    check('S5 locked reset confirm copy = Reset Playground…', msg.indexOf('Reset Playground will:') === 0);
    const t5 = await evalIn(page, () => document.getElementById('scoring-reset-confirm-title').textContent);
    const c5 = await evalIn(page, () => document.getElementById('btn-scoring-confirm-reset').textContent);
    check('S5 locked reset confirm title/btn = Reset Playground Board? / Reset Board', t5 === 'Reset Playground Board?' && c5 === 'Reset Board');
  }
  await evalIn(page, () => __h.clickBtn('btn-scoring-confirm-reset'));
  await page.evaluate(() => new Promise(r => setTimeout(r, 200)));
  {
    const s = await evalIn(page, () => __h.state());
    const sd = await evalIn(page, () => __h.scoringData());
    const lock = await evalIn(page, () => __h.btn('btn-scoring-lock'));
    const boardCell = await evalIn(page, (p) => __h.state().board[p.r][p.c], liveBlack);
    check('S5 Reset Board restores committed board (stone back)', boardCell === 1);
    check('S5 Reset Board keeps the lock engaged', s.locked === true);
    check('S5 Reset Board cleared the savedBoard playground', s.saved === null);
    check('S5 Reset Board dropped savedBoard from rec.scoringData', !sd || !sd.savedBoard);
    check('S5 lock still shows Start D&T', lock && lock.text === 'Start D&T');
  }

  // ── S6: unlock → Reset Score → pristine persisted ─────────────────────────
  await evalIn(page, () => __h.clickBtn('btn-scoring-lock'));
  await page.evaluate(() => new Promise(r => setTimeout(r, 150)));
  {
    const s = await evalIn(page, () => __h.state());
    const lock = await evalIn(page, () => __h.btn('btn-scoring-lock'));
    const reset = await evalIn(page, () => __h.btn('btn-scoring-reset'));
    const save = await evalIn(page, () => __h.btn('btn-scoring-save'));
    check('S6 unlock returns to pre-lock stage', s.locked === false);
    check('S6 unlock cleared savedBoard', s.saved === null);
    check('S6 pre-lock labels restored', lock.text === 'Save D&T' && reset.text === 'Reset Score');
    check('S6 Save Board grayed out again', save.disabled === true);
  }
  await evalIn(page, () => __h.clickBtn('btn-scoring-reset'));
  await page.evaluate(() => new Promise(r => setTimeout(r, 100)));
  {
    const msg = await evalIn(page, () => document.getElementById('scoring-reset-confirm-msg').textContent);
    check('S6 unlocked reset confirm copy = Reset D&T Scoring…', msg.indexOf('Reset D&T Scoring will:') === 0);
    const t6 = await evalIn(page, () => document.getElementById('scoring-reset-confirm-title').textContent);
    const c6 = await evalIn(page, () => document.getElementById('btn-scoring-confirm-reset').textContent);
    check('S6 unlocked reset confirm title/btn = Reset D&T Scoring? / Reset D&T', t6 === 'Reset D&T Scoring?' && c6 === 'Reset D&T');
  }
  await evalIn(page, () => __h.clickBtn('btn-scoring-confirm-reset'));
  await page.evaluate(() => new Promise(r => setTimeout(r, 200)));
  {
    const s = await evalIn(page, () => __h.state());
    const sd = await evalIn(page, () => __h.scoringData());
    let marks = 0;
    for (let r = 0; r < 19; r++) for (let c = 0; c < 19; c++) if (s.markedDead[r][c]) marks++;
    let stones = 0;
    for (let r = 0; r < 19; r++) for (let c = 0; c < 19; c++) if (s.board[r][c]) stones++;
    check('S6 Reset Score clears all marks', marks === 0);
    check('S6 Reset Score rebuilds the full terminal board', stones > 0);
    check('S6 Reset Score leaves unlocked', s.locked === false);
    check('S6 Reset Score persisted pristine session', !!sd && sd.markedDead && sd.markedDead.every(row => row.every(v => !v)));
    check('S6 Reset Score persisted without savedBoard', !sd || !sd.savedBoard);
  }

  // ── S7: pre-engaged lock (file markup) does NOT rewrite the SGF ───────────
  await evalIn(page, (sgf) => __h.loadScenario(sgf, 's7'), variant);
  await evalIn(page, () => __h.open());
  await page.evaluate(() => new Promise(r => setTimeout(r, 300)));
  {
    const s = await evalIn(page, () => __h.state());
    const props = await evalIn(page, () => __h.terminalProps());
    const lock = await evalIn(page, () => __h.btn('btn-scoring-lock'));
    console.log('  S7 props:', JSON.stringify(props), 'lock:', JSON.stringify(lock));
    check('S7 file markup pre-engages the lock', s.locked === true);
    check('S7 pre-engaged lock does NOT set isSgfDirty', props.isSgfDirty === false);
    check('S7 terminal props unchanged from the file (DD=3)', props.DD && props.DD.length === 3);
    const sd = await evalIn(page, () => __h.scoringData());
    check('S7 pre-engaged open wrote no rec.scoringData', !sd);
  }
  await evalIn(page, () => __h.clickBtn('btn-scoring-edit'));
  await page.evaluate(() => new Promise(r => setTimeout(r, 150)));
  {
    const lock = await evalIn(page, () => __h.btn('btn-scoring-lock'));
    const reset = await evalIn(page, () => __h.btn('btn-scoring-reset'));
    check('S7 post-D&T labels shown', lock && lock.text === 'Start D&T' && reset.text === 'Reset Board');
  }

  // ── S8: fresh load clears savedBoard + persist data ───────────────────────
  await evalIn(page, () => __h.close());
  await evalIn(page, (sgf) => __h.loadScenario(sgf, 's8'), fixture);
  {
    const st = await evalIn(page, () => __h.state());
    const cleared = await evalIn(page, () => window._savedBoardSnapshot === null && window._scoringPersistData === null);
    check('S8 fresh load clears savedBoard and persist data', cleared);
    check('S8 fresh load leaves unlocked', st.locked === false);
  }

  // ── S9: unlock after save clears savedBoard and restores pre-lock marks ───
  await evalIn(page, () => __h.open());
  await page.evaluate(() => new Promise(r => setTimeout(r, 300)));
  await evalIn(page, () => __h.clickBtn('btn-scoring-edit'));
  await page.evaluate(() => new Promise(r => setTimeout(r, 100)));
  const stone2 = await evalIn(page, () => __h.findStone(1));
  await clickStone(page, stone2);
  await evalIn(page, () => __h.clickBtn('btn-scoring-lock'));
  await evalIn(page, () => __h.clickBtn('btn-scoring-save'));
  await evalIn(page, () => __h.clickBtn('btn-scoring-edit'));
  const marksBeforeUnlock = await evalIn(page, () => __h.markCount());
  await evalIn(page, () => __h.clickBtn('btn-scoring-lock'));
  await page.evaluate(() => new Promise(r => setTimeout(r, 150)));
  {
    const s = await evalIn(page, () => __h.state());
    const marksAfter = await evalIn(page, () => __h.markCount());
    check('S9 unlock after save clears savedBoard', s.saved === null);
    check('S9 unlock restores unlocked stage', s.locked === false);
    check('S9 unlock retains the pre-lock marks', marksAfter === marksBeforeUnlock);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  console.log('\n======================================');
  console.log(`v0.1.061 harness: ${passed} passed, ${failed} failed (${results.length} checks)`);
  if (consoleErrors.length) {
    console.log('\nPage errors captured:');
    consoleErrors.slice(0, 10).forEach(e => console.log('  ', String(e).slice(0, 300)));
  }
  await close();
  server.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('HARNESS CRASHED:', e);
  process.exit(2);
});
