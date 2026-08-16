// Verify: the Stones (Black & White) X-Offset / Y-Offset is a single shared setting applied
// to BOTH Black and White stones, and it applies to LAYER 1 ONLY (the Stone Surface:
// gradient / custom image / solid colour) while LAYER 3 (Board Mask), LAYER 2 (Border Ring),
// labels, annotations / highlights stay centered on the intersection.
//
//   SHARED   — one `stoneOffset: { x, y }` on the style object drives both colours: a black
//              and a white stone with the same style shift identically.
//   RENDER   — drawCellContent() applies the offset via a context save/translate/restore
//              wrapper around the LAYER 1 surface block only; at the default offset 0 no
//              translate calls happen at all.
//   LAYER-1-ONLY — the Board Mask composite arc (LAYER 3) and Border Ring arc (LAYER 2)
//              are NOT translated, and neither are the CIRCLE_F selection highlight,
//              quarter/hoshi/cell overlays or group halos — they all stay on the
//              intersection while the visible stone surface underneath shifts.
//   LABELS   — the label fillText is emitted outside the translated block, so it stays at
//              the intersection even while the stone surface shifts.
//   UI       — the palette exposes ib-stone-offset-x / ib-stone-offset-y (±10 px, step 0.01),
//              populateStyleInputs() fills them, and DEFAULT_INITIAL_BOARD_STYLE carries the
//              section for the reset button.
//
// The harness drives the real drawCellContent() with a recording mock 2D context that applies
// translate() to the logged coordinates (like a real transform), so it runs on lightpanda's
// stub canvas.
const path = require('path');
const http = require('http');
const fs = require('fs');
const { launchLightpanda } = require('./lightpanda-launcher.js');

const REPO = '/Users/davemasorn/AntiGravity/baduk-notes';
const PORT = 3958;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(REPO, urlPath);
  if (!file.startsWith(REPO)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (e, d) => {
    if (e) { res.writeHead(404); res.end(); }
    else { res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' }); res.end(d); }
  });
});

let results = [];
function check(name, cond, detail) {
  results.push({ pass: !!cond, name });
  console.log(`[${cond ? 'PASS' : 'FAIL'}] ${name}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`);
}

