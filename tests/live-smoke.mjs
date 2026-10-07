// Loads /live/ in a real browser against the real testnet RPC and GitHub raw
// (CORS included) and reports what the page shows, as a GitHub annotation.
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('site');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const srv = http.createServer((q, s) => {
  let p = path.join(root, decodeURIComponent(q.url.split('?')[0]));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!p.startsWith(root) || !fs.existsSync(p)) { s.writeHead(404); return s.end(); }
  s.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(s);
}).listen(8765);

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:8765/live/');
await page.waitForFunction(() => {
  const t = document.getElementById('rpcLine').textContent + document.getElementById('feedNote').textContent;
  return t.trim().length > 0;
}, null, { timeout: 60_000 }).catch(() => errors.push('timeout waiting for the feed'));
const rows = await page.locator('#feedBody tr').count();
const rpc = (await page.locator('#rpcLine').innerText()).replace(/\n/g, ' ');
const note = (await page.locator('#feedNote').innerText()).replace(/\n/g, ' ');
const stats = (await page.locator('#stats').innerText().catch(() => '')).replace(/\n/g, ' ');
await browser.close();
srv.close();
const ok = errors.length === 0 && !/did not answer/.test(rpc);
console.log(`::${ok ? 'notice' : 'error'} title=live page::rows=${rows} | ${stats} | ${rpc} | ${note} | errors=${errors.join('; ')}`);
process.exit(ok ? 0 : 1);
