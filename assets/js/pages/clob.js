// CLOB — the native order-book terminal (this chain's flagship surface). A real
// depth order book (RPC mersennet_orders_getOrderBook), live market stats, and a
// streaming recent-trades tape (WS MersennetOrdersTrades, seeded from domain
// events). CLOB units are PLAIN INTEGERS (hexToNum) — NOT 18-dec wei. Collateral
// is escrowed native MRSN, backed 1:1. If the book read is privacy-gated/null
// (transparent CLOB disabled post-fork) we say so honestly and point to #/privacy.
import { MARKETS } from '../config.js';
import { getOrderBook, getDomainEvents, getBlockNumber } from '../rpc.js';
import { ws } from '../ws.js';
import { render, icon, emptyState } from '../ui.js';
import { fmtNum, hexToNum, timeAgo, esc } from '../format.js';

const DEPTH_ROWS = 12;     // levels shown per side
const MAX_TRADES = 40;     // trades kept in the tape
const TRADE_LOOKBACK = 4000; // blocks to seed the trade tape from

export default async function clob(params = {}) {
  // resolve selected market (param is the numeric id as a string)
  const wanted = params.market != null ? Number(params.market) : NaN;
  const market = MARKETS.find((m) => m.id === wanted) || MARKETS[0];

  render(`
    <div class="page-head">
      <div class="crumbs"><a href="#/">Home</a> ${icon('arrow',12)} <span>Order book</span></div>
      <h1 style="display:flex;align-items:center;gap:12px">${icon('clob',26)} Native order book
        <span class="badge accent">${MARKETS.length} markets</span></h1>
      <div class="sub">On-chain central-limit order book — matched in the protocol, no AMM. Sizes &amp; prices are protocol integer units.</div>
    </div>

    <div class="tabs" id="mktTabs">${tabsHtml(market)}</div>

    <div class="banner teal" style="margin-bottom:14px">${icon('lock',15)}
      <span>Collateral is backed 1:1 by escrowed native MRSN — every resting order is fully funded on-chain.</span></div>

    <div class="grid cols-4" id="mktStats" style="margin-bottom:14px">${statSkeleton()}</div>

    <div class="grid cols-2-1">
      <div class="card">
        <div class="card-title">
          <span>${icon('layers',16)} Depth — <span class="mono" style="color:var(--accent)">${esc(market.symbol)}</span></span>
          <span class="badge neutral" id="bookMeta">loading…</span>
        </div>
        <div id="bookBody">${bookSkeleton()}</div>
      </div>
      <div class="card">
        <div class="card-title">
          <span><span class="live-dot idle" id="tradeDot"></span> Recent trades</span>
          <span class="badge neutral" id="tradeMeta">${esc(market.symbol)}</span>
        </div>
        <div class="trade-row" style="color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;font-size:var(--fs-xs)">
          <span>Side</span><span class="px">Price</span><span class="sz">Size</span><span class="t">Time</span></div>
        <div class="book-scroll" id="tradesBody">${tradeSkeleton()}</div>
      </div>
    </div>`);

  // wire the market tabs as hash links already; nothing imperative needed there.

  let alive = true;
  const trades = [];   // {side:'buy'|'sell', price, size, ts} newest first

  // ---------- order book ----------
  const book = await getOrderBook(market.id);
  if (!alive) return;

  if (book === null) {
    // honest post-fork state: the transparent CLOB read is gated.
    renderGatedBook(market);
  } else {
    renderBook(book, market);
  }

  // ---------- recent trades: seed from domain events, then stream via WS ----------
  await seedTrades(market);
  if (!alive) return;
  renderTrades(market);

  const unsub = ws.subscribe('MersennetOrdersTrades', [market.id], (r) => {
    if (!alive || !r) return;
    // only keep trades for the active market (WS may broadcast all markets)
    const mid = r.market_id != null ? hexToNum(r.market_id) : market.id;
    if (mid !== market.id) return;
    const t = normalizeTrade(r);
    if (!t) return;
    trades.unshift(t);
    if (trades.length > MAX_TRADES) trades.length = MAX_TRADES;
    prependTrade(t, market);
    pulseLive();
  });

  return () => { alive = false; try { unsub(); } catch {} };

  // ===== helpers (closure over trades/alive/market) =====

  function renderBook(bk, mkt) {
    const bidsRaw = Array.isArray(bk.bids) ? bk.bids : [];
    const asksRaw = Array.isArray(bk.asks) ? bk.asks : [];
    // decode to integer units; bids high→low, asks low→high
    const bids = bidsRaw.map(decodeLevel).filter(Boolean).sort((a, b) => b.price - a.price);
    const asks = asksRaw.map(decodeLevel).filter(Boolean).sort((a, b) => a.price - b.price);

    const meta = document.getElementById('bookMeta');
    if (meta) {
      if (!bids.length && !asks.length) { meta.textContent = 'empty'; meta.className = 'badge neutral'; }
      else { meta.textContent = `${bids.length}×${asks.length} levels`; meta.className = 'badge accent'; }
    }

    const bestBid = bids[0]?.price ?? null;
    const bestAsk = asks[0]?.price ?? null;
    renderStats(bestBid, bestAsk);

    const body = document.getElementById('bookBody');
    if (!body) return;
    if (!bids.length && !asks.length) {
      body.innerHTML = emptyState('No resting orders', 'This market has no open bids or asks right now.', 'clob');
      return;
    }

    // cumulative-size scaling shared across both sides for an honest depth picture
    const cumAsks = withCumulative(asks.slice(0, DEPTH_ROWS));
    const cumBids = withCumulative(bids.slice(0, DEPTH_ROWS));
    const maxCum = Math.max(
      cumAsks.length ? cumAsks[cumAsks.length - 1].cum : 0,
      cumBids.length ? cumBids[cumBids.length - 1].cum : 0,
      1
    );

    // asks rendered worst→best top-down so the best ask sits just above the mid row
    const asksHtml = cumAsks.slice().reverse().map((l) => depthRow(l, 'ask', maxCum)).join('');
    const bidsHtml = cumBids.map((l) => depthRow(l, 'bid', maxCum)).join('');

    body.innerHTML = `
      <div class="depth-head"><span>Price</span><span class="r">Size</span><span class="r">Total</span></div>
      <div class="book-scroll">
        <div>${asksHtml || emptyMini('No asks')}</div>
        ${midRow(bestBid, bestAsk)}
        <div>${bidsHtml || emptyMini('No bids')}</div>
      </div>`;
  }

  function renderGatedBook(mkt) {
    const meta = document.getElementById('bookMeta');
    if (meta) { meta.textContent = 'shielded'; meta.className = 'badge teal'; }
    renderStats(null, null);
    const body = document.getElementById('bookBody');
    if (body) {
      body.innerHTML = `
        <div style="padding:20px 18px">
          <div class="banner teal" style="margin-bottom:0">${icon('shield',16)}
            <span>The transparent order book is disabled after the privacy hard fork — depth now lives inside the shielded CLOB.
            View shielded market aggregates on <a class="hash link" style="color:var(--teal)" href="#/privacy">the privacy hub →</a></span></div>
          <div style="margin-top:14px">${emptyState('Transparent depth unavailable', 'Order sizes and prices are private post-fork.', 'lock')}</div>
        </div>`;
    }
  }

  function renderStats(bestBid, bestAsk) {
    const el = document.getElementById('mktStats');
    if (!el) return;
    const spread = (bestBid != null && bestAsk != null) ? bestAsk - bestBid : null;
    const mid = (bestBid != null && bestAsk != null) ? (bestBid + bestAsk) / 2 : null;
    const spreadPct = (spread != null && mid) ? (spread / mid) * 100 : null;
    el.innerHTML = `
      ${stat('clob', 'Best bid', bestBid != null ? fmtNum(bestBid) : '—', 'highest buy', 'var(--up)')}
      ${stat('clob', 'Best ask', bestAsk != null ? fmtNum(bestAsk) : '—', 'lowest sell', 'var(--down)')}
      ${stat('bolt', 'Spread', spread != null ? fmtNum(spread) : '—', spreadPct != null ? spreadPct.toFixed(3) + '%' : 'no two-sided book')}
      ${stat('pulse', 'Mid price', mid != null ? fmtNum(mid) : '—', 'best bid/ask midpoint')}`;
  }

  async function seedTrades(mkt) {
    let head = 0;
    try { head = hexToNum(await getBlockNumber()); } catch { head = 0; }
    const fromBlock = head > TRADE_LOOKBACK ? head - TRADE_LOOKBACK : 0;
    const evts = await getDomainEvents({
      fromBlock: '0x' + fromBlock.toString(16),
      toBlock: 'latest',
      domain: 'mersennet_orders',
      kind: 'trade',
    });
    if (!Array.isArray(evts)) return;
    // domain events arrive oldest→newest; we want newest first in the tape
    const rows = [];
    for (const e of evts) {
      const d = e && (e.data || e);
      if (!d) continue;
      const mid = d.market_id != null ? hexToNum(d.market_id) : mkt.id;
      if (mid !== mkt.id) continue;
      const t = normalizeTrade(d, e);
      if (t) rows.push(t);
    }
    // keep newest first
    rows.reverse();
    for (const t of rows) {
      if (trades.length >= MAX_TRADES) break;
      trades.push(t);
    }
  }

  function renderTrades(mkt) {
    const body = document.getElementById('tradesBody');
    if (!body) return;
    if (!trades.length) {
      body.innerHTML = `<div style="padding:8px">${emptyState('No trades yet', ws.connected ? 'Waiting for the next match — the tape updates live.' : 'New trades will stream in as they match.', 'pulse')}</div>`;
      return;
    }
    body.innerHTML = trades.map(tradeRow).join('');
  }

  function prependTrade(t, mkt) {
    const body = document.getElementById('tradesBody');
    if (!body) return;
    // if the empty-state is showing, replace it with the first real row
    if (!body.querySelector('.trade-row')) { body.innerHTML = trades.map(tradeRow).join(''); }
    else {
      body.insertAdjacentHTML('afterbegin', tradeRow(t));
      const first = body.querySelector('.trade-row');
      if (first) first.classList.add('row-enter');
      const rows = body.querySelectorAll('.trade-row');
      for (let i = rows.length - 1; i >= MAX_TRADES; i--) rows[i].remove();
    }
  }

  function pulseLive() {
    const dot = document.getElementById('tradeDot');
    if (dot) dot.classList.remove('idle');
  }
}

