# Mersennet Explorer Indexer

The explorer works fully on pure RPC. The indexer is an **optional** backend that
unlocks the data the node cannot serve directly: complete per-address transaction
history (paginated), token-transfer history, token holdings, top accounts,
full-text search, and chart stats. When it is reachable at `/api` the frontend
lights those features up automatically; when it is not, every page degrades
gracefully with an "indexer offline" note.

`indexer.js` is one self-contained Node service (only dependency: `pg`). It:

1. ingests blocks, transactions, receipts, and ERC-20 `Transfer` logs into Postgres
   (resumable — it records the last indexed block and catches up on restart), and
2. serves a small read-only REST API the explorer's `assets/js/api.js` consumes.

It **bootstraps its own schema** (`CREATE TABLE IF NOT EXISTS` + indexes) on first
run, so there is no separate migration step.

## Deploy (separate from the static site)

Keep the indexer in its own directory so the static-site `rsync --delete` can
never wipe its `node_modules` / `.env`.

```bash
# 1. Postgres: database + role
sudo -u postgres psql <<'SQL'
CREATE ROLE mersennet LOGIN PASSWORD 'change-me-to-a-strong-password';
CREATE DATABASE mersennet_explorer OWNER mersennet;
SQL

# 2. Indexer files -> /opt/mersennet-indexer
sudo mkdir -p /opt/mersennet-indexer
sudo cp indexer.js package.json /opt/mersennet-indexer/
sudo cp .env.example /opt/mersennet-indexer/.env      # then edit .env (set DB_PASS)
cd /opt/mersennet-indexer && sudo npm install --omit=dev

# 3. systemd service
sudo useradd --system --no-create-home mersennet 2>/dev/null || true
sudo chown -R mersennet:mersennet /opt/mersennet-indexer
sudo cp /path/to/repo/deploy/mersennet-indexer.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now mersennet-indexer
journalctl -u mersennet-indexer -f          # watch it sync
```

The first run backfills the whole chain (fast on this testnet), then tails the
head every `POLL_INTERVAL` ms.

## Wire `/api` in Caddy

The `Caddyfile` already has the block (it is a no-op until the indexer is up):

```
handle /api/* {
    reverse_proxy 127.0.0.1:3334
}
```

Caddy forwards the full `/api/...` path; the indexer matches on that prefix, so
nothing needs stripping. Reload Caddy after the service is running:

```bash
sudo systemctl reload caddy
curl -s https://explorer.mersennet.com/api/status | jq    # {ready, chainHead, ...}
```

## Static-site deploy excludes

When syncing the static explorer, exclude the indexer's files:

```bash
rsync -a --delete ./ root@server:/var/www/explorer/ \
  --exclude .git --exclude node_modules --exclude indexer.js \
  --exclude package.json --exclude package-lock.json \
  --exclude '.env*' --exclude deploy --exclude '*.bak' \
  --exclude .build-spec.md --exclude INDEXER.md \
  --exclude contract-verify.js --exclude seed-verified.js --exclude known-contracts
```

## REST API (consumed by `assets/js/api.js`)

| Endpoint | Purpose |
| --- | --- |
| `GET /api/status` | readiness, chain head, last-indexed block, row counts |
| `GET /api/stats` | totals for the dashboard |
| `GET /api/blocks?page&limit` | paginated blocks (exact total) |
| `GET /api/txs?page&limit[&block]` | paginated transactions |
| `GET /api/tx/:hash` | one tx + its token transfers |
| `GET /api/address/:a` | summary (tx counts, first/last block, token count) |
| `GET /api/address/:a/txs?page&limit` | paginated address tx history |
| `GET /api/address/:a/token-txs?page&limit[&token]` | paginated token transfers |
| `GET /api/address/:a/tokens` | distinct tokens held/touched (balances via RPC) |
| `GET /api/token/:a/transfers?page&limit` | transfers for one token |
| `GET /api/top-accounts?limit` | most active accounts |
| `GET /api/daily-stats?days` | per-day tx counts / unique senders |
| `GET /api/miner-stats` | blocks produced per validator |
| `GET /api/search?q` | resolve a hash / block / address |
| `GET /api/contract?address` | verified-source record (name, compiler, ABI, source) or `{verified:false}` |
| `POST /api/verify-contract` | compile submitted Solidity and match its runtime bytecode against the on-chain code |

## Contract source verification

`POST /api/verify-contract` accepts `{ address, source, contractName?, optimizer?,
runs?, viaIR?, evmVersion? }`, compiles the source with `solc` (the bundled
0.8.x; the contracts repo uses 0.8.20 + optimizer/200 + via-IR + shanghai), and
compares the compiled runtime bytecode to `eth_getCode(address)`. Immutable byte
ranges reported by the compiler are masked before comparing; a match including
metadata is a `full` match, a match after trimming the trailing CBOR metadata is
a `partial` (bytecode) match. Verified records land in the `verified_contracts`
table and drive the **Contract** tab on the address page. Requires the `solc`
dependency (`npm install`), which now bundles a Solidity compiler.

Seed the canonical contracts (from `known-contracts/manifest.json`, verified
against the chain) so they show verified out of the box:

```bash
DB_PASS=… node seed-verified.js   # idempotent; re-run after a redeploy
```

## Configuration

All via env (see `.env.example`): `RPC_URL`, `PORT`, `DB_*`, and ingestion
tuning `BATCH_SIZE` / `POLL_INTERVAL` / `CONCURRENCY`.
