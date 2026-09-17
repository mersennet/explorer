// Formatting helpers (hex, MRSN, time, numbers, addresses).
import { CONFIG } from './config.js';

export const hexToBig = (h) => {
  if (h === null || h === undefined || h === '') return 0n;
  if (typeof h === 'number') return BigInt(h);
  if (typeof h === 'bigint') return h;
  const s = String(h);
  try { return s.startsWith('0x') ? BigInt(s) : BigInt(s); } catch { return 0n; }
};
export const hexToNum = (h) => { try { return Number(hexToBig(h)); } catch { return 0; } };

/** Chain price → human string for a market with `scale` (decimals = log10(scale)). */
export function fmtPx(chainPrice, scale = 1) {
  const sc = Math.max(1, Number(scale) || 1);
  const v = (typeof chainPrice === 'bigint' ? Number(chainPrice) : Number(chainPrice || 0)) / sc;
  return fmtNum(v, Math.round(Math.log10(sc)));
}

export function fmtNum(n, dp = 0) {
  const v = typeof n === 'bigint' ? Number(n) : Number(n || 0);
  if (!isFinite(v)) return '0';
  return v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

// wei (bigint|hex) -> MRSN string, trimmed
export function fmtMrsn(wei, dp = 4) {
  const w = hexToBig(wei);
  const base = 10n ** BigInt(CONFIG.decimals);
  const whole = w / base;
  const frac = w % base;
  if (frac === 0n) return fmtNum(whole);
  const fracStr = frac.toString().padStart(CONFIG.decimals, '0').slice(0, dp).replace(/0+$/, '');
  return fmtNum(whole) + (fracStr ? '.' + fracStr : '');
}

// generic integer amount (bigint|hex|decimal string) -> decimal string with
// `decimals` places, trimmed to `dp` significant fraction digits. Like fmtMrsn
// but for arbitrary-decimal tokens (USDC=6, DAI=18, …).
export function fmtUnits(value, decimals = 18, dp = 4) {
  const w = hexToBig(value);
  if (decimals <= 0) return fmtNum(w);
  const base = 10n ** BigInt(decimals);
  const whole = w / base;
  const frac = w % base;
  if (frac === 0n) return fmtNum(whole);
  const fracStr = frac.toString().padStart(decimals, '0').slice(0, dp).replace(/0+$/, '');
  return fmtNum(whole) + (fracStr ? '.' + fracStr : '');
}

// large number → compact (1.2M, 3.4K, 1.1B)
export function compact(n) {
  const v = typeof n === 'bigint' ? Number(n) : Number(n || 0);
  if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(2).replace(/\.?0+$/, '') + 'B';
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
  if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1).replace(/\.?0+$/, '') + 'K';
  return fmtNum(v);
}

export function shortHash(h, lead = 8, tail = 6) {
  if (!h) return '';
  const s = String(h);
  if (s.length <= lead + tail + 2) return s;
  return s.slice(0, lead) + '…' + s.slice(-tail);
}
export const shortAddr = (a) => shortHash(a, 6, 4);

export function timeAgo(unixSecs) {
  const t = typeof unixSecs === 'string' && unixSecs.startsWith('0x') ? hexToNum(unixSecs) : Number(unixSecs);
  if (!t) return '—';
  const ms = t > 1e12 ? t : t * 1000;
  let d = Math.max(0, (Date.now() - ms) / 1000);
  if (d < 1) return 'just now';
  if (d < 60) return Math.floor(d) + 's ago';
  if (d < 3600) return Math.floor(d / 60) + 'm ago';
  if (d < 86400) return Math.floor(d / 3600) + 'h ago';
  return Math.floor(d / 86400) + 'd ago';
}
export function fmtTime(unixSecs) {
  const t = typeof unixSecs === 'string' && unixSecs.startsWith('0x') ? hexToNum(unixSecs) : Number(unixSecs);
  if (!t) return '—';
  const ms = t > 1e12 ? t : t * 1000;
  return new Date(ms).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'medium' });
}

export function gasPct(used, limit) {
  const u = hexToNum(used), l = hexToNum(limit);
  return l > 0 ? Math.min(100, (u / l) * 100) : 0;
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
