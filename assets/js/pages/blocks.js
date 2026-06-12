// Blocks: paginated block list, newest first. RPC-first — read the latest height
// then batch-fetch a window of headers (eth_getBlockByNumber [hex,false]). The
// indexer (api.js) is optional: when available we use it for an exact total /
// page count, but the page works fully on pure RPC alone.
import { CONFIG } from '../config.js';
import { rpcBatch, getBlockNumber, getBlock } from '../rpc.js';
import { api } from '../api.js';
import { ws } from '../ws.js';
import { render, icon, hashLink, addrLink, skeletonRows, emptyState } from '../ui.js';
import { fmtNum, hexToNum, hexToBig, timeAgo, gasPct } from '../format.js';

const PER = CONFIG.itemsPerPage;

export default async function blocks(params = {}) {
  let alive = true;
  // page is 1-based; page 1 = newest. Read from the hash query (?page=) if present.
  let page = Math.max(1, parseInt(params.page || pageFromHash(), 10) || 1);

  render(`
    <div class="page-head">
      <h1>${icon('blocks', 24)} Blocks</h1>
      <div class="sub" id="blocksSub">Latest blocks, newest first.</div>
    </div>
    <div id="indexerNote"></div>
    <div class="card">
      <div class="card-title"><span>Block list</span><span id="rangeChip" class="badge neutral">—</span></div>
      <div style="overflow-x:auto">
        <table class="tbl">
          <thead><tr>
            <th>Block</th><th>Age</th><th class="num">Txns</th>
            <th>Proposer</th><th>Gas used</th><th class="num">Base fee</th>
          </tr></thead>
          <tbody id="blocksBody">${skeletonRows(PER, 6)}</tbody>
        </table>
      </div>
      <div class="pager" id="pager"></div>
    </div>`);

  let latest = 0;
  let total = null;     // exact count from indexer when available

  async function load() {
    const body = document.getElementById('blocksBody');
    if (body) body.innerHTML = skeletonRows(PER, 6);

    // RPC-first: latest height is the source of truth.
    try { latest = hexToNum(await getBlockNumber()); }
    catch { if (alive) renderError(); return; }
    if (!alive) return;

    // optional indexer total (does not gate the RPC path)
    if (api.available) {
      const meta = await api.blocks(1, 1).catch(() => null);
      if (meta && typeof meta.total === 'number') total = meta.total;
    }

    const top = latest - (page - 1) * PER;            // highest block on this page
    if (top < 0) { renderEmpty(); renderPager(); return; }

    const nums = [];
    for (let i = 0; i < PER && top - i >= 0; i++) nums.push(top - i);
    const rows = await rpcBatch(nums.map((n) => ({
      method: 'eth_getBlockByNumber', params: ['0x' + n.toString(16), false],
    })));
    if (!alive) return;

    const blocks = rows.filter(Boolean);
    if (!blocks.length) { renderEmpty(); renderPager(); return; }
    renderRows(blocks);
    renderPager();
    updateChips();
  }

  function blockRow(bl) {
    const num = hexToNum(bl.number);
    const txs = Array.isArray(bl.transactions) ? bl.transactions.length : 0;
    const pct = gasPct(bl.gasUsed, bl.gasLimit);
    const proposer = bl.miner || bl.proposer;
    const baseFee = bl.baseFeePerGas != null ? fmtNum(hexToNum(bl.baseFeePerGas)) + ' wei' : '—';
    return `<tr data-bn="${num}">
      <td>${icon('blocks', 14)} <a class="hash link" href="#/block/${num}">${fmtNum(num)}</a></td>
      <td style="color:var(--text-3)">${timeAgo(bl.timestamp)}</td>
      <td class="num">${txs ? fmtNum(txs) : '<span style="color:var(--text-3)">0</span>'}</td>
      <td style="font-size:var(--fs-xs)">${proposer ? addrLink(proposer, { short: true }) : '—'}</td>
      <td>${gasBar(pct, bl.gasUsed)}</td>
      <td class="num" style="color:var(--text-2)">${baseFee}</td>
    </tr>`;
  }

  function renderRows(blocks) {
    const body = document.getElementById('blocksBody'); if (!body) return;
    body.innerHTML = blocks.map(blockRow).join('');
  }

  // live: prepend new blocks while viewing page 1 (newest)
  async function onNewHead(h) {
    if (!alive || !h) return;
    const num = hexToNum(h.number);
    if (!num || num <= latest) return;
    latest = num;
    updateChips();
    if (page !== 1) return;
    const body = document.getElementById('blocksBody');
    if (!body || body.querySelector(`tr[data-bn="${num}"]`)) return;
    let bl = null;
    try { bl = await getBlock('0x' + num.toString(16), false); } catch {}
    if (!alive || !bl || !body.isConnected) return;
    if (body.querySelector(`tr[data-bn="${num}"]`)) return;
    body.insertAdjacentHTML('afterbegin', blockRow(bl));
    const first = body.querySelector('tr'); if (first) first.classList.add('row-enter');
    const trs = body.querySelectorAll('tr');
    for (let i = trs.length - 1; i >= PER; i--) trs[i].remove();
  }

  function gasBar(pct, used) {
    return `<div style="display:flex;align-items:center;gap:8px">
      <div style="flex:none;width:64px;height:6px;border-radius:3px;background:var(--bg-elev);overflow:hidden">
        <div style="width:${pct.toFixed(1)}%;height:100%;background:var(--grad-accent)"></div>
      </div>
      <span style="font-family:var(--font-mono);font-size:var(--fs-xs);color:var(--text-2)">${pct.toFixed(0)}%</span>
      <span style="font-family:var(--font-mono);font-size:var(--fs-xs);color:var(--text-3)">${fmtNum(hexToNum(used))}</span>
    </div>`;
  }

  function updateChips() {
    const top = latest - (page - 1) * PER;
    const bottom = Math.max(0, top - PER + 1);
    const chip = document.getElementById('rangeChip');
    if (chip) chip.textContent = `#${fmtNum(bottom)} – #${fmtNum(top)}`;
    const sub = document.getElementById('blocksSub');
    if (sub) sub.innerHTML = total != null
      ? `${fmtNum(total)} blocks indexed · latest #${fmtNum(latest)}`
      : `Latest block #${fmtNum(latest)} · newest first.`;
    const note = document.getElementById('indexerNote');
    if (note) note.innerHTML = api.available ? '' :
      `<div class="banner info" style="margin-bottom:14px">${icon('network', 16)} Indexer offline — paginating live over RPC.</div>`;
  }

  function renderPager() {
    const p = document.getElementById('pager'); if (!p) return;
    // total pages: from indexer total when known, else derived from latest height.
    const pages = total != null
      ? Math.max(1, Math.ceil(total / PER))
      : Math.max(1, Math.floor(latest / PER) + 1);
    const hasPrev = page > 1;
    const hasNext = page < pages;
    p.innerHTML = `
      <button class="btn sq" data-go="first" ${hasPrev ? '' : 'disabled'} title="Newest">«</button>
      <button class="btn sq" data-go="prev" ${hasPrev ? '' : 'disabled'} title="Newer">‹</button>
      <span style="font-size:var(--fs-sm);color:var(--text-2);padding:0 8px">Page ${fmtNum(page)} of ${fmtNum(pages)}</span>
      <button class="btn sq" data-go="next" ${hasNext ? '' : 'disabled'} title="Older">›</button>
      <button class="btn sq" data-go="last" ${hasNext ? '' : 'disabled'} title="Oldest">»</button>`;
    p.querySelectorAll('button[data-go]').forEach((b) => {
      b.onclick = () => {
        if (b.disabled) return;
        const go = b.dataset.go;
        if (go === 'first') page = 1;
        else if (go === 'prev') page = Math.max(1, page - 1);
        else if (go === 'next') page = page + 1;
        else if (go === 'last') page = pages;
        setHashPage(page);
        load();
      };
    });
  }

  function renderEmpty() {
    const body = document.getElementById('blocksBody'); if (!body) return;
    body.innerHTML = `<tr><td colspan="6">${emptyState('No blocks on this page', 'Jump back to the newest blocks.', 'blocks')}</td></tr>`;
  }
  function renderError() {
    const body = document.getElementById('blocksBody'); if (!body) return;
    body.innerHTML = `<tr><td colspan="6">${emptyState('Could not reach the node', 'The RPC endpoint is unavailable right now.', 'network')}</td></tr>`;
  }

  await load();
  const unsub = ws.subscribe('newHeads', onNewHead);
  return () => { alive = false; try { unsub(); } catch {} };
}

// keep ?page= in the hash query so pagination is shareable / survives back-nav
function pageFromHash() {
  const m = location.hash.match(/[?&]page=(\d+)/);
  return m ? m[1] : '1';
}
function setHashPage(p) {
  const base = location.hash.replace(/^#\/?/, '').split('?')[0];
  const next = '#/' + base + (p > 1 ? `?page=${p}` : '');
  if (location.hash !== next) history.replaceState(null, '', next);
}
