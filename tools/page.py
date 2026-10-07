#!/usr/bin/env python3
"""Builds subpages (site/<dir>/index.html) from site/index.html's header and footer,
so every page shares the same chrome. Usage: python3 tools/page.py
Each page body lives in tools/pages/<dir>.html with a first line:
<!-- title: ... | description: ... | script: ... -->
"""
import pathlib, re
root = pathlib.Path(__file__).resolve().parent.parent
home = (root / 'site' / 'index.html').read_text()
head = home[:home.index('<main id="top">')]
foot = home[home.index('<footer>'):].replace('<script src="app.js" defer></script>\n', '').replace('<script src="theme.js" defer></script>\n', '')
# Absolute asset paths and links back to the home page sections.
head = (head.replace('href="favicon.svg"', 'href="/favicon.svg"')
            .replace('href="fonts/', 'href="/fonts/')
            .replace('href="styles.css"', 'href="/styles.css"')
            .replace('href="#top"', 'href="/"')
            .replace('<a href="#', '<a href="/#'))
foot = foot.replace('href="#api"', 'href="/#api"')
for src in sorted((root / 'tools' / 'pages').glob('*.html')):
    body = src.read_text()
    meta = dict(re.findall(r'(\w+):\s*([^|]+?)\s*(?:\||-->)', body.splitlines()[0]))
    body = '\n'.join(body.splitlines()[1:])
    page = re.sub(r'<title>.*?</title>', f"<title>{meta['title']}</title>", head)
    page = re.sub(r'<meta name="description" content=".*?">', f'<meta name="description" content="{meta["description"]}">', page)
    page = re.sub(r'<meta property="og:title" content=".*?">', f'<meta property="og:title" content="{meta["title"]}">', page)
    page = re.sub(r'<meta property="og:description" content=".*?">', f'<meta property="og:description" content="{meta["description"]}">', page)
    page = re.sub(r'<meta property="og:url" content=".*?">', f'<meta property="og:url" content="https://402scope.org/{src.stem}/">', page)
    script = f'\n<script src="/{meta["script"]}" defer></script>' if meta.get('script') else ''
    out = page + '<main id="top">\n' + body + '\n</main>\n\n' + foot.replace('</body>', f'{script}\n<script src="/theme.js" defer></script>\n</body>')
    dest = root / 'site' / src.stem / 'index.html'
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(out)
    print('built', dest.relative_to(root))
