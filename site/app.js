// 402Scope front page. Reads the observatory's own API on this origin.
// Each section loads on its own: a slow query must not leave the rest blank.
'use strict';

const pct = (v) => (v == null ? '—' : (v * 100).toFixed(1) + '%');
const num = (n) => (n == null ? '—' : Number(n).toLocaleString('en'));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const $ = (id) => document.getElementById(id);
const table = (head, body) => `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;

async function get(u) {
  const r = await fetch(u, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`${u} → ${r.status}`);
  return r.json();
}
async function post(u, body) {
  const r = await fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${u} → ${r.status}`);
  return r.json();
}

// ---- Panel and headline figures ---------------------------------------
async function loadPanel() {
  let eps;
  try {
    eps = await get('/v1/endpoints');
  } catch (e) {
    $('panel').innerHTML = '<p class="err">The API is not responding. This page reads from it live, so there is nothing to show rather than something stale.</p>';
    $('figs-note').textContent = 'The API is not responding right now; figures will appear when it is back.';
    return;
  }
  const list = eps.endpoints ?? [];
  let byEp = new Map();
  try {
    const batch = await post('/v1/providers', { endpoints: list.map((e) => e.endpoint).slice(0, 50) });
    byEp = new Map((batch.results ?? []).map((r) => [r.endpoint, r]));
  } catch (e) { /* the panel still renders without aggregates */ }

  const states = {};
  let measured = 0;
  for (const r of byEp.values()) {
    states[r.status] = (states[r.status] || 0) + 1;
    if (r.n) measured += r.n;
  }
  $('figs').innerHTML = `
    <div class="fig">${num(eps.count ?? list.length)}<small>endpoints bought</small></div>
    <div class="fig">${num(measured)}<small>observations in window</small></div>
    <div class="fig">${num(states.published || 0)}<small>publishable</small></div>
    <div class="fig">4<small>chains indexed</small></div>`;
  $('figs-note').textContent = 'Read live from this site’s own API. If it disagrees with the reports, the reports are wrong.';

  const rows = list.map((e) => {
    const a = byEp.get(e.endpoint) || {};
    const st = a.status || 'no_data';
    return `<tr>
      <td class="ep">${esc(String(e.endpoint).replace(/^https?:\/\//, ''))}</td>
      <td>${esc(e.chain === 'eip155:8453' ? 'base' : e.chain || '—')}</td>
      <td class="st st-${esc(st)}">${esc(st)}</td>
      <td class="num">${a.n == null ? '—' : num(a.n)}</td>
      <td class="num">${a.faultsObserved == null ? '—' : num(a.faultsObserved)}</td>
      <td class="num">${pct(a.faultRateUpperBound)}</td>
      <td>${esc(e.relationship || '—')}</td>
    </tr>`;
  }).join('');
  $('panel').innerHTML = table(
    '<th>Endpoint</th><th>Chain</th><th>State</th><th class="num">n</th><th class="num">Faults</th><th class="num">Bound</th><th>Relationship</th>',
    rows || '<tr><td colspan="7" class="muted">Nothing measured yet.</td></tr>',
  ) + '<p class="muted">The bound is an upper limit, not an estimate. A high bound on a small sample means uncertainty, not a bad provider.</p>';
}

// ---- Market ---------------------------------------------------------------
async function loadMarket() {
  try {
    const m = await get('/v1/market');
    const b = m.chains['eip155:8453'];
    $('market').innerHTML = table(
      `<th>Base, ${esc(m.windowDays)} days</th><th class="num">Payers</th><th class="num">Payments</th><th class="num">Settled USDC</th>`,
      `<tr><td>Everything on chain</td><td class="num">${num(b.headline.payers)}</td><td class="num">${num(b.headline.payments)}</td><td class="num">${num(b.headline.settled)}</td></tr>
       <tr><td>${num(b.outsized.payers)} outsized payers</td><td class="num">${num(b.outsized.payers)}</td><td class="num">${num(b.outsized.payments)} <small>(${esc(b.outsized.sharePct)}%)</small></td><td class="num">—</td></tr>
       <tr><td><strong>Everyone else</strong></td><td class="num">${num(b.market.payers)}</td><td class="num">${num(b.market.payments)}</td><td class="num"><strong>${num(b.market.settled)}</strong></td></tr>`,
    ) + `<p class="muted">Two addresses make most of the transactions and move a small share of the value. No market size is published for XRPL: there, 109 addresses made between 1,879 and 1,898 payments on the same day, which is distribution rather than demand.</p>`;
  } catch (e) {
    $('market').innerHTML = '<p class="err">Market data unavailable right now.</p>';
    return;
  }
  try {
    const inf = await get('/v1/infrastructure');
    const p = inf.providers.slice(0, 3).map((x) => `${esc(String(x.asName).replace(/-AS.*|NET$/, ''))} ${esc(x.hostSharePct)}%`).join(', ');
    $('market').insertAdjacentHTML('beforeend', `<p class="muted">And it runs on very few networks: ${p} — ${esc(inf.top3HostShare)}% of hosts between three of them.</p>`);
  } catch (e) { /* optional line */ }
}

