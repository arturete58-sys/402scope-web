// Badge generator: builds the badge URL and the snippets for an endpoint.
'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const origin = 'https://402scope.org';
  function make(url) {
    const e = encodeURIComponent(url);
    const img = `${origin}/badge.svg?endpoint=${e}`;
    const page = `${origin}/p/?endpoint=${e}`;
    $('badgeImg').src = `/badge.svg?endpoint=${e}`;
    $('badgePage').href = `/p/?endpoint=${e}`;
    $('snipMd').textContent = `[![402Scope measurement](${img})](${page})`;
    $('snipHtml').textContent = `<a href="${page}"><img src="${img}" alt="402Scope measurement" height="20"></a>`;
    $('snipJson').textContent = `${origin}/badge.json?endpoint=${e}`;
    $('badgeOut').hidden = false;
  }
  $('badgeForm').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const url = $('badgeUrl').value.trim();
    if (!/^https?:\/\/\S+$/.test(url)) { $('badgeUrl').focus(); return; }
    history.replaceState(null, '', `?endpoint=${encodeURIComponent(url)}`);
    make(url);
  });
  const pre = new URLSearchParams(location.search).get('endpoint');
  if (pre) { $('badgeUrl').value = pre; make(pre); }
})();

// Claim an endpoint: GET /v1/claim gives the message, POST /v1/claim checks the signature
// (SEP-53 for Stellar addresses, EIP-191 for EVM ones).
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  if (!$('claimStart')) return;
  let claim = null;
  const why = {
    endpoint_not_observed: 'The observatory has not seen this endpoint return a 402 challenge yet, so there is no declared payTo to check against.',
    address_not_declared: 'That address is not among the payTo addresses this endpoint declares in its 402 challenge.',
    signature_does_not_verify: 'The signature does not match the message and address. Sign the exact message shown, with the payTo key.',
    date_out_of_range: 'The message is more than seven days old. Get a fresh one.',
    bad_signature_format: 'The signature is not in a format we can read: a SEP-53 signature is 64 bytes, in base64 or hex.',
    callback_must_be_https: 'The alert callback must be an https URL.',
  };
  $('claimStart').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const url = $('claimUrl').value.trim();
    if (!/^https?:\/\/\S+$/.test(url)) { $('claimUrl').focus(); return; }
    try {
      const r = await fetch(`/v1/claim?endpoint=${encodeURIComponent(url)}`, { headers: { accept: 'application/json' } });
      const j = await r.json();
      claim = { endpoint: url, message: j.messageToSign, date: String(j.messageToSign).split('\n').at(-1) };
      $('claimMsg').textContent = claim.message;
      $('claimStep2').hidden = false;
      $('claimOut').innerHTML = '';
    } catch { $('claimOut').innerHTML = '<p class="err">The observatory API is not responding right now.</p>'; $('claimStep2').hidden = false; }
  });
  $('claimSend').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!claim) return;
    const body = { endpoint: claim.endpoint, address: $('claimAddr').value.trim(), signature: $('claimSig').value.trim(), date: claim.date };
    const cb = $('claimCb').value.trim();
    if (cb) body.callbackUrl = cb;
    $('claimOut').innerHTML = '<p class="loading">checking…</p>';
    try {
      const r = await fetch('/v1/claim', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json();
      $('claimOut').innerHTML = j.ok
        ? `<div class="decision decision-sell"><div class="decision-head"><span class="decision-label">Claimed</span></div><ul><li>Signature verified${j.scheme ? ` (${esc(j.scheme)})` : ''} for <code>${esc(j.address)}</code>.</li><li>${esc(j.note || 'This does not change how the endpoint is measured.')}</li></ul></div>`
        : `<p class="err">${esc(why[j.code] || j.note || j.code || 'The claim was not accepted.')}</p>`;
    } catch { $('claimOut').innerHTML = '<p class="err">The observatory API is not responding right now.</p>'; }
  });
})();
