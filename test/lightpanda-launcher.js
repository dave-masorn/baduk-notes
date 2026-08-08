// Lightpanda launcher for the baduk-notes verification harnesses.
// Ensures `lightpanda serve` is running on 127.0.0.1:9222 (spawning it if needed),
// then connects over CDP via puppeteer-core — no Chrome/Brave, no temp spikes.
const { spawn } = require('child_process');
const http = require('http');
const os = require('os');
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-core');

const LP_LOG = path.join(os.tmpdir(), 'lightpanda-serve.log');

function isUp(port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/json/version', timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function ensureServer(port = 9222) {
  if (await isUp(port)) return;
  const logFd = fs.openSync(LP_LOG, 'a');
  const proc = spawn('lightpanda',
    ['serve', '--host', '127.0.0.1', '--port', String(port), '--enable-external-stylesheets', '--log-format', 'pretty', '--log-level', 'warn'],
    { detached: true, stdio: ['ignore', logFd, logFd], env: { ...process.env, LIGHTPANDA_DISABLE_TELEMETRY: 'true', LIGHTPANDA_DISABLE_CORE_DUMP: '1' } });
  fs.closeSync(logFd);
  proc.unref();
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await isUp(port)) return;
  }
  throw new Error('lightpanda serve did not come up on port ' + port + ' (logs: ' + LP_LOG + ')');
}

async function launchLightpanda({ port = 9222, width = 1600, height = 1200 } = {}) {
  await ensureServer(port);
  const browser = await puppeteer.connect({ browserWSEndpoint: `ws://127.0.0.1:${port}` });
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  try { await page.setViewport({ width, height }); } catch (e) {}
  return {
    page, context, browser,
    async close() {
      try { await context.close(); } catch (e) {}
      try { await browser.disconnect(); } catch (e) {}
    }
  };
}

// Probe the running engine's rendering/layout capabilities. Lightpanda's canvas
// 2D context is a stub (no createRadialGradient/createLinearGradient, getImageData
// always returns zeros) and its layout engine reports bogus getBoundingClientRect
// heights (~5px) for content-driven blocks. Pixel/layout-dependent checks must be
// SKIPPED (not failed) when these capabilities are missing — a real browser passes
// both fields.
async function probeCapabilities(page) {
  return page.evaluate(() => {
    const ctx = document.createElement('canvas').getContext('2d');
    const gradients = typeof ctx.createRadialGradient === 'function' && typeof ctx.createLinearGradient === 'function';
    const wrap = document.createElement('div');
    const inner = document.createElement('div');
    inner.style.height = '123px';
    wrap.appendChild(inner);
    document.body.appendChild(wrap);
    const rectH = wrap.getBoundingClientRect().height;
    const layout = rectH === 123;
    wrap.remove();
    return { gradients, layout };
  });
}

module.exports = { launchLightpanda, ensureServer, probeCapabilities };
