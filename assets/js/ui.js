// Shared UI helpers + icon set + small components. Pages import from here.
import { shortHash, shortAddr, esc } from './format.js';

// ---- icons (stroke, 18px default, currentColor) ----
const I = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
  blocks: '<path d="M12 2 3 7l9 5 9-5-9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
  tx: '<path d="M7 7h11l-3-3"/><path d="M17 17H6l3 3"/>',
  validators: '<path d="M12 2 4 6v6c0 5 3.5 8 8 10 4.5-2 8-5 8-10V6l-8-4Z"/><path d="m9 12 2 2 4-4"/>',
  clob: '<path d="M3 3v18h18"/><rect x="6" y="10" width="3" height="8"/><rect x="11" y="6" width="3" height="12"/><rect x="16" y="13" width="3" height="5"/>',
  privacy: '<path d="M12 2 4 6v6c0 5 3.5 8 8 10 4.5-2 8-5 8-10V6l-8-4Z"/><circle cx="12" cy="11" r="2.4"/><path d="M12 13.4V17"/>',
  verify: '<path d="M9 12.5l2 2 4-4.5"/><path d="M12 2 4 6v6c0 5 3.5 8 8 10 4.5-2 8-5 8-10V6l-8-4Z"/>',
  token: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9 9.5h4.5a2 2 0 0 1 0 4H9"/>',
  account: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6"/>',
  gas: '<rect x="4" y="3" width="9" height="18" rx="2"/><path d="M13 8h3l2 2v6a2 2 0 0 1-4 0V9"/>',
  coins: '<ellipse cx="9" cy="6" rx="6" ry="3"/><path d="M3 6v6c0 1.7 2.7 3 6 3s6-1.3 6-3"/><path d="M15 12v6c0 1.7-2.7 3-6 3s-6-1.3-6-3"/>',
  network: '<circle cx="12" cy="5" r="2.5"/><circle cx="5" cy="19" r="2.5"/><circle cx="19" cy="19" r="2.5"/><path d="M12 7.5 6 16.5M12 7.5l6 9"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  check: '<path d="m5 12 4 4 10-10"/>',
  ext: '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  shield: '<path d="M12 2 4 6v6c0 5 3.5 8 8 10 4.5-2 8-5 8-10V6l-8-4Z"/>',
  proof: '<path d="M9 3h6l4 4v14H5V3Z"/><path d="m9 14 2 2 4-4"/>',
  tree: '<circle cx="12" cy="4" r="2"/><circle cx="6" cy="20" r="2"/><circle cx="18" cy="20" r="2"/><path d="M12 6v6M12 12 6 18M12 12l6 6"/>',
  pulse: '<path d="M3 12h4l2-6 4 12 2-6h6"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/>',
  moon: '<path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.5 6.5 0 0 0 9.8 9.8Z"/>',
  wallet: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M16 14h2"/>',
};
export function icon(name, size = 18, cls = '') {
  return `<svg class="ico ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${I[name] || I.blocks}</svg>`;
}

// brand 5-bar M logo (binary 11111 = 31 = 2^5-1)
export function logoSvg(size = 30) {
  const bars = [[8, 68], [25, 30], [42, 46], [59, 30], [76, 68]];
  const rects = bars.map(([x, h]) => `<rect x="${x}" y="14" width="12" height="${h}" rx="6"/>`).join('');
  return `<svg width="${size}" height="${size}" viewBox="0 0 96 96"><g fill="var(--accent)">${rects}</g></svg>`;
}

// deterministic identicon (data-uri) from an address — 5x5 mirrored, brand-green hue
export function avatar(addr, size = 20) {
  const a = (addr || '0x0').toLowerCase().replace('0x', '');
  let h = 0; for (let i = 0; i < a.length; i++) h = (h * 31 + a.charCodeAt(i)) >>> 0;
  const hue = 120 + (h % 80) - 30; // greens/teals
  const fg = `hsl(${hue} 70% 60%)`;
  let cells = '';
  for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) {
    if (((h >> (y * 3 + x)) & 1)) {
      cells += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
      if (x < 2) cells += `<rect x="${4 - x}" y="${y}" width="1" height="1"/>`;
    }
  }
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 5 5'><rect width='5' height='5' fill='#0a0d0b'/><g fill='${fg}'>${cells}</g></svg>`;
  return `<img class="avatar" width="${size}" height="${size}" src="data:image/svg+xml,${encodeURIComponent(svg)}" alt=""/>`;
}

// copy-to-clipboard button (delegated handler in app.js reads data-copy)
export function copyBtn(text) {
  return `<span class="copy" data-copy="${esc(text)}" title="Copy">${icon('copy', 13)}</span>`;
}

export function hashLink(hash, type = 'tx', { short = true, lead = 10, tail = 8 } = {}) {
  const disp = short ? shortHash(hash, lead, tail) : hash;
  return `<a class="hash link" href="#/${type}/${esc(hash)}">${esc(disp)}</a>`;
}
export function addrLink(addr, { withAvatar = true, short = true } = {}) {
  const disp = short ? shortAddr(addr) : addr;
  return `${withAvatar ? avatar(addr) : ''}<a class="hash link" href="#/address/${esc(addr)}">${esc(disp)}</a>`;
}

export function skeletonRows(n = 6, cols = 4) {
  let r = '';
  for (let i = 0; i < n; i++) {
    let c = ''; for (let j = 0; j < cols; j++) c += `<td><div class="sk line ${j === cols - 1 ? 'short' : ''}"></div></td>`;
    r += `<tr>${c}</tr>`;
  }
  return r;
}
export function emptyState(label, hint = '', ic = 'search') {
  return `<div class="empty"><div class="ico">${icon(ic, 30)}</div><div>${esc(label)}</div>${hint ? `<div style="font-size:var(--fs-sm);margin-top:4px">${esc(hint)}</div>` : ''}</div>`;
}

// tiny SVG sparkline from number[]
export function sparkline(data, { w = 120, h = 30, color = 'var(--accent)' } = {}) {
  if (!data || data.length < 2) return '';
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * (h - 4) - 2}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" width="100%" height="${h}">
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.6"/></svg>`;
}

export function toast(msg) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t);
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--bg-elev);color:var(--text);border:1px solid var(--accent);padding:9px 16px;border-radius:var(--radius-pill);font-size:13px;z-index:200;opacity:0;transition:opacity .2s;box-shadow:var(--shadow)'; }
  t.textContent = msg; t.style.opacity = '1';
  clearTimeout(t._h); t._h = setTimeout(() => { t.style.opacity = '0'; }, 1600);
}

// set page content with enter animation
export function render(html) {
  const root = document.getElementById('view');
  root.innerHTML = `<div class="page-enter">${html}</div>`;
  return root.firstElementChild;
}
