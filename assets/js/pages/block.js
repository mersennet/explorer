// Block detail for params.id (decimal height or 0x block hash). Fetches the full
// block (transactions inflated), renders the header KV, an optional on-chain
// activity card decoding domain events, the tx list, a teal "View ZK proof"
// link, and prev/next navigation. RPC-first; no indexer dependency.
import { KNOWN_METHODS, KNOWN_CONTRACTS, MARKETS } from '../config.js';
import { getBlock, getBlockByHash, getBlockNumber, numToTag, getMarkets } from '../rpc.js';
import { api } from '../api.js';
import { render, icon, hashLink, addrLink, copyBtn, skeletonRows, emptyState } from '../ui.js';
import { fmtNum, fmtMrsn, hexToNum, hexToBig, shortHash, timeAgo, fmtTime, gasPct, esc } from '../format.js';
import { decodeInput } from '../abi.js';

export default async function block(params = {}) {
  let alive = true;
  const id = String(params.id || '').trim();
  const looksHash = /^0x[0-9a-fA-F]{64}$/.test(id); // 0x + 64 hex = block hash

  render(`
    <div class="crumbs">
      <a href="/">${icon('home', 13)}</a><span>/</span>
      <a href="/blocks">Blocks</a><span>/</span>
      <span id="crumbId">${esc(looksHash ? shortHash(id, 8, 6) : id)}</span>
    </div>
    <div class="page-head" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <h1 id="blockTitle">${icon('blocks', 24)} Block <span class="sk line" style="display:inline-block;width:90px;height:22px;vertical-align:middle"></span></h1>
      <div id="blockNav" style="display:flex;gap:8px"></div>
    </div>
    <div id="blockBody">
      <div class="card"><div class="card-title"><span>Block header</span></div>
        <div class="kv">${kvSkeleton(9)}</div></div>
    </div>`);

  let bl = null;
  let fromIndexer = false;
  const heightOf = (s) => (/^\d+$/.test(s) ? s : (s.startsWith('0x') ? hexToBig(s).toString() : s));
  try {
    if (looksHash) bl = await getBlockByHash(id, true);
    else bl = await getBlock(numToTag(heightOf(id)), true);
  } catch (e) {
    bl = null;
  }
  // The node prunes old blocks (only a recent window is served over RPC), so
  // fall back to the indexer archive for anything older.
  if (!bl && !looksHash) {
    const idxBl = await api.block(heightOf(id));
    if (idxBl && idxBl.block) { bl = indexerToRpcBlock(idxBl); fromIndexer = true; }
  }
  if (!alive) return;

  if (!bl) {
    render(`
      <div class="crumbs"><a href="/">${icon('home', 13)}</a><span>/</span><a href="/blocks">Blocks</a></div>
      <div class="card pad" style="margin-top:10px">
        ${emptyState('Block not found', looksHash ? 'No block with that hash.' : 'No block at that height yet — it may not be mined.', 'blocks')}
        <div style="text-align:center;margin-top:14px"><a class="btn primary" href="/blocks">${icon('blocks', 16)} All blocks</a></div>
      </div>`);
    return () => { alive = false; };
  }

  const num = hexToNum(bl.number);
  let latest = num;
  try { latest = hexToNum(await getBlockNumber()); } catch {}
  if (!alive) return;

  const txList = Array.isArray(bl.transactions) ? bl.transactions : [];
  const txCount = txList.length;
  const pct = gasPct(bl.gasUsed, bl.gasLimit);
  const proposer = bl.miner || bl.proposer;
  const events = Array.isArray(bl.domainEvents) ? bl.domainEvents : [];

  render(`
    <div class="crumbs">
      <a href="/">${icon('home', 13)}</a><span>/</span>
      <a href="/blocks">Blocks</a><span>/</span>
      <span>#${fmtNum(num)}</span>
    </div>
    <div class="page-head" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <h1>${icon('blocks', 24)} Block #${fmtNum(num)}</h1>
      <div style="display:flex;gap:8px">
        <a class="btn" href="/block/${num - 1}" ${num > 0 ? '' : 'aria-disabled="true" style="opacity:.5;pointer-events:none"'}>‹ Prev</a>
        <a class="btn" href="/block/${num + 1}" ${num < latest ? '' : 'aria-disabled="true" style="opacity:.5;pointer-events:none"'}>Next ›</a>
      </div>
    </div>

    <a class="banner teal" href="/verify/${num}" style="margin-bottom:14px;cursor:pointer">
      ${icon('verify', 16)} View ZK proof for this block →
      <span style="margin-left:auto;color:var(--text-3);font-size:var(--fs-xs)">SP1 state-transition proof</span>
    </a>

    <div class="card" style="margin-bottom:14px">
      <div class="card-title"><span>Block header</span>
        <span style="display:inline-flex;gap:6px">${fromIndexer ? '<span class="badge teal" title="Served from the indexer archive — the node has pruned this block from its RPC window">archive</span>' : ''}<span class="badge neutral">${fmtNum(txCount)} ${txCount === 1 ? 'txn' : 'txns'}</span></span></div>
      <div class="kv">
        ${kv('blocks', 'Height', `${fmtNum(num)} ${copyBtn(String(num))}`)}
        ${kv('clock', 'Timestamp', `${fmtTime(bl.timestamp)} <span style="color:var(--text-3)">(${timeAgo(bl.timestamp)})</span>`)}
        ${kv('layers', 'Hash', `<span class="hash">${esc(bl.hash || '—')}</span> ${bl.hash ? copyBtn(bl.hash) : ''}`)}
        ${kv('arrow', 'Parent hash', bl.parentHash && hexToBig(bl.parentHash) !== 0n
          ? `<a class="hash link" href="/block/${esc(bl.parentHash)}">${esc(bl.parentHash)}</a> ${copyBtn(bl.parentHash)}`
          : '<span style="color:var(--text-3)">genesis</span>')}
        ${kv('validators', 'Proposer', proposer ? `${addrLink(proposer, { short: false })}` : '—')}
        ${kv('gas', 'Gas used', `${fmtNum(hexToNum(bl.gasUsed))} <span style="color:var(--text-3)">/ ${fmtNum(hexToNum(bl.gasLimit))}</span> ${gasMeter(pct)}`)}
        ${kv('bolt', 'Base fee', bl.baseFeePerGas != null ? fmtBaseFee(hexToNum(bl.baseFeePerGas)) : '—')}
        ${kv('tree', 'State root', `<span class="hash">${esc(bl.stateRoot || '—')}</span> ${bl.stateRoot ? copyBtn(bl.stateRoot) : ''}`)}
        ${kv('coins', 'Size', bl.size != null ? `${fmtNum(hexToNum(bl.size))} bytes` : '—')}
      </div>
    </div>

    ${events.length ? activityCard(events) : ''}

    <div class="card">
      <div class="card-title"><span>Transactions</span>
        <span class="badge ${txCount ? 'accent' : 'neutral'}">${fmtNum(txCount)}</span></div>
      <div style="overflow-x:auto">
        <table class="tbl">
          <thead><tr><th>Txn hash</th><th>Method</th><th>From</th><th></th><th>To</th><th class="num">Value</th></tr></thead>
          <tbody id="txBody"></tbody>
        </table>
      </div>
    </div>`);

  const txBody = document.getElementById('txBody');
  if (txBody) {
    if (!txCount) {
      txBody.innerHTML = `<tr><td colspan="6">${emptyState('No EVM transactions in this block',
        events.length
          ? 'This block carries native order-book activity instead — see the on-chain activity section below.'
          : 'Empty blocks keep the chain ticking at a steady cadence even when no one is transacting.', 'tx')}</td></tr>`;
    } else if (typeof txList[0] === 'object') {
      txBody.innerHTML = txList.map((tx) => txRow(tx)).join('');
    } else {
      // header-only response (shouldn't happen with full=true) — show hashes only
      txBody.innerHTML = txList.map((h) => `<tr><td>${hashLink(h, 'tx')}</td><td colspan="5" style="color:var(--text-3)">details on tx page</td></tr>`).join('');
    }
  }

  return () => { alive = false; };
}

