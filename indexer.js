const http = require('http');
const { Pool } = require('pg');

// ─── Config ──────────────────────────────────────────────────────────────────
const RPC_URL = process.env.RPC_URL || 'http://46.225.183.192:8545';
const PORT = parseInt(process.env.PORT) || 3334;
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE) || 50;
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL) || 3000;
const CONCURRENCY = parseInt(process.env.CONCURRENCY) || 10;
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

const pool = new Pool({
    user: process.env.DB_USER || 'primescan',
    password: process.env.DB_PASS || 'primescan_db_2026',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'primescan',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});

let indexing = false;
let rpcId = 1;
let chainHead = 0;
let indexedBlock = -1;
let startTime = Date.now();

// ─── RPC helpers ─────────────────────────────────────────────────────────────
async function rpc(method, params) {
    const body = JSON.stringify({ jsonrpc: '2.0', id: rpcId++, method, params: params || [] });
    const res = await fetch(RPC_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    const data = await res.json();
    if (data.error) throw new Error(`RPC ${method}: ${data.error.message}`);
    return data.result;
}

async function rpcParallel(calls, concurrency = CONCURRENCY) {
    const results = new Array(calls.length);
    for (let i = 0; i < calls.length; i += concurrency) {
        const chunk = calls.slice(i, i + concurrency);
        const chunkResults = await Promise.all(
            chunk.map(([method, params]) => rpc(method, params).catch(() => null))
        );
        for (let j = 0; j < chunkResults.length; j++) results[i + j] = chunkResults[j];
    }
    return results;
}

function hexToInt(h) { return h ? parseInt(h, 16) || 0 : 0; }
function hexToBigStr(h) { return h ? (BigInt(h) || 0n).toString() : '0'; }

// ─── DB helpers ──────────────────────────────────────────────────────────────
async function getState(key) {
    const r = await pool.query('SELECT value FROM indexer_state WHERE key = $1', [key]);
    return r.rows.length ? r.rows[0].value : null;
}

async function setState(key, value) {
    await pool.query(
        `INSERT INTO indexer_state (key, value, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        [key, String(value)]
    );
}

async function insertBlocks(blocks) {
    if (!blocks.length) return;
    const values = [];
    const params = [];
    let idx = 1;
    for (const b of blocks) {
        values.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`);
        params.push(
            hexToInt(b.number),
            b.hash,
            b.parentHash || '',
            hexToInt(b.timestamp),
            (b.miner || '').toLowerCase(),
            hexToInt(b.gasUsed),
            hexToInt(b.gasLimit),
            Array.isArray(b.transactions) ? b.transactions.length : 0,
            hexToInt(b.size || '0x0'),
            b.extraData || ''
        );
    }
    await pool.query(
        `INSERT INTO blocks (number, hash, parent_hash, timestamp, miner, gas_used, gas_limit, tx_count, size, extra_data)
         VALUES ${values.join(',')}
         ON CONFLICT (number) DO NOTHING`,
        params
    );
}

async function insertTransactions(txs) {
    if (!txs.length) return;
    const values = [];
    const params = [];
    let idx = 1;
    for (const tx of txs) {
        values.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`);
        const methodId = tx.input && tx.input.length >= 10 ? tx.input.slice(0, 10) : null;
        params.push(
            tx.hash,
            tx._blockNumber,
            tx._txIndex,
            tx._timestamp,
            (tx.from || '').toLowerCase(),
            tx.to ? tx.to.toLowerCase() : null,
            tx.value || '0x0',
            hexToInt(tx.gas),
            tx.gasPrice || tx.maxFeePerGas || '0x0',
            tx.input || '0x',
            hexToInt(tx.nonce || '0x0'),
            methodId,
            tx._contractAddress || null
        );
    }
    await pool.query(
        `INSERT INTO transactions (hash, block_number, tx_index, timestamp, from_addr, to_addr, value, gas, gas_price, input, nonce, method_id, contract_address)
         VALUES ${values.join(',')}
         ON CONFLICT (hash) DO NOTHING`,
        params
    );
}

async function insertTokenTransfers(transfers) {
    if (!transfers.length) return;
    const values = [];
    const params = [];
    let idx = 1;
    for (const t of transfers) {
        values.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`);
        params.push(
            t.txHash,
            t.logIndex,
            t.blockNumber,
            t.tokenAddress,
            t.from,
            t.to,
            t.amount
        );
    }
    await pool.query(
        `INSERT INTO token_transfers (tx_hash, log_index, block_number, token_address, from_addr, to_addr, amount)
         VALUES ${values.join(',')}
         ON CONFLICT (tx_hash, log_index) DO NOTHING`,
        params
    );
}

