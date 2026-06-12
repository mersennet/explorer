// Transactions list. RPC-first: walk back recent full blocks collecting TxDto
// until a page is filled. If the indexer is available, use api.txs for deeper
// history (and label the source). This testnet's activity is mostly CLOB, so
// EVM txs can be sparse — show a friendly empty state pointing at the order book.
import { CONFIG, KNOWN_METHODS, KNOWN_CONTRACTS } from '../config.js';
import { rpc, rpcBatch, getBlockNumber } from '../rpc.js';
import { api } from '../api.js';
import { ws } from '../ws.js';
import { render, icon, hashLink, addrLink, skeletonRows, emptyState } from '../ui.js';
import { fmtMrsn, fmtNum, hexToNum, timeAgo, esc } from '../format.js';

const PAGE = CONFIG.itemsPerPage;       // txs per page
const SCAN_BLOCKS = 600;                // RPC fallback: how far back to walk
const BATCH = 30;                       // blocks per RPC round-trip

// method label from input[0:10]. Empty input = plain MRSN transfer.
function methodOf(input) {
  if (!input || input === '0x' || input.length < 10) return { label: 'transfer', cls: 'method' };
  const sel = input.slice(0, 10).toLowerCase();
  const known = KNOWN_METHODS[sel];
  if (known) return { label: known, cls: 'accent' };
  return { label: sel, cls: 'method' };
}

// normalize an indexer tx row into our common shape
function fromApi(t) {
  return {
    hash: t.hash, from: t.from_addr || t.from, to: t.to_addr ?? t.to ?? null,
    value: t.value ?? '0x0', block: hexToNum(t.block_number ?? t.blockNumber),
    timestamp: Number(t.timestamp) || 0, input: t.input || '0x',
  };
}
function fromTxDto(tx, ts) {
  return {
    hash: tx.hash, from: tx.from, to: tx.to ?? null, value: tx.value ?? '0x0',
    block: hexToNum(tx.blockNumber), timestamp: ts, input: tx.input || '0x',
  };
}

