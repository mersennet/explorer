// Network: chain facts, RPC/WS endpoints, native precompiles & known contracts,
// a live node-status probe (web3_clientVersion + net_peerCount), an "Add to wallet"
// button (wallet_addEthereumChain), and quick links to docs/trade/faucet.
// Pure-RPC; no indexer dependency.
import { CONFIG, KNOWN_CONTRACTS } from '../config.js';
import { rpcSafe, rpcBatch, getBlockNumber } from '../rpc.js';
import { render, icon, copyBtn, toast, sparkline } from '../ui.js';
import { fmtNum, hexToNum, hexToBig, timeAgo, shortAddr, esc } from '../format.js';

// read-only methods offered in the RPC playground (with example params)
const RPC_METHODS = [
  { m: 'eth_blockNumber', p: [] },
  { m: 'eth_chainId', p: [] },
  { m: 'eth_gasPrice', p: [] },
  { m: 'eth_getBalance', p: ['0x0000000000000000000000000000000000000000', 'latest'] },
  { m: 'eth_getBlockByNumber', p: ['latest', false] },
  { m: 'eth_getTransactionByHash', p: ['0x'] },
  { m: 'eth_getTransactionReceipt', p: ['0x'] },
  { m: 'eth_getCode', p: ['0x0000000000000000000000000000000000000100', 'latest'] },
  { m: 'net_peerCount', p: [] },
  { m: 'mersennet_peers', p: [] },
  { m: 'web3_clientVersion', p: [] },
  { m: 'mersennet_validators', p: [] },
  { m: 'mersennet_getShieldedRoot', p: [] },
  { m: 'mersennet_getShieldedMarketAggregates', p: [] },
  { m: 'mersennet_orders_getOrderBook', p: [1] },
  { m: 'mersennet_getLatestStateProof', p: [] },
  { m: 'mersennet_getCodeAttestation', p: ['0x0000000000000000000000000000000000000100'] },
];

