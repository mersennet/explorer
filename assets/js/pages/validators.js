// Validators: the leader-gated BFT PoS set. Total stake, validator count, an
// estimated staking APR (from emission), and the MEASURED block time. The active
// set is enriched with live proposer analytics: we sample the last N block
// headers (eth_getBlockByNumber) and tally who proposed them, so each validator
// shows blocks-proposed, proposal share, and last-seen — and a live strip streams
// new proposers as blocks arrive (WS newHeads). Pure-RPC, no indexer dependency.
import { CONFIG } from '../config.js';
import { getValidators, getStakingValidators, getBlockNumber, rpcBatch, rpcSafe } from '../rpc.js';
import { ws } from '../ws.js';
import { render, icon, addrLink, copyBtn, skeletonRows, emptyState, buildMarker } from '../ui.js';
import { fmtNum, fmtMrsn, compact, hexToBig, hexToNum, timeAgo, esc } from '../format.js';

const SECS_PER_YEAR = 31536000n;
const WEI = 10n ** 18n;
const SAMPLE = 120;   // recent blocks to analyse for proposer stats
const STRIP = 48;     // blocks shown in the live proposer strip

// deterministic green→teal hue per validator rank, for the strip + bars
const hueFor = (i, n) => `hsl(${140 + (i * (110 / Math.max(1, n)))} 68% 52%)`;

