// Network: chain facts, RPC/WS endpoints, native precompiles & known contracts,
// a live node-status probe (web3_clientVersion + net_peerCount), an "Add to wallet"
// button (wallet_addEthereumChain), and quick links to docs/trade/faucet/dashboard.
// Pure-RPC; no indexer dependency.
import { CONFIG, KNOWN_CONTRACTS } from '../config.js';
import { rpcSafe } from '../rpc.js';
import { render, icon, copyBtn, toast } from '../ui.js';
import { fmtNum, hexToNum, shortAddr, esc } from '../format.js';

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

    <div class="card" style="margin-top:14px">
      <div class="card-title"><span>${icon('layers', 16)} Known contracts &amp; precompiles</span>
        <span class="badge neutral">${Object.keys(KNOWN_CONTRACTS).length} entries</span></div>
      <table class="tbl">
        <thead><tr><th>Address</th><th>Name</th><th>Kind</th><th>Notes</th></tr></thead>
        <tbody id="contractsBody"></tbody>
      </table>
    </div>`);

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
    ['dashboard', 'Dashboard', CONFIG.links.dashboard, 'pulse'],
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

const kv = (ic, k, v) => `<div class="k">${icon(ic, 13)} ${esc(k)}</div><div class="v">${v}</div>`;
const kvCopy = (ic, k, v) => `<div class="k">${icon(ic, 13)} ${esc(k)}</div>
  <div class="v"><span style="display:inline-flex;align-items:center;gap:6px"><span>${esc(v)}</span>${copyBtn(v)}</span></div>`;

const nodeRow = (k, v) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--border-soft)">
  <span style="color:var(--text-3)">${esc(k)}</span><span>${v}</span></div>`;
