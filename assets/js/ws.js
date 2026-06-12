// WebSocket manager — one socket, many topic subscriptions, auto-reconnect with
// capped backoff. Topics: newHeads, MersennetOrdersTrades, newShieldedRoot,
// newStateProof, newClearingPrice. Falls back silently if the WS endpoint is
// unreachable (pages still work via polling).
import { CONFIG } from './config.js';

let sock = null;
let backoff = 1000;
let reconnectT = null;
let connected = false;
const subs = new Map();        // localId -> { topic, params, cb, serverId }
const pendingByReqId = new Map(); // jsonrpc id -> localId (awaiting subscribe ack)
let localSeq = 1, reqSeq = 1000;

function open() {
  if (sock && (sock.readyState === 0 || sock.readyState === 1)) return;
  try { sock = new WebSocket(CONFIG.wsUrl); } catch { schedule(); return; }
  sock.onopen = () => {
    connected = true; backoff = 1000;
    document.dispatchEvent(new CustomEvent('ws:status', { detail: { connected: true } }));
    for (const [localId, s] of subs) sendSubscribe(localId, s);
  };
  sock.onmessage = (ev) => {
    let msg; try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg.id && pendingByReqId.has(msg.id)) {
      const localId = pendingByReqId.get(msg.id); pendingByReqId.delete(msg.id);
      if (msg.result) { const s = subs.get(localId); if (s) s.serverId = msg.result; }
      return;
    }
    const r = msg.params && msg.params.result;
    const subId = msg.params && msg.params.subscription;
    if (r === undefined) return;
    for (const s of subs.values()) {
      if (s.serverId && subId && s.serverId === subId) { try { s.cb(r); } catch {} return; }
    }
    // some nodes don't echo a sub id we matched; deliver to topic listeners heuristically
    for (const s of subs.values()) { try { s.cb(r); } catch {} }
  };
  sock.onclose = () => { connected = false; document.dispatchEvent(new CustomEvent('ws:status', { detail: { connected: false } })); schedule(); };
  sock.onerror = () => { try { sock.close(); } catch {} };
}
function schedule() {
  if (reconnectT) return;
  reconnectT = setTimeout(() => { reconnectT = null; backoff = Math.min(backoff * 1.7, 15000); open(); }, backoff);
}
function sendSubscribe(localId, s) {
  if (!sock || sock.readyState !== 1) return;
  const id = reqSeq++;
  pendingByReqId.set(id, localId);
  const method = s.topic.startsWith('newHeads') || s.topic === 'logs' || s.topic === 'newPendingTransactions'
    ? 'eth_subscribe' : 'mersennet_subscribe';
  sock.send(JSON.stringify({ jsonrpc: '2.0', id, method, params: [s.topic, ...(s.params || [])] }));
}

export const ws = {
  get connected() { return connected; },
  // subscribe(topic, params[], cb) -> unsubscribe fn
  subscribe(topic, params, cb) {
    if (typeof params === 'function') { cb = params; params = []; }
    const localId = localSeq++;
    const s = { topic, params: params || [], cb, serverId: null };
    subs.set(localId, s);
    open();
    if (connected) sendSubscribe(localId, s);
    return () => { subs.delete(localId); };
  },
};
