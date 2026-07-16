// Solidity source verification for the Mersennet explorer.
//
// Etherscan-style: compile submitted source with the requested settings, then
// compare the compiled runtime bytecode against the on-chain code. Two wrinkles
// have to be handled or honest contracts fail to verify:
//   1. Immutables — values written at construction (e.g. a token's `decimals`)
//      live in the runtime bytecode. The compiler reports their byte ranges in
//      `immutableReferences`; we zero those ranges on both sides before comparing.
//   2. Metadata — solc appends a CBOR blob (source hash + compiler build). The
//      emscripten (solc-js) build stamps a slightly different build id than a
//      native solc, so the trailing metadata can differ even for identical code.
//      A match after trimming metadata is reported as a "partial" match; a match
//      including metadata is a "full" match. Both mean the code is the deployed code.
const solc = require('solc');

const BUNDLED_VERSION = solc.version(); // e.g. "0.8.20+commit.a1b79de6..."
const MAX_SOURCE_BYTES = 500 * 1024;

function stripHex(s) {
  return (s || '').replace(/^0x/, '').toLowerCase();
}

// Zero out the immutable byte ranges the compiler reported, on a hex string.
function maskImmutables(hex, immutableReferences) {
  if (!immutableReferences) return hex;
  const buf = Buffer.from(hex, 'hex');
  for (const id of Object.keys(immutableReferences)) {
    for (const ref of immutableReferences[id]) {
      for (let i = ref.start; i < ref.start + ref.length && i < buf.length; i++) {
        buf[i] = 0;
      }
    }
  }
  return buf.toString('hex');
}

// Trim the trailing CBOR metadata: its last two bytes hold its own length.
function trimMetadata(hex) {
  if (hex.length < 4) return hex;
  const metaLen = parseInt(hex.slice(-4), 16);
  const totalHexLen = metaLen * 2 + 4; // metadata bytes + the 2-byte length suffix
  return totalHexLen < hex.length ? hex.slice(0, hex.length - totalHexLen) : hex;
}

// Build the solc standard-JSON input from user-supplied settings.
function buildInput(sourceName, source, settings) {
  return {
    language: 'Solidity',
    sources: { [sourceName]: { content: source } },
    settings: {
      optimizer: { enabled: settings.optimizer !== false, runs: settings.runs || 200 },
      viaIR: settings.viaIR === true,
      evmVersion: settings.evmVersion || 'shanghai',
      outputSelection: {
        '*': { '*': ['abi', 'evm.deployedBytecode.object', 'evm.deployedBytecode.immutableReferences'] },
      },
    },
  };
}

// Compile submitted source and check it against on-chain runtime code.
// Returns { ok, matchType, contractName, abi, compilerVersion } or { ok:false, error }.
function verify({ source, contractName, settings }, onchainCode) {
  if (typeof source !== 'string' || !source.trim()) {
    return { ok: false, error: 'source is required' };
  }
  if (Buffer.byteLength(source, 'utf8') > MAX_SOURCE_BYTES) {
    return { ok: false, error: `source exceeds ${MAX_SOURCE_BYTES} bytes` };
  }
  const onchain = stripHex(onchainCode);
  if (!onchain || onchain === '') {
    return { ok: false, error: 'address has no deployed bytecode' };
  }

  let output;
  try {
    output = JSON.parse(solc.compile(JSON.stringify(buildInput('Contract.sol', source, settings || {}))));
  } catch (e) {
    return { ok: false, error: `compiler invocation failed: ${e.message}` };
  }
  const fatal = (output.errors || []).filter((e) => e.severity === 'error');
  if (fatal.length) {
    return { ok: false, error: 'compilation failed', details: fatal.map((e) => e.formattedMessage || e.message) };
  }

  // Search every compiled contract for one whose masked+trimmed runtime code
  // matches the chain. If contractName is given, restrict to it.
  const files = output.contracts || {};
  const candidates = [];
  for (const file of Object.keys(files)) {
    for (const name of Object.keys(files[file])) {
      if (contractName && name !== contractName) continue;
      candidates.push({ name, artifact: files[file][name] });
    }
  }
  if (!candidates.length) {
    return { ok: false, error: contractName ? `contract "${contractName}" not found in source` : 'no contracts in source' };
  }

  for (const { name, artifact } of candidates) {
    const dep = artifact.evm && artifact.evm.deployedBytecode;
    if (!dep || !dep.object) continue;
    const compiled = stripHex(dep.object);
    const imm = dep.immutableReferences || {};

    const cMask = maskImmutables(compiled, imm);
    const oMask = maskImmutables(onchain, imm);
    if (cMask === oMask) {
      return { ok: true, matchType: 'full', contractName: name, abi: artifact.abi, compilerVersion: BUNDLED_VERSION };
    }
    if (trimMetadata(cMask) === trimMetadata(oMask)) {
      return { ok: true, matchType: 'partial', contractName: name, abi: artifact.abi, compilerVersion: BUNDLED_VERSION };
    }
  }

  return { ok: false, error: 'bytecode does not match the deployed contract', triedContracts: candidates.map((c) => c.name) };
}

module.exports = { verify, maskImmutables, trimMetadata, BUNDLED_VERSION, MAX_SOURCE_BYTES };
