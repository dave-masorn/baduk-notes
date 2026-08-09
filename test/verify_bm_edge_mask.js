// Verify: edge-stone Board Mask (BM) reflects the actual visual beneath it.
//
//   COMPOSITE  — on every canvas EXCEPT the MSM scoring board, an edge stone (A/T/1/19
//             lines) draws a multi-value board mask: the border-margin colour over the
//             part of the mask that overhangs the board frame, then the board surface
//             (wood texture / solid colour) clipped to the 19x19 playing area, then the
//             boundary line (BDL — grid.boundaryColor/boundarySize) re-stroked where the
//             mask crosses the grid edge. A stone on the outer grid line therefore shows
//             the frame colour where its mask sticks out instead of a blob of board
//             texture over the border, and keeps the board's BDL instead of erasing it.
//   GEOMETRY  — the board-surface clip is the 19x19 grid when border Override is ON
//             (image never spills onto the margin), and the full wood rect when OFF.
//             The BDL stroke mirrors the real renderers: raw boundarySize px on
//             initial/study, baseLine×boundarySize (baseLine = max(1.2, S*0.035)) on export.
//   EXPORT    — the board-area clip is the full wood rect inset by the margin size.
//   MSM       — the scoring board keeps the legacy single-fill mask (no composite, no BDL).
//
// The harness drives the real `drawCellContent()` with a recording mock 2D context, so
// it runs on lightpanda's stub canvas (no real pixels needed).
const path = require('path');
const http = require('http');
const fs = require('fs');
const { launchLightpanda } = require('./lightpanda-launcher.js');

