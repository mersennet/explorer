// Path router (History API). Routes map a pattern (with :params) to a lazy page
// module under ./pages/. Each page module default-exports async (params) =>
// (cleanupFn|void). The router runs the previous page's cleanup before
// rendering the next. Legacy "#/x" URLs are redirected to clean "/x" paths.

const ROUTES = [
  { p: '', mod: 'home' },
  { p: 'blocks', mod: 'blocks' },
  { p: 'block/:id', mod: 'block' },
  { p: 'txs', mod: 'txs' },
  { p: 'tx/:hash', mod: 'tx' },
  { p: 'address/:addr', mod: 'address' },
  { p: 'accounts', mod: 'accounts' },
  { p: 'validators', mod: 'validators' },
  { p: 'clob', mod: 'clob' },
  { p: 'clob/:market', mod: 'clob' },
  { p: 'privacy', mod: 'privacy' },
  { p: 'verify', mod: 'verify' },
  { p: 'verify/:block', mod: 'verify' },
  { p: 'tokenomics', mod: 'tokenomics' },
  { p: 'network', mod: 'network' },
  { p: 'search/:q', mod: 'search' },
];

function compile(pattern) {
  const keys = [];
  const rx = new RegExp('^' + pattern.replace(/:[^/]+/g, (m) => { keys.push(m.slice(1)); return '([^/]+)'; }) + '$');
  return { rx, keys };
}
const COMPILED = ROUTES.map((r) => ({ ...r, ...compile(r.p) }));

let _cleanup = null;
let _token = 0;

function parsePath() {
  let p = location.pathname.replace(/^\/+/, '').replace(/\/+$/, '');
  return decodeURIComponent(p);
}

async function dispatch() {
  const path = parsePath();
  const my = ++_token;
  let matched = null, params = {};
  for (const r of COMPILED) {
    const m = path.match(r.rx);
    if (m) { matched = r; r.keys.forEach((k, i) => (params[k] = m[i + 1])); break; }
  }
  // run prior cleanup
  try { if (typeof _cleanup === 'function') _cleanup(); } catch {}
  _cleanup = null;
  // nav highlight
  document.querySelectorAll('.nav-item').forEach((n) => {
    n.classList.toggle('active', n.dataset.route === (matched ? matched.mod : ''));
  });
  window.scrollTo(0, 0);
  const root = document.getElementById('view');
  if (!matched) { root.innerHTML = ''; const m = await import('./pages/notfound.js').catch(() => null);
    if (m) m.default(); else root.innerHTML = '<div class="empty">Page not found</div>'; return; }
  try {
    const mod = await import(`./pages/${matched.mod}.js`);
    if (my !== _token) return; // a newer navigation superseded this one
    const cleanup = await mod.default(params);
    if (my === _token && typeof cleanup === 'function') _cleanup = cleanup;
  } catch (e) {
    if (my !== _token) return;
    root.innerHTML = `<div class="empty"><div>Failed to load this page.</div><div style="font-size:12px;margin-top:6px;color:var(--text-3)">${(e && e.message) || e}</div></div>`;
    console.error('[router]', matched.mod, e);
  }
}

// Intercept same-origin link clicks so navigation stays client-side (no full
// page reload). External links, downloads, new-tab clicks pass through.
function onLinkClick(e) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest('a');
  if (!a || a.target === '_blank' || a.hasAttribute('download') || a.getAttribute('rel') === 'external') return;
  const href = a.getAttribute('href') || '';
  // Legacy hash links ("#/x") — normalize to a clean path.
  if (href.startsWith('#/')) {
    e.preventDefault();
    history.pushState(null, '', href.slice(1) || '/');
    dispatch();
    return;
  }
  if (!href.startsWith('/')) return; // external / protocol links
  if (a.origin && a.origin !== location.origin) return;
  e.preventDefault();
  if (a.pathname + a.search !== location.pathname + location.search) {
    history.pushState(null, '', a.pathname + a.search);
  }
  dispatch();
}

export function startRouter() {
  // Back-compat: redirect "#/block/5" style URLs to "/block/5".
  if (location.hash.startsWith('#/')) {
    history.replaceState(null, '', location.hash.slice(1) || '/');
  }
  window.addEventListener('popstate', dispatch);
  document.addEventListener('click', onLinkClick);
  dispatch();
}

export function navigate(path) {
  const clean = '/' + String(path || '').replace(/^#?\/?/, '');
  if (clean !== location.pathname + location.search) history.pushState(null, '', clean);
  dispatch();
}
