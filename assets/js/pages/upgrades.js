// Protocol upgrades: the consensus rules that changed (or will change) at an
// announced block height. Upcoming ones carry a live ETA from the observed
// block time; completed ones show the real activation time (the block's
// timestamp) against the estimate that was on record, so anyone can see how
// far off we were. Data: trade API /protocol/upgrades (chain-derived).
import { render, icon, hashLink } from '../ui.js';
import { fmtNum, esc } from '../format.js';

const API = 'https://trade.mersennet.com/api/v1/protocol/upgrades';

const utc = (iso, secs = false) => iso
  ? new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', ...(secs ? { second: '2-digit' } : {}), timeZone: 'UTC' }) + ' UTC'
  : '—';
const utcTime = (iso) => iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC' }) + ' UTC' : '—';

/** +2 min 14 s / −40 s / on time. */
export function fmtDelta(sec) {
  if (sec == null || !Number.isFinite(sec)) return '—';
  const a = Math.abs(sec);
  if (a < 5) return 'on time';
  const sign = sec > 0 ? '+' : '−';
  if (a < 60) return `${sign}${a} s`;
  if (a < 3600) return `${sign}${Math.floor(a / 60)} min${a % 60 ? ` ${a % 60} s` : ''}`;
  const h = Math.floor(a / 3600), m = Math.round((a % 3600) / 60);
  return `${sign}${h} h${m ? ` ${m} min` : ''}`;
}
const deltaClass = (sec) => (sec == null ? 'neutral' : Math.abs(sec) < 600 ? 'ok' : Math.abs(sec) < 3600 ? 'warn' : 'fail');
const rel = (etaSec) => (etaSec >= 3600 ? `~${Math.round(etaSec / 3600)} h` : `~${Math.max(1, Math.round(etaSec / 60))} min`);

function groupByHeight(list) {
  const m = new Map();
  for (const s of list) {
    const g = m.get(s.height) || { ...s, items: [] };
    g.items.push(s); m.set(s.height, g);
  }
  return [...m.values()];
}

function upcomingCard(d) {
  const groups = groupByHeight(d.upcoming).sort((a, b) => a.height - b.height);
  if (!groups.length) return `<div class="card pad" style="color:var(--text-2)">${icon('check', 15)} No protocol upgrade is scheduled. New heights are announced in the <a href="https://t.me/Mersennet" target="_blank" rel="noopener">Telegram group</a> and land here first.</div>`;
  return `<div class="card">
    <div class="card-title"><span>${icon('clock', 16)} Upcoming protocol upgrades</span><span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--text-3)">estimated at ${d.blockTimeSec.toFixed(2)} s per block</span></div>
    <div style="overflow-x:auto"><table class="tbl"><thead><tr><th>Block</th><th>Estimated (UTC)</th><th>What changes</th></tr></thead><tbody>
    ${groups.map((g) => `<tr>
      <td><span class="mono" style="color:var(--text)">${fmtNum(g.height)}</span><div style="color:var(--text-3);font-size:var(--fs-xs)">${fmtNum(g.blocksLeft)} blocks to go</div></td>
      <td><span class="badge warn">${rel(g.etaSec)} · ${utc(g.etaAt)}</span>
        ${g.announcedAt ? `<div style="color:var(--text-3);font-size:var(--fs-xs);margin-top:4px">announced as ${utc(g.announcedAt)} — the live estimate ${fmtDelta(Math.round((new Date(g.etaAt) - new Date(g.announcedAt)) / 1000)) === 'on time' ? 'agrees' : `has moved ${fmtDelta(Math.round((new Date(g.etaAt) - new Date(g.announcedAt)) / 1000))}`}</div>` : ''}</td>
      <td>${g.items.map((s) => `<div><b style="color:var(--text)">${esc(s.label)}</b>${s.detail ? ` <span style="color:var(--text-3)">— ${esc(s.detail)}</span>` : ''}</div>`).join('')}</td>
    </tr>`).join('')}
    </tbody></table></div>
    <div style="padding:10px 16px;color:var(--text-3);font-size:var(--fs-xs)">Blocks are nominally 2 s; missed leader slots stretch the average, so an estimate a day out can move by tens of minutes. Validators run the current release before the height (<a href="https://mersennet.com/downloads/" target="_blank" rel="noopener">downloads</a>); traders have nothing to do.</div>
  </div>`;
}

