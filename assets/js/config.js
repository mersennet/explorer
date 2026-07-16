// Chain + app configuration. RPC is reverse-proxied at <origin>/rpc; the indexer
// REST API at <origin>/api is OPTIONAL (progressive enhancement) — api.js probes
// it and pages fall back to pure-RPC when it isn't proxied.

function resolveRpc() {
  try {
    const u = new URL(location.href);
    const custom = u.searchParams.get('rpc');
    if (custom) return { url: custom, custom: true };
  } catch (_) {}
  return { url: location.origin + '/rpc', custom: false };
}
const _rpc = resolveRpc();

export const CONFIG = {
  chainId: 131071,
  chainIdHex: '0x1ffff',
  chainName: 'Mersennet Testnet',
  symbol: 'MRSN',
  decimals: 18,
  blockTimeSecs: 2,
  rpcUrl: _rpc.url,
  rpcCustom: _rpc.custom,
  // canonical node WS is always wss (cross-origin WS needs no CORS)
  wsUrl: 'wss://rpc.mersennet.com',
  canonicalRpc: 'https://rpc.mersennet.com',
  apiBase: location.origin + '/api',
  explorerName: 'Mersennet Explorer',
  tagline: 'The private, verifiable network',
  // tokenomics (Mersenne-prime themed)
  supplyCapWei: (2n ** 89n - 1n),         // 2^89 - 1
  initialRewardWei: (2n ** 61n - 1n),     // 2^61 - 1  (~2.3 MRSN)
  halvingInterval: 33550336,              // 5th perfect number 2^12*(2^13-1)
  emissionTotalMrsn: 154723615,           // R0 * H * 2
  mainnetChainId: 8191,                   // 2^13 - 1
  pollMs: 4000,
  itemsPerPage: 25,
  homeItems: 10,
  links: {
    rpc: 'https://rpc.mersennet.com',
    docs: 'https://docs.mersennet.com',
    trade: 'https://trade.mersennet.com',
    faucet: 'https://faucet.mersennet.com',
    github: 'https://github.com/mersennet',
  },
};

// Native precompiles + known contracts. Privacy precompile is teal-flagged.
// Mock ERC-20s are the faucet's test tokens — registering them here lets the
// explorer render their Transfer/Approval amounts with the right symbol+decimals.
export const KNOWN_CONTRACTS = {
  '0x0000000000000000000000000000000000000100': { name: 'MersennetOrders', kind: 'precompile', tag: 'CLOB', note: 'Native order-book precompile (collateral escrow)' },
  '0x0000000000000000000000000000000000000200': { name: 'ShieldBridge', kind: 'precompile', tag: 'privacy', note: 'Shield / unshield bridge precompile' },
  '0x8f4e0bee0fe201f10419947a7c043003f16bfd73': { name: 'USDC', kind: 'token', tag: 'ERC-20', symbol: 'USDC', decimals: 6, note: 'Mock USD Coin · faucet test token' },
  '0x6fbe796caa747d84e3ac7611ffc2dc6d11124ed4': { name: 'USDT', kind: 'token', tag: 'ERC-20', symbol: 'USDT', decimals: 6, note: 'Mock Tether USD · faucet test token' },
  '0x04833e1be9c451a89fc6cd1e5e698e2d4936d7f9': { name: 'DAI', kind: 'token', tag: 'ERC-20', symbol: 'DAI', decimals: 18, note: 'Mock Dai · faucet test token' },
  '0xbb012e05c1b42c1f0efa4509317fdb31a31ad640': { name: 'WMRSN', kind: 'token', tag: 'ERC-20', symbol: 'WMRSN', decimals: 18, note: 'Wrapped MRSN' },
  '0xcbf3bbcc74d851cc896aa128f61557df65e420fc': { name: 'Multicall3', kind: 'contract', tag: 'infra', note: 'Batched RPC reads' },
};

// 4-byte selector → display. Used to label tx "method".
export const KNOWN_METHODS = {
  '0xa9059cbb': 'transfer', '0x095ea7b3': 'approve', '0x23b872dd': 'transferFrom',
  '0x40c10f19': 'mint', '0xd0e30db0': 'deposit', '0x2e1a7d4d': 'withdraw',
  '0x70a08231': 'balanceOf', '0x18160ddd': 'totalSupply',
  '0xbad4a01f': 'depositCollateral', '0x' : 'transfer',
};

// CLOB markets (ids match the trade api / on-chain add order). base/quote labels only.
export const MARKETS = [
  { id: 1, symbol: 'MRSN/USDC', base: 'MRSN' },
  { id: 2, symbol: 'BTC/USDC', base: 'BTC' },
  { id: 3, symbol: 'ETH/USDC', base: 'ETH' },
  { id: 4, symbol: 'SOL/USDC', base: 'SOL' },
  { id: 5, symbol: 'ARB/USDC', base: 'ARB' },
];
