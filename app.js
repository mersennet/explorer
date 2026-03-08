(function () {
    'use strict';

    /* ===========================================
       CONFIGURATION
       =========================================== */
    const RPC_URL = (function () {
        const params = new URLSearchParams(location.search || '');
        if (params.get('rpc')) return params.get('rpc');
        return location.origin + '/rpc';
    })();

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
    };

    /* ===========================================
       KNOWN FUNCTION SELECTORS
       =========================================== */
    const KNOWN_METHODS = {
        '0xa9059cbb': { name: 'transfer',                    badge: 'badge-success' },
        '0x095ea7b3': { name: 'approve',                     badge: 'badge-value' },
        '0x23b872dd': { name: 'transferFrom',                badge: 'badge-success' },
        '0x40c10f19': { name: 'mint',                        badge: 'badge-value' },
        '0xd0e30db0': { name: 'deposit',                     badge: 'badge-value' },
        '0x2e1a7d4d': { name: 'withdraw',                    badge: 'badge-fail' },
        '0x38ed1739': { name: 'swapExactTokensForTokens',    badge: 'badge-txcount' },
        '0x8803dbee': { name: 'swapTokensForExactTokens',    badge: 'badge-txcount' },
        '0xe8e33700': { name: 'addLiquidity',                badge: 'badge-value' },
        '0xbaa2abde': { name: 'removeLiquidity',             badge: 'badge-fail' },
        '0x022c0d9f': { name: 'swap',                        badge: 'badge-txcount' },
        '0x6a627842': { name: 'mint (pair)',                  badge: 'badge-value' },
        '0x89afcb44': { name: 'burn (pair)',                  badge: 'badge-fail' },
        '0xc9c65396': { name: 'createPair',                  badge: 'badge-value' },
    };

    /* ===========================================
       TOKEN EVENT TOPICS
       =========================================== */
    const TOPIC_TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
    const TOPIC_APPROVAL = '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925';

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
    };

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

    function gasBarHtml(used, limit) {
        const u = typeof used === 'string' ? hexToInt(used) : used;
        const l = typeof limit === 'string' ? hexToInt(limit) : limit;
        const pct = l > 0 ? Math.min(100, (u / l) * 100).toFixed(1) : 0;
        return '<div class="gas-bar"><div class="gas-bar-fill" style="width:' + pct + '%"></div></div>';
    }

    function contractLabel(addr) {
        if (!addr) return null;
        return KNOWN_CONTRACTS[addr.toLowerCase()] || null;
    }

    function addrDisplay(addr, withLink) {
        if (!addr) return '—';
        const info = contractLabel(addr);
        const name = info ? '<span style="color:var(--text);font-weight:500;margin-left:4px">(' + escapeHtml(info.name) + ')</span>' : '';
        if (withLink === false) return '<span class="td-addr">' + truncAddr(addr) + '</span>' + name;
        return '<a href="#/address/' + addr + '" class="td-addr">' + truncAddr(addr) + '</a>' + name;
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
            content.innerHTML = '<div class="main"><div class="container"><div class="table-empty">Page not found</div></div></div>';
            return;
        }

        content.innerHTML = '<div class="main"><div class="container">' +
            '<div class="skeleton skeleton-block" style="width:100%;height:120px;margin-bottom:20px"></div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">' +
            '<div class="skeleton skeleton-block" style="height:300px"></div>' +
            '<div class="skeleton skeleton-block" style="height:300px"></div>' +
            '</div></div></div>';

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
            content.innerHTML = '<div class="main"><div class="container"><div class="table-empty">Error loading page: ' + escapeHtml(e.message) + '</div></div></div>';
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
            toast('Enter a block number, tx hash (0x + 64 hex), or address (0x + 40 hex)', true);
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
        el.classList.toggle('error', !!isError);
        el.classList.add('visible');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { el.classList.remove('visible'); }, 3500);
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
       DECODE METHOD
       =========================================== */
    function decodeMethod(input) {
        if (!input || input === '0x' || input.length < 10) return null;
        var selector = input.slice(0, 10).toLowerCase();
        var m = KNOWN_METHODS[selector];
        if (m) return { name: m.name, badge_class: m.badge };
        return { name: selector, badge_class: 'badge-txcount' };
    }

    function methodBadgeHtml(input) {
        var decoded = decodeMethod(input);
        if (!decoded) return '';
        return '<span class="method-badge ' + decoded.badge_class + '">' + escapeHtml(decoded.name) + '</span>';
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
            '<div class="search-box">',
            '  <span class="search-icon">' + ICONS.search + '</span>',
            '  <input type="text" id="' + prefix + 'SearchInput" placeholder="Search by Address / Tx Hash / Block Number" autocomplete="off" spellcheck="false">',
            '  <button id="' + prefix + 'SearchBtn">Search</button>',
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
            '<div class="hero">',
            '  <div class="container">',
            '    <h1 class="hero-title">The Prime Chain Blockchain Explorer</h1>',
            '    <p class="hero-sub">Search transactions, blocks, addresses, and tokens on Prime Chain</p>',
            '    <div class="hero-search">',
            '      ' + searchBarHtml('hero'),
            '    </div>',
            '  </div>',
            '</div>',
            '<div class="main">',
            '  <div class="container">',
            '    <div class="stat-grid">',

            '      <div class="stat-card">',
            '        <div class="stat-card-head"><span class="stat-icon">' + ICONS.layers + '</span><span class="stat-card-label">Block Height</span></div>',
            '        <div class="stat-card-value" id="homeBlockHeight">' + formatNum(state.latestBlock) + '</div>',
            '        <div class="stat-card-sub">~' + BLOCK_TIME_SECS + 's block time</div>',
            '      </div>',

            '      <div class="stat-card">',
            '        <div class="stat-card-head"><span class="stat-icon">' + ICONS.tx + '</span><span class="stat-card-label">Transactions</span></div>',
            '        <div class="stat-card-value">' + formatNum(totalTxCount) + '</div>',
            '        <div class="stat-card-sub">in last ' + blocks.length + ' blocks</div>',
            '      </div>',

            '      <div class="stat-card">',
            '        <div class="stat-card-head"><span class="stat-icon" style="color:var(--accent)">' + ICONS.shield + '</span><span class="stat-card-label">Active Validators</span></div>',
            '        <div class="stat-card-value"><span class="accent">' + validators.length + '</span></div>',
            '        <div class="stat-card-sub">' + formatPRIMShort('0x' + totalStake.toString(16)) + ' PRIM staked</div>',
            '      </div>',

            '      <div class="stat-card">',
            '        <div class="stat-card-head"><span class="stat-icon">' + ICONS.gas + '</span><span class="stat-card-label">Gas Price</span></div>',
            '        <div class="stat-card-value">' + formatGwei(state.gasPrice) + '</div>',
            '        <div class="stat-card-sub">current base fee</div>',
            '      </div>',

            '      <div class="stat-card">',
            '        <div class="stat-card-head"><span class="stat-icon">' + ICONS.coin + '</span><span class="stat-card-label">Max Supply</span></div>',
            '        <div class="stat-card-value">' + MAX_SUPPLY + '</div>',
            '        <div class="stat-card-sub">PRIM</div>',
            '      </div>',

            '      <div class="stat-card">',
            '        <div class="stat-card-head"><span class="stat-icon">' + ICONS.zap + '</span><span class="stat-card-label">TPS</span></div>',
            '        <div class="stat-card-value" id="homeTps">' + tps + '</div>',
            '        <div class="stat-card-sub">txs / second estimate</div>',
            '      </div>',

            '    </div>',

            '    <div class="dashboard-grid">',
            '      <div class="panel">',
            '        <div class="panel-head">',
            '          <span class="panel-title">Latest Blocks</span>',
            '          <a href="#/blocks" class="panel-action">View All</a>',
            '        </div>',
            '        <div class="panel-body" id="homeBlocks">',
                       blocks.map(function (block) { return blockPanelItem(block, false); }).join(''),
            '        </div>',
            '      </div>',
            '      <div class="panel">',
            '        <div class="panel-head">',
            '          <span class="panel-title">Latest Transactions</span>',
            '          <a href="#/txs" class="panel-action">View All</a>',
            '        </div>',
            '        <div class="panel-body" id="homeTxs">',
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
                        var items = container.querySelectorAll('.panel-item');
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
                                    var txItems = txContainer.querySelectorAll('.panel-item');
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
            '<div class="panel-item' + (isNew ? ' new-item' : '') + '" data-nav="#/block/' + num + '" style="cursor:pointer">',
            '  <div class="panel-item-icon">' + ICONS.cube + '</div>',
            '  <div class="panel-item-main">',
            '    <div class="panel-item-row">',
            '      <a href="#/block/' + num + '" class="td-hash" style="font-size:0.85rem">' + formatNum(num) + '</a>',
            '      <span class="panel-item-badge badge-txcount">' + txCount + ' txn' + (txCount !== 1 ? 's' : '') + '</span>',
            '    </div>',
            '    <div class="panel-item-secondary">',
            '      Proposer ' + (proposer ? '<a href="#/address/' + proposer + '" class="td-addr" style="font-size:0.75rem">' + escapeHtml(proposerLabel) + '</a>' : '—') + ' · Gas ' + formatGas(b.gasUsed || b.gas_used || '0x0'),
            '    </div>',
            '  </div>',
            '  <div class="panel-item-right">',
            '    <div class="panel-item-time">' + timeAgo(num, state.latestBlock) + '</div>',
            '  </div>',
            '</div>',
        ].join('');
    }

    function txPanelItem(tx, isNew) {
        var value = formatPRIMShort(tx.value || '0x0');
        var method = methodBadgeHtml(tx.input);
        return [
            '<div class="panel-item' + (isNew ? ' new-item' : '') + '" data-nav="#/tx/' + tx.hash + '" style="cursor:pointer">',
            '  <div class="panel-item-icon">' + ICONS.tx + '</div>',
            '  <div class="panel-item-main">',
            '    <div class="panel-item-row">',
            '      <a href="#/tx/' + tx.hash + '" class="td-hash mono">' + truncHash(tx.hash) + '</a>',
            '      ' + method,
            '    </div>',
            '    <div class="panel-item-secondary">',
            '      From ' + addrDisplay(tx.from) + ' ' + ICONS.arrow + ' ',
            '      ' + (tx.to ? addrDisplay(tx.to) : '<span style="color:var(--warn)">Contract Create</span>'),
            '    </div>',
            '  </div>',
            '  <div class="panel-item-right">',
            '    <span class="panel-item-badge badge-value">' + value + ' PRIM</span>',
            '    <div class="panel-item-time">' + (tx._blockNum !== undefined ? timeAgo(tx._blockNum, state.latestBlock) : '') + '</div>',
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
            return [
                '<tr data-nav="#/block/' + num + '" style="cursor:pointer">',
                '  <td><a href="#/block/' + num + '" class="td-hash">' + formatNum(num) + '</a></td>',
                '  <td class="td-time">' + timeAgo(num, state.latestBlock) + '</td>',
                '  <td><span class="badge-txcount" style="padding:2px 6px;border-radius:4px;font-size:0.75rem">' + txCount + '</span></td>',
                '  <td>',
                '    <div style="display:flex;align-items:center;gap:0.5rem">',
                '      <span class="td-mono">' + formatGas(b.gasUsed || b.gas_used || '0x0') + '</span>',
                '      <div class="gas-bar" style="width:60px"><div class="gas-bar-fill" style="width:' + gasPercent + '%"></div></div>',
                '      <span style="font-size:0.7rem;color:var(--text-dim)">' + gasPercent + '%</span>',
                '    </div>',
                '  </td>',
                '  <td class="td-mono">' + formatGas(b.gasLimit || b.gas_limit || '0x0') + '</td>',
                '  <td class="td-mono">' + (b.baseFeePerGas || b.base_fee ? formatGwei(b.baseFeePerGas || b.base_fee) : '—') + '</td>',
                '</tr>',
            ].join('');
        }).join('');

        el.innerHTML = [
            '<div class="main"><div class="container">',
            '  <div class="page-head">',
            '    <div>',
            '      <h1 class="page-title">Blocks</h1>',
            '      <div class="page-sub">Block #' + formatNum(state.latestBlock) + ' (total ' + formatNum(state.latestBlock + 1) + ' blocks)</div>',
            '    </div>',
            '  </div>',
            '  <div class="table-wrap">',
            '    <div class="overflow-x">',
            '      <table class="data-table">',
            '        <thead><tr>',
            '          <th>Block</th><th>Age</th><th>Txn</th><th>Gas Used</th><th>Gas Limit</th><th>Base Fee</th>',
            '        </tr></thead>',
            '        <tbody>' + (rows || '<tr><td colspan="6" class="table-empty">No blocks</td></tr>') + '</tbody>',
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
            el.innerHTML = '<div class="main"><div class="container"><div class="table-empty">Block not found</div></div></div>';
            return;
        }

        var txCount = Array.isArray(block.transactions) ? block.transactions.length : 0;
        var gasUsed = hexToInt(block.gasUsed || block.gas_used || '0x0');
        var gasLimit = hexToInt(block.gasLimit || block.gas_limit || '0x0');
        var gasPercent = gasLimit > 0 ? ((gasUsed / gasLimit) * 100).toFixed(1) : '0.0';
        var proposer = block.miner || block.proposer || '';
        var proposerLabel = validatorName(proposer);

        var txRows = '';
        if (txCount > 0) {
            txRows = block.transactions.map(function (t) {
                var tx = typeof t === 'object' ? t : { hash: t };
                return [
                    '<tr>',
                    '  <td><a href="#/tx/' + tx.hash + '" class="td-hash">' + truncHash(tx.hash) + '</a></td>',
                    '  <td>' + methodBadgeHtml(tx.input) + '</td>',
                    '  <td>' + (tx.from ? '<a href="#/address/' + tx.from + '" class="td-addr">' + truncAddr(tx.from) + '</a>' : '—') + '</td>',
                    '  <td style="color:var(--text-dim);font-size:0.75rem">→</td>',
                    '  <td>' + (tx.to ? addrDisplay(tx.to) : '<span style="color:var(--warn)">Contract Create</span>') + '</td>',
                    '  <td class="td-right td-mono">' + formatPRIMShort(tx.value || '0x0') + ' PRIM</td>',
                    '</tr>',
                ].join('');
            }).join('');
        }

        el.innerHTML = [
            '<div class="main"><div class="container">',
            '  <a href="#/blocks" class="back-link">' + ICONS.back + ' Back to Blocks</a>',
            '  <div class="detail-header">',
            '    <div class="detail-icon">' + ICONS.cube + '</div>',
            '    <div class="detail-title-group">',
            '      <div class="detail-title">',
            '        Block #' + formatNum(num),
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
            '    <div class="detail-row"><div class="detail-label">Block Height</div><div class="detail-val">' + formatNum(num) + '</div></div>',
            '    <div class="detail-row"><div class="detail-label">Status</div><div class="detail-val"><span class="status status-success"><span class="status-dot"></span>Finalized</span></div></div>',
            '    <div class="detail-row"><div class="detail-label">Timestamp</div><div class="detail-val">' + (formatTimestamp(block.timestamp) || timeAgo(num, state.latestBlock)) + '</div></div>',
            '    <div class="detail-row"><div class="detail-label">Proposer</div><div class="detail-val">' + (proposer ? '<a href="#/address/' + proposer + '" class="td-addr">' + proposer + '</a>' + (proposerLabel ? ' <span style="color:var(--text-secondary)">(' + escapeHtml(proposerLabel) + ')</span>' : '') + ' ' + copyBtnHtml(proposer) : '—') + '</div></div>',
            '    <div class="detail-row"><div class="detail-label">Transactions</div><div class="detail-val"><a href="#/block/' + num + '#txs">' + txCount + ' transaction' + (txCount !== 1 ? 's' : '') + '</a> in this block</div></div>',
            '    <div class="detail-row">',
            '      <div class="detail-label">Gas Used</div>',
            '      <div class="detail-val">',
            '        <span class="td-mono">' + formatNum(gasUsed) + '</span>',
            '        <span style="color:var(--text-muted);margin:0 0.5rem">(' + gasPercent + '%)</span>',
            '        <div class="gas-bar" style="width:120px;display:inline-block;vertical-align:middle"><div class="gas-bar-fill" style="width:' + gasPercent + '%"></div></div>',
            '      </div>',
            '    </div>',
            '    <div class="detail-row"><div class="detail-label">Gas Limit</div><div class="detail-val mono">' + formatNum(gasLimit) + '</div></div>',
            '    <div class="detail-row"><div class="detail-label">Base Fee</div><div class="detail-val mono">' + (block.baseFeePerGas || block.base_fee ? formatGwei(block.baseFeePerGas || block.base_fee) : '—') + '</div></div>',
            '    <div class="detail-row"><div class="detail-label">Block Hash</div><div class="detail-val mono">' + (block.hash || '—') + ' ' + (block.hash ? copyBtnHtml(block.hash) : '') + '</div></div>',
            '    <div class="detail-row"><div class="detail-label">Parent Hash</div><div class="detail-val mono">' + ((block.parentHash || block.parent_hash) ? '<a href="#/block/' + (num - 1) + '" class="td-hash">' + truncHash(block.parentHash || block.parent_hash, 14, 10) + '</a> ' + copyBtnHtml(block.parentHash || block.parent_hash) : '—') + '</div></div>',
            '    <div class="detail-row"><div class="detail-label">State Root</div><div class="detail-val mono">' + (block.stateRoot || block.state_root || '—') + ' ' + (block.stateRoot || block.state_root ? copyBtnHtml(block.stateRoot || block.state_root) : '') + '</div></div>',
            '  </div>',
            '',
            txCount > 0 ? [
                '  <div class="detail-card" id="txs">',
                '    <div class="detail-card-title">Transactions (' + txCount + ')</div>',
                '    <div class="overflow-x">',
                '      <table class="data-table">',
                '        <thead><tr>',
                '          <th>Tx Hash</th><th>Method</th><th>From</th><th></th><th>To</th><th class="td-right">Value</th>',
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
            return [
                '<tr>',
                '  <td><a href="#/tx/' + tx.hash + '" class="td-hash">' + truncHash(tx.hash) + '</a></td>',
                '  <td>' + methodBadgeHtml(tx.input) + '</td>',
                '  <td><a href="#/block/' + tx._blockNum + '" class="td-hash">' + formatNum(tx._blockNum) + '</a></td>',
                '  <td class="td-time">' + timeAgo(tx._blockNum, state.latestBlock) + '</td>',
                '  <td><a href="#/address/' + tx.from + '" class="td-addr">' + truncAddr(tx.from) + '</a></td>',
                '  <td style="color:var(--text-dim);font-size:0.75rem">→</td>',
                '  <td>' + (tx.to ? addrDisplay(tx.to) : '<span style="color:var(--warn)">Contract Create</span>') + '</td>',
                '  <td class="td-right td-mono">' + formatPRIMShort(tx.value || '0x0') + ' PRIM</td>',
                '</tr>',
            ].join('');
        }).join('');

        el.innerHTML = [
            '<div class="main"><div class="container">',
            '  <div class="page-head">',
            '    <div>',
            '      <h1 class="page-title">Transactions</h1>',
            '      <div class="page-sub">' + formatNum(txs.length) + ' transactions found (from recent blocks)</div>',
            '    </div>',
            '  </div>',
            '  <div class="table-wrap">',
            '    <div class="overflow-x">',
            '      <table class="data-table">',
            '        <thead><tr>',
            '          <th>Tx Hash</th><th>Method</th><th>Block</th><th>Age</th><th>From</th><th></th><th>To</th><th class="td-right">Value</th>',
            '        </tr></thead>',
            '        <tbody>',
                       rows || '<tr><td colspan="8" class="table-empty">No transactions found in recent blocks</td></tr>',
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
            el.innerHTML = '<div class="main"><div class="container"><div class="table-empty">Transaction not found</div></div></div>';
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

        var toDisplay = '';
        if (tx.to) {
            var contractInfo = contractLabel(tx.to);
            toDisplay = '<a href="#/address/' + tx.to + '" class="td-addr">' + tx.to + '</a>';
            if (contractInfo) toDisplay += ' <span class="status status-success" style="margin-left:0.5rem"><span class="status-dot"></span>' + escapeHtml(contractInfo.name) + '</span>';
            toDisplay += ' ' + copyBtnHtml(tx.to);
        } else {
            var contractAddr = receipt ? (receipt.contract_address || receipt.contractAddress) : null;
            toDisplay = '<span style="color:var(--warn)">Contract Creation</span>';
            if (contractAddr) {
                toDisplay += ' → <a href="#/address/' + contractAddr + '" class="td-hash">' + contractAddr + '</a> ' + copyBtnHtml(contractAddr);
            }
        }

        var decoded = decodeMethod(tx.input);
        var inputSection = '';
        if (tx.input && tx.input !== '0x') {
            inputSection = [
                '<div class="detail-row">',
                '  <div class="detail-label">Input Data</div>',
                '  <div class="detail-val">',
                '    ' + (decoded ? '<span class="method-badge ' + decoded.badge_class + '" style="margin-bottom:0.5rem;display:inline-block">' + escapeHtml(decoded.name) + '</span><br>' : ''),
                '    <div class="mono" style="font-size:0.75rem;word-break:break-all;max-height:120px;overflow-y:auto;padding:0.5rem;background:var(--bg-surface);border-radius:var(--radius-xs);margin-top:0.25rem">' + escapeHtml(tx.input) + '</div>',
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
                    '  <span class="method-badge badge-success" style="flex-shrink:0">Transfer</span>',
                    '  <span>From</span> <a href="#/address/' + t.from + '" class="td-addr">' + truncAddr(t.from) + '</a>',
                    '  <span class="transfer-arrow" style="color:var(--accent)">→</span>',
                    '  <span>To</span> <a href="#/address/' + t.to + '" class="td-addr">' + truncAddr(t.to) + '</a>',
                    '  <span style="margin-left:auto" class="td-mono"><span style="color:var(--accent);font-weight:600">' + formattedAmount + '</span> <a href="#/address/' + t.tokenAddr + '" class="td-addr">' + escapeHtml(t.symbol) + '</a></span>',
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
                    '    <a href="#/address/' + logAddr + '" class="td-addr" style="font-size:0.8rem">' + logAddr + '</a>',
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
            '<div class="main"><div class="container">',
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
            '    <div class="detail-row"><div class="detail-label">Status</div><div class="detail-val"><span class="status status-' + status + '"><span class="status-dot"></span>' + statusLabel + '</span></div></div>',
            '    <div class="detail-row"><div class="detail-label">Block</div><div class="detail-val">' + (blockNum !== null ? '<a href="#/block/' + blockNum + '" class="td-hash">' + formatNum(blockNum) + '</a>' : '—') + '</div></div>',
            '    <div class="detail-row"><div class="detail-label">Timestamp</div><div class="detail-val">' + (blockNum !== null ? timeAgo(blockNum, state.latestBlock) : '—') + '</div></div>',
            '    <div class="detail-row"><div class="detail-label">From</div><div class="detail-val mono"><a href="#/address/' + tx.from + '" class="td-addr">' + tx.from + '</a> ' + copyBtnHtml(tx.from) + '</div></div>',
            '    <div class="detail-row"><div class="detail-label">To</div><div class="detail-val mono">' + toDisplay + '</div></div>',
            '    <div class="detail-row"><div class="detail-label">Value</div><div class="detail-val mono">' + formatPRIM(tx.value || '0x0') + '</div></div>',
            '    <div class="detail-row"><div class="detail-label">Transaction Fee</div><div class="detail-val mono">' + (receipt ? formatPRIM(feeHex) : '—') + '</div></div>',
            '    <div class="detail-row"><div class="detail-label">Gas Price</div><div class="detail-val mono">' + formatGwei(txGasPriceVal) + '</div></div>',
            '    <div class="detail-row">',
            '      <div class="detail-label">Gas Limit &amp; Usage</div>',
            '      <div class="detail-val">',
            '        <span class="td-mono">' + formatNum(txGasLimit) + '</span>',
            '        <span style="color:var(--text-muted);margin:0 0.35rem">|</span>',
            '        <span class="td-mono">' + formatNum(rcptGasUsed) + '</span>',
            '        <span style="color:var(--text-muted);margin:0 0.35rem">(' + gasBarPercent + '%)</span>',
            '        <div class="gas-bar" style="width:100px;display:inline-block;vertical-align:middle"><div class="gas-bar-fill" style="width:' + gasBarPercent + '%"></div></div>',
            '      </div>',
            '    </div>',
            '    <div class="detail-row"><div class="detail-label">Nonce</div><div class="detail-val mono">' + (tx.nonce !== undefined ? hexToInt(tx.nonce) : '—') + '</div></div>',
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

        var isContract = code && code !== '0x' && code !== '0x0' && code.length > 2;
        var isValidator = state.validators.some(function (v) { return v.address && v.address.toLowerCase() === addrLower; });
        var validatorInfo = state.validators.find(function (v) { return v.address && v.address.toLowerCase() === addrLower; });
        var verified = KNOWN_CONTRACTS[addrLower];

        var badges = '';
        if (isValidator) badges += '<span class="status status-success" style="margin-left:0.5rem"><span class="status-dot"></span>Validator</span>';
        if (verified) badges += '<span class="status status-success" style="margin-left:0.5rem"><span class="status-dot"></span>Verified: ' + escapeHtml(verified.name) + '</span>';
        if (isContract && !verified) badges += '<span class="status status-pending" style="margin-left:0.5rem"><span class="status-dot"></span>Contract</span>';

        var typeLabel = isValidator ? 'Validator' : isContract ? 'Contract' : 'EOA';

        var overviewCards = [
            '<div class="address-overview">',
            '  <div class="stat-card">',
            '    <div class="stat-card-label">Balance</div>',
            '    <div class="stat-card-value" style="font-size:1.1rem">' + formatPRIM(balance) + '</div>',
            '  </div>',
            '  <div class="stat-card">',
            '    <div class="stat-card-label">Transactions</div>',
            '    <div class="stat-card-value">' + formatNum(hexToInt(txCount)) + '</div>',
            '    <div class="stat-card-sub">nonce</div>',
            '  </div>',
            '  <div class="stat-card">',
            '    <div class="stat-card-label">Type</div>',
            '    <div class="stat-card-value" style="font-size:1.1rem">' + typeLabel + '</div>',
            isValidator && validatorInfo ? '<div class="stat-card-sub">' + formatPRIMShort(validatorInfo.stake) + ' PRIM staked</div>' : '',
            '  </div>',
            '</div>',
        ].join('\n');

        var contractInfoSection = '';
        if (verified) {
            contractInfoSection = [
                '<div class="detail-card" style="margin-bottom:1.5rem">',
                '  <div class="detail-card-title" style="color:var(--accent)">✓ Verified Contract</div>',
                '  <div class="detail-row"><div class="detail-label">Contract Name</div><div class="detail-val" style="font-weight:600">' + escapeHtml(verified.name) + '</div></div>',
                '  <div class="detail-row"><div class="detail-label">Compiler</div><div class="detail-val mono">' + escapeHtml(verified.compiler) + '</div></div>',
                '  <div class="detail-row"><div class="detail-label">Source File</div><div class="detail-val mono">' + escapeHtml(verified.source) + '</div></div>',
                '  <div class="detail-row"><div class="detail-label">License</div><div class="detail-val">' + escapeHtml(verified.license) + '</div></div>',
                '  <div class="detail-row"><div class="detail-label">Optimization</div><div class="detail-val">Enabled (200 runs, via-ir)</div></div>',
                '  <div class="detail-row"><div class="detail-label">EVM Version</div><div class="detail-val">Shanghai</div></div>',
                '  <div class="detail-row"><div class="detail-label">Source Code</div><div class="detail-val"><a href="https://github.com/PrimeNumbersLabs/prime-chain/tree/main/' + escapeHtml(verified.source) + '" target="_blank" rel="noopener">View on GitHub →</a></div></div>',
                '</div>',
            ].join('\n');
        }

        var tabBar = '';
        var hasTabs = isContract;
        if (hasTabs) {
            tabBar = [
                '<div class="tab-bar" style="margin-bottom:1rem">',
                '  <button class="tab-btn active" data-tab="txs">Transactions</button>',
                '  <button class="tab-btn" data-tab="contract">Contract</button>',
                '</div>',
            ].join('');
        }

        var addressTxs = [];
        var scanBlocks = Math.min(100, state.latestBlock + 1);
        var batchSize = 10;
        for (var offset = 0; offset < scanBlocks && addressTxs.length < 25; offset += batchSize) {
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
            return [
                '<tr>',
                '  <td><a href="#/tx/' + tx.hash + '" class="td-hash">' + truncHash(tx.hash) + '</a></td>',
                '  <td>' + methodBadgeHtml(tx.input) + '</td>',
                '  <td><a href="#/block/' + tx._blockNum + '" class="td-hash">' + formatNum(tx._blockNum) + '</a></td>',
                '  <td class="td-time">' + timeAgo(tx._blockNum, state.latestBlock) + '</td>',
                '  <td>' + addrDisplay(tx.from) + '</td>',
                '  <td><span class="status ' + (isFrom ? 'status-fail' : 'status-success') + '" style="font-size:0.7rem">' + (isFrom ? 'OUT' : 'IN') + '</span></td>',
                '  <td>' + (tx.to ? addrDisplay(tx.to) : '<span style="color:var(--warn)">Contract Create</span>') + '</td>',
                '  <td class="td-right td-mono">' + formatPRIMShort(tx.value || '0x0') + ' PRIM</td>',
                '</tr>',
            ].join('');
        }).join('') : '<tr><td colspan="8" class="table-empty">No transactions found for this address in recent blocks</td></tr>';

        var txTableHtml = [
            '<div id="tab-txs">',
            '  <div class="table-wrap">',
            '    <div class="overflow-x">',
            '      <table class="data-table">',
            '        <thead><tr>',
            '          <th>Tx Hash</th><th>Method</th><th>Block</th><th>Age</th><th>From</th><th></th><th>To</th><th class="td-right">Value</th>',
            '        </tr></thead>',
            '        <tbody>' + txRows + '</tbody>',
            '      </table>',
            '    </div>',
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

        el.innerHTML = [
            '<div class="main"><div class="container">',
            '  <a href="#/" class="back-link">' + ICONS.back + ' Back to Home</a>',
            '  <div class="detail-header">',
            '    <div class="detail-icon">' + (isValidator ? ICONS.shield : isContract ? ICONS.code : ICONS.user) + '</div>',
            '    <div class="detail-title-group">',
            '      <div class="detail-title">Address ' + badges + '</div>',
            '      <div class="detail-hash">' + addr + ' ' + copyBtnHtml(addr) + '</div>',
            '    </div>',
            '  </div>',
            '',
            overviewCards,
            contractInfoSection,
            tabBar,
            txTableHtml,
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
                var tabContract = $('#tab-contract', el);
                if (tabName === 'txs') {
                    if (tabTxs) tabTxs.style.display = '';
                    if (tabContract) tabContract.style.display = 'none';
                } else {
                    if (tabTxs) tabTxs.style.display = 'none';
                    if (tabContract) tabContract.style.display = '';
                }
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
                '  <td><a href="#/address/' + v.address + '" class="td-hash">' + v.address + '</a> ' + copyBtnHtml(v.address) + '</td>',
                '  <td class="td-mono">' + formatPRIM(v.stake) + '</td>',
                '  <td>',
                '    <div style="display:flex;align-items:center;gap:0.5rem">',
                '      <div class="stake-bar" style="width:80px"><div class="stake-bar-fill" style="width:' + pct + '%"></div></div>',
                '      <span class="td-mono" style="font-size:0.8rem">' + pct.toFixed(1) + '%</span>',
                '    </div>',
                '  </td>',
                '  <td><span class="status status-success"><span class="status-dot"></span>Active</span></td>',
                '</tr>',
            ].join('');
        }).join('') : '<tr><td colspan="5" class="table-empty">No validators found</td></tr>';

        el.innerHTML = [
            '<div class="main"><div class="container">',
            '  <div class="page-head">',
            '    <div>',
            '      <h1 class="page-title">Validators</h1>',
            '      <div class="page-sub">' + validators.length + ' active validator' + (validators.length !== 1 ? 's' : '') + ' securing the network</div>',
            '    </div>',
            '  </div>',
            '',
            '  <div class="validator-summary">',
            '    <div class="validator-card">',
            '      <div class="validator-card-label">Active Validators</div>',
            '      <div class="validator-card-value">' + validators.length + '</div>',
            '    </div>',
            '    <div class="validator-card">',
            '      <div class="validator-card-label">Total Staked</div>',
            '      <div class="validator-card-value">' + formatPRIM('0x' + totalStake.toString(16)) + '</div>',
            '    </div>',
            '    <div class="validator-card">',
            '      <div class="validator-card-label">Block Height</div>',
            '      <div class="validator-card-value" style="color:var(--text)">' + formatNum(state.latestBlock) + '</div>',
            '    </div>',
            '  </div>',
            '',
            '  <div class="table-wrap">',
            '    <div class="overflow-x">',
            '      <table class="data-table">',
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

        var contracts = [
            { name: 'Multicall3',       addr: '0x973ee1bf0907287d1eb8a144d88b34f515c83f29', desc: 'Batch RPC calls',              type: 'utility' },
            { name: 'WPRIM',            addr: '0x079bf1207b51acda83e2e8178344f62a883f8479', desc: 'Wrapped PRIM (ERC-20)',         type: 'token' },
            { name: 'MockUSDC',         addr: '0xb22f77d89122e9e3784bfd3eee9616273f38238d', desc: 'Testnet USDC (6 decimals)',     type: 'token' },
            { name: 'MockUSDT',         addr: '0x877feca38919acd7aaf7cb81f100e0454aa95c17', desc: 'Testnet USDT (6 decimals)',     type: 'token' },
            { name: 'MockDAI',          addr: '0xb88d63a65691effbf4b6808325b1588912c15cf4', desc: 'Testnet DAI (18 decimals)',     type: 'token' },
            { name: 'PrimeSwapFactory', addr: '0x63f7a64db6d2b965189b8b48b7435668021f6b17', desc: 'DEX pair factory',             type: 'dex' },
            { name: 'PrimeSwapRouter',  addr: '0x9f337f433e71ce969b991511f1dcd3d0622116bb', desc: 'DEX swap router',              type: 'dex' },
        ];

        var contractRows = contracts.map(function (c) {
            var typeBadge = c.type === 'token' ? 'badge-value' : c.type === 'dex' ? 'badge-txcount' : 'badge-success';
            return [
                '<tr>',
                '  <td style="font-weight:600">' + c.name + '</td>',
                '  <td><a href="#/address/' + c.addr + '" class="td-hash">' + c.addr + '</a> ' + copyBtnHtml(c.addr) + '</td>',
                '  <td style="color:var(--text-secondary)">' + c.desc + '</td>',
                '  <td><span class="panel-item-badge ' + typeBadge + '">' + c.type + '</span></td>',
                '</tr>',
            ].join('');
        }).join('');

        el.innerHTML = [
            '<div class="main"><div class="container">',
            '  <div class="page-head">',
            '    <div>',
            '      <h1 class="page-title">Network Information</h1>',
            '      <div class="page-sub">Prime Chain Testnet configuration and endpoints</div>',
            '    </div>',
            '  </div>',
            '',
            '  <div class="dashboard-grid" style="margin-bottom:1.5rem">',
            '    <div class="detail-card">',
            '      <div class="detail-card-title">Testnet Configuration</div>',
            '      <div class="detail-row"><div class="detail-label">Network Name</div><div class="detail-val">Prime Chain Testnet</div></div>',
            '      <div class="detail-row"><div class="detail-label">Chain ID</div><div class="detail-val mono">' + CHAIN_ID + ' (0x' + CHAIN_ID.toString(16) + ')</div></div>',
            '      <div class="detail-row"><div class="detail-label">Currency Symbol</div><div class="detail-val">PRIM</div></div>',
            '      <div class="detail-row"><div class="detail-label">Decimals</div><div class="detail-val mono">18</div></div>',
            '      <div class="detail-row"><div class="detail-label">Block Time</div><div class="detail-val">~' + BLOCK_TIME_SECS + ' seconds</div></div>',
            '      <div class="detail-row"><div class="detail-label">Consensus</div><div class="detail-val">Delegated Proof-of-Stake</div></div>',
            '      <div class="detail-row"><div class="detail-label">Current Block</div><div class="detail-val mono">' + formatNum(state.latestBlock) + '</div></div>',
            '      <div class="detail-row"><div class="detail-label">Gas Price</div><div class="detail-val mono">' + formatGwei(state.gasPrice) + '</div></div>',
            '    </div>',
            '    <div class="detail-card">',
            '      <div class="detail-card-title">Endpoints</div>',
            '      <div class="detail-row"><div class="detail-label">JSON-RPC</div><div class="detail-val mono">http://46.225.30.187:8545 ' + copyBtnHtml('http://46.225.30.187:8545') + '</div></div>',
            '      <div class="detail-row"><div class="detail-label">WebSocket</div><div class="detail-val mono">ws://46.225.30.187:8546 ' + copyBtnHtml('ws://46.225.30.187:8546') + '</div></div>',
            '      <div class="detail-row"><div class="detail-label">Explorer</div><div class="detail-val"><a href="http://46.225.30.187" target="_blank">http://46.225.30.187</a></div></div>',
            '      <div class="detail-row"><div class="detail-label">Faucet</div><div class="detail-val"><a href="http://46.225.30.187:8080" target="_blank">http://46.225.30.187:8080</a></div></div>',
            '      <div class="detail-row"><div class="detail-label">PrimeSwap DEX</div><div class="detail-val"><a href="http://46.225.30.187:4000" target="_blank">http://46.225.30.187:4000</a></div></div>',
            '      <div class="detail-row"><div class="detail-label">Validator Dashboard</div><div class="detail-val"><a href="http://46.225.30.187:4001" target="_blank">http://46.225.30.187:4001</a></div></div>',
            '      <div class="detail-row"><div class="detail-label">Grafana</div><div class="detail-val"><a href="http://46.225.30.187:3000" target="_blank">http://46.225.30.187:3000</a></div></div>',
            '      <div class="detail-row"><div class="detail-label">Docs</div><div class="detail-val"><a href="http://46.225.30.187:3001" target="_blank">http://46.225.30.187:3001</a></div></div>',
            '      <div class="detail-row"><div class="detail-label">Status Page</div><div class="detail-val"><a href="http://46.225.30.187:3002" target="_blank">http://46.225.30.187:3002</a></div></div>',
            '      <div style="padding:0.85rem 1.5rem">',
            '        <button id="addMetaMask" style="padding:0.55rem 1.25rem;background:var(--accent);color:var(--bg-deep);border:none;border-radius:var(--radius-sm);font-family:var(--font-ui);font-weight:600;font-size:0.85rem;cursor:pointer;transition:all 200ms ease">🦊 Add to MetaMask</button>',
            '      </div>',
            '    </div>',
            '  </div>',
            '',
            '  <div class="detail-card" style="margin-bottom:1.5rem">',
            '    <div class="detail-card-title">Deployed Contracts</div>',
            '    <div class="overflow-x">',
            '      <table class="data-table">',
            '        <thead><tr><th>Contract</th><th>Address</th><th>Description</th><th>Type</th></tr></thead>',
            '        <tbody>' + contractRows + '</tbody>',
            '      </table>',
            '    </div>',
            '  </div>',
            '',
            '  <div class="detail-card">',
            '    <div class="detail-card-title">Token Economics</div>',
            '    <div class="detail-row"><div class="detail-label">Max Supply</div><div class="detail-val mono">1,000,000,000 PRIM</div></div>',
            '    <div class="detail-row"><div class="detail-label">Initial Block Reward</div><div class="detail-val mono">10 PRIM</div></div>',
            '    <div class="detail-row"><div class="detail-label">Halving Interval</div><div class="detail-val mono">35,000,000 blocks (~2.22 years)</div></div>',
            '    <div class="detail-row"><div class="detail-label">Block Rewards</div><div class="detail-val">70%</div></div>',
            '    <div class="detail-row"><div class="detail-label">Ecosystem &amp; Grants</div><div class="detail-val">10%</div></div>',
            '    <div class="detail-row"><div class="detail-label">Foundation Reserve</div><div class="detail-val">10%</div></div>',
            '    <div class="detail-row"><div class="detail-label">Team &amp; Contributors</div><div class="detail-val">5%</div></div>',
            '    <div class="detail-row"><div class="detail-label">Sales</div><div class="detail-val">5%</div></div>',
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

    /* ===========================================
       INIT
       =========================================== */
    document.addEventListener('DOMContentLoaded', function () {
        window.addEventListener('hashchange', dispatch);

        if (!location.hash || location.hash === '#') {
            location.hash = '#/';
        } else {
            dispatch();
        }
    });

})();
