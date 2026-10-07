#!/usr/bin/env node
// Monthly "State of x402 delivery" report, generated from the observatory's own API.
//
//   node tools/report.mjs [--api http://127.0.0.1:3002] [--out /var/www/402scope]
//
// Writes, under --out:
//   reports/<YYYY-MM>/index.html   the edition, with the site's header and footer
//   reports/<YYYY-MM>/data.json    every figure in it, as read from the API
//   reports/index.html             all editions, newest first
//   feed.xml                       RSS 2.0, last 12 editions
// It only reads the API. Figures are reported as signed at the time of the run;
// nothing is edited by hand, and a rerun in the same month replaces that edition.
import fs from 'node:fs';
import path from 'node:path';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const API = arg('api', 'http://127.0.0.1:3002').replace(/\/+$/, '');
const OUT = arg('out', '/var/www/402scope');
const SITE = 'https://402scope.org';

const get = async (p) => { const r = await fetch(API + p, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(60_000) }); if (!r.ok) throw new Error(`${p} → ${r.status}`); return r.json(); };
const post = async (p, body) => { const r = await fetch(API + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(60_000) }); if (!r.ok) throw new Error(`${p} → ${r.status}`); return r.json(); };
const opt = async (f) => { try { return await f(); } catch (e) { console.error('optional section skipped:', e.message); return null; } };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const num = (n) => (n == null ? '—' : Number(n).toLocaleString('en'));
const pct = (v) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`);
const host = (u) => String(u).replace(/^https?:\/\//, '');

const now = new Date();
const month = now.toISOString().slice(0, 7);
const monthName = now.toLocaleDateString('en', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const asOf = now.toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

// ---- Data -----------------------------------------------------------------
const eps = await get('/v1/endpoints');
const list = (eps.endpoints ?? []).map((e) => e.endpoint);
const results = [];
for (let i = 0; i < list.length; i += 50) results.push(...((await post('/v1/providers', { endpoints: list.slice(i, i + 50) })).results ?? []));
const byEp = new Map(results.map((r) => [r.endpoint, r]));
const coverage = await opt(() => get('/v1/coverage'));
const market = await opt(() => get('/v1/market'));
const health = await opt(() => get('/v1/health'));

const panel = (eps.endpoints ?? []).map((e) => {
  const a = byEp.get(e.endpoint) || {};
  return { endpoint: e.endpoint, chain: e.chain ?? null, relationship: e.relationship ?? null, status: a.status ?? 'no_data', n: a.n ?? null, faultsObserved: a.faultsObserved ?? null, faultRateUpperBound: a.faultRateUpperBound ?? null, attestationSetHash: a.attestationSetHash ?? null };
});
const count = (s) => panel.filter((p) => p.status === s).length;
const data = { edition: month, generatedAt: now.toISOString(), api: 'https://402scope.org/v1', panel, coverage, market, health };

// Previous edition, for month-on-month change in the bound.
const reportsDir = path.join(OUT, 'reports');
fs.mkdirSync(reportsDir, { recursive: true });
const editions = fs.readdirSync(reportsDir).filter((d) => /^\d{4}-\d{2}$/.test(d)).sort();
const prevMonth = editions.filter((d) => d < month).at(-1);
let prev = null;
if (prevMonth) { try { prev = JSON.parse(fs.readFileSync(path.join(reportsDir, prevMonth, 'data.json'), 'utf8')); } catch { prev = null; } }
const prevBy = new Map((prev?.panel ?? []).map((p) => [p.endpoint, p]));

// ---- Page -----------------------------------------------------------------
const home = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
let head = home.slice(0, home.indexOf('<main id="top">'));
let foot = home.slice(home.indexOf('<footer>')).replace('<script src="app.js" defer></script>\n', '').replace('<script src="theme.js" defer></script>\n', '');
head = head.replace('href="favicon.svg"', 'href="/favicon.svg"').replace('href="fonts/', 'href="/fonts/').replace('href="styles.css"', 'href="/styles.css"').replace('href="#top"', 'href="/"').replaceAll('<a href="#', '<a href="/#');
foot = foot.replace('href="#api"', 'href="/#api"').replace('</body>', '<script src="/theme.js" defer></script>\n</body>');
const page = (title, description, url, body) =>
  head.replace(/<title>.*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/<meta name="description" content=".*?">/, `<meta name="description" content="${esc(description)}">`)
    .replace(/<meta property="og:title" content=".*?">/, `<meta property="og:title" content="${esc(title)}">`)
    .replace(/<meta property="og:description" content=".*?">/, `<meta property="og:description" content="${esc(description)}">`)
    .replace(/<meta property="og:url" content=".*?">/, `<meta property="og:url" content="${SITE}${url}">`)
  + `<main id="top">\n${body}\n</main>\n\n` + foot;
const table = (h, b) => `<div class="table-wrap"><table><thead><tr>${h}</tr></thead><tbody>${b}</tbody></table></div>`;

const lead = `${num(panel.length)} endpoints in the paid panel: ${num(count('published'))} published, ${num(count('provisional'))} provisional, ${num(count('insufficient_data'))} still measuring${count('no_data') ? `, ${num(count('no_data'))} without an aggregate yet` : ''}.`;
const order = { published: 0, provisional: 1, insufficient_data: 2, no_data: 3 };
const rows = [...panel].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || (a.faultRateUpperBound ?? 2) - (b.faultRateUpperBound ?? 2)).map((p) => {
  const was = prevBy.get(p.endpoint);
  const delta = was && was.faultRateUpperBound != null && p.faultRateUpperBound != null ? p.faultRateUpperBound - was.faultRateUpperBound : null;
  const change = delta == null ? (was ? '—' : 'new') : `${delta > 0 ? '+' : delta < 0 ? '−' : '±'}${(Math.abs(delta) * 100).toFixed(1)} pts`;
  return `<tr><td class="ep"><a href="/p/?endpoint=${encodeURIComponent(p.endpoint)}">${esc(host(p.endpoint))}</a></td><td>${esc(p.chain === 'eip155:8453' ? 'base' : p.chain || '—')}</td><td class="st st-${esc(p.status)}">${esc(p.status)}</td><td class="num">${num(p.n)}</td><td class="num">${num(p.faultsObserved)}</td><td class="num">${pct(p.faultRateUpperBound)}</td><td class="num">${esc(change)}</td></tr>`;
}).join('');

let sections = `
<div class="page-hero"><div class="wrap">
  <span class="eyebrow">Monthly report · ${esc(monthName)}</span>
  <h1>State of x402 delivery</h1>
  <p class="lede">${esc(lead)}</p>
  <p class="figs-note">Generated automatically from the observatory’s API on ${esc(asOf)}. Every figure below is in <a href="data.json">data.json</a>, as read and as signed at that time.${prevMonth ? ` Changes are against the <a href="../${prevMonth}/">${esc(prevMonth)} edition</a>.` : ''}</p>
