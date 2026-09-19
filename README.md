<p align="center"><a href="https://mersennet.com"><img src="https://raw.githubusercontent.com/mersennet/.github/main/profile/mark.svg" width="72" alt="Mersennet"></a></p>
<h1 align="center">Mersennet Explorer</h1>
<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-7dff9b?style=flat-square" alt="MIT license"></a>
  <a href="https://github.com/mersennet/explorer/actions/workflows/ci.yml"><img src="https://github.com/mersennet/explorer/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI"></a>
  <a href="https://explorer.mersennet.com"><img src="https://img.shields.io/badge/docs-mersennet-1c1c1c?style=flat-square" alt="Docs"></a>
  <a href="https://t.me/Mersennet"><img src="https://img.shields.io/badge/telegram-%40Mersennet-26A5E4?style=flat-square" alt="Telegram"></a>
</p>

The block explorer for **Mersennet** — the private, verifiable Layer 1 (chain 131071).
A dark, prime-themed, ZK-native explorer: blocks, transactions, accounts, the
native order book, validators, Mersenne-prime tokenomics, and a first-class
**Privacy / ZK hub** (live shielded pool + SP1 state-proof verification).

**Live:** https://explorer.mersennet.com

## Architecture

- **Vanilla ES-module SPA — no build step.** Open `index.html`; it loads
  `assets/js/app.js` (`type="module"`), which lazy-imports page modules from
  `assets/js/pages/`. Just static files.
- **RPC-first.** Everything core works off the node JSON-RPC at the same-origin
  `/rpc` (reverse-proxied). The indexer REST API at `/api` is **optional**
  (progressive enhancement) — when proxied it adds top accounts, per-address
  history, token transfers, charts, and full-text search; when absent the UI
  degrades gracefully with a subtle "indexer offline" note.
- **Real-time** via the node WebSocket (`wss://rpc.mersennet.com`): live blocks,
  CLOB trades, shielded-root heartbeat, and SP1 proofs.

```
index.html
assets/
  css/{tokens,base,components}.css                 # design system (brand green + teal)
  js/{config,rpc,api,ws,format,ui,router,app}.js   # foundation
  js/pages/*.js                                    # one module per route
```

`router.js` maps `#/...` hash routes to `pages/<name>.js`; each page
default-exports `async (params) => cleanup?`.

## Configuration

`RPC_URL` defaults to `location.origin + '/rpc'`. Override for local dev with a
`?rpc=` query param, e.g. `index.html?rpc=https://rpc.mersennet.com`.

## Deploy

Static files behind a reverse proxy that provides `/rpc` (required) and `/api`
(optional). See **`Caddyfile`** for the `explorer.mersennet.com` vhost.

```bash
deploy/publish.sh          # syntax-checks every module, rsyncs the static files, lists/purges cached JS
deploy/publish.sh --check  # checks only (same as CI)
# install the vhost (replace NODE_RPC) and reload Caddy
```

Always deploy through `deploy/publish.sh`: a module with a syntax error fails to load and blanks the whole app, and the edge caches `assets/` for four hours.

### Indexer (optional `/api` backend)

The indexer unlocks per-address history, token transfers/holdings, top accounts,
full-text search, and chart stats. It self-bootstraps its Postgres schema and
runs as a systemd service separate from the static tree. Full steps in
**[`INDEXER.md`](INDEXER.md)**; artifacts: `indexer.js`, `package.json`,
`.env.example`, `deploy/mersennet-indexer.service`.

> Until `/api` is proxied to the indexer, indexer-backed features show an
> "indexer offline" note and fall back to live RPC. The core explorer + the
> Privacy/ZK, CLOB, validators, tokenomics, and network pages work without it.

---

<p align="center">
  Part of the <a href="https://github.com/mersennet">Mersennet</a> ecosystem —
  <a href="https://trade.mersennet.com">trade</a> ·
  <a href="https://explorer.mersennet.com">explorer</a> ·
  <a href="https://docs.mersennet.com">docs</a> ·
  <a href="https://mersennet.com/downloads/">run a node</a> ·
  <a href="https://t.me/Mersennet">Telegram</a><br>
  <sub>© 2026 Mersennet Foundation · MIT License · security@mersennet.com</sub>
</p>