const REPO = '/Users/davemasorn/AntiGravity/baduk-notes';
const PORT = 3956;

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
  await page.waitForFunction(
    () => window.state && window.state.board && typeof window.drawBoard === 'function' && typeof window.drawCellContent === 'function' && typeof window.getEffectiveInitialStyle === 'function',
    { timeout: 20000 }
  );
  await page.evaluate(() => new Promise((r) => setTimeout(r, 500)));

  const out = await page.evaluate(() => {
    const o = { checks: [], detail: [] };
    const record = [];
    const fillStyleLog = [];
    const strokeStyleLog = [];
    const grad = { addColorStop() {} };
    const pattern = { setTransform() {} };

    function makeMock(id) {
      const mock = {
        canvas: { id },
        shadowColor: '', shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0,
        save() { record.push(['save']); },
        restore() { record.push(['restore']); },
        beginPath() { record.push(['beginPath']); },
        rect(x, y, w, h) { record.push(['rect', x, y, w, h]); },
        arc(x, y, r) { record.push(['arc', x, y, r]); },
        clip() { record.push(['clip']); },
        fill() { record.push(['fill']); },
        fillRect(x, y, w, h) { record.push(['fillRect', x, y, w, h]); },
        stroke() { record.push(['stroke']); },
        strokeRect(x, y, w, h) { record.push(['strokeRect', x, y, w, h]); },
        moveTo() { record.push(['moveTo']); },
        lineTo() { record.push(['lineTo']); },
        closePath() { record.push(['closePath']); },
        translate(x, y) { record.push(['translate', x, y]); },
        rotate() { record.push(['rotate']); },
        drawImage() { record.push(['drawImage']); },
        createPattern() { return pattern; },
        createRadialGradient() { return grad; },
        createLinearGradient() { return grad; },
        setLineDash() {},
      };
      Object.defineProperty(mock, 'fillStyle', {
        get() { return mock._fs; },
        set(v) { mock._fs = v; fillStyleLog.push(v); }
      });
      Object.defineProperty(mock, 'strokeStyle', {
        get() { return mock._ss; },
        set(v) { mock._ss = v; strokeStyleLog.push(v); }
      });
      Object.defineProperty(mock, 'lineWidth', {
        get() { return mock._lw; },
        set(v) { mock._lw = v; record.push(['lineWidth', v]); }
      });
      return mock;
    }

    const eff = window.getEffectiveInitialStyle();
    const boardColor = (eff.board && eff.board.useColor) ? eff.board.color : '#dcb35c';
    const borderColor = (eff.border && eff.border.color) ? eff.border.color : '#dcb35c';
    const overrideOn = !eff.border || eff.border.override !== false;
    const boundaryColor = (eff.grid && eff.grid.boundaryColor) ? eff.grid.boundaryColor : '#1c1917';
    const boundarySize = (eff.grid && eff.grid.boundarySize !== undefined) ? parseFloat(eff.grid.boundarySize) : 1.5;
    const cellSize = (typeof CELL_SIZE !== 'undefined') ? CELL_SIZE : ((600 - 2 * PADDING) / 18);
    const borderScale = (eff.border && eff.border.size !== undefined) ? Math.min(1, parseFloat(eff.border.size) / 100) : 1;
    const marginSize = (cellSize / 2) * borderScale;
    const woodX = PADDING - marginSize;
    const woodW = 18 * cellSize + 2 * marginSize;
    const grid = { x: PADDING, y: PADDING, w: 18 * cellSize, h: 18 * cellSize };
    const rel = (x) => Math.round(x * 1000) / 1000;
    const isRect = (e, x, y, w, h) => e && e[0] === 'rect' && rel(e[1]) === rel(x) && rel(e[2]) === rel(y) && rel(e[3]) === rel(w) && rel(e[4]) === rel(h);

    function run(id, opts) {
      record.length = 0;
      fillStyleLog.length = 0;
      const mock = makeMock(id);
      window.drawCellContent(
        mock,
        { player: 'B', annotation: null, label: null },
        opts.cx, opts.cy,
        opts.cellSize || cellSize,
        !!opts.isExport,
        opts.clipRect || null,
        boardColor,
        opts.fullBoardRect || null,
        opts.r !== undefined ? opts.r : null,
        opts.c !== undefined ? opts.c : null
      );
      // Events after the mask circle's arc: everything the Board-Mask layer does.
      const maskArcIdx = record.findIndex((e) => e[0] === 'arc');
      return {
        afterMask: record.slice(maskArcIdx + 1),
        fills: fillStyleLog.slice()
      };
    }

    function firstClip(a) { return a.findIndex((e) => e[0] === 'clip'); }
    function firstWoodFill(a) { return a.findIndex((e) => e[0] === 'fillRect' && rel(e[1]) === rel(woodX) && rel(e[3]) === rel(woodW)); }
    // The composite's board-layer save is the save immediately followed by beginPath + rect.
    function boardLayerSave(a) {
      for (let i = 0; i < a.length - 2; i++) {
        if (a[i][0] === 'save' && a[i + 1][0] === 'beginPath' && a[i + 2][0] === 'rect') return i;
      }
      return -1;
    }

    // --- 1. Initial canvas, edge stone (0,0): composite mask ---
    {
      const { afterMask, fills } = run('go-board-canvas-initial', { cx: PADDING, cy: PADDING, r: 0, c: 0 });
      const cIdx = firstClip(afterMask);
      const mIdx = firstWoodFill(afterMask);
      const bIdx = boardLayerSave(afterMask);
      const brRect = bIdx !== -1 ? afterMask[bIdx + 2] : null;
      o.checks.push(['initial edge: mask clipped, then margin-filled', cIdx !== -1 && mIdx !== -1 && mIdx > cIdx]);
      o.checks.push(['initial edge: margin fill precedes the board-area clip', mIdx !== -1 && bIdx !== -1 && mIdx < bIdx]);
      o.checks.push(['initial edge: board surface clipped to the 19x19 grid', isRect(brRect, grid.x, grid.y, grid.w, grid.h), JSON.stringify(brRect)]);
      o.checks.push(['initial edge: margin colour = border colour', fills.some((v) => String(v).toLowerCase() === String(overrideOn ? borderColor : boardColor).toLowerCase())]);
      o.checks.push(['initial edge: BDL boundary line stroked at boundarySize', afterMask.some((e) => e[0] === 'lineWidth' && rel(e[1]) === rel(boundarySize)) && strokeStyleLog.some((v) => String(v).toLowerCase() === String(boundaryColor).toLowerCase())]);
    }

    // --- 1b. Initial canvas, edge stone (0,0): BDL layer lives between the board layer and LAYER 2 ---
    {
      const { afterMask } = run('go-board-canvas-initial', { cx: PADDING, cy: PADDING, r: 0, c: 0 });
      const bIdx = boardLayerSave(afterMask);
      const bdlStroke = afterMask.findIndex((e) => e[0] === 'stroke');
      o.checks.push(['initial edge: BDL stroke after the board-surface layer', bIdx !== -1 && bdlStroke !== -1 && bdlStroke > bIdx]);
    }

    // --- 2. Center stone (9,9): same composite, board clip is still the grid ---
    {
      const { afterMask } = run('go-board-canvas-initial', { cx: PADDING + 9 * cellSize, cy: PADDING + 9 * cellSize, r: 9, c: 9 });
      const bIdx = boardLayerSave(afterMask);
      const brRect = bIdx !== -1 ? afterMask[bIdx + 2] : null;
      o.checks.push(['center stone: board surface clipped to the 19x19 grid', isRect(brRect, grid.x, grid.y, grid.w, grid.h), JSON.stringify(brRect)]);
      o.checks.push(['center stone: BDL stroked too (mask clip keeps it invisible)', afterMask.some((e) => e[0] === 'stroke')]);
    }

    // --- 3. Study canvas edge stone: composite too ---
    {
      const { afterMask } = run('go-board-canvas-study', { cx: PADDING, cy: PADDING, r: 0, c: 0 });
      const cIdx = firstClip(afterMask);
      const mIdx = firstWoodFill(afterMask);
      const bIdx = boardLayerSave(afterMask);
      o.checks.push(['study edge: composite board mask present', cIdx !== -1 && mIdx !== -1 && mIdx > cIdx && bIdx !== -1 && mIdx < bIdx]);
    }

    // --- 4. Export renderer: board area = full wood rect inset by the margin size ---
    {
      const fbr = { x: 50, y: 50, w: 600, h: 600 };
      const cs = 40;
      const ms = (cs / 2) * borderScale;
      const clip = { x: 50, y: 50, w: 600, h: 600 };
      const { afterMask } = run('export', { cx: 50 + ms, cy: 50 + ms, cellSize: cs, isExport: true, clipRect: clip, fullBoardRect: fbr, r: 0, c: 0 });
      const mIdx = afterMask.findIndex((e) => e[0] === 'fillRect' && rel(e[1]) === rel(fbr.x) && rel(e[3]) === rel(fbr.w));
      const bIdx = boardLayerSave(afterMask);
      const brRect = bIdx !== -1 ? afterMask[bIdx + 2] : null;
      o.checks.push(['export edge: margin fill over the full wood rect', mIdx !== -1 && bIdx !== -1 && mIdx < bIdx]);
      o.checks.push(['export edge: board surface clipped to wood rect inset by margin', isRect(brRect, 50 + ms, 50 + ms, 600 - 2 * ms, 600 - 2 * ms), JSON.stringify(brRect)]);
      o.checks.push(['export edge: BDL lineWidth scaled by export baseLine', afterMask.some((e) => e[0] === 'lineWidth' && rel(e[1]) === rel(Math.max(1.2, cs * 0.035) * boundarySize)) && strokeStyleLog.some((v) => String(v).toLowerCase() === String(boundaryColor).toLowerCase())]);
    }

    // --- 5. Border Override OFF: margin = board colour, board area = whole wood rect ---
    {
      const savedOverride = eff.border ? eff.border.override : undefined;
      try {
        eff.border.override = false;
        const { afterMask, fills } = run('go-board-canvas-initial', { cx: PADDING, cy: PADDING, r: 0, c: 0 });
        const bIdx = boardLayerSave(afterMask);
        const brRect = bIdx !== -1 ? afterMask[bIdx + 2] : null;
        o.checks.push(['override OFF: margin colour = board colour', fills.some((v) => String(v).toLowerCase() === String(boardColor).toLowerCase())]);
        o.checks.push(['override OFF: board surface clipped to the whole wood rect', isRect(brRect, woodX, woodX, woodW, woodW), JSON.stringify(brRect)]);
      } finally {
        eff.border.override = savedOverride;
      }
    }

    // --- 6. MSM scoring board: legacy single-fill mask, no composite ---
    {
      const { afterMask, fills } = run('go-board-canvas-scoring', { cx: PADDING, cy: PADDING, r: 0, c: 0 });
      const cIdx = firstClip(afterMask);
      const mIdx = firstWoodFill(afterMask);
      const bIdx = boardLayerSave(afterMask);
      const legacyFillIdx = afterMask.findIndex((e) => e[0] === 'fill');
      o.checks.push(['MSM: no composite clip/fill layers', cIdx === -1 && mIdx === -1 && bIdx === -1]);
      o.checks.push(['MSM: legacy single fill after the mask arc', legacyFillIdx !== -1 && fills.length > 0]);
      o.checks.push(['MSM: no BDL stroke (legacy single-fill mask)', !afterMask.some((e) => e[0] === 'stroke')]);
    }

    return o;
  });

  for (const c of out.checks) check(c[0], c[1], c[2]);
  for (const err of consoleErrors) console.log(`[PAGEERROR] ${err}`);

  if (consoleErrors.length) {
    console.log(`\n${consoleErrors.length} page error(s) surfaced.`);
  }

  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length} checks, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}.`);
  await close();
  server.close();
  process.exit(failed || consoleErrors.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
