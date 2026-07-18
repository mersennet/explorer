// Tokenomics: the Mersenne-prime story. Hero stats (all derived from CONFIG),
// an SVG emission curve that visibly converges far below the 2^89-1 supply cap,
// a Mersenne-primes/perfect-numbers explainer tying the constants to the brand,
// and the allocation note (emission-over-time + genesis allocations).
// Brand surface = GREEN (--accent). No live data here — purely deterministic.
import { CONFIG } from '../config.js';
import { getBlockNumber } from '../rpc.js';
import { render, icon } from '../ui.js';
import { fmtNum, compact, hexToNum, esc } from '../format.js';

const ERAS = 10;                                  // halving eras to chart
const YEARS_PER_ERA = CONFIG.halvingInterval / (365.25 * 24 * 3600); // ~1.06 yr at 1s blocks

// MRSN (as a JS number) from a wei bigint
const weiToMrsn = (w) => Number(w) / 1e18;

export default async function tokenomics() {
  // --- derived constants (exact integer math in wei, then to MRSN floats) ---
  const R0wei = CONFIG.initialRewardWei;                 // 2^61 - 1
  const Hbig = BigInt(CONFIG.halvingInterval);
  const era0Wei = R0wei * Hbig;                          // emission of the first (full-reward) era
  const totalWei = 2n * era0Wei;                         // sum of geometric series = 2*R0*H
  const capMrsn = weiToMrsn(CONFIG.supplyCapWei);        // 618,970,019.64
  const initRewardMrsn = weiToMrsn(R0wei);               // ~2.3058
  const era0Mrsn = weiToMrsn(era0Wei);                   // ~77.36M
  const totalMrsn = weiToMrsn(totalWei);                 // ~154.72M (== CONFIG.emissionTotalMrsn)

  // cumulative emission after each era boundary: R0*H*(2 - 2^(1-n))
  const cumByEra = [];   // {era, yearStart, yearEnd, cumMrsn, frac}
  let cum = 0n;
  for (let k = 0; k < ERAS; k++) {
    cum += era0Wei / (2n ** BigInt(k));
    cumByEra.push({
      era: k,
      yearStart: k * YEARS_PER_ERA,
      yearEnd: (k + 1) * YEARS_PER_ERA,
      cumMrsn: weiToMrsn(cum),
      frac: Number(cum) / Number(totalWei),
    });
  }

  render(`
    <div class="page-head">
      <div class="crumbs"><a href="/">Home</a> ${icon('arrow', 12)} <span>Tokenomics</span></div>
      <h1>${icon('coins', 24)} Tokenomics</h1>
      <div class="sub">A monetary policy built entirely from <span style="color:var(--accent)">Mersenne primes</span> and <span style="color:var(--accent)">perfect numbers</span> — a hard, finite, fast-converging emission.</div>
    </div>

    <div class="grid cols-4" style="margin-bottom:14px">
      ${stat('coins', 'Supply cap', '618.97M', '2⁸⁹−1 wei · Mersenne prime', 'M89')}
      ${stat('bolt', 'Initial block reward', fmtNum(initRewardMrsn, 4), '2⁶¹−1 wei ≈ 2.31 MRSN · Mersenne prime', 'M61')}
      ${stat('clock', 'Halving interval', compact(CONFIG.halvingInterval) + ' blk', '5th perfect number · ~' + YEARS_PER_ERA.toFixed(2) + ' yr/era', 'P5')}
      ${stat('layers', 'Total emission', compact(totalMrsn), '2·R₀·H — converges, never reaches cap', '∞→')}
    </div>

    <div class="card" id="emissionStatus" style="margin-bottom:14px">
      <div class="card-title"><span>${icon('clock', 16)} Emission status — target schedule at live height</span><span class="badge neutral" id="esBadge">reading chain…</span></div>
      <div class="pad" id="esBody"><div class="sk line"></div><div class="sk line short"></div></div>
    </div>

    <div class="card" style="margin-bottom:14px">
      <div class="card-title"><span>${icon('pulse', 16)} Emission curve</span>
        <span class="badge accent">converges to ${compact(totalMrsn)} MRSN</span></div>
      <div class="pad" id="chart"></div>
      <div class="kv" style="border-top:1px solid var(--border-soft)">
        <div class="k">${icon('coins', 13)} Total minted at convergence</div>
        <div class="v">${fmtNum(totalMrsn, 2)} MRSN <span style="color:var(--text-3)">(${(totalMrsn / capMrsn * 100).toFixed(1)}% of the hard cap)</span></div>
        <div class="k">${icon('bolt', 13)} Headroom below cap</div>
        <div class="v">${fmtNum(capMrsn - totalMrsn, 0)} MRSN <span style="color:var(--text-3)">never minted — the cap is a ceiling, not a target</span></div>
      </div>
    </div>

    <div class="grid cols-2-1" style="margin-bottom:14px">
      <div class="card">
        <div class="card-title"><span>${icon('blocks', 16)} Mersenne primes &amp; perfect numbers</span></div>
        <div class="pad" style="color:var(--text-2);font-size:var(--fs-md);line-height:1.65">
          <p style="margin-bottom:12px">A <strong style="color:var(--accent)">Mersenne prime</strong> is a prime of the form <span class="mono">2ⁿ−1</span>. Every constant in Mersennet's monetary policy is one — the chain's numbers are prime by construction.</p>
          <div class="kv" style="border:1px solid var(--border-soft);border-radius:var(--radius);overflow:hidden;margin-bottom:12px">
            <div class="k">2¹³−1 = 8191</div><div class="v" style="color:var(--accent)">mainnet chain id <span style="color:var(--text-3)">(M13)</span></div>
            <div class="k">2¹⁷−1 = 131071</div><div class="v" style="color:var(--accent)">testnet chain id <span style="color:var(--text-3)">(M17)</span></div>
            <div class="k">2⁶¹−1</div><div class="v" style="color:var(--accent)">initial block reward, wei <span style="color:var(--text-3)">(M61)</span></div>
            <div class="k">2⁸⁹−1</div><div class="v" style="color:var(--accent)">supply cap, wei <span style="color:var(--text-3)">(M89)</span></div>
          </div>
          <p style="margin-bottom:12px">A <strong style="color:var(--accent)">perfect number</strong> equals the sum of its proper divisors, and every even one is <span class="mono">2ᵖ⁻¹(2ᵖ−1)</span> with <span class="mono">2ᵖ−1</span> Mersenne-prime (Euclid–Euler). The halving interval is the <strong>5th perfect number</strong>:</p>
          <div style="text-align:center;font-family:var(--font-mono);font-size:var(--fs-lg);color:var(--accent);padding:14px;background:var(--accent-bg);border-radius:var(--radius)">
            2¹² · (2¹³−1) = 4096 · 8191 = ${fmtNum(CONFIG.halvingInterval)}
          </div>
          <p style="margin-top:12px;color:var(--text-3);font-size:var(--fs-sm)">The factor <span class="mono">2¹³−1 = 8191</span> hidden in the halving interval is the mainnet chain id — perfect numbers and Mersenne primes are two views of the same object.</p>
        </div>
      </div>
      <div class="card">
        <div class="card-title"><span>${icon('token', 16)} At a glance</span></div>
        <div class="kv">
          <div class="k">Symbol</div><div class="v">${CONFIG.symbol}</div>
          <div class="k">Decimals</div><div class="v">${CONFIG.decimals}</div>
          <div class="k">Block time</div><div class="v">~${CONFIG.blockTimeSecs}s</div>
          <div class="k">First-era emission</div><div class="v">${compact(era0Mrsn)} MRSN</div>
          <div class="k">First-era duration</div><div class="v">~${YEARS_PER_ERA.toFixed(2)} years</div>
          <div class="k">50% emitted by</div><div class="v">end of era 0 (~${YEARS_PER_ERA.toFixed(1)} yr)</div>
          <div class="k">99% emitted by</div><div class="v">end of era 6 (~${(7 * YEARS_PER_ERA).toFixed(1)} yr)</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-title"><span>${icon('wallet', 16)} Where MRSN comes from</span></div>
      <div class="pad" style="color:var(--text-2);font-size:var(--fs-md);line-height:1.6">
        <p style="margin-bottom:14px">Total MRSN = <strong style="color:var(--accent)">block-reward emission minted over time</strong> (the curve above) <strong>+</strong> <strong style="color:var(--accent)">genesis allocations</strong> finalized at block 0. Validators earn the block reward each block; the genesis allocations were fixed once, at genesis, and are not part of ongoing emission.</p>
        <div class="grid cols-2">
          <div style="border:1px solid var(--border-soft);border-radius:var(--radius);padding:14px">
            <div style="display:flex;align-items:center;gap:8px;color:var(--accent);font-weight:600;margin-bottom:8px">${icon('pulse', 15)} Emission (minted over time)</div>
            <div style="font-size:var(--fs-sm)">~${compact(totalMrsn)} MRSN paid to validators as block rewards, halving every ${compact(CONFIG.halvingInterval)} blocks. Front-loaded: half within the first era.</div>
          </div>
          <div style="border:1px solid var(--border-soft);border-radius:var(--radius);padding:14px">
            <div style="display:flex;align-items:center;gap:8px;color:var(--accent);font-weight:600;margin-bottom:8px">${icon('layers', 15)} Genesis allocations (fixed at block 0)</div>
            <div style="font-size:var(--fs-sm)">Ecosystem, foundation, team, and public sales — proportions finalized at genesis. Combined with emission, total issuance stays well under the 2⁸⁹−1 cap.</div>
          </div>
        </div>
        <div class="banner info" style="margin-top:14px">${icon('verify', 15)} The cap (2⁸⁹−1) is a provable ceiling fixed in the node's genesis config; emission converges to ~${compact(totalMrsn)} MRSN, so roughly ${fmtNum(capMrsn - totalMrsn, 0)} MRSN is mathematically unreachable.</div>
      </div>
    </div>`);

  // paint the responsive SVG curve after the view exists
  drawCurve(document.getElementById('chart'), cumByEra, totalMrsn, capMrsn, YEARS_PER_ERA);

  // live emission status — derive era / countdown / emitted-to-date from height
  let height = null;
  try { height = hexToNum(await getBlockNumber()); } catch {}
  fillEmissionStatus({ height, R0wei, Hbig, totalWei, capMrsn, totalMrsn, yearsPerEra: YEARS_PER_ERA });
}

