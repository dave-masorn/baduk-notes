// Verify: Custom Stones is available for every Default Stone Set (A/B/C) — when a set is
// selected the section auto-collapses but stays EXPANDABLE (no lock), it re-fits the enclosing
// Stones accordion when expanded, and it auto-expands again when the set is deselected.
const path = require('path');
const http = require('http');
const fs = require('fs');
const { launchLightpanda, probeCapabilities } = require('./lightpanda-launcher.js');

const REPO = '/Users/davemasorn/AntiGravity/baduk-notes';
const PORT = 3952;
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

let results = [];
let skipped = 0;
function check(name, cond, detail) {
  results.push({ name, pass: !!cond });
  console.log(`[${cond ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
}
function skip(name, reason) {
  skipped++;
  console.log(`[SKIP] ${name} — ${reason}`);
}

async function evalIn(page, fn, ...args) {
  return page.evaluate(fn, ...args);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await new Promise((r) => server.listen(PORT, r));
  const { page, close } = await launchLightpanda();
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.toggleCustomPanel && document.querySelector('.custom-stones-section'), { timeout: 15000 });
  // Lightpanda's layout engine reports bogus getBoundingClientRect heights (~5px)
  // for content-driven blocks, so the pixel-height accordion checks are SKIPPED
  // there. The expand/collapse/lock STATE checks run everywhere.
  const caps = await probeCapabilities(page);
  const LAYOUT_OK = caps.layout;
  const layoutCheck = (name, cond, detail) => {
    if (!LAYOUT_OK) { skip(name, 'layout heights unreliable (getBoundingClientRect ≈ 5px)'); return; }
    check(name, cond, detail);
  };
  // The app reads the bare `_scoringDirty` global in its beforeunload handler; the global is
  // only ever assigned once the scoring modal path runs, so a page that never opens MSM throws
  // a ReferenceError on reload. Init it (mirroring the modal path) to keep the harness clean.
  await evalIn(page, () => { window._scoringDirty = false; });

  // ── page-side helpers ─────────────────────────────────────────────────────
  const injectHelpers = () => evalIn(page, () => {
    window.__h = {
      openPanel() { window.toggleCustomPanel(); },
      toggleAccordion() {
        const trigger = document.querySelector('.accordion-trigger[data-target="acc-stones"]');
        if (trigger) trigger.click();
        return !!trigger;
      },
      snap() {
        const section = document.querySelector('.custom-stones-section');
        const body = section.querySelector('.custom-stones-body');
        const acc = document.getElementById('acc-stones');
        const style = window.getActiveStyleObject();
        return {
          expanded: section.classList.contains('expanded'),
          locked: section.classList.contains('locked'),
          bodyMaxH: body.style.maxHeight,
          bodyH: body.getBoundingClientRect().height,
          bodyScrollH: body.scrollHeight,
          accMaxH: acc.style.maxHeight,
          accScrollH: acc.scrollHeight,
          accOpen: acc.classList.contains('open'),
          activeSet: document.querySelector('.stone-set-option.active') ?
            document.querySelector('.stone-set-option.active').dataset.set : null,
          stoneSet: style ? style.stoneSet : null
        };
      },
      clickSet(set) {
        const opt = document.querySelector(`.stone-set-option[data-set="${set}"]`);
        if (opt) opt.click();
        return !!opt;
      },
      clickHeader() {
        const header = document.querySelector('.custom-stones-header');
        if (header) header.click();
        return !!header;
      }
    };
  });

  await injectHelpers();
  await evalIn(page, () => __h.openPanel());
  await sleep(300);
  await evalIn(page, () => __h.toggleAccordion());
  await sleep(300);

  // ── A1: no set → custom expanded, accordion open, unlocked ───────────────
  const fullScrollH = await evalIn(page, () => __h.snap().accScrollH);
  {
    const s = await evalIn(page, () => __h.snap());
    check('A1 accordion open', s.accOpen === true);
    check('A1 initial: Custom Stones expanded', s.expanded === true);
    check('A1 initial: not locked', s.locked === false);
    check('A1 initial: no stone set active', s.activeSet === null && s.stoneSet === null, `set=${s.activeSet} style=${s.stoneSet}`);
    layoutCheck('A1 initial: body rendered (real layout)', s.bodyH > 50 && s.bodyScrollH > 50, `bodyH=${s.bodyH} scrollH=${s.bodyScrollH}`);
    check('A1 initial: accordion holds full content (within sub-px layout drift)',
      parseFloat(s.accMaxH) >= s.accScrollH - 4, `accMaxH=${s.accMaxH} scrollH=${s.accScrollH}`);
  }

  // ── A2: select Set A → custom auto-COLLAPSES but stays unlocked ──────────
  await evalIn(page, () => __h.clickSet('A'));
  await sleep(400);
  {
    const s = await evalIn(page, () => __h.snap());
    check('A2 Set A: custom auto-collapsed', s.expanded === false && s.bodyMaxH === '0px', JSON.stringify(s));
    check('A2 Set A: not locked (expandable)', s.locked === false);
    check('A2 Set A: radio + style persisted', s.activeSet === 'A' && s.stoneSet === 'A', `set=${s.activeSet} style=${s.stoneSet}`);
  }

  // ── A3: RE-FIT — reopen accordion while A active (measures SHORT), then expand ──
  await evalIn(page, () => __h.toggleAccordion());
  await sleep(300);
  await evalIn(page, () => __h.toggleAccordion());
  await sleep(300);
  const shortMaxH = await evalIn(page, () => __h.snap().accMaxH);
  layoutCheck('A3 Set A: accordion reopened measures SHORT', parseFloat(shortMaxH) < fullScrollH - 1, `short=${shortMaxH} full=${fullScrollH}`);
  await evalIn(page, () => __h.clickHeader());
  await sleep(400);
  {
    const s = await evalIn(page, () => __h.snap());
    check('A3 Set A + expand: custom expanded', s.expanded === true, JSON.stringify(s));
    check('A3 Set A + expand: body open (>0px)', s.bodyH > 0 && s.bodyMaxH !== '0px', `bodyH=${s.bodyH} maxH=${s.bodyMaxH}`);
    check('A3 Set A + expand: accordion re-fitted to full (no clip)', parseFloat(s.accMaxH) >= fullScrollH - 4, `accMaxH=${s.accMaxH} full=${fullScrollH}`);
    layoutCheck('A3 Set A + expand: body fully visible', s.bodyH >= s.bodyScrollH - 2, `bodyH=${s.bodyH} scrollH=${s.bodyScrollH}`);
  }

  // ── A4: collapse custom while Set A active ───────────────────────────────
  await evalIn(page, () => __h.clickHeader());
  await sleep(400);
  {
    const s = await evalIn(page, () => __h.snap());
    check('A4 Set A: custom collapsed again', s.expanded === false && s.bodyMaxH === '0px', JSON.stringify(s));
    check('A4 Set A: accordion stays open', s.accOpen === true);
  }

  // ── A5: switch to Set B → still auto-collapsed + expandable ──────────────
  await evalIn(page, () => __h.clickSet('B'));
  await sleep(400);
  {
    const s = await evalIn(page, () => __h.snap());
    check('A5 Set B: custom auto-collapsed', s.expanded === false && s.bodyMaxH === '0px', JSON.stringify(s));
    check('A5 Set B: not locked', s.locked === false);
    check('A5 Set B: radio + style switched', s.activeSet === 'B' && s.stoneSet === 'B', `set=${s.activeSet} style=${s.stoneSet}`);
  }

  // ── A6: deselect Set B → custom auto-EXPANDS again ───────────────────────
  await evalIn(page, () => __h.clickSet('B'));
  await sleep(400);
  {
    const s = await evalIn(page, () => __h.snap());
    check('A6 deselect B: custom auto-expanded', s.expanded === true && s.bodyH > 0, JSON.stringify(s));
    check('A6 deselect B: not locked', s.locked === false);
    check('A6 deselect B: stoneSet cleared', s.activeSet === null && s.stoneSet === null, `set=${s.activeSet} style=${s.stoneSet}`);
  }

  // ── A7: Select Set C → collapses; reload → C pre-selected + expandable ──
  await evalIn(page, () => __h.clickSet('C'));
  await sleep(400);
  {
    const s = await evalIn(page, () => __h.snap());
    check('A7 Set C: custom auto-collapsed', s.expanded === false && s.bodyMaxH === '0px', JSON.stringify(s));
    check('A7 Set C: not locked', s.locked === false);
    check('A7 Set C: radio + style persisted', s.activeSet === 'C' && s.stoneSet === 'C', `set=${s.activeSet} style=${s.stoneSet}`);
  }

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.toggleCustomPanel && document.querySelector('.custom-stones-section'), { timeout: 15000 });
  await evalIn(page, () => { window._scoringDirty = false; });
  await injectHelpers();
  await sleep(300);
  await evalIn(page, () => __h.openPanel());
  await sleep(300);
  {
    const s = await evalIn(page, () => __h.snap());
    check('A8 reload: Set C pre-selected', s.activeSet === 'C' && s.stoneSet === 'C', `set=${s.activeSet} style=${s.stoneSet}`);
    check('A8 reload: custom auto-collapsed', s.expanded === false && s.bodyMaxH === '0px', JSON.stringify(s));
    check('A8 reload: not locked', s.locked === false);
    await evalIn(page, () => __h.clickHeader());
    await sleep(400);
    const s2 = await evalIn(page, () => __h.snap());
    check('A8 reload: expands after collapse', s2.expanded === true && s2.bodyH > 0, JSON.stringify(s2));
    check('A8 reload: still not locked', s2.locked === false);
  }

  const failures = results.filter((r) => !r.pass);
  const consoleFailures = consoleErrors.length;
  console.log(`\nCustom Stones expand harness: ${results.length - failures.length}/${results.length} checks passed, ${skipped} skipped.`);
  if (consoleFailures) console.log('page console errors:', consoleErrors.slice(0, 10));
  await close();
  server.close();
  if (failures.length || consoleFailures) process.exit(1);
}

main().catch((e) => { console.error('CRASHED:', e); process.exit(2); });
