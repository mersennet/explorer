// Dashboard: hero, live KPIs, the "verifiable chain" + "shielded pool" highlights,
// and real-time block/tx feeds (WS newHeads, polling fallback).
import { CONFIG } from '../config.js';
import { rpc, rpcBatch, getBlockNumber, getGasPrice, getValidators, getShieldedRoot, getLatestStateProof } from '../rpc.js';
import { api } from '../api.js';
import { ws } from '../ws.js';
import { render, icon, logoSvg, hashLink, addrLink, sparkline, skeletonRows, emptyState } from '../ui.js';
import { fmtNum, fmtMrsn, compact, hexToNum, hexToBig, timeAgo, fmtMrsn as mrsn, gasPct, shortHash } from '../format.js';
import { KNOWN_METHODS, KNOWN_CONTRACTS } from '../config.js';

// "placeOrder" / "transfer" / contract tag from the calldata selector.
function methodBadge(tx) {
  const input = tx.input || '0x';
  if (!input || input === '0x' || input.length < 10) return '<span class="badge method">transfer</span>';
  const sel = input.slice(0, 10).toLowerCase();
  const name = KNOWN_METHODS[sel];
  if (name) return `<span class="badge accent">${name}</span>`;
  const known = tx.to && KNOWN_CONTRACTS[String(tx.to).toLowerCase()];
  if (known) return `<span class="badge ${known.tag === 'privacy' ? 'teal' : 'accent'}">${known.tag || known.name}</span>`;
  return `<span class="badge method" title="${sel}">${sel}</span>`;
}

const RECENT = 14;