// Compute live emission facts from the current height and paint the status card.
// All token math is exact BigInt wei; only the final display values go to floats.
function fillEmissionStatus({ height, R0wei, Hbig, totalWei, capMrsn, totalMrsn, yearsPerEra }) {
  const badge = document.getElementById('esBadge');
  const body = document.getElementById('esBody');
  if (!body) return;
  if (height == null) {
    if (badge) { badge.textContent = 'offline'; badge.className = 'badge warn'; }
    body.innerHTML = `<div style="color:var(--text-3);font-size:var(--fs-sm)">Could not read the current block height — emission is still deterministic from the schedule above.</div>`;
    return;
  }

  const H = Number(Hbig);
  const era = Math.floor(height / H);
  const blocksIntoEra = height - era * H;
  const blocksToHalving = H - blocksIntoEra;

  // current reward = R0 / 2^era  (exact)
  const rewardWei = R0wei >> BigInt(era);
  // emitted = Σ completed eras (R0>>k)*H  +  current reward * blocksIntoEra
  let emittedWei = 0n;
  for (let k = 0; k < era; k++) emittedWei += (R0wei >> BigInt(k)) * Hbig;
  emittedWei += rewardWei * BigInt(blocksIntoEra);

  const fracEmit = Number(emittedWei) / Number(totalWei);
  const eraProgress = blocksIntoEra / H;
  const secsToHalving = blocksToHalving * CONFIG.blockTimeSecs;
  const emittedMrsn = Number(emittedWei) / 1e18;
  const rewardMrsn = Number(rewardWei) / 1e18;

  if (badge) { badge.textContent = `era ${era} · block #${fmtNum(height)}`; badge.className = 'badge accent'; }

  body.innerHTML = `
    <div class="grid cols-3" style="margin-bottom:16px">
      ${mini('Current era', `Era ${era}`, `${(eraProgress * 100).toFixed(2)}% through this era`)}
      ${mini('Block reward now', `${rewardMrsn.toFixed(4)} MRSN`, `2⁶¹−1 ÷ 2^${era} per block`)}
      ${mini('Next halving in', `${fmtNum(blocksToHalving)} blk`, `≈ ${humanDuration(secsToHalving)}`)}
    </div>

    <div class="es-track" title="${(eraProgress * 100).toFixed(2)}% through era ${era}">
      <div class="es-fill" style="width:${(eraProgress * 100).toFixed(2)}%"></div>
      <span class="es-cap">halving at block #${fmtNum((era + 1) * H)}</span>
    </div>

    <div class="kv" style="border-top:1px solid var(--border-soft);margin-top:4px">
      <div class="k">${icon('coins', 13)} Emitted to date</div>
      <div class="v">${fmtNum(emittedMrsn, 2)} MRSN
        <span style="color:var(--text-3)">· ${(fracEmit * 100).toFixed(2)}% of total emission · ${(emittedMrsn / capMrsn * 100).toFixed(3)}% of the cap</span></div>
      <div class="k">${icon('pulse', 13)} Remaining to emit</div>
      <div class="v">${fmtNum(totalMrsn - emittedMrsn, 2)} MRSN <span style="color:var(--text-3)">until convergence (~${compact(totalMrsn)} MRSN)</span></div>
    </div>

    <div class="es-progress">
      <div class="es-progress-bar" style="width:${Math.min(100, fracEmit * 100).toFixed(2)}%"></div>
    </div>
    <div style="display:flex;justify-content:space-between;color:var(--text-3);font-size:var(--fs-xs);margin-top:6px">
      <span>genesis</span><span>${(fracEmit * 100).toFixed(1)}% of lifetime emission minted</span><span>convergence</span>
    </div>
    <div style="color:var(--text-3);font-size:var(--fs-xs);margin-top:10px">Height is live; era, reward, and emission figures follow the target schedule fixed in the node's genesis config. The current testnet was bootstrapped with legacy emission parameters, so on-chain rewards differ until the next network upgrade.</div>`;
}

