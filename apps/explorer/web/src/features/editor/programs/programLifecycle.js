import {
  confirmSignature,
  getAccountInfo,
  getBalance,
  getLatestBlockhash,
  getMinimumBalanceForRentExemption,
  sendTransaction,
} from '../../../utils/aekoRpcClient.js';
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
} from '../../../utils/aekoTransaction.js';
import { deriveProgramDataAddress } from '../runtime/editorApi.js';

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

function closeInstruction({ closeAddress, recipient, authority, program = null }) {
  return loaderInstruction(5, new Uint8Array(), [
    { address: closeAddress, isWritable: true },
    { address: recipient, isWritable: true },
    ...(authority ? [{ address: authority, isSigner: true }] : []),
    ...(program ? [{ address: program, isWritable: true }] : []),
  ]);
}

function extendProgramInstruction({ program, programData, payer, additionalBytes }) {
  return loaderInstruction(6, encodeU32(additionalBytes), [
    { address: programData, isWritable: true },
    { address: program, isWritable: true },
    { address: SYSTEM_PROGRAM_ID },
    { address: payer, isSigner: true, isWritable: true },
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

function parseProgramDataState(programDataAccount) {
  if (programDataAccount?.owner !== UPGRADEABLE_LOADER_ID) {
    throw new Error('ProgramData account is not owned by the AEKO upgradeable loader.');
  }
  const bytes = decodeAccountData(programDataAccount);
  if (bytes.length < 13) throw new Error('Upgradeable ProgramData account is truncated.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 3) throw new Error('Account is not upgradeable ProgramData.');
  const option = bytes[12];
  let authority = null;
  if (option === 1) {
    if (bytes.length < PROGRAMDATA_METADATA_BYTES) {
      throw new Error('ProgramData authority metadata is invalid.');
    }
    authority = encodeBase58(bytes.slice(13, 45));
  } else if (option !== 0) {
    throw new Error('ProgramData authority metadata is invalid.');
  }
  return {
    authority,
    capacity: Math.max(0, bytes.length - PROGRAMDATA_METADATA_BYTES),
  };
}

function attachRecovery(error, bufferAddress) {
  const wrapped = error instanceof Error
    ? error
    : new Error(String(error || 'Program deployment failed.'));
  return Object.assign(wrapped, { recoveryBufferAddress: bufferAddress });
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
  try {
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
  } catch (error) {
    throw attachRecovery(error, buffer.address);
  }
}

function assertWritableLifecycle({ network, wallet }) {
  if (!wallet?.address) throw new Error('Select a development wallet first.');
  if (network === 'mainnet') {
    throw new Error('Browser editor program writes are intentionally disabled on AEKO Mainnet.');
  }
}

function assertDeployable({ network, artifact, wallet }) {
  assertWritableLifecycle({ network, wallet });
  if (!artifact?.base64) throw new Error('Build the project successfully before deploying.');
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
  let deploySignature;
  try {
    deploySignature = await submit({
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
  } catch (error) {
    throw attachRecovery(error, bufferResult.buffer.address);
  }

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
  const programDataState = parseProgramDataState(programDataAccount);
  const authority = programDataState.authority;
  if (!authority) throw new Error('This program is immutable and cannot be upgraded.');
  if (authority !== wallet.address) {
    throw new Error(`Selected wallet is not the program upgrade authority. Authority: ${authority}`);
  }

  const programBytes = decodeBase64(artifact.base64);
  if (programBytes.length > programDataState.capacity) {
    const targetCapacity = Math.max(programBytes.length, programBytes.length * 2);
    const additionalBytes = targetCapacity - programDataState.capacity;
    if (additionalBytes > 0xffffffff) {
      throw new Error('Program growth exceeds the upgradeable loader extension limit.');
    }
    onProgress?.({
      stage: 'extend',
      message: `Extending ProgramData capacity by ${additionalBytes.toLocaleString()} bytes…`,
      progress: 4,
    });
    await submit({
      rpcUrl,
      wallet,
      instructions: [
        extendProgramInstruction({
          program: programId,
          programData: programDataAddress,
          payer: wallet.address,
          additionalBytes,
        }),
      ],
    });
  }

  const bufferResult = await createAndFillBuffer({
    rpcUrl,
    wallet,
    programBytes,
    onProgress,
  });

  onProgress?.({ stage: 'upgrade', message: 'Applying program upgrade…', progress: 92 });
  let signature;
  try {
    signature = await submit({
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
  } catch (error) {
    throw attachRecovery(error, bufferResult.buffer.address);
  }

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

export async function recoverProgramBuffer({
  network,
  rpcUrl,
  wallet,
  bufferAddress,
  onProgress,
}) {
  assertWritableLifecycle({ network, wallet });
  if (!bufferAddress) throw new Error('No recoverable buffer address was supplied.');

  onProgress?.({ stage: 'recover', message: 'Checking interrupted deployment buffer…', progress: 20 });
  const account = await getAccountInfo(rpcUrl, bufferAddress);
  if (!account) {
    onProgress?.({ stage: 'recover', message: 'Buffer is already consumed or closed.', progress: 100 });
    return { bufferAddress, signature: null, alreadyClosed: true };
  }
  if (account.owner !== UPGRADEABLE_LOADER_ID) {
    throw new Error('Recovery address is not owned by the AEKO upgradeable loader.');
  }

  const signature = await submit({
    rpcUrl,
    wallet,
    instructions: [
      closeInstruction({
        closeAddress: bufferAddress,
        recipient: wallet.address,
        authority: wallet.address,
      }),
    ],
  });
  onProgress?.({ stage: 'recover', message: 'Recovered buffer rent to the development wallet.', progress: 100 });
  return { bufferAddress, signature, alreadyClosed: false };
}

export async function closeProgram({
  network,
  rpcUrl,
  wallet,
  programId,
  onProgress,
}) {
  assertWritableLifecycle({ network, wallet });
  if (!programId) throw new Error('A deployed program id is required.');

  onProgress?.({ stage: 'verify', message: 'Verifying program close authority…', progress: 10 });
  const programAccount = await getAccountInfo(rpcUrl, programId);
  if (!programAccount) {
    return { programId, signature: null, alreadyClosed: true };
  }
  const programDataAddress = parseUpgradeableProgram(programAccount);
  const programDataAccount = await getAccountInfo(rpcUrl, programDataAddress);
  if (!programDataAccount) throw new Error('ProgramData account was not found on the selected network.');
  const { authority } = parseProgramDataState(programDataAccount);
  if (!authority) throw new Error('This program is immutable and cannot be closed by an upgrade authority.');
  if (authority !== wallet.address) {
    throw new Error(`Selected wallet is not the program close authority. Authority: ${authority}`);
  }

  onProgress?.({ stage: 'close', message: 'Closing program and recovering program rent…', progress: 70 });
  const signature = await submit({
    rpcUrl,
    wallet,
    instructions: [
      closeInstruction({
        closeAddress: programDataAddress,
        recipient: wallet.address,
        authority: wallet.address,
        program: programId,
      }),
    ],
  });
  onProgress?.({ stage: 'close', message: 'Program closed and rent recovered.', progress: 100 });
  return { programId, programDataAddress, signature, alreadyClosed: false };
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
