// Boot: build the shell (sidebar + topbar + search), wire theme, copy, search,
// live network status, then start the router.
import { CONFIG } from './config.js';
import { startRouter, navigate } from './router.js';
import { icon, logoSvg, toast } from './ui.js';
import { rpcSafe, getChainId } from './rpc.js';
import { ws } from './ws.js';
import { api } from './api.js';

const NAV = [
  { section: 'Overview' },
  { mod: 'home', label: 'Dashboard', ico: 'home', route: '' },
  { mod: 'blocks', label: 'Blocks', ico: 'blocks', route: 'blocks' },
  { mod: 'txs', label: 'Transactions', ico: 'tx', route: 'txs' },
  { mod: 'accounts', label: 'Accounts', ico: 'account', route: 'accounts' },
  { section: 'Network' },
  { mod: 'validators', label: 'Validators', ico: 'validators', route: 'validators' },
  { mod: 'clob', label: 'Order Books', ico: 'clob', route: 'clob' },
  { mod: 'tokenomics', label: 'Tokenomics', ico: 'coins', route: 'tokenomics' },
  { mod: 'network', label: 'Network', ico: 'network', route: 'network' },
  { section: 'Privacy / ZK', privacy: true },
  { mod: 'privacy', label: 'Privacy Hub', ico: 'privacy', route: 'privacy', privacy: true },
  { mod: 'verify', label: 'Verifiable Chain', ico: 'verify', route: 'verify', privacy: true },
];

function buildShell() {
  const nav = NAV.map((n) => {
    if (n.section) return `<div class="nav-section-label">${n.section}</div>`;
    return `<a class="nav-item ${n.privacy ? 'privacy' : ''}" data-route="${n.mod}" href="/${n.route}">
      ${icon(n.ico)}<span class="nav-label">${n.label}</span></a>`;
  }).join('');

  document.getElementById('app').innerHTML = `
    <div class="shell" id="shell">
      <aside class="sidebar" id="sidebar">
        <a class="brand" href="/">${logoSvg(30)}<span class="wordmark">Mersennet</span></a>
        ${nav}
        <div style="margin-top:auto;padding:12px 8px" class="nav-foot">
          <a class="nav-item" href="${CONFIG.links.docs}" target="_blank">${icon('ext')}<span class="nav-label">Docs</span></a>
          <a class="nav-item" href="https://status.mersennet.com" target="_blank">${icon('ext')}<span class="nav-label">Status</span></a>
          <a class="nav-item" href="https://t.me/Mersennet" target="_blank" rel="noopener">${icon('ext')}<span class="nav-label">Telegram</span></a>
        </div>
      </aside>
      <div class="main">
        <header class="topbar">
          <button class="menu-btn" id="menuBtn" aria-label="Menu">${icon('menu')}</button>
          <div class="searchbar">
            <span class="s-ico">${icon('search', 16)}</span>
            <input id="search" placeholder="Search block / tx / address…" autocomplete="off" spellcheck="false"/>
          </div>
          <div class="netpill" title="Chain ${CONFIG.chainId}"><span class="dot live" id="netdot"></span><span id="netlabel">Testnet · 131071</span></div>
          <button class="btn" id="themeBtn" title="Toggle theme">${icon('moon', 16)}</button>
          <button class="btn primary" id="walletBtn">${icon('wallet', 16)}<span class="hide-sm">Connect</span></button>
        </header>
        <main class="content"><div id="view"></div></main>
      </div>
    </div>`;
}

