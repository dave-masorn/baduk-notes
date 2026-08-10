// Verify: the thin dark/grey ring around white Go stones is removed.
//
//   ROOT CAUSE — the ring is the white stone's BR border layer (br '#111827',
//   brSize 1 in every default style). drawCellContent() scales brSize by
//   (brSize/10) * currentStoneRadius * 0.3 and strokes an arc at
//   currentStoneRadius + currentStoneBrRadius + currentStoneBrSize/2 with
//   strokeStyle '#111827'. With the default fixed to brSize:0 the BR block
//   (`if (currentStoneBrSize > 0)`) is skipped entirely, so no rim is drawn and
//   the stone edge blends cleanly into the board.
//
//   The harness drives the real drawCellContent() with a recording mock 2D
//   context on lightpanda (stub canvas — no real pixels, exactly like
//   verify_bm_edge_mask.js) and asserts:
//     1. default white stone draws NO BR stroke (#111827 never set as stroke),
//     2. an explicitly larger brSize still draws the BR ring (mechanism intact,
//        and proves the harness can detect the artifact),
//     3. black stone is unaffected (no BR stroke),
//     4. migrateLegacyWhiteRim() downgrades a saved brSize:1 legacy style.
const path = require('path');
const http = require('http');
const fs = require('fs');
const { launchLightpanda } = require('./lightpanda-launcher.js');

const REPO = '/Users/davemasorn/AntiGravity/baduk-notes';
const PORT = 3957;

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

async function main() {
  await new Promise((r) => server.listen(PORT, r));
  const { page, close } = await launchLightpanda();
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => window.state && typeof window.drawCellContent === 'function' && typeof window.migrateLegacyWhiteRim === 'function',
    { timeout: 20000 }
  );
  await page.evaluate(() => new Promise((r) => setTimeout(r, 400)));

  const out = await page.evaluate(() => {
    const o = { checks: [], detail: [] };
    const record = [];
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
        rect() { record.push(['rect']); },
        arc(x, y, r) { record.push(['arc', x, y, r]); },
        clip() { record.push(['clip']); },
        fill() { record.push(['fill']); },
        fillRect() { record.push(['fillRect']); },
        stroke() { record.push(['stroke']); },
        moveTo() { record.push(['moveTo']); },
        lineTo() { record.push(['lineTo']); },
        closePath() { record.push(['closePath']); },
        translate() { record.push(['translate']); },
        drawImage() { record.push(['drawImage']); },
        createPattern() { return pattern; },
        createRadialGradient() { return grad; },
        createLinearGradient() { return grad; },
        setLineDash() {},
      };
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

    const cellSize = (600 - 2 * 36) / 18;
    const cx = 36 + 9 * cellSize, cy = 36 + 9 * cellSize;
    const stoneRadius = 0.45 * cellSize;
    const rel = (x) => Math.round(x * 1000) / 1000;
    const hasBrStroke = () => strokeStyleLog.some((v) => String(v).toLowerCase() === '#111827');

    function runWhite(brSize) {
      record.length = 0;
      strokeStyleLog.length = 0;
      const mock = makeMock('go-board-canvas-initial');
      const saved = state.initialBoardStyle.whiteStone.brSize;
      state.initialBoardStyle.whiteStone.brSize = brSize;
      window.drawCellContent(
        mock,
        { player: 'W', annotation: null, label: null },
        cx, cy, cellSize, false, null, '#dcb35c', null, 9, 9
      );
      state.initialBoardStyle.whiteStone.brSize = saved;
      return { mock, brStroke: hasBrStroke() };
    }

    function runBlack() {
      record.length = 0;
      strokeStyleLog.length = 0;
      const mock = makeMock('go-board-canvas-initial');
      window.drawCellContent(
        mock,
        { player: 'B', annotation: null, label: null },
        cx, cy, cellSize, false, null, '#dcb35c', null, 9, 9
      );
      return { brStroke: hasBrStroke() };
    }

    // --- 1. Default white stone: BR ring must be gone (brSize now defaults to 0) ---
    {
      const { brStroke } = runWhite(state.initialBoardStyle.whiteStone.brSize);
      o.checks.push(['default white stone draws no BR stroke (#111827)', brStroke === false]);
    }

    // --- 2. Explicit brSize=1 (old default): BR ring must still render ---
    {
      const { brStroke } = runWhite(1);
      o.checks.push(['explicit brSize=1 draws the BR ring (#111827 stroke)', brStroke === true]);
    }

    // --- 3. Black stone: unaffected, no BR stroke ---
    {
      const { brStroke } = runBlack();
      o.checks.push(['black stone draws no BR stroke (#111827)', brStroke === false]);
    }

    // --- 4. Migration: legacy saved style (brSize:1 + br #111827) is downgraded ---
    {
      const legacy = {
        whiteStone: { useColor: true, bg: '#f3f4f6', bgSize: 0.45, br: '#111827', brSize: 1, brRadius: 0, brBlur: 0, bmSize: 15 },
        blackStone: { useColor: true, bg: '#111827', bgSize: 0.45, br: '#111827', brSize: 0, brRadius: 0, brBlur: 0, bmSize: 15 },
      };
      const custom = { whiteStone: { br: '#d1d5db', brSize: 1 } }; // user's own rim colour — must be preserved
      const migrated = window.migrateLegacyWhiteRim(JSON.parse(JSON.stringify(legacy)));
      const customKept = window.migrateLegacyWhiteRim(JSON.parse(JSON.stringify(custom)));
      o.checks.push(['legacy whiteStone.brSize 1 -> 0', migrated.whiteStone.brSize === 0]);
      o.checks.push(['non-default br colour preserved (no forced removal)', customKept.whiteStone.brSize === 1]);
      o.checks.push(['null style safe (no throw)', (() => { try { window.migrateLegacyWhiteRim(null); return true; } catch (e) { return false; } })()]);
    }

    // --- 5. BR geometry sanity: brSize=1 ring hugs the stone edge ---
    {
      const { mock, brStroke } = runWhite(1);
      const arcs = record.filter((e) => e[0] === 'arc').map((e) => e[3]);
      // BR: brSize=1 -> currentStoneBrSize = (1/10)*stoneRadius*0.3; arc at
      // stoneRadius + brRadius(0) + currentStoneBrSize/2. Must sit between the
      // stone surface arc (13.2) and the BM mask arc (bmSize 15).
      const brSize = (1 / 10) * stoneRadius * 0.3;
      const expected = rel(stoneRadius + brSize / 2);
      const ring = arcs.find((r) => rel(r) === expected);
      o.checks.push(['brSize=1 ring hugs the stone edge (arc at stoneRadius + brSize/2)', brStroke && ring !== undefined, 'expected ' + expected + ' got ' + ring]);
      o.detail.push('stoneRadius=' + rel(stoneRadius) + ' brSize=' + rel(brSize) + ' ringArcRadius=' + ring);
    }

    return o;
  });

  let failed = 0;
  for (const [name, ok, extra] of out.checks) {
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${extra !== undefined ? ' — ' + JSON.stringify(extra) : ''}`);
    if (!ok) failed++;
  }
  for (const d of out.detail) console.log('  detail: ' + d);

  if (consoleErrors.length) {
    console.log('[FAIL] page errors: ' + JSON.stringify(consoleErrors));
    failed += consoleErrors.length;
  } else {
    console.log('[PASS] no console/page errors — clean');
  }

  console.log(`${out.checks.length} checks, ${failed} failed.`);
  await close();
  server.close();
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