</div></div>

<section><div class="wrap">
  <div class="sec-head"><div><p class="kicker">The paid panel</p><h2>Fault rate upper bound, endpoint by endpoint</h2></div>
  <div><p>The worst fault rate consistent with what was observed, at 95% confidence. A change can come from the rate moving or from the sample growing; n is shown so the two can be told apart. Published from n = 100, provisional from n = 20.</p></div></div>
  ${table('<th>Endpoint</th><th>Chain</th><th>State</th><th class="num">n</th><th class="num">Faults</th><th class="num">Bound</th><th class="num">vs last edition</th>', rows || '<tr><td colspan="7" class="muted">Nothing measured.</td></tr>')}
</div></section>`;

if (coverage) sections += `
<section class="alt"><div class="wrap">
  <div class="sec-head"><div><p class="kicker">Coverage</p><h2>What is covered, by layer</h2></div><div><p>Only delivery says whether what arrives is correct. Liveness says whether an endpoint still answers and charges, without paying. The catalogue is what the bazaars list.</p></div></div>
  ${table('<th>Layer</th><th class="num">Endpoints</th><th>Detail</th>', `
    <tr><td><strong>Delivery</strong></td><td class="num">${num(coverage.delivery?.endpoints)}</td><td>${num(coverage.delivery?.publishable)} publishable</td></tr>
    <tr><td><strong>Liveness</strong></td><td class="num">${num(coverage.liveness?.swept)}</td><td>${num(coverage.liveness?.charges)} still charge, ${num(coverage.liveness?.unreachable)} unreachable, ${num(coverage.liveness?.gone)} gone</td></tr>
    <tr><td><strong>Catalogue</strong></td><td class="num">${num(coverage.catalogue?.active)}</td><td>${num(coverage.catalogue?.bazaarOnly)} bazaar only, ${num(coverage.catalogue?.bazaarAndSelfPublished)} both, ${num(coverage.catalogue?.selfPublishedOnly)} self-published only</td></tr>`)}
