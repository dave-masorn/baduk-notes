const http = require('http');
const fs = require('fs');
const path = require('path');
const { launchLightpanda } = require('./lightpanda-launcher.js');

const REPO = path.resolve(__dirname, '..');
const PORT = 3946;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
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

async function main() {
  await new Promise((r) => server.listen(PORT, r));
  const { page, context, browser, close } = await launchLightpanda();
  console.log('connected to Lightpanda CDP');
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('error', (e) => pageErrors.push('ERR ' + String(e)));

  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  console.log('goto: OK');

  const probe = await page.evaluate(() => {
    const canvas = document.getElementById('go-board-canvas-scoring');
    let ctx = null, ctxErr = null;
    try { if (canvas) ctx = canvas.getContext('2d'); } catch (e) { ctxErr = String(e); }
    return {
      hasScoringState: !!window.scoringState,
      hasGoScorer: !!window.GoScorer,
      hasLoadSGF: typeof window.loadSGF === 'function',
      hasOpenScoringModal: typeof window.openScoringModal === 'function',
      hasCanvas: !!canvas,
      ctxOk: !!ctx,
      ctxErr,
      readyState: document.readyState,
      title: document.title
    };
  });
  console.log('probe:', JSON.stringify(probe, null, 2));
  console.log('pageErrors:', pageErrors.slice(0, 10));

  await close();
  server.close();
}

main().catch((e) => { console.error('CRASHED:', e); process.exit(2); });
