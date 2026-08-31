// Verify: STdB loadAllRecords collapses duplicate recNo — when a legacy
// rec-NNN-*.json pair (pre-STdB) shares recNo with a newer NNN.theme file, only
// the most recently accessed record is kept and the stale duplicate physical
// files are removed (so the duplicate never re-appears on the next load).
const http = require('http');
const fs = require('fs');
const path = require('path');
const { launchLightpanda } = require('./lightpanda-launcher.js');

const REPO = '/Users/davemasorn/AntiGravity/baduk-notes';
const PORT = 3961;
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
  await page.waitForFunction(() => window.StudyDirStore, { timeout: 20000 }).catch(() => {});

  // Build a mock dir with a LEGACY rec-001-* pair + a NEW 001.theme, both recNo 001.
  const res = await page.evaluate(async () => {
    const files = {};
    const mkHandle = (name, text) => ({
      name,
      getFile: async () => ({ text: async () => text }),
      createWritable: async () => ({ write: async () => {}, close: async () => {} })
    });
    files['001.sgf'] = '(;FF[4]SZ[19];B[pd])';
    files['001.theme'] = JSON.stringify({
      id: 'new_001', recNo: '001', fileNm: 'Lee-Changho.sgf',
      blk: 'Black', wht: 'White', lastAccess: '31-08-2026 02:05:45'
    });
    files['rec-001-old.json'] = JSON.stringify({
      id: 'legacy_001', recNo: '001', fileNm: 'Lee-Changho.sgf',
      blk: 'Black', wht: 'White', lastAccess: '31-08-2026 01:00:00',
      _dirSchema: 1, sgfFile: 'rec-001-old.sgf'
    });
    files['rec-001-old.sgf'] = '(;FF[4]SZ[19];B[dd])';
    const removed = [];
    const mockDir = {
      async *values() { for (const n of Object.keys(files)) yield { name: n, kind: 'file' }; },
      async getFileHandle(name) { if (!(name in files)) throw new Error('nf'); return mkHandle(name, files[name]); },
      async removeEntry(name) { removed.push(name); delete files[name]; }
    };
    const S = window.StudyDirStore;
    S._dir = mockDir;
    const all = await S.loadAllRecords();
    return {
      uniqueCount: all.length,
      ids: all.map(r => r.id),
      removed: removed.sort(),
      remaining: Object.keys(files).sort()
    };
  });

  check('duplicate recNo collapses to one record', res.uniqueCount === 1, `count=${res.uniqueCount}`);
  check('newest theme record is kept (new_001)', res.ids[0] === 'new_001', JSON.stringify(res.ids));
  check('stale legacy files removed', res.removed.includes('rec-001-old.json') && res.removed.includes('rec-001-old.sgf'), JSON.stringify(res.removed));
  check('new 001.sgf + 001.theme survive', res.remaining.includes('001.theme') && res.remaining.includes('001.sgf'), JSON.stringify(res.remaining));

  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  console.log(`\nstudy-dir-dedupe verify: ${passed} passed, ${failed} failed`);
  if (consoleErrors.length) console.log('page errors:', consoleErrors.slice(0, 5).join(' | '));
  await close();
  server.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error('CRASHED:', e); process.exit(2); });