async function updateReceiptData(receipts) {
    if (!receipts.length) return;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const r of receipts) {
            if (!r || !r.transactionHash) continue;
            await client.query(
                `UPDATE transactions SET gas_used = $1, status = $2, contract_address = $3 WHERE hash = $4`,
                [
                    hexToInt(r.gasUsed),
                    hexToInt(r.status),
                    r.contractAddress ? r.contractAddress.toLowerCase() : null,
                    r.transactionHash
                ]
            );
        }
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

// ─── Block processing ────────────────────────────────────────────────────────
function extractTxs(block) {
    if (!block || !Array.isArray(block.transactions)) return [];
    const blockNum = hexToInt(block.number);
    const ts = hexToInt(block.timestamp);
    return block.transactions
        .filter(tx => typeof tx === 'object' && tx.hash)
        .map((tx, i) => ({
            ...tx,
            _blockNumber: blockNum,
            _txIndex: hexToInt(tx.transactionIndex || '0x0'),
            _timestamp: ts,
        }));
}

function extractTokenTransfers(logs) {
    const transfers = [];
    if (!Array.isArray(logs)) return transfers;
    for (const log of logs) {
        if (!log.topics || log.topics.length < 3 || log.topics[0] !== TRANSFER_TOPIC) continue;
        transfers.push({
            txHash: log.transactionHash,
            logIndex: hexToInt(log.logIndex || '0x0'),
            blockNumber: hexToInt(log.blockNumber),
            tokenAddress: (log.address || '').toLowerCase(),
            from: ('0x' + (log.topics[1] || '').slice(26)).toLowerCase(),
            to: ('0x' + (log.topics[2] || '').slice(26)).toLowerCase(),
            amount: log.data || '0x0',
        });
    }
    return transfers;
}

