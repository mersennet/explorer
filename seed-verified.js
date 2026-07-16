#!/usr/bin/env node
// Seed the verified_contracts table with the official Mersennet contracts.
//
// Each entry in known-contracts/manifest.json is compiled from its bundled
// source and its runtime bytecode is checked against the on-chain code (the same
// path as the public /api/verify-contract endpoint). Only genuine matches are
// inserted, so this can never mark a contract verified that doesn't actually
// match the chain. Idempotent — safe to re-run after a redeploy.
//
// Usage (same DB env as the indexer):
//   DB_PASS=… node seed-verified.js [--rpc https://rpc.mersennet.com]
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const contractVerify = require('./contract-verify');

const RPC_URL = (() => {
  const i = process.argv.indexOf('--rpc');
  return i >= 0 ? process.argv[i + 1] : (process.env.RPC_URL || 'https://rpc.mersennet.com');
})();

const pool = new Pool({
  user: process.env.DB_USER || 'mersennet',
  password: process.env.DB_PASS,
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'mersennet_explorer',
});

let rpcId = 1;
async function rpc(method, params) {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: rpcId++, method, params: params || [] }),
  });
  const j = await res.json();
  if (j.error) throw new Error(j.error.message);
  return j.result;
}

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS verified_contracts (
      address text PRIMARY KEY, contract_name text NOT NULL, compiler_version text,
      optimizer boolean, runs int, evm_version text, via_ir boolean, match_type text,
      source text NOT NULL, abi jsonb, verified_at timestamptz DEFAULT now()
    )`);
}

async function main() {
  if (!process.env.DB_PASS) { console.error('DB_PASS is required'); process.exit(1); }
  const manifestPath = path.join(__dirname, 'known-contracts', 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const settings = manifest.settings;
  await ensureTable();

  let ok = 0, skipped = 0;
  for (const c of manifest.contracts) {
    const address = c.address.toLowerCase();
    const source = fs.readFileSync(path.join(__dirname, 'known-contracts', 'src', c.sourceFile), 'utf8');
    let code;
    try { code = await rpc('eth_getCode', [address, 'latest']); }
    catch (e) { console.log(`✗ ${c.label} (${address}) — RPC error: ${e.message}`); skipped++; continue; }
    if (!code || code === '0x') { console.log(`✗ ${c.label} (${address}) — no bytecode on chain (redeploy?)`); skipped++; continue; }

    const r = contractVerify.verify({ source, contractName: c.name, settings }, code);
    if (!r.ok) { console.log(`✗ ${c.label} (${address}) — ${r.error}`); skipped++; continue; }

    await pool.query(
      `INSERT INTO verified_contracts
         (address, contract_name, compiler_version, optimizer, runs, evm_version, via_ir, match_type, source, abi, verified_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())
       ON CONFLICT (address) DO UPDATE SET
         contract_name=EXCLUDED.contract_name, compiler_version=EXCLUDED.compiler_version,
         optimizer=EXCLUDED.optimizer, runs=EXCLUDED.runs, evm_version=EXCLUDED.evm_version,
         via_ir=EXCLUDED.via_ir, match_type=EXCLUDED.match_type, source=EXCLUDED.source,
         abi=EXCLUDED.abi, verified_at=now()`,
      [address, r.contractName, r.compilerVersion, settings.optimizer !== false, settings.runs || 200,
       settings.evmVersion || 'shanghai', settings.viaIR === true, r.matchType, source, JSON.stringify(r.abi)]
    );
    console.log(`✓ ${c.label} (${address}) — verified (${r.matchType}) as ${r.contractName}`);
    ok++;
  }
  console.log(`\nSeeded ${ok} verified, ${skipped} skipped.`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
