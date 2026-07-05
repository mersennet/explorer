// Transaction detail. getTx + getReceipt for params.hash. Renders a status
// badge, decoded method, key/value details, expandable input data, and a decoded
// logs table. Handles a missing tx (not found) and a privacy-gated tx (-32605)
// with clear, honest messaging.
import { CONFIG, KNOWN_METHODS, KNOWN_CONTRACTS } from '../config.js';
import { rpc, getReceipt, getBlock, RpcError } from '../rpc.js';
import { api } from '../api.js';
import { render, icon, copyBtn, hashLink, addrLink, emptyState } from '../ui.js';
import { fmtMrsn, fmtNum, fmtUnits, hexToBig, hexToNum, fmtTime, timeAgo, shortHash, shortAddr, gasPct, esc } from '../format.js';
import { decodeInput, decodeLog, tokenMeta } from '../abi.js';

function methodOf(input) {
  if (!input || input === '0x' || input.length < 10) return { label: 'transfer', cls: 'method', sel: '0x', dec: null };
  const dec = decodeInput(input);
  const sel = dec ? dec.selector : input.slice(0, 10).toLowerCase();
  const known = (dec && dec.name) || KNOWN_METHODS[sel];
  return { label: known || sel, cls: known ? 'accent' : 'method', sel, dec: dec && dec.params ? dec : null };
}

const crumbs = `<div class="crumbs"><a class="link" href="/">Home</a> ${icon('arrow',11)}
  <a class="link" href="/txs">Transactions</a> ${icon('arrow',11)} <span>Detail</span></div>`;

export default async function tx(params) {
  const hash = (params && params.hash) || '';

  render(`
    ${crumbs}
    <div class="page-head">
      <h1 style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        Transaction <span id="statusBadge"></span>
      </h1>
      <div class="sub mono" style="word-break:break-all" id="hashLine">${esc(shortHash(hash, 14, 12))}</div>
    </div>
    <div id="content">
      <div class="card pad"><div class="sk line"></div><div class="sk line"></div><div class="sk line short"></div></div>
    </div>`);

  const content = () => document.getElementById('content');

  // basic shape check before hitting the node
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) {
    content().innerHTML = `<div class="card pad">${emptyState('Invalid transaction hash', 'A transaction hash is a 0x-prefixed 32-byte (64 hex char) value.', 'tx')}</div>`;
    return;
  }

  // fetch tx (may throw privacy-gated) + receipt (rpcSafe → null on error)
  let txData;
  try {
    txData = await rpc('eth_getTransactionByHash', [hash]);
  } catch (e) {
    if (e instanceof RpcError && e.privacyGated) { renderGated(content(), hash); return; }
    content().innerHTML = `<div class="card pad">${emptyState('Could not load transaction', (e && e.message) || 'RPC error', 'tx')}</div>`;
    return;
  }

  if (!txData) {
    // The node prunes old blocks/txs from its RPC window — fall back to the
    // indexer archive before declaring the tx missing.
    const idx = await api.tx(hash);
    if (idx && idx.transaction) {
      const { tx: itx, receipt: irc, block: ibl } = indexerToRpcTx(idx.transaction);
      renderTx(content(), itx, irc, ibl);
      return;
    }
    renderNotFound(content(), hash);
    return;
  }

  const [receipt, block] = await Promise.all([
    getReceipt(hash),
    txData.blockNumber ? getBlock(txData.blockNumber).catch(() => null) : Promise.resolve(null),
  ]);

  renderTx(content(), txData, receipt, block);
}

// Map an indexer transactions row (snake_case, mixed dec/hex) to the RPC
// tx/receipt/block shapes renderTx expects.
function indexerToRpcTx(t) {
  const toHex = (v) => {
    if (v == null || v === '') return null;
    const s = String(v);
    if (s.startsWith('0x')) return s;
    try { return '0x' + BigInt(s).toString(16); } catch { return null; }
  };
  return {
    tx: {
      hash: t.hash,
      blockNumber: toHex(t.block_number),
      transactionIndex: toHex(t.tx_index),
      from: t.from_addr,
      to: t.to_addr,
      value: toHex(t.value) || '0x0',
      input: t.input || '0x',
      nonce: toHex(t.nonce) || '0x0',
      gas: toHex(t.gas) || '0x0',
      gasPrice: toHex(t.gas_price),
    },
    receipt: {
      status: Number(t.status) === 1 ? '0x1' : '0x0',
      gasUsed: toHex(t.gas_used),
      contractAddress: t.contract_address || null,
      logs: [],
    },
    block: t.timestamp ? { timestamp: toHex(t.timestamp), baseFeePerGas: null } : null,
  };
}

