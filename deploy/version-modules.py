#!/usr/bin/env python3
"""Stamp a deploy version onto every module URL of a staged explorer build.

    version-modules.py <stage-dir> <sha>

Rewrites, in place under <stage-dir>:
  * static specifiers   from './x.js'            -> from './x.js?v=<sha>'
  * dynamic imports     import('./pages/x.js')   -> import('./pages/x.js?v=<sha>')
                        import(`./pages/${m}.js`) -> import(`./pages/${m}.js?v=<sha>`)
  * index.html          href/src="/assets/..."   -> "/assets/...?v=<sha>"

Every deploy therefore ships a fresh module graph: a browser or CDN either has
the whole new graph or the whole old one, never a mix. (A stale cached ui.js
next to a fresh validators.js blanked the page on 2026-09-18; a syntax error in
a single module did the same on 2026-09-15.) index.html is served no-cache.
"""
import pathlib
import re
import sys

stage, sha = pathlib.Path(sys.argv[1]), sys.argv[2]
spec = re.compile(r"""(from\s+['"])(\.{1,2}/[^'"?]+\.js)(['"])""")
dyn = re.compile(r"""(import\(\s*[`'"])(\.{1,2}/[^'"`?]*\.js)([`'"]\s*\))""")
n = 0
for f in (stage / "assets" / "js").rglob("*.js"):
    src = f.read_text()
    out = spec.sub(lambda m: f"{m.group(1)}{m.group(2)}?v={sha}{m.group(3)}", src)
    out = dyn.sub(lambda m: f"{m.group(1)}{m.group(2)}?v={sha}{m.group(3)}", out)
    if out != src:
        f.write_text(out)
        n += 1
idx = stage / "index.html"
html = idx.read_text()
html = re.sub(r'((?:href|src)="/assets/[^"?]+)"', lambda m: f'{m.group(1)}?v={sha}"', html)
idx.write_text(html)
print(f"    {n} modules versioned with ?v={sha}")
