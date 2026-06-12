// Search resolver for /search/:q. The shell already pre-routes obvious patterns
// (pure digits → block, 0x+64 → tx, 0x+40 → address); this page handles the rest:
// indexer text search when available, and an RPC fallback that probes the query
// against blocks / txs / addresses. Renders a result card that links to the
// resolved entity, or a clean "no results" empty state.
import { navigate } from '../router.js';
import { getBlock, getBlockByHash, getTx, getBalance, getCode, getNonce, numToTag } from '../rpc.js';
import { api } from '../api.js';
import { render, icon, addrLink, copyBtn, emptyState } from '../ui.js';
import { fmtNum, fmtMrsn, hexToNum, shortHash, esc } from '../format.js';

export default async function search(params) {
  const q = (params.q || '').trim();

  render(`
    <div class="page-head">
      <div class="crumbs"><a href="#/">Home</a> ${icon('arrow', 12)} <span>Search</span></div>
      <h1>${icon('search', 24)} Search</h1>
      <div class="sub">Results for <span class="mono" style="color:var(--accent)">${esc(q)}</span></div>
    </div>
    <div id="note"></div>
    <div class="card pad" id="results">
      <div class="sk line" style="width:60%"></div>
      <div class="sk line" style="width:40%;margin-top:10px"></div>
      <div class="sk line short" style="margin-top:10px"></div>
    </div>`);

  let alive = true;
  const note = document.getElementById('note');
  const out = document.getElementById('results');
  const done = () => !alive || !document.getElementById('results');

  if (!q) {
    out.innerHTML = emptyState('Type something to search', 'A block number, transaction hash, or address.', 'search');
    return () => { alive = false; };
  }

  // 1) indexer text search (best for token names / fuzzy queries). Route on hit.
  if (await api.probe()) {
    const res = await api.search(q).catch(() => null);
    if (done()) return;
    if (res && res.type && res.type !== 'none') {
      const dest = routeFor(res);
      if (dest) { navigate(dest); return () => { alive = false; }; }
    }
  } else {
    note.innerHTML = `<div class="banner warn" style="margin-bottom:14px">${icon('bolt', 15)} Indexer offline — text search is limited; resolving against the node directly.</div>`;
  }

  // 2) RPC fallback — probe the query shape against the chain.
  const found = await resolveViaRpc(q);
  if (done()) return;

  if (!found) {
    out.innerHTML = emptyState('No results',
      'No block, transaction, or address matched this query. Check the value and try again.', 'search');
    return () => { alive = false; };
  }

  out.innerHTML = '';
  out.replaceWith(buildCard(found));
  return () => { alive = false; };
}

// map indexer search result → router path
function routeFor(res) {
  switch (res.type) {
    case 'tx': return 'tx/' + (res.hash || res.value || '');
    case 'block': return 'block/' + (res.number != null ? res.number : (res.hash || res.value || ''));
    case 'address':
    case 'token': return 'address/' + (res.address || res.addr || res.value || '');
    default: return null;
  }
}

// Try every plausible interpretation of q against the node. Returns a normalized
// result descriptor, or null. Ambiguous 0x+64 (could be tx OR block hash) tries
// tx first, then block-by-hash.
async function resolveViaRpc(q) {
  const isDigits = /^\d+$/.test(q);
  const is64 = /^0x[0-9a-fA-F]{64}$/.test(q);
  const is40 = /^0x[0-9a-fA-F]{40}$/.test(q);

  if (isDigits) {
    const bl = await getBlock(numToTag(q), false).catch(() => null);
    if (bl) return { kind: 'block', block: bl };
    return null;
  }

  if (is64) {
    const tx = await getTx(q).catch(() => null);
    if (tx) return { kind: 'tx', tx };
    const bl = await getBlockByHash(q, false).catch(() => null);
    if (bl) return { kind: 'block', block: bl };
    return null;
  }

  if (is40) {
    // an address always "resolves" — show its balance/code summary
    const [bal, code, nonce] = await Promise.all([
      getBalance(q), getCode(q), getNonce(q),
    ]);
    const isContract = !!code && code !== '0x' && code !== '0x0';
    return { kind: 'address', address: q, balance: bal, isContract, nonce };
  }

  // partial 0x prefix that's not a full address/hash — nothing reliable to resolve on-chain
  return null;
}

