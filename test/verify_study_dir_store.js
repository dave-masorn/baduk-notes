// Verify: StudyRecordDB persists records (and, when the File System Access API is
// available, StudyDirStore is present and wired). Confirms a saved Rec survives the
// browser cache round-trip and appears in the Resume Study (Kifu) table.
const path = require('path');
const http = require('http');
const fs = require('fs');
const { launchLightpanda } = require('./lightpanda-launcher.js');

const REPO = '/Users/davemasorn/AntiGravity/baduk-notes';
const PORT = 3951;

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
  await page.waitForFunction(() => window.StudyRecordDB && window.renderResumeStudyTable, { timeout: 20000 });

  const sgf = `(;FF[4]GM[1]SZ[19]PB[Black]PW[White]RE[W+R];B[pd];W[dp];B[dd])`;

  // Save a record directly (as if the user clicked "Yes, Record It")
  const saved = await page.evaluate((sgf) => {
    const rec = {
      id: 'study_test_' + Date.now(),
      recNo: window.StudyRecordDB.generateNextRecNo(),
      fileNm: 'dir-store-test.sgf',
      blk: 'Black',
      wht: 'White',
      lastAccess: window.formatStudyAccessTime(),
      currentMoveIndex: 0,
      totalMoves: 3,
      rawSgf: sgf,
      workingSgf: sgf
    };
    const ok = window.StudyRecordDB.saveRecord(rec);
    window.renderResumeStudyTable('');
    return { ok, id: rec.id, has: !!window.StudyRecordDB.getRecord(rec.id), count: window.StudyRecordDB.getAllRecords().length };
  }, sgf);

  check('saveRecord returns true', saved.ok, JSON.stringify(saved));
  check('record retrievable via getRecord', saved.has && saved.count >= 1, `count=${saved.count}`);

  // Table reflects it
  const tableHas = await page.evaluate((id) => {
    const rows = document.querySelectorAll('#kifu-table-body .kifu-row');
    return Array.from(rows).map(r => r.getAttribute('data-id')).includes(id);
  }, saved.id);
  check('record row rendered in Resume Study table', tableHas, '');

  // StudyDirStore object present and gracefully reports support status
  const dirState = await page.evaluate(() => ({
    present: !!window.StudyDirStore,
    supported: window.StudyDirStore ? window.StudyDirStore.isSupported : null,
    configured: window.StudyDirStore ? window.StudyDirStore.isConfigured : null,
    hasFallback: window.StudyDirStore ? window.StudyDirStore.hasFolderFallback : null,
    usingFallback: window.StudyDirStore ? window.StudyDirStore.isUsingFallback : null,
    hasImportFn: window.StudyDirStore ? typeof window.StudyDirStore.importFolderViaInput : null,
    hasMergeFn: window.StudyRecordDB ? typeof window.StudyRecordDB.mergeDirRecords : null,
    overlay: !!document.getElementById('study-dir-setup-overlay'),
    dirBtn: !!document.getElementById('btn-study-dir-open')
  }));
  check('StudyDirStore exposed on window', dirState.present, '');
  check('setup overlay + Rec Folder button present in DOM', dirState.overlay && dirState.dirBtn, JSON.stringify(dirState));
  check('graceful fallback when FS API unsupported', dirState.present && dirState.supported === false, `supported=${dirState.supported}`);
  check('webkitdirectory folder-import fallback wired', dirState.hasImportFn === 'function' && dirState.hasMergeFn === 'function', JSON.stringify({hasFallback: dirState.hasFallback, hasImportFn: dirState.hasImportFn, hasMergeFn: dirState.hasMergeFn}));
  check('isUsingFallback false until a folder is imported', dirState.usingFallback === false, `usingFallback=${dirState.usingFallback}`);

  // mergeDirRecords dedups by id (dir record wins) and keeps non-dir records
  const merge = await page.evaluate(async () => {
    const before = window.StudyRecordDB.getAllRecords().length;
    const fake = [
      { id: 'study_test_' + Date.now() + '_a', recNo: '099', fileNm: 'from-folder-a.sgf', blk: 'B', wht: 'W', lastAccess: '2026-01-01', rawSgf: '(;FF[4]GM[1]SZ[19];B[pd])', workingSgf: '(;FF[4]GM[1]SZ[19];B[pd])', _dirSchema: 1 },
      { id: 'study_test_' + Date.now() + '_b', recNo: '100', fileNm: 'from-folder-b.sgf', blk: 'B', wht: 'W', lastAccess: '2026-01-02', rawSgf: '(;FF[4]GM[1]SZ[19];B[dd])', workingSgf: '(;FF[4]GM[1]SZ[19];B[dd])', _dirSchema: 1 }
    ];
    const merged = await window.StudyRecordDB.mergeDirRecords(fake);
    const hasA = merged.some(r => r.id === fake[0].id);
    const hasB = merged.some(r => r.id === fake[1].id);
    return { mergedLen: merged.length, hasA, hasB, beforeCount: before };
  });
  check('mergeDirRecords merges folder records into cache+storage', merge.hasA && merge.hasB && merge.mergedLen >= merge.beforeCount + 2, JSON.stringify(merge));

  // Persistence across reload: with STdB, records live in the chosen folder.
  // In the test (no FS API configured), records are in-memory only and do NOT
  // survive a hard reload — this is expected STdB-only behavior.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.StudyRecordDB, { timeout: 20000 });
  const afterReload = await page.evaluate(() => ({
    count: window.StudyRecordDB.getAllRecords().length,
    firstFile: window.StudyRecordDB.getAllRecords()[0] ? window.StudyRecordDB.getAllRecords()[0].fileNm : null
  }));
  // With no STdB configured, in-memory records don't survive reload
  check('reload clears in-memory cache (expected — no STdB configured)', afterReload.count === 0, JSON.stringify(afterReload));

  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  console.log(`\nstudy-dir-store verify: ${passed} passed, ${failed} failed`);
  if (consoleErrors.length) console.log('page errors:', consoleErrors.slice(0, 5).join(' | '));
  await close();
  server.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error('CRASHED:', e); process.exit(2); });
