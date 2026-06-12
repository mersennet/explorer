// Address page: balance/nonce/type (EOA vs contract), code attestation badge,
// and tabbed history (Transactions + Token transfers via indexer, RPC-aware
// fallbacks). RPC-first; the indexer (api.js) is progressive enhancement.
import { CONFIG, KNOWN_CONTRACTS, KNOWN_METHODS } from '../config.js';
import { rpcBatch, getBalance, getNonce, getCode, getCodeAttestation } from '../rpc.js';
import { api } from '../api.js';
import { render, icon, avatar, copyBtn, hashLink, addrLink, skeletonRows, emptyState } from '../ui.js';
import { fmtMrsn, fmtNum, fmtUnits, hexToNum, shortHash, timeAgo, esc } from '../format.js';

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

    <div id="holdingsCard" style="margin-top:14px"></div>

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

  // --- token holdings (RPC balanceOf for known tokens; indexer auto-discovers more) ---
  buildHoldings(addr);

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

  // --- tabs: lazy-load each tab's page, cache by (tab, page) ---
  const cache = {};
  await api.probe();
  let activeTab = 'txs';
  const pageState = { txs: 1, tokens: 1 };
  const LIMIT = CONFIG.itemsPerPage;

  async function loadTab(tab) {
    const body = document.getElementById('tabBody');
    if (!body) return;
    const page = pageState[tab];
    const ck = `${tab}:${page}`;
    if (cache[ck]) { body.innerHTML = cache[ck]; return; }
    body.innerHTML = `<table class="tbl"><tbody>${skeletonRows(8, 4)}</tbody></table>`;
    const html = tab === 'txs' ? await buildTxs(page) : await buildTokens(page);
    if (!alive) return;
    cache[ck] = html;
    if (activeTab === tab && pageState[tab] === page) body.innerHTML = html;
  }

  function pager(page, total) {
    const pages = Math.max(1, Math.ceil((total || 0) / LIMIT));
    if (pages <= 1) return '';
    const dis = (ok) => (ok ? '' : 'disabled');
    return `<div class="pager" data-pages="${pages}">
      <button class="btn sq" data-pg="first" ${dis(page > 1)} title="Newest">«</button>
      <button class="btn sq" data-pg="prev" ${dis(page > 1)}>‹</button>
      <span style="font-size:var(--fs-sm);color:var(--text-2);padding:0 8px">Page ${fmtNum(page)} of ${fmtNum(pages)} · ${fmtNum(total)} total</span>
      <button class="btn sq" data-pg="next" ${dis(page < pages)}>›</button>
      <button class="btn sq" data-pg="last" ${dis(page < pages)} title="Oldest">»</button>
    </div>`;
  }

  async function buildTxs(page) {
    if (!api.available) {
      return notePanel(
        'Full transaction history requires the indexer',
        'This explorer is reading directly from the node, which does not index per-address history. Connect the indexer to see a complete, paginated transaction list.'
      );
    }
    const data = await api.addressTxs(addr, page, LIMIT);
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
    return tableShell(['Tx hash', 'Block', 'From → To', 'Value', 'Age'], rows) + pager(page, total);
  }

  async function buildTokens(page) {
    if (!api.available) {
      return notePanel(
        'Token transfers require the indexer',
        'Token (ERC-20 style) transfer history is reconstructed by the indexer from logs. Connect it to view transfers for this address.'
      );
    }
    const data = await api.addressTokenTxs(addr, page, LIMIT);
    const list = data && Array.isArray(data.transfers) ? data.transfers : (data && Array.isArray(data.txs) ? data.txs : []);
    if (!list.length) return tableShell(['Tx hash', 'Token', 'From → To', 'Amount', 'Age'],
      emptyRow(5, 'No token transfers', 'No token transfers recorded for this address.'));
    const rows = list.map((t) => {
      const from = t.from_addr || t.from;
      const to = t.to_addr || t.to;
      const out = (from || '').toLowerCase() === addr;
      const counter = out ? to : from;
      const tok = t.token_address || t.token || t.contract;
      const meta = tok ? KNOWN_CONTRACTS[String(tok).toLowerCase()] : null;
      const amount = t.amount != null ? t.amount : t.value;
      return `<tr class="row-enter">
        <td>${(t.tx_hash || t.hash) ? hashLink(t.tx_hash || t.hash, 'tx') : '—'}</td>
        <td>${tok ? `${addrLink(tok)} ${meta ? `<span class="badge accent">${esc(meta.symbol)}</span>` : ''}` : '<span class="badge token">token</span>'}</td>
        <td style="font-size:var(--fs-xs)"><span class="badge ${out ? 'warn' : 'ok'}" style="margin-right:6px">${out ? 'OUT' : 'IN'}</span>${counter ? addrLink(counter) : '—'}</td>
        <td class="num">${tokenAmount(amount, meta)}</td>
        <td class="num" style="color:var(--text-3)">${timeAgo(t.timestamp)}</td>
      </tr>`;
    }).join('');
    const total = data.total != null ? data.total : list.length;
    return tableShell(['Tx hash', 'Token', 'From → To', 'Amount', 'Age'], rows) + pager(page, total);
  }

  // --- token holdings: known tokens via RPC balanceOf; indexer auto-discovers more ---
  async function buildHoldings(a) {
    const card = document.getElementById('holdingsCard');
    if (!card) return;
    await api.probe();
    const knownToks = Object.keys(KNOWN_CONTRACTS).filter((k) => KNOWN_CONTRACTS[k].kind === 'token');
    let discovered = [];
    if (api.available) {
      const d = await api.addressTokens(a).catch(() => null);
      if (d && Array.isArray(d.tokens)) discovered = d.tokens.map((t) => String(t.token_address || '').toLowerCase());
    }
    const toks = [...new Set([...knownToks, ...discovered].filter(Boolean))];
    if (!alive || !toks.length) return;
    const data = '0x70a08231' + a.replace(/^0x/, '').padStart(64, '0');     // balanceOf(address)
    const balances = await rpcBatch(toks.map((t) => ({ method: 'eth_call', params: [{ to: t, data }, 'latest'] })));
    if (!alive) return;
    const rows = toks.map((t, i) => {
      const raw = balances[i];
      let big = 0n; try { if (raw && raw !== '0x') big = BigInt(raw); } catch {}
      return { token: t, big, meta: KNOWN_CONTRACTS[t] };
    }).filter((r) => r.big > 0n || r.meta);     // keep known tokens even at zero
    if (!rows.length) return;
    rows.sort((x, y) => (y.big > 0n ? 1 : 0) - (x.big > 0n ? 1 : 0));
    card.innerHTML = `
      <div class="card">
        <div class="card-title"><span>${icon('token', 16)} Token holdings</span><span class="badge neutral">${rows.length}</span></div>
        <div class="holdings">${rows.map((r) => {
          const sym = (r.meta && r.meta.symbol) || 'TOKEN';
          const bal = (r.meta && r.meta.decimals != null) ? fmtUnits(r.big, r.meta.decimals) : fmtNum(r.big);
          return `<a class="holding" href="#/address/${r.token}">
            <span class="hsym">${esc(sym)}</span>
            <span class="hbal mono">${bal}</span>
            <span class="haddr mono">${shortHash(r.token, 6, 4)}</span>
          </a>`;
        }).join('')}</div>
        ${!api.available ? `<div style="padding:11px 18px;border-top:1px solid var(--border-soft);color:var(--text-3);font-size:var(--fs-xs)">${icon('network', 11)} Showing known tokens only — connect the indexer to auto-discover every token held.</div>` : ''}
      </div>`;
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

  // pager delegation (within the active tab body)
  const tabBody = document.getElementById('tabBody');
  const onPager = (e) => {
    const b = e.target.closest('button[data-pg]');
    if (!b || b.disabled || !alive) return;
    const wrap = b.closest('.pager');
    const pages = parseInt((wrap && wrap.dataset.pages) || '1', 10);
    let p = pageState[activeTab];
    const go = b.dataset.pg;
    if (go === 'first') p = 1; else if (go === 'prev') p = Math.max(1, p - 1);
    else if (go === 'next') p = Math.min(pages, p + 1); else if (go === 'last') p = pages;
    pageState[activeTab] = p;
    loadTab(activeTab);
  };
  tabBody?.addEventListener('click', onPager);

  loadTab('txs');

  function cleanup() {
    alive = false;
    watchBtn?.removeEventListener('click', onWatch);
    tabs?.removeEventListener('click', onTab);
    tabBody?.removeEventListener('click', onPager);
  }
  return cleanup;
}

// token-transfer amount: known token -> scaled + symbol; unknown -> raw integer
function tokenAmount(amount, meta) {
  if (amount == null) return '—';
  if (meta && meta.decimals != null) return `${fmtUnits(amount, meta.decimals)} <span style="color:var(--text-3)">${esc(meta.symbol)}</span>`;
  try { return `<span title="raw units">${fmtNum(BigInt(amount))}</span>`; } catch { return '—'; }
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
