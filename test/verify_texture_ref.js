// Verify reference-based board/stone texture storage (board-texture.js +
// StudyDirStore.importTexture): picked textures are stored as tiny
// "texture-ref:" tokens, the file bytes move into the study folder when a
// writable directory is configured, and rendering resolves a ref back to an
// objectURL — while unresolvable refs degrade to null (color fallback) instead
// of crashing.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { launchLightpanda } = require('./lightpanda-launcher.js');

const REPO = '/Users/davemasorn/AntiGravity/baduk-notes';
const PORT = 3956;
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
  await page.waitForFunction(() => window.resolveTextureSrc && window.storeTextureFile && window.loadBoardTextureImage, { timeout: 20000 }).catch(() => {});

  // Core API surface + token format
  const api = await page.evaluate(() => ({
    prefix: window.TEXTURE_REF_PREFIX,
    hasResolve: typeof window.resolveTextureSrc === 'function',
    hasStore: typeof window.storeTextureFile === 'function',
    hasLoad: typeof window.loadBoardTextureImage === 'function',
    hasThumb: typeof window.setBgTextureThumb === 'function',
    hasInvalidate: typeof window.invalidateTextureCache === 'function',
    supported: window.StudyDirStore ? window.StudyDirStore.isSupported : null
  }));
  check('board-texture API present', api.hasResolve && api.hasStore && api.hasLoad && api.hasThumb && api.hasInvalidate, JSON.stringify(api));
  check('ref prefix is texture-ref:', api.prefix === 'texture-ref:', api.prefix);

  // No configured study dir (Lightpanda) -> session-only storage, ref still resolves
  const session = await page.evaluate(async () => {
    const blob = new Blob([new Uint8Array([137, 80, 78, 71, 1, 2, 3]).buffer]);
    const st = await window.storeTextureFile(blob, 'My Kaya Wood.png', window.TEXTURE_DIR_SUBDIR);
    const ref = window.TEXTURE_REF_PREFIX + st.rel;
    const resolved = await window.resolveTextureSrc(ref);
    // Same-session render should produce a usable URL (blob: or data:)
    return { st, ref, resolved, isUrl: !!resolved && (resolved.startsWith('blob:') || resolved.startsWith('data:')) }; 
  });
  check('storeTextureFile returns session ref rel', session.st && session.st.rel === 'textures/My-Kaya-Wood.png' && session.st.mode === 'session', JSON.stringify(session.st));
  check('resolveTextureSrc resolves ref this session', session.resolved && session.isUrl, String(session.resolved));

  // Unresolvable ref (not in folder, cache cleared) -> null, no crash
  const missing = await page.evaluate(async () => {
    window.invalidateTextureCache();
    const ref = window.TEXTURE_REF_PREFIX + 'textures/does-not-exist.png';
    const r = await window.resolveTextureSrc(ref);
    return { nullOrEmpty: r === null, retriedSame: await window.resolveTextureSrc(ref) === null };
  });
  check('missing ref resolves to null (color fallback)', missing.nullOrEmpty && missing.retriedSame, JSON.stringify(missing));

  // loadBoardTextureImage keeps board/stone cache-key contract
  const loader = await page.evaluate(async () => {
    const blob = new Blob(['abc']);
    await window.storeTextureFile(blob, 'kaya.png', 'textures');
    const ref = window.TEXTURE_REF_PREFIX + 'textures/kaya.png';
    const img = window.loadBoardTextureImage('testBoardBgImage', ref, () => {});
    await new Promise(r => setTimeout(r, 300));
    return { imgIsImage: img instanceof Image || (img instanceof window.Image), hasSrc: !!img.src };
  });
  check('loadBoardTextureImage builds Image for ref', loader.imgIsImage && loader.hasSrc, JSON.stringify(loader));

  // Folder write path: mock a writable directory (FS API present) -> importTexture
  // writes bytes under textures/, storeTextureFile reports mode 'folder'.
  const folder = await page.evaluate(async () => {
    const written = [];
    const mockWritable = {
      write: async (data) => { written.push(data); return undefined; },
      close: async () => {}
    };
    const mockFileHandle = { createWritable: async () => mockWritable, getFile: async () => ({ name: 'x', text: async () => '' }) };
    const mockDirHandle = {
      async getDirectoryHandle(name, opts) { return this; },
      async getFileHandle(name, opts) { return mockFileHandle; }
    };
    // Point StudyDirStore at the mock — emulate the FS Access API being present.
    const s = window.StudyDirStore;
    window.showDirectoryPicker = async () => mockDirHandle;
    s._dir = mockDirHandle;
    const dirOk = await s.importTexture(new Blob([new Uint8Array([1, 2, 3])]), 'textures/kaya.png');
    const st2 = await window.storeTextureFile(new Blob([new Uint8Array([4, 5])]), 'slate.png', window.TEXTURE_DIR_SUBDIR);
    const bytesWritten = await Promise.all(written.map(async w => Array.from(new Uint8Array(await w.arrayBuffer()))));;
    return {
      dirOk,
      mode: st2.mode,
      rel: st2.rel,
      wroteBytes: bytesWritten,
      wroteTexturesKaya: bytesWritten.some(b => b.join(',') === '1,2,3')
    };
  });
  check('StudyDirStore.importTexture writes bytes into mock dir', folder.dirOk === true && folder.wroteTexturesKaya, JSON.stringify(folder));
  check('storeTextureFile reports folder mode when dir writable', folder.mode === 'folder' && folder.rel === 'textures/slate.png', JSON.stringify(folder));

  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  console.log(`\ntexture-ref verify: ${passed} passed, ${failed} failed`);
  if (consoleErrors.length) console.log('page errors:', consoleErrors.slice(0, 5).join(' | '));
  await close();
  server.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error('CRASHED:', e); process.exit(2); });