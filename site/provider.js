// Provider record: /p/?endpoint=<url>. Reads /v1/provider and /v1/history.
'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const num = (n) => (n == null ? '—' : Number(n).toLocaleString('en'));
  const pct = (v) => (v == null ? '—' : (v * 100).toFixed(1) + '%');
  const ago = (sec) => (sec == null ? '—' : sec < 3600 ? `${Math.max(1, Math.round(sec / 60))} min ago` : sec < 172800 ? `${Math.round(sec / 3600)} h ago` : `${Math.round(sec / 86400)} days ago`);
  const day = (iso) => new Date(iso).toLocaleDateString('en', { month: 'short', day: 'numeric' });
  const get = async (u) => { const r = await fetch(u, { headers: { accept: 'application/json' } }); if (!r.ok) throw new Error(`${r.status}`); return r.json(); };
  const table = (head, body) => `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;

  const endpoint = new URLSearchParams(location.search).get('endpoint');
  if (!endpoint || !/^https?:\/\/\S+$/.test(endpoint)) {
    $('pTitle').textContent = 'No endpoint given';
    $('pLede').innerHTML = 'Open this page as <code>/p/?endpoint=https://…</code>, or pick an endpoint from <a href="/#panel-sec">the paid panel</a>.';
    ['series', 'details', 'badge-sec'].forEach((id) => { $(id).hidden = true; });
    return;
  }
  const e = encodeURIComponent(endpoint);
  const host = endpoint.replace(/^https?:\/\//, '');
  document.title = `${host} · 402Scope`;
  $('pTitle').textContent = host;

  const STATE = {
    published: ['st-published', 'Published', 'Enough observations to cite a rate (n ≥ 100).'],
    provisional: ['st-provisional', 'Provisional', 'Enough observations for a policy, not to publish a rate (20 ≤ n < 100).'],
    insufficient_data: ['st-insufficient_data', 'Measuring', 'Fewer than 20 observations so far.'],
    no_data: ['st-insufficient_data', 'Not measured', 'This endpoint is not in the paid panel.'],
  };

  get(`/v1/provider?endpoint=${e}`).then((p) => {
    const [cls, label, text] = STATE[p.status] || STATE.no_data;
    $('pLede').innerHTML = `<span class="st ${cls}">${label}</span> · ${esc(text)}`;
    if (p.status === 'no_data') {
      $('pFigs').innerHTML = '';
      $('pNote').innerHTML = 'Want it measured? Write to hello@402scope.org. Measurement is never paid for by the provider.';
      $('series').hidden = true;
    } else {
      $('pFigs').innerHTML = `
        <div class="fig">${pct(p.faultRateUpperBound)}<small>fault rate upper bound</small></div>
        <div class="fig">${num(p.n)}<small>observations (n)</small></div>
        <div class="fig">${num(p.faultsObserved)}<small>faults observed</small></div>
        <div class="fig">${p.minSample != null ? num(p.minSample) : '100'}<small>needed to publish</small></div>`;
      $('pNote').textContent = `Last aggregate ${ago(p.ageSeconds)}. The bound is an upper limit at 95% confidence, not an estimate of the provider’s rate.`;
    }
    const lv = p.liveness;
    $('liveness').innerHTML = lv ? `<ul class="list-plain" style="margin-top:14px">
        <li><strong>${esc(lv.outcome)}</strong>${lv.statusCode ? ` · HTTP ${esc(lv.statusCode)}` : ''}${lv.latencyMs != null ? ` · ${num(lv.latencyMs)} ms` : ''}</li>
        <li>Checked ${ago(lv.ageSeconds)}, without paying.</li>
        <li class="muted">${esc(lv.note || 'Whether the endpoint answers and what it declares. Says nothing about the quality of what it delivers.')}</li></ul>`
      : '<p class="muted" style="margin-top:14px">No liveness check recorded yet.</p>';
    $('sig').innerHTML = p.sig ? `<ul class="list-plain" style="margin-top:14px">
        <li>Attestor <code>${esc(String(p.attestor).slice(0, 24))}${String(p.attestor).length > 24 ? '…' : ''}</code></li>
        <li>Aggregate hash <code>${esc(String(p.attestationSetHash).slice(0, 16))}…</code></li>
        <li>Verify the signature with <code>POST /v1/verify</code>, or offline with the public key in <a href="https://github.com/arturete58-sys/x402-observatory" target="_blank" rel="noopener">the observatory repository</a>.</li>
        <li><a href="/v1/provider?endpoint=${e}">Raw aggregate (JSON)</a> · <a href="/v1/history?endpoint=${e}&amp;days=90">Raw series (JSON)</a></li></ul>`
      : '<p class="muted" style="margin-top:14px">No signed aggregate for this endpoint yet.</p>';
  }).catch(() => {
    $('pLede').textContent = 'The observatory API is not responding right now. Try again in a minute.';
  });

  $('pBadge').innerHTML = `<a href="/badges/?endpoint=${e}"><img src="/badge.svg?endpoint=${e}" alt="402Scope measurement badge" height="20"></a> <a href="/badges/?endpoint=${e}" style="margin-left:10px">Get the snippet</a>`;

  // ---- Series chart: one line, one axis, hover tooltip, table view ---------
  get(`/v1/history?endpoint=${e}&days=90`).then((h) => {
    const pts = (h.series || []).filter((x) => x.faultRateUpperBound != null).map((x) => ({ ...x, t: Date.parse(x.observedAt) }));
    if (pts.length < 2) { $('chart').innerHTML = '<p class="muted">Not enough aggregates yet to draw a series.</p>'; return; }
    drawChart(pts, h.rulesetChanges || []);
    $('seriesTable').innerHTML = table('<th>Date</th><th class="num">Bound</th><th class="num">n</th><th class="num">Faults</th><th>Publishable</th>',
      [...pts].reverse().map((x) => `<tr><td>${day(x.observedAt)}</td><td class="num">${pct(x.faultRateUpperBound)}</td><td class="num">${num(x.n)}</td><td class="num">${num(x.faultsObserved)}</td><td>${x.publishable ? 'yes' : 'no'}</td></tr>`).join(''));
  }).catch(() => { $('chart').innerHTML = '<p class="muted">The series is not available right now.</p>'; });

  function drawChart(pts, changes) {
    const W = 1000, H = 320, L = 56, R = 16, T = 16, B = 36;
    const t0 = pts[0].t, t1 = pts.at(-1).t;
    const maxV = Math.max(...pts.map((p) => p.faultRateUpperBound));
    const top = Math.min(1, Math.max(0.1, Math.ceil(maxV * 10 + 0.5) / 10));
    const X = (t) => L + ((t - t0) / Math.max(1, t1 - t0)) * (W - L - R);
    const Y = (v) => T + (1 - v / top) * (H - T - B);
    const steps = top <= 0.2 ? 0.05 : top <= 0.5 ? 0.1 : 0.2;
    const yTicks = []; for (let v = 0; v <= top + 1e-9; v += steps) yTicks.push(+v.toFixed(2));
    const xTicks = Array.from({ length: 5 }, (_, i) => t0 + ((t1 - t0) * i) / 4);
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)} ${Y(p.faultRateUpperBound).toFixed(1)}`).join('');
    const marks = changes.map((c) => Date.parse(c.changedAt)).filter((t) => t >= t0 && t <= t1);
    $('chart').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Fault rate upper bound over the last ${pts.length} aggregates" class="chart">
      <g class="grid">${yTicks.map((v) => `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/>`).join('')}</g>
      <g class="axis-text">${yTicks.map((v) => `<text x="${L - 10}" y="${Y(v) + 4}" text-anchor="end">${Math.round(v * 100)}%</text>`).join('')}
        ${xTicks.map((t) => `<text x="${X(t)}" y="${H - 10}" text-anchor="middle">${day(t)}</text>`).join('')}</g>
      <g class="rule-marks">${marks.map((t) => `<line x1="${X(t)}" x2="${X(t)}" y1="${T}" y2="${H - B}"/><text x="${X(t) + 6}" y="${T + 12}">rule change</text>`).join('')}</g>
      <path class="series" d="${line}"/>
      <line class="crosshair" id="cx" y1="${T}" y2="${H - B}" hidden/>
      <circle class="hover-dot" id="cd" r="5" hidden/>
      <rect id="hit" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent"/>
    </svg><div class="tip" id="tip" hidden></div>`;
    const svg = $('chart').querySelector('svg');
    const hit = $('hit'), cx = $('cx'), cd = $('cd'), tip = $('tip');
    const move = (clientX) => {
      const r = svg.getBoundingClientRect();
      const x = ((clientX - r.left) / r.width) * W;
      let best = pts[0];
      for (const p of pts) if (Math.abs(X(p.t) - x) < Math.abs(X(best.t) - x)) best = p;
      const px = X(best.t), py = Y(best.faultRateUpperBound);
      cx.setAttribute('x1', px); cx.setAttribute('x2', px); cx.hidden = false;
      cd.setAttribute('cx', px); cd.setAttribute('cy', py); cd.hidden = false;
      tip.innerHTML = `<strong>${day(best.observedAt)}</strong><br>Bound ${pct(best.faultRateUpperBound)}<br>n = ${num(best.n)} · faults ${num(best.faultsObserved)}<br>${best.publishable ? 'publishable' : 'not yet publishable'}`;
      tip.hidden = false;
      const left = (px / W) * r.width;
      tip.style.left = `${Math.min(r.width - 170, Math.max(0, left + 12))}px`;
      tip.style.top = `${(py / H) * r.height - 10}px`;
    };
    hit.addEventListener('pointermove', (ev) => move(ev.clientX));
    hit.addEventListener('pointerleave', () => { cx.hidden = cd.hidden = tip.hidden = true; });
  }
})();