function txRow(tx) {
  const method = methodLabel(tx.input, tx.to);
  const create = !tx.to;
  return `<tr>
    <td>${hashLink(tx.hash, 'tx')}</td>
    <td>${method}</td>
    <td style="font-size:var(--fs-xs)">${addrLink(tx.from, { short: true })}</td>
    <td style="color:var(--text-3)">${icon('arrow', 11)}</td>
    <td style="font-size:var(--fs-xs)">${create ? '<span class="badge neutral">create</span>' : addrLink(tx.to, { short: true })}</td>
    <td class="num">${fmtMrsn(tx.value)} <span style="color:var(--text-3)">MRSN</span></td>
  </tr>`;
}

// label a tx by its decoded method name (falls back to 4-byte selector), with a
// hint for the native CLOB precompile / known contracts.
function methodLabel(input, to) {
  const known = to && KNOWN_CONTRACTS[String(to).toLowerCase()];
  if (!input || input === '0x' || input.length < 10) {
    return `<span class="badge method">transfer</span>`;
  }
  const dec = decodeInput(input);
  const sel = (dec && dec.selector) || input.slice(0, 10).toLowerCase();
  const name = (dec && dec.name) || KNOWN_METHODS[sel];
  if (name) return `<span class="badge accent">${esc(name)}</span>`;
  if (known && known.kind === 'precompile') return `<span class="badge ${known.tag === 'privacy' ? 'teal' : 'accent'}">${esc(known.tag || known.name)}</span>`;
  return `<span class="badge method" title="${esc(sel)}">${esc(sel)}</span>`;
}

