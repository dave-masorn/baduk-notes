// Verify the "Rec Folder" setup flow: the Choose Folder overlay renders and the
// buttons are wired; in browsers without the File System Access API the flow gives
// clear feedback instead of silently doing nothing.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { launchLightpanda } = require('./lightpanda-launcher.js');

const REPO = '/Users/davemasorn/AntiGravity/baduk-notes';
const PORT = 3952;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.wasm': 'application/wasm' };
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
  await page.waitForFunction(() => window.StudyDirStore && window.wireStudyDirSetupUI, { timeout: 20000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 2000));

  const state = await page.evaluate(() => ({
    supported: window.StudyDirStore.isSupported,
    overlayPresent: !!document.getElementById('study-dir-setup-overlay'),
    btnPick: !!document.getElementById('btn-study-dir-pick'),
    btnLater: !!document.getElementById('btn-study-dir-later'),
    btnReopen: !!document.getElementById('btn-study-dir-open'),
    statusEl: !!document.getElementById('study-dir-status'),
    overlayDisplay: getComputedStyle(document.getElementById('study-dir-setup-overlay')).display
  }));
  check('overlay + all buttons present', state.overlayPresent && state.btnPick && state.btnLater && state.btnReopen && state.statusEl, JSON.stringify(state));

  // Clicking "Not Now" closes the overlay
  const closed = await page.evaluate(() => {
    document.getElementById('btn-study-dir-later').click();
    return document.getElementById('study-dir-setup-overlay').style.display;
  });
  check('Not Now closes overlay', closed === 'none' || closed === '', `display=${closed}`);

  // Clicking "Choose Folder" in an unsupported browser must NOT crash and should keep
  // the overlay open with visible feedback (not silently vanish).
  const pickResult = await page.evaluate(async () => {
    document.getElementById('btn-study-dir-open').click(); // reopen overlay
    await new Promise(r => setTimeout(r, 100));
    const store = window.StudyDirStore;
    const before = store.isSupported;
    const btn = document.getElementById('btn-study-dir-pick');
    btn.click();
    await new Promise(r => setTimeout(r, 600));
    const overlay = document.getElementById('study-dir-setup-overlay');
    return {
      before,
      supported: store.isSupported,
      display: overlay.style.display,
      status: (document.getElementById('study-dir-status') || {}).textContent || ''
    };
  });
  check('Choose Folder gives visible feedback when unsupported', pickResult.supported === false && pickResult.display === 'flex' && pickResult.status.length > 0, JSON.stringify(pickResult));

  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  console.log(`\nstudy-dir-setup verify: ${passed} passed, ${failed} failed`);
  if (consoleErrors.length) console.log('page errors:', consoleErrors.slice(0, 5).join(' | '));
  await close();
  server.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error('CRASHED:', e); process.exit(2); });
