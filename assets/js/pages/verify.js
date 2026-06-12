// Verifiable Chain — every block is provable. Shows the SP1 succinct state-transition
// proof for a target block (public inputs + state-root transition), a "verify this proof
// yourself" button wired to mersennet_verifyStateProof, a live checkpoint-chain ribbon
// (walks recent proofs and asserts prev.newStateRoot == next.prevStateRoot), and a
// forward-looking pre-fork state when proofs aren't active yet. Teal throughout (ZK surface).
import { getBlockNumber, getStateProof, getLatestStateProof, verifyStateProof, numToTag } from '../rpc.js';
import { ws } from '../ws.js';
import { render, icon, hashLink, copyBtn, skeletonRows, emptyState } from '../ui.js';
import { hexToNum, fmtNum, shortHash, esc } from '../format.js';

const RIBBON = 10; // checkpoint nodes to render

export default async function verify(params = {}) {
  let alive = true;
  let unsub = null;
  let ribbonNodes = []; // checkpoint nodes oldest → newest, each { height, proof|null }
  const requested = params.block != null ? String(params.block).trim() : null;

  render(`
    <div class="crumbs"><a href="#/">Home</a> ${icon('arrow', 12)} <span>Verifiable Chain</span></div>
    <div class="page-head">
      <h1>${icon('verify', 26)} Verifiable Chain</h1>
      <div class="sub">Every block is provable. A single succinct proof attests the whole state transition — no full node required.</div>
    </div>

    <div class="card pad glow-teal" style="margin-bottom:14px">
      <div style="display:flex;align-items:flex-start;gap:14px;flex-wrap:wrap">
        <div style="color:var(--teal);flex:none">${icon('proof', 30)}</div>
        <div style="flex:1;min-width:240px">
          <div style="font-weight:700;font-size:var(--fs-lg);margin-bottom:6px">SP1 succinct state-transition proofs</div>
          <div style="color:var(--text-2);line-height:1.6">
            Each Mersennet block carries a zero-knowledge proof that its state transition is valid: given the
            previous roots and the block's public inputs, the new state and nullifier roots follow from the
            rules of the chain. The proof is a constant-size SP1 receipt — verifying it is cheap and stateless.
            On the Ethereum bridge path that receipt is wrapped to <span class="mono" style="color:var(--teal)">Groth16</span>
            and checked on-chain, so an L1 contract can finalize Mersennet from one succinct proof
            <span style="color:var(--text-3)">— a chain you can verify without trusting anyone, and without syncing a full node.</span>
          </div>
        </div>
      </div>
    </div>

    <div id="selector"></div>
    <div id="proofCard"></div>

    <div class="card" style="margin-top:14px">
      <div class="card-title"><span>${icon('layers', 16)} Checkpoint chain</span>
        <span class="badge teal" id="ribbonStatus">linking…</span></div>
      <div class="pad">
        <div style="color:var(--text-2);font-size:var(--fs-sm);margin-bottom:12px">
          Each node is a block's proof; a link is <b style="color:var(--teal)">verified</b> when the prior proof's
          new state root equals the next proof's previous state root — an unbroken, provable chain of custody.</div>
        <div class="proofchain" id="ribbon">${ribbonSkeleton()}</div>
        <div id="ribbonNote" style="color:var(--text-3);font-size:var(--fs-xs);margin-top:10px"></div>
      </div>
    </div>`);

  // ---------- selector (height input + prev/next) ----------
  function renderSelector(height, latest) {
    const sel = document.getElementById('selector');
    if (!sel) return;
    const h = height ?? latest ?? 0;
    sel.innerHTML = `
      <div class="card pad" style="margin-bottom:14px">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <span style="color:var(--text-2);font-size:var(--fs-sm);font-weight:600">Inspect proof for block</span>
          <button class="btn sq" id="vfyPrev" title="Previous block" ${h <= 0 ? 'disabled' : ''}>${icon('arrow', 14, 'flip')}</button>
          <input id="vfyHeight" class="mono" inputmode="numeric" placeholder="latest" value="${h}"
            style="height:32px;width:120px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);padding:0 12px;font-family:var(--font-mono);outline:none"/>
          <button class="btn sq" id="vfyNext" title="Next block" ${latest != null && h >= latest ? 'disabled' : ''}>${icon('arrow', 14)}</button>
          <button class="btn teal" id="vfyGo">Go</button>
          <span style="margin-left:auto;color:var(--text-3);font-size:var(--fs-xs)">latest #${latest != null ? fmtNum(latest) : '—'}</span>
        </div>
      </div>`;
    const go = (n) => {
      if (n == null || isNaN(n) || n < 0) return;
      location.hash = '#/verify/' + n;
    };
    const input = document.getElementById('vfyHeight');
    document.getElementById('vfyGo').onclick = () => { const v = input.value.trim(); go(v === '' ? latest : Number(v)); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const v = input.value.trim(); go(v === '' ? latest : Number(v)); } });
    const prev = document.getElementById('vfyPrev'); if (prev) prev.onclick = () => go(h - 1);
    const next = document.getElementById('vfyNext'); if (next) next.onclick = () => go(h + 1);
  }

  // ---------- skeleton while the proof loads ----------
  document.getElementById('proofCard').innerHTML = proofSkeleton();

  // resolve latest height (for selector bounds + default target)
  let latest = null;
  try { latest = hexToNum(await getBlockNumber()); } catch {}
  if (!alive) return cleanup;

  // fetch the target proof: explicit height → getStateProof(tag); default → getLatestStateProof
  let proof, targetHeight;
  if (requested != null && requested !== '' && /^\d+$/.test(requested)) {
    targetHeight = Number(requested);
    proof = await getStateProof(numToTag(targetHeight));
  } else {
    proof = await getLatestStateProof();
    if (proof && proof.blockHeight) targetHeight = hexToNum(proof.blockHeight);
    else targetHeight = latest;
  }
  if (!alive) return cleanup;

  renderSelector(targetHeight, latest);
  renderProofCard(proof, targetHeight);

  // ---------- checkpoint ribbon (walk recent heights) ----------
  buildRibbon(latest != null ? latest : targetHeight);

  // ---------- live: extend ribbon + bump status on new proofs ----------
  unsub = ws.subscribe('newStateProof', (p) => {
    if (!alive || !p) return;
    const hgt = hexToNum(p.blockHeight ?? p.blockNumber);
    if (!hgt) return;
    onNewProof(p, hgt);
  });

  // ============================================================
  //  Proof card
  // ============================================================
  function renderProofCard(proof, height) {
    const el = document.getElementById('proofCard');
    if (!el) return;

    // PRE-FORK / unavailable: honest, forward-looking state (machinery is live, proof pending)
    const hasProof = proof && proof.proof !== null && proof.blockHeight && proof.proofBincodeHex;
    if (!hasProof) {
      el.innerHTML = preforkCard(proof, height);
      wireVerifyButton(null);
      return;
    }

    const ph = hexToNum(proof.blockHeight);
    const proofBytes = byteLen(proof.proofBincodeHex);
    const isMock = (proof.proofType || '').toLowerCase().includes('mock');
    el.innerHTML = `
      <div class="card glow-teal">
        <div class="card-title">
          <span>${icon('proof', 16)} State proof · block <a class="hash link" href="#/block/${ph}">#${fmtNum(ph)}</a></span>
          <span class="badge ${isMock ? 'warn' : 'teal'}">${esc(proof.proofType || 'SP1')}</span>
        </div>
        <div class="pad">
          <div class="vfy-transition">
            <div class="root from">
              <div class="lbl">Prev state root</div>
              <div class="val">${esc(proof.prevStateRoot || '—')}</div>
            </div>
            <div class="vfy-arrow">${icon('arrow', 22)}</div>
            <div class="root to">
              <div class="lbl">New state root</div>
              <div class="val">${esc(proof.newStateRoot || '—')} ${copyBtn(proof.newStateRoot || '')}</div>
            </div>
          </div>

          <div class="card-title" style="padding:18px 0 10px;border:none;font-size:var(--fs-sm);color:var(--text-3)">
            <span>${icon('tree', 14)} Public inputs</span>
            <span class="badge neutral">${proofBytes != null ? fmtNum(proofBytes) + ' B proof' : '—'}</span></div>
          <div class="kv vfy-schema">
            ${kvRow('Nullifier root', `${mono(proof.prevNullifierRoot)} ${icon('arrow', 12)} <span class="mono" style="color:var(--teal)">${shortHash(proof.newNullifierRoot, 10, 8)}</span>`, 'tree')}
            ${kvRow('Block hash', hashLink(proof.blockHash, 'block', { lead: 14, tail: 12 }) + ' ' + copyBtn(proof.blockHash || ''), 'blocks')}
            ${kvRow('Market state hash', mono(proof.newMarketStateHash), 'clob')}
            ${kvRow('Tx count', `<span class="mono">${fmtNum(hexToNum(proof.txCount))}</span>`, 'tx')}
            ${kvRow('Proof size', `<span class="mono">${proofBytes != null ? fmtNum(proofBytes) + ' bytes' : '—'}</span> <span style="color:var(--text-3)">· constant-size SP1 receipt</span>`, 'proof')}
          </div>

          <div style="margin-top:18px">
            <button class="btn teal" id="vfyVerify" style="height:40px;padding:0 20px;font-size:var(--fs-md)">
              ${icon('verify', 16)} Verify this proof yourself</button>
            <span style="color:var(--text-3);font-size:var(--fs-xs);margin-left:10px">runs mersennet_verifyStateProof against the node</span>
          </div>
          <div id="vfyResult"></div>
        </div>
      </div>`;
    wireVerifyButton(proof.proofBincodeHex);
  }

  // ============================================================
  //  Verify button — spinner → ✓ Verified (or honest error)
  // ============================================================
  function wireVerifyButton(proofHex) {
    const btn = document.getElementById('vfyVerify');
    const out = document.getElementById('vfyResult');
    if (!btn) return;
    btn.onclick = async () => {
      if (!out) return;
      // pre-fork: no proof to verify — explain what the button will do
      if (!proofHex) {
        out.className = 'vfy-result';
        out.innerHTML = `<div class="head" style="color:var(--teal)">${icon('proof', 18)} No proof yet</div>
          <div class="sub">There is no SP1 proof for this block — state proofs activate at the privacy hard fork.
          Once active, this button calls <span class="mono">mersennet_verifyStateProof</span> and confirms the receipt
          in milliseconds, no full node required.</div>`;
        return;
      }
      btn.disabled = true;
      out.className = 'vfy-result';
      out.innerHTML = `<div class="head" style="color:var(--teal)"><span class="vfy-spin"></span> Verifying SP1 proof…</div>
        <div class="sub">Checking the succinct receipt against the public inputs.</div>`;
      try {
        const res = await verifyStateProof(proofHex);
        if (!alive) return;
        const ok = res && res.valid === true;
        if (ok) {
          out.className = 'vfy-result ok';
          out.innerHTML = `<div class="head"><span class="vfy-check">${icon('check', 18)}</span> Verified — proof is valid</div>
            <div class="sub">The node confirmed <span class="mono">{ valid: true }</span>. This state transition is
            cryptographically sound — you just verified a block without a full node.</div>`;
        } else {
          out.className = 'vfy-result err';
          out.innerHTML = `<div class="head">${icon('verify', 18)} Proof did not verify</div>
            <div class="sub">The node returned <span class="mono">${esc(JSON.stringify(res))}</span>.</div>`;
        }
      } catch (e) {
        if (!alive) return;
        out.className = 'vfy-result err';
        const msg = (e && e.message) || String(e);
        out.innerHTML = `<div class="head">${icon('verify', 18)} Could not verify</div>
          <div class="sub">${esc(msg)}</div>`;
      } finally {
        btn.disabled = false;
      }
    };
  }

  // ============================================================
  //  Checkpoint ribbon: walk getStateProof for recent heights,
  //  assert each prevStateRoot == previous.newStateRoot.
  // ============================================================
  async function buildRibbon(top) {
    if (top == null || top < 0) { renderRibbon(); return; }
    const heights = [];
    for (let i = 0; i < RIBBON && top - i >= 0; i++) heights.push(top - i);
    heights.reverse(); // oldest first
    const proofs = await Promise.all(heights.map((h) => getStateProof(numToTag(h))));
    if (!alive) return;
    ribbonNodes = heights.map((h, i) => {
      const p = proofs[i];
      const ok = p && p.proof !== null && p.blockHeight && p.newStateRoot;
      return { height: h, proof: ok ? p : null };
    });
    renderRibbon();
  }

  function renderRibbon() {
    const el = document.getElementById('ribbon');
    const note = document.getElementById('ribbonNote');
    const status = document.getElementById('ribbonStatus');
    if (!el) return;

    const withProof = ribbonNodes.filter((n) => n.proof);
    if (!withProof.length) {
      el.innerHTML = '';
      el.append(htmlEl(emptyState('No checkpoints yet', 'State proofs activate at the privacy hard fork — the ribbon will fill in live.', 'proof')));
      if (status) { status.textContent = 'fork pending'; status.className = 'badge warn'; }
      if (note) note.textContent = '';
      return;
    }

    let html = '';
    let verifiedLinks = 0, totalLinks = 0;
    for (let i = 0; i < ribbonNodes.length; i++) {
      const n = ribbonNodes[i];
      if (i > 0) {
        const prev = ribbonNodes[i - 1];
        // a link is verifiable only when both endpoints carry a proof
        let cls = '';
        if (prev.proof && n.proof) {
          totalLinks++;
          const linked = eqHash(prev.proof.newStateRoot, n.proof.prevStateRoot);
          if (linked) { cls = 'verified'; verifiedLinks++; } else cls = 'broken';
        }
        html += `<div class="lnk ${cls}" title="${linkTitle(prev, n)}"></div>`;
      }
      const active = n.height === targetHeight;
      const label = n.proof ? '#' + shortNum(n.height) : '·';
      const title = n.proof
        ? `Block #${n.height} · ${esc(n.proof.proofType || 'SP1')} · root ${shortHash(n.proof.newStateRoot, 8, 6)}`
        : `Block #${n.height} · no proof`;
      html += `<a class="node ${active ? 'active' : ''}" href="#/verify/${n.height}" title="${title}"
        style="${n.proof ? '' : 'opacity:.4'}">${label}</a>`;
    }
    el.innerHTML = html;

    if (status) {
      status.className = 'badge teal';
      status.textContent = totalLinks > 0 && verifiedLinks === totalLinks
        ? `${verifiedLinks}/${totalLinks} links verified` : `${verifiedLinks}/${totalLinks} verified`;
    }
    if (note) {
      const span = withProof[0].height + '–' + withProof[withProof.length - 1].height;
      note.innerHTML = totalLinks > 0 && verifiedLinks === totalLinks
        ? `${icon('check', 12)} Unbroken chain across blocks ${span}: every root transition checks out.`
        : `Showing proofs for blocks ${span}. ${ribbonNodes.length - withProof.length} block(s) have no proof yet.`;
    }
  }

  async function onNewProof(p, hgt) {
    // the WS notification may be partial; if it lacks roots, fetch the full proof so links stay verifiable
    let full = (p.proof !== null && p.newStateRoot) ? p : null;
    if (!full) { full = await getStateProof(numToTag(hgt)).catch(() => null); if (!alive) return; }
    const ok = full && full.proof !== null && full.newStateRoot;
    placeNode({ height: hgt, proof: ok ? full : null });
  }

  function placeNode(node) {
    // append/replace node, keep the ribbon at RIBBON width, then re-link + animate
    const idx = ribbonNodes.findIndex((n) => n.height === node.height);
    if (idx >= 0) ribbonNodes[idx] = node;
    else {
      ribbonNodes.push(node);
      ribbonNodes.sort((a, b) => a.height - b.height);
      if (ribbonNodes.length > RIBBON) ribbonNodes = ribbonNodes.slice(-RIBBON);
    }
    renderRibbon();
    const el = document.getElementById('ribbon');
    if (el) { const nodes = el.querySelectorAll('.node'); const last = nodes[nodes.length - 1]; if (last) last.classList.add('enter'); }
  }

  function cleanup() { alive = false; try { if (unsub) unsub(); } catch {} }
  return cleanup;
}

