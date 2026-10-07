// 402Scope front page. Reads the observatory's own API on this origin.
// Each section loads on its own: a slow query must not leave the rest blank.
'use strict';

const pct = (v) => (v == null ? '—' : (v * 100).toFixed(1) + '%');
const num = (n) => (n == null ? '—' : Number(n).toLocaleString('en'));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const $ = (id) => document.getElementById(id);
const ago = (sec) => (sec == null ? '' : sec < 3600 ? `${Math.max(1, Math.round(sec / 60))} min ago` : sec < 172800 ? `${Math.round(sec / 3600)} h ago` : `${Math.round(sec / 86400)} days ago`);
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
      <td class="ep"><a href="/p/?endpoint=${encodeURIComponent(e.endpoint)}">${esc(String(e.endpoint).replace(/^https?:\/\//, ''))}</a></td>
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

// ---- Endpoint checker: a sell / warn / hold decision --------------------
// Seller policy on the fault rate upper bound (the shape agreed with
// settlement partners): hold above hold_max in any state; sell only when the
// figure is published and under warn_max; everything in between is sell and
// warn. The bound is defined in every state, so the policy is too.
let lastCheck = null;
function decide(p, warnMax, holdMax) {
  if (!p || !p.status || p.status === 'no_data') return { key: 'unmeasured', label: 'Not measured yet', why: ['This endpoint is not in the paid panel, so there is no delivery record to decide on.'] };
  const b = typeof p.faultRateUpperBound === 'number' ? p.faultRateUpperBound : null;
  const n = p.n ?? 0;
  const why = [];
  const bound = b == null ? null : (b * 100).toFixed(1) + '%';
  const out = p.liveness?.outcome;
  if (out === 'gone' || out === 'unreachable') return { key: 'hold', label: 'Hold', why: [`The endpoint is ${out} at the last liveness check: there is nothing to sell.`] };
  const state = { published: `Published: ${num(n)} observations, enough to cite a rate.`, provisional: `Provisional: ${num(n)} observations. Enough for a policy, not for a published rate.`, insufficient_data: `Only ${num(n)} observations so far.` }[p.status] || `State: ${p.status}.`;
  if (b != null && b > holdMax) {
    why.push(`The fault rate could be as high as ${bound}, above your hold threshold of ${(holdMax * 100).toFixed(0)}%.`, state);
    return { key: 'hold', label: 'Hold', why };
  }
  if (p.status === 'published' && b != null && b < warnMax) {
    why.push(`The fault rate is at most ${bound}, under your warn threshold of ${(warnMax * 100).toFixed(0)}%.`, state);
    return { key: 'sell', label: 'Sell', why };
  }
  if (b != null && b >= warnMax) why.push(`The fault rate could be up to ${bound}, between your warn (${(warnMax * 100).toFixed(0)}%) and hold (${(holdMax * 100).toFixed(0)}%) thresholds.`);
  else if (b != null) why.push(`The bound is ${bound}, but the sample is not large enough to publish a rate yet.`);
  why.push(state);
  return { key: 'warn', label: 'Sell and warn', why };
}

function renderCheck() {
  if (!lastCheck) return;
  const { url, prov, lint: r, lintError } = lastCheck;
  const warnMax = Math.max(0.01, Math.min(0.99, Number($('warnMax').value) / 100 || 0.15));
  const holdMax = Math.max(warnMax, Math.min(1, Number($('holdMax').value) / 100 || 0.3));
  const d = decide(prov, warnMax, holdMax);
  const extra = [];
  const lv = prov?.liveness;
  if (lv?.outcome) extra.push(`Liveness: ${esc(lv.outcome)}${lv.ageSeconds != null ? `, checked ${ago(lv.ageSeconds)}` : ''}.`);
  if (prov?.ageSeconds != null && d.key !== 'unmeasured') extra.push(`Last aggregate ${ago(prov.ageSeconds)}, signed by the observatory.`);
  if (r && r.reachable) extra.push(r.conformant ? '402 challenge: no errors.' : `402 challenge: ${num(r.summary?.error)} error(s), a client may fail to pay.`);
  else if (r && !r.reachable) extra.push(`The endpoint did not answer: ${esc(r.error)}.`);
  else if (lintError) extra.push('The 402 challenge could not be checked right now.');
  const e = encodeURIComponent(url);
  let html = `<div class="decision decision-${d.key}">
      <div class="decision-head"><span class="decision-label">${d.label}</span><span class="muted mono">${esc(url.replace(/^https?:\/\//, ''))}</span></div>
      <ul>${[...d.why.map(esc), ...extra].map((x) => `<li>${x}</li>`).join('')}</ul>
      <div class="decision-links"><a href="/p/?endpoint=${e}">Full record</a><a href="/badges/?endpoint=${e}">Badge</a>${d.key === 'unmeasured' ? '<a href="mailto:hello@402scope.org?subject=Measure%20this%20endpoint">Ask for it to be measured</a>' : ''}</div>
    </div>`;
  if (r && r.reachable) {
    const sev = { error: 'st-failing', warning: 'st-provisional', info: 'st-insufficient_data' };
    const rows = (r.problems ?? []).map((p) => `<tr>
      <td class="st ${sev[p.severity] || ''}">${esc(p.severity)}</td>
      <td class="mono">${esc(p.code)}</td>
      <td class="muted">${esc(p.detail)}${p.observedIn ? ` <em>(${esc(p.observedIn)})</em>` : ''}</td></tr>`).join('');
    html += `<h3 style="margin-top:28px">402 challenge</h3><p class="muted">Status ${esc(r.status)}, ${num(r.latencyMs)} ms.</p>` +
      (rows ? table('<th>Severity</th><th>Rule</th><th>Detail</th>', rows) : '<p class="muted">Nothing to report.</p>');
  }
  $('lintOut').innerHTML = html;
}

async function lint(ev) {
  ev?.preventDefault();
  const url = $('lintUrl').value.trim();
  const out = $('lintOut');
  if (!/^https:\/\/\S+$/.test(url)) { out.innerHTML = '<p class="err">Enter an https URL.</p>'; return; }
  out.innerHTML = '<p class="loading">checking…</p>';
  const [prov, lintRes] = await Promise.allSettled([
    get('/v1/provider?endpoint=' + encodeURIComponent(url)),
    get('/v1/lint?url=' + encodeURIComponent(url)),
  ]);
  if (prov.status === 'rejected' && lintRes.status === 'rejected') { out.innerHTML = '<p class="err">The observatory API is not responding right now.</p>'; return; }
  lastCheck = { url, prov: prov.status === 'fulfilled' ? prov.value : null, lint: lintRes.status === 'fulfilled' ? lintRes.value : null, lintError: lintRes.status === 'rejected' };
  renderCheck();
}
['warnMax', 'holdMax'].forEach((id) => $(id).addEventListener('input', renderCheck));
$('lintForm').addEventListener('submit', lint);

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
