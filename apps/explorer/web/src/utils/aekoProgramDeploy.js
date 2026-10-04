import {
  confirmSignature,
  getAccountInfo,
  getBalance,
  getLatestBlockhash,
  getMinimumBalanceForRentExemption,
  sendTransaction,
} from './aekoRpcClient.js';
import {
  CLOCK_SYSVAR_ID,
  RENT_SYSVAR_ID,
  SYSTEM_PROGRAM_ID,
  UPGRADEABLE_LOADER_ID,
  buildSignedLegacyTransaction,
  concatBytes,
  createSystemAccountInstruction,
  decodeBase58,
  encodeBase58,
  encodeU32,
  encodeU64,
  generateEphemeralSigner,
} from './aekoTransaction.js';
import { deriveProgramDataAddress } from './editorApi.js';

const BUFFER_METADATA_BYTES = 37;
const PROGRAM_ACCOUNT_BYTES = 36;
const PROGRAMDATA_METADATA_BYTES = 45;
const WRITE_CHUNK_BYTES = 512;

function decodeBase64(value) {
  const raw = atob(value);
  const output = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) output[index] = raw.charCodeAt(index);
  return output;
}

function loaderInstruction(variant, fields = new Uint8Array(), keys = []) {
  return {
    programId: UPGRADEABLE_LOADER_ID,
    keys,
    data: concatBytes(encodeU32(variant), fields),
  };
}

function initializeBufferInstruction(buffer, authority) {
  return loaderInstruction(0, new Uint8Array(), [
    { address: buffer, isWritable: true },
    { address: authority },
  ]);
}

function writeBufferInstruction(buffer, authority, offset, bytes) {
  return loaderInstruction(
    1,
    concatBytes(encodeU32(offset), encodeU64(bytes.length), bytes),
    [
      { address: buffer, isWritable: true },
      { address: authority, isSigner: true },
    ],
  );
}

function deployInstruction({ payer, program, programData, buffer, authority, maxDataLen }) {
  return loaderInstruction(2, encodeU64(maxDataLen), [
    { address: payer, isSigner: true, isWritable: true },
    { address: programData, isWritable: true },
    { address: program, isWritable: true },
    { address: buffer, isWritable: true },
    { address: RENT_SYSVAR_ID },
    { address: CLOCK_SYSVAR_ID },
    { address: SYSTEM_PROGRAM_ID },
    { address: authority, isSigner: true },
  ]);
}

function upgradeInstruction({ program, programData, buffer, authority, spill }) {
  return loaderInstruction(3, new Uint8Array(), [
    { address: programData, isWritable: true },
    { address: program, isWritable: true },
    { address: buffer, isWritable: true },
    { address: spill, isWritable: true },
    { address: RENT_SYSVAR_ID },
    { address: CLOCK_SYSVAR_ID },
    { address: authority, isSigner: true },
  ]);
}

function decodeAccountData(account) {
  const encoded = account?.data?.[0];
  if (!encoded) throw new Error('Program account did not return base64 account data.');
  return decodeBase64(encoded);
}

