// Top accounts: ranked by ACTIVITY (tx_count), via the indexer. When the indexer
// is offline the page degrades to a "notable addresses" view (known contracts +
// validators from RPC) so it is never blank. RPC-first / progressive.
import { CONFIG, KNOWN_CONTRACTS } from '../config.js';
import { getValidators } from '../rpc.js';
import { api } from '../api.js';
import { render, icon, addrLink, skeletonRows, emptyState } from '../ui.js';
import { compact, hexToBig, esc } from '../format.js';

export default async function accounts() {
  render(`
    <div class="crumbs"><a href="#/">Home</a> <span>/</span> <span>Top accounts</span></div>
    <div class="page-head">
      <h1>Top accounts</h1>
      <div class="sub">Ranked by on-chain <strong>activity</strong> (transaction count) — not by balance.</div>
    </div>
    <div id="notice"></div>
    <div class="card">
      <div class="card-title"><span>${icon('account', 16)} Most active addresses</span><span class="badge neutral" id="countBadge"></span></div>
      <table class="tbl">
        <thead><tr><th style="width:64px">Rank</th><th>Address</th><th class="num">Transactions</th></tr></thead>
        <tbody id="rows">${skeletonRows(12, 3)}</tbody>
      </table>
    </div>`);

  let alive = true;
  await api.probe();
  if (!alive) return;

  if (api.available) {
    const data = await api.topAccounts(100);
    if (!alive) return;
    const list = data && Array.isArray(data.accounts) ? data.accounts : [];
    const rowsEl = document.getElementById('rows');
    const countBadge = document.getElementById('countBadge');
    if (!list.length) {
      if (rowsEl) rowsEl.innerHTML = `<tr><td colspan="3">${emptyState('No accounts yet', 'The indexer has not ranked any active accounts.', 'account')}</td></tr>`;
      return;
    }
    if (countBadge) countBadge.textContent = list.length + ' shown';
    const maxTx = Math.max(1, ...list.map((a) => Number(a.tx_count || 0)));
    if (rowsEl) rowsEl.innerHTML = list.map((a, i) => {
      const addr = a.addr || a.address;
      const tx = Number(a.tx_count || 0);
      const known = KNOWN_CONTRACTS[(addr || '').toLowerCase()];
      const pct = Math.max(2, Math.round((tx / maxTx) * 100));
      return `<tr class="row-enter">
        <td><span class="rank-medal ${i < 3 ? 'top' : ''}">${i + 1}</span></td>
        <td><div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap">${addrLink(addr, { short: false })}${known ? `<span class="badge ${known.kind === 'privacy' ? 'teal' : 'accent'}">${esc(known.name)}</span>` : ''}</div></td>
        <td class="num"><div style="display:flex;align-items:center;justify-content:flex-end;gap:10px"><span style="color:var(--text-3)">${compact(tx)}</span><span class="rank-bar" style="width:${pct}%"></span></div></td>
      </tr>`;
    }).join('');
    return cleanup;
  }

  // --- indexer offline: notable addresses fallback (never blank) ---
  const notice = document.getElementById('notice');
  if (notice) notice.innerHTML = `<div class="banner info" style="margin-bottom:14px">${icon('network', 16)} Indexer offline — the activity ranking needs the indexer. Showing notable on-chain addresses instead.</div>`;

  const known = Object.entries(KNOWN_CONTRACTS);
  const vals = await getValidators();
  if (!alive) return;
  const validators = Array.isArray(vals) ? vals.slice().sort((a, b) => (hexToBig(b.stake) > hexToBig(a.stake) ? 1 : -1)) : [];

  const card = document.getElementById('rows')?.closest('.card');
  if (card) card.outerHTML = `
    <div class="card" style="margin-bottom:14px">
      <div class="card-title"><span>${icon('blocks', 16)} Native contracts</span><span class="badge accent">${known.length}</span></div>
      <table class="tbl"><tbody>${
        known.map(([addr, k]) => `<tr>
          <td>${addrLink(addr, { short: false })}</td>
          <td><span class="badge ${k.kind === 'privacy' ? 'teal' : 'accent'}">${esc(k.name)}</span></td>
          <td style="color:var(--text-3);font-size:var(--fs-sm)">${esc(k.note || '')}</td>
        </tr>`).join('')
      }</tbody></table>
    </div>
    <div class="card">
      <div class="card-title"><span>${icon('validators', 16)} Validators</span><span class="badge neutral">${validators.length}${validators.length ? '' : ' · n/a'}</span></div>
      <table class="tbl">
        <thead><tr><th style="width:64px">Rank</th><th>Validator</th><th class="num">Stake (MRSN)</th></tr></thead>
        <tbody>${
          validators.length
            ? validators.map((v, i) => `<tr>
                <td><span class="rank-medal ${i < 3 ? 'top' : ''}">${i + 1}</span></td>
                <td>${addrLink(v.address, { short: false })}</td>
                <td class="num">${compact(Number(hexToBig(v.stake) / (10n ** BigInt(CONFIG.decimals))))}</td>
              </tr>`).join('')
            : `<tr><td colspan="3">${emptyState('Validator set unavailable', 'The node did not return a validator set.', 'validators')}</td></tr>`
        }</tbody>
      </table>
    </div>`;

  function cleanup() { alive = false; }
  return cleanup;
}