// ---------- pure render helpers (no closure deps) ----------

function decodeLevel(lvl) {
  if (!lvl) return null;
  const price = hexToNum(lvl.price);
  const size = hexToNum(lvl.size);
  if (!isFinite(price) || !isFinite(size)) return null;
  if (price <= 0 && size <= 0) return null;
  return { price, size };
}

function withCumulative(levels) {
  let cum = 0;
  return levels.map((l) => { cum += l.size; return { ...l, cum }; });
}

function depthRow(l, side, maxCum) {
  const pct = Math.max(2, Math.min(100, (l.cum / maxCum) * 100));
  return `<div class="depth-row ${side}">
    <span class="fill" style="width:${pct.toFixed(1)}%"></span>
    <span class="px">${fmtNum(l.price)}</span>
    <span class="sz r">${fmtNum(l.size)}</span>
    <span class="tot r">${fmtNum(l.cum)}</span>
  </div>`;
}

function midRow(bestBid, bestAsk) {
  const spread = (bestBid != null && bestAsk != null) ? bestAsk - bestBid : null;
  const mid = (bestBid != null && bestAsk != null) ? (bestBid + bestAsk) / 2 : null;
  const spreadPct = (spread != null && mid) ? (spread / mid) * 100 : null;
  return `<div class="depth-mid">
    <span class="mid">${mid != null ? fmtNum(mid) : '—'}</span>
    <span class="spread">${spread != null ? 'spread ' + fmtNum(spread) + (spreadPct != null ? ' · ' + spreadPct.toFixed(3) + '%' : '') : 'one-sided'}</span>
  </div>`;
}

