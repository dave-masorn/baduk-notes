// Chrome headless repro: set solid BG via real UI controls, reload, sample canvas.
// Reproduces the exact user-reported flow: "board setting correct but not applied after reload".
const path = require('path');
const http = require('http');
const fs   = require('fs');
const puppeteer = require('puppeteer-core');

const REPO = '/Users/davemasorn/AntiGravity/baduk-notes';
const PORT = 3971;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.wav':  'audio/wav',
  '.png':  'image/png',
  '.json': 'application/json',
};

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

function samplePixelColor(page) {
  return page.evaluate(() => {
    const canvas = document.getElementById('go-board-canvas-initial');
    if (!canvas) return { error: 'canvas not found' };
    const ctx = canvas.getContext('2d');
    // Sample from the padded area OUTSIDE the board (top-left corner, outside the wood margin)
    const px = ctx.getImageData(10, 10, 1, 1).data;
    // Also sample center of board area
    const cx = Math.floor(canvas.width / 2);
    const cy = Math.floor(canvas.height / 2);
    const cpx = ctx.getImageData(cx, cy, 1, 1).data;
    return {
      padding: [px[0], px[1], px[2], px[3]],
      center:  [cpx[0], cpx[1], cpx[2], cpx[3]],
      w: canvas.width,
      h: canvas.height,
    };
  });
}

