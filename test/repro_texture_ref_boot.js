// Verify: a style whose board wood uses 'texture-ref:' now paints the texture
// automatically after page load — the flat-colour fallback must NOT persist
// until a control is re-touched. Reproduces the boot race where the first
// drawBoard() runs before the study folder/OPFS store is attached.
const path = require('path');
const http = require('http');
const fs   = require('fs');
const os   = require('os');
const puppeteer = require('puppeteer-core');

const REPO = '/Users/davemasorn/AntiGravity/baduk-notes';
const PORT = 3972;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.json': 'application/json' };
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
  results.push({ pass: !!cond });
  console.log(`[${cond ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  await new Promise(r => server.listen(PORT, r));
  const chromePath = path.join(process.env.HOME,
    'Library/Caches/ms-playwright/chromium-1200/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'baduk-tex-'));

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', `--user-data-dir=${tmpDir}`, '--window-size=900,900'],
  });
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const consoleLog = [];
  page.on('console', msg => consoleLog.push(msg.type() + ': ' + msg.text()));
  page.on('pageerror', err => consoleLog.push('pageerror: ' + String(err)));

  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.toggleCustomPanel && window.StudyDirStore && window.state, { timeout: 20000 });
  await page.evaluate(() => { window._scoringDirty = false; });

  // 1. Seed a green texture into OPFS at imgs/go.png and point the board at it.
  const seeded = await page.evaluate(async () => {
    try {
      const res = await fetch('http://localhost:3972/test/repro-board.png');
      const blob = await res.blob();
      const root = await navigator.storage.getDirectory();
      const sub = await root.getDirectoryHandle('baduk-notes', { create: true });
      const imgs = await sub.getDirectoryHandle('imgs', { create: true });
      const fh = await imgs.getFileHandle('go.png', { create: true });
      const w = await fh.createWritable();
      await w.write(blob);
      await w.close();
      return { ok: true };
    } catch (e) {
      return { ok: false, err: String(e) };
    }
  });
  check('OPFS seed imgs/go.png', seeded.ok === true, JSON.stringify(seeded));

  // 2. Set the board wood to use the texture-ref.
  await page.evaluate(() => {
    const style = getActiveStyleObject();
    style.board.useColor = false;
    style.board.imgSrc = window.TEXTURE_REF_PREFIX + 'imgs/go.png';
    saveStyleAndRedraw();
  });
  await sleep(500);

  const sampleGrid = () => page.evaluate(() => {
    const c = document.getElementById('go-board-canvas-initial');
    const ctx = c.getContext('2d');
    const px = ctx.getImageData(60, 300, 1, 1).data;
    return [px[0], px[1], px[2]];
  });

  // 3. RELOAD — the texture must appear on its own once the store is ready.
  await page.evaluate(() => { window._scoringDirty = false; });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.StudyDirStore && window.state && window.toggleCustomPanel, { timeout: 20000 });
  await page.evaluate(() => { window._scoringDirty = false; });

  // Poll up to ~8s: the flat fallback may show very briefly until OPFS attaches,
  // then reloadTextureAfterStorageReady must fire and repaint the texture.
  let grid = await sampleGrid();
  const isPainted = (g) => g[1] > 120 && g[1] > g[0] && g[1] > g[2]; // green-ish blend (image down-scaled), vs flat #e0901f fallback
  let painted = isPainted(grid);
  for (let i = 0; i < 40 && !painted; i++) {
    await sleep(200);
    grid = await sampleGrid();
    painted = isPainted(grid);
  }
  check('texture-ref board paints on its own after reload (no re-touch)', painted,
    `grid=${JSON.stringify(grid)}`);

  // Confirm the re-seed hook actually ran.
  const hookState = await page.evaluate(() => ({
    configured: window.StudyDirStore.isConfigured,
    usingOpfs: window.StudyDirStore.usingOpfs,
    imgLoaded: !!(window.initialBoardBgImage && window.initialBoardBgImage.naturalWidth > 0),
  }));
  console.log('hook state:', JSON.stringify(hookState));
  check('store configured (OPFS)', hookState.configured === true);
  check('texture Image element loaded', hookState.imgLoaded === true);

  const fails = results.filter(r => !r.pass).length;
  console.log(`\n=== texture-ref boot: ${results.length - fails}/${results.length} passed ===`);
  console.log('console sample:', consoleLog.slice(0, 8).join(' | '));
  await browser.close();
  server.close();
  try { fs.rmSync(tmpDir, { recursive: true }); } catch (e) {}
  if (fails) process.exit(1);
}

main().catch(e => { console.error('CRASHED:', e); process.exit(2); });