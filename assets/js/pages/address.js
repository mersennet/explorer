// Address page: balance/nonce/type (EOA vs contract), code attestation badge,
// and tabbed history (Transactions + Token transfers via indexer, RPC-aware
// fallbacks). RPC-first; the indexer (api.js) is progressive enhancement.
import { CONFIG, KNOWN_CONTRACTS, KNOWN_METHODS } from '../config.js';
import { rpcBatch, getBalance, getNonce, getCode, getCodeAttestation, getOrdersAccount, collateralUnitsToWei, getMarkets, getStakingValidators, getStakingDelegation, getStakingUnbonding } from '../rpc.js';
import { api } from '../api.js';
import { render, icon, avatar, copyBtn, hashLink, addrLink, skeletonRows, emptyState } from '../ui.js';
import { fmtMrsn, fmtNum, fmtUnits, hexToNum, shortHash, timeAgo, esc, fmtPx } from '../format.js';

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
    <div class="crumbs"><a href="/">Home</a> <span>/</span> <a href="/accounts">Accounts</a> <span>/</span> <span>Address</span></div>
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

    <div id="marginCard" style="margin-top:14px"></div>

    <div id="stakingCard" style="margin-top:14px"></div>

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
    ${stat('coins', 'Balance', (balance != null ? fmtMrsn(balance) : '—') + ' <span style="color:var(--text-3);font-size:var(--fs-md)">MRSN</span>', balance != null ? '' : 'RPC did not answer — retry in a moment')}
    ${stat('tx', isContract ? 'Code size' : 'Nonce', isContract ? fmtNum((code.length - 2) / 2) + ' <span style="color:var(--text-3);font-size:var(--fs-md)">bytes</span>' : fmtNum(hexToNum(nonce)), isContract ? 'on-chain bytecode' : 'transactions sent')}
    ${stat('account', 'Type', isContract ? 'Contract' : 'EOA', known ? esc(known.name) : (isContract ? 'has bytecode' : 'externally owned'))}`;

  // --- token holdings (RPC balanceOf for known tokens; indexer auto-discovers more) ---
  buildHoldings(addr);

  // --- CLOB margin account + staking position (new-chain features; safe no-ops on old nodes) ---
  if (!isContract) { buildMargin(addr); buildStaking(addr); }

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
            <div class="k">${icon('blocks',13)} Published at</div><div class="v">${att.publishedAtBlock != null ? `<a class="hash link" href="/block/${hexToNum(att.publishedAtBlock)}">#${fmtNum(hexToNum(att.publishedAtBlock))}</a>` : '—'}</div>
          </div>
        </div>`;
    }
  }

  // --- tabs: lazy-load each tab's page, cache by (tab, page) ---
  const cache = {};
  await api.probe();
  let activeTab = 'txs';
  const pageState = { txs: 1, tokens: 1, contract: 1 };
  const LIMIT = CONFIG.itemsPerPage;

  // Contracts get a source-verification tab. Fetch status up front so the tab
  // label can carry a "verified" checkmark and the source-code badge can light up.
  let verifiedContract = null;
  if (isContract) {
    verifiedContract = await api.contract(addr);
    if (alive && verifiedContract && verifiedContract.verified) {
      const badge = document.getElementById('attestBadge');
      if (badge) badge.innerHTML = `<span class="badge teal">${icon('verify',12)} Verified · source</span>`;
    }
    const tabsEl = document.getElementById('tabs');
    if (tabsEl) {
      const isV = verifiedContract && verifiedContract.verified;
      tabsEl.insertAdjacentHTML('beforeend',
        `<div class="tab" data-tab="contract">${icon('proof',14)} Contract${isV ? ` <span class="badge teal" style="margin-left:4px">${icon('verify',10)}</span>` : ''}</div>`);
    }
  }

  async function loadTab(tab) {
    const body = document.getElementById('tabBody');
    if (!body) return;
    const page = pageState[tab];
    const ck = `${tab}:${page}`;
    if (cache[ck]) { body.innerHTML = cache[ck]; return; }
    body.innerHTML = `<table class="tbl"><tbody>${skeletonRows(8, 4)}</tbody></table>`;
    const html = tab === 'txs' ? await buildTxs(page)
      : tab === 'tokens' ? await buildTokens(page)
      : await buildContract();
    if (!alive) return;
    // The verify form is interactive; don't cache it so a resubmit re-renders.
    if (tab !== 'contract') cache[ck] = html;
    if (activeTab === tab && pageState[tab] === page) {
      body.innerHTML = html;
      if (tab === 'contract') wireVerifyForm();
    }
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
        <td><a class="hash link" href="/block/${hexToNum(t.block_number)}">#${fmtNum(hexToNum(t.block_number))}</a></td>
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
          return `<a class="holding" href="/address/${r.token}">
            <span class="hsym">${esc(sym)}</span>
            <span class="hbal mono">${bal}</span>
            <span class="haddr mono">${shortHash(r.token, 6, 4)}</span>
          </a>`;
        }).join('')}</div>
        ${!api.available ? `<div style="padding:11px 18px;border-top:1px solid var(--border-soft);color:var(--text-3);font-size:var(--fs-xs)">${icon('network', 11)} Showing known tokens only — connect the indexer to auto-discover every token held.</div>` : ''}
      </div>`;
  }

  // --- CLOB margin account: native + token collateral, open positions ---
  async function buildMargin(a) {
    const card = document.getElementById('marginCard');
    if (!card) return;
    const acct = await getOrdersAccount(a);
    if (!alive || !acct) return;
    let coll = 0n; try { coll = BigInt(acct.collateral || '0x0'); } catch {}
    const toks = Array.isArray(acct.tokenCollateral) ? acct.tokenCollateral : [];
    const positions = Array.isArray(acct.positions) ? acct.positions : [];
    const hasToks = toks.some((t) => { try { return BigInt(t.amount) > 0n; } catch { return false; } });
    if (coll === 0n && !hasToks && !positions.length && !(acct.openOrders > 0)) return; // no margin activity — keep the page clean
    const markets = await getMarkets().catch(() => []);
    // Units are wei until the settlement switch and whole MRSN after it.
    const collateralWei = await collateralUnitsToWei(acct.collateral);
    if (!alive) return;
    const symFor = (id) => (markets.find((m) => m.id === Number(id)) || {}).symbol || `Market ${id}`;
    const scaleFor = (id) => (markets.find((m) => m.id === Number(id)) || {}).priceScale || 1;
    const tokRows = toks.map((t) => {
      const meta = KNOWN_CONTRACTS[String(t.token || '').toLowerCase()];
      let amt = 0n; try { amt = BigInt(t.amount); } catch {}
      if (amt === 0n) return '';
      const val = meta && meta.decimals != null ? fmtUnits(amt, meta.decimals) : fmtNum(amt);
      return `<div class="kv-line" style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-soft);font-size:var(--fs-sm)">
        <span>${addrLink(t.token, { short: true })} ${meta ? `<span class="badge accent">${esc(meta.symbol)}</span>` : ''}</span>
        <span class="mono">${val}</span></div>`;
    }).join('');
    const posRows = positions.map((p) => {
      const size = BigInt(p.size || '0');
      const side = size > 0n ? 'long' : size < 0n ? 'short' : 'flat';
      const cls = size > 0n ? 'ok' : size < 0n ? 'warn' : 'neutral';
      return `<div style="display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid var(--border-soft);font-size:var(--fs-sm)">
        <span><a class="hash link" href="/clob/${p.marketId}">${esc(symFor(p.marketId))}</a> <span class="badge ${cls}">${side}</span></span>
        <span class="mono">${fmtNum(size < 0n ? -size : size)} @ ${fmtPx(hexToNum(p.entryPrice), scaleFor(p.marketId))}</span></div>`;
    }).join('');
    card.innerHTML = `
      <div class="card">
        <div class="card-title"><span>${icon('clob', 16)} CLOB margin account</span>
          <span class="badge neutral">${fmtNum(acct.openOrders || 0)} open orders</span></div>
        <div class="pad" style="padding-top:10px">
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-soft);font-size:var(--fs-sm)">
            <span style="color:var(--text-2)">Native collateral</span>
            <span class="mono">${fmtMrsn('0x' + collateralWei.toString(16))} <span style="color:var(--text-3)">MRSN</span></span></div>
          ${tokRows}
          ${posRows ? `<div style="color:var(--text-3);font-size:var(--fs-xs);text-transform:uppercase;letter-spacing:.06em;margin:12px 0 4px">Open positions</div>${posRows}` : ''}
        </div>
      </div>`;
  }

  // --- staking: delegations to each validator + unbonding queue ---
  async function buildStaking(a) {
    const card = document.getElementById('stakingCard');
    if (!card) return;
    const vals = await getStakingValidators();
    if (!alive || !Array.isArray(vals) || !vals.length) return;
    const dels = await Promise.all(vals.map((v) => getStakingDelegation(a, v.address)));
    const unbonding = await getStakingUnbonding(a);
    if (!alive) return;
    const rows = [];
    vals.forEach((v, i) => {
      const d = dels[i]; if (!d) return;
      let amt = 0n, rew = 0n;
      try { amt = BigInt(d.amount || '0x0'); rew = BigInt(d.pendingRewards || '0x0'); } catch {}
      if (amt === 0n && rew === 0n) return;
      rows.push(`<div style="display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid var(--border-soft);font-size:var(--fs-sm)">
        <span>${addrLink(v.address, { short: true })}</span>
        <span class="mono">${fmtMrsn(amt)} <span style="color:var(--text-3)">MRSN</span>
          ${rew > 0n ? `<span class="badge ok" style="margin-left:6px">+${fmtMrsn(rew)} rewards</span>` : ''}</span></div>`);
    });
    const unb = Array.isArray(unbonding) ? unbonding : (unbonding && Array.isArray(unbonding.entries) ? unbonding.entries : []);
    const unbRows = unb.map((u) => {
      let amt = 0n; try { amt = BigInt(u.amount || '0x0'); } catch {}
      if (amt === 0n) return '';
      const h = u.unlockAtBlock != null ? hexToNum(u.unlockAtBlock) : null;
      return `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-soft);font-size:var(--fs-sm)">
        <span style="color:var(--text-2)">Unbonding</span>
        <span class="mono">${fmtMrsn(amt)} <span style="color:var(--text-3)">MRSN${h != null ? ` · unlocks #${fmtNum(h)}` : ''}</span></span></div>`;
    }).join('');
    if (!rows.length && !unbRows) return; // no staking activity
    card.innerHTML = `
      <div class="card">
        <div class="card-title"><span>${icon('validators', 16)} Staking</span>
          <span class="badge accent">${rows.length} delegation${rows.length === 1 ? '' : 's'}</span></div>
        <div class="pad" style="padding-top:10px">${rows.join('')}${unbRows}</div>
      </div>`;
  }

  // --- contract tab: verified source + ABI, or a verify form ---
  function abiList(abi) {
    if (!Array.isArray(abi) || !abi.length) return '';
    const sig = (e) => `${e.name}(${(e.inputs || []).map((i) => i.type).join(',')})`;
    const fns = abi.filter((e) => e.type === 'function');
    const evs = abi.filter((e) => e.type === 'event');
    const grp = (title, items, badge) => items.length ? `
      <div style="margin-top:10px"><div style="font-size:var(--fs-xs);color:var(--text-3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">${title}</div>
      ${items.map((e) => `<div class="mono" style="font-size:var(--fs-sm);padding:3px 0;color:var(--text-2)">
        <span class="badge ${badge}" style="margin-right:6px">${e.stateMutability || e.type}</span>${esc(sig(e))}</div>`).join('')}</div>` : '';
    return grp('Functions', fns, 'neutral') + grp('Events', evs, 'accent');
  }

  async function buildContract() {
    const v = verifiedContract || await api.contract(addr);
    if (v && v.verified) {
      const settings = [
        v.compilerVersion ? `solc ${esc(v.compilerVersion.split('+')[0])}` : null,
        v.optimizer ? `optimizer ${v.runs || 200} runs` : 'optimizer off',
        v.viaIR ? 'via-IR' : null,
        v.evmVersion ? esc(v.evmVersion) : null,
      ].filter(Boolean).join(' · ');
      const matchNote = v.matchType === 'full'
        ? 'Exact match — runtime bytecode and metadata are identical to this source.'
        : 'Runtime-bytecode match — the deployed code matches this source (metadata differs, e.g. compiler build). Constructor-only differences are not distinguishable by a runtime match.';
      return `<div style="padding:16px 18px">
        <div class="banner" style="background:var(--teal-soft,rgba(45,212,191,.08));border:1px solid var(--teal);color:var(--teal);display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:8px">
          ${icon('verify',16)} <strong>Source verified</strong>
          <span class="badge teal" style="margin-left:auto">${v.matchType === 'full' ? 'Full match' : 'Bytecode match'}</span>
        </div>
        <div class="kv" style="margin-top:12px">
          <div class="k">${icon('proof',13)} Contract</div><div class="v mono">${esc(v.contractName || '—')}</div>
          <div class="k">${icon('blocks',13)} Compiler</div><div class="v" style="font-size:var(--fs-sm)">${settings || '—'}</div>
          <div class="k">${icon('network',13)} Match</div><div class="v" style="font-size:var(--fs-sm);color:var(--text-2)">${matchNote}</div>
        </div>
        <div style="margin-top:16px"><div class="card-title" style="padding:0 0 8px"><span>${icon('token',15)} ABI</span></div>${abiList(v.abi)}</div>
        <div style="margin-top:16px">
          <div class="card-title" style="padding:0 0 8px"><span>${icon('proof',15)} Source</span><span class="badge neutral">${fmtNum((v.source || '').split('\n').length)} lines</span></div>
          <pre class="mono" style="background:var(--bg-1,#0c0f0d);border:1px solid var(--border-soft);border-radius:8px;padding:14px;overflow:auto;max-height:520px;font-size:var(--fs-sm);line-height:1.5;white-space:pre">${esc(v.source || '')}</pre>
        </div>
      </div>`;
    }
    // not verified — offer the form
    return `<div style="padding:16px 18px" id="verifyWrap">
      <div style="font-size:var(--fs-sm);color:var(--text-2);margin-bottom:12px">
        ${icon('proof',14)} This contract's source is <strong>not verified</strong>. Paste the Solidity source and its
        exact compiler settings; the indexer compiles it and checks the runtime bytecode against the on-chain code.
      </div>
      ${!api.available ? `<div class="banner info">${icon('network',15)} The indexer is offline, so verification is unavailable on this deployment.</div>` : `
      <textarea id="vSource" placeholder="// SPDX-License-Identifier: MIT&#10;pragma solidity ^0.8.20;&#10;contract MyContract { ... }" spellcheck="false"
        style="width:100%;height:220px;background:var(--bg-1,#0c0f0d);border:1px solid var(--border-soft);border-radius:8px;padding:12px;color:var(--text-1);font-family:var(--mono,monospace);font-size:var(--fs-sm);resize:vertical"></textarea>
      <div class="grid cols-3" style="gap:10px;margin-top:10px">
        <label style="font-size:var(--fs-xs);color:var(--text-3)">Contract name (optional)
          <input id="vName" placeholder="auto-detect" style="width:100%;margin-top:4px;background:var(--bg-1,#0c0f0d);border:1px solid var(--border-soft);border-radius:6px;padding:7px;color:var(--text-1);font-size:var(--fs-sm)"></label>
        <label style="font-size:var(--fs-xs);color:var(--text-3)">Optimizer runs
          <input id="vRuns" type="number" value="200" style="width:100%;margin-top:4px;background:var(--bg-1,#0c0f0d);border:1px solid var(--border-soft);border-radius:6px;padding:7px;color:var(--text-1);font-size:var(--fs-sm)"></label>
        <label style="font-size:var(--fs-xs);color:var(--text-3)">EVM version
          <input id="vEvm" value="shanghai" style="width:100%;margin-top:4px;background:var(--bg-1,#0c0f0d);border:1px solid var(--border-soft);border-radius:6px;padding:7px;color:var(--text-1);font-size:var(--fs-sm)"></label>
      </div>
      <div style="display:flex;align-items:center;gap:16px;margin-top:10px;font-size:var(--fs-sm);color:var(--text-2)">
        <label style="display:flex;align-items:center;gap:6px"><input type="checkbox" id="vOpt" checked> Optimizer enabled</label>
        <label style="display:flex;align-items:center;gap:6px"><input type="checkbox" id="vIr" checked> via-IR</label>
        <button class="btn primary" id="vSubmit" style="margin-left:auto">${icon('verify',14)} Verify</button>
      </div>
      <div id="vResult" style="margin-top:12px"></div>`}
    </div>`;
  }

  function wireVerifyForm() {
    const btn = document.getElementById('vSubmit');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      const source = (document.getElementById('vSource') || {}).value || '';
      const out = document.getElementById('vResult');
      if (!source.trim()) { if (out) out.innerHTML = `<div class="banner warn">${icon('search',14)} Paste the contract source first.</div>`; return; }
      btn.disabled = true; btn.innerHTML = 'Compiling…';
      if (out) out.innerHTML = '';
      try {
        const payload = {
          address: addr,
          source,
          contractName: (document.getElementById('vName') || {}).value || undefined,
          optimizer: (document.getElementById('vOpt') || {}).checked,
          viaIR: (document.getElementById('vIr') || {}).checked,
          runs: parseInt((document.getElementById('vRuns') || {}).value) || 200,
          evmVersion: (document.getElementById('vEvm') || {}).value || 'shanghai',
        };
        const r = await api.verifyContract(payload);
        if (r && r.verified) {
          verifiedContract = null; cache['contract:1'] = null;
          if (out) out.innerHTML = `<div class="banner" style="background:rgba(45,212,191,.08);border:1px solid var(--teal);color:var(--teal);padding:10px 14px;border-radius:8px">${icon('verify',15)} Verified (${esc(r.matchType)} match) as <strong>${esc(r.contractName)}</strong>. Reloading…</div>`;
          setTimeout(() => loadTab('contract'), 900);
        } else {
          const detail = r && r.details ? `<pre class="mono" style="margin-top:8px;font-size:var(--fs-xs);white-space:pre-wrap;color:var(--text-3)">${esc((r.details || []).join('\n'))}</pre>` : '';
          if (out) out.innerHTML = `<div class="banner warn" style="padding:10px 14px">${icon('search',15)} ${esc((r && r.error) || 'verification failed')}${detail}</div>`;
        }
      } catch (e) {
        if (out) out.innerHTML = `<div class="banner warn">${icon('search',14)} ${esc(e.message)}</div>`;
      } finally {
        btn.disabled = false; btn.innerHTML = `${icon('verify',14)} Verify`;
      }
    });
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