// ---- on-chain activity (domain events) ----
function activityCard(events) {
  const rows = events.map((e) => activityRow(e)).filter(Boolean).join('');
  if (!rows) return '';
  return `
    <div class="card glow-teal" style="margin-bottom:14px">
      <div class="card-title"><span>${icon('pulse', 16)} On-chain activity</span>
        <span class="badge teal">${fmtNum(events.length)} ${events.length === 1 ? 'event' : 'events'}</span></div>
      <div style="overflow-x:auto"><table class="tbl">
        <thead><tr><th>Domain</th><th>Event</th><th>Details</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </div>`;
}

function domainBadge(domain) {
  if (domain === 'mersennet_orders') return `<span class="badge accent">${icon('clob', 11)} CLOB</span>`;
  if (domain === 'shielded') return `<span class="badge shielded">${icon('privacy', 11)} shielded</span>`;
  if (domain === 'bridge') return `<span class="badge teal">${icon('arrow', 11)} bridge</span>`;
  return `<span class="badge neutral">${esc(domain || '—')}</span>`;
}

function activityRow(e) {
  const domain = e.domain || '';
  const kind = e.kind || '';
  const d = e.data || {};
  let detail = '';

  if (domain === 'mersennet_orders') {
    if (kind === 'trade') {
      // CLOB units are PLAIN INTEGERS (price/size) — decode with hexToNum, NOT wei.
      const side = sideLabel(d.side);
      detail = `${marketChip(d.market_id)} ${side} `
        + `<span class="hash">${fmtNum(hexToNum(d.size))}</span> @ <span class="hash">${fmtNum(hexToNum(d.price))}</span>`
        + (d.taker ? ` · taker ${addrLink(d.taker, { short: true, withAvatar: false })}` : '');
    } else if (kind === 'order_submitted') {
      detail = `${marketChip(d.market_id)} ${sideLabel(d.side)} size <span class="hash">${fmtNum(hexToNum(d.size))}</span> @ <span class="hash">${fmtNum(hexToNum(d.price))}</span>`;
    } else if (kind === 'order_cancelled') {
      detail = `${marketChip(d.market_id)} order cancelled`;
    } else if (kind === 'market_added') {
      detail = `${marketChip(d.market_id)} new market listed`;
    } else {
      detail = compactJson(d);
    }
  } else if (domain === 'bridge') {
    if (kind === 'bridge_enqueued') detail = `Shield/unshield request enqueued`;
    else if (kind === 'bridge_dequeued') detail = `Bridge request processed`;
    else detail = compactJson(d);
    if (d.amount != null) detail += ` · <span class="hash">${fmtMrsn(d.amount)}</span> MRSN`;
  } else if (domain === 'shielded') {
    detail = `Shielded note activity${d.noteCount != null ? ` · ${fmtNum(d.noteCount)} notes` : ''}`;
  } else {
    detail = compactJson(d);
  }

  return `<tr>
    <td>${domainBadge(domain)}</td>
    <td><span class="badge ${kind === 'trade' ? 'ok' : 'neutral'}">${esc(kind || '—')}</span></td>
    <td style="font-size:var(--fs-sm)">${detail || '<span style="color:var(--text-3)">—</span>'}</td>
  </tr>`;
}

