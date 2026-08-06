// Verify: Stone Set C renders without errors, is deterministic per POSITION,
// and Set A / Set B paths are untouched (no regressions).
const path = require('path');
const http = require('http');
const fs = require('fs');
const puppeteer = require('puppeteer-core');

const REPO = '/Users/davemasorn/AntiGravity/baduk-notes';
const PORT = 3947;
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

async function main() {
  await new Promise((r) => server.listen(PORT, r));
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage();
  page.setDefaultTimeout(20000);
  await page.setViewport({ width: 1600, height: 1200 });
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.state && window.state.board && typeof window.drawBoard === 'function', { timeout: 20000 });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 600)));

  // Put stones on the board across several positions, both colors.
  await page.evaluate(() => {
    const empty = () => Array.from({ length: 19 }, () => Array.from({ length: 19 }, () => ({ player: null, annotation: null, label: null })));
    const cells = empty();
    const place = (r, c, p) => { cells[r][c] = { player: p, annotation: null, label: null }; };
    place(3, 3, 'B'); place(3, 15, 'W'); place(9, 9, 'B'); place(15, 3, 'W'); place(15, 15, 'B');
    window.state.board = cells;
    window.state.baselineBoard = empty();
    window.drawBoard();
  });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 300)));

  // 1. getStoneVariant is a pure function of (row, col, player) — per-position seeding.
  const variantCheck = await page.evaluate(() => {
    const a1 = window.getStoneVariant(3, 3, 'B');
    const a2 = window.getStoneVariant(3, 3, 'B');
    const b = window.getStoneVariant(9, 9, 'B');
    const w = window.getStoneVariant(3, 3, 'W');
    return {
      samePosSame: JSON.stringify(a1) === JSON.stringify(a2),
      diffPosDiffers: JSON.stringify(a1) !== JSON.stringify(b),
      diffPlayerDiffers: JSON.stringify(a1) !== JSON.stringify(w),
      caps: a1.specularStrength >= 0 && a1.specularStrength <= 0.5,
      angleInRange: a1.originAngle >= 0 && a1.originAngle < Math.PI * 2,
      angleDeterministic: a1.originAngle === a2.originAngle,
      angleDiffersByPos: a1.originAngle !== b.originAngle,
      tintInRange: a1.tintAmount >= 0 && a1.tintAmount <= 1 && a1.tintAmount === a2.tintAmount,
      whiteInRange: a1.whiteness > 0 && a1.whiteness <= 1 && a1.whiteness === a2.whiteness,
      gradeDrivesDensity: a1.ringCount === 10 + Math.floor(a1.whiteness * 28)
    };
  });
  check('variant deterministic per position', variantCheck.samePosSame);
  check('variant differs across positions', variantCheck.diffPosDiffers);
  check('variant differs across players', variantCheck.diffPlayerDiffers);
  check('specular capped at 0–0.5', variantCheck.caps);
  check('originAngle in full-circle range 0–2π', variantCheck.angleInRange);
  check('originAngle deterministic per position', variantCheck.angleDeterministic);
  check('originAngle differs across positions (grain direction variety)', variantCheck.angleDiffersByPos);
  check('tintAmount (slate kuro↔ao) in 0–1 + deterministic', variantCheck.tintInRange);
  check('whiteness (hamaguri Snow↔Blossom) in 0–1 + deterministic', variantCheck.whiteInRange);
  check('hamaguri grade drives ring density (Snow dense, Blossom sparse)', variantCheck.gradeDrivesDensity);

  const sampleStones = (page) => page.evaluate(() => {
    const canvas = document.getElementById('go-board-canvas-initial');
    const ctx = canvas.getContext('2d');
    const PADDING = 36, CELL = window.CELL_SIZE || (canvas.width - 72) / 18;
    const px = (r, c) => {
      const d = ctx.getImageData(PADDING + c * CELL, PADDING + r * CELL, 1, 1).data;
      return [d[0], d[1], d[2]];
    };
    return { black: px(3, 3), white: px(3, 15) };
  });
  const stoneToRGB = (p) => `rgb(${p[0]},${p[1]},${p[2]})`;

  // 2. Render with each stone set; capture center pixels; confirm no errors.
  const renders = {};
  for (const set of ['A', 'B', 'C']) {
    consoleErrors.length = 0;
    await page.evaluate((s) => {
      const style = window.getActiveStyleObject();
      if (!style) return;
      style.stoneSet = s;
      window.drawBoard();
    }, set);
    await page.evaluate(() => new Promise((r) => setTimeout(r, 300)));
    renders[set] = await sampleStones(page);
    const errs = consoleErrors.filter((e) => !/favicon/i.test(e));
    check(`set ${set} renders without errors`, errs.length === 0, errs.slice(0, 3).join(' | ') || 'clean');
  }

  // Stones actually drew: black stone center is dark, white stone center is light.
  check('set C black stone is dark', renders.C.black[0] < 100 && renders.C.black[1] < 100 && renders.C.black[2] < 100, stoneToRGB(renders.C.black));
  check('set C white stone is light', renders.C.white[0] > 150 && renders.C.white[1] > 150 && renders.C.white[2] > 150, stoneToRGB(renders.C.white));

  // 3. Set C is stable across repeated redraws — identical pixels (per-position seeding, no flicker).
  await page.evaluate(() => { window.drawBoard(); });
  await page.evaluate(() => new Promise((r) => setTimeout(r, 300)));
  const c2 = await sampleStones(page);
  check('set C stable across redraws (black)', stoneToRGB(renders.C.black) === stoneToRGB(c2.black), `${stoneToRGB(renders.C.black)} vs ${stoneToRGB(c2.black)}`);
  check('set C stable across redraws (white)', stoneToRGB(renders.C.white) === stoneToRGB(c2.white), `${stoneToRGB(renders.C.white)} vs ${stoneToRGB(c2.white)}`);

  // 4. A, B, C are visually distinct from each other.
  const setsDistinct = renders.A.black.join(',') !== renders.B.black.join(',') && renders.B.black.join(',') !== renders.C.black.join(',') && renders.A.black.join(',') !== renders.C.black.join(',');
  check('sets A/B/C visually distinct (black)', setsDistinct, `A=${stoneToRGB(renders.A.black)} B=${stoneToRGB(renders.B.black)} C=${stoneToRGB(renders.C.black)}`);

  // 5. Set C honors per-position variety: two different black stones differ from each other.
  //    Grain/ring texture is subtle, so compare an area-average over the stone surface.
  const twoPos = await page.evaluate(() => {
    const canvas = document.getElementById('go-board-canvas-initial');
    const ctx = canvas.getContext('2d');
    const PADDING = 36, CELL = window.CELL_SIZE || (canvas.width - 72) / 18;
    const area = (r, c) => {
      const rad = CELL * 0.35;
      const x0 = PADDING + c * CELL, y0 = PADDING + r * CELL;
      let rs = 0, gs = 0, bs = 0, n = 0;
      for (let dy = -Math.floor(rad); dy <= Math.floor(rad); dy += 2) {
        for (let dx = -Math.floor(rad); dx <= Math.floor(rad); dx += 2) {
          if (dx * dx + dy * dy > rad * rad) continue;
          const d = ctx.getImageData(x0 + dx, y0 + dy, 1, 1).data;
          rs += d[0]; gs += d[1]; bs += d[2]; n++;
        }
      }
      return { r: rs / n, g: gs / n, b: bs / n };
    };
    return { s1: area(3, 3), s2: area(9, 9) };
  });
  const avgDiff = Math.abs(twoPos.s1.r - twoPos.s2.r) + Math.abs(twoPos.s1.g - twoPos.s2.g) + Math.abs(twoPos.s1.b - twoPos.s2.b);
  check('set C per-position variety (two blacks differ)', avgDiff > 0.05,
    `avgDiff=${avgDiff.toFixed(3)} s1=${twoPos.s1.r.toFixed(1)},${twoPos.s1.g.toFixed(1)},${twoPos.s1.b.toFixed(1)} s2=${twoPos.s2.r.toFixed(1)},${twoPos.s2.g.toFixed(1)},${twoPos.s2.b.toFixed(1)}`);

  // 6. Texture cache (lexical const — read by identifier): hamaguri + slate keys present, stable across redraws.
  const cache1 = await page.evaluate(() => {
    if (typeof _stoneTextureCache === 'undefined') return { size: -1, ham: -1, slt: -1 };
    const keys = Array.from(_stoneTextureCache.keys());
    return { size: _stoneTextureCache.size, ham: keys.filter((k) => k.startsWith('hamaguri_')).length, slt: keys.filter((k) => k.startsWith('slate_')).length };
  });
  check('Set C produced hamaguri textures', cache1.ham > 0, `${cache1.ham} keys`);
  check('Set C produced slate textures', cache1.slt > 0, `${cache1.slt} keys`);
  await page.evaluate(() => { window.drawBoard(); });
  const cache2 = await page.evaluate(() => (typeof _stoneTextureCache === 'undefined') ? -1 : _stoneTextureCache.size);
  check('Set C texture cache stable across redraws', cache2 === cache1.size, `${cache1.size} -> ${cache2}`);

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\nstone-set-c verify: ${passed} passed, ${failed} failed`);
  await browser.close();
  server.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error('CRASHED:', e); process.exit(2); });