// ─── Main indexer loop ───────────────────────────────────────────────────────
async function indexChain() {
    if (indexing) return;
    indexing = true;

    try {
        const latestHex = await rpc('eth_blockNumber');
        const latest = hexToInt(latestHex);
        chainHead = latest;

        const savedBlock = parseInt(await getState('last_indexed_block')) || -1;
        if (indexedBlock < savedBlock) indexedBlock = savedBlock;

        if (latest <= indexedBlock) { indexing = false; return; }

        const startBlock = indexedBlock + 1;
        const total = latest - startBlock + 1;
        console.log(`[indexer] Syncing blocks ${startBlock}→${latest} (${total} blocks)`);
        const t0 = Date.now();

        for (let start = startBlock; start <= latest; start += BATCH_SIZE) {
            const end = Math.min(start + BATCH_SIZE - 1, latest);
            const count = end - start + 1;

            // Fetch blocks with full transaction objects
            const blockCalls = [];
            for (let b = start; b <= end; b++) {
                blockCalls.push(['eth_getBlockByNumber', ['0x' + b.toString(16), true]]);
            }
            const blocks = await rpcParallel(blockCalls);
            const validBlocks = blocks.filter(Boolean);

            // Extract transactions
            const allTxs = [];
            for (const block of validBlocks) {
                allTxs.push(...extractTxs(block));
            }

            // Fetch receipts for all transactions (gas_used, status, contract creation)
            const receiptCalls = allTxs.map(tx => ['eth_getTransactionReceipt', [tx.hash]]);
            const receipts = receiptCalls.length ? await rpcParallel(receiptCalls) : [];

            // Attach contract_address from receipt to tx
            for (let i = 0; i < allTxs.length; i++) {
                if (receipts[i] && receipts[i].contractAddress) {
                    allTxs[i]._contractAddress = receipts[i].contractAddress.toLowerCase();
                }
            }

            // Fetch logs for token transfers
            const logResult = await rpc('eth_getLogs', [{
                fromBlock: '0x' + start.toString(16),
                toBlock: '0x' + end.toString(16),
                topics: [TRANSFER_TOPIC]
            }]).catch(() => []);
            const tokenTransfers = extractTokenTransfers(logResult);

            // Persist to DB in a single transaction
            const client = await pool.connect();
            try {
                await client.query('BEGIN');

                if (validBlocks.length) await insertBlocksWithClient(client, validBlocks);
                if (allTxs.length) await insertTxsWithClient(client, allTxs);
                if (receipts.some(Boolean)) await updateReceiptsWithClient(client, receipts);
                if (tokenTransfers.length) await insertTokenTransfersWithClient(client, tokenTransfers);

                await client.query(
                    `INSERT INTO indexer_state (key, value, updated_at) VALUES ('last_indexed_block', $1, NOW())
                     ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
                    [String(end)]
                );

                await client.query('COMMIT');
            } catch (e) {
                await client.query('ROLLBACK');
                console.error(`[indexer] DB error at block ${start}-${end}:`, e.message);
                break;
            } finally {
                client.release();
            }

            indexedBlock = end;

            if ((end - startBlock) % 2000 < BATCH_SIZE || end === latest) {
                const pct = ((end - startBlock + 1) / total * 100).toFixed(1);
                const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
                const bps = ((end - startBlock + 1) / ((Date.now() - t0) / 1000)).toFixed(0);
                console.log(`  ${pct}% block ${end} | ${allTxs.length} txs, ${tokenTransfers.length} transfers | ${bps} blocks/s (${elapsed}s)`);
            }
        }

        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        const stats = await pool.query('SELECT count(*) as txs FROM transactions');
        const ttStats = await pool.query('SELECT count(*) as transfers FROM token_transfers');
        console.log(`[indexer] Sync done in ${elapsed}s — ${stats.rows[0].txs} txs, ${ttStats.rows[0].transfers} transfers in DB`);

    } catch (e) {
        console.error('[indexer] Error:', e.message);
    }
    indexing = false;
}

// DB helpers using a provided client (for transaction context)
async function insertBlocksWithClient(client, blocks) {
    const CHUNK = 50;
    for (let i = 0; i < blocks.length; i += CHUNK) {
        const chunk = blocks.slice(i, i + CHUNK);
        const values = [];
        const params = [];
        let idx = 1;
        for (const b of chunk) {
            values.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`);
            params.push(
                hexToInt(b.number), b.hash, b.parentHash || '', hexToInt(b.timestamp),
                (b.miner || '').toLowerCase(), hexToInt(b.gasUsed), hexToInt(b.gasLimit),
                Array.isArray(b.transactions) ? b.transactions.length : 0,
                hexToInt(b.size || '0x0'), b.extraData || ''
            );
        }
        await client.query(
            `INSERT INTO blocks (number, hash, parent_hash, timestamp, miner, gas_used, gas_limit, tx_count, size, extra_data)
             VALUES ${values.join(',')} ON CONFLICT (number) DO NOTHING`, params
        );
    }
}

async function insertTxsWithClient(client, txs) {
    const CHUNK = 50;
    for (let i = 0; i < txs.length; i += CHUNK) {
        const chunk = txs.slice(i, i + CHUNK);
        const values = [];
        const params = [];
        let idx = 1;
        for (const tx of chunk) {
            values.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`);
            const methodId = tx.input && tx.input.length >= 10 ? tx.input.slice(0, 10) : null;
            params.push(
                tx.hash, tx._blockNumber, tx._txIndex, tx._timestamp,
                (tx.from || '').toLowerCase(), tx.to ? tx.to.toLowerCase() : null,
                tx.value || '0x0', hexToInt(tx.gas), tx.gasPrice || tx.maxFeePerGas || '0x0',
                tx.input || '0x', hexToInt(tx.nonce || '0x0'), methodId, tx._contractAddress || null
            );
        }
        await client.query(
            `INSERT INTO transactions (hash, block_number, tx_index, timestamp, from_addr, to_addr, value, gas, gas_price, input, nonce, method_id, contract_address)
             VALUES ${values.join(',')} ON CONFLICT (hash) DO NOTHING`, params
        );
    }
}

async function updateReceiptsWithClient(client, receipts) {
    for (const r of receipts) {
        if (!r || !r.transactionHash) continue;
        await client.query(
            `UPDATE transactions SET gas_used = $1, status = $2, contract_address = COALESCE($3, contract_address) WHERE hash = $4`,
            [hexToInt(r.gasUsed), hexToInt(r.status), r.contractAddress ? r.contractAddress.toLowerCase() : null, r.transactionHash]
        );
    }
}

async function insertTokenTransfersWithClient(client, transfers) {
    const CHUNK = 100;
    for (let i = 0; i < transfers.length; i += CHUNK) {
        const chunk = transfers.slice(i, i + CHUNK);
        const values = [];
        const params = [];
        let idx = 1;
        for (const t of chunk) {
            values.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`);
            params.push(t.txHash, t.logIndex, t.blockNumber, t.tokenAddress, t.from, t.to, t.amount);
        }
        await client.query(
            `INSERT INTO token_transfers (tx_hash, log_index, block_number, token_address, from_addr, to_addr, amount)
             VALUES ${values.join(',')} ON CONFLICT (tx_hash, log_index) DO NOTHING`, params
        );
    }
}

