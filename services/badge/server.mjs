// 402Scope badge service. No dependencies.
//
//   GET /badge.svg?endpoint=<url>   SVG badge for one measured endpoint
//   GET /badge.json?endpoint=<url>  the same, as { label, message, color, status }
//
// It reads the observatory's own API on this machine and caches each answer
// for 10 minutes, so a badge shown on many pages costs the API one request.
// It writes nothing and holds no keys.
import http from 'node:http';
import { renderBadge, badgeContent } from './render.mjs';

const PORT = Number(process.env.PORT || 3003);
const HOST = process.env.HOST || '127.0.0.1';
const API = (process.env.API_URL || 'http://127.0.0.1:3002').replace(/\/+$/, '');
const TTL_MS = Number(process.env.CACHE_MS || 10 * 60 * 1000);
const cache = new Map();

async function provider(endpoint) {
  const hit = cache.get(endpoint);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const r = await fetch(`${API}/v1/provider?endpoint=${encodeURIComponent(endpoint)}`, { signal: AbortSignal.timeout(8000), headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`api ${r.status}`);
  const value = await r.json();
  cache.set(endpoint, { at: Date.now(), value });
  if (cache.size > 5000) cache.delete(cache.keys().next().value);
  return value;
}

function validEndpoint(s) {
  if (!s || s.length > 2048) return false;
  try { const u = new URL(s); return u.protocol === 'https:' || u.protocol === 'http:'; } catch { return false; }
}

http.createServer(async (req, res) => {
  const u = new URL(req.url || '/', 'http://x');
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  if (u.pathname === '/badge/health') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('ok'); }
  const svg = u.pathname === '/badge.svg';
  if (!svg && u.pathname !== '/badge.json') { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('Not found'); }
  const endpoint = u.searchParams.get('endpoint');
  let p = null;
  let error = false;
  if (!validEndpoint(endpoint)) error = true;
  else {
    try { p = await provider(endpoint); } catch { error = true; }
  }
  const headers = {
    'access-control-allow-origin': '*',
    // Short browser cache; image proxies such as GitHub's respect it.
    'cache-control': error ? 'no-cache' : 'public, max-age=600',
    'x-content-type-options': 'nosniff',
  };
  if (svg) {
    res.writeHead(200, { ...headers, 'content-type': 'image/svg+xml; charset=utf-8', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'" });
    return res.end(req.method === 'HEAD' ? undefined : renderBadge(p, { error }));
  }
  const c = error ? { message: 'unavailable', color: '#57606a' } : badgeContent(p);
  res.writeHead(200, { ...headers, 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ label: '402Scope', ...c, status: p?.status ?? null, endpoint, page: `https://402scope.org/p/?endpoint=${encodeURIComponent(endpoint || '')}` }));
}).listen(PORT, HOST, () => console.log(`402Scope badges on http://${HOST}:${PORT}`));
