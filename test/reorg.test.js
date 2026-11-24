// Reorg safety of the indexer: a node that switches branch (after a network
// split heals, the losing side rolls back its unfinalized blocks) must leave
// no block, transaction or transfer of the abandoned branch in the index.
//
// Needs a scratch Postgres: deploy/test-reorg.sh starts one in Docker and runs the tests
// (`node --test test/*.test.js`). Never point it at a real database (it drops tables).
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const crypto = require('node:crypto');

const h = (s) => '0x' + crypto.createHash('sha256').update(s).digest('hex');
const hex = (n) => '0x' + n.toString(16);

// The fake node: one chain of blocks, replaceable from any height.
let chain = [];
function block(n, branch, parentHash, txHashes) {
    const hash = h(`block ${n} ${branch}`);
    return {
        number: hex(n), hash, parentHash, timestamp: hex(1_700_000_000 + 2 * n),
        miner: '0x' + '11'.repeat(20), gasUsed: '0x5208', gasLimit: hex(30_000_000),
        size: '0x200', extraData: '0x',
        transactions: txHashes.map((t, i) => ({
            hash: t, from: '0x' + '22'.repeat(20), to: '0x' + '33'.repeat(20), value: '0x1',
            gas: '0x5208', gasPrice: '0x1', input: '0x', nonce: hex(n), transactionIndex: hex(i),
            blockNumber: hex(n),
        })),
    };
}
function build(from, to, branch, txOf) {
    for (let n = from; n <= to; n++) {
        const parent = n === 0 ? '0x' + '00'.repeat(32) : chain[n - 1].hash;
        chain[n] = block(n, branch, parent, txOf(n));
    }
    chain.length = to + 1;
}
const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
        const { id, method, params } = JSON.parse(body);
        let result = null;
        if (method === 'eth_blockNumber') result = hex(chain.length - 1);
        else if (method === 'eth_getBlockByNumber') {
            const b = chain[parseInt(params[0], 16)];
            result = b ? (params[1] ? b : { ...b, transactions: b.transactions.map((t) => t.hash) }) : null;
        } else if (method === 'eth_getTransactionReceipt') {
            result = { transactionHash: params[0], status: '0x1', gasUsed: '0x5208', contractAddress: null };
        } else if (method === 'eth_getLogs') result = [];
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ jsonrpc: '2.0', id, result }));
    });
});

test('a branch switch on the node is undone in the index', async (t) => {
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    process.env.RPC_URL = `http://127.0.0.1:${server.address().port}`;
    process.env.BATCH_SIZE = '8';
    const ix = require('../indexer');
    t.after(async () => { server.close(); await ix.pool.end(); });
    await ix.pool.query('DROP TABLE IF EXISTS indexer_state, blocks, transactions, token_transfers, verified_contracts');
    await ix.initSchema();
    const q = async (sql, p) => (await ix.pool.query(sql, p)).rows;

    // Branch A: blocks 0-30, one transaction each.
    build(0, 30, 'A', (n) => [h(`tx A ${n}`)]);
    await ix.indexChain();
    assert.strictEqual(await ix.getState('last_indexed_block'), '30');
    assert.strictEqual((await q('SELECT count(*)::int AS c FROM transactions'))[0].c, 31);

    // The node follows branch B from block 21 (longer, to 35). Block 27 of B
    // re-includes the transaction of A's block 25 (resubmitted from the mempool).
    build(21, 35, 'B', (n) => (n === 27 ? [h('tx A 25'), h(`tx B ${n}`)] : [h(`tx B ${n}`)]));
    await ix.indexChain();
    assert.strictEqual(await ix.getState('last_indexed_block'), '35');
    const blocks = await q('SELECT number::int AS n, hash FROM blocks ORDER BY number');
    assert.strictEqual(blocks.length, 36);
    for (const b of blocks) assert.strictEqual(b.hash, chain[b.n].hash, `block ${b.n}`);
    const aLeft = await q("SELECT hash FROM transactions WHERE block_number >= 21 AND hash = ANY($1)",
        [[...Array(10).keys()].map((i) => h(`tx A ${21 + i}`))]);
    assert.deepStrictEqual(aLeft.map((r) => r.hash), [h('tx A 25')], 'only the re-included A transaction');
    const moved = await q('SELECT block_number::int AS n FROM transactions WHERE hash = $1', [h('tx A 25')]);
    assert.deepStrictEqual(moved, [{ n: 27 }]);
    assert.strictEqual((await q('SELECT count(*)::int AS c FROM transactions'))[0].c, 21 + 15 + 1);

    // A shorter switch, deeper than one batch, while nothing new arrives.
    build(5, 35, 'C', (n) => [h(`tx C ${n}`)]);
    await ix.indexChain();
    const top = await q('SELECT number::int AS n, hash FROM blocks ORDER BY number DESC LIMIT 1');
    assert.deepStrictEqual(top, [{ n: 35, hash: chain[35].hash }]);
    assert.strictEqual((await q("SELECT count(*)::int AS c FROM transactions WHERE hash LIKE '0x%' AND block_number >= 5"))[0].c, 31);

    // No switch: nothing removed, nothing re-indexed.
    const before = (await q('SELECT count(*)::int AS c FROM blocks'))[0].c;
    await ix.indexChain();
    assert.strictEqual((await q('SELECT count(*)::int AS c FROM blocks'))[0].c, before);
});