async function main() {
  await new Promise((r) => server.listen(PORT, r));
  const { page, close } = await launchLightpanda();
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => window.state && typeof window.drawCellContent === 'function' && typeof window.populateStyleInputs === 'function',
    { timeout: 20000 }
  );
  await page.evaluate(() => new Promise((r) => setTimeout(r, 400)));

    const out = await page.evaluate(() => {
    const o = { checks: [], detail: [] };
    const grad = { addColorStop() {} };
    const pattern = { setTransform() {} };

    function makeMock(id) {
      const stack = [];
      const state = { tx: 0, ty: 0 };
      const rec = { arcs: [], translate: [], fillText: [], surfaceArcs: [] };
      const mock = {
        canvas: { id },
        shadowColor: '', shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0, filter: '',
        font: '', textAlign: '', textBaseline: '', lineCap: '', lineJoin: '', miterLimit: 1,
        save() { stack.push([state.tx, state.ty]); },
        restore() { const s = stack.pop(); if (s) { state.tx = s[0]; state.ty = s[1]; } },
        beginPath() {},
        rect() {},
        arc(x, y, r) {
          rec.arcs.push([x + state.tx, y + state.ty, r]);
        },
        clip() {},
        fill() {},
        fillRect() {},
        stroke() {},
        moveTo() {},
        lineTo() {},
        closePath() {},
        translate(x, y) {
          state.tx += x;
          state.ty += y;
          rec.translate.push([x, y]);
        },
        rotate() {},
        drawImage() {},
        createPattern() { return pattern; },
        createRadialGradient() { return grad; },
        createLinearGradient() { return grad; },
        measureText() { return { width: 10 }; },
        fillText(t, x, y) { rec.fillText.push([t, x + state.tx, y + state.ty]); },
        strokeText() {},
        setLineDash() {},
      };
      Object.defineProperty(mock, 'fillStyle', { get() { return mock._fs; }, set(v) { mock._fs = v; } });
      Object.defineProperty(mock, 'strokeStyle', { get() { return mock._ss; }, set(v) { mock._ss = v; } });
      Object.defineProperty(mock, 'lineWidth', { get() { return mock._lw; }, set(v) { mock._lw = v; } });
      return { mock, rec };
    }

    const cellSize = (600 - 2 * 36) / 18;
    const cx = 36 + 9 * cellSize, cy = 36 + 9 * cellSize;
    const stoneRadius = 0.45 * cellSize;
    const rel = (v) => Math.round(v * 1000) / 1000;
    const saved = JSON.parse(JSON.stringify(state.initialBoardStyle.stoneOffset));

    // Surface arc = the arc whose radius is the stone surface radius (solid-color circle).
    const surfaceArc = (arcs) => arcs.find((a) => rel(a[2]) === rel(stoneRadius));

    function runStone(player, offsetX, offsetY) {
      state.initialBoardStyle.stoneOffset = { x: offsetX, y: offsetY };
      const { mock, rec } = makeMock('go-board-canvas-initial');
      window.drawCellContent(
        mock,
        { player, annotation: null, label: player === 'B' ? 'A' : 'B' },
        cx, cy, cellSize, false, null, '#dcb35c', null, 9, 9
      );
      return rec;
    }

    // --- 1. Default offset 0: no translate calls, stone stays centered ---
    {
      const recB = runStone('B', 0, 0);
      const recW = runStone('W', 0, 0);
      o.checks.push(['default: no translate calls at offset 0', recB.translate.length === 0 && recW.translate.length === 0]);
      o.checks.push(['default: black surface arc at intersection', (() => { const a = surfaceArc(recB.arcs); return a && rel(a[0]) === rel(cx) && rel(a[1]) === rel(cy); })()]);
      o.checks.push(['default: white surface arc at intersection', (() => { const a = surfaceArc(recW.arcs); return a && rel(a[0]) === rel(cx) && rel(a[1]) === rel(cy); })()]);
    }

    // --- 2. Shared offset (3, -2): both colours shift together ---
    {
      const recB = runStone('B', 3, -2);
      const recW = runStone('W', 3, -2);
      const bSurface = surfaceArc(recB.arcs);
      const wSurface = surfaceArc(recW.arcs);
      const bMask = recB.arcs.find((a) => rel(a[2]) === rel(15 * (cellSize / 29.3333))); // BM mask radius
      o.checks.push(['offset: black surface arc shifts by (+3, -2)', bSurface && rel(bSurface[0]) === rel(cx + 3) && rel(bSurface[1]) === rel(cy - 2), bSurface]);
      o.checks.push(['offset: white surface arc shifts by (+3, -2)', wSurface && rel(wSurface[0]) === rel(cx + 3) && rel(wSurface[1]) === rel(cy - 2), wSurface]);
      o.checks.push(['stone-only: BM mask arc stays on the intersection (board untouched)', bMask && rel(bMask[0]) === rel(cx) && rel(bMask[1]) === rel(cy), bMask]);
    }

    // --- 3. Labels stay centered while the stone shifts ---
    {
      const recB = runStone('B', 3, -2);
      o.checks.push(['offset: stone label stays on the intersection', recB.fillText.length > 0 && rel(recB.fillText[0][1]) === rel(cx) && rel(recB.fillText[0][2]) === rel(cy), recB.fillText]);
    }

    // --- 4. Stone-layer ONLY: BR ring stays on intersection, surface shifts, highlights stay ---
    {
      const baseStoneR = cellSize * 0.47;
      const circleF = baseStoneR * 1.20;
      window._highlightedCells = [[9, 9]];
      // Enable BR ring so the BR arc is drawn
      state.initialBoardStyle.blackStone.brSize = 10;
      state.initialBoardStyle.blackStone.br = '#ff0000';
      const recB = runStone('B', 3, -2);
      // BR arc radius: currentStoneRadius + currentStoneBrRadius + currentStoneBrSize / 2
      const brScaled = (10 / 10) * stoneRadius * 0.3; // currentStoneBrSize
      const brArcRadius = stoneRadius + 0 + brScaled / 2;
      // The BR ring arc radius is brArcRadius; find the largest-radius arc (BR) vs stoneRadius (surface)
      const brArc = recB.arcs.find((a) => rel(a[2]) === rel(brArcRadius));
      const surface = surfaceArc(recB.arcs);
      const circleFArc = recB.arcs.find((a) => rel(a[2]) === rel(circleF));
      o.checks.push(['layer1-only: BR ring stays on the intersection', brArc && rel(brArc[0]) === rel(cx) && rel(brArc[1]) === rel(cy), brArc]);
      o.checks.push(['layer1-only: surface shifts', surface && rel(surface[0]) === rel(cx + 3) && rel(surface[1]) === rel(cy - 2), surface]);
      o.checks.push(['layer1-only: CIRCLE_F highlight stays', circleFArc && rel(circleFArc[0]) === rel(cx) && rel(circleFArc[1]) === rel(cy), circleFArc]);
      o.checks.push(['layer1-only: exactly 1 translate call (surface block only)', recB.translate.filter(([x, y]) => x === 3 && y === -2).length === 1, recB.translate]);
      // Restore BR defaults so other checks are unaffected
      state.initialBoardStyle.blackStone.brSize = window.DEFAULT_INITIAL_BOARD_STYLE.blackStone.brSize;
      state.initialBoardStyle.blackStone.br = window.DEFAULT_INITIAL_BOARD_STYLE.blackStone.br;
      delete window._highlightedCells;
    }

    // --- 5. UI wiring + defaults ---
    {
      state.initialBoardStyle.stoneOffset = { x: 2.5, y: -1 };
      window.populateStyleInputs();
      const ix = document.getElementById('ib-stone-offset-x');
      const iy = document.getElementById('ib-stone-offset-y');
      const sxp = document.getElementById('ib-stone-offset-x-slider');
      const syp = document.getElementById('ib-stone-offset-y-slider');
      o.checks.push(['populate: inputs filled from style.stoneOffset', ix && iy && Number(ix.value) === 2.5 && Number(iy.value) === -1, ix && iy ? [ix.value, iy.value] : null]);
      o.checks.push(['populate: sliders mirror the inputs', sxp && syp && Number(sxp.value) === 2.5 && Number(syp.value) === -1]);
      o.checks.push(['defaults: DEFAULT_INITIAL_BOARD_STYLE carries stoneOffset', (() => { const d = window.DEFAULT_INITIAL_BOARD_STYLE; const so = d && d.stoneOffset; const ok = !!so && so.x === 0 && so.y === 0; if (!ok) o.detail.push('d=' + JSON.stringify(d ? { keys: Object.keys(d), stoneOffset: d.stoneOffset } : null)); return ok; })()]);
      o.checks.push(['html: offset inputs exist with ±10 px range', ix && iy && Number(ix.min) === -10 && Number(ix.max) === 10 && Number(ix.step) === 0.01]);
    }

    // --- 6. Reset Stones resets BOTH Black & White (single shared button) ---
    {
      const style = state.initialBoardStyle;
      const defB = window.DEFAULT_INITIAL_BOARD_STYLE.blackStone;
      const defW = window.DEFAULT_INITIAL_BOARD_STYLE.whiteStone;
      style.blackStone = JSON.parse(JSON.stringify(defB));
      style.whiteStone = JSON.parse(JSON.stringify(defW));
      style.blackStone.bg = '#123456';
      style.whiteStone.bg = '#abcdef';
      style.stoneOffset = { x: 5, y: -5 };
      const btn = document.querySelector('button[data-section="stones"]');
      btn.click();
      const bReset = style.blackStone.bg === defB.bg;
      const wReset = style.whiteStone.bg === defW.bg;
      const offsetKept = style.stoneOffset.x === 5 && style.stoneOffset.y === -5;
      o.checks.push(['reset stones: resets black stone', bReset, style.blackStone.bg]);
      o.checks.push(['reset stones: resets white stone too', wReset, style.whiteStone.bg]);
      o.checks.push(['reset stones: stoneOffset untouched (own button)', offsetKept, style.stoneOffset]);
    }

    // Restore the original offset so the page state is untouched for other suites.
    state.initialBoardStyle.stoneOffset = saved;

    return o;
  });

  for (const c of out.checks) check(c[0], c[1], c[2]);
  for (const d of (out.detail || [])) console.log('  detail: ' + d);
  for (const err of consoleErrors) console.log(`[PAGEERROR] ${err}`);

  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length} checks, ${failed} failed${consoleErrors.length ? ` + ${consoleErrors.length} page errors` : ''}.`);
  await close();
  server.close();
  process.exit(failed || consoleErrors.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