function renderNotFound(el, hash) {
  el.innerHTML = `<div class="card pad">${emptyState(
    'Transaction not found',
    'It may be pending, dropped, or not yet propagated to this node. Double-check the hash.',
    'tx')}
    <div class="mono" style="text-align:center;color:var(--text-3);font-size:var(--fs-sm);margin-top:6px;word-break:break-all">${esc(hash)}</div>
    <div style="text-align:center;margin-top:14px"><a class="btn" href="/txs">${icon('tx',16)} All transactions</a></div></div>`;
}

function renderGated(el, hash) {
  el.innerHTML = `<div class="card pad glow-teal">
    <div class="card-title" style="padding:0 0 12px;border:none"><span>${icon('privacy',16)} Shielded transaction</span><span class="badge teal">private</span></div>
    <div style="color:var(--text-2);line-height:1.6">This transaction touches the shielded pool and its details are not publicly readable
      — the node returned a privacy gate (<span class="mono">-32605</span>). That is by design: shielded transfers reveal
      no sender, recipient, or amount. Only validity proofs and the encrypted note commitments are recorded on-chain.</div>
    <div class="banner teal" style="margin-top:14px">${icon('lock',14)} Privacy is a first-class property of Mersennet — these reads stay dark on purpose.</div>
    <div class="mono" style="color:var(--text-3);font-size:var(--fs-sm);margin-top:12px;word-break:break-all">${esc(hash)} ${copyBtn(hash)}</div>
  </div>`;
}

