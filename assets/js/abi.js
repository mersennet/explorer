// Minimal, dependency-free ABI / event-log decoder. Mersennet is mostly native
// CLOB traffic, but when EVM transactions DO appear (faucet token mints, ERC-20
// transfers, approvals) we turn opaque calldata + event-log hex into readable
// methods and parameters. We decode against a curated signature table — no
// keccak needed: the standard ERC-20 / ERC-721 / wrapped-native signatures plus
// the chain's known selectors. Unknown selectors/topics fall back to the raw
// 4-byte / topic₀ so nothing is ever silently hidden.
import { KNOWN_CONTRACTS } from './config.js';

// 4-byte selector → { name, inputs:[{name,type}] }. All static (head-word) types.
const FUNCTIONS = {
  '0xa9059cbb': { name: 'transfer', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }] },
  '0x095ea7b3': { name: 'approve', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }] },
  '0x23b872dd': { name: 'transferFrom', inputs: [{ name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }] },
  '0x40c10f19': { name: 'mint', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }] },
  '0x42966c68': { name: 'burn', inputs: [{ name: 'amount', type: 'uint256' }] },
  '0x79cc6790': { name: 'burnFrom', inputs: [{ name: 'account', type: 'address' }, { name: 'amount', type: 'uint256' }] },
  '0xd0e30db0': { name: 'deposit', inputs: [] },
  '0x2e1a7d4d': { name: 'withdraw', inputs: [{ name: 'amount', type: 'uint256' }] },
  '0x70a08231': { name: 'balanceOf', inputs: [{ name: 'owner', type: 'address' }] },
  '0x18160ddd': { name: 'totalSupply', inputs: [] },
  '0x06fdde03': { name: 'name', inputs: [] },
  '0x95d89b41': { name: 'symbol', inputs: [] },
  '0x313ce567': { name: 'decimals', inputs: [] },
};

// topic₀ (keccak event sig) → { name, inputs:[{name,type,indexed}] }. These hashes
// are fixed, well-known constants for the standard token events.
const EVENTS = {
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef': {
    name: 'Transfer',
    inputs: [{ name: 'from', type: 'address', indexed: true }, { name: 'to', type: 'address', indexed: true }, { name: 'value', type: 'uint256', indexed: false }],
  },
  '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925': {
    name: 'Approval',
    inputs: [{ name: 'owner', type: 'address', indexed: true }, { name: 'spender', type: 'address', indexed: true }, { name: 'value', type: 'uint256', indexed: false }],
  },
  '0x17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b5937696c31': {
    name: 'ApprovalForAll',
    inputs: [{ name: 'owner', type: 'address', indexed: true }, { name: 'operator', type: 'address', indexed: true }, { name: 'approved', type: 'bool', indexed: false }],
  },
  '0xe1fffcc4923d04b559f4d29a8bfc6cda04eb5b0d3c460751c2402c5c5cc9109c': {
    name: 'Deposit',
    inputs: [{ name: 'dst', type: 'address', indexed: true }, { name: 'wad', type: 'uint256', indexed: false }],
  },
  '0x7fcf532c15f0a6db0bd6d0e038bea71d30d808c7d98cb3bf7268a95bf5081b65': {
    name: 'Withdrawal',
    inputs: [{ name: 'src', type: 'address', indexed: true }, { name: 'wad', type: 'uint256', indexed: false }],
  },
};

// ---- 32-byte word helpers (operate on a 0x-prefixed hex blob) ----
function word(hex, i) {
  const s = (hex || '0x').slice(2);
  const start = i * 64;
  return s.slice(start, start + 64).padEnd(64, '0');
}
function decAddress(w) { return '0x' + w.slice(24).toLowerCase(); }
function decUint(w) { try { return BigInt('0x' + w); } catch { return 0n; } }
function decValue(type, w) {
  if (type === 'address') return decAddress(w);
  if (type === 'bool') return decUint(w) !== 0n;
  if (type.startsWith('uint') || type.startsWith('int')) return decUint(w);
  return '0x' + w; // bytes32 / fallback
}

// Decode tx calldata. Returns:
//   { name, selector, params:[{name,type,value}] }  when the selector is known
//   { name:null, selector }                          when unknown (raw 4-byte)
//   null                                             for empty/native-transfer input
export function decodeInput(input) {
  if (!input || input === '0x' || input.length < 10) return null;
  const sel = input.slice(0, 10).toLowerCase();
  const fn = FUNCTIONS[sel];
  if (!fn) return { name: null, selector: sel, params: null };
  const body = '0x' + input.slice(10);
  const params = fn.inputs.map((inp, i) => ({ name: inp.name, type: inp.type, value: decValue(inp.type, word(body, i)) }));
  return { name: fn.name, selector: sel, params };
}

// Decode an event log against the known-event table. Returns
//   { name, signature, args:[{name,type,indexed,value}], standard }  or null.
export function decodeLog(log) {
  const topics = (log && log.topics) || [];
  const t0 = (topics[0] || '').toLowerCase();
  const ev = EVENTS[t0];
  if (!ev) return null;
  let inputs = ev.inputs;
  let standard = 'ERC-20';
  // ERC-721 Transfer shares topic₀ with ERC-20 Transfer but indexes the tokenId
  // (4 topics total) instead of carrying a value word in data.
  if (ev.name === 'Transfer' && topics.length === 4) {
    inputs = [{ name: 'from', type: 'address', indexed: true }, { name: 'to', type: 'address', indexed: true }, { name: 'tokenId', type: 'uint256', indexed: true }];
    standard = 'ERC-721';
  }
  const data = log.data && log.data !== '0x' ? log.data : '0x';
  let ti = 1, di = 0;
  const args = inputs.map((inp) => {
    const raw = inp.indexed ? (topics[ti++] || '').replace(/^0x/, '').padStart(64, '0') : word(data, di++);
    return { name: inp.name, type: inp.type, indexed: !!inp.indexed, value: decValue(inp.type, raw) };
  });
  return { name: ev.name, signature: `${ev.name}(${inputs.map((i) => i.type).join(',')})`, args, standard };
}

// token metadata for a known ERC-20 (symbol/decimals) or null
export function tokenMeta(addr) {
  const k = KNOWN_CONTRACTS[(addr || '').toLowerCase()];
  return k && k.kind === 'token' ? k : null;
}

// human label for a known function name, or null
export function knownFunction(sel) {
  const fn = FUNCTIONS[(sel || '').toLowerCase()];
  return fn ? fn.name : null;
}