export default async function home() {
  render(`
    <section class="hero compact">
      <div style="display:flex;align-items:center;gap:12px">${logoSvg(30)}
        <h1 style="margin:0">The <span class="g">private, verifiable</span> explorer</h1></div>
      <div style="display:flex;align-items:center;gap:8px;margin-left:auto">
        <span class="badge teal">${icon('lock',12)} ZK-native L1</span>
        <span class="badge accent">Chain ${CONFIG.chainId}</span></div>
      <div class="tagline">Blocks, transactions, the native order book, validators and the shielded / proven state of the Mersennet testnet.</div>
    </section>
    <div class="grid cols-4" id="kpis">${kpiSkeleton()}</div>
    <div class="grid cols-2" style="margin-top:14px">
      <a class="card pad glow-teal" href="/verify" style="display:block">
        <div class="card-title" style="padding:0 0 12px;border:none"><span>${icon('verify',16)} Verifiable chain</span><span class="badge teal" id="proofChip">checking…</span></div>
        <div id="verifyHome" style="color:var(--text-2);font-size:var(--fs-sm)">Every block is provable with a succinct SP1 state-transition proof.</div>
      </a>
      <a class="card pad glow-teal" href="/privacy" style="display:block">
        <div class="card-title" style="padding:0 0 12px;border:none"><span>${icon('privacy',16)} Shielded pool</span><span class="badge teal" id="poolChip">checking…</span></div>
        <div id="poolHome" style="color:var(--text-2);font-size:var(--fs-sm)">Account-level privacy with an anonymity set that grows every block.</div>
      </a>
    </div>
    <div class="grid cols-2" style="margin-top:14px">
      <div class="card">
        <div class="card-title"><span>Latest blocks</span><a class="link" href="/blocks">View all →</a></div>
        <table class="tbl"><tbody id="blocksBody">${skeletonRows(8, 3)}</tbody></table>
      </div>
      <div class="card">
        <div class="card-title"><span>Latest transactions</span><a class="link" href="/txs">View all →</a></div>
        <table class="tbl"><tbody id="txsBody">${skeletonRows(8, 3)}</tbody></table>
      </div>
    </div>`);

  let alive = true;
  const blocks = [];   // {number, ...} newest first
  const txs = [];      // {hash, from, to, value, block}

  function kpis(latest, gas, vals, shielded, tpsSeries) {
    const totalStake = (vals || []).reduce((a, v) => a + hexToBig(v.stake), 0n);
    const anon = shielded ? Math.max(0, (shielded.noteCount || 0) - (shielded.nullifierCount || 0)) : 0;
    const tps = tpsSeries.length ? (tpsSeries.reduce((a, b) => a + b, 0) / tpsSeries.length / CONFIG.blockTimeSecs) : 0;
    document.getElementById('kpis').innerHTML = `
      ${stat('blocks', 'Latest block', '#' + fmtNum(latest), timeAgo(blocks[0]?.timestamp), sparkline(tpsSeries.map(x=>x+0.2)))}
      ${stat('pulse', 'Throughput', tps.toFixed(2) + ' tps', RECENT + '-block avg')}
      ${stat('gas', 'Base fee', gas != null ? fmtGwei(hexToNum(gas)) : '—', 'EIP-1559')}
      ${stat('validators', 'Validators', fmtNum((vals || []).length), compact(Number(totalStake / (10n ** 18n))) + ' MRSN staked')}
      ${stat('coins', 'Supply cap', '618.97M', '2⁸⁹−1 · Mersenne prime')}
      ${stat('clock', 'Block time', '~' + CONFIG.blockTimeSecs + 's', 'leader-gated BFT')}
      ${statTeal('privacy', 'Shielded pool', anon > 0 ? fmtNum(anon) : 'opens at fork', anon > 0 ? (shielded?.noteCount||0)+' notes · '+(shielded?.nullifierCount||0)+' spent' : 'root anchored every block · private trading at the privacy hard fork')}
      ${statTeal('coins', 'Emission', compact(CONFIG.emissionTotalMrsn), 'converges, halving 33.5M blk')}`;
  }
  const stat = (ic, label, val, meta, spark = '') => `<div class="stat"><div class="label">${icon(ic,13)} ${label}</div><div class="value">${val}</div><div class="meta">${meta||''}</div>${spark}</div>`;
  const statTeal = (ic, label, val, meta) => `<div class="stat teal"><div class="label">${icon(ic,13)} ${label}</div><div class="value">${val}</div><div class="meta">${meta||''}</div></div>`;

  function renderBlocks() {
    const b = document.getElementById('blocksBody'); if (!b) return;
    b.innerHTML = blocks.slice(0, 8).map((bl) => `
      <tr><td>${icon('blocks',14)} ${hashLink(String(bl.number), 'block', {short:false}).replace('hash link','hash link')}</td>
      <td style="color:var(--text-2)">${bl.txCount} txs · ${addrLink(bl.miner, {short:true})}</td>
      <td class="num" style="color:var(--text-3)">${timeAgo(bl.timestamp)}</td></tr>`).join('') || skeletonRows(6,3);
  }
  function renderTxs() {
    const t = document.getElementById('txsBody'); if (!t) return;
    // What each transaction DID matters more than a "0 MRSN" value column:
    // almost every testnet tx is a precompile call (placeOrder, cancelOrder,
    // depositCollateral…), so decode the method and show the value only when
    // MRSN actually moved.
    t.innerHTML = txs.slice(0, 8).map((tx) => `
      <tr><td>${hashLink(tx.hash, 'tx', { lead: 8, tail: 6 })}</td>
      <td style="color:var(--text-2);font-size:var(--fs-xs)">${methodBadge(tx)} ${addrLink(tx.from)} ${icon('arrow',11)} ${tx.to ? addrLink(tx.to) : '<span class="badge neutral">create</span>'}</td>
      <td class="num">${hexToBig(tx.value || '0x0') > 0n ? fmtMrsn(tx.value) + ' <span style="color:var(--text-3)">MRSN</span>' : '<span style="color:var(--text-3)">—</span>'}</td></tr>`).join('')
      || `<tr><td colspan="3">${emptyState('No transactions yet', 'CLOB trading happens via native order-book events, not EVM transactions — see a block\u2019s on-chain activity.', 'tx')}</td></tr>`;
  }

  function ingestBlock(bl, prepend) {
    const num = hexToNum(bl.number);
    if (blocks.some((x) => x.number === num)) return;
    const rec = { number: num, timestamp: hexToNum(bl.timestamp), miner: bl.miner || bl.proposer,
      txCount: Array.isArray(bl.transactions) ? bl.transactions.length : 0, txs: bl.transactions };
    if (prepend) blocks.unshift(rec); else blocks.push(rec);
    blocks.sort((a, b) => b.number - a.number);
    if (blocks.length > 30) blocks.length = 30;
    // pull tx objects if present
    if (Array.isArray(bl.transactions) && bl.transactions.length && typeof bl.transactions[0] === 'object') {
      for (const tx of bl.transactions) {
        if (txs.some((x) => x.hash === tx.hash)) continue;
        txs.unshift({ hash: tx.hash, from: tx.from, to: tx.to, value: tx.value, input: tx.input, block: num });
      }
      if (txs.length > 30) txs.length = 30;
    }
  }

  // initial load: latest N blocks (full) in one batch. If the RPC is down the
  // page keeps its shell and says so instead of throwing into the router's
  // "Failed to load this page".
  let headHex;
  try { headHex = await getBlockNumber(); } catch { headHex = null; }
  if (headHex == null) {
    const b = document.getElementById('blocksBody'); const t = document.getElementById('txsBody');
    if (b) b.innerHTML = `<tr><td colspan="3">${emptyState('RPC unavailable', 'The public node is not answering right now. This page retries every 10 seconds; live status at status.mersennet.com.')}</td></tr>`;
    if (t) t.innerHTML = '';
    const retry = setTimeout(() => { if (alive) home(); }, 10_000);
    return () => { alive = false; clearTimeout(retry); };
  }
  const latest = hexToNum(headHex);
  const nums = []; for (let i = 0; i < RECENT && latest - i >= 0; i++) nums.push(latest - i);
  const [gas, vals, shielded, proof] = await Promise.all([getGasPrice(), getValidators(), getShieldedRoot(), getLatestStateProof()]);
  const full = await rpcBatch(nums.map((n) => ({ method: 'eth_getBlockByNumber', params: ['0x' + n.toString(16), true] })));
  if (!alive) return;
  full.filter(Boolean).forEach((bl) => ingestBlock(bl, false));
  // Recent blocks are usually empty of EVM txs (CLOB trades are domain events,
  // not transactions) — backfill the tx feed from the indexer archive so the
  // widget shows the latest real transactions instead of loading forever.
  if (txs.length < 8) {
    const idxTxs = await api.txs(1, 8);
    if (idxTxs && Array.isArray(idxTxs.transactions)) {
      for (const t of idxTxs.transactions) {
        if (txs.some((x) => x.hash === t.hash)) continue;
        txs.push({ hash: t.hash, from: t.from_addr, to: t.to_addr, value: t.value, block: Number(t.block_number) });
      }
    }
  }
  if (!alive) return;
  const tpsSeries = blocks.map((b) => b.txCount).reverse();
  kpis(latest, gas, vals, shielded, tpsSeries);
  renderBlocks(); renderTxs();

  // verifiable-chain + shielded-pool highlight chips
  const proofChip = document.getElementById('proofChip');
  if (proof && proof.proof !== null && proof.blockHeight) {
    proofChip.textContent = (proof.proofType || 'SP1') + ' @ #' + proof.blockHeight;
    document.getElementById('verifyHome').innerHTML = `Block <span class="mono">#${fmtNum(proof.blockHeight)}</span> is proven: state root <span class="mono" style="color:var(--teal)">${shortHash(proof.newStateRoot,8,6)}</span>${proof.prevStateRoot && proof.prevStateRoot !== proof.newStateRoot ? ` (from ${shortHash(proof.prevStateRoot,6,4)})` : ''}. Verify it yourself →`;
  } else { proofChip.textContent = 'fork pending'; proofChip.className = 'badge warn';
    document.getElementById('verifyHome').textContent = 'SP1 state proofs activate at the privacy hard fork. The proof machinery is live and queryable.'; }
  const poolChip = document.getElementById('poolChip');
  if (shielded) { const anon = Math.max(0, (shielded.noteCount||0)-(shielded.nullifierCount||0));
    poolChip.textContent = anon > 0 ? anon + ' in set' : 'root live';
    document.getElementById('poolHome').innerHTML = `Shielded state root <span class="mono" style="color:var(--teal)">${shortHash(shielded.shieldedStateRoot,8,6)}</span> as of block #${fmtNum(shielded.blockNumber)}.`;
  } else { poolChip.textContent = 'n/a'; poolChip.className = 'badge neutral'; }

  // live updates via WS newHeads; if WS silent, poll
  let lastSeen = latest;
  const unsub = ws.subscribe('newHeads', async (head) => {
    const n = hexToNum(head.number); if (n <= lastSeen) return; lastSeen = n;
    const bl = await rpc('eth_getBlockByNumber', ['0x' + n.toString(16), true]).catch(() => null);
    if (!bl || !alive) return; ingestBlock(bl, true);
    kpis(n, gas, vals, shielded, blocks.map(b=>b.txCount).slice(0,RECENT).reverse());
    flash(); renderTxs();
  });
  function flash() {
    const b = document.getElementById('blocksBody'); if (!b) return; renderBlocks();
    const first = b.querySelector('tr'); if (first) first.classList.add('row-enter');
  }
  const poll = setInterval(async () => {
    if (ws.connected) return;
    const n = hexToNum(await getBlockNumber().catch(() => '0x0'));
    if (n > lastSeen) { lastSeen = n; const bl = await rpc('eth_getBlockByNumber', ['0x'+n.toString(16), true]).catch(()=>null);
      if (bl && alive) { ingestBlock(bl, true); kpis(n, gas, vals, shielded, blocks.map(b=>b.txCount).slice(0,RECENT).reverse()); renderBlocks(); renderTxs(); } }
  }, CONFIG.pollMs);

  return () => { alive = false; clearInterval(poll); try { unsub(); } catch {} };
}

function kpiSkeleton() { let s = ''; for (let i = 0; i < 8; i++) s += `<div class="stat"><div class="sk line short"></div><div class="sk line" style="height:24px;margin-top:10px"></div></div>`; return s; }

// Base fee in gwei when readable, wei otherwise (matches the block detail page).
function fmtGwei(wei) {
  if (!Number.isFinite(wei) || wei <= 0) return `${fmtNum(wei || 0)} wei`;
  const gwei = wei / 1e9;
  if (gwei >= 0.001) return (gwei >= 10 ? fmtNum(Math.round(gwei)) : String(+gwei.toFixed(3))) + ' gwei';
  return `${fmtNum(wei)} wei`;
}