function renderTx(el, tx, receipt, block) {
  const m = methodOf(tx.input);
  const ok = receipt ? receipt.status === '0x1' : null;
  const created = receipt && receipt.contractAddress ? receipt.contractAddress : null;
  const ts = block ? hexToNum(block.timestamp) : null;
  const baseFee = block ? block.baseFeePerGas : null;
  const gasUsed = receipt ? receipt.gasUsed : null;
  const blockNum = tx.blockNumber != null ? hexToNum(tx.blockNumber) : null;

  // status badge into the header
  const sb = document.getElementById('statusBadge');
  if (sb) {
    if (ok === true) sb.outerHTML = `<span class="badge ok" id="statusBadge">${icon('check',12)} Success</span>`;
    else if (ok === false) sb.outerHTML = `<span class="badge fail" id="statusBadge">Failed</span>`;
    else sb.outerHTML = `<span class="badge warn" id="statusBadge">${icon('clock',12)} Pending</span>`;
  }
  const hl = document.getElementById('hashLine');
  if (hl) hl.innerHTML = `${esc(tx.hash)} ${copyBtn(tx.hash)}`;

  const toRow = created
    ? `<div class="k">${icon('token',13)} Contract created</div><div class="v">${addrLink(created, { short: false })} ${copyBtn(created)} <span class="badge accent" style="margin-left:6px">new</span></div>`
    : tx.to
      ? `<div class="k">${icon('arrow',13)} To</div><div class="v">${addrLink(tx.to, { short: false })} ${knownTag(tx.to)} ${copyBtn(tx.to)}</div>`
      : `<div class="k">${icon('arrow',13)} To</div><div class="v"><span class="badge neutral">contract creation</span></div>`;

  const gasUsedPct = (gasUsed && tx.gas) ? gasPct(gasUsed, tx.gas) : null;

  const rows = [
    `<div class="k">${icon('tx',13)} Tx hash</div><div class="v">${esc(tx.hash)} ${copyBtn(tx.hash)}</div>`,
    `<div class="k">${icon('blocks',13)} Block</div><div class="v">${blockNum != null
        ? `<a class="hash link" href="/block/${blockNum}">${fmtNum(blockNum)}</a>` + (tx.transactionIndex != null ? ` <span style="color:var(--text-3)">· position ${hexToNum(tx.transactionIndex)}</span>` : '')
        : '<span style="color:var(--text-3)">pending</span>'}</div>`,
    `<div class="k">${icon('clock',13)} Timestamp</div><div class="v">${ts ? `${fmtTime(ts)} <span style="color:var(--text-3)">(${timeAgo(ts)})</span>` : '—'}</div>`,
    `<div class="k">${icon('account',13)} From</div><div class="v">${addrLink(tx.from, { short: false })} ${copyBtn(tx.from)}</div>`,
    toRow,
    `<div class="k">${icon('coins',13)} Value</div><div class="v">${fmtMrsn(tx.value, 8)} <span style="color:var(--text-3)">MRSN</span></div>`,
    `<div class="k">${icon('bolt',13)} Method</div><div class="v"><span class="badge ${m.cls}">${esc(m.label)}</span>${(m.label !== m.sel && m.sel !== '0x') ? ` <span class="mono" style="color:var(--text-3)">${esc(m.sel)}</span>` : ''}</div>`,
    `<div class="k">${icon('layers',13)} Nonce</div><div class="v">${fmtNum(hexToNum(tx.nonce))}</div>`,
    `<div class="k">${icon('gas',13)} Gas limit / used</div><div class="v">${fmtNum(hexToNum(tx.gas))}${gasUsed != null ? ` / ${fmtNum(hexToNum(gasUsed))}` : ''}${gasUsedPct != null ? ` <span style="color:var(--text-3)">(${gasUsedPct.toFixed(1)}%)</span>` : ''}</div>`,
    `<div class="k">${icon('gas',13)} Gas price</div><div class="v">${tx.gasPrice != null ? fmtNum(hexToNum(tx.gasPrice)) + ' wei' : '—'}${baseFee != null ? ` <span style="color:var(--text-3)">· base fee ${fmtNum(hexToNum(baseFee))} wei</span>` : ''}</div>`,
  ];

  // tx fee = gasUsed * gasPrice, split into burnt (base fee) + validator tip.
  if (gasUsed != null && tx.gasPrice != null) {
    const gu = hexToBig(gasUsed), gp = hexToBig(tx.gasPrice);
    const fee = gu * gp;
    rows.push(`<div class="k">${icon('coins',13)} Transaction fee</div><div class="v">${fmtMrsn('0x' + fee.toString(16), 10)} <span style="color:var(--text-3)">MRSN · ${fmtNum(fee)} wei</span></div>`);
    if (baseFee != null) {
      const bf = hexToBig(baseFee);
      const burnt = gu * bf;
      const tip = gp > bf ? gu * (gp - bf) : 0n;
      rows.push(`<div class="k">${icon('bolt',13)} Burnt / validator tip</div><div class="v">${fmtNum(burnt)} <span style="color:var(--text-3)">wei burnt</span> · ${fmtNum(tip)} <span style="color:var(--text-3)">wei tip</span></div>`);
    }
  }
  if (tx.type != null) rows.push(`<div class="k">${icon('network',13)} Type</div><div class="v">${esc(tx.type)}</div>`);

  const hasInput = tx.input && tx.input !== '0x' && tx.input.length > 2;
  const logs = (receipt && Array.isArray(receipt.logs)) ? receipt.logs : [];

  const decodedCard = (m.dec && m.dec.params && m.dec.params.length)
    ? `<div class="card" style="margin-top:14px">
        <div class="card-title"><span>${icon('bolt',15)} Decoded input</span><span class="badge accent">${esc(m.dec.name)}</span></div>
        ${renderParams(m.dec, tx.to)}
      </div>`
    : '';

  el.innerHTML = `
    <div class="card">
      <div class="card-title"><span>Overview</span>${ok === false ? '<span class="badge fail">execution reverted</span>' : ''}</div>
      <div class="kv">${rows.join('')}</div>
    </div>

    ${decodedCard}

    <div class="card" style="margin-top:14px">
      <div class="card-title"><span>${icon('tx',15)} Input data</span><span class="badge neutral">${hasInput ? fmtNum((tx.input.length - 2) / 2) + ' bytes' : 'empty'}</span></div>
      <div class="pad">
        ${hasInput
          ? `<div class="codeblock clamped" id="inputData">${esc(tx.input)}</div>
             <button class="disclose" id="inputToggle">${icon('arrow',12)} Show full input</button>`
          : `<div style="color:var(--text-3);font-size:var(--fs-sm)">No calldata — a plain MRSN value transfer.</div>`}
      </div>
    </div>

    <div class="card" style="margin-top:14px">
      <div class="card-title"><span>${icon('layers',15)} Event logs</span><span class="badge ${logs.length ? 'accent' : 'neutral'}">${logs.length}</span></div>
      ${logs.length ? renderLogs(logs) : `<div class="pad" style="color:var(--text-3);font-size:var(--fs-sm)">${receipt ? 'This transaction emitted no events.' : 'No receipt yet — the transaction is pending.'}</div>`}
    </div>`;

  // expand/collapse input
  const toggle = document.getElementById('inputToggle');
  if (toggle) {
    toggle.onclick = () => {
      const box = document.getElementById('inputData');
      const clamped = box.classList.toggle('clamped');
      toggle.innerHTML = `${icon('arrow', 12)} ${clamped ? 'Show full input' : 'Collapse'}`;
    };
  }
}

function knownTag(addr) {
  const k = addr && KNOWN_CONTRACTS[addr.toLowerCase()];
  if (!k) return '';
  const cls = k.kind === 'precompile' && k.tag === 'privacy' ? 'teal' : 'accent';
  return `<span class="badge ${cls}" style="margin-left:6px" title="${esc(k.note)}">${esc(k.name)}</span>`;
}

