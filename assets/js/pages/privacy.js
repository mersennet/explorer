// Privacy / ZK hub — the chain's differentiator. Account-level privacy via a
// shielded pool (depth-32 Poseidon/BN254 commitment tree), a shielded CLOB that
// exposes only aggregate clearing context, disclosure (viewing) grants, and a
// threshold-encrypted mempool. Teal accent throughout (never violet/purple).
//
// Regime-aware: the privacy hard fork may be PENDING on testnet — shielded/proof
// reads succeed but return empty (noteCount 0). We render the live machinery and
// frame the empty state as a forward-looking capability, not an error.
import { MARKETS } from '../config.js';
import { getShieldedRoot, getShieldedBalance, getShieldedMarketAggregates } from '../rpc.js';
import { ws } from '../ws.js';
import { render, icon, skeletonRows, emptyState } from '../ui.js';
import { fmtNum, compact, hexToNum, hexToBig, timeAgo, esc } from '../format.js';

const TREE_DEPTH = 32; // Poseidon / BN254 commitment tree depth

export default async function privacy() {
  render(`
    <!-- 1) HERO -->
    <section class="hero">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;flex-wrap:wrap">
        <span class="badge teal">${icon('lock',12)} ZK-native privacy</span>
        <span class="badge teal">${icon('tree',12)} depth-${TREE_DEPTH} commitment tree</span>
        <span class="badge teal">${icon('shield',12)} BN254 · Poseidon</span>
      </div>
      <h1>Account-level privacy,<br><span class="g">made verifiable.</span></h1>
      <div class="tagline">A shielded pool whose anonymity set grows every block — the explorer sees only aggregates, never identities.</div>
    </section>
    <div id="forkBanner" style="margin-bottom:16px"></div>

    <!-- 2) SHIELDED POOL heartbeat -->
    <div class="card-title" style="padding:0 0 12px;border:none"><span style="color:var(--teal)">${icon('pulse',16)} Shielded pool heartbeat</span><span class="badge teal" id="wsChip">connecting…</span></div>
    <div class="card pad glow-teal" id="rootCard" style="margin-bottom:14px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div style="color:var(--text-3);font-size:var(--fs-xs);text-transform:uppercase;letter-spacing:.08em;font-weight:600;display:flex;align-items:center;gap:7px">${icon('tree',13)} Shielded state root</div>
        <div class="badge teal" id="rootBlock">block —</div>
      </div>
      <div class="root-readout" id="rootHash" style="margin-top:12px"><div class="sk line" style="height:24px;width:80%"></div></div>
    </div>
    <div class="grid cols-4" id="poolTiles">${tileSkeleton(4)}</div>

    <!-- 3) NOTE LIFECYCLE + commitment tree -->
    <div class="grid cols-2-1" style="margin-top:22px">
      <div class="card pad">
        <div class="card-title" style="padding:0 0 14px;border:none"><span style="color:var(--teal)">${icon('shield',16)} Note lifecycle</span></div>
        <div class="flow">
          <div class="step"><div class="h">${icon('lock',14)} 1 · Commit</div><div class="d">A shielded value becomes a note commitment <span class="mono" style="color:var(--teal)">C = Poseidon(value, owner, blinding)</span>. The amount and owner stay hidden.</div></div>
          <div class="arrow-x">${icon('arrow',18)}</div>
          <div class="step"><div class="h">${icon('tree',14)} 2 · Insert</div><div class="d">The commitment is appended as a leaf of the depth-${TREE_DEPTH} Merkle tree. The new <span class="mono" style="color:var(--teal)">shieldedStateRoot</span> is published on-chain each block.</div></div>
          <div class="arrow-x">${icon('arrow',18)}</div>
          <div class="step"><div class="h">${icon('bolt',14)} 3 · Spend</div><div class="d">Spending reveals only a one-time <span class="mono" style="color:var(--down)">nullifier</span> proving the note exists and is unspent — without linking back to the commitment.</div></div>
        </div>
        <div style="margin-top:16px;color:var(--text-2);font-size:var(--fs-sm);line-height:1.6">
          The explorer only ever sees <strong style="color:var(--teal)">aggregates</strong>: the running root, the count of inserted notes, and the count of published nullifiers. Individual values, owners and links between notes are <strong>private by design</strong> — recoverable only by the holder of the spending key (or an explicit disclosure grant).
        </div>
      </div>
      <div class="card pad">
        <div class="card-title" style="padding:0 0 14px;border:none"><span style="color:var(--teal)">${icon('tree',16)} Commitment tree</span></div>
        ${merkleSvg()}
        <div class="kv" style="margin-top:14px;grid-template-columns:1fr 1fr">
          <div class="k">${icon('layers',12)} Depth</div><div class="v">${TREE_DEPTH}</div>
          <div class="k">${icon('shield',12)} Hash</div><div class="v">Poseidon</div>
          <div class="k">${icon('proof',12)} Curve</div><div class="v">BN254</div>
          <div class="k">${icon('tree',12)} Capacity</div><div class="v">2<sup>${TREE_DEPTH}</sup> notes</div>
        </div>
        <div style="margin-top:12px;color:var(--text-3);font-size:var(--fs-xs);display:flex;gap:14px;flex-wrap:wrap">
          <span style="display:inline-flex;align-items:center;gap:6px"><svg width="10" height="10"><circle cx="5" cy="5" r="4" fill="var(--teal)"/></svg> note commitment</span>
          <span style="display:inline-flex;align-items:center;gap:6px"><svg width="10" height="10"><rect width="9" height="9" rx="2" fill="var(--down)" fill-opacity=".85"/></svg> spent (nullified)</span>
        </div>
      </div>
    </div>

    <!-- 4) SHIELDED CLOB -->
    <div class="card" style="margin-top:22px">
      <div class="card-title"><span style="color:var(--teal)">${icon('clob',16)} Shielded CLOB — aggregate clearing context</span><span class="badge shielded" id="clobChip">${icon('lock',11)} identities hidden</span></div>
      <div style="padding:0 18px 4px;color:var(--text-3);font-size:var(--fs-xs)">Order owners and sizes are private; only mark price, open interest and clearing context are public.</div>
      <table class="tbl">
        <thead><tr><th>Market</th><th class="num">Mark</th><th class="num">Long OI</th><th class="num">Short OI</th><th class="num">Last clearing</th><th class="num">Last volume</th><th class="num">Liquidatable</th></tr></thead>
        <tbody id="clobBody">${skeletonRows(5, 7)}</tbody>
      </table>
    </div>
    <div class="card" style="margin-top:14px">
      <div class="card-title"><span style="color:var(--teal)">${icon('pulse',16)} Private clearing tape</span><span class="badge teal" id="tapeChip">listening…</span></div>
      <div style="padding:0 18px 4px;color:var(--text-3);font-size:var(--fs-xs)">Live clearings show price, matched size and intent count — counts, never identities.</div>
      <table class="tbl">
        <thead><tr><th>When</th><th>Market</th><th class="num">Clearing price</th><th class="num">Matched size</th><th class="num">Intents</th></tr></thead>
        <tbody id="tapeBody"></tbody>
      </table>
      <div id="tapeEmpty">${emptyState('Awaiting private clearings', 'Matched-order events stream here as the shielded CLOB clears — without revealing who traded.', 'pulse')}</div>
    </div>

    <!-- 5) DISCLOSURE GRANTS + threshold mempool -->
    <div class="grid cols-2" style="margin-top:22px">
      <div class="card pad glow-teal">
        <div class="card-title" style="padding:0 0 12px;border:none"><span style="color:var(--teal)">${icon('proof',16)} Disclosure grants</span><span class="badge teal">selective</span></div>
        <div style="color:var(--text-2);font-size:var(--fs-sm);line-height:1.65">
          Privacy is not opacity. A note owner can mint a <strong style="color:var(--teal)">viewing grant</strong> that authorizes a specific party to read a scoped slice of their shielded activity — a single note, a market, or a time range — for audit, compliance or accounting.
        </div>
        <div class="kv" style="margin-top:14px;grid-template-columns:150px 1fr">
          <div class="k">${icon('account',12)} Authorize</div><div class="v" style="font-family:var(--font-ui);color:var(--text-2)">owner signs a scoped read key</div>
          <div class="k">${icon('layers',12)} Scope</div><div class="v" style="font-family:var(--font-ui);color:var(--text-2)">note · market · time range</div>
          <div class="k">${icon('verify',12)} Verify</div><div class="v" style="font-family:var(--font-ui);color:var(--text-2)">grantee decrypts only granted data</div>
        </div>
        <div style="margin-top:12px;color:var(--text-3);font-size:var(--fs-xs)">Grants are revocable and never expose the full key — the default remains private.</div>
      </div>
      <div class="card pad glow-teal">
        <div class="card-title" style="padding:0 0 12px;border:none"><span style="color:var(--teal)">${icon('lock',16)} Threshold-encrypted mempool</span><span class="badge teal">MEV-resistant</span></div>
        <div style="color:var(--text-2);font-size:var(--fs-sm);line-height:1.65">
          Incoming orders are <strong style="color:var(--teal)">threshold-encrypted</strong> to the validator set before they enter the mempool. No single proposer can read, reorder or front-run them.
        </div>
        <div class="proofchain" style="margin-top:16px">
          <div class="node">${icon('lock',13)}</div><div class="lnk"></div>
          <div class="node">enc</div><div class="lnk"></div>
          <div class="node">BFT</div><div class="lnk"></div>
          <div class="node">${icon('bolt',13)}</div><div class="lnk"></div>
          <div class="node">clear</div>
        </div>
        <div style="margin-top:14px;color:var(--text-3);font-size:var(--fs-xs);line-height:1.6">
          A threshold of validators jointly decrypts a batch only <em>after</em> ordering is committed under HotStuff-2 BFT, so the clearing price is fixed before contents are ever revealed.
        </div>
      </div>
    </div>`);

  let alive = true;
  const unsubs = [];
  // running aggregate state (kept across WS ticks)
  const pool = { root: null, block: 0, notes: 0, nullifiers: 0, eoa: 0, ts: 0 };

  // ----- helpers -----
  const fork = (active) => {
    const el = document.getElementById('forkBanner');
    if (!el) return;
    if (active) {
      el.innerHTML = `<div class="banner teal">${icon('check',15)} <span><strong>Privacy fork: active</strong> — the shielded pool is live; notes and proofs are populating.</span></div>`;
    } else {
      el.innerHTML = `<div class="banner warn">${icon('clock',15)} <span><strong>Privacy fork: pending</strong> — the shielded pool + ZK machinery are live and queryable; notes/proofs populate at activation.</span></div>`;
    }
  };

  function paintRoot(bump) {
    const hashEl = document.getElementById('rootHash');
    const blkEl = document.getElementById('rootBlock');
    const cardEl = document.getElementById('rootCard');
    if (!hashEl || !blkEl) return;
    const root = pool.root && hexToBig(pool.root) !== 0n ? pool.root : null;
    hashEl.textContent = root ? root : '0x' + '0'.repeat(64);
    if (!root) hashEl.style.color = 'var(--text-3)';
    blkEl.textContent = pool.block ? 'block #' + fmtNum(pool.block) : 'block —';
    if (bump && cardEl) { cardEl.classList.remove('heartbeat'); void cardEl.offsetWidth; cardEl.classList.add('heartbeat'); }
  }

  function paintTiles(bump) {
    const el = document.getElementById('poolTiles');
    if (!el) return;
    const anon = Math.max(0, pool.notes - pool.nullifiers);
    el.innerHTML = `
      ${tile('privacy', 'Anonymity set', fmtNum(anon), 'unspent notes (notes − nullifiers)', true)}
      ${tile('tree', 'Note commitments', fmtNum(pool.notes), pool.ts ? 'updated ' + timeAgo(pool.ts) : 'inserted leaves')}
      ${tile('bolt', 'Nullifiers', fmtNum(pool.nullifiers), 'notes spent')}
      ${tile('account', 'Transparent EOAs', fmtNum(pool.eoa), 'shieldable accounts')}`;
    if (bump) {
      const set = el.querySelector('.stat .value .tick');
      if (set) { set.classList.remove('bumped'); void set.offsetWidth; set.classList.add('bumped'); }
    }
  }
  const tile = (ic, label, val, meta, big) => `
    <div class="stat teal${big ? ' glow-teal' : ''}">
      <span class="ico-bg">${icon(ic, 22)}</span>
      <div class="label">${icon(ic,13)} ${label}</div>
      <div class="value"><span class="tick">${val}</span></div>
      <div class="meta">${meta || ''}</div>
    </div>`;

  function renderClob(aggs) {
    const body = document.getElementById('clobBody');
    if (!body) return;
    const rows = aggs && Array.isArray(aggs.markets) ? aggs.markets : [];
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="7">${emptyState('No shielded markets yet', 'Aggregate clearing context appears once the shielded CLOB has activity.', 'clob')}</td></tr>`;
      return;
    }
    body.innerHTML = rows.map((m) => {
      const mk = MARKETS.find((x) => x.id === m.marketId);
      const sym = mk ? mk.symbol : 'Market ' + m.marketId;
      const liq = hexToNum(m.liquidatableCount);
      // CLOB units are PLAIN INTEGERS (hexToNum), NOT 18-dec wei
      return `<tr>
        <td><span class="badge shielded">${icon('lock',11)}</span> <span class="mono">${esc(sym)}</span></td>
        <td class="num">${fmtNum(hexToNum(m.markPrice))}</td>
        <td class="num">${compact(hexToNum(m.longOpenInterest))}</td>
        <td class="num">${compact(hexToNum(m.shortOpenInterest))}</td>
        <td class="num" style="color:var(--teal)">${fmtNum(hexToNum(m.lastClearingPrice))}</td>
        <td class="num">${compact(hexToNum(m.lastVolume))}</td>
        <td class="num">${liq ? `<span class="badge warn">${fmtNum(liq)}</span>` : '<span style="color:var(--text-3)">0</span>'}</td>
      </tr>`;
    }).join('');
  }

  // ----- initial load (RPC-first) -----
  const [root, bal, aggs] = await Promise.all([
    getShieldedRoot(),
    getShieldedBalance(),
    getShieldedMarketAggregates(),
  ]);
  if (!alive) return cleanup;

  if (root) {
    pool.root = root.shieldedStateRoot || null;
    pool.block = Number(root.blockNumber || 0);
    pool.notes = Number(root.noteCount || 0);
    pool.nullifiers = Number(root.nullifierCount || 0);
  }
  if (bal) {
    pool.eoa = Number(bal.transparentEoaCount || 0);
    // prefer the richer balance counts if root came back empty
    if (!pool.notes && bal.totalNoteCount != null) pool.notes = Number(bal.totalNoteCount || 0);
    if (!pool.nullifiers && bal.totalNullifierCount != null) pool.nullifiers = Number(bal.totalNullifierCount || 0);
  }

  const rootEmpty = !pool.root || hexToBig(pool.root) === 0n;
  fork(!(rootEmpty && pool.notes === 0));
  paintRoot(false);
  paintTiles(false);
  renderClob(aggs);

  // ----- live heartbeat: newShieldedRoot -----
  const wsChip = document.getElementById('wsChip');
  if (wsChip) wsChip.textContent = ws.connected ? 'live' : 'connecting…';
  unsubs.push(ws.subscribe('newShieldedRoot', (r) => {
    if (!alive || !r) return;
    if (r.new_root) pool.root = r.new_root;
    if (r.block_number != null) pool.block = hexToNum(r.block_number);
    pool.notes += hexToNum(r.notes_added);
    pool.nullifiers += hexToNum(r.nullifiers_added);
    pool.ts = Math.floor(Date.now() / 1000);
    paintRoot(true);
    paintTiles(true);
    const c = document.getElementById('wsChip');
    if (c) { c.textContent = 'live'; c.className = 'badge teal'; }
    // a populated root means the fork is effectively active
    if (hexToBig(pool.root) !== 0n || pool.notes > 0) fork(true);
  }));

  // ----- private clearing tape: newClearingPrice -----
  const tape = []; // newest first
  const tapeChip = document.getElementById('tapeChip');
  unsubs.push(ws.subscribe('newClearingPrice', (c) => {
    if (!alive || !c) return;
    const mk = MARKETS.find((x) => x.id === hexToNum(c.market_id));
    tape.unshift({
      sym: mk ? mk.symbol : (c.market_id != null ? 'Market ' + hexToNum(c.market_id) : '—'),
      price: hexToNum(c.clearing_price),
      size: hexToNum(c.matched_size),
      intents: hexToNum(c.intent_count),
      ts: Math.floor(Date.now() / 1000),
    });
    if (tape.length > 12) tape.length = 12;
    const body = document.getElementById('tapeBody');
    const empt = document.getElementById('tapeEmpty');
    if (empt) empt.style.display = 'none';
    if (tapeChip) tapeChip.textContent = 'live';
    if (body) {
      body.innerHTML = tape.map((t) => `<tr>
        <td style="color:var(--text-3)">${timeAgo(t.ts)}</td>
        <td><span class="badge shielded">${icon('lock',11)}</span> <span class="mono">${esc(t.sym)}</span></td>
        <td class="num" style="color:var(--teal)">${fmtNum(t.price)}</td>
        <td class="num">${fmtNum(t.size)}</td>
        <td class="num">${fmtNum(t.intents)}</td>
      </tr>`).join('');
      const first = body.querySelector('tr');
      if (first) first.classList.add('row-enter');
    }
  }));

  // reflect WS connectivity on the heartbeat chip even if no events arrive yet
  const onWs = (e) => {
    const c = document.getElementById('wsChip');
    if (c && !pool.ts) c.textContent = e.detail && e.detail.connected ? 'live' : 'reconnecting…';
  };
  document.addEventListener('ws:status', onWs);

  function cleanup() {
    alive = false;
    document.removeEventListener('ws:status', onWs);
    for (const u of unsubs) { try { u(); } catch {} }
  }
  return cleanup;
}

// ---- a sparse depth-32 commitment tree (conceptual diagram, top 4 levels shown) ----
function merkleSvg() {
  const W = 320, H = 168;
  const levels = 4;                 // visualize the top 4 levels of the depth-32 tree
  const yGap = 34, topY = 18;
  let lines = '', nodes = '';
  // positions per level
  const pos = [];
  for (let l = 0; l < levels; l++) {
    const count = 2 ** l;
    const y = topY + l * yGap;
    const row = [];
    for (let i = 0; i < count; i++) {
      const x = (W * (i + 1)) / (count + 1);
      row.push({ x, y });
    }
    pos.push(row);
  }
  // connectors
  for (let l = 1; l < levels; l++) {
    pos[l].forEach((n, i) => {
      const parent = pos[l - 1][Math.floor(i / 2)];
      lines += `<line class="lvl" x1="${parent.x.toFixed(1)}" y1="${parent.y}" x2="${n.x.toFixed(1)}" y2="${n.y}"/>`;
    });
  }
  // internal nodes (root highlighted)
  pos.slice(0, levels - 1).forEach((row, l) => {
    row.forEach((n) => {
      const on = l === 0 ? ' on' : '';
      nodes += `<circle class="nd${on}" cx="${n.x.toFixed(1)}" cy="${n.y}" r="${l === 0 ? 8 : 6}"/>`;
    });
  });
  // leaves: a sparse mix — some commitments (teal dots), one spent (red square), rest empty
  const leafState = [1, 0, 1, 2, 1, 0, 0, 1]; // 1=note, 2=spent, 0=empty
  pos[levels - 1].forEach((n, i) => {
    const s = leafState[i] || 0;
    if (s === 2) nodes += `<rect class="leaf-x" x="${(n.x - 5).toFixed(1)}" y="${n.y - 5}" width="10" height="10" rx="2"/>`;
    else if (s === 1) nodes += `<circle class="leaf-n" cx="${n.x.toFixed(1)}" cy="${n.y}" r="5"/>`;
    else nodes += `<circle class="nd" cx="${n.x.toFixed(1)}" cy="${n.y}" r="4"/>`;
  });
  return `<svg class="merkle-svg" viewBox="0 0 ${W} ${H + 6}" role="img" aria-label="depth-${TREE_DEPTH} commitment tree">
    ${lines}${nodes}
    <text x="${W / 2}" y="${H + 2}" text-anchor="middle" fill="var(--text-3)" font-size="9" style="font-family:var(--font-mono)">root &#8594; &#8230; &#8594; leaves (depth ${TREE_DEPTH})</text>
  </svg>`;
}

function tileSkeleton(n) {
  let s = '';
  for (let i = 0; i < n; i++) s += `<div class="stat teal"><div class="sk line short"></div><div class="sk line" style="height:24px;margin-top:10px"></div></div>`;
  return s;
}