export default async function txs() {
  render(`
    <div class="page-head">
      <h1>Transactions</h1>
      <div class="sub">Recent EVM transactions on ${esc(CONFIG.chainName)}.</div>
    </div>
    <div class="card">
      <div class="card-title">
        <span>Latest transactions</span>
        <span class="badge neutral" id="srcNote">loading…</span>
      </div>
      <div style="overflow-x:auto">
        <table class="tbl">
          <thead><tr>
            <th>Tx hash</th><th>Method</th><th class="num">Block</th><th>Age</th>
            <th>From</th><th></th><th>To</th><th class="num">Value</th>
          </tr></thead>
          <tbody id="txBody">${skeletonRows(10, 8)}</tbody>
        </table>
      </div>
      <div class="pager" id="pager" style="display:none"></div>
    </div>`);

  let alive = true;
  let page = 1;
  let total = null;        // known total tx count when indexer is available
  let indexed = false;     // true once we confirm indexer is serving
  let unsub = null;

  const body = () => document.getElementById('txBody');
  const srcNote = () => document.getElementById('srcNote');

  // ---- RPC fallback: walk back full blocks until we have `need` txs ----
  // Returns { rows, scannedFrom, scannedTo, exhausted }.
  async function scanBlocks(latest, need, skip = 0) {
    const rows = [];
    let collected = 0;
    let from = latest;
    const floor = Math.max(0, latest - SCAN_BLOCKS + 1);
    while (from >= floor && rows.length < need) {
      const lo = Math.max(floor, from - BATCH + 1);
      const nums = [];
      for (let n = from; n >= lo; n--) nums.push(n);
      const blocks = await rpcBatch(nums.map((n) => ({ method: 'eth_getBlockByNumber', params: ['0x' + n.toString(16), true] })));
      if (!alive) return { rows: [], exhausted: true };
      for (const bl of blocks) {
        if (!bl || !Array.isArray(bl.transactions)) continue;
        const ts = hexToNum(bl.timestamp);
        for (const tx of bl.transactions) {
          if (typeof tx !== 'object') continue;
          if (collected++ < skip) continue;
          rows.push(fromTxDto(tx, ts));
          if (rows.length >= need) break;
        }
        if (rows.length >= need) break;
      }
      from = lo - 1;
    }
    return { rows, exhausted: from < floor };
  }

  function renderRows(rows) {
    const b = body(); if (!b) return;
    if (!rows.length) {
      b.innerHTML = `<tr><td colspan="8">${emptyState(
        'No recent EVM transactions',
        "Mersennet activity is mostly on the native order book. Browse live trading on the CLOB.",
        'tx')}<div style="text-align:center;margin-top:12px"><a class="btn primary" href="#/clob">${icon('clob',16)} Open order books</a></div></td></tr>`;
      return;
    }
    b.innerHTML = rows.map((tx) => {
      const m = methodOf(tx.input);
      const toCell = tx.to
        ? (KNOWN_CONTRACTS[tx.to?.toLowerCase()]
            ? `${addrLink(tx.to)} <span class="badge teal" style="margin-left:4px">${esc(KNOWN_CONTRACTS[tx.to.toLowerCase()].tag)}</span>`
            : addrLink(tx.to))
        : '<span class="badge neutral">contract create</span>';
      return `<tr>
        <td>${hashLink(tx.hash, 'tx')}</td>
        <td><span class="badge ${m.cls}">${esc(m.label)}</span></td>
        <td class="num"><a class="hash link" href="#/block/${tx.block}">${fmtNum(tx.block)}</a></td>
        <td style="color:var(--text-3);white-space:nowrap">${timeAgo(tx.timestamp)}</td>
        <td style="font-size:var(--fs-xs)">${addrLink(tx.from)}</td>
        <td style="color:var(--text-3)">${icon('arrow',12)}</td>
        <td style="font-size:var(--fs-xs)">${toCell}</td>
        <td class="num">${fmtMrsn(tx.value)} <span style="color:var(--text-3)">MRSN</span></td>
      </tr>`;
    }).join('');
  }

  function renderPager(canPrev, canNext) {
    const p = document.getElementById('pager'); if (!p) return;
    if (!canPrev && !canNext) { p.style.display = 'none'; return; }
    p.style.display = 'flex';
    const totalPages = total != null ? Math.max(1, Math.ceil(total / PAGE)) : null;
    p.innerHTML = `
      <button class="btn sq" id="prevBtn" ${canPrev ? '' : 'disabled'} aria-label="Previous">${icon('arrow',14,'flip')}</button>
      <span style="color:var(--text-2);font-size:var(--fs-sm)">Page ${page}${totalPages ? ' / ' + fmtNum(totalPages) : ''}</span>
      <button class="btn sq" id="nextBtn" ${canNext ? '' : 'disabled'} aria-label="Next">${icon('arrow',14)}</button>`;
    const prev = document.getElementById('prevBtn'), next = document.getElementById('nextBtn');
    if (prev) prev.onclick = () => { if (page > 1) { page--; load(); } };
    if (next) next.onclick = () => { if (canNext) { page++; load(); } };
  }

  // ---- load a page (indexer when available, else RPC scan) ----
  async function load() {
    const b = body(); if (b) b.innerHTML = skeletonRows(10, 8);
    // try indexer first for this page
    const res = await api.txs(page, PAGE);
    if (!alive) return;
    if (res && Array.isArray(res.transactions)) {
      indexed = true;
      total = typeof res.total === 'number' ? res.total : null;
      const rows = res.transactions.map(fromApi);
      renderRows(rows);
      srcNote().textContent = 'indexed';
      srcNote().className = 'badge accent';
      const canNext = total != null ? page * PAGE < total : rows.length === PAGE;
      renderPager(page > 1, canNext);
      return;
    }

    // RPC fallback: walk recent blocks
    indexed = false;
    let latest;
    try { latest = hexToNum(await getBlockNumber()); }
    catch { renderRows([]); srcNote().textContent = 'node unreachable'; srcNote().className = 'badge fail'; return; }
    if (!alive) return;
    const { rows, exhausted } = await scanBlocks(latest, PAGE, (page - 1) * PAGE);
    if (!alive) return;
    renderRows(rows);
    srcNote().innerHTML = `${icon('bolt',11)} live (recent blocks)`;
    srcNote().className = 'badge teal';
    if (!api.available && page === 1) showIndexerHint();
    const canNext = !exhausted && rows.length === PAGE;
    renderPager(page > 1, canNext);
  }

  function showIndexerHint() {
    const card = document.querySelector('.card');
    if (!card || card.querySelector('.idx-hint')) return;
    const note = document.createElement('div');
    note.className = 'banner info idx-hint';
    note.style.cssText = 'margin:14px 18px';
    note.innerHTML = `${icon('network',14)} Indexer offline — showing transactions from the latest blocks only. Deep history is unavailable.`;
    card.querySelector('.card-title').after(note);
  }

  await load();
  if (!alive) return;

  // live: when on page 1 via RPC, prepend new txs as blocks arrive
  let lastBlock = -1;
  unsub = ws.subscribe('newHeads', async (head) => {
    if (!alive || indexed || page !== 1) return;
    const n = hexToNum(head.number);
    if (n <= lastBlock) return; lastBlock = n;
    const bl = await rpc('eth_getBlockByNumber', ['0x' + n.toString(16), true]).catch(() => null);
    if (!bl || !alive || page !== 1 || indexed) return;
    if (!Array.isArray(bl.transactions) || !bl.transactions.length) return;
    const ts = hexToNum(bl.timestamp);
    const fresh = bl.transactions.filter((t) => typeof t === 'object').map((t) => fromTxDto(t, ts));
    if (!fresh.length) return;
    // rescan page 1 to keep it consistent (cheap; mostly empty blocks)
    const { rows, exhausted } = await scanBlocks(n, PAGE, 0);
    if (!alive || page !== 1) return;
    renderRows(rows);
    const b = body(); const first = b && b.querySelector('tr'); if (first) first.classList.add('row-enter');
    renderPager(false, !exhausted && rows.length === PAGE);
  });

  return () => { alive = false; try { unsub && unsub(); } catch {} };
}
