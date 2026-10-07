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
