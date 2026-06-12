# Mersennet Explorer

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
(optional). See **`Caddyfile`** for the `explorer.mersennet.com` vhost. The
indexer backend is `indexer.js` (`PORT=3334 node indexer.js`, needs Postgres).

```bash
rsync -a --delete ./ root@server:/var/www/explorer/ \
  --exclude .git --exclude indexer.js --exclude '*.bak'
# install the vhost (replace NODE_RPC) and reload Caddy
```

> Until `/api` is proxied to the indexer, indexer-backed features show an
> "indexer offline" note and fall back to live RPC. The core explorer + the
> Privacy/ZK, CLOB, and validators pages work without it.
