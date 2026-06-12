// Address page: balance/nonce/type (EOA vs contract), code attestation badge,
// and tabbed history (Transactions + Token transfers via indexer, RPC-aware
// fallbacks). RPC-first; the indexer (api.js) is progressive enhancement.
import { CONFIG, KNOWN_CONTRACTS, KNOWN_METHODS } from '../config.js';
import { rpcBatch, getBalance, getNonce, getCode, getCodeAttestation } from '../rpc.js';
import { api } from '../api.js';
import { render, icon, avatar, copyBtn, hashLink, addrLink, skeletonRows, emptyState } from '../ui.js';
import { fmtMrsn, fmtNum, hexToNum, shortHash, timeAgo, esc } from '../format.js';

const WATCH_KEY = 'mersennet-explorer-watchlist';

function readWatchlist() {
  try { const a = JSON.parse(localStorage.getItem(WATCH_KEY) || '[]'); return Array.isArray(a) ? a : []; }
  catch { return []; }
}
function writeWatchlist(list) {
  try { localStorage.setItem(WATCH_KEY, JSON.stringify(list)); } catch {}
}

export default async function address(params) {
  const addr = (params.addr || '').toLowerCase();
  const known = KNOWN_CONTRACTS[addr];

  render(`
    <div class="crumbs"><a href="#/">Home</a> <span>/</span> <a href="#/accounts">Accounts</a> <span>/</span> <span>Address</span></div>
    <div class="card pad" style="margin-bottom:14px">
      <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        ${avatar(addr, 40)}
        <div style="min-width:0;flex:1">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span class="badge neutral" id="typeBadge">${icon('account',12)} loading…</span>
            ${known ? `<span class="badge ${known.kind === 'privacy' ? 'teal' : 'accent'}">${esc(known.name)}</span>` : ''}
            <span id="attestBadge"></span>
          </div>
          <div class="hash" style="margin-top:8px;word-break:break-all;font-size:var(--fs-md)">${esc(addr)} ${copyBtn(addr)}</div>
          ${known ? `<div style="color:var(--text-3);font-size:var(--fs-sm);margin-top:5px">${esc(known.note || '')}</div>` : ''}
        </div>
        <div style="display:flex;gap:8px;flex:none">
          <button class="btn" id="watchBtn">${icon('account',15)} <span id="watchLbl">Watch</span></button>
        </div>
      </div>
    </div>

    <div class="grid cols-3" id="kvCards">
      ${statSk()}${statSk()}${statSk()}
    </div>

    <div id="attestCard" style="margin-top:14px"></div>

    <div class="card" style="margin-top:14px">
      <div class="tabs" id="tabs">
        <div class="tab active" data-tab="txs">${icon('tx',14)} Transactions</div>
        <div class="tab" data-tab="tokens">${icon('token',14)} Token transfers</div>
      </div>
      <div id="tabBody" style="padding:0 0 4px"><table class="tbl"><tbody>${skeletonRows(8, 4)}</tbody></table></div>
    </div>`);

  let alive = true;

  // --- watchlist button wiring ---
  const watchBtn = document.getElementById('watchBtn');
  const watchLbl = document.getElementById('watchLbl');
  function syncWatch() {
    const on = readWatchlist().includes(addr);
    if (watchLbl) watchLbl.textContent = on ? 'Watching' : 'Watch';
    if (watchBtn) watchBtn.classList.toggle('primary', on);
  }
  syncWatch();
  const onWatch = () => {
    const list = readWatchlist();
    const i = list.indexOf(addr);
    if (i >= 0) list.splice(i, 1); else list.push(addr);
    writeWatchlist(list);
    syncWatch();
  };
  watchBtn?.addEventListener('click', onWatch);

  // --- core reads: balance, nonce, code (RPC) ---
  const [balance, nonce, code] = await Promise.all([getBalance(addr), getNonce(addr), getCode(addr)]);
  if (!alive) return cleanup;

  const isContract = code != null && code !== '0x' && code !== '0x0';
  const typeBadge = document.getElementById('typeBadge');
  if (typeBadge) typeBadge.outerHTML = isContract
    ? `<span class="badge accent" id="typeBadge">${icon('blocks',12)} Contract</span>`
    : `<span class="badge neutral" id="typeBadge">${icon('account',12)} EOA</span>`;

  const kv = document.getElementById('kvCards');
  if (kv) kv.innerHTML = `
    ${stat('coins', 'Balance', fmtMrsn(balance) + ' <span style="color:var(--text-3);font-size:var(--fs-md)">MRSN</span>', balance != null ? '' : 'unavailable')}
    ${stat('tx', isContract ? 'Code size' : 'Nonce', isContract ? fmtNum((code.length - 2) / 2) + ' <span style="color:var(--text-3);font-size:var(--fs-md)">bytes</span>' : fmtNum(hexToNum(nonce)), isContract ? 'on-chain bytecode' : 'transactions sent')}
    ${stat('account', 'Type', isContract ? 'Contract' : 'EOA', known ? esc(known.name) : (isContract ? 'has bytecode' : 'externally owned'))}`;

  // --- code attestation (contracts only) ---
  if (isContract) {
    const att = await getCodeAttestation(addr);
    if (alive && att && att.codeHash) {
      const badge = document.getElementById('attestBadge');
      if (badge) badge.innerHTML = `<span class="badge teal">${icon('verify',12)} Verified · attested</span>`;
      const card = document.getElementById('attestCard');
      if (card) card.innerHTML = `
        <div class="card glow-teal">
          <div class="card-title"><span style="color:var(--teal)">${icon('verify',16)} Code attestation</span><span class="badge teal">on-chain</span></div>
          <div class="kv">
            <div class="k">${icon('account',13)} Deployer</div><div class="v">${att.deployer ? addrLink(att.deployer, { short: false }) : '—'}</div>
            <div class="k">${icon('proof',13)} Code hash</div><div class="v">${att.codeHash ? `${shortHash(att.codeHash, 12, 10)} ${copyBtn(att.codeHash)}` : '—'}</div>
            <div class="k">${icon('ext',13)} Metadata URI</div><div class="v">${att.metadataUri ? `<a class="link" href="${esc(att.metadataUri)}" target="_blank" rel="noopener">${esc(att.metadataUri)}</a>` : '—'}</div>
            <div class="k">${icon('blocks',13)} Published at</div><div class="v">${att.publishedAtBlock != null ? `<a class="hash link" href="#/block/${hexToNum(att.publishedAtBlock)}">#${fmtNum(hexToNum(att.publishedAtBlock))}</a>` : '—'}</div>
          </div>
        </div>`;
    }
  }

  // --- tabs: lazy-load each tab's data once, cache results ---
  const cache = {};
  await api.probe();
  let activeTab = 'txs';

  async function loadTab(tab) {
    const body = document.getElementById('tabBody');
    if (!body) return;
    if (cache[tab]) { body.innerHTML = cache[tab]; return; }
    body.innerHTML = `<table class="tbl"><tbody>${skeletonRows(8, 4)}</tbody></table>`;
    const html = tab === 'txs' ? await buildTxs() : await buildTokens();
    if (!alive) return;
    cache[tab] = html;
    if (activeTab === tab) body.innerHTML = html;
  }

  async function buildTxs() {
    if (!api.available) {
      return notePanel(
        'Full transaction history requires the indexer',
        'This explorer is reading directly from the node, which does not index per-address history. Connect the indexer to see a complete, paginated transaction list.'
      );
    }
    const data = await api.addressTxs(addr, 1, CONFIG.itemsPerPage);
    const list = data && Array.isArray(data.txs) ? data.txs : [];
    if (!list.length) return tableShell(['Tx hash', 'Block', 'From → To', 'Value', 'Age'],
      emptyRow(5, 'No transactions', 'This address has no recorded transactions yet.'));
    const rows = list.map((t) => {
      const out = (t.from_addr || '').toLowerCase() === addr;
      const counter = out ? t.to_addr : t.from_addr;
      const sel = t.input ? String(t.input).slice(0, 10) : '0x';
      const method = KNOWN_METHODS[sel];
      return `<tr class="row-enter">
        <td>${hashLink(t.hash, 'tx')}${method ? ` <span class="badge method">${esc(method)}</span>` : ''}</td>
        <td><a class="hash link" href="#/block/${hexToNum(t.block_number)}">#${fmtNum(hexToNum(t.block_number))}</a></td>
        <td style="font-size:var(--fs-xs)"><span class="badge ${out ? 'warn' : 'ok'}" style="margin-right:6px">${out ? 'OUT' : 'IN'}</span>${counter ? addrLink(counter) : '<span class="badge neutral">create</span>'}</td>
        <td class="num">${fmtMrsn(t.value)} <span style="color:var(--text-3)">MRSN</span></td>
        <td class="num" style="color:var(--text-3)">${timeAgo(t.timestamp)}</td>
      </tr>`;
    }).join('');
    const total = data.total != null ? data.total : list.length;
    return tableShell(['Tx hash', 'Block', 'From → To', 'Value', 'Age'], rows) +
      `<div style="padding:11px 18px;color:var(--text-3);font-size:var(--fs-xs);border-top:1px solid var(--border-soft)">Showing ${list.length} of ${fmtNum(total)} · <a class="link" href="#/txs">view global tx feed →</a></div>`;
  }

  async function buildTokens() {
    if (!api.available) {
      return notePanel(
        'Token transfers require the indexer',
        'Token (ERC-20 style) transfer history is reconstructed by the indexer from logs. Connect it to view transfers for this address.'
      );
    }
    const data = await api.addressTokenTxs(addr, 1, CONFIG.itemsPerPage);
    const list = data && Array.isArray(data.txs) ? data.txs : (data && Array.isArray(data.transfers) ? data.transfers : []);
    if (!list.length) return tableShell(['Tx hash', 'Token', 'From → To', 'Amount', 'Age'],
      emptyRow(5, 'No token transfers', 'No token transfers recorded for this address.'));
    const rows = list.map((t) => {
      const from = t.from_addr || t.from;
      const to = t.to_addr || t.to;
      const out = (from || '').toLowerCase() === addr;
      const counter = out ? to : from;
      const tok = t.token || t.token_addr || t.contract;
      const amount = t.value != null ? t.value : t.amount;
      return `<tr class="row-enter">
        <td>${t.hash ? hashLink(t.hash, 'tx') : '—'}</td>
        <td>${tok ? addrLink(tok) : '<span class="badge token">token</span>'}</td>
        <td style="font-size:var(--fs-xs)"><span class="badge ${out ? 'warn' : 'ok'}" style="margin-right:6px">${out ? 'OUT' : 'IN'}</span>${counter ? addrLink(counter) : '—'}</td>
        <td class="num">${amount != null ? fmtMrsn(amount) : '—'}</td>
        <td class="num" style="color:var(--text-3)">${timeAgo(t.timestamp)}</td>
      </tr>`;
    }).join('');
    return tableShell(['Tx hash', 'Token', 'From → To', 'Amount', 'Age'], rows);
  }

  // tab click handling
  const tabs = document.getElementById('tabs');
  const onTab = (e) => {
    const t = e.target.closest('.tab');
    if (!t || !alive) return;
    const tab = t.dataset.tab;
    if (tab === activeTab) return;
    activeTab = tab;
    tabs.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === t));
    loadTab(tab);
  };
  tabs?.addEventListener('click', onTab);

  loadTab('txs');

  function cleanup() {
    alive = false;
    watchBtn?.removeEventListener('click', onWatch);
    tabs?.removeEventListener('click', onTab);
  }
  return cleanup;
}

// --- small view helpers ---
const stat = (ic, label, val, meta) =>
  `<div class="stat"><div class="label">${icon(ic, 13)} ${label}</div><div class="value sm">${val}</div><div class="meta">${meta || ''}</div></div>`;
const statSk = () =>
  `<div class="stat"><div class="sk line short"></div><div class="sk line" style="height:22px;margin-top:10px"></div></div>`;

function tableShell(headers, rowsHtml) {
  return `<table class="tbl"><thead><tr>${headers.map((h, i) => `<th class="${i >= headers.length - 2 ? 'num' : ''}">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rowsHtml}</tbody></table>`;
}
function emptyRow(cols, label, hint) {
  return `<tr><td colspan="${cols}">${emptyState(label, hint, 'tx')}</td></tr>`;
}
function notePanel(label, hint) {
  return `<div style="padding:14px 18px"><div class="banner info">${icon('network', 16)} Indexer offline — limited data</div></div>` +
    `<div style="padding:0 18px 18px">${emptyState(label, hint, 'search')}</div>`;
}