function emptyMini(label) {
  return `<div class="depth-row" style="color:var(--text-3);justify-content:center"><span style="grid-column:1/-1;text-align:center;padding:6px">${esc(label)}</span></div>`;
}

// WS/domain trade → {side, price, size, ts}. side: 0/buy = buy(taker bought), 1/sell = sell.
function normalizeTrade(d, evt) {
  if (!d) return null;
  const price = hexToNum(d.price);
  const size = hexToNum(d.size);
  if (!isFinite(price) || price <= 0) return null;
  // side may be 0/1 hex or a string. Treat 0 / 'buy' / 'bid' as a buy.
  let buy;
  const s = d.side;
  if (typeof s === 'string' && !s.startsWith('0x')) buy = /buy|bid|long/i.test(s);
  else buy = hexToNum(s) === 0;
  // best-effort timestamp: explicit, then event ts, else now
  let ts = d.timestamp != null ? hexToNum(d.timestamp)
    : (evt && evt.timestamp != null ? hexToNum(evt.timestamp) : Math.floor(Date.now() / 1000));
  return { side: buy ? 'buy' : 'sell', price, size, ts };
}

function tradeRow(t) {
  return `<div class="trade-row ${t.side === 'buy' ? 'buy' : 'sell'}">
    <span class="side">${t.side}</span>
    <span class="px">${fmtNum(t.price)}</span>
    <span class="sz">${fmtNum(t.size)}</span>
    <span class="t">${timeAgo(t.ts)}</span>
  </div>`;
}

function tabsHtml(active) {
  return MARKETS.map((m) =>
    `<a class="tab ${m.id === active.id ? 'active' : ''}" href="#/clob/${m.id}">${esc(m.symbol)}</a>`
  ).join('');
}

function stat(ic, label, val, meta, color = 'var(--accent)') {
  return `<div class="stat"><div class="label">${icon(ic, 13)} ${esc(label)}</div>
    <div class="value" style="color:${color}">${val}</div>
    <div class="meta">${esc(meta || '')}</div></div>`;
}

function statSkeleton() {
  let s = '';
  for (let i = 0; i < 4; i++) s += `<div class="stat"><div class="sk line short"></div><div class="sk line" style="height:24px;margin-top:10px"></div></div>`;
  return s;
}

function bookSkeleton() {
  let rows = '';
  for (let i = 0; i < DEPTH_ROWS; i++) rows += `<div class="depth-row"><span class="sk line" style="margin:4px 0"></span></div>`;
  return `<div class="depth-head"><span>Price</span><span class="r">Size</span><span class="r">Total</span></div>${rows}`;
}

function tradeSkeleton() {
  let rows = '';
  for (let i = 0; i < 8; i++) rows += `<div class="trade-row"><span class="sk line short"></span><span class="sk line"></span><span class="sk line"></span><span class="sk line short"></span></div>`;
  return rows;
}