</div></section>`;

const b = market?.chains?.['eip155:8453'];
if (b) sections += `
<section><div class="wrap">
  <div class="sec-head"><div><p class="kicker">Market</p><h2>Base, last ${esc(market.windowDays)} days</h2></div><div><p>Transaction counts and money give opposite pictures: a few outsized payers make most of the transactions.</p></div></div>
  ${table('<th></th><th class="num">Payers</th><th class="num">Payments</th><th class="num">Settled USDC</th>', `
    <tr><td>Everything on chain</td><td class="num">${num(b.headline?.payers)}</td><td class="num">${num(b.headline?.payments)}</td><td class="num">${num(b.headline?.settled)}</td></tr>
    <tr><td>Outsized payers</td><td class="num">${num(b.outsized?.payers)}</td><td class="num">${num(b.outsized?.payments)} (${esc(b.outsized?.sharePct)}%)</td><td class="num">—</td></tr>
    <tr><td><strong>Everyone else</strong></td><td class="num">${num(b.market?.payers)}</td><td class="num">${num(b.market?.payments)}</td><td class="num"><strong>${num(b.market?.settled)}</strong></td></tr>`)}
</div></section>`;

if (health) {
  const failing = (health.checks ?? []).filter((c) => c.failing);
  sections += `
<section class="alt"><div class="wrap">
  <div class="sec-head"><div><p class="kicker">Instrument</p><h2>Was the observatory working</h2></div>
  <div><p>${failing.length ? `${failing.length} of ${(health.checks ?? []).length} self-checks were failing when this edition was generated: ${failing.map((c) => `<code>${esc(c.id)}</code>`).join(', ')}. Figures that depend on them may be stale.` : `All ${(health.checks ?? []).length} self-checks were passing when this edition was generated.`}</p></div></div>
</div></section>`;
}

sections += `
<section><div class="wrap">
  <p class="muted">Method, raw data and every correction: <a href="https://github.com/arturete58-sys/x402-observatory" target="_blank" rel="noopener">x402-observatory on GitHub</a>. Any provider named here may reply; replies are published unedited next to its data. Follow new editions with <a href="/feed.xml">RSS</a>.</p>
</div></section>`;

const dir = path.join(reportsDir, month);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify(data, null, 1));
fs.writeFileSync(path.join(dir, 'index.html'), page(`State of x402 delivery · ${monthName} · 402Scope`, lead, `/reports/${month}/`, sections));

// ---- Index and feed ---------------------------------------------------------
const all = fs.readdirSync(reportsDir).filter((d) => /^\d{4}-\d{2}$/.test(d) && fs.existsSync(path.join(reportsDir, d, 'data.json'))).sort().reverse();
const meta = all.map((d) => {
  const j = JSON.parse(fs.readFileSync(path.join(reportsDir, d, 'data.json'), 'utf8'));
  const p = j.panel ?? [];
  const c = (s) => p.filter((x) => x.status === s).length;
  const name = new Date(`${d}-01T00:00:00Z`).toLocaleDateString('en', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return { d, name, at: j.generatedAt, summary: `${p.length} endpoints in the paid panel: ${c('published')} published, ${c('provisional')} provisional, ${c('insufficient_data')} still measuring.` };
});
fs.writeFileSync(path.join(reportsDir, 'index.html'), page('Monthly reports · 402Scope', 'State of x402 delivery, every month, generated from the observatory’s signed data.', '/reports/', `
<div class="page-hero"><div class="wrap">
  <span class="eyebrow">Monthly reports</span>
  <h1>State of x402 delivery</h1>
  <p class="lede">One edition a month, generated from the observatory’s signed data, with the data behind every figure. Follow with <a href="/feed.xml">RSS</a>.</p>
</div></div>
<section><div class="wrap">
  ${table('<th>Edition</th><th>Generated</th><th>Summary</th>', meta.map((m) => `<tr><td><a href="${m.d}/">${esc(m.name)}</a></td><td class="mono">${esc(m.at.slice(0, 10))}</td><td>${esc(m.summary)}</td></tr>`).join(''))}
</div></section>`));

const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>402Scope · State of x402 delivery</title>
<link>${SITE}/reports/</link>
<atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml"/>
<description>Monthly report from the independent x402 observatory: paid measurements, fault rate bounds and coverage.</description>
<language>en</language>
<lastBuildDate>${now.toUTCString()}</lastBuildDate>
${meta.slice(0, 12).map((m) => `<item>
<title>State of x402 delivery · ${esc(m.name)}</title>
<link>${SITE}/reports/${m.d}/</link>
<guid isPermaLink="true">${SITE}/reports/${m.d}/</guid>
<pubDate>${new Date(m.at).toUTCString()}</pubDate>
<description>${esc(m.summary)}</description>
</item>`).join('\n')}
</channel>
</rss>
`;
fs.writeFileSync(path.join(OUT, 'feed.xml'), rss);
console.log(`Edition ${month} written to ${dir}; ${meta.length} edition(s) in the index and feed.`);
