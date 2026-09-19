// Chain + app configuration. RPC calls go straight to the public endpoint
// (CORS is open there) so the node's per-IP limiter sees each visitor; the
// old <origin>/rpc proxy made every explorer user share the app host's
// exempt address. `?rpc=` still overrides for local nodes. The indexer REST
// API at <origin>/api is OPTIONAL (progressive enhancement) — api.js probes
// it and pages fall back to pure-RPC when it isn't proxied.

const CANONICAL_RPC = 'https://rpc.mersennet.com';

function resolveRpc() {
  try {
    const u = new URL(location.href);
    const custom = u.searchParams.get('rpc');
    if (custom) return { url: custom, custom: true };
  } catch (_) {}
  return { url: CANONICAL_RPC, custom: false };
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
  canonicalRpc: CANONICAL_RPC,
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
  '0x0000000000000000000000000000000000000400': { name: 'MersennetStaking', kind: 'precompile', tag: 'staking', note: 'Delegated staking precompile (principal + reward escrow)' },
  '0x0000000000000000000000000000000000000200': { name: 'ShieldBridge', kind: 'precompile', tag: 'privacy', note: 'Shield / unshield bridge precompile' },
  '0xa44b23d1d0c0133da71dece399d5d5ade6dd22d1': { name: 'USDC', kind: 'token', tag: 'ERC-20', symbol: 'USDC', decimals: 6, note: 'Mock USD Coin · faucet test token' },
  '0x3923578a19d0e9b35cef08b7eba0cb6d4b9c28f6': { name: 'USDT', kind: 'token', tag: 'ERC-20', symbol: 'USDT', decimals: 6, note: 'Mock Tether USD · faucet test token' },
  '0x27942c2cee3e0e02377d01bfe6e74cefc9a9fd45': { name: 'DAI', kind: 'token', tag: 'ERC-20', symbol: 'DAI', decimals: 18, note: 'Mock Dai · faucet test token' },
  '0x5bbf04528469591280d36d46209c7ccd5a68a798': { name: 'WMRSN', kind: 'token', tag: 'ERC-20', symbol: 'WMRSN', decimals: 18, note: 'Wrapped MRSN' },
  '0xdc27e8f5f77721f5930b8c90fade391e28331da6': { name: 'Multicall3', kind: 'contract', tag: 'infra', note: 'Batched RPC reads' },
  '0xe77f94c4bf7d6d2e2371afde440a0b9b8a567725': { name: 'MakerVault', kind: 'contract', tag: 'vault', note: 'Pooled market-making vault (mvMRSN shares at NAV); quotes through an agent key on the CLOB' },
};

// 4-byte selector → display. Used to label tx "method".
export const KNOWN_METHODS = {
  '0xa9059cbb': 'transfer', '0x095ea7b3': 'approve', '0x23b872dd': 'transferFrom',
  '0x40c10f19': 'mint', '0xd0e30db0': 'deposit', '0x2e1a7d4d': 'withdraw',
  '0x70a08231': 'balanceOf', '0x18160ddd': 'totalSupply',
  '0xde5f72fd': 'faucet', '0x': 'transfer',
  // MersennetOrders precompile (CLOB)
  '0x4c570d73': 'placeOrder', '0x2c700c15': 'placeOrderExt', '0x514fcac7': 'cancelOrder',
  '0x83e0341c': 'createMarket',
  '0xbad4a01f': 'depositCollateral', '0x6112fe2e': 'withdrawCollateral',
  '0x31e087b1': 'depositTokenCollateral', '0xc4708bdd': 'withdrawTokenCollateral',
  '0xb845309c': 'setAgent', '0x7da6ac0d': 'revokeAgent', '0xac3c0e30': 'agentOf',
  // MakerVault (deposit()/withdraw(uint256) share the ERC-20/WETH selectors above)
  '0xa879e11e': 'pushCollateral',
  // MersennetStaking precompile
  '0x026e402b': 'delegate', '0x4d99dd16': 'undelegate',
  '0xef5cfb8c': 'claimRewards', '0x6e373bef': 'withdrawUnbonded',
};

// CLOB markets — static fallback only. The live list comes from the
// mersennet_orders_getMarkets RPC (markets are permissionless); see
// rpc.js getMarkets(). Kept so the CLOB page still renders against older nodes.
export const MARKETS = [
  { id: 1, symbol: 'MRSN/USD', base: 'MRSN' },
  { id: 2, symbol: 'BTC/USD', base: 'BTC' },
  { id: 3, symbol: 'ETH/USD', base: 'ETH' },
  { id: 4, symbol: 'SOL/USD', base: 'SOL' },
  { id: 5, symbol: 'ARB/USD', base: 'ARB' },
];