export default async function validators() {
  let alive = true;
  render(`
    <div class="page-head">
      <h1>${icon('validators', 24)} Validators</h1>
      <div class="sub">The leader-gated BFT proof-of-stake set securing Mersennet.</div>
    </div>
    <div class="grid cols-4" id="vkpis">${kpiSkeleton(4)}</div>
    <div class="banner teal" style="margin-top:14px">${icon('shield', 16)}
      <span>Consensus is <strong>leader-gated BFT PoS</strong> (one leader per height, every validator re-executes and signs, final at 2/3 of stake): validators stake MRSN to propose and vote, and anyone can
      <a href="https://trade.mersennet.com/staking" target="_blank" style="color:var(--teal)"><strong>delegate MRSN</strong></a> to a validator to share block rewards (minus commission).
      The set is <strong>open</strong>: any node registers with 1,000 MRSN self-stake and joins at the next hourly epoch.
      Signing two blocks at one height is <strong>slashed</strong>; downtime is not — a validator that misses its slots is <strong>benched</strong> for the epoch and <strong>jailed</strong> for the next, keeping its stake.</span>
    </div>

    <div class="card" id="stripCard" style="margin-top:14px">
      <div class="card-title">
        <span><span class="live-dot idle" id="propDot"></span> Recent block proposers</span>
        <span class="badge neutral" id="stripMeta">sampling…</span>
      </div>
      <div class="pad" id="stripBody"><div class="sk line"></div></div>
    </div>

    <div class="card" style="margin-top:14px">
      <div class="card-title"><span>Active set</span><span class="badge accent" id="vcount">…</span></div>
      <div style="padding:0 18px 14px;font-size:12px;color:var(--text-3);line-height:1.5" id="vsetNote">
        Loading the open validator set…
      </div>
      <div style="overflow-x:auto"><table class="tbl">
        <thead><tr>
          <th style="width:54px">Rank</th>
          <th>Validator</th>
          <th class="num" title="Bonded by the operator (voting weight minus delegations)">Self-stake (MRSN)</th>
          <th class="num" title="Staked behind the validator by other wallets">Delegated (MRSN)</th>
          <th>Proposed (last ${SAMPLE})</th>
          <th class="num" title="Share of the total voting stake (self + delegated)">Network share</th>
        </tr></thead>
        <tbody id="vbody">${skeletonRows(8, 6)}</tbody>
        <tfoot id="vfoot"></tfoot>
      </table></div>
    </div>`);

  const [vals, stakingVals, vset] = await Promise.all([getValidators(), getStakingValidators(), rpcSafe('mersennet_validatorSet')]);
  if (!alive) return () => { alive = false; };
  renderOpenSet(vset);

  // delegated staking info by validator address (null on older nodes)
  const stakingByAddr = new Map();
  if (Array.isArray(stakingVals)) {
    for (const s of stakingVals) {
      stakingByAddr.set(String(s.address).toLowerCase(), {
        delegated: hexToBig(s.delegatedTotal),
        commissionBps: Number(s.commissionBps || 0),
      });
    }
  }

  // mersennet_validators unavailable (older node / privacy gate) → honest empty state
  if (!Array.isArray(vals)) {
    const k = document.getElementById('vkpis');
    if (k) k.innerHTML = stat('coins', 'Total staked', '—') + stat('validators', 'Validators', '—')
      + stat('pulse', 'Est. staking APR', '—') + stat('clock', 'Block time', '—');
    const b = document.getElementById('vbody');
    if (b) b.innerHTML = `<tr><td colspan="6">${emptyState('Validator set unavailable', 'The node did not return mersennet_validators. Try again shortly.', 'validators')}</td></tr>`;
    const c = document.getElementById('vcount'); if (c) { c.textContent = 'n/a'; c.className = 'badge neutral'; }
    const sm = document.getElementById('stripMeta'); if (sm) { sm.textContent = 'n/a'; }
    const sb = document.getElementById('stripBody'); if (sb) sb.innerHTML = `<div style="color:var(--text-3);font-size:var(--fs-sm)">Proposer history needs the validator set.</div>`;
    return () => { alive = false; };
  }

  // sort by stake desc; decode stake as 18-dec MRSN wei (u256)
  const rows = vals
    .map((v) => ({ address: String(v.address).toLowerCase(), stakeWei: hexToBig(v.stake) }))
    .sort((a, b) => (a.stakeWei < b.stakeWei ? 1 : a.stakeWei > b.stakeWei ? -1 : 0));

  const totalStakeWei = rows.reduce((acc, r) => acc + r.stakeWei, 0n);
  const count = rows.length;
  const rankByAddr = new Map(rows.map((r, i) => [r.address, i]));

  // est. staking APR from the emission schedule (BigInt wei to avoid float drift)
  const blocksPerYear = SECS_PER_YEAR / BigInt(Math.max(1, CONFIG.blockTimeSecs));
  const annualEmissionWei = CONFIG.initialRewardWei * blocksPerYear;
  const aprPct = totalStakeWei > 0n ? Number((annualEmissionWei * 10000n) / totalStakeWei) / 100 : null;

  // ---- sample recent block headers for proposer analytics ----
  const proposed = new Map();   // addr -> count
  const lastSeen = new Map();   // addr -> { num, ts }
  let recent = [];              // [{ num, proposer }] newest first (for the strip)
  let measuredBt = null;
  let latest = 0;
  try {
    latest = hexToNum(await getBlockNumber());
    const n = Math.min(SAMPLE, latest + 1);
    const nums = [];
    for (let i = 0; i < n; i++) nums.push(latest - i);
    const headers = await rpcBatch(nums.map((bn) => ({ method: 'eth_getBlockByNumber', params: ['0x' + bn.toString(16), false] })));
    if (!alive) return () => { alive = false; };
    const got = headers.filter(Boolean);
    let tsNew = null, tsOld = null, samples = 0;
    for (const h of got) {
      const p = String(h.miner || h.proposer || '').toLowerCase();
      const bn = hexToNum(h.number);
      const ts = hexToNum(h.timestamp);
      if (p) {
        proposed.set(p, (proposed.get(p) || 0) + 1);
        if (!lastSeen.has(p)) lastSeen.set(p, { num: bn, ts });
      }
      recent.push({ num: bn, proposer: p });
      if (ts) { if (tsNew == null) tsNew = ts; tsOld = ts; samples++; }
    }
    if (tsNew != null && tsOld != null && samples > 1) measuredBt = (tsNew - tsOld) / (samples - 1);
  } catch {}
  if (!alive) return () => { alive = false; };

  const sampled = recent.length;

  // `stake` from the consensus set is the voting weight: self-stake + delegations.
  const totalDelegatedWei = rows.reduce((acc, r) => acc + (stakingByAddr.get(r.address)?.delegated ?? 0n), 0n);
  const totalSelfWei = totalStakeWei > totalDelegatedWei ? totalStakeWei - totalDelegatedWei : totalStakeWei;
  const selfOf = (r) => { const d = stakingByAddr.get(r.address)?.delegated ?? 0n; return r.stakeWei > d ? r.stakeWei - d : r.stakeWei; };

  document.getElementById('vkpis').innerHTML =
    stat('coins', 'Total staked', compact(Number(totalStakeWei / WEI)) + ' MRSN',
      totalDelegatedWei > 0n
        ? `${fmtMrsn(totalSelfWei, 0)} self · ${fmtMrsn(totalDelegatedWei, 0)} delegated`
        : fmtMrsn(totalStakeWei, 0) + ' MRSN, all self-stake')
    + stat('validators', 'Validators', fmtNum(count) + (vset && vset.params ? `<span style="color:var(--text-3);font-size:.6em"> / ${vset.params.maxValidators}</span>` : ''),
      (vset && Array.isArray(vset.validators) ? `${fmtNum(vset.validators.length)} registered · ` : '') + 'BFT quorum: ⅔+ by stake')
    + stat('pulse', 'Testnet emission / stake', aprPct == null ? '—' : aprPct.toFixed(0) + '%', '~' + compact(Number(annualEmissionWei / WEI)) + ' MRSN/yr over 4M genesis stake · not a mainnet yield')
    + stat('clock', 'Block time', measuredBt != null ? measuredBt.toFixed(2) + 's' : '~' + CONFIG.blockTimeSecs + 's', measuredBt != null ? `measured over ${fmtNum(sampled)} blocks` : 'target cadence');

  const c = document.getElementById('vcount');
  c.textContent = count + ' active'; c.className = 'badge accent';

  // ---- proposer strip ----
  renderStrip();

  // ---- active set table ----
  const expected = count > 0 ? sampled / count : 0;   // fair share of proposals
  const maxProp = Math.max(1, ...rows.map((r) => proposed.get(r.address) || 0));
  const body = document.getElementById('vbody');
  if (!count) {
    body.innerHTML = `<tr><td colspan="6">${emptyState('No validators reported', 'The active set is empty right now.', 'validators')}</td></tr>`;
  } else {
    body.innerHTML = rows.map((r, i) => {
      const shareBp = totalStakeWei > 0n ? Number((r.stakeWei * 10000n) / totalStakeWei) / 100 : 0;
      const barW = Math.max(2, Math.min(100, shareBp));
      const pc = proposed.get(r.address) || 0;
      const pPct = sampled > 0 ? (pc / sampled) * 100 : 0;
      const ls = lastSeen.get(r.address);
      // participation vs fair share: >0.85 healthy, else flag
      const ratio = expected > 0 ? pc / expected : 0;
      const partCls = ratio >= 0.85 ? 'up' : (ratio >= 0.4 ? 'warn-t' : 'down');
      const dot = `<span style="display:inline-block;width:9px;height:9px;border-radius:3px;background:${hueFor(i, count)};vertical-align:middle;margin-right:7px"></span>`;
      return `<tr>
        <td><span class="badge ${i === 0 ? 'accent' : 'neutral'}">#${i + 1}</span></td>
        <td>
          <span style="display:inline-flex;align-items:center;gap:2px">${dot}${addrLink(r.address, { short: true, withAvatar: false })}${copyBtn(r.address)}</span>
          <div style="color:var(--text-3);font-size:var(--fs-xs);margin-top:3px">${ls ? `last proposed #${fmtNum(ls.num)} · ${timeAgo(ls.ts)}` : 'no recent proposals'}</div>
        </td>
        <td class="num mono">${fmtMrsn(selfOf(r), 0)}</td>
        <td class="num">${delegatedCell(stakingByAddr.get(r.address))}</td>
        <td>
          <div style="display:flex;align-items:center;gap:9px">
            <div style="flex:1;height:7px;border-radius:5px;background:var(--bg-elev);overflow:hidden;min-width:60px">
              <div style="width:${Math.max(2, (pc / maxProp) * 100).toFixed(1)}%;height:100%;background:${hueFor(i, count)};border-radius:5px"></div>
            </div>
            <span class="mono" style="min-width:78px;text-align:right;font-size:var(--fs-sm)">
              <span class="pct ${partCls}">${fmtNum(pc)}</span> <span style="color:var(--text-3)">· ${pPct.toFixed(0)}%</span>
            </span>
          </div>
        </td>
        <td class="num"><span class="mono" style="color:var(--text-2)">${shareBp.toFixed(2)}%</span>
          <div style="height:5px;border-radius:3px;background:var(--bg-elev);overflow:hidden;margin-top:5px">
            <div style="width:${barW}%;height:100%;background:var(--grad-accent)"></div></div>
        </td>
      </tr>`;
    }).join('');
    const foot = document.getElementById('vfoot');
    if (foot) foot.innerHTML = `<tr class="total">
        <td></td>
        <td><b>Grand total</b> <span style="color:var(--text-3);font-size:var(--fs-xs)">· ${fmtNum(count)} validators</span></td>
        <td class="num mono"><b>${fmtMrsn(totalSelfWei, 0)}</b><div style="color:var(--text-3);font-size:var(--fs-xs);margin-top:3px">staked (MRSN)</div></td>
        <td class="num mono"><b>${fmtMrsn(totalDelegatedWei, 0)}</b><div style="color:var(--text-3);font-size:var(--fs-xs);margin-top:3px">delegated (MRSN)</div></td>
        <td><span style="color:var(--text-3);font-size:var(--fs-xs)">${fmtNum(sampled)} blocks sampled</span></td>
        <td class="num mono"><b>${fmtMrsn(totalStakeWei, 0)}</b><div style="color:var(--text-3);font-size:var(--fs-xs);margin-top:3px">voting stake (MRSN) · 100%</div></td>
      </tr>`;
  }

  // ---- live: stream new proposers into the strip + counts ----
  const unsub = ws.subscribe('newHeads', (h) => {
    if (!alive || !h) return;
    const bn = hexToNum(h.number);
    if (!bn || bn <= latest) return;
    latest = bn;
    const p = String(h.miner || h.proposer || '').toLowerCase();
    recent.unshift({ num: bn, proposer: p });
    if (recent.length > SAMPLE) recent.length = SAMPLE;
    const dot = document.getElementById('propDot'); if (dot) dot.classList.remove('idle');
    renderStrip();
  });

  return () => { alive = false; try { unsub(); } catch {} };

  // ===== closures =====
  function renderStrip() {
    const host = document.getElementById('stripBody');
    const meta = document.getElementById('stripMeta');
    if (meta) { meta.textContent = `${fmtNum(recent.length)} blocks`; meta.className = 'badge accent'; }
    if (!host) return;
    if (!recent.length) { host.innerHTML = `<div style="color:var(--text-3);font-size:var(--fs-sm)">No recent blocks sampled.</div>`; return; }
    const cells = recent.slice(0, STRIP).map((b) => {
      const rk = rankByAddr.has(b.proposer) ? rankByAddr.get(b.proposer) : -1;
      const col = rk >= 0 ? hueFor(rk, count) : 'var(--text-3)';
      const lbl = rk >= 0 ? `#${rk + 1}` : '?';
      return `<a class="prop-cell" href="/block/${b.num}" title="Block #${fmtNum(b.num)} · validator ${lbl}" style="--c:${col}">${lbl === '?' ? '·' : lbl}</a>`;
    }).join('');
    const legend = rows.map((r, i) =>
      `<span class="prop-leg"><span class="sw" style="background:${hueFor(i, count)}"></span>#${i + 1} ${addrLink(r.address, { short: true, withAvatar: false })} <span style="color:var(--text-3)">${fmtNum(proposed.get(r.address) || 0)}</span></span>`).join('');
    host.innerHTML = `<div class="prop-strip">${cells}</div>
      <div class="prop-legend">${legend}</div>`;
  }
}