function completedRows(list, q) {
  // One row per activation block: several rules usually activate together.
  const groups = groupByHeight(list).sort((a, b) => b.height - a.height);
  const needle = q.trim().toLowerCase();
  const text = (g) => [String(g.height), fmtNum(g.height), utc(g.activatedAt), (g.activatedAt || '').slice(0, 10), ...g.items.flatMap((c) => [c.label, c.detail, c.key])];
  const rows = groups.filter((g) => !needle || text(g).some((t) => String(t || '').toLowerCase().includes(needle)));
  if (!rows.length) return `<tr><td colspan="5" style="color:var(--text-3);text-align:center;padding:22px">No upgrade matches “${esc(q)}”.</td></tr>`;
  return rows.map((g) => {
    const est = g.estimate;
    const fin = g.finalEstimate;
    const estCell = est
      ? `<div>${utc(est.etaAt)}</div><div style="color:var(--text-3);font-size:var(--fs-xs)">${est.source === 'announced' ? 'announced' : 'estimate'} ${utc(est.recordedAt)}</div>`
      : `<span style="color:var(--text-3)">no estimate on record</span>`;
    const day = g.dayBeforeEstimate;
    const sub = [
      day ? `<span title="The live estimate about a day out, recorded ${utc(day.recordedAt)}">24 h out ${utcTime(day.etaAt)} → ${fmtDelta(day.deltaSec)}</span>` : '',
      fin ? `<span title="The last estimate shown before activation, recorded ${utc(fin.recordedAt)}">last estimate ${utcTime(fin.etaAt)} → ${fmtDelta(fin.deltaSec)}</span>` : '',
    ].filter(Boolean).join('<br>');
    const deltaCell = est
      ? `<span class="badge ${deltaClass(est.deltaSec)}">${fmtDelta(est.deltaSec)}</span>${sub ? `<div style="color:var(--text-3);font-size:var(--fs-xs);margin-top:4px">${sub}</div>` : ''}`
      : '<span class="badge neutral">—</span>';
    return `<tr>
      <td>${hashLink(String(g.height), 'block', { short: false })}<div style="color:var(--text-3);font-size:var(--fs-xs)">${g.items.length} rule${g.items.length > 1 ? 's' : ''}</div></td>
      <td><span class="mono" style="color:var(--text)">${g.activatedAt ? utc(g.activatedAt, true) : '—'}</span></td>
      <td>${estCell}</td>
      <td>${deltaCell}</td>
      <td>${g.items.map((c) => `<div><b style="color:var(--text)">${esc(c.label)}</b>${c.detail ? ` <span style="color:var(--text-3)">— ${esc(c.detail)}</span>` : ''}</div>`).join('')}</td>
    </tr>`;
  }).join('');
}

export default async function upgrades() {
  render(`
    <div class="page-head">
      <h1>${icon('layers', 24)} Protocol upgrades</h1>
      <div class="sub">Consensus rules change at announced block heights. Upcoming upgrades carry a live estimate; completed ones show when the block was actually produced and how far off the estimate was.</div>
    </div>
    <div id="upgUpcoming"><div class="card pad"><div class="sk line" style="margin:8px 0"></div><div class="sk line short"></div></div></div>
    <div class="card" style="margin-top:14px">
      <div class="card-title"><span>${icon('check', 16)} Completed upgrades</span>
        <span class="searchbar" style="max-width:320px"><input id="upgSearch" type="search" aria-label="Search completed upgrades" placeholder="Search by name, block or date…" autocomplete="off" style="height:30px;padding-left:12px;font-size:12px"/></span></div>
      <div style="overflow-x:auto"><table class="tbl"><thead><tr><th>Block</th><th>Activated (UTC)</th><th>Estimated</th><th>Actual − estimate</th><th>What changed</th></tr></thead>
      <tbody id="upgDone"><tr><td colspan="5"><div class="sk line" style="margin:8px 0"></div></td></tr></tbody></table></div>
      <div style="padding:10px 16px;color:var(--text-3);font-size:var(--fs-xs)">“Activated” is the timestamp of the block at the upgrade height. “Estimated” is the time that was on record for it — the announced one where we published a date, otherwise the earliest live estimate — and “Actual − estimate” is the difference; the lines beneath show how the live estimate did about a day out and just before activation.</div>
    </div>`);

  let data;
  try {
    const r = await fetch(API, { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    data = await r.json();
  } catch (e) {
    document.getElementById('upgUpcoming').innerHTML = `<div class="card pad" style="color:var(--text-2)">The upgrade schedule is temporarily unavailable (${esc(e.message)}). The heights themselves are in <span class="mono">mersennet_orders_getProtocol</span> and <span class="mono">mersennet_validatorSet</span>.</div>`;
    document.getElementById('upgDone').innerHTML = '<tr><td colspan="5" style="color:var(--text-3);text-align:center;padding:22px">Unavailable</td></tr>';
    return;
  }
  document.getElementById('upgUpcoming').innerHTML = upcomingCard(data);
  const body = document.getElementById('upgDone');
  const input = document.getElementById('upgSearch');
  const draw = () => { body.innerHTML = completedRows(data.completed, input.value); };
  draw();
  input.addEventListener('input', draw);
}
