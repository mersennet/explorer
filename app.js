(function () {
    'use strict';

    /* ===========================================
       CONFIGURATION
       =========================================== */
    const RPC_URL = (function () {
        const params = new URLSearchParams(location.search || '');
        const customRpc = params.get('rpc');
        if (customRpc) {
            try {
                const url = new URL(customRpc);
                if (url.origin === location.origin) return customRpc;
                console.warn('Custom RPC URL detected:', customRpc);
                return customRpc;
            } catch { /* invalid URL */ }
        }
        return location.origin + '/rpc';
    })();
    const CUSTOM_RPC = RPC_URL !== location.origin + '/rpc';

    const CHAIN_ID        = 7919;
    const BLOCK_TIME_SECS = 1;
    const POLL_MS         = 3000;
    const ITEMS_PER_PAGE  = 25;
    const HOME_ITEMS      = 8;
    const MAX_SUPPLY      = '1,000,000,000';

    /* ===========================================
       KNOWN CONTRACTS
       =========================================== */
    const KNOWN_CONTRACTS = {
        '0x973ee1bf0907287d1eb8a144d88b34f515c83f29': { name: 'Multicall3',       type: 'utility',                                      compiler: 'solc 0.8.20', source: 'contracts/src/foundation/Multicall3.sol',    license: 'MIT' },
        '0x079bf1207b51acda83e2e8178344f62a883f8479': { name: 'WPRIM',            type: 'token',  symbol: 'WPRIM', decimals: 18,         compiler: 'solc 0.8.20', source: 'contracts/src/foundation/WPRIM.sol',        license: 'MIT' },
        '0xb22f77d89122e9e3784bfd3eee9616273f38238d': { name: 'MockUSDC',         type: 'token',  symbol: 'USDC',  decimals: 6,          compiler: 'solc 0.8.20', source: 'contracts/src/foundation/MockERC20.sol',    license: 'MIT' },
        '0x877feca38919acd7aaf7cb81f100e0454aa95c17': { name: 'MockUSDT',         type: 'token',  symbol: 'USDT',  decimals: 6,          compiler: 'solc 0.8.20', source: 'contracts/src/foundation/MockERC20.sol',    license: 'MIT' },
        '0xb88d63a65691effbf4b6808325b1588912c15cf4': { name: 'MockDAI',          type: 'token',  symbol: 'DAI',   decimals: 18,         compiler: 'solc 0.8.20', source: 'contracts/src/foundation/MockERC20.sol',    license: 'MIT' },
        '0x63f7a64db6d2b965189b8b48b7435668021f6b17': { name: 'PrimeSwapFactory', type: 'dex',                                           compiler: 'solc 0.8.20', source: 'contracts/src/dex/PrimeSwapFactory.sol',    license: 'GPL-3.0' },
        '0x9f337f433e71ce969b991511f1dcd3d0622116bb': { name: 'PrimeSwapRouter',  type: 'dex',                                           compiler: 'solc 0.8.20', source: 'contracts/src/dex/PrimeSwapRouter.sol',     license: 'GPL-3.0' },
        '0xad98d3b1c27a33487dd1f450dc60b2d88626250c': { name: 'UniswapV3Factory',     type: 'dex',                                      compiler: 'solc 0.7.6', source: 'Uniswap V3 Core',               license: 'BUSL-1.1' },
        '0x77066b50f9a6fae7867abee3742d4b7c438946ae': { name: 'SwapRouter',           type: 'dex',                                      compiler: 'solc 0.7.6', source: 'Uniswap V3 Periphery',           license: 'GPL-2.0' },
        '0x6c12f22a793e0560ba0387d808fef69299f6ccb6': { name: 'NonfungiblePositionManager', type: 'dex',                                 compiler: 'solc 0.7.6', source: 'Uniswap V3 Periphery',           license: 'GPL-2.0' },
        '0x6e61a0e95230ee7011dac75bd23eb7cd9dc67ac7': { name: 'Quoter',               type: 'dex',                                      compiler: 'solc 0.7.6', source: 'Uniswap V3 Periphery',           license: 'GPL-2.0' },
    };

    /* ===========================================
       KNOWN FUNCTION SELECTORS
       =========================================== */
    const KNOWN_METHODS = {
        '0xa9059cbb': { name: 'transfer',                    badge: 'badge-success' },
        '0x095ea7b3': { name: 'approve',                     badge: 'badge-secondary' },
        '0x23b872dd': { name: 'transferFrom',                badge: 'badge-success' },
        '0x40c10f19': { name: 'mint',                        badge: 'badge-secondary' },
        '0xd0e30db0': { name: 'deposit',                     badge: 'badge-secondary' },
        '0x2e1a7d4d': { name: 'withdraw',                    badge: 'badge-danger' },
        '0x38ed1739': { name: 'swapExactTokensForTokens',    badge: 'badge-info' },
        '0x8803dbee': { name: 'swapTokensForExactTokens',    badge: 'badge-info' },
        '0xe8e33700': { name: 'addLiquidity',                badge: 'badge-secondary' },
        '0xbaa2abde': { name: 'removeLiquidity',             badge: 'badge-danger' },
        '0x022c0d9f': { name: 'swap',                        badge: 'badge-info' },
        '0x6a627842': { name: 'mint (pair)',                  badge: 'badge-secondary' },
        '0x89afcb44': { name: 'burn (pair)',                  badge: 'badge-danger' },
        '0xc9c65396': { name: 'createPair',                  badge: 'badge-secondary' },
        '0x414bf389': { name: 'exactInputSingle',        badge: 'badge-info' },
        '0xc04b8d59': { name: 'exactInput',              badge: 'badge-info' },
        '0xdb3e2198': { name: 'exactOutputSingle',        badge: 'badge-info' },
        '0xf28c0498': { name: 'exactOutput',              badge: 'badge-info' },
        '0x88316456': { name: 'mint (position)',           badge: 'badge-secondary' },
        '0x0c49ccbe': { name: 'decreaseLiquidity',        badge: 'badge-danger' },
        '0xfc6f7865': { name: 'collect',                  badge: 'badge-secondary' },
        '0xac9650d8': { name: 'multicall',                badge: 'badge-info' },
        '0x13ead562': { name: 'createPool',               badge: 'badge-secondary' },
        '0x5ae401dc': { name: 'multicall (v2)',            badge: 'badge-info' },
        '0x42966c68': { name: 'burn',                      badge: 'badge-danger' },
    };

    /* ===========================================
       TOKEN EVENT TOPICS
       =========================================== */
    const TOPIC_TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

    /* ===========================================
       SVG ICONS
       =========================================== */
    const ICONS = {
        block:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>',
        tx:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 17l9.2-9.2M17 17V7H7"/></svg>',
        back:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>',
        copy:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>',
        check:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>',
        chevL:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>',
        chevR:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>',
        user:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
        shield:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
        cube:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"/></svg>',
        gas:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>',
        arrow:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:14px;height:14px;vertical-align:middle"><path d="M5 12h14M12 5l7 7-7 7"/></svg>',
        search:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>',
        globe:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>',
        zap:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
        layers:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>',
        code:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 18l6-6-6-6M8 6l-6 6 6 6"/></svg>',
        coin:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v12M8 10h8M8 14h8"/></svg>',
        sun:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>',
        moon:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>',
    };

    function initTheme() {
        var saved = localStorage.getItem('primescan-theme') || 'light';
        document.documentElement.setAttribute('data-theme', saved);
        var btn = document.getElementById('themeToggle');
        if (btn) btn.innerHTML = saved === 'dark' ? ICONS.sun : ICONS.moon;
    }
    function toggleTheme() {
        var current = document.documentElement.getAttribute('data-theme') || 'light';
        var next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('primescan-theme', next);
        var btn = document.getElementById('themeToggle');
        if (btn) btn.innerHTML = next === 'dark' ? ICONS.sun : ICONS.moon;
    }
    initTheme();

    /* ===========================================
       UTILITIES
       =========================================== */
    function $(sel, ctx) { return (ctx || document).querySelector(sel); }
    function $$(sel, ctx) { return Array.from((ctx || document).querySelectorAll(sel)); }

    function hexToInt(hex) {
        if (!hex || typeof hex !== 'string') return 0;
        return parseInt(hex, 16) || 0;
    }

    function hexToBigInt(hex) {
        if (!hex || typeof hex !== 'string') return 0n;
        const s = hex.startsWith('0x') ? hex.slice(2) : hex;
        if (!s || s === '0') return 0n;
        try { return BigInt('0x' + s); } catch { return 0n; }
    }

    function formatNum(n) {
        if (n === undefined || n === null) return '—';
        const num = typeof n === 'number' ? n
            : (typeof n === 'string' ? (n.startsWith('0x') ? parseInt(n, 16) : parseFloat(n)) : Number(n));
        if (isNaN(num)) return String(n);
        return num.toLocaleString('en-US');
    }

    function formatPRIM(hex) {
        const wei = hexToBigInt(hex);
        if (wei === 0n) return '0 PRIM';
        const whole = wei / 1000000000000000000n;
        const frac = wei % 1000000000000000000n;
        if (frac === 0n) return whole.toLocaleString('en-US') + ' PRIM';
        const fracStr = frac.toString().padStart(18, '0').replace(/0+$/, '');
        return whole.toLocaleString('en-US') + '.' + fracStr.slice(0, 6) + ' PRIM';
    }

    function formatPRIMShort(hex) {
        const wei = hexToBigInt(hex);
        if (wei === 0n) return '0';
        const whole = wei / 1000000000000000000n;
        const frac = wei % 1000000000000000000n;
        if (whole >= 1000000n) return (Number(whole) / 1e6).toFixed(2) + 'M';
        if (whole >= 1000n) return (Number(whole) / 1e3).toFixed(2) + 'K';
        if (frac === 0n) return whole.toLocaleString('en-US');
        const fracStr = frac.toString().padStart(18, '0').slice(0, 4);
        return whole.toLocaleString('en-US') + '.' + fracStr;
    }

    function formatGwei(hex) {
        const wei = hexToBigInt(hex);
        const gwei = Number(wei) / 1e9;
        if (gwei < 0.01 && gwei > 0) return '< 0.01 Gwei';
        return gwei.toFixed(2) + ' Gwei';
    }

    function formatGas(hex) {
        const n = hexToInt(hex);
        if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
        if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
        if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
        return n.toLocaleString('en-US');
    }

    function formatTokenAmount(hexValue, decimals) {
        const raw = hexToBigInt(hexValue);
        if (raw === 0n) return '0';
        const divisor = 10n ** BigInt(decimals);
        const whole = raw / divisor;
        const frac = raw % divisor;
        if (frac === 0n) return whole.toLocaleString('en-US');
        const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '').slice(0, 6);
        return whole.toLocaleString('en-US') + '.' + fracStr;
    }

    function truncHash(hash, s, e) {
        s = s || 10; e = e || 6;
        if (!hash || typeof hash !== 'string') return '—';
        if (hash.length <= s + e + 2) return hash;
        return hash.slice(0, s) + '…' + hash.slice(-e);
    }

    function truncAddr(addr) {
        return truncHash(addr, 8, 4);
    }

    function timeAgo(blockNum, latestBlock) {
        const diff = latestBlock - blockNum;
        if (diff < 0) return 'future';
        const secs = Math.round(diff * BLOCK_TIME_SECS);
        if (secs < 5) return 'just now';
        if (secs < 60) return secs + 's ago';
        if (secs < 3600) return Math.floor(secs / 60) + ' min ago';
        if (secs < 86400) return Math.floor(secs / 3600) + ' hr ago';
        return Math.floor(secs / 86400) + 'd ago';
    }

    function formatTimestamp(hexTimestamp) {
        if (!hexTimestamp || hexTimestamp === '0x0') return null;
        var ts = parseInt(hexTimestamp, 16);
        if (ts < 1700000000) return null;
        var d = new Date(ts * 1000);
        var now = Math.floor(Date.now() / 1000);
        var diff = now - ts;
        var ago;
        if (diff < 5) ago = 'just now';
        else if (diff < 60) ago = diff + 's ago';
        else if (diff < 3600) ago = Math.floor(diff / 60) + ' min ago';
        else if (diff < 86400) ago = Math.floor(diff / 3600) + ' hr ago';
        else ago = Math.floor(diff / 86400) + 'd ago';
        return ago + ' (' + d.toUTCString() + ')';
    }

    function escapeHtml(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    async function copyText(text) {
        try { await navigator.clipboard.writeText(text); return true; }
        catch { return false; }
    }

    function copyBtnHtml(text) {
        return '<button class="copy-btn" data-copy="' + escapeHtml(text) + '" title="Copy">' + ICONS.copy + '</button>';
    }

    function contractLabel(addr) {
        if (!addr) return null;
        return KNOWN_CONTRACTS[addr.toLowerCase()] || null;
    }

    function addrDisplay(addr, withLink) {
        if (!addr) return '—';
        const info = contractLabel(addr);
        const name = info ? '<span style="color:var(--text);font-weight:500;margin-left:4px">(' + escapeHtml(info.name) + ')</span>' : '';
        if (withLink === false) return '<span class="addr-link">' + truncAddr(addr) + '</span>' + name;
        return '<a href="#/address/' + escapeHtml(addr) + '" class="addr-link">' + truncAddr(addr) + '</a>' + name;
    }

    /* ===========================================
       RPC CLIENT
       =========================================== */
    let rpcId = 1;
    async function rpc(method, params) {
        const body = { jsonrpc: '2.0', id: rpcId++, method: method, params: params || [] };
        const res = await fetch(RPC_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message || 'RPC error');
        return data.result;
    }

    /* ===========================================
       GLOBAL STATE
       =========================================== */
    const state = {
        chainId: 0,
        latestBlock: 0,
        gasPrice: '0x0',
        validators: [],
        pollTimer: null,
    };

    async function refreshGlobal() {
        try {
            const [chainIdHex, blockHex, gasHex] = await Promise.all([
                rpc('eth_chainId'),
                rpc('prime_blockNumber'),
                rpc('eth_gasPrice'),
            ]);
            state.chainId = hexToInt(chainIdHex);
            state.latestBlock = hexToInt(blockHex);
            state.gasPrice = gasHex;

            const el_gas = $('#statGas');
            if (el_gas) el_gas.textContent = formatGwei(gasHex);
            const el_price = $('#statPrice');
            if (el_price) el_price.textContent = 'Testnet';
            const el_block = $('#statBlock');
            if (el_block) el_block.textContent = formatNum(state.latestBlock);
            const el_fChain = $('#footerChainId');
            if (el_fChain) el_fChain.textContent = state.chainId;
            const el_fBlock = $('#footerBlock');
            if (el_fBlock) el_fBlock.textContent = formatNum(state.latestBlock);
        } catch (e) {
            console.error('refreshGlobal:', e);
        }
    }

    /* ===========================================
       ROUTER
       =========================================== */
    const routes = {};
    let currentCleanup = null;

    function route(pattern, handler) {
        routes[pattern] = handler;
    }

    function navigate(hash) {
        if (location.hash !== hash) location.hash = hash;
    }

    function matchRoute(hash) {
        const path = hash.replace(/^#/, '') || '/';
        const cleanPath = path.split('?')[0];
        for (const [pattern, handler] of Object.entries(routes)) {
            const regex = new RegExp('^' + pattern.replace(/:([^/]+)/g, '([^/]+)') + '$');
            const m = cleanPath.match(regex);
            if (m) return { handler: handler, params: m.slice(1) };
        }
        return null;
    }

    async function dispatch() {
        if (currentCleanup) { currentCleanup(); currentCleanup = null; }

        const match = matchRoute(location.hash);
        const content = $('#pageContent');
        if (!match) {
            content.innerHTML = '<div class="main-content"><div class="container"><div class="table-empty">Page not found</div></div></div>';
            return;
        }

        content.innerHTML = '<div class="main-content"><div class="container" style="padding-top:40px;padding-bottom:40px">' +
            '<div style="display:flex;align-items:center;justify-content:center;gap:12px;padding:60px 0;color:#8c98a4"><div class="spinner"></div><span>Loading...</span></div>' +
            '</div></div>';

        $$('.nav-link').forEach(function (l) { l.classList.remove('active'); });
        const page = match.handler._page;
        if (page) {
            const active = $('.nav-link[data-page="' + page + '"]');
            if (active) active.classList.add('active');
        }

        try {
            const cleanup = await match.handler(content, ...match.params);
            content.classList.remove('page-enter');
            void content.offsetWidth;
            content.classList.add('page-enter');
            if (typeof cleanup === 'function') currentCleanup = cleanup;
        } catch (e) {
            console.error('Route error:', e);
            content.innerHTML = '<div class="main-content"><div class="container"><div class="table-empty">Error loading page: ' + escapeHtml(e.message) + '</div></div></div>';
        }
    }

    /* ===========================================
       SEARCH
       =========================================== */
    function handleSearch(query) {
        const q = (query || '').trim();
        if (!q) return;
        if (/^\d+$/.test(q)) {
            navigate('#/block/' + q);
        } else if (/^0x[0-9a-fA-F]{64}$/i.test(q)) {
            navigate('#/tx/' + q);
        } else if (/^0x[0-9a-fA-F]{40}$/i.test(q)) {
            navigate('#/address/' + q.toLowerCase());
        } else {
            var qLower = q.toLowerCase();
            var found = null;
            var addrs = Object.keys(KNOWN_CONTRACTS);
            for (var i = 0; i < addrs.length; i++) {
                var c = KNOWN_CONTRACTS[addrs[i]];
                if (c.name.toLowerCase() === qLower || (c.symbol && c.symbol.toLowerCase() === qLower)) {
                    found = addrs[i];
                    break;
                }
            }
            if (!found) {
                for (var j = 0; j < addrs.length; j++) {
                    var c2 = KNOWN_CONTRACTS[addrs[j]];
                    if (c2.name.toLowerCase().indexOf(qLower) !== -1 || (c2.symbol && c2.symbol.toLowerCase().indexOf(qLower) !== -1)) {
                        found = addrs[j];
                        break;
                    }
                }
            }
            if (found) {
                var meta = KNOWN_CONTRACTS[found];
                if (meta.type === 'token') {
                    navigate('#/token/' + found);
                } else {
                    navigate('#/address/' + found);
                }
            } else {
                toast('Search by block number, tx hash (0x + 64 hex), address (0x + 40 hex), or contract/token name', true);
            }
        }
    }

    /* ===========================================
       TOAST
       =========================================== */
    let toastTimer;
    function toast(msg, isError) {
        const el = $('#toast');
        if (!el) return;
        el.textContent = msg;
        el.classList.remove('error', 'success');
        if (isError) el.classList.add('error');
        else el.classList.add('success');
        el.classList.add('visible');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { el.classList.remove('visible', 'error', 'success'); }, 2500);
    }

    function exportTableCSV(tableElement, filename) {
        if (!tableElement) return;
        var rows = [];
        var headers = [];
        tableElement.querySelectorAll('thead th').forEach(function(th) {
            headers.push('"' + (th.textContent || '').trim().replace(/"/g, '""') + '"');
        });
        rows.push(headers.join(','));
        tableElement.querySelectorAll('tbody tr').forEach(function(tr) {
            var cols = [];
            tr.querySelectorAll('td').forEach(function(td) {
                var text = (td.textContent || '').trim().replace(/"/g, '""');
                cols.push('"' + text + '"');
            });
            rows.push(cols.join(','));
        });
        var csv = rows.join('\n');
        var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        var link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename || 'export.csv';
        link.click();
        URL.revokeObjectURL(link.href);
    }
    window.exportTableCSV = exportTableCSV;

    function csvExportBtnHtml(tableId, filename) {
        return '<button class="btn btn-outline" style="font-size:0.78rem;padding:4px 12px" onclick="document.querySelectorAll(\'#' + tableId + '\').forEach(function(t){exportTableCSV(t,\'' + filename + '\')})">📥 Download CSV</button>';
    }

    /* ===========================================
       EVENT DELEGATION
       =========================================== */
    document.addEventListener('click', async function (e) {
        var btn = e.target.closest('.copy-btn');
        if (btn) {
            e.preventDefault();
            e.stopPropagation();
            var text = btn.dataset.copy;
            if (!text) return;
            var ok = await copyText(text);
            if (ok) {
                btn.innerHTML = ICONS.check;
                btn.classList.add('copied');
                toast('Copied to clipboard');
                setTimeout(function () { btn.innerHTML = ICONS.copy; btn.classList.remove('copied'); }, 1500);
            }
            return;
        }

        var nav = e.target.closest('[data-nav]');
        if (nav) {
            e.preventDefault();
            navigate(nav.dataset.nav);
            return;
        }

        var searchBtn = e.target.closest('#heroSearchBtn, #searchBtn');
        if (searchBtn) {
            e.preventDefault();
            var input = $('#heroSearchInput') || $('#searchInput');
            if (input) handleSearch(input.value);
            return;
        }
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
            var input = e.target.closest('#heroSearchInput, #searchInput');
            if (input) { e.preventDefault(); handleSearch(input.value); }
        }
    });

    /* ===========================================
       FETCH ERC-20 TOKEN BALANCE
       =========================================== */
    async function fetchTokenBalance(tokenAddr, userAddr) {
        var selector = '0x70a08231';
        var paddedAddr = userAddr.toLowerCase().replace('0x', '').padStart(64, '0');
        var data = selector + paddedAddr;
        try {
            var result = await rpc('eth_call', [{ to: tokenAddr, data: data, from: '0x1a09b94d7dd32cf1903d1745effffae23ce76bca' }, 'latest']);
            return { balance: (result && result !== '0x') ? result : '0x0', error: false };
        } catch (e) { return { balance: '0x0', error: true }; }
    }

    /* ===========================================
       DECODE INPUT DATA
       =========================================== */
    function decodeInputData(input) {
        if (!input || input.length < 10) return null;
        var selector = input.slice(0, 10).toLowerCase();
        var method = KNOWN_METHODS[selector];
        if (!method) return { method: 'Unknown', selector: selector, params: [] };

        var data = input.slice(10);
        var params = [];

        if (selector === '0xa9059cbb') {
            if (data.length >= 128) {
                params.push({ name: 'to', type: 'address', value: '0x' + data.slice(24, 64) });
                params.push({ name: 'amount', type: 'uint256', value: '0x' + data.slice(64, 128) });
            }
        } else if (selector === '0x095ea7b3') {
            if (data.length >= 128) {
                params.push({ name: 'spender', type: 'address', value: '0x' + data.slice(24, 64) });
                params.push({ name: 'amount', type: 'uint256', value: '0x' + data.slice(64, 128) });
            }
        } else if (selector === '0x23b872dd') {
            if (data.length >= 192) {
                params.push({ name: 'from', type: 'address', value: '0x' + data.slice(24, 64) });
                params.push({ name: 'to', type: 'address', value: '0x' + data.slice(88, 128) });
                params.push({ name: 'amount', type: 'uint256', value: '0x' + data.slice(128, 192) });
            }
        }

        return { method: method.name, selector: selector, params: params };
    }

    /* ===========================================
       DECODE METHOD
       =========================================== */
    function decodeMethod(input) {
        if (!input || input === '0x' || input.length < 10) return null;
        var selector = input.slice(0, 10).toLowerCase();
        var m = KNOWN_METHODS[selector];
        if (m) return { name: m.name, badge_class: m.badge };
        return { name: selector, badge_class: 'badge-info' };
    }

    function methodBadgeHtml(input) {
        var decoded = decodeMethod(input);
        if (!decoded) return '';
        return '<span class="method-tag ' + decoded.badge_class + '">' + escapeHtml(decoded.name) + '</span>';
    }

    /* ===========================================
       PARSE TOKEN TRANSFERS
       =========================================== */
    function parseTokenTransfers(receipt) {
        if (!receipt || !receipt.logs || !Array.isArray(receipt.logs)) return [];
        var transfers = [];
        for (var i = 0; i < receipt.logs.length; i++) {
            var log = receipt.logs[i];
            if (!log.topics || log.topics.length < 3) continue;
            if (log.topics[0].toLowerCase() !== TOPIC_TRANSFER.toLowerCase()) continue;

            var from = '0x' + log.topics[1].slice(26);
            var to = '0x' + log.topics[2].slice(26);
            var amount = log.data || '0x0';
            var tokenAddr = (log.address || '').toLowerCase();
            var info = KNOWN_CONTRACTS[tokenAddr];
            var symbol = info && info.symbol ? info.symbol : 'TOKEN';
            var decimals = info && info.decimals !== undefined ? info.decimals : 18;

            transfers.push({
                from: from,
                to: to,
                amount: amount,
                symbol: symbol,
                decimals: decimals,
                tokenAddr: tokenAddr,
            });
        }
        return transfers;
    }

    /* ===========================================
       TX FIELD HELPERS (handle both cases)
       =========================================== */
    function txField(tx, camel, snake) {
        if (tx[camel] !== undefined) return tx[camel];
        if (tx[snake] !== undefined) return tx[snake];
        return undefined;
    }

    function txBlockNum(tx) {
        return txField(tx, 'blockNumber', 'block_number');
    }

    function txGasPrice(tx) {
        return txField(tx, 'gasPrice', 'gas_price');
    }

    function txGas(tx) {
        return txField(tx, 'gas', 'gas_limit') || txField(tx, 'gasLimit', 'gas_limit');
    }

    function txTxIndex(tx) {
        return txField(tx, 'transactionIndex', 'transaction_index');
    }

    /* ===========================================
       PAGINATION HELPER
       =========================================== */
    function paginationHtml(current, total, baseHash) {
        if (total <= 1) return '';
        var btns = [];
        btns.push('<button class="page-btn"' + (current <= 1 ? ' disabled' : '') + ' data-nav="' + baseHash + '?p=1">First</button>');
        btns.push('<button class="page-btn"' + (current <= 1 ? ' disabled' : '') + ' data-nav="' + baseHash + '?p=' + (current - 1) + '">' + ICONS.chevL + '</button>');
        btns.push('<span class="page-info">Page ' + current + ' of ' + formatNum(total) + '</span>');
        btns.push('<button class="page-btn"' + (current >= total ? ' disabled' : '') + ' data-nav="' + baseHash + '?p=' + (current + 1) + '">' + ICONS.chevR + '</button>');
        btns.push('<button class="page-btn"' + (current >= total ? ' disabled' : '') + ' data-nav="' + baseHash + '?p=' + total + '">Last</button>');
        return '<div class="pagination">' + btns.join('') + '</div>';
    }

    function getQueryParam(name) {
        var hashParts = location.hash.split('?');
        if (hashParts.length < 2) return null;
        var params = new URLSearchParams(hashParts[1]);
        return params.get(name);
    }

    /* ===========================================
       SEARCH BAR HTML
       =========================================== */
    function searchBarHtml(id) {
        var prefix = id || 'hero';
        return [
            '<div class="search-form">',
            '  <input type="text" id="' + prefix + 'SearchInput" class="search-input" placeholder="Search by Address / Tx Hash / Block / Token Name" autocomplete="off" spellcheck="false">',
            '  <button id="' + prefix + 'SearchBtn" class="search-btn">',
            '    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>',
            '  </button>',
            '</div>',
        ].join('');
    }

    /* ===========================================
       FETCH BLOCKS BATCH
       =========================================== */
    async function fetchBlocks(startNum, count, fullTxs) {
        var promises = [];
        for (var i = 0; i < count && startNum - i >= 0; i++) {
            var num = startNum - i;
            promises.push(rpc('prime_getBlockByNumber', ['0x' + num.toString(16), !!fullTxs]).catch(function () { return null; }));
        }
        return (await Promise.all(promises)).filter(Boolean);
    }

    async function fetchValidators() {
        try {
            var v = await rpc('prime_validators');
            if (Array.isArray(v)) { state.validators = v; return v; }
        } catch (e) { /* ignore */ }
        return state.validators || [];
    }

    function validatorName(addr) {
        if (!state.validators || !addr) return null;
        var found = state.validators.find(function (v) { return v.address && v.address.toLowerCase() === addr.toLowerCase(); });
        return found ? (found.name || truncAddr(found.address)) : null;
    }

    /* ===========================================
       PAGE: HOME (DASHBOARD)
       =========================================== */
    async function pageHome(el) {
        await refreshGlobal();

        var validators = await fetchValidators();
        var blocks = await fetchBlocks(state.latestBlock, HOME_ITEMS, true);

        var totalTxCount = 0;
        var allTxs = [];
        for (var bi = 0; bi < blocks.length; bi++) {
            var b = blocks[bi];
            if (!b.transactions) continue;
            totalTxCount += b.transactions.length;
            for (var ti = 0; ti < b.transactions.length; ti++) {
                var tx = b.transactions[ti];
                if (typeof tx === 'object' && tx.hash) {
                    allTxs.push(Object.assign({}, tx, { _blockNum: hexToInt(b.number) }));
                }
            }
        }

        var seen = {};
        var uniqueTxs = [];
        for (var i = 0; i < allTxs.length; i++) {
            if (!seen[allTxs[i].hash]) { seen[allTxs[i].hash] = true; uniqueTxs.push(allTxs[i]); }
        }
        var txs = uniqueTxs.slice(0, HOME_ITEMS);

        var totalStake = 0n;
        for (var vi = 0; vi < validators.length; vi++) totalStake += hexToBigInt(validators[vi].stake);

        var tps = blocks.length > 1
            ? (totalTxCount / (blocks.length * BLOCK_TIME_SECS)).toFixed(2)
            : '0.00';

        el.innerHTML = [
            '<div class="hero-section">',
            '  <div class="hero-content">',
            '    <h1 class="hero-title">The Prime Chain Blockchain Explorer</h1>',
            '    ' + searchBarHtml('hero'),
            '  </div>',
            '</div>',
            '<div class="stats-section">',
            '  <div class="container">',
            '    <div class="stats-grid">',
            '      <div class="stat-item">',
            '        <div class="stat-label">PRIM PRICE</div>',
            '        <div class="stat-value">$0.00 <span class="text-muted" style="font-size:0.75rem">@ 0.000 BTC</span></div>',
            '      </div>',
            '      <div class="stat-sep"></div>',
            '      <div class="stat-item">',
            '        <div class="stat-label">MARKET CAP</div>',
            '        <div class="stat-value">$0.00</div>',
            '      </div>',
            '      <div class="stat-sep"></div>',
            '      <div class="stat-item">',
            '        <div class="stat-label">TRANSACTIONS</div>',
            '        <div class="stat-value">' + formatNum(totalTxCount) + ' <span class="text-muted" style="font-size:0.75rem">(' + tps + ' TPS)</span></div>',
            '      </div>',
            '      <div class="stat-sep"></div>',
            '      <div class="stat-item">',
            '        <div class="stat-label">LAST FINALIZED BLOCK</div>',
            '        <div class="stat-value" id="homeBlockHeight">' + formatNum(state.latestBlock) + '</div>',
            '      </div>',
            '      <div class="stat-sep"></div>',
            '      <div class="stat-item">',
            '        <div class="stat-label">MED GAS PRICE</div>',
            '        <div class="stat-value">' + formatGwei(state.gasPrice) + '</div>',
            '      </div>',
            '      <div class="stat-sep"></div>',
            '      <div class="stat-item">',
            '        <div class="stat-label">LAST SAFE BLOCK</div>',
            '        <div class="stat-value">' + formatNum(Math.max(0, state.latestBlock - 6)) + '</div>',
            '      </div>',
            '    </div>',
            '    <div class="stats-grid" style="margin-top:8px;border-top:1px solid #e9ecef;padding-top:8px">',
            '      <div class="stat-item">',
            '        <div class="stat-label">VALIDATORS</div>',
            '        <div class="stat-value">' + validators.length + '</div>',
            '      </div>',
            '      <div class="stat-sep"></div>',
            '      <div class="stat-item">',
            '        <div class="stat-label">MAX SUPPLY</div>',
            '        <div class="stat-value">' + MAX_SUPPLY + '</div>',
            '      </div>',
            '      <div class="stat-sep"></div>',
            '      <div class="stat-item">',
            '        <div class="stat-label">TOTAL STAKED</div>',
            '        <div class="stat-value">' + formatPRIMShort('0x' + totalStake.toString(16)) + ' PRIM</div>',
            '      </div>',
            '    </div>',
            '  </div>',
            '</div>',
            '<div class="main-content">',
            '  <div class="container">',
            '    <div class="latest-grid">',
            '      <div class="card">',
            '        <div class="card-header">',
            '          <h2 class="card-title">Latest Blocks</h2>',
            '          <a href="#/blocks" class="btn btn-outline">View All</a>',
            '        </div>',
            '        <div class="card-body" id="homeBlocks">',
                       blocks.map(function (block) { return blockPanelItem(block, false); }).join(''),
            '        </div>',
            '      </div>',
            '      <div class="card">',
            '        <div class="card-header">',
            '          <h2 class="card-title">Latest Transactions</h2>',
            '          <a href="#/txs" class="btn btn-outline">View All</a>',
            '        </div>',
            '        <div class="card-body" id="homeTxs">',
                       txs.length > 0
                           ? txs.map(function (t) { return txPanelItem(t, false); }).join('')
                           : '<div class="table-empty">No transactions yet</div>',
            '        </div>',
            '      </div>',
            '    </div>',
            '  </div>',
            '</div>',
        ].join('\n');

        var prevBlock = state.latestBlock;
        var timer = setInterval(async function () {
            try {
                await refreshGlobal();
                if (state.latestBlock <= prevBlock) return;

                var hbh = $('#homeBlockHeight');
                if (hbh) hbh.textContent = formatNum(state.latestBlock);

                var newBlocks = await fetchBlocks(state.latestBlock, state.latestBlock - prevBlock, true);
                for (var nb = newBlocks.length - 1; nb >= 0; nb--) {
                    var newBlock = newBlocks[nb];
                    if (!newBlock) continue;

                    var container = $('#homeBlocks');
                    if (container) {
                        var items = container.querySelectorAll('.block-item');
                        if (items.length >= HOME_ITEMS) items[items.length - 1].remove();
                        container.insertAdjacentHTML('afterbegin', blockPanelItem(newBlock, true));
                    }

                    if (newBlock.transactions && newBlock.transactions.length > 0) {
                        var txContainer = $('#homeTxs');
                        if (txContainer) {
                            var empty = txContainer.querySelector('.table-empty');
                            if (empty) empty.remove();
                            var added = 0;
                            for (var nt = 0; nt < newBlock.transactions.length && added < 3; nt++) {
                                var ntx = newBlock.transactions[nt];
                                if (typeof ntx === 'object' && ntx.hash) {
                                    var txItems = txContainer.querySelectorAll('.tx-item');
                                    if (txItems.length >= HOME_ITEMS) txItems[txItems.length - 1].remove();
                                    txContainer.insertAdjacentHTML('afterbegin', txPanelItem(Object.assign({}, ntx, { _blockNum: hexToInt(newBlock.number) }), true));
                                    added++;
                                }
                            }
                        }
                    }
                }
                prevBlock = state.latestBlock;
            } catch (e) { /* ignore poll errors */ }
        }, POLL_MS);

        return function () { clearInterval(timer); };
    }
    pageHome._page = 'home';

    function blockPanelItem(b, isNew) {
        var num = hexToInt(b.number);
        var txCount = Array.isArray(b.transactions) ? b.transactions.length : 0;
        var proposer = b.miner || b.proposer || '';
        var proposerLabel = validatorName(proposer) || (proposer ? truncAddr(proposer) : '—');
        return [
            '<div class="block-item' + (isNew ? ' new-item' : '') + '" data-nav="#/block/' + num + '" style="cursor:pointer">',
            '  <div class="item-icon item-icon-block">Bk</div>',
            '  <div class="item-main">',
            '    <div class="item-row-primary">',
            '      <a href="#/block/' + num + '" class="hash-link">' + formatNum(num) + '</a>',
            '      <span class="time-text">' + timeAgo(num, state.latestBlock) + '</span>',
            '    </div>',
            '    <div class="item-row-secondary">',
            '      Proposer ' + (proposer ? '<a href="#/address/' + escapeHtml(proposer) + '" class="addr-link">' + escapeHtml(proposerLabel) + '</a>' : '—'),
            '    </div>',
            '  </div>',
            '  <div class="item-right">',
            '    <span class="badge badge-sm badge-info">' + txCount + ' txn' + (txCount !== 1 ? 's' : '') + '</span>',
            '  </div>',
            '</div>',
        ].join('');
    }

    function txPanelItem(tx, isNew) {
        var value = formatPRIMShort(tx.value || '0x0');
        return [
            '<div class="tx-item' + (isNew ? ' new-item' : '') + '" data-nav="#/tx/' + escapeHtml(tx.hash) + '" style="cursor:pointer">',
            '  <div class="item-icon item-icon-tx">Tx</div>',
            '  <div class="item-main">',
            '    <div class="item-row-primary">',
            '      <a href="#/tx/' + escapeHtml(tx.hash) + '" class="hash-link mono">' + truncHash(tx.hash) + '</a>',
            '      <span class="time-text">' + (tx._blockNum !== undefined ? timeAgo(tx._blockNum, state.latestBlock) : '') + '</span>',
            '    </div>',
            '    <div class="item-row-secondary">',
            '      From ' + addrDisplay(tx.from) + ' ' + ICONS.arrow + ' ',
            '      ' + (tx.to ? addrDisplay(tx.to) : '<span style="color:var(--warn)">Contract Create</span>'),
            '    </div>',
            '  </div>',
            '  <div class="item-right">',
            '    <span class="badge badge-sm badge-secondary">' + value + ' PRIM</span>',
            '  </div>',
            '</div>',
        ].join('');
    }

    /* ===========================================
       PAGE: BLOCKS LIST
       =========================================== */
    async function pageBlocks(el) {
        await refreshGlobal();

        var page = parseInt(getQueryParam('p')) || 1;
        var totalPages = Math.max(1, Math.ceil((state.latestBlock + 1) / ITEMS_PER_PAGE));
        var currentPage = Math.min(page, totalPages);
        var startBlock = state.latestBlock - (currentPage - 1) * ITEMS_PER_PAGE;
        var count = Math.min(ITEMS_PER_PAGE, startBlock + 1);

        var blocks = await fetchBlocks(startBlock, count, false);

        var rows = blocks.map(function (b) {
            var num = hexToInt(b.number);
            var txCount = Array.isArray(b.transactions) ? b.transactions.length : 0;
            var gasUsed = hexToInt(b.gasUsed || b.gas_used || '0x0');
            var gasLimit = hexToInt(b.gasLimit || b.gas_limit || '0x0');
            var gasPercent = gasLimit > 0 ? ((gasUsed / gasLimit) * 100).toFixed(1) : '0.0';
            var feeRecipient = b.miner || b.proposer || '';
            var feeRecipientLabel = validatorName(feeRecipient) || truncAddr(feeRecipient);
            var baseFee = b.baseFeePerGas || b.base_fee || '0x0';
            var burntWei = hexToBigInt(baseFee) * BigInt(gasUsed);
            var burntHex = '0x' + burntWei.toString(16);
            return [
                '<tr data-nav="#/block/' + num + '" style="cursor:pointer">',
                '  <td><a href="#/block/' + num + '" class="hash-link">' + formatNum(num) + '</a></td>',
                '  <td class="td-time">' + timeAgo(num, state.latestBlock) + '</td>',
                '  <td>' + (feeRecipient ? '<a href="#/address/' + escapeHtml(feeRecipient) + '" class="addr-link">' + escapeHtml(feeRecipientLabel) + '</a>' : '—') + '</td>',
                '  <td><span class="badge badge-sm badge-info">' + txCount + '</span></td>',
                '  <td>',
                '    <div style="display:flex;align-items:center;gap:0.5rem">',
                '      <span class="mono" style="font-size:0.82rem">' + formatGas(b.gasUsed || b.gas_used || '0x0') + '</span>',
                '      <div class="gas-bar" style="width:60px"><div class="gas-bar-fill" style="width:' + gasPercent + '%"></div></div>',
                '      <span style="font-size:0.7rem;color:#8c98a4">' + gasPercent + '%</span>',
                '    </div>',
                '  </td>',
                '  <td class="mono">' + formatGas(b.gasLimit || b.gas_limit || '0x0') + '</td>',
                '  <td class="mono">' + (baseFee !== '0x0' ? formatGwei(baseFee) : '—') + '</td>',
                '  <td class="td-right mono text-muted" style="font-size:0.78rem">' + (burntWei > 0n ? formatPRIMShort(burntHex) : '0') + '</td>',
                '</tr>',
            ].join('');
        }).join('');

        el.innerHTML = [
            '<div class="main-content"><div class="container">',
            '  <div class="page-header">',
            '    <div>',
            '      <h1 class="page-title">Blocks</h1>',
            '      <div class="page-subtitle">Block #' + formatNum(state.latestBlock) + ' (total ' + formatNum(state.latestBlock + 1) + ' blocks)</div>',
            '    </div>',
            '  </div>',
            '  <div class="card">',
            '    <div class="card-header"><h2 class="card-title">Blocks</h2>' + csvExportBtnHtml('blocksTable', 'blocks.csv') + '</div>',
            '    <div class="table-responsive">',
            '      <table class="data-table" id="blocksTable">',
            '        <thead><tr>',
            '          <th>Block</th><th>Age</th><th>Fee Recipient</th><th>Txn</th><th>Gas Used</th><th>Gas Limit</th><th>Base Fee</th><th class="td-right">Burnt Fees (PRIM)</th>',
            '        </tr></thead>',
            '        <tbody>' + (rows || '<tr><td colspan="8" class="table-empty">No blocks</td></tr>') + '</tbody>',
            '      </table>',
            '    </div>',
            '    ' + paginationHtml(currentPage, totalPages, '#/blocks'),
            '  </div>',
            '</div></div>',
        ].join('\n');
    }
    pageBlocks._page = 'blockchain';

    /* ===========================================
       PAGE: BLOCK DETAIL
       =========================================== */
    async function pageBlockDetail(el, blockNum) {
        await refreshGlobal();
        var num = parseInt(blockNum, 10);
        var hex = '0x' + num.toString(16);
        var block = await rpc('prime_getBlockByNumber', [hex, true]);
        if (!block) {
            el.innerHTML = '<div class="main-content"><div class="container"><div class="table-empty">Block not found</div></div></div>';
            return;
        }

        var txCount = Array.isArray(block.transactions) ? block.transactions.length : 0;
        var gasUsed = hexToInt(block.gasUsed || block.gas_used || '0x0');
        var gasLimit = hexToInt(block.gasLimit || block.gas_limit || '0x0');
        var gasPercent = gasLimit > 0 ? ((gasUsed / gasLimit) * 100).toFixed(1) : '0.0';
        var proposer = block.miner || block.proposer || '';
        var proposerLabel = validatorName(proposer);
        var confirmations = Math.max(0, state.latestBlock - num);
        var blockSize = hexToInt(block.size || '0x0');
        var baseFeeRaw = block.baseFeePerGas || block.base_fee || '0x0';
        var baseFeeWei = hexToBigInt(baseFeeRaw);
        var burntFees = baseFeeWei * BigInt(gasUsed);
        var burntFeesHex = '0x' + burntFees.toString(16);
        var extraData = block.extraData || block.extra_data || '0x';
        var extraDataDecoded = '';
        try {
            var hexStr = extraData.startsWith('0x') ? extraData.slice(2) : extraData;
            for (var ci = 0; ci < hexStr.length; ci += 2) {
                var charCode = parseInt(hexStr.substr(ci, 2), 16);
                if (charCode >= 32 && charCode < 127) extraDataDecoded += String.fromCharCode(charCode);
                else extraDataDecoded += '.';
            }
        } catch (e) { extraDataDecoded = ''; }
        var difficulty = block.difficulty || block.totalDifficulty || '0x0';
        var nonce = block.nonce || '0x0000000000000000';

        var txRows = '';
        if (txCount > 0) {
            txRows = block.transactions.map(function (t) {
                var tx = typeof t === 'object' ? t : { hash: t };
                return [
                    '<tr>',
                    '  <td><a href="#/tx/' + escapeHtml(tx.hash) + '" class="hash-link">' + truncHash(tx.hash) + '</a></td>',
                    '  <td>' + methodBadgeHtml(tx.input) + '</td>',
                    '  <td>' + (tx.from ? '<a href="#/address/' + escapeHtml(tx.from) + '" class="addr-link">' + truncAddr(tx.from) + '</a>' : '—') + '</td>',
                    '  <td style="color:#8c98a4;font-size:0.75rem">→</td>',
                    '  <td>' + (tx.to ? addrDisplay(tx.to) : '<span style="color:#e5a50a">Contract Create</span>') + '</td>',
                    '  <td class="td-right mono">' + formatPRIMShort(tx.value || '0x0') + ' PRIM</td>',
                    '  <td class="mono" style="font-size:0.78rem">' + formatGwei(txGasPrice(tx) || '0x0') + '</td>',
                    '</tr>',
                ].join('');
            }).join('');
        }

        el.innerHTML = [
            '<div class="main-content"><div class="container">',
            '  <a href="#/blocks" class="back-link">' + ICONS.back + ' Back to Blocks</a>',
            '  <div class="detail-header">',
            '    <div class="detail-icon" style="background:#f0f1f3">' + ICONS.cube + '</div>',
            '    <div class="detail-title-group">',
            '      <div class="detail-title">',
            '        Block <span class="mono">#' + formatNum(num) + '</span>',
            '        <div class="detail-nav">',
            '          <button class="detail-nav-btn"' + (num <= 0 ? ' disabled' : '') + ' data-nav="#/block/' + (num - 1) + '">' + ICONS.chevL + '</button>',
            '          <button class="detail-nav-btn"' + (num >= state.latestBlock ? ' disabled' : '') + ' data-nav="#/block/' + (num + 1) + '">' + ICONS.chevR + '</button>',
            '        </div>',
            '      </div>',
            '    </div>',
            '  </div>',
            '',
            '  <div class="detail-card">',
            '    <div class="detail-card-title">Overview</div>',
            '    <div class="detail-row"><div class="detail-label">Block Height</div><div class="detail-value">' + formatNum(num) + '</div></div>',
            '    <div class="detail-row"><div class="detail-label">Status</div><div class="detail-value"><span class="status-badge status-success"><span class="status-dot"></span>Finalized</span> <span class="text-muted" style="margin-left:8px">' + formatNum(confirmations) + ' Block Confirmations</span></div></div>',
            '    <div class="detail-row"><div class="detail-label">Timestamp</div><div class="detail-value">' + (formatTimestamp(block.timestamp) || timeAgo(num, state.latestBlock)) + '</div></div>',
            '    <div class="detail-row"><div class="detail-label">Transactions</div><div class="detail-value"><a href="#/block/' + num + '#txs">' + txCount + ' transaction' + (txCount !== 1 ? 's' : '') + '</a> in this block</div></div>',
            '    <div class="separator"></div>',
            '    <div class="detail-row"><div class="detail-label">Fee Recipient</div><div class="detail-value">' + (proposer ? '<a href="#/address/' + escapeHtml(proposer) + '" class="addr-link">' + escapeHtml(proposer) + '</a>' + (proposerLabel ? ' <span class="text-muted">(' + escapeHtml(proposerLabel) + ')</span>' : '') + ' ' + copyBtnHtml(proposer) : '—') + '</div></div>',
            '    <div class="detail-row"><div class="detail-label">Total Difficulty</div><div class="detail-value mono">' + formatNum(hexToInt(block.totalDifficulty || difficulty)) + '</div></div>',
            '    <div class="detail-row"><div class="detail-label">Size</div><div class="detail-value">' + (blockSize > 0 ? formatNum(blockSize) + ' bytes' : '0 bytes') + '</div></div>',
            '    <div class="separator"></div>',
            '    <div class="detail-row">',
            '      <div class="detail-label">Gas Used</div>',
            '      <div class="detail-value">',
            '        <span class="mono">' + formatNum(gasUsed) + '</span>',
            '        <span class="text-muted" style="margin:0 8px">(' + gasPercent + '%)</span>',
            '        <div class="gas-bar" style="width:120px;display:inline-block;vertical-align:middle"><div class="gas-bar-fill" style="width:' + gasPercent + '%"></div></div>',
            '      </div>',
            '    </div>',
            '    <div class="detail-row"><div class="detail-label">Gas Limit</div><div class="detail-value mono">' + formatNum(gasLimit) + '</div></div>',
            '    <div class="detail-row"><div class="detail-label">Base Fee Per Gas</div><div class="detail-value mono">' + (baseFeeRaw !== '0x0' ? formatGwei(baseFeeRaw) + ' <span class="text-muted">(' + formatPRIM(baseFeeRaw) + ')</span>' : '—') + '</div></div>',
            '    <div class="detail-row"><div class="detail-label">Burnt Fees</div><div class="detail-value mono">' + (burntFees > 0n ? '<span style="color:#dc3545">🔥 ' + formatPRIM(burntFeesHex) + '</span>' : '0 PRIM') + '</div></div>',
            '    <div class="detail-row"><div class="detail-label">Extra Data</div><div class="detail-value">' + (extraDataDecoded ? escapeHtml(extraDataDecoded) + ' <span class="text-muted mono" style="font-size:0.78rem">(Hex: ' + escapeHtml(extraData) + ')</span>' : '<span class="mono">' + escapeHtml(extraData) + '</span>') + '</div></div>',
            '    <div class="separator"></div>',
            '    <div class="detail-row"><div class="detail-label">Hash</div><div class="detail-value mono">' + (block.hash || '—') + ' ' + (block.hash ? copyBtnHtml(block.hash) : '') + '</div></div>',
            '    <div class="detail-row"><div class="detail-label">Parent Hash</div><div class="detail-value mono">' + ((block.parentHash || block.parent_hash) ? '<a href="#/block/' + (num - 1) + '" class="hash-link">' + (block.parentHash || block.parent_hash) + '</a> ' + copyBtnHtml(block.parentHash || block.parent_hash) : '—') + '</div></div>',
            '    <div class="detail-row"><div class="detail-label">StateRoot</div><div class="detail-value mono">' + (block.stateRoot || block.state_root || '—') + ' ' + (block.stateRoot || block.state_root ? copyBtnHtml(block.stateRoot || block.state_root) : '') + '</div></div>',
            '    <div class="detail-row"><div class="detail-label">TransactionsRoot</div><div class="detail-value mono">' + (block.transactionsRoot || block.transactions_root || '—') + '</div></div>',
            '    <div class="detail-row"><div class="detail-label">ReceiptsRoot</div><div class="detail-value mono">' + (block.receiptsRoot || block.receipts_root || '—') + '</div></div>',
            '    <div class="detail-row"><div class="detail-label">Sha3Uncles</div><div class="detail-value mono">' + (block.sha3Uncles || block.sha3_uncles || '—') + '</div></div>',
            '    <div class="detail-row"><div class="detail-label">Nonce</div><div class="detail-value mono">' + nonce + '</div></div>',
            '  </div>',
            '',
            txCount > 0 ? [
                '  <div class="detail-card" id="txs">',
                '    <div class="detail-card-title">Transactions (' + txCount + ')</div>',
                '    <div class="table-responsive">',
                '      <table class="data-table">',
                '        <thead><tr>',
                '          <th>Tx Hash</th><th>Method</th><th>From</th><th></th><th>To</th><th class="td-right">Value</th><th>Gas Price</th>',
                '        </tr></thead>',
                '        <tbody>' + txRows + '</tbody>',
                '      </table>',
                '    </div>',
                '  </div>',
            ].join('\n') : '',
            '</div></div>',
        ].join('\n');
    }
    pageBlockDetail._page = 'blockchain';

    /* ===========================================
       PAGE: TRANSACTIONS LIST
       =========================================== */
    async function pageTxs(el) {
        await refreshGlobal();

        var allTxs = [];
        var scanDepth = Math.min(50, state.latestBlock + 1);
        var batchSize = 10;

        for (var offset = 0; offset < scanDepth && allTxs.length < ITEMS_PER_PAGE * 2; offset += batchSize) {
            var promises = [];
            for (var i = 0; i < batchSize && state.latestBlock - offset - i >= 0; i++) {
                var num = state.latestBlock - offset - i;
                promises.push(rpc('prime_getBlockByNumber', ['0x' + num.toString(16), true]).catch(function () { return null; }));
            }
            var blocks = (await Promise.all(promises)).filter(Boolean);
            for (var bi = 0; bi < blocks.length; bi++) {
                var b = blocks[bi];
                if (!b.transactions) continue;
                for (var ti = 0; ti < b.transactions.length; ti++) {
                    var tx = b.transactions[ti];
                    if (typeof tx === 'object' && tx.hash) {
                        allTxs.push(Object.assign({}, tx, { _blockNum: hexToInt(b.number) }));
                    }
                }
            }
        }

        var seen = {};
        var txs = [];
        for (var j = 0; j < allTxs.length; j++) {
            if (!seen[allTxs[j].hash]) { seen[allTxs[j].hash] = true; txs.push(allTxs[j]); }
        }

        var page = parseInt(getQueryParam('p')) || 1;
        var totalPages = Math.max(1, Math.ceil(txs.length / ITEMS_PER_PAGE));
        var currentPage = Math.min(page, totalPages);
        var startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
        var pageTxList = txs.slice(startIdx, startIdx + ITEMS_PER_PAGE);

        var rows = pageTxList.map(function (tx) {
            var txFee = BigInt(hexToInt(txGas(tx) || '0x0')) * hexToBigInt(txGasPrice(tx) || state.gasPrice);
            var txFeeHex = '0x' + txFee.toString(16);
            return [
                '<tr>',
                '  <td><a href="#/tx/' + escapeHtml(tx.hash) + '" class="hash-link">' + truncHash(tx.hash) + '</a></td>',
                '  <td>' + methodBadgeHtml(tx.input) + '</td>',
                '  <td><a href="#/block/' + tx._blockNum + '" class="hash-link">' + formatNum(tx._blockNum) + '</a></td>',
                '  <td class="td-time">' + timeAgo(tx._blockNum, state.latestBlock) + '</td>',
                '  <td><a href="#/address/' + escapeHtml(tx.from) + '" class="addr-link">' + truncAddr(tx.from) + '</a></td>',
                '  <td style="color:#8c98a4;font-size:0.75rem">→</td>',
                '  <td>' + (tx.to ? addrDisplay(tx.to) : '<span style="color:#e5a50a">Contract Create</span>') + '</td>',
                '  <td class="td-right mono">' + formatPRIMShort(tx.value || '0x0') + '</td>',
                '  <td class="td-right mono text-muted" style="font-size:0.78rem">' + formatPRIMShort(txFeeHex) + '</td>',
                '</tr>',
            ].join('');
        }).join('');

        el.innerHTML = [
            '<div class="main-content"><div class="container">',
            '  <div class="page-header">',
            '    <div>',
            '      <h1 class="page-title">Transactions</h1>',
            '      <div class="page-subtitle">' + formatNum(txs.length) + ' transactions found (from recent blocks)</div>',
            '    </div>',
            '  </div>',
            '  <div class="card">',
            '    <div class="card-header"><h2 class="card-title">Transactions</h2>' + csvExportBtnHtml('txsTable', 'transactions.csv') + '</div>',
            '    <div class="table-responsive">',
            '      <table class="data-table" id="txsTable">',
            '        <thead><tr>',
            '          <th>Tx Hash</th><th>Method</th><th>Block</th><th>Age</th><th>From</th><th></th><th>To</th><th class="td-right">Value</th><th class="td-right">Txn Fee</th>',
            '        </tr></thead>',
            '        <tbody>',
                       rows || '<tr><td colspan="9" class="table-empty">No transactions found in recent blocks</td></tr>',
            '        </tbody>',
            '      </table>',
            '    </div>',
            '    ' + paginationHtml(currentPage, totalPages, '#/txs'),
            '  </div>',
            '</div></div>',
        ].join('\n');
    }
    pageTxs._page = 'blockchain';

    /* ===========================================
       PAGE: TRANSACTION DETAIL
       =========================================== */
    async function pageTxDetail(el, txHash) {
        await refreshGlobal();

        var tx, receipt;
        try {
            var results = await Promise.all([
                rpc('eth_getTransactionByHash', [txHash]),
                rpc('eth_getTransactionReceipt', [txHash]),
            ]);
            tx = results[0];
            receipt = results[1];
        } catch (e) {
            tx = null; receipt = null;
        }

        if (!tx) {
            el.innerHTML = '<div class="main-content"><div class="container"><div class="table-empty">Transaction not found</div></div></div>';
            return;
        }

        var status = receipt ? (receipt.status === '0x1' || receipt.status === '0x01' ? 'success' : 'fail') : 'pending';
        var statusLabel = status === 'success' ? 'Success' : status === 'fail' ? 'Failed' : 'Pending';

        var rcptGasUsed = receipt ? hexToInt(receipt.gasUsed || receipt.gas_used || '0x0') : 0;
        var txGasLimit = hexToInt(txGas(tx) || '0x0');
        var txGasPriceVal = txGasPrice(tx) || state.gasPrice;
        var blockNum = tx.blockNumber ? hexToInt(tx.blockNumber) : (tx.block_number ? hexToInt(tx.block_number) : (receipt ? hexToInt(receipt.blockNumber || receipt.block_number || '0x0') : null));

        var feeWei = BigInt(rcptGasUsed) * hexToBigInt(txGasPriceVal);
        var feeHex = '0x' + feeWei.toString(16);

        var gasBarPercent = txGasLimit > 0 ? ((rcptGasUsed / txGasLimit) * 100).toFixed(1) : '0.0';

        var confirmations = blockNum !== null ? Math.max(0, state.latestBlock - blockNum) : 0;
        var txType = tx.type !== undefined ? hexToInt(tx.type) : 0;
        var txTypeLabel = txType === 2 ? '2 (EIP-1559)' : txType === 1 ? '1 (EIP-2930)' : '0 (Legacy)';
        var positionInBlock = txTxIndex(tx) !== undefined ? hexToInt(txTxIndex(tx)) : '—';
        var maxFeePerGas = tx.maxFeePerGas || tx.max_fee_per_gas;
        var maxPriorityFee = tx.maxPriorityFeePerGas || tx.max_priority_fee_per_gas;

        var blockForTimestamp = null;
        if (blockNum !== null) {
            try { blockForTimestamp = await rpc('prime_getBlockByNumber', ['0x' + blockNum.toString(16), false]); } catch (e) {}
        }
        var baseFeeFromBlock = blockForTimestamp ? (blockForTimestamp.baseFeePerGas || blockForTimestamp.base_fee || '0x0') : '0x0';
        var burntFeesWei = hexToBigInt(baseFeeFromBlock) * BigInt(rcptGasUsed);
        var burntFeesHex = '0x' + burntFeesWei.toString(16);
        var savingsWei = feeWei - burntFeesWei;
        if (savingsWei < 0n) savingsWei = 0n;

        var txActionHtml = '';
        if (tx.value && hexToBigInt(tx.value) > 0n && (!tx.input || tx.input === '0x')) {
            txActionHtml = '<div class="detail-row"><div class="detail-label">Transaction Action</div><div class="detail-value"><span class="status-badge status-success" style="font-size:0.8rem"><span class="status-dot"></span>Transfer</span> <strong>' + formatPRIM(tx.value) + '</strong> to ' + (tx.to ? '<a href="#/address/' + escapeHtml(tx.to) + '" class="addr-link">' + truncAddr(tx.to) + '</a>' : 'Contract') + '</div></div>';
        } else if (tx.input && tx.input.length >= 10) {
            var actionDecoded = decodeMethod(tx.input);
            if (actionDecoded) {
                txActionHtml = '<div class="detail-row"><div class="detail-label">Transaction Action</div><div class="detail-value"><span class="method-tag">' + escapeHtml(actionDecoded.name) + '</span> on ' + (tx.to ? '<a href="#/address/' + escapeHtml(tx.to) + '" class="addr-link">' + truncAddr(tx.to) + '</a>' : '<span style="color:#e5a50a">New Contract</span>') + (hexToBigInt(tx.value || '0x0') > 0n ? ' with <strong>' + formatPRIM(tx.value) + '</strong>' : '') + '</div></div>';
            }
        }

        var toDisplay = '';
        if (tx.to) {
            var contractInfo = contractLabel(tx.to);
            toDisplay = '<a href="#/address/' + escapeHtml(tx.to) + '" class="addr-link">' + escapeHtml(tx.to) + '</a>';
            if (contractInfo) toDisplay += ' <span class="status-badge status-success" style="margin-left:0.5rem"><span class="status-dot"></span>' + escapeHtml(contractInfo.name) + '</span>';
            toDisplay += ' ' + copyBtnHtml(tx.to);
        } else {
            var contractAddr = receipt ? (receipt.contract_address || receipt.contractAddress) : null;
            toDisplay = '<span style="color:var(--warn)">Contract Creation</span>';
            if (contractAddr) {
                toDisplay += ' → <a href="#/address/' + escapeHtml(contractAddr) + '" class="hash-link">' + escapeHtml(contractAddr) + '</a> ' + copyBtnHtml(contractAddr);
            }
        }

        var decoded = decodeMethod(tx.input);
        var decodedInput = decodeInputData(tx.input);
        var inputSection = '';
        if (tx.input && tx.input !== '0x') {
            var decodedParamsHtml = '';
            if (decodedInput && decodedInput.params.length > 0) {
                var paramRows = decodedInput.params.map(function(p) {
                    var displayVal = p.value;
                    if (p.type === 'address') {
                        displayVal = '<a href="#/address/' + escapeHtml(p.value) + '" class="addr-link">' + escapeHtml(p.value) + '</a>';
                    } else if (p.type === 'uint256') {
                        var targetAddr = tx.to ? tx.to.toLowerCase() : '';
                        var tokenInfo = KNOWN_CONTRACTS[targetAddr];
                        var dec = tokenInfo && tokenInfo.decimals !== undefined ? tokenInfo.decimals : 18;
                        displayVal = '<span class="mono">' + escapeHtml(p.value) + '</span> <span style="color:var(--text-secondary)">(' + formatTokenAmount(p.value, dec) + (tokenInfo && tokenInfo.symbol ? ' ' + escapeHtml(tokenInfo.symbol) : '') + ')</span>';
                    }
                    return '<div style="display:flex;gap:0.75rem;padding:0.4rem 0;border-bottom:1px solid var(--border-subtle)">' +
                        '<span style="color:var(--text-muted);min-width:80px;font-size:0.8rem">' + escapeHtml(p.name) + '</span>' +
                        '<span style="color:var(--text-tertiary);min-width:60px;font-size:0.75rem">' + escapeHtml(p.type) + '</span>' +
                        '<span style="font-size:0.82rem;word-break:break-all">' + displayVal + '</span>' +
                        '</div>';
                }).join('');
                decodedParamsHtml = '<div style="margin-top:0.5rem;padding:0.5rem;background:var(--bg-surface);border-radius:var(--radius-xs);border:1px solid var(--border)">' +
                    '<div style="font-size:0.75rem;font-weight:600;color:var(--text-muted);margin-bottom:0.35rem">Decoded Parameters</div>' +
                    paramRows + '</div>';
            }
            inputSection = [
                '<div class="detail-row">',
                '  <div class="detail-label">Input Data</div>',
                '  <div class="detail-value">',
                '    ' + (decoded ? '<span class="method-tag ' + decoded.badge_class + '" style="margin-bottom:0.5rem;display:inline-block">' + escapeHtml(decoded.name) + '</span><br>' : ''),
                '    <div class="mono" style="font-size:0.75rem;word-break:break-all;max-height:120px;overflow-y:auto;padding:0.5rem;background:var(--bg-surface);border-radius:var(--radius-xs);margin-top:0.25rem">' + escapeHtml(tx.input) + '</div>',
                '    ' + decodedParamsHtml,
                '    ' + copyBtnHtml(tx.input),
                '  </div>',
                '</div>',
            ].join('');
        }

        var transfers = parseTokenTransfers(receipt);
        var transferSection = '';
        if (transfers.length > 0) {
            var transferRows = transfers.map(function (t) {
                var formattedAmount = formatTokenAmount(t.amount, t.decimals);
                var tokenInfo = KNOWN_CONTRACTS[t.tokenAddr];
                var tokenName = tokenInfo ? tokenInfo.name : truncAddr(t.tokenAddr);
                return [
                    '<div class="transfer-item" style="display:flex;align-items:center;gap:0.75rem;padding:0.65rem 1.25rem;border-bottom:1px solid var(--border-subtle);font-size:0.85rem">',
                    '  <span class="method-tag badge-success" style="flex-shrink:0">Transfer</span>',
                    '  <span>From</span> <a href="#/address/' + escapeHtml(t.from) + '" class="addr-link">' + truncAddr(t.from) + '</a>',
                    '  <span class="transfer-arrow" style="color:var(--accent)">→</span>',
                    '  <span>To</span> <a href="#/address/' + escapeHtml(t.to) + '" class="addr-link">' + truncAddr(t.to) + '</a>',
                    '  <span style="margin-left:auto" class="td-mono"><span style="color:var(--accent);font-weight:600">' + formattedAmount + '</span> <a href="#/address/' + escapeHtml(t.tokenAddr) + '" class="addr-link">' + escapeHtml(t.symbol) + '</a></span>',
                    '</div>',
                ].join('');
            }).join('');
            transferSection = [
                '<div class="detail-card">',
                '  <div class="detail-card-title">Token Transfers (' + transfers.length + ')</div>',
                '  ' + transferRows,
                '</div>',
            ].join('\n');
        }

        var logsSection = '';
        if (receipt && receipt.logs && receipt.logs.length > 0) {
            var logItems = receipt.logs.map(function (log, idx) {
                var logAddr = log.address || '';
                var logInfo = contractLabel(logAddr);
                var topicsHtml = (log.topics || []).map(function (t, ti) {
                    return '<div style="margin:2px 0"><span style="color:var(--text-muted);width:24px;display:inline-block">[' + ti + ']</span> <span class="mono" style="font-size:0.75rem">' + t + '</span></div>';
                }).join('');
                return [
                    '<div style="padding:0.85rem 1.25rem;border-bottom:1px solid var(--border-subtle)">',
                    '  <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem">',
                    '    <span style="background:var(--bg-surface);padding:2px 8px;border-radius:4px;font-size:0.75rem;font-weight:600;color:var(--text-muted)">' + idx + '</span>',
                    '    <a href="#/address/' + escapeHtml(logAddr) + '" class="addr-link" style="font-size:0.8rem">' + escapeHtml(logAddr) + '</a>',
                    '    ' + (logInfo ? '<span style="color:var(--text-secondary);font-size:0.8rem">(' + escapeHtml(logInfo.name) + ')</span>' : ''),
                    '  </div>',
                    '  <div style="margin-bottom:0.35rem"><span style="color:var(--text-muted);font-size:0.75rem;font-weight:600">Topics:</span></div>',
                    '  <div style="padding-left:0.5rem;margin-bottom:0.5rem">' + topicsHtml + '</div>',
                    '  <div><span style="color:var(--text-muted);font-size:0.75rem;font-weight:600">Data:</span></div>',
                    '  <div class="mono" style="font-size:0.72rem;word-break:break-all;padding:0.4rem 0.5rem;background:var(--bg-surface);border-radius:var(--radius-xs);margin-top:0.25rem;max-height:80px;overflow-y:auto">' + escapeHtml(log.data || '0x') + '</div>',
                    '</div>',
                ].join('');
            }).join('');
            logsSection = [
                '<div class="detail-card">',
                '  <div class="detail-card-title">Event Logs (' + receipt.logs.length + ')</div>',
                '  ' + logItems,
                '</div>',
            ].join('\n');
        }

        el.innerHTML = [
            '<div class="main-content"><div class="container">',
            '  <a href="#/txs" class="back-link">' + ICONS.back + ' Back to Transactions</a>',
            '  <div class="detail-header">',
            '    <div class="detail-icon">' + ICONS.tx + '</div>',
            '    <div class="detail-title-group">',
            '      <div class="detail-title">Transaction Details</div>',
            '      <div class="detail-hash">' + tx.hash + ' ' + copyBtnHtml(tx.hash) + '</div>',
            '    </div>',
            '  </div>',
            '',
            '  <div class="detail-card">',
            '    <div class="detail-card-title">Overview</div>',
            '    <div class="detail-row"><div class="detail-label">Transaction Hash</div><div class="detail-value mono">' + escapeHtml(tx.hash) + ' ' + copyBtnHtml(tx.hash) + '</div></div>',
            '    <div class="detail-row"><div class="detail-label">Status</div><div class="detail-value"><span class="status-badge status-' + status + '"><span class="status-dot"></span>' + statusLabel + '</span></div></div>',
            '    <div class="detail-row"><div class="detail-label">Block</div><div class="detail-value">' + (blockNum !== null ? '<a href="#/block/' + blockNum + '" class="hash-link">' + formatNum(blockNum) + '</a> <span class="text-muted" style="margin-left:8px">' + formatNum(confirmations) + ' Block Confirmations</span>' : '—') + '</div></div>',
            '    <div class="detail-row"><div class="detail-label">Timestamp</div><div class="detail-value">' + (blockForTimestamp && blockForTimestamp.timestamp ? formatTimestamp(blockForTimestamp.timestamp) : (blockNum !== null ? timeAgo(blockNum, state.latestBlock) : '—')) + '</div></div>',
            txActionHtml ? '    ' + txActionHtml : '',
            '    <div class="separator"></div>',
            '    <div class="detail-row"><div class="detail-label">From</div><div class="detail-value mono"><a href="#/address/' + escapeHtml(tx.from) + '" class="addr-link">' + escapeHtml(tx.from) + '</a> ' + copyBtnHtml(tx.from) + '</div></div>',
            '    <div class="detail-row"><div class="detail-label">To</div><div class="detail-value mono">' + toDisplay + '</div></div>',
            '    <div class="separator"></div>',
            '    <div class="detail-row"><div class="detail-label">Value</div><div class="detail-value mono">' + formatPRIM(tx.value || '0x0') + '</div></div>',
            '    <div class="detail-row"><div class="detail-label">Transaction Fee</div><div class="detail-value mono">' + (receipt ? formatPRIM(feeHex) : '—') + '</div></div>',
            '    <div class="detail-row"><div class="detail-label">Gas Price</div><div class="detail-value mono">' + formatGwei(txGasPriceVal) + ' <span class="text-muted">(' + formatPRIM(txGasPriceVal) + ')</span></div></div>',
            txType === 2 ? '    <div class="detail-row"><div class="detail-label">Gas Fees</div><div class="detail-value mono">Base: ' + formatGwei(baseFeeFromBlock) + (maxFeePerGas ? ' | Max: ' + formatGwei(maxFeePerGas) : '') + (maxPriorityFee ? ' | Max Priority: ' + formatGwei(maxPriorityFee) : '') + '</div></div>' : '',
            '    <div class="detail-row">',
            '      <div class="detail-label">Gas Limit &amp; Usage by Txn</div>',
            '      <div class="detail-value">',
            '        <span class="mono">' + formatNum(txGasLimit) + '</span>',
            '        <span class="text-muted" style="margin:0 6px">|</span>',
            '        <span class="mono">' + formatNum(rcptGasUsed) + '</span>',
            '        <span class="text-muted" style="margin:0 6px">(' + gasBarPercent + '%)</span>',
            '        <div class="gas-bar" style="width:100px;display:inline-block;vertical-align:middle"><div class="gas-bar-fill" style="width:' + gasBarPercent + '%"></div></div>',
            '      </div>',
            '    </div>',
            receipt ? '    <div class="detail-row"><div class="detail-label">Burnt &amp; Txn Savings Fees</div><div class="detail-value mono"><span style="color:#dc3545">🔥 Burnt: ' + formatPRIM(burntFeesHex) + '</span> <span class="text-muted" style="margin:0 8px">|</span> 💸 Txn Savings: ' + formatPRIM('0x' + savingsWei.toString(16)) + '</div></div>' : '',
            '    <div class="separator"></div>',
            '    <div class="detail-row"><div class="detail-label">Other Attributes</div><div class="detail-value"><span class="method-tag">Txn Type: ' + txTypeLabel + '</span> <span class="method-tag" style="margin-left:6px">Nonce: ' + (tx.nonce !== undefined ? hexToInt(tx.nonce) : '—') + '</span> <span class="method-tag" style="margin-left:6px">Position In Block: ' + positionInBlock + '</span></div></div>',
            '    ' + inputSection,
            '  </div>',
            '',
            '  ' + transferSection,
            '  ' + logsSection,
            '</div></div>',
        ].join('\n');
    }
    pageTxDetail._page = 'blockchain';

    /* ===========================================
       PAGE: ADDRESS
       =========================================== */
    async function pageAddress(el, addr) {
        if (!/^0x[0-9a-fA-F]{1,40}$/i.test(addr)) {
            el.innerHTML = '<div class="main-content"><div class="container"><div class="detail-card"><div class="detail-card-title" style="color:var(--fail)">Invalid Address</div><div style="padding:1rem 1.25rem">The address format is invalid.</div></div></div></div>';
            return;
        }

        await refreshGlobal();
        await fetchValidators();

        var addrLower = addr.toLowerCase();

        var balance = '0x0';
        var txCount = '0x0';
        var code = '0x';

        try {
            var results = await Promise.all([
                rpc('eth_getBalance', [addr, 'latest']).catch(function () { return '0x0'; }),
                rpc('eth_getTransactionCount', [addr, 'latest']).catch(function () { return '0x0'; }),
                rpc('eth_getCode', [addr, 'latest']).catch(function () { return '0x'; }),
            ]);
            balance = results[0] || '0x0';
            txCount = results[1] || '0x0';
            code = results[2] || '0x';
        } catch (e) { /* ignore */ }

        var tokenBalances = [];
        var tokenAddrs = Object.keys(KNOWN_CONTRACTS).filter(function(k) {
            return KNOWN_CONTRACTS[k].type === 'token';
        });
        var tokenBalancePromises = tokenAddrs.map(function(tokenAddr) {
            return fetchTokenBalance(tokenAddr, addr).then(function(result) {
                return { addr: tokenAddr, balance: result.balance, error: result.error };
            });
        });
        var tokenResults = await Promise.all(tokenBalancePromises);
        var tokenFetchErrors = tokenResults.some(function(r) { return r.error; });
        tokenResults.forEach(function(r) {
            var meta = KNOWN_CONTRACTS[r.addr];
            var rawBal = hexToBigInt(r.balance);
            if (rawBal > 0n) {
                tokenBalances.push({
                    symbol: meta.symbol,
                    name: meta.name,
                    decimals: meta.decimals,
                    balance: r.balance,
                    address: r.addr,
                });
            }
        });

        var isContract = code && code !== '0x' && code !== '0x0' && code.length > 2;
        var isValidator = state.validators.some(function (v) { return v.address && v.address.toLowerCase() === addrLower; });
        var validatorInfo = state.validators.find(function (v) { return v.address && v.address.toLowerCase() === addrLower; });
        var verified = KNOWN_CONTRACTS[addrLower];

        var badges = '';
        if (isValidator) badges += '<span class="status-badge status-success" style="margin-left:0.5rem"><span class="status-dot"></span>Validator</span>';
        if (verified) badges += '<span class="status-badge status-success" style="margin-left:0.5rem"><span class="status-dot"></span>Verified: ' + escapeHtml(verified.name) + '</span>';
        if (isContract && !verified) badges += '<span class="status-badge status-pending" style="margin-left:0.5rem"><span class="status-dot"></span>Contract</span>';

        var typeLabel = isValidator ? 'Validator' : isContract ? 'Contract' : 'EOA (Externally Owned Account)';
        var nonce = hexToInt(txCount);

        var overviewHtml = [
            '<div class="detail-card" style="margin-bottom:1.5rem">',
            '  <div class="detail-card-title">Overview</div>',
            '  <div class="detail-row"><div class="detail-label">PRIM Balance</div><div class="detail-value mono" style="font-size:1rem;font-weight:600">' + formatPRIM(balance) + '</div></div>',
            '  <div class="detail-row"><div class="detail-label">Token Holdings</div><div class="detail-value">' + (tokenBalances.length > 0 ? '<span class="method-tag">' + tokenBalances.length + ' Token' + (tokenBalances.length !== 1 ? 's' : '') + '</span>' : 'None') + '</div></div>',
            '</div>',
        ].join('\n');

        var moreInfoHtml = [
            '<div class="detail-card" style="margin-bottom:1.5rem">',
            '  <div class="detail-card-title">More Info</div>',
            '  <div class="detail-row"><div class="detail-label">Address Type</div><div class="detail-value">' + typeLabel + '</div></div>',
            '  <div class="detail-row"><div class="detail-label">Nonce</div><div class="detail-value mono">' + formatNum(nonce) + '</div></div>',
            isValidator && validatorInfo ? '  <div class="detail-row"><div class="detail-label">Validator Stake</div><div class="detail-value mono">' + formatPRIM(validatorInfo.stake) + '</div></div>' : '',
            isContract ? '  <div class="detail-row"><div class="detail-label">Contract Code</div><div class="detail-value">' + formatNum(code.length) + ' bytes' + (verified ? ' <span class="status-badge status-success"><span class="status-dot"></span>Verified</span>' : '') + '</div></div>' : '',
            '</div>',
        ].join('\n');

        var tokenHoldingsHtml = '';
        if (tokenBalances.length > 0) {
            var tokenRows = tokenBalances.map(function(t) {
                return '<div class="token-row" style="display:flex;justify-content:space-between;align-items:center;padding:0.5rem 0;border-bottom:1px solid var(--border)">' +
                    '<div><span style="font-weight:600;color:var(--text-primary)">' + escapeHtml(t.symbol) + '</span> <span style="color:var(--text-tertiary);font-size:0.8rem">' + escapeHtml(t.name) + '</span></div>' +
                    '<div class="mono" style="font-weight:500">' + formatTokenAmount(t.balance, t.decimals) + '</div>' +
                    '</div>';
            }).join('');
            var tokenErrorNote = tokenFetchErrors ? '<div style="padding:0.5rem 1.25rem;font-size:0.8rem;color:var(--warn)">⚠ Some token balances could not be fetched and may be incomplete.</div>' : '';
            tokenHoldingsHtml = '<div class="detail-card" style="margin-bottom:1.5rem"><div class="detail-card-title">Token Holdings</div><div style="padding:0.75rem 1.25rem">' + tokenRows + '</div>' + tokenErrorNote + '</div>';
        } else if (tokenFetchErrors) {
            tokenHoldingsHtml = '<div class="detail-card" style="margin-bottom:1.5rem"><div class="detail-card-title">Token Holdings</div><div style="padding:0.75rem 1.25rem;font-size:0.8rem;color:var(--warn)">⚠ Token balances could not be fetched. RPC calls failed.</div></div>';
        }

        var contractInfoSection = '';
        if (verified) {
            contractInfoSection = [
                '<div class="detail-card" style="margin-bottom:1.5rem">',
                '  <div class="detail-card-title" style="color:var(--accent)">✓ Verified Contract</div>',
                '  <div class="detail-row"><div class="detail-label">Contract Name</div><div class="detail-value" style="font-weight:600">' + escapeHtml(verified.name) + '</div></div>',
                '  <div class="detail-row"><div class="detail-label">Compiler</div><div class="detail-value mono">' + escapeHtml(verified.compiler) + '</div></div>',
                '  <div class="detail-row"><div class="detail-label">Source File</div><div class="detail-value mono">' + escapeHtml(verified.source) + '</div></div>',
                '  <div class="detail-row"><div class="detail-label">License</div><div class="detail-value">' + escapeHtml(verified.license) + '</div></div>',
                '  <div class="detail-row"><div class="detail-label">Optimization</div><div class="detail-value">Enabled (200 runs, via-ir)</div></div>',
                '  <div class="detail-row"><div class="detail-label">EVM Version</div><div class="detail-value">Shanghai</div></div>',
                '  <div class="detail-row"><div class="detail-label">Source Code</div><div class="detail-value"><a href="https://github.com/PrimeNumbersLabs/prime-chain/tree/main/' + escapeHtml(verified.source) + '" target="_blank" rel="noopener">View on GitHub →</a></div></div>',
                '</div>',
            ].join('\n');
        }

        var hasTabs = true;
        var tabBar = [
            '<div class="tab-nav" style="margin-bottom:1rem">',
            '  <button class="tab-btn active" data-tab="txs">Transactions</button>',
            '  <button class="tab-btn" data-tab="transfers">Token Transfers</button>',
            isContract ? '  <button class="tab-btn" data-tab="contract">Contract</button>' : '',
            '</div>',
        ].join('');

        var addressTxs = [];
        var scanBlocks = Math.min(500, state.latestBlock + 1);
        var batchSize = 20;
        for (var offset = 0; offset < scanBlocks && addressTxs.length < 50; offset += batchSize) {
            var blockPromises = [];
            for (var i = 0; i < batchSize && state.latestBlock - offset - i >= 0; i++) {
                var num = state.latestBlock - offset - i;
                blockPromises.push(rpc('prime_getBlockByNumber', ['0x' + num.toString(16), true]).catch(function () { return null; }));
            }
            var blocks = (await Promise.all(blockPromises)).filter(Boolean);
            for (var bi = 0; bi < blocks.length; bi++) {
                var b = blocks[bi];
                if (!b.transactions) continue;
                for (var ti = 0; ti < b.transactions.length; ti++) {
                    var tx = b.transactions[ti];
                    if (typeof tx === 'object' && tx.hash) {
                        if ((tx.from && tx.from.toLowerCase() === addrLower) || (tx.to && tx.to.toLowerCase() === addrLower)) {
                            addressTxs.push(Object.assign({}, tx, { _blockNum: hexToInt(b.number) }));
                        }
                    }
                }
            }
        }

        var txRows = addressTxs.length > 0 ? addressTxs.map(function (tx) {
            var isFrom = tx.from && tx.from.toLowerCase() === addrLower;
            var txFee = BigInt(hexToInt(txGas(tx) || '0x0')) * hexToBigInt(txGasPrice(tx) || state.gasPrice);
            var txFeeHex = '0x' + txFee.toString(16);
            return [
                '<tr>',
                '  <td><a href="#/tx/' + escapeHtml(tx.hash) + '" class="hash-link">' + truncHash(tx.hash) + '</a></td>',
                '  <td>' + methodBadgeHtml(tx.input) + '</td>',
                '  <td><a href="#/block/' + tx._blockNum + '" class="hash-link">' + formatNum(tx._blockNum) + '</a></td>',
                '  <td class="td-time">' + timeAgo(tx._blockNum, state.latestBlock) + '</td>',
                '  <td>' + addrDisplay(tx.from) + '</td>',
                '  <td><span class="status-badge ' + (isFrom ? 'status-fail' : 'status-success') + '" style="font-size:0.7rem">' + (isFrom ? 'OUT' : 'IN') + '</span></td>',
                '  <td>' + (tx.to ? addrDisplay(tx.to) : '<span style="color:#e5a50a">Contract Create</span>') + '</td>',
                '  <td class="td-right mono">' + formatPRIMShort(tx.value || '0x0') + '</td>',
                '  <td class="td-right mono text-muted" style="font-size:0.78rem">' + formatPRIMShort(txFeeHex) + '</td>',
                '</tr>',
            ].join('');
        }).join('') : '<tr><td colspan="9" class="table-empty">No transactions found for this address in recent blocks</td></tr>';

        var txTableHtml = [
            '<div id="tab-txs">',
            '  <div class="card">',
            '    <div class="table-responsive">',
            '      <table class="data-table">',
            '        <thead><tr>',
            '          <th>Tx Hash</th><th>Method</th><th>Block</th><th>Age</th><th>From</th><th></th><th>To</th><th class="td-right">Value</th><th class="td-right">Txn Fee</th>',
            '        </tr></thead>',
            '        <tbody>' + txRows + '</tbody>',
            '      </table>',
            '    </div>',
            addressTxs.length >= 50 ? '    <div style="padding:0.75rem 1.25rem;text-align:center;color:#8c98a4;font-size:0.82rem">Showing latest 50 transactions. Scan depth: 500 blocks.</div>' : '',
            '  </div>',
            '</div>',
        ].join('\n');

        var contractTabHtml = '';
        if (isContract) {
            var codeDisplay = code.length > 402 ? code.slice(0, 200) + '…' : code;
            contractTabHtml = [
                '<div id="tab-contract" style="display:none">',
                '  <div class="detail-card">',
                '    <div class="detail-card-title">Contract Bytecode</div>',
                '    <div style="padding:1rem 1.25rem">',
                '      <div id="bytecodeDisplay" class="mono" style="font-size:0.72rem;word-break:break-all;max-height:120px;overflow-y:auto;padding:0.75rem;background:var(--bg-surface);border-radius:var(--radius-xs);color:var(--text-secondary)">' + escapeHtml(codeDisplay) + '</div>',
                code.length > 402 ? '      <button id="expandBytecode" style="margin-top:0.5rem;padding:0.35rem 0.75rem;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-xs);color:var(--text-secondary);cursor:pointer;font-size:0.8rem">Show Full Bytecode (' + formatNum(code.length) + ' chars)</button>' : '',
                '      <div style="margin-top:0.5rem">' + copyBtnHtml(code) + '</div>',
                '    </div>',
                '  </div>',
                '</div>',
            ].join('\n');
        }

        var receiptPromises = addressTxs.slice(0, 25).map(function(tx) {
            return rpc('eth_getTransactionReceipt', [tx.hash]).catch(function() { return null; });
        });
        var receipts = await Promise.all(receiptPromises);
        var transferItems = [];
        receipts.forEach(function(receipt, idx) {
            if (!receipt || !receipt.logs) return;
            receipt.logs.forEach(function(log) {
                if (log.topics && log.topics[0] === TOPIC_TRANSFER && log.topics.length >= 3) {
                    var tokenMeta = KNOWN_CONTRACTS[log.address.toLowerCase()];
                    var fromAddr = '0x' + (log.topics[1] || '').slice(26);
                    var toAddr = '0x' + (log.topics[2] || '').slice(26);
                    transferItems.push({
                        txHash: addressTxs[idx].hash,
                        blockNum: addressTxs[idx]._blockNum,
                        from: fromAddr,
                        to: toAddr,
                        amount: log.data || '0x0',
                        token: tokenMeta ? tokenMeta.symbol : truncHash(log.address, 8, 4),
                        decimals: tokenMeta ? tokenMeta.decimals : 18,
                        tokenAddr: log.address,
                    });
                }
            });
        });

        var transferTableRows = transferItems.length > 0 ? transferItems.map(function(item) {
            var isFrom = item.from.toLowerCase() === addrLower;
            return [
                '<tr>',
                '  <td><a href="#/tx/' + escapeHtml(item.txHash) + '" class="hash-link">' + truncHash(item.txHash) + '</a></td>',
                '  <td><a href="#/block/' + item.blockNum + '" class="hash-link">' + formatNum(item.blockNum) + '</a></td>',
                '  <td>' + addrDisplay(item.from) + '</td>',
                '  <td><span class="status-badge ' + (isFrom ? 'status-fail' : 'status-success') + '" style="font-size:0.7rem">' + (isFrom ? 'OUT' : 'IN') + '</span></td>',
                '  <td>' + addrDisplay(item.to) + '</td>',
                '  <td class="td-right td-mono">' + formatTokenAmount(item.amount, item.decimals) + '</td>',
                '  <td><a href="#/address/' + escapeHtml(item.tokenAddr) + '" class="addr-link">' + escapeHtml(item.token) + '</a></td>',
                '</tr>',
            ].join('');
        }).join('') : '<tr><td colspan="7" class="table-empty">No token transfers found in recent transactions</td></tr>';

        var transfersTabHtml = [
            '<div id="tab-transfers" style="display:none">',
            '  <div class="card">',
            '    <div class="table-responsive">',
            '      <table class="data-table">',
            '        <thead><tr>',
            '          <th>Tx Hash</th><th>Block</th><th>From</th><th></th><th>To</th><th class="td-right">Amount</th><th>Token</th>',
            '        </tr></thead>',
            '        <tbody>' + transferTableRows + '</tbody>',
            '      </table>',
            '    </div>',
            '  </div>',
            '</div>',
        ].join('\n');

        el.innerHTML = [
            '<div class="main-content"><div class="container">',
            '  <a href="#/" class="back-link">' + ICONS.back + ' Back to Home</a>',
            '  <div class="detail-header">',
            '    <div class="detail-icon">' + (isValidator ? ICONS.shield : isContract ? ICONS.code : ICONS.user) + '</div>',
            '    <div class="detail-title-group">',
            '      <div class="detail-title">Address ' + badges + '</div>',
            '      <div class="detail-hash">' + escapeHtml(addr) + ' ' + copyBtnHtml(addr) + '</div>',
            '    </div>',
            '  </div>',
            '',
            overviewHtml,
            moreInfoHtml,
            tokenHoldingsHtml,
            contractInfoSection,
            tabBar,
            txTableHtml,
            transfersTabHtml,
            contractTabHtml,
            '</div></div>',
        ].join('\n');

        if (hasTabs) {
            el.addEventListener('click', function (e) {
                var tabBtn = e.target.closest('.tab-btn');
                if (!tabBtn) return;
                var tabName = tabBtn.dataset.tab;
                $$('.tab-btn', el).forEach(function (t) { t.classList.remove('active'); });
                tabBtn.classList.add('active');
                var tabTxs = $('#tab-txs', el);
                var tabTransfers = $('#tab-transfers', el);
                var tabContract = $('#tab-contract', el);
                if (tabTxs) tabTxs.style.display = tabName === 'txs' ? '' : 'none';
                if (tabTransfers) tabTransfers.style.display = tabName === 'transfers' ? '' : 'none';
                if (tabContract) tabContract.style.display = tabName === 'contract' ? '' : 'none';
            });

            var expandBtn = $('#expandBytecode', el);
            if (expandBtn) {
                expandBtn.addEventListener('click', function () {
                    var display = $('#bytecodeDisplay', el);
                    if (display) {
                        display.textContent = code;
                        display.style.maxHeight = '400px';
                    }
                    expandBtn.remove();
                });
            }
        }
    }
    pageAddress._page = '';

    /* ===========================================
       PAGE: VALIDATORS
       =========================================== */
    async function pageValidators(el) {
        await refreshGlobal();
        var validators = await fetchValidators();

        var totalStake = 0n;
        for (var i = 0; i < validators.length; i++) totalStake += hexToBigInt(validators[i].stake);

        var sorted = validators.slice().sort(function (a, b) {
            var sa = hexToBigInt(a.stake);
            var sb = hexToBigInt(b.stake);
            return sa > sb ? -1 : sa < sb ? 1 : 0;
        });

        var rows = sorted.length > 0 ? sorted.map(function (v, i) {
            var stake = hexToBigInt(v.stake);
            var pct = totalStake > 0n ? Number((stake * 10000n) / totalStake) / 100 : 0;
            return [
                '<tr>',
                '  <td class="td-mono" style="font-weight:600;color:var(--text-muted)">' + (i + 1) + '</td>',
                '  <td><a href="#/address/' + escapeHtml(v.address) + '" class="hash-link">' + escapeHtml(v.address) + '</a> ' + copyBtnHtml(v.address) + '</td>',
                '  <td class="td-mono">' + formatPRIM(v.stake) + '</td>',
                '  <td>',
                '    <div style="display:flex;align-items:center;gap:0.5rem">',
                '      <div class="stake-bar" style="width:80px"><div class="stake-bar-fill" style="width:' + pct + '%"></div></div>',
                '      <span class="td-mono" style="font-size:0.8rem">' + pct.toFixed(1) + '%</span>',
                '    </div>',
                '  </td>',
                '  <td><span class="status-badge status-success"><span class="status-dot"></span>Active</span></td>',
                '</tr>',
            ].join('');
        }).join('') : '<tr><td colspan="5" class="table-empty">No validators found</td></tr>';

        el.innerHTML = [
            '<div class="main-content"><div class="container">',
            '  <div class="page-header">',
            '    <div>',
            '      <h1 class="page-title">Validators</h1>',
            '      <div class="page-subtitle">' + validators.length + ' active validator' + (validators.length !== 1 ? 's' : '') + ' securing the network</div>',
            '    </div>',
            '  </div>',
            '',
            '  <div class="overview-grid">',
            '    <div class="stat-card">',
            '      <div class="stat-card-label">Active Validators</div>',
            '      <div class="stat-card-value">' + validators.length + '</div>',
            '    </div>',
            '    <div class="stat-card">',
            '      <div class="stat-card-label">Total Staked</div>',
            '      <div class="stat-card-value">' + formatPRIM('0x' + totalStake.toString(16)) + '</div>',
            '    </div>',
            '    <div class="stat-card">',
            '      <div class="stat-card-label">Block Height</div>',
            '      <div class="stat-card-value" style="color:var(--text)">' + formatNum(state.latestBlock) + '</div>',
            '    </div>',
            '  </div>',
            '',
            '  <div class="card">',
            '    <div class="card-header"><h2 class="card-title">Validators</h2>' + csvExportBtnHtml('validatorsTable', 'validators.csv') + '</div>',
            '    <div class="table-responsive">',
            '      <table class="data-table" id="validatorsTable">',
            '        <thead><tr>',
            '          <th>#</th><th>Address</th><th>Stake</th><th>Share</th><th>Status</th>',
            '        </tr></thead>',
            '        <tbody>' + rows + '</tbody>',
            '      </table>',
            '    </div>',
            '  </div>',
            '</div></div>',
        ].join('\n');
    }
    pageValidators._page = 'blockchain';

    /* ===========================================
       PAGE: NETWORK INFO
       =========================================== */
    async function pageNetworkInfo(el) {
        await refreshGlobal();

        var contracts = Object.entries(KNOWN_CONTRACTS).map(function(entry) {
            var addr = entry[0];
            var meta = entry[1];
            return { name: meta.name, addr: addr, desc: meta.symbol ? meta.symbol + ' (' + meta.decimals + ' decimals)' : meta.type, type: meta.type };
        });

        var contractRows = contracts.map(function (c) {
            var typeBadge = c.type === 'token' ? 'badge badge-sm badge-secondary' : c.type === 'dex' ? 'badge badge-sm badge-info' : 'badge badge-sm badge-success';
            return [
                '<tr>',
                '  <td style="font-weight:600">' + c.name + '</td>',
                '  <td><a href="#/address/' + escapeHtml(c.addr) + '" class="hash-link">' + escapeHtml(c.addr) + '</a> ' + copyBtnHtml(c.addr) + '</td>',
                '  <td style="color:var(--text-secondary)">' + c.desc + '</td>',
                '  <td><span class="' + typeBadge + '">' + c.type + '</span></td>',
                '</tr>',
            ].join('');
        }).join('');

        el.innerHTML = [
            '<div class="main-content"><div class="container">',
            '  <div class="page-header">',
            '    <div>',
            '      <h1 class="page-title">Network Information</h1>',
            '      <div class="page-subtitle">Prime Chain Testnet configuration and endpoints</div>',
            '    </div>',
            '  </div>',
            '',
            '  <div class="latest-grid" style="margin-bottom:1.5rem">',
            '    <div class="detail-card">',
            '      <div class="detail-card-title">Testnet Configuration</div>',
            '      <div class="detail-row"><div class="detail-label">Network Name</div><div class="detail-value">Prime Chain Testnet</div></div>',
            '      <div class="detail-row"><div class="detail-label">Chain ID</div><div class="detail-value mono">' + CHAIN_ID + ' (0x' + CHAIN_ID.toString(16) + ')</div></div>',
            '      <div class="detail-row"><div class="detail-label">Currency Symbol</div><div class="detail-value">PRIM</div></div>',
            '      <div class="detail-row"><div class="detail-label">Decimals</div><div class="detail-value mono">18</div></div>',
            '      <div class="detail-row"><div class="detail-label">Block Time</div><div class="detail-value">~' + BLOCK_TIME_SECS + ' seconds</div></div>',
            '      <div class="detail-row"><div class="detail-label">Consensus</div><div class="detail-value">Delegated Proof-of-Stake</div></div>',
            '      <div class="detail-row"><div class="detail-label">Current Block</div><div class="detail-value mono">' + formatNum(state.latestBlock) + '</div></div>',
            '      <div class="detail-row"><div class="detail-label">Gas Price</div><div class="detail-value mono">' + formatGwei(state.gasPrice) + '</div></div>',
            '    </div>',
            '    <div class="detail-card">',
            '      <div class="detail-card-title">Endpoints</div>',
            '      <div class="detail-row"><div class="detail-label">JSON-RPC</div><div class="detail-value mono">http://46.225.30.187:8545 ' + copyBtnHtml('http://46.225.30.187:8545') + '</div></div>',
            '      <div class="detail-row"><div class="detail-label">WebSocket</div><div class="detail-value mono">ws://46.225.30.187:8546 ' + copyBtnHtml('ws://46.225.30.187:8546') + '</div></div>',
            '      <div class="detail-row"><div class="detail-label">Explorer</div><div class="detail-value"><a href="http://46.225.30.187" target="_blank">http://46.225.30.187</a></div></div>',
            '      <div class="detail-row"><div class="detail-label">Faucet</div><div class="detail-value"><a href="http://46.225.30.187:4003" target="_blank">http://46.225.30.187:4003</a></div></div>',
            '      <div class="detail-row"><div class="detail-label">PrimeSwap DEX</div><div class="detail-value"><a href="http://46.225.30.187:4000" target="_blank">http://46.225.30.187:4000</a></div></div>',
            '      <div class="detail-row"><div class="detail-label">Validator Dashboard</div><div class="detail-value"><a href="http://46.225.30.187:4001" target="_blank">http://46.225.30.187:4001</a></div></div>',
            '      <div class="detail-row"><div class="detail-label">Grafana</div><div class="detail-value"><a href="http://46.225.30.187:3000" target="_blank">http://46.225.30.187:3000</a></div></div>',
            '      <div class="detail-row"><div class="detail-label">Docs</div><div class="detail-value"><a href="http://46.225.30.187:3001" target="_blank">http://46.225.30.187:3001</a></div></div>',
            '      <div class="detail-row"><div class="detail-label">Status Page</div><div class="detail-value"><a href="http://46.225.30.187:3002" target="_blank">http://46.225.30.187:3002</a></div></div>',
            '      <div style="padding:0.85rem 1.5rem">',
            '        <button id="addMetaMask" class="btn btn-primary" style="padding:0.55rem 1.25rem;font-size:0.85rem;cursor:pointer">🦊 Add to MetaMask</button>',
            '      </div>',
            '    </div>',
            '  </div>',
            '',
            '  <div class="card" style="margin-bottom:1.5rem">',
            '    <div class="card-header"><h2 class="card-title">Deployed Contracts</h2></div>',
            '    <div class="table-responsive">',
            '      <table class="data-table">',
            '        <thead><tr><th>Contract</th><th>Address</th><th>Description</th><th>Type</th></tr></thead>',
            '        <tbody>' + contractRows + '</tbody>',
            '      </table>',
            '    </div>',
            '  </div>',
            '',
            '  <div class="detail-card">',
            '    <div class="detail-card-title">Token Economics</div>',
            '    <div class="detail-row"><div class="detail-label">Max Supply</div><div class="detail-value mono">1,000,000,000 PRIM</div></div>',
            '    <div class="detail-row"><div class="detail-label">Initial Block Reward</div><div class="detail-value mono">10 PRIM</div></div>',
            '    <div class="detail-row"><div class="detail-label">Halving Interval</div><div class="detail-value mono">35,000,000 blocks (~2.22 years)</div></div>',
            '    <div class="detail-row"><div class="detail-label">Block Rewards</div><div class="detail-value">70%</div></div>',
            '    <div class="detail-row"><div class="detail-label">Ecosystem &amp; Grants</div><div class="detail-value">10%</div></div>',
            '    <div class="detail-row"><div class="detail-label">Foundation Reserve</div><div class="detail-value">10%</div></div>',
            '    <div class="detail-row"><div class="detail-label">Team &amp; Contributors</div><div class="detail-value">5%</div></div>',
            '    <div class="detail-row"><div class="detail-label">Sales</div><div class="detail-value">5%</div></div>',
            '  </div>',
            '</div></div>',
        ].join('\n');

        var mmBtn = $('#addMetaMask', el);
        if (mmBtn) {
            mmBtn.addEventListener('click', async function () {
                if (!window.ethereum) {
                    toast('MetaMask not detected', true);
                    return;
                }
                try {
                    await window.ethereum.request({
                        method: 'wallet_addEthereumChain',
                        params: [{
                            chainId: '0x' + CHAIN_ID.toString(16),
                            chainName: 'Prime Chain Testnet',
                            nativeCurrency: { name: 'PRIM', symbol: 'PRIM', decimals: 18 },
                            rpcUrls: ['http://46.225.30.187:8545'],
                            blockExplorerUrls: ['http://46.225.30.187'],
                        }],
                    });
                    toast('Network added to MetaMask!');
                } catch (e) {
                    toast(e.message || 'Failed to add network', true);
                }
            });
        }
    }
    pageNetworkInfo._page = 'network';

    /* ===========================================
       PAGE: GAS TRACKER
       =========================================== */
    async function pageGasTracker(el) {
        await refreshGlobal();

        var scanCount = Math.min(50, state.latestBlock + 1);
        var blocks = await fetchBlocks(state.latestBlock, scanCount, true);

        var baseFees = [];
        var totalGasUsed = 0;
        var totalGasLimit = 0;
        var gasConsumers = {};

        for (var i = 0; i < blocks.length; i++) {
            var b = blocks[i];
            var bf = b.baseFeePerGas || b.base_fee_per_gas || '0x0';
            baseFees.push({ block: hexToInt(b.number), fee: Number(hexToBigInt(bf)) / 1e9 });

            var gu = hexToInt(b.gasUsed || b.gas_used || '0x0');
            var gl = hexToInt(b.gasLimit || b.gas_limit || '0x0');
            totalGasUsed += gu;
            totalGasLimit += gl;

            if (b.transactions && Array.isArray(b.transactions)) {
                for (var t = 0; t < b.transactions.length; t++) {
                    var tx = b.transactions[t];
                    if (typeof tx !== 'object') continue;
                    var to = (tx.to || '').toLowerCase();
                    if (!to) continue;
                    var tgu = hexToInt(txGas(tx) || '0x0');
                    if (!gasConsumers[to]) gasConsumers[to] = { addr: tx.to, gas: 0, txCount: 0 };
                    gasConsumers[to].gas += tgu;
                    gasConsumers[to].txCount++;
                }
            }
        }

        var gasPriceGwei = Number(hexToBigInt(state.gasPrice)) / 1e9;
        var transferCostWei = Number(hexToBigInt(state.gasPrice)) * 21000;
        var transferCostPRIM = transferCostWei / 1e18;

        var avgGasPercent = totalGasLimit > 0 ? ((totalGasUsed / totalGasLimit) * 100).toFixed(2) : '0.00';

        var topConsumers = Object.values(gasConsumers).sort(function (a, b) { return b.gas - a.gas; }).slice(0, 10);

        var maxFee = 0;
        for (var f = 0; f < baseFees.length; f++) {
            if (baseFees[f].fee > maxFee) maxFee = baseFees[f].fee;
        }
        if (maxFee === 0) maxFee = 1;

        var barChartHtml = '<div style="display:flex;align-items:flex-end;gap:2px;height:120px;padding:8px 0">';
        var orderedFees = baseFees.slice().reverse();
        for (var c = 0; c < orderedFees.length; c++) {
            var pct = (orderedFees[c].fee / maxFee) * 100;
            if (pct < 2) pct = 2;
            barChartHtml += '<div title="Block ' + orderedFees[c].block + ': ' + orderedFees[c].fee.toFixed(4) + ' Gwei" style="flex:1;min-width:3px;background:var(--primary,#4901FF);border-radius:2px 2px 0 0;height:' + pct.toFixed(1) + '%;opacity:0.85;transition:opacity 0.15s" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.85"></div>';
        }
        barChartHtml += '</div>';

        var guzzlerRows = '';
        for (var g = 0; g < topConsumers.length; g++) {
            var tc = topConsumers[g];
            var info = contractLabel(tc.addr);
            var nameTag = info ? escapeHtml(info.name) : '<span class="text-muted">Unknown</span>';
            guzzlerRows += '<tr>' +
                '<td>' + (g + 1) + '</td>' +
                '<td><a href="#/address/' + escapeHtml(tc.addr) + '" class="addr-link mono">' + truncAddr(tc.addr) + '</a></td>' +
                '<td>' + nameTag + '</td>' +
                '<td class="mono">' + formatNum(tc.gas) + '</td>' +
                '<td class="mono">' + formatNum(tc.txCount) + '</td>' +
                '</tr>';
        }

        el.innerHTML = [
            '<div class="main-content"><div class="container">',
            '<div class="page-header">',
            '  <div>',
            '    <h1 class="page-title">Gas Tracker</h1>',
            '    <div class="page-subtitle">Current network gas prices and usage statistics</div>',
            '  </div>',
            '</div>',

            '<div class="overview-grid" style="grid-template-columns:repeat(3,1fr)">',
            '  <div class="stat-card" style="background:#00a186;color:#fff;border:none">',
            '    <div style="font-size:0.85rem;opacity:0.9;margin-bottom:8px">🟢 Low</div>',
            '    <div style="font-size:1.5rem;font-weight:700">' + gasPriceGwei.toFixed(2) + ' Gwei</div>',
            '    <div style="font-size:0.8rem;opacity:0.8;margin-top:6px">Transfer: ' + transferCostPRIM.toFixed(8) + ' PRIM</div>',
            '  </div>',
            '  <div class="stat-card" style="background:#0784c3;color:#fff;border:none">',
            '    <div style="font-size:0.85rem;opacity:0.9;margin-bottom:8px">🔵 Average</div>',
            '    <div style="font-size:1.5rem;font-weight:700">' + gasPriceGwei.toFixed(2) + ' Gwei</div>',
            '    <div style="font-size:0.8rem;opacity:0.8;margin-top:6px">Transfer: ' + transferCostPRIM.toFixed(8) + ' PRIM</div>',
            '  </div>',
            '  <div class="stat-card" style="background:#e5a50a;color:#fff;border:none">',
            '    <div style="font-size:0.85rem;opacity:0.9;margin-bottom:8px">🟠 High</div>',
            '    <div style="font-size:1.5rem;font-weight:700">' + gasPriceGwei.toFixed(2) + ' Gwei</div>',
            '    <div style="font-size:0.8rem;opacity:0.8;margin-top:6px">Transfer: ' + transferCostPRIM.toFixed(8) + ' PRIM</div>',
            '  </div>',
            '</div>',

            '<div class="overview-grid" style="grid-template-columns:1fr 1fr;margin-top:24px">',
            '  <div class="stat-card">',
            '    <div class="stat-card-label">Avg Gas Usage (Last ' + scanCount + ' Blocks)</div>',
            '    <div class="stat-card-value">' + avgGasPercent + '%</div>',
            '  </div>',
            '  <div class="stat-card">',
            '    <div class="stat-card-label">Blocks Scanned</div>',
            '    <div class="stat-card-value">' + formatNum(scanCount) + '</div>',
            '  </div>',
            '</div>',

            '<div class="card" style="margin-top:24px">',
            '  <div class="detail-card-title">Base Fee History (Last ' + orderedFees.length + ' Blocks)</div>',
            '  <div style="padding:0 16px 8px">' + barChartHtml + '</div>',
            '  <div style="display:flex;justify-content:space-between;padding:0 16px 16px;font-size:0.75rem;color:#8c98a4">',
            '    <span>Block ' + (orderedFees.length > 0 ? orderedFees[0].block : '—') + '</span>',
            '    <span>Block ' + (orderedFees.length > 0 ? orderedFees[orderedFees.length - 1].block : '—') + '</span>',
            '  </div>',
            '</div>',

            '<div class="card" style="margin-top:24px">',
            '  <div class="detail-card-title">Gas Guzzlers (Top Contracts by Gas Used)</div>',
            topConsumers.length === 0 ?
                '  <div class="table-empty">No contract interactions in recent blocks</div>' :
                [
                    '  <div class="table-responsive"><table class="data-table"><thead><tr>',
                    '    <th>#</th><th>Address</th><th>Name</th><th>Gas Used</th><th>Txns</th>',
                    '  </tr></thead><tbody>',
                    guzzlerRows,
                    '  </tbody></table></div>',
                ].join('\n'),
            '</div>',

            '</div></div>',
        ].join('\n');
    }
    pageGasTracker._page = 'blockchain';

    /* ===========================================
       PAGE: TOKEN TRACKER
       =========================================== */
    async function pageTokenTracker(el) {
        var tokens = [];
        var addrs = Object.keys(KNOWN_CONTRACTS);
        for (var i = 0; i < addrs.length; i++) {
            var info = KNOWN_CONTRACTS[addrs[i]];
            if (info.type === 'token') {
                tokens.push({ addr: addrs[i], name: info.name, symbol: info.symbol || '???', decimals: info.decimals !== undefined ? info.decimals : 18 });
            }
        }

        var supplyPromises = tokens.map(function (tk) {
            return rpc('eth_call', [{ to: tk.addr, data: '0x18160ddd' }, 'latest']).catch(function () { return '0x0'; });
        });
        var supplies = await Promise.all(supplyPromises);

        for (var s = 0; s < tokens.length; s++) {
            var raw = supplies[s] && supplies[s] !== '0x' ? supplies[s] : '0x0';
            var val = hexToBigInt(raw);
            var divisor = 10n ** BigInt(tokens[s].decimals);
            var whole = val / divisor;
            var frac = val % divisor;
            if (frac === 0n) {
                tokens[s].supply = whole.toLocaleString('en-US');
            } else {
                var fracStr = frac.toString().padStart(tokens[s].decimals, '0').replace(/0+$/, '').slice(0, 6);
                tokens[s].supply = whole.toLocaleString('en-US') + '.' + fracStr;
            }
        }

        var rows = '';
        for (var r = 0; r < tokens.length; r++) {
            var tk = tokens[r];
            rows += '<tr data-nav="#/token/' + escapeHtml(tk.addr) + '" style="cursor:pointer">' +
                '<td>' + (r + 1) + '</td>' +
                '<td><a href="#/token/' + escapeHtml(tk.addr) + '" class="hash-link" style="font-weight:600">' + escapeHtml(tk.name) + '</a></td>' +
                '<td><span class="method-tag badge-info">' + escapeHtml(tk.symbol) + '</span></td>' +
                '<td class="mono">' + tk.decimals + '</td>' +
                '<td><a href="#/address/' + escapeHtml(tk.addr) + '" class="addr-link mono">' + truncAddr(tk.addr) + '</a> ' + copyBtnHtml(tk.addr) + '</td>' +
                '<td class="mono">' + escapeHtml(tk.supply) + '</td>' +
                '</tr>';
        }

        el.innerHTML = [
            '<div class="main-content"><div class="container">',
            '<div class="page-header">',
            '  <h1 class="page-title">Token Tracker</h1>',
            '  <p class="page-subtitle">ERC-20 tokens deployed on Prime Chain</p>',
            '</div>',
            '<div class="card">',
            '  <div style="padding:16px;border-bottom:1px solid var(--border,#e9ecef)">',
            '    <input type="text" id="tokenFilter" class="search-input" placeholder="Filter tokens by name or symbol..." style="max-width:400px">',
            '  </div>',
            '  <div class="table-responsive"><table class="data-table" id="tokenTable"><thead><tr>',
            '    <th>#</th><th>Token</th><th>Symbol</th><th>Decimals</th><th>Contract</th><th>Total Supply</th>',
            '  </tr></thead><tbody>',
            rows,
            '  </tbody></table></div>',
            tokens.length === 0 ? '  <div class="table-empty">No tokens found</div>' : '',
            '</div>',
            '</div></div>',
        ].join('\n');

        var filterInput = $('#tokenFilter', el);
        if (filterInput) {
            filterInput.addEventListener('input', function () {
                var query = filterInput.value.toLowerCase();
                var trs = $$('#tokenTable tbody tr', el);
                for (var ti = 0; ti < trs.length; ti++) {
                    var text = trs[ti].textContent.toLowerCase();
                    trs[ti].style.display = text.indexOf(query) !== -1 ? '' : 'none';
                }
            });
        }
    }
    pageTokenTracker._page = 'tokens';

    /* ===========================================
       PAGE: TOKEN DETAIL
       =========================================== */
    async function pageTokenDetail(el, tokenAddr) {
        await refreshGlobal();
        var addrLower = tokenAddr.toLowerCase();
        var meta = KNOWN_CONTRACTS[addrLower];

        var name = '???', symbol = '???', decimals = 18;
        if (meta && meta.type === 'token') {
            name = meta.name; symbol = meta.symbol || '???'; decimals = meta.decimals !== undefined ? meta.decimals : 18;
        }

        var totalSupply = '0';
        try {
            var supplyHex = await rpc('eth_call', [{ to: tokenAddr, data: '0x18160ddd' }, 'latest']);
            if (supplyHex && supplyHex !== '0x') totalSupply = formatTokenAmount(supplyHex, decimals);
        } catch (e) { /* ignore */ }

        var code = '0x';
        try { code = await rpc('eth_getCode', [tokenAddr, 'latest']); } catch (e) { /* ignore */ }
        var isContract = code && code !== '0x' && code !== '0x0' && code.length > 2;

        var holderAddrs = [];
        var allAddrs = Object.keys(KNOWN_CONTRACTS).concat(
            state.validators.map(function(v) { return v.address; }),
            ['0x1a09b94d7dd32cf1903d1745effffae23ce76bca',
             '0x7F5Ce38FB2553E95dd8Ef9182A80Bc219C9a0D45',
             '0x8B86E5bFD9E2c0e6F1F01DEc50A1F3C25c2e2E3c',
             '0xC5feC93d03C6A39ae1c8f18f7FA72bEfA36f1354']
        );
        var seen = {};
        for (var ai = 0; ai < allAddrs.length; ai++) {
            var a = allAddrs[ai];
            if (a && !seen[a.toLowerCase()]) {
                seen[a.toLowerCase()] = true;
                holderAddrs.push(a);
            }
        }

        var balPromises = holderAddrs.map(function(addr) {
            return fetchTokenBalance(tokenAddr, addr).then(function(r) {
                return { addr: addr, balance: r.balance };
            });
        });
        var balResults = await Promise.all(balPromises);
        var holders = [];
        for (var hi = 0; hi < balResults.length; hi++) {
            var bal = hexToBigInt(balResults[hi].balance);
            if (bal > 0n) {
                holders.push({ addr: balResults[hi].addr, balance: balResults[hi].balance, balanceBig: bal });
            }
        }
        holders.sort(function(a, b) { return a.balanceBig > b.balanceBig ? -1 : a.balanceBig < b.balanceBig ? 1 : 0; });

        var totalSupplyBig = 0n;
        try {
            var tsHex = await rpc('eth_call', [{ to: tokenAddr, data: '0x18160ddd' }, 'latest']);
            if (tsHex && tsHex !== '0x') totalSupplyBig = hexToBigInt(tsHex);
        } catch (e) { /* ignore */ }

        var holderRows = holders.length > 0 ? holders.map(function(h, idx) {
            var pct = totalSupplyBig > 0n ? (Number((h.balanceBig * 10000n) / totalSupplyBig) / 100).toFixed(2) : '—';
            var info = contractLabel(h.addr) || {};
            var nameTag = info.name || validatorName(h.addr) || '';
            return '<tr>' +
                '<td>' + (idx + 1) + '</td>' +
                '<td><a href="#/address/' + escapeHtml(h.addr) + '" class="addr-link mono">' + truncAddr(h.addr) + '</a> ' + copyBtnHtml(h.addr) + '</td>' +
                '<td>' + (nameTag ? escapeHtml(nameTag) : '<span class="text-muted">—</span>') + '</td>' +
                '<td class="mono">' + formatTokenAmount(h.balance, decimals) + '</td>' +
                '<td class="mono">' + pct + '%</td>' +
                '</tr>';
        }).join('') : '<tr><td colspan="5" class="table-empty">No holders found among known addresses</td></tr>';

        var transferItems = [];
        var scanDepth = Math.min(200, state.latestBlock + 1);
        var batchSz = 20;
        for (var offset = 0; offset < scanDepth && transferItems.length < 50; offset += batchSz) {
            var blkPromises = [];
            for (var bi = 0; bi < batchSz && state.latestBlock - offset - bi >= 0; bi++) {
                var bnum = state.latestBlock - offset - bi;
                blkPromises.push(rpc('prime_getBlockByNumber', ['0x' + bnum.toString(16), true]).catch(function() { return null; }));
            }
            var blks = (await Promise.all(blkPromises)).filter(Boolean);
            for (var bk = 0; bk < blks.length; bk++) {
                var blk = blks[bk];
                if (!blk.transactions) continue;
                for (var ti = 0; ti < blk.transactions.length; ti++) {
                    var tx = blk.transactions[ti];
                    if (typeof tx !== 'object' || !tx.hash) continue;
                    if (tx.to && tx.to.toLowerCase() === addrLower) {
                        try {
                            var receipt = await rpc('eth_getTransactionReceipt', [tx.hash]);
                            if (receipt && receipt.logs) {
                                for (var li = 0; li < receipt.logs.length; li++) {
                                    var log = receipt.logs[li];
                                    if (log.address && log.address.toLowerCase() === addrLower &&
                                        log.topics && log.topics[0] && log.topics[0].toLowerCase() === TOPIC_TRANSFER.toLowerCase() && log.topics.length >= 3) {
                                        transferItems.push({
                                            txHash: tx.hash,
                                            blockNum: hexToInt(blk.number),
                                            from: '0x' + log.topics[1].slice(26),
                                            to: '0x' + log.topics[2].slice(26),
                                            amount: log.data || '0x0',
                                        });
                                    }
                                }
                            }
                        } catch (e) { /* ignore */ }
                    }
                }
            }
        }

        var transferRows = transferItems.length > 0 ? transferItems.map(function(t) {
            return '<tr>' +
                '<td><a href="#/tx/' + escapeHtml(t.txHash) + '" class="hash-link">' + truncHash(t.txHash) + '</a></td>' +
                '<td><a href="#/block/' + t.blockNum + '" class="hash-link">' + formatNum(t.blockNum) + '</a></td>' +
                '<td class="td-time">' + timeAgo(t.blockNum, state.latestBlock) + '</td>' +
                '<td><a href="#/address/' + escapeHtml(t.from) + '" class="addr-link">' + truncAddr(t.from) + '</a></td>' +
                '<td style="color:#8c98a4;font-size:0.75rem">→</td>' +
                '<td><a href="#/address/' + escapeHtml(t.to) + '" class="addr-link">' + truncAddr(t.to) + '</a></td>' +
                '<td class="td-right mono">' + formatTokenAmount(t.amount, decimals) + '</td>' +
                '</tr>';
        }).join('') : '<tr><td colspan="7" class="table-empty">No transfers found in recent blocks</td></tr>';

        el.innerHTML = [
            '<div class="main-content"><div class="container">',
            '  <a href="#/tokens" class="back-link">' + ICONS.back + ' Back to Token Tracker</a>',
            '  <div class="detail-header">',
            '    <div class="detail-icon" style="background:#e8f0fe;color:#066a9c">' + ICONS.coin + '</div>',
            '    <div class="detail-title-group">',
            '      <div class="detail-title">' + escapeHtml(name) + ' <span class="method-tag badge-info" style="margin-left:8px">' + escapeHtml(symbol) + '</span></div>',
            '      <div class="detail-hash">' + escapeHtml(tokenAddr) + ' ' + copyBtnHtml(tokenAddr) + '</div>',
            '    </div>',
            '  </div>',
            '',
            '  <div class="overview-grid" style="grid-template-columns:repeat(4,1fr)">',
            '    <div class="stat-card"><div class="stat-card-label">Total Supply</div><div class="stat-card-value">' + escapeHtml(totalSupply) + '</div><div class="stat-card-sub">' + escapeHtml(symbol) + '</div></div>',
            '    <div class="stat-card"><div class="stat-card-label">Holders</div><div class="stat-card-value">' + holders.length + '</div><div class="stat-card-sub">Known addresses</div></div>',
            '    <div class="stat-card"><div class="stat-card-label">Decimals</div><div class="stat-card-value">' + decimals + '</div></div>',
            '    <div class="stat-card"><div class="stat-card-label">Transfers</div><div class="stat-card-value">' + transferItems.length + '</div><div class="stat-card-sub">Recent</div></div>',
            '  </div>',
            '',
            meta ? [
                '  <div class="detail-card" style="margin-bottom:1.5rem">',
                '    <div class="detail-card-title">Contract Info</div>',
                '    <div class="detail-row"><div class="detail-label">Contract Name</div><div class="detail-value" style="font-weight:600">' + escapeHtml(meta.name) + '</div></div>',
                '    <div class="detail-row"><div class="detail-label">Compiler</div><div class="detail-value mono">' + escapeHtml(meta.compiler) + '</div></div>',
                '    <div class="detail-row"><div class="detail-label">Source</div><div class="detail-value mono">' + escapeHtml(meta.source) + '</div></div>',
                '    <div class="detail-row"><div class="detail-label">License</div><div class="detail-value">' + escapeHtml(meta.license) + '</div></div>',
                '    <div class="detail-row"><div class="detail-label">Contract Address</div><div class="detail-value"><a href="#/address/' + escapeHtml(tokenAddr) + '" class="addr-link mono">' + escapeHtml(tokenAddr) + '</a></div></div>',
                '  </div>',
            ].join('\n') : '',
            '',
            '  <div class="tab-nav" style="margin-bottom:1rem">',
            '    <button class="tab-btn active" data-tab="holders">Holders (' + holders.length + ')</button>',
            '    <button class="tab-btn" data-tab="transfers">Transfers (' + transferItems.length + ')</button>',
            '  </div>',
            '',
            '  <div id="tab-holders">',
            '    <div class="card">',
            '      <div class="table-responsive"><table class="data-table"><thead><tr>',
            '        <th>#</th><th>Address</th><th>Name</th><th>Balance</th><th>Share</th>',
            '      </tr></thead><tbody>' + holderRows + '</tbody></table></div>',
            '    </div>',
            '  </div>',
            '',
            '  <div id="tab-transfers" style="display:none">',
            '    <div class="card">',
            '      <div class="table-responsive"><table class="data-table"><thead><tr>',
            '        <th>Tx Hash</th><th>Block</th><th>Age</th><th>From</th><th></th><th>To</th><th class="td-right">Amount</th>',
            '      </tr></thead><tbody>' + transferRows + '</tbody></table></div>',
            '    </div>',
            '  </div>',
            '</div></div>',
        ].join('\n');

        el.addEventListener('click', function(e) {
            var tabBtn = e.target.closest('.tab-btn');
            if (!tabBtn) return;
            var tabName = tabBtn.dataset.tab;
            $$('.tab-btn', el).forEach(function(t) { t.classList.remove('active'); });
            tabBtn.classList.add('active');
            var tabHolders = $('#tab-holders', el);
            var tabTransfers = $('#tab-transfers', el);
            if (tabHolders) tabHolders.style.display = tabName === 'holders' ? '' : 'none';
            if (tabTransfers) tabTransfers.style.display = tabName === 'transfers' ? '' : 'none';
        });
    }
    pageTokenDetail._page = 'tokens';

    /* ===========================================
       PAGE: TOP ACCOUNTS
       =========================================== */
    async function pageTopAccounts(el) {
        await refreshGlobal();
        await fetchValidators();

        var addrSet = {};
        var genesisAddrs = [
            '0x1a09b94d7dd32cf1903d1745effffae23ce76bca',
            '0x7F5Ce38FB2553E95dd8Ef9182A80Bc219C9a0D45',
            '0x8B86E5bFD9E2c0e6F1F01DEc50A1F3C25c2e2E3c',
            '0xC5feC93d03C6A39ae1c8f18f7FA72bEfA36f1354',
        ];

        var contractAddrs = Object.keys(KNOWN_CONTRACTS);
        for (var ci = 0; ci < contractAddrs.length; ci++) {
            var ca = contractAddrs[ci].toLowerCase();
            addrSet[ca] = { addr: contractAddrs[ci], type: 'Contract', name: KNOWN_CONTRACTS[contractAddrs[ci]].name };
        }

        for (var vi = 0; vi < state.validators.length; vi++) {
            var va = (state.validators[vi].address || '').toLowerCase();
            if (va) {
                addrSet[va] = { addr: state.validators[vi].address, type: 'Validator', name: state.validators[vi].name || 'Validator ' + (vi + 1) };
            }
        }

        for (var gi = 0; gi < genesisAddrs.length; gi++) {
            var ga = genesisAddrs[gi].toLowerCase();
            if (!addrSet[ga]) {
                addrSet[ga] = { addr: genesisAddrs[gi], type: 'EOA', name: 'Genesis Account' };
            }
        }

        var entries = Object.values(addrSet);
        var balancePromises = entries.map(function (e) {
            return rpc('eth_getBalance', [e.addr, 'latest']).catch(function () { return '0x0'; });
        });
        var balances = await Promise.all(balancePromises);

        var maxSupplyWei = 1000000000n * 1000000000000000000n;
        for (var bi = 0; bi < entries.length; bi++) {
            entries[bi].balanceHex = balances[bi] || '0x0';
            entries[bi].balanceWei = hexToBigInt(balances[bi] || '0x0');
            var pctBig = (entries[bi].balanceWei * 10000n) / maxSupplyWei;
            entries[bi].percentage = (Number(pctBig) / 100).toFixed(2);
        }

        entries.sort(function (a, b) {
            if (a.balanceWei > b.balanceWei) return -1;
            if (a.balanceWei < b.balanceWei) return 1;
            return 0;
        });

        var rows = '';
        for (var ri = 0; ri < entries.length; ri++) {
            var e = entries[ri];
            var typeBadge = e.type === 'Validator' ? 'badge-success' : (e.type === 'Contract' ? 'badge-info' : 'badge-secondary');
            rows += '<tr>' +
                '<td>' + (ri + 1) + '</td>' +
                '<td><a href="#/address/' + escapeHtml(e.addr) + '" class="addr-link mono">' + truncAddr(e.addr) + '</a> ' + copyBtnHtml(e.addr) + '</td>' +
                '<td>' + escapeHtml(e.name) + '</td>' +
                '<td class="mono">' + formatPRIM(e.balanceHex) + '</td>' +
                '<td class="mono">' + e.percentage + '%</td>' +
                '<td><span class="method-tag ' + typeBadge + '">' + escapeHtml(e.type) + '</span></td>' +
                '</tr>';
        }

        el.innerHTML = [
            '<div class="main-content"><div class="container">',
            '<div class="page-header">',
            '  <h1 class="page-title">Top Accounts</h1>',
            '  <p class="page-subtitle">Accounts ranked by PRIM balance</p>',
            '</div>',
            '<div class="overview-grid" style="grid-template-columns:repeat(3,1fr)">',
            '  <div class="stat-card"><div class="stat-card-label">Total Accounts Tracked</div><div class="stat-card-value">' + formatNum(entries.length) + '</div></div>',
            '  <div class="stat-card"><div class="stat-card-label">Known Contracts</div><div class="stat-card-value">' + formatNum(contractAddrs.length) + '</div></div>',
            '  <div class="stat-card"><div class="stat-card-label">Active Validators</div><div class="stat-card-value">' + formatNum(state.validators.length) + '</div></div>',
            '</div>',
            '<div class="card" style="margin-top:24px">',
            '  <div class="table-responsive"><table class="data-table"><thead><tr>',
            '    <th>Rank</th><th>Address</th><th>Name Tag</th><th>Balance</th><th>% of Max Supply</th><th>Type</th>',
            '  </tr></thead><tbody>',
            rows,
            '  </tbody></table></div>',
            entries.length === 0 ? '  <div class="table-empty">No accounts found</div>' : '',
            '</div>',
            '</div></div>',
        ].join('\n');
    }
    pageTopAccounts._page = 'blockchain';

    /* ===========================================
       PAGE: CHARTS & STATS
       =========================================== */
    async function pageCharts(el) {
        await refreshGlobal();
        await fetchValidators();

        var scanCount = Math.min(100, state.latestBlock + 1);
        var blocks = await fetchBlocks(state.latestBlock, scanCount, true);
        blocks.reverse();

        var gasData = [];
        var timeData = [];
        var feeData = [];
        var txCountData = [];
        var blockSizeData = [];
        var prevTimestamp = 0;

        for (var i = 0; i < blocks.length; i++) {
            var b = blocks[i];
            var bNum = hexToInt(b.number);
            var gu = hexToInt(b.gasUsed || b.gas_used || '0x0');
            var gl = hexToInt(b.gasLimit || b.gas_limit || '0x0');
            var pct = gl > 0 ? (gu / gl) * 100 : 0;
            gasData.push({ block: bNum, pct: pct });

            var ts = hexToInt(b.timestamp || '0x0');
            if (prevTimestamp > 0 && ts > 0) {
                timeData.push({ block: bNum, seconds: ts - prevTimestamp });
            }
            prevTimestamp = ts;

            var bf = b.baseFeePerGas || b.base_fee_per_gas || '0x0';
            feeData.push({ block: bNum, fee: Number(hexToBigInt(bf)) / 1e9 });

            var txCount = Array.isArray(b.transactions) ? b.transactions.length : 0;
            txCountData.push({ block: bNum, count: txCount });

            var bSize = hexToInt(b.size || '0x0');
            blockSizeData.push({ block: bNum, size: bSize });
        }

        var totalStake = 0n;
        var validatorStakes = [];
        for (var vi = 0; vi < state.validators.length; vi++) {
            var v = state.validators[vi];
            var s = hexToBigInt(v.stake);
            totalStake += s;
            validatorStakes.push({ name: v.name || truncAddr(v.address), stake: Number(s / 1000000000000000000n) });
        }

        var chartW = 700;
        var chartH = 200;
        var pad = 40;

        function buildBarChart(data, valKey, yLabel, color) {
            if (data.length === 0) return '<div class="table-empty">No data available</div>';
            var maxVal = 0;
            for (var i = 0; i < data.length; i++) { if (data[i][valKey] > maxVal) maxVal = data[i][valKey]; }
            if (maxVal === 0) maxVal = 1;

            var barW = Math.max(2, (chartW - pad * 2) / data.length - 1);
            var bars = '';
            for (var j = 0; j < data.length; j++) {
                var h = (data[j][valKey] / maxVal) * (chartH - pad);
                var x = pad + j * ((chartW - pad * 2) / data.length);
                var y = chartH - pad - h;
                bars += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + Math.max(1, h).toFixed(1) + '" fill="' + color + '" opacity="0.8" rx="1"><title>Block ' + data[j].block + ': ' + data[j][valKey].toFixed(2) + '</title></rect>';
            }

            var yTicks = '';
            for (var t = 0; t <= 4; t++) {
                var yPos = chartH - pad - (t / 4) * (chartH - pad);
                var val = ((t / 4) * maxVal).toFixed(1);
                yTicks += '<text x="' + (pad - 5) + '" y="' + (yPos + 4) + '" text-anchor="end" font-size="10" fill="#8c98a4">' + val + '</text>';
                yTicks += '<line x1="' + pad + '" y1="' + yPos + '" x2="' + (chartW - pad) + '" y2="' + yPos + '" stroke="#e9ecef" stroke-dasharray="3"/>';
            }

            return '<svg viewBox="0 0 ' + chartW + ' ' + (chartH + 20) + '" style="width:100%;height:auto">' +
                yTicks + bars +
                '<text x="' + (chartW / 2) + '" y="' + (chartH + 12) + '" text-anchor="middle" font-size="11" fill="#8c98a4">Block Number</text>' +
                '<text x="12" y="' + (chartH / 2) + '" text-anchor="middle" font-size="11" fill="#8c98a4" transform="rotate(-90,12,' + (chartH / 2) + ')">' + yLabel + '</text>' +
                '</svg>';
        }

        function buildLineChart(data, keyX, keyY, yLabel, color) {
            if (data.length < 2) return '<div class="table-empty">Not enough data</div>';
            var maxVal = 0;
            var minVal = Infinity;
            for (var i = 0; i < data.length; i++) {
                if (data[i][keyY] > maxVal) maxVal = data[i][keyY];
                if (data[i][keyY] < minVal) minVal = data[i][keyY];
            }
            if (maxVal === minVal) { maxVal = minVal + 1; }

            var points = '';
            var areaPoints = '';
            var dots = '';
            for (var j = 0; j < data.length; j++) {
                var x = pad + (j / (data.length - 1)) * (chartW - pad * 2);
                var y = (chartH - pad) - ((data[j][keyY] - minVal) / (maxVal - minVal)) * (chartH - pad - 10);
                points += x.toFixed(1) + ',' + y.toFixed(1) + ' ';
                areaPoints += x.toFixed(1) + ',' + y.toFixed(1) + ' ';
                dots += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="2" fill="' + color + '"><title>Block ' + data[j][keyX] + ': ' + data[j][keyY].toFixed(4) + '</title></circle>';
            }
            var lastX = pad + ((data.length - 1) / (data.length - 1)) * (chartW - pad * 2);
            var firstX = pad;
            areaPoints += lastX.toFixed(1) + ',' + (chartH - pad) + ' ' + firstX.toFixed(1) + ',' + (chartH - pad);

            var yTicks = '';
            for (var t = 0; t <= 4; t++) {
                var yPos = (chartH - pad) - (t / 4) * (chartH - pad - 10);
                var val = (minVal + (t / 4) * (maxVal - minVal)).toFixed(2);
                yTicks += '<text x="' + (pad - 5) + '" y="' + (yPos + 4) + '" text-anchor="end" font-size="10" fill="#8c98a4">' + val + '</text>';
                yTicks += '<line x1="' + pad + '" y1="' + yPos + '" x2="' + (chartW - pad) + '" y2="' + yPos + '" stroke="#e9ecef" stroke-dasharray="3"/>';
            }

            return '<svg viewBox="0 0 ' + chartW + ' ' + (chartH + 20) + '" style="width:100%;height:auto">' +
                yTicks +
                '<polygon fill="' + color + '" fill-opacity="0.1" points="' + areaPoints.trim() + '"/>' +
                '<polyline fill="none" stroke="' + color + '" stroke-width="2" points="' + points.trim() + '"/>' +
                dots +
                '<text x="' + (chartW / 2) + '" y="' + (chartH + 12) + '" text-anchor="middle" font-size="11" fill="#8c98a4">Block Number</text>' +
                '<text x="12" y="' + (chartH / 2) + '" text-anchor="middle" font-size="11" fill="#8c98a4" transform="rotate(-90,12,' + (chartH / 2) + ')">' + yLabel + '</text>' +
                '</svg>';
        }

        function buildDonutChart(items, size) {
            if (items.length === 0) return '<div class="table-empty">No data</div>';
            var total = 0;
            for (var i = 0; i < items.length; i++) total += items[i].stake;
            if (total === 0) return '<div class="table-empty">No stake data</div>';

            var colors = ['#4901FF', '#00a186', '#e5a50a', '#0784c3', '#dc3545', '#6c757d', '#8B5CF6', '#EC4899'];
            var r = size / 2 - 10;
            var cx = size / 2;
            var cy = size / 2;
            var startAngle = 0;
            var paths = '';
            var legendHtml = '';

            for (var j = 0; j < items.length; j++) {
                var pct = items[j].stake / total;
                var angle = pct * Math.PI * 2;
                var endAngle = startAngle + angle;
                var largeArc = angle > Math.PI ? 1 : 0;
                var x1 = cx + r * Math.cos(startAngle);
                var y1 = cy + r * Math.sin(startAngle);
                var x2 = cx + r * Math.cos(endAngle);
                var y2 = cy + r * Math.sin(endAngle);
                var color = colors[j % colors.length];
                paths += '<path d="M' + cx + ',' + cy + ' L' + x1.toFixed(2) + ',' + y1.toFixed(2) + ' A' + r + ',' + r + ' 0 ' + largeArc + ',1 ' + x2.toFixed(2) + ',' + y2.toFixed(2) + ' Z" fill="' + color + '" opacity="0.85"><title>' + escapeHtml(items[j].name) + ': ' + (pct * 100).toFixed(1) + '%</title></path>';
                legendHtml += '<div style="display:flex;align-items:center;gap:8px;padding:4px 0"><span style="width:12px;height:12px;border-radius:3px;background:' + color + ';flex-shrink:0"></span><span style="font-size:0.82rem">' + escapeHtml(items[j].name) + '</span><span class="mono text-muted" style="margin-left:auto;font-size:0.8rem">' + (pct * 100).toFixed(1) + '%</span></div>';
                startAngle = endAngle;
            }
            paths += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r * 0.55) + '" fill="var(--bg-card,#fff)"/>';

            return '<div style="display:flex;align-items:center;gap:32px;flex-wrap:wrap">' +
                '<svg viewBox="0 0 ' + size + ' ' + size + '" style="width:' + size + 'px;height:' + size + 'px;flex-shrink:0">' + paths + '</svg>' +
                '<div style="flex:1;min-width:200px">' + legendHtml + '</div></div>';
        }

        var totalTxInScan = 0;
        for (var tc = 0; tc < txCountData.length; tc++) totalTxInScan += txCountData[tc].count;

        el.innerHTML = [
            '<div class="main-content"><div class="container">',
            '<div class="page-header">',
            '  <h1 class="page-title">Charts &amp; Stats</h1>',
            '  <p class="page-subtitle">Network statistics over the last ' + scanCount + ' blocks</p>',
            '</div>',

            '<div class="overview-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:24px">',
            '  <div class="stat-card"><div class="stat-card-label">Blocks Scanned</div><div class="stat-card-value">' + formatNum(scanCount) + '</div></div>',
            '  <div class="stat-card"><div class="stat-card-label">Transactions</div><div class="stat-card-value">' + formatNum(totalTxInScan) + '</div></div>',
            '  <div class="stat-card"><div class="stat-card-label">Avg Block Time</div><div class="stat-card-value">' + (timeData.length > 0 ? (timeData.reduce(function(a,b){return a+b.seconds},0)/timeData.length).toFixed(2) : '—') + 's</div></div>',
            '  <div class="stat-card"><div class="stat-card-label">Validators</div><div class="stat-card-value">' + state.validators.length + '</div></div>',
            '</div>',

            '<div class="latest-grid" style="margin-bottom:24px">',
            '  <div class="card">',
            '    <div class="detail-card-title">Transactions Per Block</div>',
            '    <div style="padding:16px">' + buildBarChart(txCountData, 'count', 'Tx Count', '#0784c3') + '</div>',
            '  </div>',
            '  <div class="card">',
            '    <div class="detail-card-title">Block Gas Usage (%)</div>',
            '    <div style="padding:16px">' + buildBarChart(gasData, 'pct', 'Gas Used %', 'var(--primary,#4901FF)') + '</div>',
            '  </div>',
            '</div>',

            '<div class="latest-grid" style="margin-bottom:24px">',
            '  <div class="card">',
            '    <div class="detail-card-title">Block Time (seconds)</div>',
            '    <div style="padding:16px">' + buildLineChart(timeData, 'block', 'seconds', 'Seconds', '#00a186') + '</div>',
            '  </div>',
            '  <div class="card">',
            '    <div class="detail-card-title">Base Fee History (Gwei)</div>',
            '    <div style="padding:16px">' + buildLineChart(feeData, 'block', 'fee', 'Gwei', '#e5a50a') + '</div>',
            '  </div>',
            '</div>',

            '<div class="latest-grid" style="margin-bottom:24px">',
            '  <div class="card">',
            '    <div class="detail-card-title">Block Size (bytes)</div>',
            '    <div style="padding:16px">' + buildBarChart(blockSizeData, 'size', 'Bytes', '#dc3545') + '</div>',
            '  </div>',
            '  <div class="card">',
            '    <div class="detail-card-title">Validator Stake Distribution</div>',
            '    <div style="padding:24px">' + buildDonutChart(validatorStakes, 200) + '</div>',
            '  </div>',
            '</div>',

            '</div></div>',
        ].join('\n');
    }
    pageCharts._page = 'blockchain';

    /* ===========================================
       REGISTER ROUTES
       =========================================== */
    route('/',               pageHome);
    route('/blocks',         pageBlocks);
    route('/block/:num',     pageBlockDetail);
    route('/txs',            pageTxs);
    route('/tx/:hash',       pageTxDetail);
    route('/address/:addr',  pageAddress);
    route('/validators',     pageValidators);
    route('/network',        pageNetworkInfo);
    route('/gastracker',     pageGasTracker);
    route('/gas-tracker',    pageGasTracker);
    route('/tokens',         pageTokenTracker);
    route('/token/:addr',    pageTokenDetail);
    route('/accounts',       pageTopAccounts);
    route('/charts',         pageCharts);

    /* ===========================================
       INIT
       =========================================== */
    window.toggleTheme = toggleTheme;

    document.addEventListener('DOMContentLoaded', function () {
        initTheme();

        var themeBtn = document.getElementById('themeToggle');
        if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

        var mobileMenuBtn = document.getElementById('mobileMenuBtn');
        var mobileMenu = document.getElementById('mobileMenu');
        var mobileMenuClose = document.getElementById('mobileMenuClose');
        var mobileMenuOverlay = document.getElementById('mobileMenuOverlay');

        function openMobileMenu() {
            if (mobileMenu) mobileMenu.classList.add('open');
            if (mobileMenuOverlay) mobileMenuOverlay.classList.add('open');
            document.body.style.overflow = 'hidden';
        }
        function closeMobileMenu() {
            if (mobileMenu) mobileMenu.classList.remove('open');
            if (mobileMenuOverlay) mobileMenuOverlay.classList.remove('open');
            document.body.style.overflow = '';
        }
        if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', openMobileMenu);
        if (mobileMenuClose) mobileMenuClose.addEventListener('click', closeMobileMenu);
        if (mobileMenuOverlay) mobileMenuOverlay.addEventListener('click', closeMobileMenu);
        if (mobileMenu) {
            mobileMenu.addEventListener('click', function(e) {
                if (e.target.closest('.mobile-menu-link')) closeMobileMenu();
            });
        }
        window.addEventListener('hashchange', closeMobileMenu);

        if (CUSTOM_RPC) {
            var banner = document.createElement('div');
            banner.style.cssText = 'background:var(--warn,#e6a700);color:#000;padding:8px 16px;text-align:center;font-size:0.85rem;font-weight:500';
            banner.textContent = '\u26A0 Using custom RPC endpoint: ' + RPC_URL;
            var pageContent = document.getElementById('pageContent');
            if (pageContent) pageContent.parentNode.insertBefore(banner, pageContent);
        }

        window.addEventListener('hashchange', dispatch);

        if (!location.hash || location.hash === '#') {
            location.hash = '#/';
        } else {
            dispatch();
        }
    });

})();