export default async function network() {
  render(`
    <div class="page-head">
      <h1>${icon('network', 24)} Network</h1>
      <div class="sub">Chain parameters, endpoints, and native contracts for ${esc(CONFIG.chainName)}.</div>
    </div>

    <div class="grid cols-2-1">
      <div class="card">
        <div class="card-title"><span>${icon('network', 16)} Chain parameters</span>
          <button class="btn primary" id="addWallet">${icon('wallet', 15)}<span>Add to wallet</span></button></div>
        <div class="kv">
          ${kv('network', 'Network name', esc(CONFIG.chainName))}
          ${kv('layers', 'Chain ID', `<span class="mono">${CONFIG.chainId}</span> <span class="badge neutral">${CONFIG.chainIdHex}</span> <span style="color:var(--text-3);font-size:var(--fs-xs)">2¹⁷−1 · Mersenne prime</span>`)}
          ${kv('layers', 'Mainnet chain ID', `<span class="mono">${CONFIG.mainnetChainId}</span> <span style="color:var(--text-3);font-size:var(--fs-xs)">2¹³−1 · Mersenne prime</span>`)}
          ${kv('clock', 'Block time', `~${CONFIG.blockTimeSecs}s`)}
          ${kv('shield', 'Consensus', `HotStuff-2 BFT PoS`)}
          ${kv('coins', 'Native currency', `${esc(CONFIG.symbol)} · ${CONFIG.decimals} decimals`)}
          ${kvCopy('arrow', 'RPC (HTTPS)', CONFIG.canonicalRpc)}
          ${kvCopy('bolt', 'WebSocket', CONFIG.wsUrl)}
          ${kvCopy('home', 'Explorer', location.origin)}
        </div>
      </div>

      <div class="card pad">
        <div class="card-title" style="padding:0 0 12px;border:none"><span>${icon('pulse', 16)} Node status</span>
          <span class="badge neutral" id="nodeChip">probing…</span></div>
        <div id="nodeStatus" style="font-size:var(--fs-sm);color:var(--text-2)">
          <div class="sk line" style="margin:10px 0"></div>
          <div class="sk line short" style="margin:10px 0"></div>
        </div>
        <div style="margin-top:16px;display:flex;flex-direction:column;gap:8px" id="quickLinks"></div>
      </div>
    </div>

    <div class="card" id="nodesCard" style="margin-top:14px">
      <div class="card-title"><span>${icon('network', 16)} Network nodes</span>
        <span class="badge neutral" id="nodesMeta">loading…</span></div>
      <div style="padding:0 18px 10px;font-size:12px;color:var(--text-3);line-height:1.5">
        Peers of the public RPC node, as reported by <span class="mono">mersennet_peers</span>. Anyone can join — a node appears here about a minute after it starts gossiping
        (<a href="https://docs.mersennet.com/validators/run-a-node/" target="_blank" rel="noopener">run a node →</a>). Community nodes are shown by network prefix and a stable id; <span class="mono">mersennet-check</span> prints the same id on the operator's machine.
      </div>
      <div style="overflow-x:auto"><table class="tbl">
        <thead><tr><th>Node</th><th>Role</th><th class="num">First seen</th><th class="num">Last seen</th></tr></thead>
        <tbody id="nodesBody"><tr><td colspan="4"><div class="sk line"></div></td></tr></tbody>
      </table></div>
    </div>

    <div class="card" id="activityCard" style="margin-top:14px">
      <div class="card-title"><span>${icon('pulse', 16)} Live activity &amp; fee market</span>
        <span class="badge neutral" id="actMeta">sampling…</span></div>
      <div class="grid cols-4" id="actStats" style="padding:14px 18px 0">${actSkeleton()}</div>
      <div class="pad">
        <div class="act-legend"><span>${icon('blocks',12)} gas used per block (last 60)</span><span id="actSpark"></span></div>
        <div class="act-bars" id="actBars"><div class="sk line" style="height:46px"></div></div>
      </div>
    </div>

    <div class="card" style="margin-top:14px">
      <div class="card-title"><span>${icon('bolt', 16)} RPC playground</span>
        <span class="badge neutral">read-only · live node</span></div>
      <div class="pad">
        <div class="pg-controls">
          <select id="pgMethod" class="pg-input mono">${RPC_METHODS.map((x, i) => `<option value="${i}">${esc(x.m)}</option>`).join('')}</select>
          <input id="pgParams" class="pg-input mono" spellcheck="false" autocomplete="off" value="[]"/>
          <button class="btn primary" id="pgSend">${icon('arrow', 15)} Send</button>
        </div>
        <div class="pg-hint" id="pgHint">params as a JSON array · Ctrl/⌘+Enter to send · POST ${esc(CONFIG.rpcUrl)}</div>
        <pre class="pg-out" id="pgOut">// pick a method and hit Send to query the live node</pre>
      </div>
    </div>

    <div class="card" style="margin-top:14px">
      <div class="card-title"><span>${icon('layers', 16)} Known contracts &amp; precompiles</span>
        <span class="badge neutral">${Object.keys(KNOWN_CONTRACTS).length} entries</span></div>
      <table class="tbl">
        <thead><tr><th>Address</th><th>Name</th><th>Kind</th><th>Notes</th></tr></thead>
        <tbody id="contractsBody"></tbody>
      </table>
    </div>`);

  wirePlayground();
  buildActivity();

  // --- Add to wallet (reuses the same params as the topbar wallet button in app.js) ---
  document.getElementById('addWallet').onclick = async () => {
    if (!window.ethereum) { toast('No wallet found'); return; }
    try {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: CONFIG.chainIdHex,
          chainName: CONFIG.chainName,
          nativeCurrency: { name: CONFIG.symbol, symbol: CONFIG.symbol, decimals: CONFIG.decimals },
          rpcUrls: [CONFIG.canonicalRpc],
          blockExplorerUrls: [location.origin],
        }],
      });
      toast('Mersennet added to wallet');
    } catch (_) { toast('Cancelled'); }
  };

  // --- quick links ---
  document.getElementById('quickLinks').innerHTML = [
    ['docs', 'Documentation', CONFIG.links.docs, 'home'],
    ['trade', 'Trade (CLOB)', CONFIG.links.trade, 'clob'],
    ['faucet', 'Testnet faucet', CONFIG.links.faucet, 'coins'],
  ].map(([, label, href, ic]) => `<a class="btn" style="justify-content:space-between" href="${esc(href)}" target="_blank" rel="noopener">
      <span style="display:inline-flex;align-items:center;gap:8px">${icon(ic, 15)} ${esc(label)}</span>${icon('ext', 14)}</a>`).join('');

  // --- known contracts table (privacy precompile flagged teal) ---
  document.getElementById('contractsBody').innerHTML = Object.entries(KNOWN_CONTRACTS).map(([addr, c]) => {
    const privacy = c.kind === 'privacy' || c.tag === 'privacy';
    const tagCls = privacy ? 'teal' : 'accent';
    return `<tr>
      <td><span class="mono hash">${shortAddr(addr)}</span> ${copyBtn(addr)}</td>
      <td><strong style="color:${privacy ? 'var(--teal)' : 'var(--text)'}">${esc(c.name)}</strong></td>
      <td><span class="badge ${tagCls}">${esc(c.tag || c.kind)}</span> <span class="badge neutral">${esc(c.kind)}</span></td>
      <td style="color:var(--text-2);font-size:var(--fs-sm)">${esc(c.note || '')}</td>
    </tr>`;
  }).join('');

  // --- network nodes list (refreshes every 30s while the page is mounted) ---
  renderNodes();
  if (nodesTimer) clearInterval(nodesTimer);
  nodesTimer = setInterval(renderNodes, 30_000);

  // --- live node status (rpcSafe → null tolerant) ---
  const [clientVersion, peerCount, chainIdHex] = await Promise.all([
    rpcSafe('web3_clientVersion'),
    rpcSafe('net_peerCount'),
    rpcSafe('eth_chainId'),
  ]);

  const chip = document.getElementById('nodeChip');
  const box = document.getElementById('nodeStatus');
  if (!chip || !box) return; // navigated away

  const reachable = clientVersion != null || chainIdHex != null;
  const chainOk = chainIdHex != null && parseInt(chainIdHex, 16) === CONFIG.chainId;
  chip.textContent = reachable ? 'online' : 'unreachable';
  chip.className = 'badge ' + (reachable ? 'ok' : 'warn');

  box.innerHTML = `
    ${nodeRow('Reachable', reachable ? '<span class="badge ok">yes</span>' : '<span class="badge warn">no</span>')}
    ${nodeRow('Client', clientVersion ? `<span class="mono" style="color:var(--text)">${esc(String(clientVersion))}</span>` : '<span style="color:var(--text-3)">unknown</span>')}
    ${nodeRow('Peers', peerCount != null ? `<span class="mono" style="color:var(--text)">${fmtNum(hexToNum(peerCount))}</span>` : '<span style="color:var(--text-3)">n/a</span>')}
    ${nodeRow('Reported chain ID', chainIdHex != null
      ? `<span class="mono" style="color:${chainOk ? 'var(--accent)' : 'var(--warn)'}">${parseInt(chainIdHex, 16)}</span>${chainOk ? '' : ' <span class="badge warn">mismatch</span>'}`
      : '<span style="color:var(--text-3)">n/a</span>')}`;
}