function sideLabel(side) {
  // side may be hex/int/string. 0 = buy/long, 1 = sell/short by convention.
  const s = typeof side === 'string' && !side.startsWith('0x') ? side.toLowerCase() : hexToNum(side);
  if (s === 'buy' || s === 0 || s === 'long') return `<span class="pct up">buy</span>`;
  if (s === 'sell' || s === 1 || s === 'short') return `<span class="pct down">sell</span>`;
  return esc(String(side ?? ''));
}

function marketChip(id) {
  const mid = typeof id === 'string' && id.startsWith('0x') ? hexToNum(id) : Number(id);
  const sym = MARKET_BY_ID[mid];
  return `<span class="badge neutral">${esc(sym || ('mkt ' + mid))}</span>`;
}

function compactJson(d) {
  try {
    const parts = Object.entries(d || {}).slice(0, 4)
      .map(([k, v]) => `${esc(k)}=${esc(typeof v === 'string' ? shortHash(v, 6, 4) : String(v))}`);
    return parts.length ? `<span style="color:var(--text-2);font-family:var(--font-mono);font-size:var(--fs-xs)">${parts.join(' · ')}</span>` : '';
  } catch { return ''; }
}

function gasMeter(pct) {
  return `<span style="display:inline-flex;align-items:center;gap:6px;vertical-align:middle">
    <span style="display:inline-block;width:60px;height:6px;border-radius:3px;background:var(--bg-elev);overflow:hidden;vertical-align:middle">
      <span style="display:block;width:${pct.toFixed(1)}%;height:100%;background:var(--grad-accent)"></span>
    </span>
    <span style="font-size:var(--fs-xs);color:var(--text-2)">${pct.toFixed(1)}%</span></span>`;
}

function kv(ic, k, v) {
  return `<div class="k">${icon(ic, 13)} ${esc(k)}</div><div class="v">${v}</div>`;
}

// Base fee in the most readable unit: gwei once it's >= 0.001 gwei, raw wei below.
function fmtBaseFee(wei) {
  if (!Number.isFinite(wei) || wei <= 0) return `${fmtNum(wei || 0)} wei`;
  const gwei = wei / 1e9;
  if (gwei >= 0.001) {
    const s = gwei >= 10 ? fmtNum(Math.round(gwei)) : String(+gwei.toFixed(3));
    return `${s} gwei <span style="color:var(--text-3)" title="${fmtNum(wei)} wei">(${fmtNum(wei)} wei)</span>`;
  }
  return `${fmtNum(wei)} wei`;
}
function kvSkeleton(n) {
  let s = '';
  for (let i = 0; i < n; i++) s += `<div class="k"><div class="sk line short"></div></div><div class="v"><div class="sk line"></div></div>`;
  return s;
}

// Static fallback, refreshed from the live (permissionless) market list.
let MARKET_BY_ID = Object.fromEntries((MARKETS || []).map((m) => [m.id, m.symbol]));
getMarkets().then((ms) => { MARKET_BY_ID = Object.fromEntries(ms.map((m) => [m.id, m.symbol])); }).catch(() => {});

// Map an indexer /api/block/:num response (snake_case, decimal strings) to the
// eth_getBlockByNumber shape the renderer expects (camelCase, hex strings).
function indexerToRpcBlock(resp) {
  const b = resp.block || {};
  const toHex = (v) => {
    if (v == null || v === '') return null;
    const s = String(v);
    if (s.startsWith('0x')) return s;
    try { return '0x' + BigInt(s).toString(16); } catch { return null; }
  };
  return {
    number: toHex(b.number),
    hash: b.hash || null,
    parentHash: b.parent_hash || null,
    timestamp: toHex(b.timestamp),
    miner: b.miner || null,
    gasUsed: toHex(b.gas_used) || '0x0',
    gasLimit: toHex(b.gas_limit) || '0x0',
    baseFeePerGas: null,
    stateRoot: b.state_root || null,
    size: toHex(b.size),
    transactions: (resp.transactions || []).map((t) => ({
      hash: t.hash,
      from: t.from_addr,
      to: t.to_addr,
      value: String(t.value || '0x0').startsWith('0x') ? t.value : toHex(t.value),
      input: t.input || '0x',
    })),
  };
}