function parseUpgradeableProgram(programAccount) {
  if (programAccount?.owner !== UPGRADEABLE_LOADER_ID) {
    throw new Error('Selected program is not owned by the AEKO upgradeable loader.');
  }
  const bytes = decodeAccountData(programAccount);
  if (bytes.length < PROGRAM_ACCOUNT_BYTES) throw new Error('Upgradeable program account is truncated.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 2) throw new Error('Account is not an upgradeable Program account.');
  return encodeBase58(bytes.slice(4, 36));
}

function parseProgramDataAuthority(programDataAccount) {
  if (programDataAccount?.owner !== UPGRADEABLE_LOADER_ID) {
    throw new Error('ProgramData account is not owned by the AEKO upgradeable loader.');
  }
  const bytes = decodeAccountData(programDataAccount);
  if (bytes.length < 13) throw new Error('Upgradeable ProgramData account is truncated.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 3) throw new Error('Account is not upgradeable ProgramData.');
  const option = bytes[12];
  if (option === 0) return null;
  if (option !== 1 || bytes.length < PROGRAMDATA_METADATA_BYTES) {
    throw new Error('ProgramData authority metadata is invalid.');
  }
  return encodeBase58(bytes.slice(13, 45));
}

async function submit({ rpcUrl, wallet, instructions, additionalSigners = [] }) {
  const recentBlockhash = await getLatestBlockhash(rpcUrl);
  if (!recentBlockhash) throw new Error('RPC did not return a recent blockhash.');
  const transaction = buildSignedLegacyTransaction({
    feePayer: wallet,
    recentBlockhash,
    instructions,
    additionalSigners,
  });
  const signature = await sendTransaction(rpcUrl, transaction);
  await confirmSignature(rpcUrl, signature, { attempts: 40, intervalMs: 750 });
  return signature;
}

async function createAndFillBuffer({ rpcUrl, wallet, programBytes, onProgress }) {
  const buffer = generateEphemeralSigner();
  const rent = await getMinimumBalanceForRentExemption(
    rpcUrl,
    BUFFER_METADATA_BYTES + programBytes.length,
  );

  onProgress?.({ stage: 'buffer', message: 'Creating upgradeable program buffer…', progress: 5 });
  const createSignature = await submit({
    rpcUrl,
    wallet,
    additionalSigners: [buffer],
    instructions: [
      createSystemAccountInstruction({
        from: wallet.address,
        newAccount: buffer.address,
        lamports: rent,
        space: BUFFER_METADATA_BYTES + programBytes.length,
        owner: UPGRADEABLE_LOADER_ID,
      }),
      initializeBufferInstruction(buffer.address, wallet.address),
    ],
  });

  const totalChunks = Math.ceil(programBytes.length / WRITE_CHUNK_BYTES);
  const writeSignatures = [];
  for (let index = 0; index < totalChunks; index += 1) {
    const offset = index * WRITE_CHUNK_BYTES;
    const chunk = programBytes.slice(offset, offset + WRITE_CHUNK_BYTES);
    onProgress?.({
      stage: 'write',
      message: `Writing program bytes ${index + 1}/${totalChunks}…`,
      progress: 10 + Math.round(((index + 1) / totalChunks) * 65),
    });
    const signature = await submit({
      rpcUrl,
      wallet,
      instructions: [
        writeBufferInstruction(buffer.address, wallet.address, offset, chunk),
      ],
    });
    writeSignatures.push(signature);
  }

  return { buffer, createSignature, writeSignatures };
}

function assertDeployable({ network, artifact, wallet }) {
  if (!wallet?.address) throw new Error('Select a development wallet before deploying.');
  if (!artifact?.base64) throw new Error('Build the project successfully before deploying.');
  if (network === 'mainnet') {
    throw new Error('Browser editor deployment is intentionally disabled on AEKO Mainnet.');
  }
}

export async function deployProgram({
  network,
  rpcUrl,
  apiUrl,
  wallet,
  artifact,
  onProgress,
}) {
  assertDeployable({ network, artifact, wallet });
  const programBytes = decodeBase64(artifact.base64);
  const maxDataLen = Math.max(programBytes.length, programBytes.length * 2);
  const program = generateEphemeralSigner();
  const { programDataAddress } = await deriveProgramDataAddress(apiUrl, program.address);

  const [bufferRent, programRent, programDataRent, balance] = await Promise.all([
    getMinimumBalanceForRentExemption(rpcUrl, BUFFER_METADATA_BYTES + programBytes.length),
    getMinimumBalanceForRentExemption(rpcUrl, PROGRAM_ACCOUNT_BYTES),
    getMinimumBalanceForRentExemption(rpcUrl, PROGRAMDATA_METADATA_BYTES + maxDataLen),
    getBalance(rpcUrl, wallet.address),
  ]);
  const minimum = bufferRent + programRent + programDataRent;
  if (balance <= minimum) {
    throw new Error(
      `Wallet balance is too low for program rent. Need more than ${minimum} lamports before transaction fees.`,
    );
  }

  const bufferResult = await createAndFillBuffer({
    rpcUrl,
    wallet,
    programBytes,
    onProgress,
  });

  onProgress?.({ stage: 'deploy', message: 'Finalizing upgradeable program…', progress: 90 });
  const deploySignature = await submit({
    rpcUrl,
    wallet,
    additionalSigners: [program],
    instructions: [
      createSystemAccountInstruction({
        from: wallet.address,
        newAccount: program.address,
        lamports: programRent,
        space: PROGRAM_ACCOUNT_BYTES,
        owner: UPGRADEABLE_LOADER_ID,
      }),
      deployInstruction({
        payer: wallet.address,
        program: program.address,
        programData: programDataAddress,
        buffer: bufferResult.buffer.address,
        authority: wallet.address,
        maxDataLen,
      }),
    ],
  });

  onProgress?.({ stage: 'confirmed', message: 'Program deployed and confirmed.', progress: 100 });
  return {
    programId: program.address,
    programDataAddress,
    authority: wallet.address,
    signature: deploySignature,
    bufferSignature: bufferResult.createSignature,
    writeSignatures: bufferResult.writeSignatures,
    maxDataLen,
  };
}

export async function upgradeProgram({
  network,
  rpcUrl,
  wallet,
  programId,
  artifact,
  onProgress,
}) {
  assertDeployable({ network, artifact, wallet });
  if (!programId) throw new Error('A deployed program id is required for upgrade.');

  onProgress?.({ stage: 'verify', message: 'Verifying upgrade authority…', progress: 2 });
  const programAccount = await getAccountInfo(rpcUrl, programId);
  if (!programAccount) throw new Error('Program account was not found on the selected network.');
  const programDataAddress = parseUpgradeableProgram(programAccount);
  const programDataAccount = await getAccountInfo(rpcUrl, programDataAddress);
  if (!programDataAccount) throw new Error('ProgramData account was not found on the selected network.');
  const authority = parseProgramDataAuthority(programDataAccount);
  if (!authority) throw new Error('This program is immutable and cannot be upgraded.');
  if (authority !== wallet.address) {
    throw new Error(`Selected wallet is not the program upgrade authority. Authority: ${authority}`);
  }

  const programBytes = decodeBase64(artifact.base64);
  const bufferResult = await createAndFillBuffer({
    rpcUrl,
    wallet,
    programBytes,
    onProgress,
  });

  onProgress?.({ stage: 'upgrade', message: 'Applying program upgrade…', progress: 92 });
  const signature = await submit({
    rpcUrl,
    wallet,
    instructions: [
      upgradeInstruction({
        program: programId,
        programData: programDataAddress,
        buffer: bufferResult.buffer.address,
        authority: wallet.address,
        spill: wallet.address,
      }),
    ],
  });

  onProgress?.({ stage: 'confirmed', message: 'Program upgrade confirmed.', progress: 100 });
  return {
    programId,
    programDataAddress,
    authority,
    signature,
    bufferSignature: bufferResult.createSignature,
    writeSignatures: bufferResult.writeSignatures,
  };
}

export function validateProgramArtifactBase64(value) {
  const bytes = decodeBase64(value);
  if (bytes.length < 4 || bytes[0] !== 0x7f || String.fromCharCode(...bytes.slice(1, 4)) !== 'ELF') {
    throw new Error('Build artifact is not an ELF/SBF program.');
  }
  return bytes.length;
}

export function isValidProgramId(value) {
  try {
    return decodeBase58(value).length === 32;
  } catch {
    return false;
  }
}