function mini(label, value, meta) {
  return `<div style="border:1px solid var(--border-soft);border-radius:var(--radius);padding:13px 15px">
    <div style="font-size:var(--fs-xs);text-transform:uppercase;letter-spacing:.07em;color:var(--text-3);font-weight:600">${esc(label)}</div>
    <div style="font-family:var(--font-mono);font-size:var(--fs-xl);font-weight:700;margin-top:6px;color:var(--accent)">${value}</div>
    <div style="font-size:var(--fs-xs);color:var(--text-2);margin-top:4px">${meta}</div>
  </div>`;
}

function humanDuration(secs) {
  if (!isFinite(secs) || secs <= 0) return 'imminent';
  const yr = secs / (365.25 * 24 * 3600);
  if (yr >= 1) return `${yr.toFixed(2)} years`;
  const d = secs / 86400;
  if (d >= 1) return `${d.toFixed(0)} days`;
  const h = secs / 3600;
  if (h >= 1) return `${h.toFixed(0)} hours`;
  return `${Math.max(1, Math.round(secs / 60))} min`;
}

function stat(ic, label, value, meta, tag) {
  return `<div class="stat">
    <span class="ico-bg">${icon(ic, 26)}</span>
    <div class="label">${icon(ic, 13)} ${esc(label)}</div>
    <div class="value sm">${value}</div>
    <div class="meta">${meta}</div>
    ${tag ? `<div class="meta" style="margin-top:6px"><span class="badge accent">${esc(tag)}</span></div>` : ''}
  </div>`;
}