// ─── HTTP API ────────────────────────────────────────────────────────────────
function sendJSON(res, code, data) {
    res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(data));
}

function parsePagination(url) {
    const page = Math.max(1, parseInt(url.searchParams.get('page')) || 1);
    const limit = Math.min(Math.max(1, parseInt(url.searchParams.get('limit')) || 25), 100);
    const offset = (page - 1) * limit;
    return { page, limit, offset };
}

const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        });
        return res.end();
    }

    const url = new URL(req.url, `http://localhost:${PORT}`);
    const path = url.pathname;

    try {
        // ── Status ────────────────────────────────────
        if (path === '/api/status') {
            const [txCount, blockCount, ttCount] = await Promise.all([
                pool.query('SELECT count(*)::int as c FROM transactions'),
                pool.query('SELECT count(*)::int as c FROM blocks'),
                pool.query('SELECT count(*)::int as c FROM token_transfers'),
            ]);
            return sendJSON(res, 200, {
                ready: indexedBlock >= 0,
                chainHead,
                lastIndexedBlock: indexedBlock,
                blocks: blockCount.rows[0].c,
                transactions: txCount.rows[0].c,
                tokenTransfers: ttCount.rows[0].c,
                uptime: Math.floor((Date.now() - startTime) / 1000),
            });
        }

        // ── Chain stats (for home page) ───────────────
        if (path === '/api/stats') {
            const [txCount, blockCount, addrCount, ttCount] = await Promise.all([
                pool.query('SELECT count(*)::int as c FROM transactions'),
                pool.query('SELECT count(*)::int as c FROM blocks'),
                pool.query(`SELECT count(DISTINCT addr)::int as c FROM (
                    SELECT from_addr as addr FROM transactions
                    UNION SELECT to_addr as addr FROM transactions WHERE to_addr IS NOT NULL
                ) u`),
                pool.query('SELECT count(*)::int as c FROM token_transfers'),
            ]);
            return sendJSON(res, 200, {
                totalBlocks: blockCount.rows[0].c,
                totalTransactions: txCount.rows[0].c,
                totalAddresses: addrCount.rows[0].c,
                totalTokenTransfers: ttCount.rows[0].c,
                chainHead,
                lastIndexedBlock: indexedBlock,
            });
        }

        // ── Latest blocks ─────────────────────────────
        if (path === '/api/blocks') {
            const { page, limit, offset } = parsePagination(url);
            const [data, total] = await Promise.all([
                pool.query('SELECT * FROM blocks ORDER BY number DESC LIMIT $1 OFFSET $2', [limit, offset]),
                pool.query('SELECT count(*)::int as c FROM blocks'),
            ]);
            return sendJSON(res, 200, { total: total.rows[0].c, page, limit, blocks: data.rows });
        }

        // ── Single block ──────────────────────────────
        const blockMatch = path.match(/^\/api\/block\/(\d+)$/);
        if (blockMatch) {
            const num = parseInt(blockMatch[1]);
            const [block, txs] = await Promise.all([
                pool.query('SELECT * FROM blocks WHERE number = $1', [num]),
                pool.query('SELECT * FROM transactions WHERE block_number = $1 ORDER BY tx_index', [num]),
            ]);
            if (!block.rows.length) return sendJSON(res, 404, { error: 'Block not found' });
            return sendJSON(res, 200, { block: block.rows[0], transactions: txs.rows });
        }

        // ── Latest transactions ───────────────────────
        if (path === '/api/txs') {
            const { page, limit, offset } = parsePagination(url);
            const block = url.searchParams.get('block');
            let data, total;
            if (block) {
                [data, total] = await Promise.all([
                    pool.query('SELECT * FROM transactions WHERE block_number = $1 ORDER BY tx_index LIMIT $2 OFFSET $3', [parseInt(block), limit, offset]),
                    pool.query('SELECT count(*)::int as c FROM transactions WHERE block_number = $1', [parseInt(block)]),
                ]);
            } else {
                [data, total] = await Promise.all([
                    pool.query('SELECT * FROM transactions ORDER BY block_number DESC, tx_index DESC LIMIT $1 OFFSET $2', [limit, offset]),
                    pool.query('SELECT count(*)::int as c FROM transactions'),
                ]);
            }
            return sendJSON(res, 200, { total: total.rows[0].c, page, limit, transactions: data.rows });
        }

        // ── Single transaction ────────────────────────
        const txMatch = path.match(/^\/api\/tx\/(0x[a-fA-F0-9]{64})$/);
        if (txMatch) {
            const tx = await pool.query('SELECT * FROM transactions WHERE hash = $1', [txMatch[1].toLowerCase()]);
            if (!tx.rows.length) return sendJSON(res, 404, { error: 'Transaction not found' });
            const transfers = await pool.query('SELECT * FROM token_transfers WHERE tx_hash = $1 ORDER BY log_index', [txMatch[1].toLowerCase()]);
            return sendJSON(res, 200, { transaction: tx.rows[0], tokenTransfers: transfers.rows });
        }

        // ── Address transactions ──────────────────────
        const addrTxMatch = path.match(/^\/api\/address\/(0x[a-fA-F0-9]{40})\/txs$/);
        if (addrTxMatch) {
            const addr = addrTxMatch[1].toLowerCase();
            const { page, limit, offset } = parsePagination(url);
            const [data, total] = await Promise.all([
                pool.query(
                    `SELECT * FROM transactions WHERE from_addr = $1 OR to_addr = $1
                     ORDER BY block_number DESC, tx_index DESC LIMIT $2 OFFSET $3`,
                    [addr, limit, offset]
                ),
                pool.query(
                    'SELECT count(*)::int as c FROM transactions WHERE from_addr = $1 OR to_addr = $1',
                    [addr]
                ),
            ]);
            return sendJSON(res, 200, { total: total.rows[0].c, page, limit, txs: data.rows });
        }

        // ── Address token transfers ───────────────────
        const addrTokenMatch = path.match(/^\/api\/address\/(0x[a-fA-F0-9]{40})\/token-txs$/);
        if (addrTokenMatch) {
            const addr = addrTokenMatch[1].toLowerCase();
            const { page, limit, offset } = parsePagination(url);
            const token = url.searchParams.get('token');
            let data, total;
            if (token) {
                [data, total] = await Promise.all([
                    pool.query(
                        `SELECT * FROM token_transfers WHERE (from_addr = $1 OR to_addr = $1) AND token_address = $2
                         ORDER BY block_number DESC LIMIT $3 OFFSET $4`,
                        [addr, token.toLowerCase(), limit, offset]
                    ),
                    pool.query(
                        'SELECT count(*)::int as c FROM token_transfers WHERE (from_addr = $1 OR to_addr = $1) AND token_address = $2',
                        [addr, token.toLowerCase()]
                    ),
                ]);
            } else {
                [data, total] = await Promise.all([
                    pool.query(
                        `SELECT * FROM token_transfers WHERE from_addr = $1 OR to_addr = $1
                         ORDER BY block_number DESC LIMIT $2 OFFSET $3`,
                        [addr, limit, offset]
                    ),
                    pool.query(
                        'SELECT count(*)::int as c FROM token_transfers WHERE from_addr = $1 OR to_addr = $1',
                        [addr]
                    ),
                ]);
            }
            return sendJSON(res, 200, { total: total.rows[0].c, page, limit, transfers: data.rows });
        }

        // ── Address summary ───────────────────────────
        const addrSummaryMatch = path.match(/^\/api\/address\/(0x[a-fA-F0-9]{40})$/);
        if (addrSummaryMatch) {
            const addr = addrSummaryMatch[1].toLowerCase();
            const [txCount, inCount, outCount, firstTx, lastTx, tokenCount] = await Promise.all([
                pool.query('SELECT count(*)::int as c FROM transactions WHERE from_addr = $1 OR to_addr = $1', [addr]),
                pool.query('SELECT count(*)::int as c FROM transactions WHERE to_addr = $1', [addr]),
                pool.query('SELECT count(*)::int as c FROM transactions WHERE from_addr = $1', [addr]),
                pool.query('SELECT min(block_number) as bn FROM transactions WHERE from_addr = $1 OR to_addr = $1', [addr]),
                pool.query('SELECT max(block_number) as bn FROM transactions WHERE from_addr = $1 OR to_addr = $1', [addr]),
                pool.query('SELECT count(DISTINCT token_address)::int as c FROM token_transfers WHERE from_addr = $1 OR to_addr = $1', [addr]),
            ]);
            return sendJSON(res, 200, {
                address: addr,
                txCount: txCount.rows[0].c,
                inTxCount: inCount.rows[0].c,
                outTxCount: outCount.rows[0].c,
                firstBlock: firstTx.rows[0].bn,
                lastBlock: lastTx.rows[0].bn,
                tokenInteractions: tokenCount.rows[0].c,
            });
        }

        // ── Token holders / transfers ─────────────────
        const tokenInfoMatch = path.match(/^\/api\/token\/(0x[a-fA-F0-9]{40})\/transfers$/);
        if (tokenInfoMatch) {
            const token = tokenInfoMatch[1].toLowerCase();
            const { page, limit, offset } = parsePagination(url);
            const [data, total] = await Promise.all([
                pool.query(
                    'SELECT * FROM token_transfers WHERE token_address = $1 ORDER BY block_number DESC LIMIT $2 OFFSET $3',
                    [token, limit, offset]
                ),
                pool.query('SELECT count(*)::int as c FROM token_transfers WHERE token_address = $1', [token]),
            ]);
            return sendJSON(res, 200, { total: total.rows[0].c, page, limit, transfers: data.rows });
        }

        // ── Search ────────────────────────────────────
        if (path === '/api/search') {
            const q = (url.searchParams.get('q') || '').trim().toLowerCase();
            if (!q) return sendJSON(res, 400, { error: 'Missing query' });

            if (/^0x[a-f0-9]{64}$/.test(q)) {
                const tx = await pool.query('SELECT hash FROM transactions WHERE hash = $1', [q]);
                if (tx.rows.length) return sendJSON(res, 200, { type: 'tx', hash: tx.rows[0].hash });
                const block = await pool.query('SELECT number FROM blocks WHERE hash = $1', [q]);
                if (block.rows.length) return sendJSON(res, 200, { type: 'block', number: block.rows[0].number });
            }
            if (/^0x[a-f0-9]{40}$/.test(q)) {
                return sendJSON(res, 200, { type: 'address', address: q });
            }
            if (/^\d+$/.test(q)) {
                const block = await pool.query('SELECT number FROM blocks WHERE number = $1', [parseInt(q)]);
                if (block.rows.length) return sendJSON(res, 200, { type: 'block', number: block.rows[0].number });
            }
            return sendJSON(res, 200, { type: 'none' });
        }

        // ── Top accounts by tx count ──────────────────
        if (path === '/api/top-accounts') {
            const { limit } = parsePagination(url);
            const data = await pool.query(`
                SELECT addr, count(*)::int as tx_count FROM (
                    SELECT from_addr as addr FROM transactions
                    UNION ALL SELECT to_addr as addr FROM transactions WHERE to_addr IS NOT NULL
                ) u GROUP BY addr ORDER BY tx_count DESC LIMIT $1
            `, [limit]);
            return sendJSON(res, 200, { accounts: data.rows });
        }

        // ── Daily stats for charts ────────────────────
        if (path === '/api/daily-stats') {
            const days = Math.min(parseInt(url.searchParams.get('days')) || 30, 365);
            const data = await pool.query(`
                SELECT
                    date_trunc('day', to_timestamp(timestamp))::date as day,
                    count(*)::int as tx_count,
                    count(DISTINCT from_addr)::int as unique_senders
                FROM transactions
                WHERE timestamp >= extract(epoch from now() - interval '${days} days')::bigint
                GROUP BY day ORDER BY day
            `);
            return sendJSON(res, 200, { stats: data.rows });
        }

        // ── Miner / Validator stats ───────────────────
        if (path === '/api/miner-stats') {
            const data = await pool.query(`
                SELECT miner, count(*)::int as blocks_mined,
                       sum(gas_used)::bigint as total_gas_used
                FROM blocks GROUP BY miner ORDER BY blocks_mined DESC LIMIT 50
            `);
            return sendJSON(res, 200, { miners: data.rows });
        }

        sendJSON(res, 404, { error: 'Not found' });

    } catch (e) {
        console.error('[api] Error:', e.message);
        sendJSON(res, 500, { error: 'Internal server error' });
    }
});

// ─── Startup ─────────────────────────────────────────────────────────────────
async function start() {
    try {
        await pool.query('SELECT 1');
        console.log('[db] PostgreSQL connected');
    } catch (e) {
        console.error('[db] Failed to connect:', e.message);
        process.exit(1);
    }

    const saved = await getState('last_indexed_block');
    indexedBlock = parseInt(saved) || -1;
    console.log(`[indexer] Resuming from block ${indexedBlock}`);

    server.listen(PORT, '127.0.0.1', () => {
        console.log(`[api] Listening on 127.0.0.1:${PORT}`);
        indexChain();
        setInterval(indexChain, POLL_INTERVAL);
    });
}

process.on('SIGTERM', async () => {
    console.log('[indexer] Shutting down...');
    server.close();
    await pool.end();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('[indexer] Interrupted');
    server.close();
    await pool.end();
    process.exit(0);
});

start();
