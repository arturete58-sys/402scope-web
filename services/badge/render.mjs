// Renders the 402Scope measurement badge as SVG. Pure function, no I/O.
//
// The badge states the measurement, not a recommendation: the upper bound of
// the fault rate (95% Wilson) and the sample it rests on. Colour follows the
// bound only once the figure is publishable; before that it stays neutral.

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Approximate advance widths at 11px; textLength makes the text fit the box exactly
// whatever font the viewer has.
const WIDE = /[mwMW@%]/;
const NARROW = /[ilj.,:;|!'·\s]/;
function textWidth(s) {
  let w = 0;
  for (const ch of String(s)) w += WIDE.test(ch) ? 10.2 : NARROW.test(ch) ? 3.9 : /[A-Z0-9≤=]/.test(ch) ? 7.6 : 6.9;
  return Math.ceil(w);
}

const COLORS = {
  good: '#1f7a4d',
  fair: '#9a6700',
  poor: '#b42318',
  neutral: '#57606a',
  label: '#1f2937',
};

/** Message and colour for one /v1/provider response. */
export function badgeContent(p) {
  if (!p || p.status === 'no_data' || p.status == null) return { message: 'not measured', color: COLORS.neutral };
  const n = p.n ?? 0;
  const b = typeof p.faultRateUpperBound === 'number' ? p.faultRateUpperBound : null;
  const pct = b == null ? null : `${(b * 100).toFixed(1)}%`;
  if (p.status === 'published') {
    const color = b == null ? COLORS.neutral : b < 0.1 ? COLORS.good : b <= 0.3 ? COLORS.fair : COLORS.poor;
    return { message: pct ? `fault ≤ ${pct} · n=${n}` : `n=${n}`, color };
  }
  if (p.status === 'provisional') return { message: pct ? `provisional · fault ≤ ${pct} · n=${n}` : `provisional · n=${n}`, color: COLORS.neutral };
  return { message: `measuring · n=${n}`, color: COLORS.neutral };
}

/** SVG badge: "402Scope | <message>". */
export function renderBadge(p, opts = {}) {
  const label = opts.label ?? '402Scope';
  const { message, color } = opts.error ? { message: 'unavailable', color: COLORS.neutral } : badgeContent(p);
  const pad = 8;
  const lw = textWidth(label) + pad * 2;
  const mw = textWidth(message) + pad * 2;
  const w = lw + mw;
  const title = `${label}: ${message}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${esc(title)}" viewBox="0 0 ${w} 20">
<title>${esc(title)}</title>
<clipPath id="r${w}"><rect width="${w}" height="20" rx="3"/></clipPath>
<g clip-path="url(#r${w})"><rect width="${lw}" height="20" fill="${COLORS.label}"/><rect x="${lw}" width="${mw}" height="20" fill="${color}"/></g>
<g fill="#fff" font-family="Verdana,DejaVu Sans,Geneva,sans-serif" font-size="11" text-rendering="geometricPrecision">
<text x="${lw / 2}" y="14" text-anchor="middle" textLength="${lw - pad * 2}" lengthAdjust="spacingAndGlyphs">${esc(label)}</text>
<text x="${lw + mw / 2}" y="14" text-anchor="middle" textLength="${mw - pad * 2}" lengthAdjust="spacingAndGlyphs">${esc(message)}</text>
</g>
</svg>`;
}