// Delegated stake + commission for one validator (— on nodes without staking RPC)
function delegatedCell(s) {
  if (!s) return `<span style="color:var(--text-3)">—</span>`;
  const amt = s.delegated > 0n ? fmtMrsn(s.delegated, 0) : '0';
  return `<span class="mono">${amt}</span>
    <div style="color:var(--text-3);font-size:var(--fs-xs);margin-top:3px">${(s.commissionBps / 100).toFixed(1)}% commission</div>`;
}

// Open validator set (permissionless registration): parameters, epoch and
// every registration with its live status. `mersennet_validatorSet` is null
// on nodes older than the feature.
const STATUS_BADGE = { active: 'ok', pending: 'warn', standby: 'neutral', jailed: 'danger', exiting: 'neutral' };
// Build of every node that answers `whoami` (fleet and community), by identity —
// what the trade API's build registry saw in the last few minutes.
async function fetchBuilds() {
  try {
    const r = await fetch('https://trade.mersennet.com/api/v1/nodes/builds', { cache: 'no-store' });
    if (!r.ok) return { latest: null, byId: new Map() };
    const j = await r.json();
    return { latest: j.latest || null, byId: new Map((j.nodes || []).map((n) => [String(n.identity).toLowerCase(), n])) };
  } catch { return { latest: null, byId: new Map() }; }
}
// Armed protocol switches with ETAs from the observed block time (trade API
// computes both from the chain; grouped by height for a one-line schedule).
async function fetchSwitches() {
  try {
    const r = await fetch('https://trade.mersennet.com/api/v1/protocol/switches', { cache: 'no-store' });
    if (!r.ok) return [];
    const j = await r.json();
    const byHeight = new Map();
    for (const sw of j.switches || []) {
      const g = byHeight.get(sw.height) || { height: sw.height, etaSec: sw.etaSec, etaAt: sw.etaAt, labels: [] };
      g.labels.push(sw.label); byHeight.set(sw.height, g);
    }
    const groups = [...byHeight.values()].sort((a, b) => a.height - b.height);
    groups.blockTimeSec = j.blockTimeSec;
    return groups;
  } catch { return []; }
}
function switchLine(groups) {
  if (!groups.length) return '';
  const fmt = (g) => {
    const h = g.etaSec / 3600;
    const when = new Date(g.etaAt).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
    const rel = h >= 1 ? `~${Math.round(h)} h` : `~${Math.max(1, Math.round(g.etaSec / 60))} min`;
    return `<span class="mono" style="color:var(--text)">block ${fmtNum(g.height)}</span> <span class="badge warn">${rel} · ${when} UTC</span> <span style="color:var(--text-3)">${esc(g.labels.join(' · '))}</span>`;
  };
  const spb = groups.blockTimeSec ? ` <span style="color:var(--text-3);font-weight:400">· estimated at ${groups.blockTimeSec.toFixed(2)} s per block</span>` : '';
  return `<div style="margin-top:8px;display:flex;flex-direction:column;gap:4px" id="switchSchedule"><b style="color:var(--text)">Upcoming protocol upgrades${spb}</b> ${groups.map((g) => `<div>${fmt(g)}</div>`).join('')}<span style="color:var(--text-3)">Validators run the current release before each height; traders have nothing to do. <a href="/upgrades" data-route="upgrades">Completed upgrades and how close the estimates were →</a></span></div>`;
}
async function renderOpenSet(v) {
  const note = document.getElementById('vsetNote');
  if (!note) return;
  if (!v || !v.params) {
    note.innerHTML = 'The public node does not expose the validator set yet. <a href="https://docs.mersennet.com/validators/run-a-node/#becoming-a-validator" target="_blank" rel="noopener">Become a validator →</a>';
    return;
  }
  const p = v.params;
  const minStake = Number(hexToBig(p.minSelfStake) / WEI);
  const epochMin = Math.round(p.epochBlocks * 2 / 60);
  const link = '<a href="https://trade.mersennet.com/staking" target="_blank" rel="noopener">register in the terminal →</a>';
  if (!v.active) {
    const left = Math.max(0, p.activationHeight - v.height);
    note.innerHTML = `<b style="color:var(--text)">Permissionless validator registration opens at block ${fmtNum(p.activationHeight)}</b> (${fmtNum(left)} blocks, ~${Math.round(left * 2 / 3600)} h). Any node can then register with ${fmtNum(minStake)} MRSN self-stake; the top ${p.maxValidators} by self + delegated stake produce blocks, recomputed every epoch (${epochMin} min). ${link}`;
    return;
  }
  const [builds, switchGroups] = await Promise.all([fetchBuilds(), fetchSwitches()]);
  const inSet = new Set((v.activeSet || []).map((a) => String(a).toLowerCase()));
  const sorted = (v.validators || []).slice().sort((a, b) => (hexToBig(b.votingStake) > hexToBig(a.votingStake) ? 1 : -1));
  const registered = sorted.length;
  const rows = sorted
    .map((r, i) => {
      const active = inSet.has(r.identity.toLowerCase());
      const b = builds.byId.get(r.identity.toLowerCase());
      const buildCell = buildMarker(b && b.build, builds.latest, !!(b && b.outdated));
      // Top `maxValidators` by stake produce blocks; anyone below the line (or
      // registered this epoch) waits for the boundary — shown dimmed.
      const rankCell = active
        ? `<span class="badge ${i === 0 ? 'accent' : 'neutral'}">#${i + 1}</span>`
        : `<span class="badge neutral" style="opacity:.55" title="Not in the active set this epoch">${i < p.maxValidators ? '#' + (i + 1) : '—'}</span>`;
      return `<tr${active ? '' : ' style="opacity:.55"'}>
      <td>${rankCell}</td>
      <td><a class="mono" href="#/address/${esc(r.identity)}">${esc(r.identity.slice(0, 10))}…${esc(r.identity.slice(-4))}</a>${r.genesis ? ' <span class="badge neutral">genesis</span>' : ''}</td>
      <td><a class="mono" href="#/address/${esc(r.operator)}" style="color:var(--text-3)">${esc(r.operator.slice(0, 10))}…</a>${window.__account && r.operator.toLowerCase() === window.__account ? ' <span class="badge ok">you</span>' : ''}</td>
      <td class="num mono">${fmtMrsn(hexToBig(r.selfStake), 0)}</td>
      <td class="num mono">${fmtMrsn(hexToBig(r.delegated), 0)}</td>
      <td class="num mono">${r.commissionBps / 100}%</td>
      <td class="num mono" title="Leader slots this epoch: blocks proposed vs. slots missed. All-time: ${fmtNum(r.totalProposed || 0)} blocks proposed since registration.">${r.proposedSlots} <span style="color:var(--text-3)">/ ${r.missedSlots} missed</span><div style="color:var(--text-3);font-size:var(--fs-xs);margin-top:2px">${fmtNum(r.totalProposed || 0)} all-time</div></td>
      <td>${buildCell}</td>
      <td><span class="badge ${STATUS_BADGE[r.status] || 'neutral'}">${esc(r.status)}</span>${r.benched ? ' <span class="badge warn" title="Missed 3 leader slots this epoch: out of the leader rotation until the epoch boundary (still voting)">benched</span>' : ''}</td>
    </tr>`; }).join('');
  const toEpoch = Math.max(0, v.nextEpochAt - v.height);
  const outdated = sorted.filter((r) => builds.byId.get(r.identity.toLowerCase())?.outdated).length;
  const sumSelf = sorted.reduce((a, r) => a + hexToBig(r.selfStake), 0n);
  const sumDeleg = sorted.reduce((a, r) => a + hexToBig(r.delegated), 0n);
  const sumProposed = sorted.reduce((a, r) => a + (r.proposedSlots || 0), 0);
  const sumMissed = sorted.reduce((a, r) => a + (r.missedSlots || 0), 0);
  const sumAllTime = sorted.reduce((a, r) => a + (r.totalProposed || 0), 0);
  const foot = `<tfoot><tr class="total"><td></td><td colspan="2"><b>Grand total</b> <span style="color:var(--text-3);font-size:var(--fs-xs)">· ${fmtNum(registered)} registered</span></td>
      <td class="num mono"><b>${fmtMrsn(sumSelf, 0)}</b><div style="color:var(--text-3);font-size:var(--fs-xs);margin-top:3px">staked (MRSN)</div></td>
      <td class="num mono"><b>${fmtMrsn(sumDeleg, 0)}</b><div style="color:var(--text-3);font-size:var(--fs-xs);margin-top:3px">delegated (MRSN)</div></td>
      <td></td>
      <td class="num mono" title="Leader slots this epoch across the registered validators (proposed = blocks in the epoch so far) and blocks proposed all-time since each registered"><b>${fmtNum(sumProposed)}</b> <span style="color:var(--text-3)">/ ${fmtNum(sumMissed)} missed</span><div style="color:var(--text-3);font-size:var(--fs-xs);margin-top:3px">this epoch · ${fmtNum(sumAllTime)} all-time</div></td>
      <td colspan="2"></td></tr></tfoot>`;
  note.innerHTML = `<b style="color:var(--text)">Open validator set · epoch ${fmtNum(v.epoch)}</b> · <b style="color:var(--text)">${fmtNum(registered)} registered</b> · ${v.activeSet.length}/${p.maxValidators} active (the top ${p.maxValidators} by stake produce blocks) · next epoch in ${fmtNum(toEpoch)} blocks (~${Math.round(toEpoch * 2 / 60)} min) · min self-stake ${fmtNum(minStake)} MRSN${builds.latest ? ` · current release <span class="mono">${esc(builds.latest)}</span>${outdated ? ` · <span class="badge warn">${outdated} behind</span>` : ''}` : ''} · ${link}
    ${switchLine(switchGroups)}
    <div style="overflow-x:auto;margin-top:10px"><table class="tbl">
      <thead><tr><th style="width:54px">Rank</th><th>Validator</th><th>Operator</th><th class="num">Self-stake (MRSN)</th><th class="num">Delegated (MRSN)</th><th class="num">Commission</th><th class="num">Slots (epoch)</th><th>Build</th><th>Status</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="9" style="color:var(--text-3)">No registrations yet.</td></tr>'}</tbody>
      ${rows ? foot : ''}
    </table></div>`;
}

const stat = (ic, label, val, meta = '') => `<div class="stat">
  <div class="ico-bg">${icon(ic, 30)}</div>
  <div class="label">${icon(ic, 13)} ${label}</div>
  <div class="value">${val}</div>
  ${meta ? `<div class="meta">${meta}</div>` : ''}</div>`;

function kpiSkeleton(n) {
  let s = '';
  for (let i = 0; i < n; i++) s += `<div class="stat"><div class="sk line short"></div><div class="sk line" style="height:24px;margin-top:10px"></div></div>`;
  return s;
}
