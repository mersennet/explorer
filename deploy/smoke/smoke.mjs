#!/usr/bin/env node
/**
 * Explorer pre-publish smoke: serve the staged build locally and load the
 * routes in headless Chromium. Fails on any uncaught error, console.error we
 * do not allow-list, an empty #view, or a route whose module graph did not
 * load (the two blank-page incidents: a duplicate `const`, a missing export).
 *   node smoke.mjs <staged-dir>
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';

const DIR = process.argv[2];
if (!DIR) { console.error('usage: smoke.mjs <staged-dir>'); process.exit(2); }
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain', '.xml': 'application/xml', '.woff2': 'font/woff2' };
// SPA static server: real files as-is, everything else → index.html (Caddy's try_files).
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  let p = join(DIR, decodeURIComponent(url.pathname));
  try { const s = await stat(p); if (s.isDirectory()) p = join(p, 'index.html'); await stat(p); } catch { p = join(DIR, 'index.html'); }
  try { const body = await readFile(p); res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(body); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const ROUTES = ['/', '/validators', '/network', '/clob/1', '/blocks', '/txs', '/tokenomics', '/privacy', '/verify'];
const IGNORE = [/favicon/i, /net::ERR_BLOCKED_BY_CLIENT/i, /Failed to load resource.*(429|404)/i, /Object is disposed/i, /cloudflareinsights/i];
const failures = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1366, height: 800 } });
for (const route of ROUTES) {
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => { if (!IGNORE.some((re) => re.test(e.message))) errors.push(`pageerror: ${e.message}`); });
  page.on('console', (m) => { if (m.type() === 'error' && !IGNORE.some((re) => re.test(m.text()))) errors.push(`console: ${m.text().slice(0, 160)}`); });
  try {
    await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4500);
    const text = (await page.evaluate(() => (document.getElementById('view') || document.body).innerText)).trim();
    if (text.length < 40) throw new Error(`#view nearly empty (${text.length} chars) — module graph did not load?`);
    if (errors.length) throw new Error(errors.slice(0, 3).join(' | '));
    console.log(`ok    ${route}`);
  } catch (e) { failures.push(`${route}: ${e.message}`); console.log(`FAIL  ${route}: ${e.message}`); }
  finally { await page.close(); }
}
await browser.close(); server.close();
if (failures.length) { console.log(`\n${failures.length} failure(s) — not publishing.`); process.exit(1); }
console.log(`\nall ${ROUTES.length} routes passed`);
