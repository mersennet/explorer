// Hash router. Routes map a pattern (with :params) to a lazy page module under
// ./pages/. Each page module default-exports async (params) => (cleanupFn|void).
// The router runs the previous page's cleanup before rendering the next.

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

function parseHash() {
  let h = location.hash.replace(/^#\/?/, '');
  h = h.split('?')[0];
  return decodeURIComponent(h);
}

async function dispatch() {
  const path = parseHash();
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

export function startRouter() {
  window.addEventListener('hashchange', dispatch);
  dispatch();
}
export function navigate(path) {
  location.hash = '#/' + path.replace(/^#?\/?/, '');
}