function wire() {
  // theme
  const saved = localStorage.getItem('mersennet-explorer-theme') || 'dark';
  if (saved === 'light') document.documentElement.classList.add('light');
  document.getElementById('themeBtn').onclick = () => {
    const light = document.documentElement.classList.toggle('light');
    localStorage.setItem('mersennet-explorer-theme', light ? 'light' : 'dark');
    document.getElementById('themeBtn').innerHTML = icon(light ? 'sun' : 'moon', 16);
  };
  document.getElementById('themeBtn').innerHTML = icon(saved === 'light' ? 'sun' : 'moon', 16);

  // sidebar collapse / mobile
  document.getElementById('menuBtn').onclick = () => {
    if (window.innerWidth <= 900) document.getElementById('sidebar').classList.toggle('open');
    else document.getElementById('shell').classList.toggle('collapsed');
  };
  // mobile: close the drawer when a nav link is tapped or the page behind it is
  // touched, so navigation never leaves the sidebar covering the new content
  document.addEventListener('click', (e) => {
    if (window.innerWidth > 900) return;
    const sb = document.getElementById('sidebar');
    if (!sb || !sb.classList.contains('open')) return;
    if (e.target.closest('#menuBtn')) return;
    if (e.target.closest('.nav-item') || !e.target.closest('#sidebar')) sb.classList.remove('open');
  });

  // search
  const s = document.getElementById('search');
  s.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const q = s.value.trim(); if (!q) return;
    if (/^\d+$/.test(q)) navigate('block/' + q);
    else if (/^0x[0-9a-fA-F]{64}$/.test(q)) navigate('tx/' + q);
    else if (/^0x[0-9a-fA-F]{40}$/.test(q)) navigate('address/' + q);
    else navigate('search/' + encodeURIComponent(q));
    s.blur();
  });

  // global copy delegation
  document.addEventListener('click', (e) => {
    const c = e.target.closest('[data-copy]');
    if (c) { navigator.clipboard?.writeText(c.dataset.copy).then(() => toast('Copied')); }
    // "Upgrade → sha" badges reveal the install command next to them.
    const u = e.target.closest('[data-upgrade]');
    if (u) {
      const cmd = u.parentElement?.querySelector('.upgrade-cmd');
      if (cmd) cmd.hidden = !cmd.hidden;
    }
  });

  // wallet: add Mersennet to the wallet AND connect, so the button shows the
  // account and the Validators / Network pages can mark what is yours. The
  // old button only added the network, which read as a connect that did
  // nothing (first outside validator, 2026-09-15).
  const walletBtn = document.getElementById('walletBtn');
  const showAccount = (addr) => {
    if (!addr) return;
    window.__account = addr.toLowerCase();
    sessionStorage.setItem('explorer.account', window.__account);
    walletBtn.querySelector('span').textContent = `${addr.slice(0, 6)}…${addr.slice(-4)}`;
    walletBtn.title = 'Open your address';
    document.dispatchEvent(new CustomEvent('wallet:account', { detail: { address: window.__account } }));
  };
  const savedAccount = sessionStorage.getItem('explorer.account');
  if (savedAccount) showAccount(savedAccount);
  walletBtn.onclick = async () => {
    if (window.__account) { location.hash = `#/address/${window.__account}`; return; }
    if (!window.ethereum) { toast('No wallet found — install MetaMask or open in a wallet browser'); return; }
    try {
      await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [{
        chainId: CONFIG.chainIdHex, chainName: CONFIG.chainName,
        nativeCurrency: { name: CONFIG.symbol, symbol: CONFIG.symbol, decimals: CONFIG.decimals },
        rpcUrls: [CONFIG.canonicalRpc], blockExplorerUrls: [location.origin],
      }]});
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (accounts && accounts[0]) { showAccount(accounts[0]); toast('Connected — Mersennet is in your wallet'); }
      else toast('Mersennet added to wallet');
    } catch (e) { toast('Cancelled'); }
  };
  window.ethereum?.on?.('accountsChanged', (a) => { if (a && a[0]) showAccount(a[0]); });

  // live status dot from WS
  document.addEventListener('ws:status', (e) => {
    const dot = document.getElementById('netdot');
    if (dot) dot.style.background = dot.style.boxShadow = '';
    if (dot) { dot.style.background = e.detail.connected ? 'var(--up)' : 'var(--warn)'; }
  });

  if (CONFIG.rpcCustom) {
    const b = document.createElement('div');
    b.className = 'banner warn'; b.style.cssText = 'margin:0 22px 14px';
    b.innerHTML = `${icon('bolt', 16)} Using custom RPC endpoint: ${CONFIG.rpcUrl}`;
    document.querySelector('.content').prepend(b);
  }
}

async function boot() {
  buildShell();
  wire();
  startRouter();
  // confirm chain id + warm WS + probe indexer (non-blocking)
  getChainId().then((id) => {
    if (id && parseInt(id, 16) !== CONFIG.chainId) {
      document.getElementById('netlabel').textContent = 'Chain ' + parseInt(id, 16);
    }
  });
  api.probe();
  ws.subscribe('newHeads', () => {}); // keep socket warm; pages add their own handlers
}

boot();