// ---- Coverage -------------------------------------------------------------
async function loadCoverage() {
  try {
    const c = await get('/v1/coverage');
    $('coverage').innerHTML = table(
      '<th>Layer</th><th class="num">Endpoints</th><th>What it tells you</th>',
      `<tr><td><strong>Delivery</strong></td><td class="num">${num(c.delivery.endpoints)}</td><td>Bought and checked against an external reference. ${num(c.delivery.publishable)} publishable.</td></tr>
       <tr><td><strong>Liveness</strong></td><td class="num">${num(c.liveness.swept)}</td><td>${num(c.liveness.charges)} still charge, ${num(c.liveness.unreachable)} unreachable, ${num(c.liveness.gone)} gone. No payment made.</td></tr>
       <tr><td><strong>Catalogue</strong></td><td class="num">${num(c.catalogue.active)}</td><td>${num(c.catalogue.bazaarOnly)} bazaar only, ${num(c.catalogue.bazaarAndSelfPublished)} both, ${num(c.catalogue.selfPublishedOnly)} self-published only.</td></tr>`,
    ) + '<p class="muted">The bazaars catalogue what one facilitator settles. 87% of catalogued resources publish no discovery of their own.</p>';
  } catch (e) {
    $('coverage').innerHTML = '<p class="err">Coverage unavailable right now.</p>';
  }
}

// ---- Health ---------------------------------------------------------------
async function loadHealth() {
  try {
    const h = await get('/v1/health');
    const rows = (h.checks ?? []).map((c) => `<tr>
      <td class="st ${c.failing ? 'st-failing' : 'st-published'}">${c.failing ? 'failing' : 'ok'}</td>
      <td class="mono">${esc(c.id)}</td><td class="num">${c.value === null ? '—' : esc(c.value)}</td>
      <td class="muted">${esc(c.note)}</td></tr>`).join('');
    $('health').innerHTML = table('<th>State</th><th>Check</th><th class="num">Value</th><th>What it catches</th>', rows) +
      `<p class="muted">Last run ${Math.round((h.ageSeconds ?? 0) / 3600)} h ago${h.stale ? ' — this is stale, the check itself may have stopped running' : ''}.</p>`;
  } catch (e) {
    $('health').innerHTML = '<p class="err">Health status unavailable, which is itself a signal.</p>';
  }
}

// ---- Endpoint checker -----------------------------------------------------
async function lint(ev) {
  ev?.preventDefault();
  const url = $('lintUrl').value.trim();
  const out = $('lintOut');
  if (!/^https:\/\//.test(url)) { out.innerHTML = '<p class="err">Enter an https URL.</p>'; return; }
  out.innerHTML = '<p class="loading">checking…</p>';
  try {
    const r = await get('/v1/lint?url=' + encodeURIComponent(url));
    if (!r.reachable) { out.innerHTML = `<p class="err">Unreachable: ${esc(r.error)}</p>`; return; }
    const sev = { error: 'st-failing', warning: 'st-provisional', info: 'st-insufficient_data' };
    const rows = (r.problems ?? []).map((p) => `<tr>
      <td class="st ${sev[p.severity] || ''}">${esc(p.severity)}</td>
      <td class="mono">${esc(p.code)}</td>
      <td class="muted">${esc(p.detail)}${p.observedIn ? ` <em>(${esc(p.observedIn)})</em>` : ''}</td></tr>`).join('');
    const summary = r.summary ?? {};
    out.innerHTML = `<p><strong class="${r.conformant ? 'st-published' : 'st-provisional'}">${r.conformant ? 'No errors' : `${num(summary.error)} error(s)`}</strong> — status ${esc(r.status)}, ${num(r.latencyMs)} ms${summary.warning ? `, ${num(summary.warning)} warning(s)` : ''}</p>` +
      (rows ? table('<th>Severity</th><th>Rule</th><th>Detail</th>', rows) : '<p class="muted">Nothing to report.</p>');
  } catch (e) {
    out.innerHTML = `<p class="err">${esc(e.message)}</p>`;
  }
}
$('lintForm').addEventListener('submit', lint);

// ---- Theme toggle -----------------------------------------------------------
$('themeBtn').addEventListener('click', () => {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark';
  try { localStorage.setItem('theme', root.dataset.theme); } catch (e) { /* private mode */ }
});

// ---- Subtle reveal on scroll (skipped with reduced motion) -----------------
if (!matchMedia('(prefers-reduced-motion: reduce)').matches && 'IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.remove('pending'); io.unobserve(e.target); }
  }, { rootMargin: '0px 0px -10% 0px' });
  document.querySelectorAll('section .sec-head, section .grid-3, section .split, section .state-row').forEach((el) => {
    if (el.getBoundingClientRect().top > innerHeight) { el.classList.add('reveal', 'pending'); io.observe(el); }
  });
}

loadPanel();
loadMarket();
loadCoverage();
loadHealth();