// ---------- pre-fork forward-looking proof card ----------
function preforkCard(proof, height) {
  const reason = proof && proof.reason ? proof.reason : null;
  const h = (proof && proof.blockHeight) ? hexToNum(proof.blockHeight) : (height != null ? height : null);
  return `
    <div class="card glow-teal">
      <div class="card-title">
        <span>${icon('proof', 16)} State proof ${h != null ? '· block #' + fmtNum(h) : ''}</span>
        <span class="badge warn">fork pending</span>
      </div>
      <div class="pad">
        <div class="banner teal" style="margin-bottom:16px">${icon('proof', 16)}
          <span>SP1 state proofs activate at the privacy hard fork. The prover and the on-chain verifier are
          implemented — here's exactly how verification will work.</span></div>
        ${reason ? `<div style="color:var(--text-3);font-size:var(--fs-xs);margin:-8px 0 16px">node: ${esc(reason)}</div>` : ''}

        <div style="color:var(--text-2);line-height:1.6;margin-bottom:16px">
          When the fork is live, every block emits a proof attesting this state transition. The proof commits to a
          fixed set of public inputs — verifiers re-derive nothing, they just check the receipt against these values:</div>

        <div class="card-title" style="padding:0 0 10px;border:none;font-size:var(--fs-sm);color:var(--text-3)">
          <span>${icon('tree', 14)} Public-input schema</span></div>
        <div class="kv vfy-schema">
          ${kvRow('prevStateRoot', schemaVal('the state root the block builds on'), 'tree')}
          ${kvRow('newStateRoot', schemaVal('the resulting state root after applying the block', true), 'tree')}
          ${kvRow('prevNullifierRoot', schemaVal('shielded nullifier set before the block'), 'tree')}
          ${kvRow('newNullifierRoot', schemaVal('shielded nullifier set after the block', true), 'tree')}
          ${kvRow('blockHash', schemaVal('the block this transition corresponds to'), 'blocks')}
          ${kvRow('newMarketStateHash', schemaVal('CLOB / market state commitment'), 'clob')}
          ${kvRow('txCount', schemaVal('transactions folded into this proof'), 'tx')}
        </div>

        <div style="margin-top:18px">
          <button class="btn teal" id="vfyVerify" style="height:40px;padding:0 20px;font-size:var(--fs-md)">
            ${icon('verify', 16)} Verify this proof yourself</button>
          <span style="color:var(--text-3);font-size:var(--fs-xs);margin-left:10px">wired and ready — it'll explain when there's no proof yet</span>
        </div>
        <div id="vfyResult"></div>
      </div>
    </div>`;
}

