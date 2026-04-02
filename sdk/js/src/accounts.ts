import { decodeBase58, encodeBase58, parseBase64 } from './base58';
import { AekoConnection } from './connection';
import type {
  AccountInfoValue,
  ProgramAccount,
  PublicKeyString,
  TokenAccountOwnerResult,
} from './types';

const TOKEN_721_PROGRAM_ID_BYTES = new Uint8Array(new Array(32).fill(10));

export interface MetadataAttribute {
  traitType: string;
  value: string;
}

export interface Token721Metadata {
  name: string;
  description: string | null;
  uri: string;
  imageUri: string | null;
  attributes: MetadataAttribute[];
}

export interface DecodedToken721Collection {
  authority: PublicKeyString;
  name: string;
  symbol: string;
  baseUri: string | null;
  totalMinted: number;
  isInitialized: boolean;
}

export interface DecodedToken721Token {
  collection: PublicKeyString;
  tokenId: number;
  owner: PublicKeyString;
  creator: PublicKeyString;
  royaltyBps: number;
  metadata: Token721Metadata;
  frozen: boolean;
  isInitialized: boolean;
}

function formatPubkey(bytes: Uint8Array): string {
  return encodeBase58(bytes);
}

function createReader(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;

  const ensure = (length: number) => {
    if (offset + length > bytes.length) {
      throw new Error('Account data ended unexpectedly while decoding Borsh payload.');
    }
  };

  return {
    readU8() {
      ensure(1);
      const value = view.getUint8(offset);
      offset += 1;
      return value;
    },
    readU16() {
      ensure(2);
      const value = view.getUint16(offset, true);
      offset += 2;
      return value;
    },
    readU32() {
      ensure(4);
      const value = view.getUint32(offset, true);
      offset += 4;
      return value;
    },
    readU64() {
      ensure(8);
      const value = view.getBigUint64(offset, true);
      offset += 8;
      return Number(value);
    },
    readBool() {
      return this.readU8() === 1;
    },
    readPubkey() {
      ensure(32);
      const value = bytes.slice(offset, offset + 32);
      offset += 32;
      return formatPubkey(value);
    },
    readString() {
      const length = this.readU32();
      ensure(length);
      const value = new TextDecoder().decode(bytes.slice(offset, offset + length));
      offset += length;
      return value;
    },
    readOptionString() {
      const hasValue = this.readU8();
      return hasValue ? this.readString() : null;
    },
    readVec<T>(readItem: () => T) {
      const length = this.readU32();
      const items: T[] = [];
      for (let i = 0; i < length; i += 1) {
        items.push(readItem());
      }
      return items;
    },
  };
}

function readMetadata(reader: ReturnType<typeof createReader>): Token721Metadata {
  return {
    name: reader.readString(),
    description: reader.readOptionString(),
    uri: reader.readString(),
    imageUri: reader.readOptionString(),
    attributes: reader.readVec(() => ({
      traitType: reader.readString(),
      value: reader.readString(),
    })),
  };
}

function accountBytes(account: AccountInfoValue): Uint8Array {
  const data = Array.isArray(account.data) ? account.data[0] : account.data;
  return parseBase64(data);
}

function token721ProgramId(): PublicKeyString {
  return formatPubkey(TOKEN_721_PROGRAM_ID_BYTES);
}

export function validateProgramOwner(owner: PublicKeyString): {
  expectedOwner: PublicKeyString;
  matches: boolean;
} {
  const expectedOwner = token721ProgramId();
  return {
    expectedOwner,
    matches: owner === expectedOwner,
  };
}

export function decodeToken721Collection(account: AccountInfoValue): DecodedToken721Collection {
  const reader = createReader(accountBytes(account));
  return {
    authority: reader.readPubkey(),
    name: reader.readString(),
    symbol: reader.readString(),
    baseUri: reader.readOptionString(),
    totalMinted: reader.readU64(),
    isInitialized: reader.readBool(),
  };
}

export function decodeToken721Token(account: AccountInfoValue): DecodedToken721Token {
  const reader = createReader(accountBytes(account));
  return {
    collection: reader.readPubkey(),
    tokenId: reader.readU64(),
    owner: reader.readPubkey(),
    creator: reader.readPubkey(),
    royaltyBps: reader.readU16(),
    metadata: readMetadata(reader),
    frozen: reader.readBool(),
    isInitialized: reader.readBool(),
  };
}

export async function getProgramAccounts(
  connection: AekoConnection,
  programId: PublicKeyString,
): Promise<ProgramAccount[]> {
  return connection.getProgramAccounts(programId);
}

export async function getTokenAccountsByOwner(
  connection: AekoConnection,
  owner: PublicKeyString,
  filter: { mint?: PublicKeyString; programId?: PublicKeyString },
): Promise<TokenAccountOwnerResult[]> {
  return connection.getTokenAccountsByOwner(owner, filter);
}

export async function getToken721Collection(
  connection: AekoConnection,
  account: PublicKeyString,
): Promise<DecodedToken721Collection> {
  const info = await connection.getAccountInfo(account);
  if (!info) {
    throw new Error(`Collection account ${account} was not found.`);
  }
  const ownerCheck = validateProgramOwner(info.owner);
  if (!ownerCheck.matches) {
    throw new Error(`Collection account ${account} is not owned by the AEKO-721 program.`);
  }
  return decodeToken721Collection(info);
}

export async function getToken721Token(
  connection: AekoConnection,
  account: PublicKeyString,
): Promise<DecodedToken721Token> {
  const info = await connection.getAccountInfo(account);
  if (!info) {
    throw new Error(`Token account ${account} was not found.`);
  }
  const ownerCheck = validateProgramOwner(info.owner);
  if (!ownerCheck.matches) {
    throw new Error(`Token account ${account} is not owned by the AEKO-721 program.`);
  }
  return decodeToken721Token(info);
}

export function derivePublicKeyString(bytes: Uint8Array): PublicKeyString {
  return encodeBase58(bytes);
}

export function publicKeyBytes(value: PublicKeyString): Uint8Array {
  return decodeBase58(value);
}
