// Theme toggle and shared helpers for every page.
'use strict';
(() => {
  const btn = document.getElementById('themeBtn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('theme', root.dataset.theme); } catch (e) { /* private mode */ }
  });
})();

// Copy buttons: <button data-copy="#id">. Falls back to selecting the text.
document.addEventListener('click', async (ev) => {
  const b = ev.target.closest('[data-copy]');
  if (!b) return;
  const el = document.querySelector(b.dataset.copy);
  if (!el) return;
  const text = el.value ?? el.textContent;
  try { await navigator.clipboard.writeText(text); b.textContent = 'Copied'; setTimeout(() => { b.textContent = 'Copy'; }, 1500); }
  catch (e) { const r = document.createRange(); r.selectNodeContents(el); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }
});
