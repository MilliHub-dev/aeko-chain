import { decodeBase58, encodeBase58, parseBase64 } from './base58';
const TOKEN_721_PROGRAM_ID_BYTES = new Uint8Array(new Array(32).fill(10));
function formatPubkey(bytes) {
    return encodeBase58(bytes);
}
function createReader(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = 0;
    const ensure = (length) => {
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
        readVec(readItem) {
            const length = this.readU32();
            const items = [];
            for (let i = 0; i < length; i += 1) {
                items.push(readItem());
            }
            return items;
        },
    };
}
function readMetadata(reader) {
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
function accountBytes(account) {
    const data = Array.isArray(account.data) ? account.data[0] : account.data;
    return parseBase64(data);
}
function token721ProgramId() {
    return formatPubkey(TOKEN_721_PROGRAM_ID_BYTES);
}
export function validateProgramOwner(owner) {
    const expectedOwner = token721ProgramId();
    return {
        expectedOwner,
        matches: owner === expectedOwner,
    };
}
export function decodeToken721Collection(account) {
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
export function decodeToken721Token(account) {
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
export async function getProgramAccounts(connection, programId) {
    return connection.getProgramAccounts(programId);
}
export async function getTokenAccountsByOwner(connection, owner, filter) {
    return connection.getTokenAccountsByOwner(owner, filter);
}
export async function getToken721Collection(connection, account) {
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
export async function getToken721Token(connection, account) {
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
export function derivePublicKeyString(bytes) {
    return encodeBase58(bytes);
}
export function publicKeyBytes(value) {
    return decodeBase58(value);
}