// ---------- small helpers ----------
function kvRow(k, v, ic) {
  return `<div class="k">${icon(ic, 13)} ${esc(k)}</div><div class="v">${v}</div>`;
}
function schemaVal(desc, teal) {
  return `<span class="mono" style="color:var(--text-3)">field</span>
    <span style="color:var(--text-2);font-family:var(--font-ui);font-size:var(--fs-sm);margin-left:8px${teal ? ';' : ''}">${teal ? '<span style="color:var(--teal)">→</span> ' : ''}${esc(desc)}</span>`;
}
function mono(h) { return `<span class="mono">${esc(shortHash(h, 10, 8) || '—')}</span>`; }
function eqHash(a, b) { return a && b && String(a).toLowerCase() === String(b).toLowerCase(); }
function linkTitle(prev, n) {
  if (!prev.proof || !n.proof) return 'no proof on one endpoint';
  return eqHash(prev.proof.newStateRoot, n.proof.prevStateRoot)
    ? `verified: #${prev.height} newRoot == #${n.height} prevRoot`
    : `BROKEN: #${prev.height} newRoot != #${n.height} prevRoot`;
}
function byteLen(hex) {
  if (!hex) return null;
  const s = String(hex).startsWith('0x') ? String(hex).slice(2) : String(hex);
  return Math.floor(s.length / 2);
}
function shortNum(n) { return n >= 1000 ? (n % 1000).toString() : String(n); }
function htmlEl(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; }

function proofSkeleton() {
  return `
    <div class="card">
      <div class="card-title"><span class="sk line" style="width:200px;height:14px"></span><span class="sk line short" style="width:60px"></span></div>
      <div class="pad">
        <div class="sk line" style="height:60px;border-radius:13px"></div>
        <table class="tbl" style="margin-top:14px"><tbody>${skeletonRows(5, 2)}</tbody></table>
      </div>
    </div>`;
}
function ribbonSkeleton() {
  let s = '';
  for (let i = 0; i < RIBBON; i++) {
    if (i > 0) s += `<div class="lnk"></div>`;
    s += `<div class="node sk" style="border:none"></div>`;
  }
  return s;
}
