// Indexer REST client (progressive enhancement). The /api path may NOT be
// proxied (returns SPA HTML); we probe once and expose `api.available`. Callers
// should branch on api.available and fall back to pure-RPC pages.
import { CONFIG } from './config.js';

let _available = null;     // null = unknown, true/false after probe
let _probe = null;

async function getJson(path) {
  const res = await fetch(CONFIG.apiBase + path, { headers: { Accept: 'application/json' } });
  const ct = res.headers.get('content-type') || '';
  if (!res.ok || !ct.includes('application/json')) throw new Error('api unavailable');
  return res.json();
}

export const api = {
  get available() { return _available === true; },
  async probe() {
    if (_probe) return _probe;
    _probe = (async () => {
      try { await getJson('/status'); _available = true; }
      catch { _available = false; }
      return _available;
    })();
    return _probe;
  },
  // each returns null if the indexer isn't available (caller falls back to RPC)
  async safe(path) { try { await api.probe(); if (!_available) return null; return await getJson(path); } catch { return null; } },
  status: () => api.safe('/status'),
  stats: () => api.safe('/stats'),
  blocks: (page = 1, limit = 25) => api.safe(`/blocks?page=${page}&limit=${limit}`),
  block: (num) => api.safe(`/block/${num}`),
  tx: (hash) => api.safe(`/tx/${hash}`),
  txs: (page = 1, limit = 25) => api.safe(`/txs?page=${page}&limit=${limit}`),
  address: (a) => api.safe(`/address/${a}`),
  addressTxs: (a, page = 1, limit = 25) => api.safe(`/address/${a}/txs?page=${page}&limit=${limit}`),
  addressTokenTxs: (a, page = 1, limit = 25) => api.safe(`/address/${a}/token-txs?page=${page}&limit=${limit}`),
  addressTokens: (a) => api.safe(`/address/${a}/tokens`),
  topAccounts: (limit = 50) => api.safe(`/top-accounts?limit=${limit}`),
  dailyStats: (days = 30) => api.safe(`/daily-stats?days=${days}`),
  minerStats: () => api.safe('/miner-stats'),
  search: (q) => api.safe(`/search?q=${encodeURIComponent(q)}`),
  contract: (a) => api.safe(`/contract?address=${a}`),
  // POST source for verification; returns the parsed JSON (200 or 4xx) or throws.
  async verifyContract(payload) {
    await api.probe();
    if (!_available) throw new Error('indexer offline — verification needs the indexer');
    const res = await fetch(CONFIG.apiBase + '/verify-contract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.json();
  },
};
