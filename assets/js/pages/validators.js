// Validators: the HotStuff-2 BFT PoS set. Total stake, validator count, an
// estimated staking APR (from the emission schedule), and a ranked table with
// per-validator stake / network share (inline bar). RPC-first (mersennet_validators);
// the indexer adds nothing here, so this page is pure-RPC and fully self-contained.
import { CONFIG } from '../config.js';
import { getValidators } from '../rpc.js';
import { render, icon, addrLink, copyBtn, skeletonRows, emptyState } from '../ui.js';
import { fmtNum, fmtMrsn, compact, hexToBig } from '../format.js';

const SECS_PER_YEAR = 31536000n;
const WEI = 10n ** 18n;

export default async function validators() {
  render(`
    <div class="page-head">
      <h1>${icon('validators', 24)} Validators</h1>
      <div class="sub">The HotStuff-2 BFT proof-of-stake set securing Mersennet.</div>
    </div>
    <div class="grid cols-4" id="vkpis">${kpiSkeleton(4)}</div>
    <div class="banner teal" style="margin-top:14px">${icon('shield', 16)}
      <span>Consensus is <strong>HotStuff-2 BFT PoS</strong>: validators stake MRSN to propose and vote.
      Equivocation and liveness faults are punished by <strong>escalating slashing</strong> — repeat offences burn a growing share of stake.</span>
    </div>
    <div class="card" style="margin-top:14px">
      <div class="card-title"><span>Active set</span><span class="badge accent" id="vcount">…</span></div>
      <table class="tbl">
        <thead><tr>
          <th style="width:54px">Rank</th>
          <th>Validator</th>
          <th class="num">Stake (MRSN)</th>
          <th style="width:34%">Network share</th>
        </tr></thead>
        <tbody id="vbody">${skeletonRows(8, 4)}</tbody>
      </table>
    </div>`);

  const vals = await getValidators();

  // mersennet_validators unavailable (older node / privacy gate) → honest empty state
  if (!Array.isArray(vals)) {
    const k = document.getElementById('vkpis');
    if (k) k.innerHTML = stat('coins', 'Total staked', '—') + stat('validators', 'Validators', '—')
      + stat('pulse', 'Est. staking APR', '—') + stat('bolt', 'Avg. stake', '—');
    const b = document.getElementById('vbody');
    if (b) b.innerHTML = `<tr><td colspan="4">${emptyState('Validator set unavailable', 'The node did not return mersennet_validators. Try again shortly.', 'validators')}</td></tr>`;
    const c = document.getElementById('vcount'); if (c) { c.textContent = 'n/a'; c.className = 'badge neutral'; }
    return;
  }

  // sort by stake desc; decode stake as 18-dec MRSN wei (u256)
  const rows = vals
    .map((v) => ({ address: v.address, stakeWei: hexToBig(v.stake) }))
    .sort((a, b) => (a.stakeWei < b.stakeWei ? 1 : a.stakeWei > b.stakeWei ? -1 : 0));

  const totalStakeWei = rows.reduce((acc, r) => acc + r.stakeWei, 0n);
  const count = rows.length;

  // est. staking APR from the emission schedule (all BigInt wei to avoid float drift):
  //   annualEmission = initialRewardWei * blocksPerYear ; blocksPerYear = secs/year / blockTime
  //   APR% ≈ annualEmission / totalStake  (guard divide-by-zero)
  const blocksPerYear = SECS_PER_YEAR / BigInt(Math.max(1, CONFIG.blockTimeSecs));
  const annualEmissionWei = CONFIG.initialRewardWei * blocksPerYear;
  const aprPct = totalStakeWei > 0n ? Number((annualEmissionWei * 10000n) / totalStakeWei) / 100 : null;
  const avgStakeWei = count > 0 ? totalStakeWei / BigInt(count) : 0n;

  document.getElementById('vkpis').innerHTML =
    stat('coins', 'Total staked', compact(Number(totalStakeWei / WEI)) + ' MRSN', fmtMrsn(totalStakeWei, 2) + ' MRSN exact')
    + stat('validators', 'Validators', fmtNum(count), 'BFT quorum: ⅔+ by stake')
    + stat('pulse', 'Est. staking APR', aprPct == null ? '—' : aprPct.toFixed(2) + '%', '~' + compact(Number(annualEmissionWei / WEI)) + ' MRSN/yr emitted')
    + stat('bolt', 'Avg. stake', count ? compact(Number(avgStakeWei / WEI)) + ' MRSN' : '—', count ? 'per validator' : '');

  const c = document.getElementById('vcount');
  c.textContent = count + ' active'; c.className = 'badge accent';

  const body = document.getElementById('vbody');
  if (!count) {
    body.innerHTML = `<tr><td colspan="4">${emptyState('No validators reported', 'The active set is empty right now.', 'validators')}</td></tr>`;
    return;
  }

  body.innerHTML = rows.map((r, i) => {
    // share in basis points (BigInt), then to %
    const shareBp = totalStakeWei > 0n ? Number((r.stakeWei * 10000n) / totalStakeWei) / 100 : 0;
    const barW = Math.max(2, Math.min(100, shareBp)); // keep a sliver visible
    const top = i === 0;
    return `<tr>
      <td><span class="badge ${top ? 'accent' : 'neutral'}">#${i + 1}</span></td>
      <td><span style="display:inline-flex;align-items:center;gap:4px">${addrLink(r.address, { short: true })}${copyBtn(r.address)}</span></td>
      <td class="num">${fmtMrsn(r.stakeWei, 2)}</td>
      <td>
        <div style="display:flex;align-items:center;gap:9px">
          <div style="flex:1;height:7px;border-radius:5px;background:var(--bg-elev);overflow:hidden">
            <div style="width:${barW}%;height:100%;background:var(--grad-accent);border-radius:5px"></div>
          </div>
          <span class="mono" style="min-width:52px;text-align:right;color:var(--text-2);font-size:var(--fs-sm)">${shareBp.toFixed(2)}%</span>
        </div>
      </td>
    </tr>`;
  }).join('');
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