function dumpState(page) {
  return page.evaluate(() => {
    const s = window.state;
    return {
      bgSolid:  s.initialBoardStyle?.bg?.solid,
      bgColor:  s.initialBoardStyle?.bg?.color,
      bgType:   s.initialBoardStyle?.bg?.type,
      boardSize:s.initialBoardStyle?.board?.size,
      boardCol: s.initialBoardStyle?.board?.color,
      useColor: s.initialBoardStyle?.board?.useColor,
      imgSrc:   s.initialBoardStyle?.board?.imgSrc,
      activeStudyId: s.activeStudyId,
      gameBoardStyleBg: s.gameBoardStyle?.bg,
    };
  });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  await new Promise(r => server.listen(PORT, r));
  console.log('server up on ' + PORT);

  // Chrome for Testing via Playwright install
  const chromePath = path.join(
    process.env.HOME,
    'Library/Caches/ms-playwright/chromium-1200/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
  );

  // Fresh profile so no stale localStorage
  const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'baduk-repro-'));

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      `--user-data-dir=${tmpDir}`,
      '--window-size=900,900',
    ],
  });

  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('pageerror', err => consoleErrors.push(String(err)));
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning') consoleErrors.push('console.' + msg.type() + ': ' + msg.text());
  });
  page.on('requestfailed', req => consoleErrors.push('reqfail: ' + (req.url && req.url().length > 60 ? req.url().slice(0, 60) : (req.url && req.url())) + ' → ' + (req.failure && req.failure().errorText)));
  page.on('response', res => {
    if (res.url().endsWith('repro-board.png')) consoleErrors.push('PNG response:' + res.status());
  });

  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => window.toggleCustomPanel && window.state && window.state.initialBoardStyle,
    { timeout: 20000 }
  );
  await sleep(500);

  // Ensure no study is active
  await page.evaluate(() => {
    window._scoringDirty = false;
    window.state.activeStudyId = null;
    window.state.gameBoardStyle = null;
  });

  console.log('\n=== Phase 1: Read initial state ===');
  const before = await dumpState(page);
  console.log('state before:', JSON.stringify(before, null, 2));
  const pixelsBefore = await samplePixelColor(page);
  console.log('pixels before:', JSON.stringify(pixelsBefore));

  console.log('\n=== Phase 2: Set solid BG via real UI controls ===');
  // Open the style panel
  await page.evaluate(() => window.toggleCustomPanel());
  await sleep(300);

  // Set canvas bg color to bright red #FF0000
  await page.evaluate(() => {
    const el = document.getElementById('ib-canvas-bg-color');
    if (el) {
      el.value = '#FF0000';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await sleep(200);

  // Turn solid BG ON
  await page.evaluate(() => {
    const el = document.getElementById('ib-bg-solid');
    if (el) {
      el.checked = true;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await sleep(500);

  const afterSet = await dumpState(page);
  console.log('state after set:', JSON.stringify(afterSet, null, 2));
  check('solid bg ON', afterSet.bgSolid === true, `bgSolid=${afterSet.bgSolid}`);
  check('bg color red', afterSet.bgColor === '#FF0000', `bgColor=${afterSet.bgColor}`);
  const pixelsAfterSet = await samplePixelColor(page);
  console.log('pixels after set:', JSON.stringify(pixelsAfterSet));

  const paddingIsRed = pixelsAfterSet.padding[0] === 255
                     && pixelsAfterSet.padding[1] === 0
                     && pixelsAfterSet.padding[2] === 0;
  check('canvas padding is red after setting', paddingIsRed,
    `rgb=[${pixelsAfterSet.padding.slice(0,3)}]`);

  // Verify localStorage has bg
  const lsBefore = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('baduk_initial_board_style') || '{}')
  );
  console.log('localStorage bg BEFORE reload:', JSON.stringify(lsBefore.bg));
  check('localStorage has bg.solid', lsBefore.bg && lsBefore.bg.solid === true);

  console.log('\n=== Phase 3: Reload ===');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => window.toggleCustomPanel && window.state && window.state.initialBoardStyle,
    { timeout: 20000 }
  );
  await sleep(800);

  // Ensure no study
  await page.evaluate(() => {
    window._scoringDirty = false;
    window.state.activeStudyId = null;
    window.state.gameBoardStyle = null;
  });
  await sleep(200);

  const afterReload = await dumpState(page);
  console.log('\nstate after reload:', JSON.stringify(afterReload, null, 2));
  const pixelsAfterReload = await samplePixelColor(page);
  console.log('pixels after reload:', JSON.stringify(pixelsAfterReload));

  const bgSolidAfterReload = afterReload.bgSolid === true;
  const bgColorAfterReload = afterReload.bgColor;
  check('bg solid persisted after reload', bgSolidAfterReload, `bgSolid=${afterReload.bgSolid}`);
  check('bg color persisted after reload', bgColorAfterReload.toUpperCase() === '#FF0000',
    `bgColor=${bgColorAfterReload}`);

  const paddingRedAfterReload = pixelsAfterReload.padding[0] === 255
                              && pixelsAfterReload.padding[1] === 0
                              && pixelsAfterReload.padding[2] === 0;
  check('canvas padding is red after reload (THE BUG)', paddingRedAfterReload,
    `rgb=[${pixelsAfterReload.padding.slice(0,3)}]`);

  // Also check the full render path value
  const renderStyleAfterReload = await page.evaluate(() => {
    const s = getEffectiveInitialStyle();
    return {
      bgSolid: s?.bg?.solid,
      bgColor: s?.bg?.color,
    };
  });
  check('getEffectiveInitialStyle bg.solid after reload',
    renderStyleAfterReload.bgSolid === true,
    `bgSolid=${renderStyleAfterReload.bgSolid}`);

  console.log('\n=== Phase 4: Touch a setting → does it now appear? ===');
  await page.evaluate(() => window.toggleCustomPanel());
  await sleep(300);
  await page.evaluate(() => {
    const el = document.getElementById('ib-canvas-bg-color');
    if (el) {
      el.value = '#FF0000';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await sleep(500);
  const pixelsAfterTouch = await samplePixelColor(page);
  const paddingRedAfterTouch = pixelsAfterTouch.padding[0] === 255
                             && pixelsAfterTouch.padding[1] === 0
                             && pixelsAfterTouch.padding[2] === 0;
  check('canvas padding red after re-touch', paddingRedAfterTouch,
    `rgb=[${pixelsAfterTouch.padding.slice(0,3)}]`);

  console.log('\n=== Phase 5: BOARD WOOD IMAGE (direct URL) — set → reload → sample ===');
  const setWoodImg = () => page.evaluate(() => {
    const style = getActiveStyleObject();
    style.board.useColor = false;
    style.board.imgSrc = 'http://localhost:3971/test/repro-board.png';
    window.invalidateTextureCache && window.invalidateTextureCache();
    window.initialBoardBgImage = null;
    saveStyleAndRedraw();
  });
  const sampleWood = () => page.evaluate(() => {
    const canvas = document.getElementById('go-board-canvas-initial');
    const ctx = canvas.getContext('2d');
    const pxAt = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data).slice(0, 3);
    const img = window.initialBoardBgImage;
    return {
      grid: pxAt(60, 300),
      padding: pxAt(10, 10),
      center: pxAt(300, 300),
      img: img ? { complete: img.complete, w: img.naturalWidth, h: img.naturalHeight } : null,
    };
  });
  const waitForWoodGreen = async () => {
    for (let i = 0; i < 30; i++) {
      const s = await sampleWood();
      if (s.grid[1] > 150 && s.grid[0] < 60 && s.grid[2] < 60) return s;
      await sleep(200);
    }
    return await sampleWood();
  };

  await setWoodImg();
  await sleep(400);
  // Direct probe: does a raw Image load this URL at all in this browser?
  const rawProbe = await page.evaluate(() => new Promise((resolve) => {
    const im = new Image();
    im.onload = () => resolve({ ok: true, w: im.naturalWidth });
    im.onerror = () => resolve({ ok: false });
    im.src = 'http://localhost:3971/test/repro-board.png';
    setTimeout(() => resolve({ ok: 'timeout', w: im.naturalWidth }), 3000);
  }));
  console.log('raw Image probe:', JSON.stringify(rawProbe));
  const woodAfterSet = await waitForWoodGreen();
  console.log('wood after set:', JSON.stringify(woodAfterSet));
  check('wood image green after set', woodAfterSet.grid[1] > 150,
    `grid=[${woodAfterSet.grid}] img=${JSON.stringify(woodAfterSet.img)}`);

  await page.evaluate(() => { window._scoringDirty = false; });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => window.toggleCustomPanel && window.state && window.state.initialBoardStyle,
    { timeout: 20000 }
  );
  await sleep(600);
  await page.evaluate(() => {
    window._scoringDirty = false;
    window.state.activeStudyId = null;
    window.state.gameBoardStyle = null;
  });
  const woodStateAfterReload = await page.evaluate(() => ({
    useColor: state.initialBoardStyle?.board?.useColor,
    imgSrc: state.initialBoardStyle?.board?.imgSrc,
  }));
  console.log('state after reload (wood img):', JSON.stringify(woodStateAfterReload));
  check('imgSrc persisted after reload', woodStateAfterReload.imgSrc === 'http://localhost:3971/test/repro-board.png',
    `imgSrc=${woodStateAfterReload.imgSrc}`);
  const woodAfterReload = await waitForWoodGreen();
  console.log('wood after reload:', JSON.stringify(woodAfterReload));
  check('wood image green after reload (THE BUG)', woodAfterReload.grid[1] > 150,
    `grid=[${woodAfterReload.grid}] img=${JSON.stringify(woodAfterReload.img)}`);

  console.log('\n=== Phase 6: STUDY SESSION RESUME — main board must show the REC style ===');
  // Create a study record whose captured initial-style has a BLUE solid canvas bg.
  await page.evaluate(() => {
    const sgf = `(;FF[4]GM[1]SZ[19]PB[Black]PW[White]RE[W+R];B[pd];W[dp])`;
    const style = JSON.parse(JSON.stringify(window.state.initialBoardStyle));
    style.bg = { color: '#0000FF', solid: true };
    style.board.color = '#00FF00';
    const rec = {
      id: 'repro_rec_' + Date.now(),
      recNo: window.StudyRecordDB.generateNextRecNo(),
      fileNm: 'repro-resume.sgf',
      blk: 'Black',
      wht: 'White',
      lastAccess: window.formatStudyAccessTime(),
      currentMoveIndex: 0,
      totalMoves: 2,
      rawSgf: sgf,
      workingSgf: sgf,
      settings: {
        initialBoardStyle: style,
        studyBoardStyle: style,
        exportBoardStyle: style,
        scoringBoardStyle: style,
        replayer: { showMoveNumbers: true, moveNumberMode: 'full', lastNMoves: '2', countback: false, nextMoveHint: false, isFlippedPov: false }
      }
    };
    window.StudyRecordDB.saveRecord(rec);
    window.__reproRecId = rec.id;
  });
  await sleep(200);
  // Open Resume Study overlay and click the row's resume button.
  const resumed = await page.evaluate(() => {
    return new Promise((resolve) => {
      if (document.getElementById('btn-change-rec-game')) {
        document.getElementById('btn-change-rec-game').click();
      } else if (element && elements.btnExploreKifu) {
        elements.btnExploreKifu.click();
      }
      setTimeout(() => {
        const row = document.querySelector(`.btn-resume-row[data-id="${window.__reproRecId}"]`);
        if (row) {
          row.click();
          resolve({ clicked: true });
        } else {
          resolve({ clicked: false, rows: Array.from(document.querySelectorAll('.btn-resume-row')).map(b => b.getAttribute('data-id')) });
        }
      }, 300);
    });
  });
  console.log('resume click:', JSON.stringify(resumed));
  check('resume button clicked', resumed.clicked === true, JSON.stringify(resumed));
  await sleep(800);

  const afterResume = await page.evaluate(() => {
    const canvas = document.getElementById('go-board-canvas-initial');
    const ctx = canvas.getContext('2d');
    const px = ctx.getImageData(10, 10, 1, 1).data;
    return {
      activeStudyId: state.activeStudyId,
      gameBg: state.gameBoardStyle && state.gameBoardStyle.bg,
      effBg: getEffectiveInitialStyle() && getEffectiveInitialStyle().bg,
      padding: [px[0], px[1], px[2], px[3]],
    };
  });
  console.log('after resume:', JSON.stringify(afterResume));
  check('resume sets activeStudyId', !!afterResume.activeStudyId, `id=${afterResume.activeStudyId}`);
  check('effective style is the rec blue bg', afterResume.effBg && afterResume.effBg.solid === true && String(afterResume.effBg.color).toUpperCase() === '#0000FF',
    `color=${afterResume.effBg && afterResume.effBg.color}`);
  const paddingBlue = afterResume.padding[2] === 255 && afterResume.padding[0] === 0 && afterResume.padding[1] === 0;
  check('main canvas padding is BLUE after resume (THE BUG)', paddingBlue,
    `padding=[${afterResume.padding}]`);

  const consoleFailures = consoleErrors.length;
  const failures = results.filter(r => !r.pass);
  console.log(`\n=== Summary: ${results.length - failures.length}/${results.length} checks passed, ${consoleFailures} console errors ===`);
  if (consoleErrors.length) console.log('Console errors:', consoleErrors.slice(0, 5));

  await browser.close();
  server.close();
  // cleanup tmp profile
  try { fs.rmSync(tmpDir, { recursive: true }); } catch(e) {}
  if (failures.length || consoleFailures) process.exit(1);
}

main().catch(e => { console.error('CRASHED:', e); process.exit(2); });