// ---- Network nodes (mersennet_peers on the public RPC node) ----
const FLEET = {
  '46.225.30.187': 'Public RPC · bootnode',
  '46.225.183.192': 'Validator #1 · bootnode',
  '49.13.54.79': 'Validator #2 · bootnode',
  '167.233.105.60': 'Validator #3',
  '167.233.118.149': 'Validator #4',
};

// Stable short id for a community node: first 6 hex chars of sha256(ip).
// mersennet-check computes the identical value from the node's public IP.
async function nodeId(ip) {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
    return [...new Uint8Array(buf)].slice(0, 3).map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch { return '——————'; }
}

function ago(secs) {
  if (secs == null) return '—';
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

// Verified node runners (trade.mersennet.com/points): operator wallets keyed
// by the same anonymous node id, so a community node can show as verified
// without the explorer ever seeing its IP from the API.
async function verifiedNodes() {
  try {
    const r = await fetch('https://trade.mersennet.com/api/v1/nodes/verified', { cache: 'no-store' });
    if (!r.ok) return new Map();
    const j = await r.json();
    return new Map((j.nodes || []).filter((n) => n.active).map((n) => [n.id, { operator: n.operator, build: n.build_sha || null, outdated: !!n.outdated }]));
  } catch { return new Map(); }
}

let nodesTimer = null;
async function renderNodes() {
  const body = document.getElementById('nodesBody');
  const meta = document.getElementById('nodesMeta');
  if (!body || !meta) { if (nodesTimer) clearInterval(nodesTimer); return; }
  const peers = await rpcSafe('mersennet_peers');
  if (!Array.isArray(peers)) {
    meta.textContent = 'unavailable';
    meta.className = 'badge warn';
    body.innerHTML = `<tr><td colspan="4" style="color:var(--text-3)">The public node does not expose its peer list yet.</td></tr>`;
    return;
  }
  const live = peers.filter((p) => p.heard);
  const verified = await verifiedNodes();
  const rows = await Promise.all(live.map(async (p) => {
    const ip = String(p.addr).replace(/:\d+$/, '');
    const fleet = FLEET[ip];
    const id = fleet ? '' : await nodeId(ip);
    const info = verified.get(id);
    const operator = info && info.operator;
    const build = info && info.build
      ? ` <span class="mono ${info.outdated ? 'badge warn' : ''}" style="${info.outdated ? '' : 'color:var(--text-3)'}" title="${info.outdated ? 'Behind the current release — the operator should re-run the installer before the next protocol switch' : 'Current release'}">${esc(info.build)}${info.outdated ? ' · upgrade' : ''}</span>`
      : '';
    const label = fleet
      ? `<span class="mono" style="color:var(--text)">${esc(p.addr)}</span>`
      : `<span class="mono" style="color:var(--text)">${esc(ip.split('.').slice(0, 2).join('.'))}.x.x</span> <span class="mono" style="color:var(--text-3)">· id ${id}</span>`;
    const role = fleet
      ? `<span class="badge accent">${esc(fleet)}</span>`
      : operator
        ? `<span class="badge ok">Verified node runner</span> <a class="mono" href="#/address/${esc(operator)}" style="color:var(--text-2)">${esc(operator.slice(0, 6))}…${esc(operator.slice(-4))}</a>${build}`
        : `<span class="badge ok">Community node</span>`;
    return `<tr><td>${label}</td><td>${role}</td><td class="num mono">${ago(p.firstSeenSecs)}</td><td class="num mono">${ago(p.lastSeenSecs)}</td></tr>`;
  }));
  const community = live.filter((p) => !FLEET[String(p.addr).replace(/:\d+$/, '')]).length;
  meta.textContent = `${live.length} connected · ${community} community`;
  meta.className = 'badge ' + (community > 0 ? 'ok' : 'neutral');
  body.innerHTML = rows.join('') || `<tr><td colspan="4" style="color:var(--text-3)">No peers reported.</td></tr>`;
}

const kv = (ic, k, v) => `<div class="k">${icon(ic, 13)} ${esc(k)}</div><div class="v">${v}</div>`;
const kvCopy = (ic, k, v) => `<div class="k">${icon(ic, 13)} ${esc(k)}</div>
  <div class="v"><span style="display:inline-flex;align-items:center;gap:6px"><span>${esc(v)}</span>${copyBtn(v)}</span></div>`;

const nodeRow = (k, v) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--border-soft)">
  <span style="color:var(--text-3)">${esc(k)}</span><span>${v}</span></div>`;

// ---- RPC playground (read-only console against the live node) ----
function wirePlayground() {
  const sel = document.getElementById('pgMethod');
  const pin = document.getElementById('pgParams');
  const btn = document.getElementById('pgSend');
  const out = document.getElementById('pgOut');
  const hint = document.getElementById('pgHint');
  if (!sel || !pin || !btn || !out) return;
  const sync = () => { pin.value = JSON.stringify(RPC_METHODS[+sel.value].p); };
  sync();
  sel.onchange = sync;
  async function send() {
    let params;
    try { params = JSON.parse(pin.value || '[]'); if (!Array.isArray(params)) throw 0; }
    catch { out.textContent = 'Params must be a JSON array, e.g. ["latest", false]'; out.className = 'pg-out err'; return; }
    const method = RPC_METHODS[+sel.value].m;
    out.textContent = 'querying…'; out.className = 'pg-out';
    const t0 = performance.now();
    try {
      const r = await fetch(CONFIG.rpcUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
      const json = await r.json();
      const ms = (performance.now() - t0).toFixed(0);
      out.textContent = JSON.stringify(json, null, 2);
      out.className = 'pg-out ' + (json.error ? 'err' : 'ok');
      if (hint) hint.textContent = `${method} · ${ms} ms · HTTP ${r.status}`;
    } catch (e) { out.textContent = 'Request failed: ' + ((e && e.message) || e); out.className = 'pg-out err'; }
  }
  btn.onclick = send;
  pin.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') send(); });
}

// ---- live activity + fee market (samples recent block headers via RPC) ----
async function buildActivity() {
  const meta = document.getElementById('actMeta');
  let latest = 0;
  try { latest = hexToNum(await getBlockNumber()); } catch {}
  const N = Math.min(60, latest + 1);
  const fail = () => { if (meta) { meta.textContent = 'unavailable'; meta.className = 'badge warn'; }
    const b = document.getElementById('actBars'); if (b) b.innerHTML = '<div style="color:var(--text-3);font-size:var(--fs-sm)">Could not sample recent blocks.</div>'; };
  if (N <= 0) return fail();
  const nums = []; for (let i = 0; i < N; i++) nums.push(latest - i);
  const headers = (await rpcBatch(nums.map((n) => ({ method: 'eth_getBlockByNumber', params: ['0x' + n.toString(16), false] })))).filter(Boolean);
  if (!headers.length) return fail();

  const series = headers.map((h) => ({ num: hexToNum(h.number), gas: hexToNum(h.gasUsed), bf: hexToNum(h.baseFeePerGas || '0x0'),
    txs: Array.isArray(h.transactions) ? h.transactions.length : 0 }));
  const chrono = series.slice().reverse();
  const maxGas = Math.max(1, ...series.map((s) => s.gas));
  const baseFee = headers[0].baseFeePerGas != null ? hexToBig(headers[0].baseFeePerGas) : null;
  const tsNew = hexToNum(headers[0].timestamp), tsOld = hexToNum(headers[headers.length - 1].timestamp);
  const bt = headers.length > 1 ? (tsNew - tsOld) / (headers.length - 1) : null;
  const txTotal = series.reduce((a, s) => a + s.txs, 0);

  if (meta) { meta.textContent = `${headers.length} blocks`; meta.className = 'badge accent'; }

  const stats = document.getElementById('actStats');
  if (stats) stats.innerHTML =
    actStat('blocks', 'Head', '#' + fmtNum(latest), timeAgo(tsNew)) +
    actStat('clock', 'Block time', bt != null ? bt.toFixed(2) + 's' : '—', 'measured') +
    actStat('bolt', 'Base fee', baseFee != null ? fmtNum(baseFee) + ' wei' : '—', 'current head') +
    actStat('tx', 'Throughput', (txTotal / headers.length).toFixed(2) + ' tx/blk', fmtNum(txTotal) + ' tx in window');

  const bars = document.getElementById('actBars');
  if (bars) bars.innerHTML = chrono.map((s) => {
    const pct = Math.max(3, (s.gas / maxGas) * 100);
    return `<a class="act-bar${s.gas ? ' on' : ''}" href="/block/${s.num}" title="block #${fmtNum(s.num)} · gas ${fmtNum(s.gas)} · ${s.txs} tx" style="height:${pct.toFixed(0)}%"></a>`;
  }).join('');
  const spark = document.getElementById('actSpark');
  if (spark) spark.innerHTML = sparkline(chrono.map((s) => s.bf), { w: 120, h: 24 });
}

const actStat = (ic, label, val, meta) =>
  `<div class="stat"><div class="label">${icon(ic, 13)} ${esc(label)}</div><div class="value sm">${val}</div><div class="meta">${esc(meta || '')}</div></div>`;
function actSkeleton() {
  let s = ''; for (let i = 0; i < 4; i++) s += `<div class="stat"><div class="sk line short"></div><div class="sk line" style="height:20px;margin-top:8px"></div></div>`;
  return s;
}
