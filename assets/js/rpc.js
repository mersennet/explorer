// JSON-RPC client. Handles batching, the privacy-gate error (-32605) and
// method-not-found (-32601) gracefully so pages can degrade instead of crash.
import { CONFIG } from './config.js';

let _id = 1;

export class RpcError extends Error {
  constructor(code, message, data) { super(message); this.code = code; this.data = data; }
  get privacyGated() { return this.code === -32605; }
  get notFound() { return this.code === -32601; }
}

export async function rpc(method, params = [], { timeout = 12000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(CONFIG.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: _id++, method, params }),
      signal: ctrl.signal,
    });
    const json = await res.json();
    if (json.error) throw new RpcError(json.error.code, json.error.message || 'rpc error', json.error.data);
    return json.result;
  } finally { clearTimeout(t); }
}

// rpc that returns null instead of throwing on privacy-gate / not-found / any error.
export async function rpcSafe(method, params = [], opts) {
  try { return await rpc(method, params, opts); }
  catch (e) { return null; }
}

// Multi-call helper. The node does NOT support JSON-RPC batch (array payload →
// parse error), so we issue parallel individual requests with a bounded
// concurrency pool. Returns an array aligned to `calls`; any failure → null.
export async function rpcBatch(calls, { timeout = 12000, concurrency = 12 } = {}) {
  if (!calls.length) return [];
  const out = new Array(calls.length).fill(null);
  let i = 0;
  async function worker() {
    while (i < calls.length) {
      const idx = i++;
      const c = calls[idx];
      out[idx] = await rpcSafe(c.method, c.params || [], { timeout });
    }
  }
  const pool = Array.from({ length: Math.min(concurrency, calls.length) }, worker);
  await Promise.all(pool);
  return out;
}

// --- typed convenience reads ---
export const getChainId = () => rpcSafe('eth_chainId');
export const getBlockNumber = () => rpc('eth_blockNumber');
export const getGasPrice = () => rpcSafe('eth_gasPrice');
export const getBlock = (numOrTag, full = false) => rpc('eth_getBlockByNumber', [numOrTag, full]);
export const getBlockByHash = (h, full = false) => rpc('eth_getBlockByHash', [h, full]);
export const getTx = (h) => rpc('eth_getTransactionByHash', [h]);
export const getReceipt = (h) => rpcSafe('eth_getTransactionReceipt', [h]);
export const getBalance = (a) => rpcSafe('eth_getBalance', [a, 'latest']);
export const getCode = (a) => rpcSafe('eth_getCode', [a, 'latest']);
export const getNonce = (a) => rpcSafe('eth_getTransactionCount', [a, 'latest']);
export const getValidators = () => rpcSafe('mersennet_validators');
export const getCodeAttestation = (a) => rpcSafe('mersennet_getCodeAttestation', [a]);
export const getLogs = (filter) => rpcSafe('eth_getLogs', [filter]);
export const getDomainEvents = (filter) => rpcSafe('mersennet_getDomainEvents', [filter]);
// CLOB
export const getOrderBook = (mkt) => rpcSafe('mersennet_orders_getOrderBook', [mkt]);
export const getOpenOrders = (owner) => rpcSafe('mersennet_orders_getOpenOrders', [owner]);
// privacy / ZK
export const getShieldedRoot = () => rpcSafe('mersennet_getShieldedRoot');
export const getShieldedBalance = () => rpcSafe('mersennet_getShieldedBalance');
export const getShieldedMarketAggregates = () => rpcSafe('mersennet_getShieldedMarketAggregates');
export const getStateProof = (tag) => rpcSafe('mersennet_getStateProof', [tag ?? 'latest']);
export const getLatestStateProof = () => rpcSafe('mersennet_getLatestStateProof');
export const verifyStateProof = (proofHex) => rpc('mersennet_verifyStateProof', [{ proofBincodeHex: proofHex }]);
export const numToTag = (n) => '0x' + BigInt(n).toString(16);