// Build a result card element linking to the resolved entity.
function buildCard(f) {
  const wrap = document.createElement('div');
  wrap.className = 'card';

  if (f.kind === 'block') {
    const b = f.block;
    const num = hexToNum(b.number);
    const txCount = Array.isArray(b.transactions) ? b.transactions.length : 0;
    wrap.innerHTML = `
      <div class="card-title"><span>${icon('blocks', 16)} Block found</span><span class="badge accent">block</span></div>
      <a class="pad" href="#/block/${num}" style="display:flex;align-items:center;justify-content:space-between;gap:12px;text-decoration:none">
        <div>
          <div style="font-size:var(--fs-xl);font-weight:700;font-family:var(--font-mono);color:var(--accent)">#${fmtNum(num)}</div>
          <div style="color:var(--text-2);font-size:var(--fs-sm);margin-top:4px">${txCount} transaction${txCount === 1 ? '' : 's'}</div>
        </div>
        <div style="color:var(--accent)">${icon('arrow', 20)}</div>
      </a>
      <div class="kv" style="border-top:1px solid var(--border-soft)">
        <div class="k">${icon('blocks', 13)} Hash</div><div class="v">${shortHash(b.hash, 14, 10)} ${copyBtn(b.hash)}</div>
      </div>`;
    return wrap;
  }

  if (f.kind === 'tx') {
    const t = f.tx;
    wrap.innerHTML = `
      <div class="card-title"><span>${icon('tx', 16)} Transaction found</span><span class="badge accent">tx</span></div>
      <a class="pad" href="#/tx/${esc(t.hash)}" style="display:flex;align-items:center;justify-content:space-between;gap:12px;text-decoration:none">
        <div style="min-width:0">
          <div class="mono" style="color:var(--accent);word-break:break-all">${shortHash(t.hash, 16, 12)}</div>
          <div style="color:var(--text-2);font-size:var(--fs-sm);margin-top:4px">${fmtMrsn(t.value)} MRSN${t.blockNumber ? ' · block #' + fmtNum(hexToNum(t.blockNumber)) : ' · pending'}</div>
        </div>
        <div style="color:var(--accent)">${icon('arrow', 20)}</div>
      </a>
      <div class="kv" style="border-top:1px solid var(--border-soft)">
        <div class="k">${icon('account', 13)} From</div><div class="v">${addrLink(t.from)}</div>
        <div class="k">${icon('arrow', 13)} To</div><div class="v">${t.to ? addrLink(t.to) : '<span class="badge neutral">contract creation</span>'}</div>
      </div>`;
    return wrap;
  }

  // address
  const a = f.address;
  const kindBadge = f.isContract ? '<span class="badge teal">contract</span>' : '<span class="badge accent">account</span>';
  wrap.innerHTML = `
    <div class="card-title"><span>${icon(f.isContract ? 'token' : 'account', 16)} ${f.isContract ? 'Contract' : 'Address'} found</span>${kindBadge}</div>
    <a class="pad" href="#/address/${esc(a)}" style="display:flex;align-items:center;justify-content:space-between;gap:12px;text-decoration:none">
      <div style="min-width:0">
        <div class="mono" style="color:var(--accent);word-break:break-all">${shortHash(a, 16, 12)}</div>
        <div style="color:var(--text-2);font-size:var(--fs-sm);margin-top:4px">${fmtMrsn(f.balance)} MRSN${f.nonce != null ? ' · nonce ' + fmtNum(hexToNum(f.nonce)) : ''}</div>
      </div>
      <div style="color:var(--accent)">${icon('arrow', 20)}</div>
    </a>
    <div class="kv" style="border-top:1px solid var(--border-soft)">
      <div class="k">${icon('account', 13)} Address</div><div class="v">${esc(a)} ${copyBtn(a)}</div>
    </div>`;
  return wrap;
}