// render a single ABI param value: address→link, token amount→symbol-scaled, else raw
function valueCell(type, value, ctxAddr) {
  if (type === 'address') {
    const v = String(value);
    const zero = /^0x0{40}$/i.test(v);
    return zero ? '<span class="badge neutral">0x0 · zero address</span>' : `${addrLink(v, { short: true })} ${knownTag(v)}`;
  }
  if (type === 'bool') return `<span class="badge ${value ? 'ok' : 'neutral'}">${value ? 'true' : 'false'}</span>`;
  if (type.startsWith('uint') || type.startsWith('int')) {
    const tk = tokenMeta(ctxAddr);
    const big = typeof value === 'bigint' ? value : hexToBig(value);
    if (tk) return `<span class="hash">${fmtUnits(big, tk.decimals)}</span> <span style="color:var(--text-3)">${esc(tk.symbol)}</span> <span style="color:var(--text-3)">· ${fmtNum(big)} raw</span>`;
    return `<span class="hash">${fmtNum(big)}</span> <span style="color:var(--text-3)">· 0x${big.toString(16)}</span>`;
  }
  return `<span class="mono" style="word-break:break-all">${esc(shortHash(String(value), 14, 10))}</span>`;
}

function renderParams(dec, toAddr) {
  return `<div class="kv">${dec.params.map((p) =>
    `<div class="k mono">${esc(p.name)} <span style="color:var(--text-3)">${esc(p.type)}</span></div>
     <div class="v">${valueCell(p.type, p.value, toAddr)}</div>`).join('')}</div>`;
}

function renderLogs(logs) {
  return `
    <div class="loglist">
    ${logs.map((log) => {
      const dec = decodeLog(log);
      const topics = log.topics || [];
      const idx = fmtNum(hexToNum(log.logIndex));
      const tk = tokenMeta(log.address);
      if (dec) {
        // decoded event: name + per-arg rows, token amounts scaled when we know the token
        const argRows = dec.args.map((a) =>
          `<div class="logarg"><span class="ln mono">${esc(a.name)}${a.indexed ? ' <span class="badge neutral" style="height:16px">indexed</span>' : ''}</span>
            <span class="lv">${valueCell(a.type, a.value, log.address)}</span></div>`).join('');
        return `<div class="logitem">
          <div class="loghead">
            <span class="badge accent">${esc(dec.name)}</span>
            <span class="badge neutral">${esc(dec.standard)}</span>
            <span style="font-size:var(--fs-xs)">${addrLink(log.address, { short: true })} ${tk ? `<span class="badge teal">${esc(tk.symbol)}</span>` : knownTag(log.address)}</span>
            <span style="margin-left:auto;color:var(--text-3);font-size:var(--fs-xs)">log #${idx}</span>
          </div>
          <div class="mono" style="color:var(--text-3);font-size:var(--fs-xs);margin:2px 0 8px">${esc(dec.signature)}</div>
          ${argRows}
        </div>`;
      }
      // unknown event: honest raw view (topic₀ + indexed topics + data)
      const topic0 = topics[0] || null;
      const extra = topics.slice(1);
      const data = log.data && log.data !== '0x' ? log.data : null;
      return `<div class="logitem">
        <div class="loghead">
          <span class="badge neutral">raw log</span>
          <span style="font-size:var(--fs-xs)">${addrLink(log.address, { short: true })} ${knownTag(log.address)}</span>
          <span style="margin-left:auto;color:var(--text-3);font-size:var(--fs-xs)">log #${idx}</span>
        </div>
        <div class="logarg"><span class="ln">topic₀</span><span class="lv mono" style="word-break:break-all">${topic0 ? `${esc(topic0)} ${copyBtn(topic0)}` : 'anonymous'}</span></div>
        ${extra.map((t, i) => `<div class="logarg"><span class="ln">topic${i + 1}</span><span class="lv mono" style="word-break:break-all">${esc(shortHash(t, 18, 12))}</span></div>`).join('')}
        ${data ? `<div class="logarg"><span class="ln">data</span><span class="lv mono" style="word-break:break-all">${esc(shortHash(data, 24, 14))}</span></div>` : ''}
      </div>`;
    }).join('')}
    </div>
    <div class="pad" style="border-top:1px solid var(--border-soft);color:var(--text-3);font-size:var(--fs-xs)">
      ${icon('layers',11)} Standard token events are decoded against their known signatures; unrecognised events show the raw topic₀ (keccak256 signature) and data.
    </div>`;
}