// Cumulative-emission area + line chart vs. years. Cap drawn as a reference line
// so the convergence far below it is unmistakable. Pure SVG, viewBox-scaled so
// it stays crisp and responsive on mobile.
function drawCurve(host, cumByEra, totalMrsn, capMrsn, yearsPerEra) {
  if (!host) return;
  const W = 720, H = 320, padL = 64, padR = 18, padT = 18, padB = 40;
  const plotW = W - padL - padR, plotH = H - padT - padB;

  const lastYear = cumByEra[cumByEra.length - 1].yearEnd;
  // y-axis tops out a touch above total emission (not the cap) so the curve fills
  // the plot; the cap sits as a clearly-labelled ceiling above it.
  const yMax = totalMrsn * 1.04;

  const xFor = (yr) => padL + (yr / lastYear) * plotW;
  const yFor = (m) => padT + plotH - (m / yMax) * plotH;

  // build the cumulative path: emission rises within each era then the rate halves
  // at each boundary. We sample start/end of every era for a faithful curve.
  const pts = [{ year: 0, mrsn: 0 }];
  for (const e of cumByEra) pts.push({ year: e.yearEnd, mrsn: e.cumMrsn });

  const linePts = pts.map((p) => `${xFor(p.year).toFixed(1)},${yFor(p.mrsn).toFixed(1)}`).join(' ');
  const areaPath = `M ${xFor(0).toFixed(1)},${yFor(0).toFixed(1)} `
    + pts.map((p) => `L ${xFor(p.year).toFixed(1)},${yFor(p.mrsn).toFixed(1)}`).join(' ')
    + ` L ${xFor(lastYear).toFixed(1)},${yFor(0).toFixed(1)} Z`;

  // y gridlines (MRSN)
  const yTicks = 4;
  let grid = '';
  for (let i = 0; i <= yTicks; i++) {
    const v = (yMax / yTicks) * i;
    const y = yFor(v);
    grid += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${(W - padR).toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--border-soft)" stroke-width="1"/>`;
    grid += `<text x="${padL - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end" fill="var(--text-3)" font-size="11" font-family="ui-monospace, monospace">${compact(v)}</text>`;
  }
  // x ticks (years, by era)
  let xTicks = '';
  for (const e of cumByEra) {
    const x = xFor(e.yearEnd);
    xTicks += `<text x="${x.toFixed(1)}" y="${(H - padB + 22).toFixed(1)}" text-anchor="middle" fill="var(--text-3)" font-size="10" font-family="ui-monospace, monospace">${e.yearEnd.toFixed(0)}y</text>`;
  }

  // milestone annotations 50% / 75% / 99%
  const milestones = [
    { label: '50%', frac: 0.5 },
    { label: '75%', frac: 0.75 },
    { label: '99%', frac: 0.99 },
  ];
  let marks = '';
  for (const ms of milestones) {
    // find first era boundary whose cumulative fraction >= target
    const hit = cumByEra.find((e) => e.frac >= ms.frac - 1e-9);
    if (!hit) continue;
    const x = xFor(hit.yearEnd), y = yFor(hit.cumMrsn);
    marks += `
      <line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${x.toFixed(1)}" y2="${(H - padB).toFixed(1)}" stroke="var(--accent-dim)" stroke-width="1" stroke-dasharray="3 3" opacity="0.55"/>
      <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="var(--accent)"/>
      <text x="${(x + 6).toFixed(1)}" y="${(y - 7).toFixed(1)}" fill="var(--accent)" font-size="11" font-weight="700" font-family="ui-monospace, monospace">${ms.label}</text>`;
  }

  // cap reference line (drawn at the very top region, clearly labelled)
  const capLabel = `Hard cap 2⁸⁹−1 = ${compact(capMrsn)} MRSN (≈${(totalMrsn / capMrsn * 100).toFixed(0)}% reached)`;

  host.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Cumulative MRSN emission across halving eras, converging far below the supply cap">
      <defs>
        <linearGradient id="emitFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.28"/>
          <stop offset="100%" stop-color="var(--accent)" stop-opacity="0.02"/>
        </linearGradient>
      </defs>
      ${grid}
      <path d="${areaPath}" fill="url(#emitFill)"/>
      <polyline points="${linePts}" fill="none" stroke="var(--accent)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
      ${marks}
      ${xTicks}
      <text x="${padL}" y="${(H - 4).toFixed(1)}" fill="var(--text-3)" font-size="11">years (~${yearsPerEra.toFixed(2)} yr / halving era →)</text>
      <text x="${(W - padR).toFixed(1)}" y="${(padT + 10).toFixed(1)}" text-anchor="end" fill="var(--text-2)" font-size="11" font-family="ui-monospace, monospace">${capLabel}</text>
    </svg>`;
}
