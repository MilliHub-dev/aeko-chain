import { decodeBase58, encodeBase58 } from './base58';
const SYSTEM_PROGRAM_ID_BYTES = new Uint8Array(32);
const TOKEN_721_PROGRAM_ID_BYTES = new Uint8Array(new Array(32).fill(10));
const WALLET_PERMISSIONS_PROGRAM_ID_BYTES = new Uint8Array(new Array(32).fill(10));
const NFT_MARKETPLACE_PROGRAM_ID_BYTES = new Uint8Array(new Array(32).fill(11));
function encodeBase64(bytes) {
    let raw = '';
    for (const byte of bytes) {
        raw += String.fromCharCode(byte);
    }
    return btoa(raw);
}
function concatBytes(...parts) {
    const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
    const merged = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of parts) {
        merged.set(part, offset);
        offset += part.length;
    }
    return merged;
}
function encodeShortVec(value) {
    const bytes = [];
    let remaining = value >>> 0;
    while (true) {
        let next = remaining & 0x7f;
        remaining >>>= 7;
        if (remaining > 0)
            next |= 0x80;
        bytes.push(next);
        if (remaining === 0)
            break;
    }
    return Uint8Array.from(bytes);
}
function encodeU16(value) {
    const bytes = new Uint8Array(2);
    new DataView(bytes.buffer).setUint16(0, value, true);
    return bytes;
}
function encodeU32(value) {
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setUint32(0, value, true);
    return bytes;
}
function encodeU64(value) {
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setBigUint64(0, BigInt(value), true);
    return bytes;
}
function encodeString(value) {
    const encoded = new TextEncoder().encode(value);
    return concatBytes(encodeU32(encoded.length), encoded);
}
function encodeBincodeString(value) {
    const encoded = new TextEncoder().encode(value);
    return concatBytes(encodeU64(encoded.length), encoded);
}
function encodeOptionString(value) {
    if (!value)
        return Uint8Array.from([0]);
    return concatBytes(Uint8Array.from([1]), encodeString(value));
}
function encodeBool(value) {
    return Uint8Array.from([value ? 1 : 0]);
}
function encodePubkey(value) {
    return decodeBase58(value);
}
function encodeVec(items, encodeItem) {
    return concatBytes(encodeU32(items.length), ...items.map(encodeItem));
}
function encodeOptionU16(value) {
    if (value === null || typeof value === 'undefined')
        return Uint8Array.from([0]);
    return concatBytes(Uint8Array.from([1]), encodeU16(value));
}
function encodeOptionU64(value) {
    if (value === null || typeof value === 'undefined')
        return Uint8Array.from([0]);
    return concatBytes(Uint8Array.from([1]), encodeU64(value));
}
function encodeNestedOptionString(value) {
    if (typeof value === 'undefined')
        return Uint8Array.from([0]);
    if (value === null)
        return Uint8Array.from([1, 0]);
    return concatBytes(Uint8Array.from([1, 1]), encodeString(value));
}
function encodeNestedOptionU64(value) {
    if (typeof value === 'undefined')
        return Uint8Array.from([0]);
    if (value === null)
        return Uint8Array.from([1, 0]);
    return concatBytes(Uint8Array.from([1, 1]), encodeU64(value));
}
function encodeOptionBool(value) {
    if (typeof value === 'undefined')
        return Uint8Array.from([0]);
    return concatBytes(Uint8Array.from([1]), encodeBool(value));
}
function encodeOptionRole(value) {
    if (typeof value === 'undefined')
        return Uint8Array.from([0]);
    return concatBytes(Uint8Array.from([1]), encodePermissionRole(value));
}
function encodeOptionSpendLimit(value) {
    if (typeof value === 'undefined')
        return Uint8Array.from([0]);
    return concatBytes(Uint8Array.from([1]), encodeSpendLimitPolicy(value));
}
function encodeOptionPubkey(value) {
    if (!value)
        return Uint8Array.from([0]);
    return concatBytes(Uint8Array.from([1]), encodePubkey(value));
}
function encodeOptionPubkeyVec(value) {
    if (typeof value === 'undefined')
        return Uint8Array.from([0]);
    return concatBytes(Uint8Array.from([1]), encodeVec(value, encodePubkey));
}
function encodeOptionStringVec(value) {
    if (typeof value === 'undefined')
        return Uint8Array.from([0]);
    return concatBytes(Uint8Array.from([1]), encodeVec(value, encodeHashString));
}
function encodeHashString(value) {
    const normalized = value.replace(/^0x/i, '');
    if (normalized.length !== 64) {
        throw new Error('App scope hashes must be 32-byte hex strings.');
    }
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i += 1) {
        bytes[i] = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}
function encodeProgramPolicyMode(value) {
    return Uint8Array.from([value === 'allow_by_default' ? 1 : 0]);
}
function encodePermissionRole(value) {
    switch (value) {
        case 'owner':
            return Uint8Array.from([0]);
        case 'spender':
            return Uint8Array.from([1]);
        case 'viewer':
            return Uint8Array.from([2]);
    }
}
function encodePermissionStatus(value) {
    switch (value) {
        case 'active':
            return Uint8Array.from([0]);
        case 'revoked':
            return Uint8Array.from([1]);
        case 'expired':
            return Uint8Array.from([2]);
        case 'frozen':
            return Uint8Array.from([3]);
    }
}
function encodeTokenSpendCap(value) {
    return concatBytes(encodePubkey(value.mint), encodeOptionU64(value.maxSingleTx), encodeOptionU64(value.maxDaily));
}
function encodeSpendLimitPolicy(value) {
    return concatBytes(encodeOptionU64(value.maxSingleTxAeko), encodeOptionU64(value.maxDailyAeko), encodeVec(value.tokenCaps, encodeTokenSpendCap));
}
function encodeDelegatePermission(value) {
    return concatBytes(encodePubkey(value.delegate), encodePermissionRole(value.role), encodeOptionString(value.label ?? null), encodePermissionStatus(value.status), encodeU64(value.validFromEpoch), encodeOptionU64(value.validUntilEpoch), encodeSpendLimitPolicy(value.spendLimit), encodeVec(value.programAllowlist, encodePubkey), encodeVec(value.tokenAllowlist, encodePubkey), encodeVec(value.appScopeHashes, encodeHashString), encodeBool(value.requiresReauth), encodeOptionU64(undefined), encodeOptionU64(undefined));
}
function encodeMetadata(metadata) {
    const attributes = metadata.attributes ?? [];
    return concatBytes(encodeString(metadata.name), encodeOptionString(metadata.description ?? null), encodeString(metadata.uri), encodeOptionString(metadata.imageUri ?? null), encodeU32(attributes.length), ...attributes.map((attribute) => concatBytes(encodeString(attribute.traitType), encodeString(attribute.value))));
}
function encodeInstructionData(action, args) {
    switch (action) {
        case 'initializeCollection':
            return concatBytes(Uint8Array.from([0]), encodeString(args.name ?? ''), encodeString(args.symbol ?? ''), encodeOptionString(args.baseUri ?? null));
        case 'mint':
            return concatBytes(Uint8Array.from([1]), encodeU64(args.tokenId ?? 0), decodeBase58(args.owner ?? ''), decodeBase58(args.creator ?? ''), encodeU16(args.royaltyBps ?? 0), encodeMetadata(args.metadata ?? { name: '', uri: '' }));
        case 'freeze':
            return Uint8Array.from([2]);
        case 'thaw':
            return Uint8Array.from([3]);
        case 'transfer':
            return concatBytes(Uint8Array.from([4]), decodeBase58(args.newOwner ?? ''));
        case 'update':
            return concatBytes(Uint8Array.from([5]), encodeMetadata(args.metadata ?? { name: '', uri: '' }));
    }
}
function compileInstruction(input) {
    if (input.action === 'initializeCollection') {
        return {
            programId: TOKEN_721_PROGRAM_ID_BYTES,
            accounts: [
                { pubkey: decodeBase58(input.collection ?? ''), isSigner: false, isWritable: true },
                { pubkey: decodeBase58(input.authority), isSigner: true, isWritable: false },
            ],
            data: encodeInstructionData(input.action, {
                name: input.metadata.name,
                symbol: input.metadata.symbol ?? '',
                baseUri: input.metadata.baseUri ?? null,
            }),
        };
    }
    if (input.action === 'mint') {
        return {
            programId: TOKEN_721_PROGRAM_ID_BYTES,
            accounts: [
                { pubkey: decodeBase58(input.collection ?? ''), isSigner: false, isWritable: true },
                { pubkey: decodeBase58(input.token ?? ''), isSigner: false, isWritable: true },
                { pubkey: decodeBase58(input.authority), isSigner: true, isWritable: false },
            ],
            data: encodeInstructionData(input.action, {
                tokenId: input.tokenId,
                owner: input.owner,
                creator: input.authority,
                royaltyBps: input.royaltyBps,
                metadata: input.metadata,
            }),
        };
    }
    if (input.action === 'freeze' || input.action === 'thaw') {
        return {
            programId: TOKEN_721_PROGRAM_ID_BYTES,
            accounts: [
                { pubkey: decodeBase58(input.token ?? ''), isSigner: false, isWritable: true },
                { pubkey: decodeBase58(input.authority), isSigner: true, isWritable: false },
            ],
            data: encodeInstructionData(input.action, {}),
        };
    }
    if (input.action === 'transfer') {
        return {
            programId: TOKEN_721_PROGRAM_ID_BYTES,
            accounts: [
                { pubkey: decodeBase58(input.token ?? ''), isSigner: false, isWritable: true },
                { pubkey: decodeBase58(input.owner ?? ''), isSigner: true, isWritable: false },
            ],
            data: encodeInstructionData(input.action, { newOwner: input.recipient }),
        };
    }
    return {
        programId: TOKEN_721_PROGRAM_ID_BYTES,
        accounts: [
            { pubkey: decodeBase58(input.token ?? ''), isSigner: false, isWritable: true },
            { pubkey: decodeBase58(input.authority), isSigner: true, isWritable: false },
        ],
        data: encodeInstructionData('update', { metadata: input.metadata }),
    };
}
function buildCreateAccountWithSeedInstruction(input) {
    return {
        programId: SYSTEM_PROGRAM_ID_BYTES,
        accounts: [
            { pubkey: decodeBase58(input.payer), isSigner: true, isWritable: true },
            { pubkey: decodeBase58(input.createdAccount), isSigner: false, isWritable: true },
            { pubkey: decodeBase58(input.base), isSigner: true, isWritable: false },
        ],
        data: concatBytes(encodeU32(3), decodeBase58(input.base), encodeBincodeString(input.seed), encodeU64(input.lamports), encodeU64(input.space), decodeBase58(input.ownerProgram)),
    };
}
function buildLegacyMessage(input) {
    const payerBytes = decodeBase58(input.payer);
    const blockhashBytes = decodeBase58(input.recentBlockhash);
    const metas = new Map();
    const track = (pubkeyBytes, flags) => {
        const key = Array.from(pubkeyBytes).join(',');
        const current = metas.get(key);
        if (current) {
            current.isSigner ||= flags.isSigner;
            current.isWritable ||= flags.isWritable;
            return;
        }
        metas.set(key, { pubkey: pubkeyBytes, isSigner: flags.isSigner, isWritable: flags.isWritable });
    };
    track(payerBytes, { isSigner: true, isWritable: true });
    input.instructions.forEach((instruction) => {
        instruction.accounts.forEach((account) => track(account.pubkey, account));
        track(instruction.programId, { isSigner: false, isWritable: false });
    });
    const payerKey = Array.from(payerBytes).join(',');
    const payerMeta = metas.get(payerKey);
    metas.delete(payerKey);
    const remaining = Array.from(metas.values());
    const ordered = [
        payerMeta,
        ...remaining.filter((meta) => meta.isSigner && meta.isWritable),
        ...remaining.filter((meta) => meta.isSigner && !meta.isWritable),
        ...remaining.filter((meta) => !meta.isSigner && meta.isWritable),
        ...remaining.filter((meta) => !meta.isSigner && !meta.isWritable),
    ].filter(Boolean);
    const accountIndex = new Map(ordered.map((meta, index) => [Array.from(meta.pubkey).join(','), index]));
    const header = Uint8Array.from([
        ordered.filter((meta) => meta.isSigner).length,
        ordered.filter((meta) => !meta.isSigner && !meta.isWritable).length,
        ordered.filter((meta) => meta.isSigner && !meta.isWritable).length,
    ]);
    const compiledInstructions = input.instructions.map((instruction) => concatBytes(Uint8Array.from([
        accountIndex.get(Array.from(instruction.programId).join(',')) ?? 0,
    ]), encodeShortVec(instruction.accounts.length), Uint8Array.from(instruction.accounts.map((account) => accountIndex.get(Array.from(account.pubkey).join(',')) ?? 0)), encodeShortVec(instruction.data.length), instruction.data));
    return {
        messageBytes: concatBytes(header, encodeShortVec(ordered.length), ...ordered.map((meta) => meta.pubkey), blockhashBytes, encodeShortVec(compiledInstructions.length), ...compiledInstructions),
        numSigners: ordered.filter((meta) => meta.isSigner).length,
    };
}
function buildPreparedTransaction(input) {
    const { messageBytes, numSigners } = buildLegacyMessage(input);
    const signatureSection = concatBytes(encodeShortVec(numSigners), ...Array.from({ length: numSigners }, () => new Uint8Array(64)));
    return encodeBase64(concatBytes(signatureSection, messageBytes));
}
export function token721ProgramId() {
    return encodeBase58(TOKEN_721_PROGRAM_ID_BYTES);
}
export function nftMarketplaceProgramId() {
    return encodeBase58(NFT_MARKETPLACE_PROGRAM_ID_BYTES);
}
export const PROGRAM_IDS = {
    TOKEN_721: token721ProgramId(),
    NFT_MARKETPLACE: nftMarketplaceProgramId(),
};
function walletPermissionsProgramId() {
    return encodeBase58(WALLET_PERMISSIONS_PROGRAM_ID_BYTES);
}
export function buildPreparedToken721Transaction(input) {
    return buildPreparedTransaction({
        payer: input.payer,
        recentBlockhash: input.recentBlockhash,
        instructions: [compileInstruction(input)],
    });
}
export function estimateCollectionAccountSpace(input) {
    return (32 +
        4 + new TextEncoder().encode(input.name).length +
        4 + new TextEncoder().encode(input.symbol).length +
        1 + (input.baseUri ? 4 + new TextEncoder().encode(input.baseUri).length : 0) +
        8 +
        1);
}
export function estimateTokenAccountSpace(input) {
    const descriptionLength = input.metadata.description
        ? new TextEncoder().encode(input.metadata.description).length
        : 0;
    const imageUriLength = input.metadata.imageUri
        ? new TextEncoder().encode(input.metadata.imageUri).length
        : 0;
    const attributesLength = (input.metadata.attributes ?? []).reduce((sum, attribute) => {
        return (sum +
            4 + new TextEncoder().encode(attribute.traitType).length +
            4 + new TextEncoder().encode(attribute.value).length);
    }, 0);
    return (32 +
        8 +
        32 +
        32 +
        2 +
        4 + new TextEncoder().encode(input.metadata.name).length +
        1 + (input.metadata.description ? 4 + descriptionLength : 0) +
        4 + new TextEncoder().encode(input.metadata.uri).length +
        1 + (input.metadata.imageUri ? 4 + imageUriLength : 0) +
        4 + attributesLength +
        1 +
        1);
}
export function buildPreparedCollectionSetupTransaction(input) {
    return buildPreparedTransaction({
        payer: input.payer,
        recentBlockhash: input.recentBlockhash,
        instructions: [
            buildCreateAccountWithSeedInstruction({
                payer: input.payer,
                createdAccount: input.collectionAddress,
                base: input.base,
                seed: input.collectionSeed,
                lamports: input.lamports,
                space: input.space,
                ownerProgram: token721ProgramId(),
            }),
            compileInstruction({
                payer: input.payer,
                recentBlockhash: input.recentBlockhash,
                action: 'initializeCollection',
                collection: input.collectionAddress,
                authority: input.authority,
                metadata: {
                    name: input.name,
                    symbol: input.symbol,
                    baseUri: input.baseUri ?? null,
                    uri: '',
                },
            }),
        ],
    });
}
export function buildPreparedMintWithAccountSetupTransaction(input) {
    return buildPreparedTransaction({
        payer: input.payer,
        recentBlockhash: input.recentBlockhash,
        instructions: [
            buildCreateAccountWithSeedInstruction({
                payer: input.payer,
                createdAccount: input.tokenAddress,
                base: input.base,
                seed: input.tokenSeed,
                lamports: input.lamports,
                space: input.space,
                ownerProgram: token721ProgramId(),
            }),
            compileInstruction({
                payer: input.payer,
                recentBlockhash: input.recentBlockhash,
                action: 'mint',
                collection: input.collection,
                token: input.tokenAddress,
                authority: input.authority,
                owner: input.owner,
                tokenId: input.tokenId,
                royaltyBps: input.royaltyBps,
                metadata: input.metadata,
            }),
        ],
    });
}
function buildWalletPermissionsInstruction(accounts, data) {
    return {
        programId: WALLET_PERMISSIONS_PROGRAM_ID_BYTES,
        accounts: [
            { pubkey: decodeBase58(accounts.permissionState), isSigner: false, isWritable: true },
            { pubkey: decodeBase58(accounts.auditLog), isSigner: false, isWritable: true },
            { pubkey: decodeBase58(accounts.owner), isSigner: true, isWritable: false },
        ],
        data,
    };
}
export function buildPreparedInitializeWalletPermissionsTransaction(input) {
    const instruction = buildWalletPermissionsInstruction(input.accounts, concatBytes(Uint8Array.from([0]), encodePubkey(input.wallet), encodeString(input.did), encodeU64(input.currentEpoch), encodeProgramPolicyMode(input.defaultProgramPolicy)));
    return buildPreparedTransaction({
        payer: input.payer,
        recentBlockhash: input.recentBlockhash,
        instructions: [instruction],
    });
}
export function buildPreparedGrantDelegateTransaction(input) {
    const instruction = buildWalletPermissionsInstruction(input.accounts, concatBytes(Uint8Array.from([1]), encodeDelegatePermission(input.delegatePermission), encodeU64(input.currentEpoch), encodeU64(input.currentSlot)));
    return buildPreparedTransaction({
        payer: input.payer,
        recentBlockhash: input.recentBlockhash,
        instructions: [instruction],
    });
}
export function buildPreparedUpdateDelegateTransaction(input) {
    const instruction = buildWalletPermissionsInstruction(input.accounts, concatBytes(Uint8Array.from([2]), encodePubkey(input.delegate), encodeOptionRole(input.role), encodeNestedOptionString(input.label), encodeNestedOptionU64(input.validUntilEpoch), encodeOptionSpendLimit(input.spendLimit), encodeOptionPubkeyVec(input.programAllowlist), encodeOptionPubkeyVec(input.tokenAllowlist), encodeOptionStringVec(input.appScopeHashes), encodeOptionBool(input.requiresReauth), encodeU64(input.currentEpoch), encodeU64(input.currentSlot)));
    return buildPreparedTransaction({
        payer: input.payer,
        recentBlockhash: input.recentBlockhash,
        instructions: [instruction],
    });
}
export function buildPreparedRevokeDelegateTransaction(input) {
    const instruction = buildWalletPermissionsInstruction(input.accounts, concatBytes(Uint8Array.from([3]), encodePubkey(input.delegate), encodeU64(input.currentEpoch), encodeU64(input.currentSlot)));
    return buildPreparedTransaction({
        payer: input.payer,
        recentBlockhash: input.recentBlockhash,
        instructions: [instruction],
    });
}
export function buildPreparedFreezeWalletTransaction(input) {
    const instruction = buildWalletPermissionsInstruction(input.accounts, concatBytes(Uint8Array.from([4]), encodeOptionU16(input.reasonCode), encodeOptionU64(input.reauthRequiredUntilEpoch), encodeU64(input.currentEpoch), encodeU64(input.currentSlot)));
    return buildPreparedTransaction({
        payer: input.payer,
        recentBlockhash: input.recentBlockhash,
        instructions: [instruction],
    });
}
export function buildPreparedUnfreezeWalletTransaction(input) {
    const instruction = buildWalletPermissionsInstruction(input.accounts, concatBytes(Uint8Array.from([5]), encodeU64(input.currentEpoch), encodeU64(input.currentSlot)));
    return buildPreparedTransaction({
        payer: input.payer,
        recentBlockhash: input.recentBlockhash,
        instructions: [instruction],
    });
}
function compileListNftInstruction(input) {
    return {
        programId: NFT_MARKETPLACE_PROGRAM_ID_BYTES,
        accounts: [
            { pubkey: decodeBase58(input.listingAccount), isSigner: false, isWritable: true },
            { pubkey: decodeBase58(input.tokenAccount), isSigner: false, isWritable: false },
            { pubkey: decodeBase58(input.seller), isSigner: true, isWritable: false },
        ],
        // Borsh variant index 0 = ListNft
        data: concatBytes(Uint8Array.from([0]), encodePubkey(input.collection), encodePubkey(input.creator), encodeU64(input.priceLamports), encodeU16(input.royaltyBps), encodeOptionU64(input.expiresAtSlot ?? null)),
    };
}
function compileBuyNftInstruction(input) {
    return {
        programId: NFT_MARKETPLACE_PROGRAM_ID_BYTES,
        accounts: [
            { pubkey: decodeBase58(input.listingAccount), isSigner: false, isWritable: true },
            { pubkey: decodeBase58(input.buyer), isSigner: true, isWritable: false },
        ],
        // Borsh variant index 1 = BuyNft (unit variant)
        data: Uint8Array.from([1]),
    };
}
function compileCancelListingInstruction(input) {
    return {
        programId: NFT_MARKETPLACE_PROGRAM_ID_BYTES,
        accounts: [
            { pubkey: decodeBase58(input.listingAccount), isSigner: false, isWritable: true },
            { pubkey: decodeBase58(input.seller), isSigner: true, isWritable: false },
        ],
        // Borsh variant index 2 = CancelListing (unit variant)
        data: Uint8Array.from([2]),
    };
}
export function buildPreparedListNftTransaction(input) {
    return buildPreparedTransaction({
        payer: input.payer,
        recentBlockhash: input.recentBlockhash,
        instructions: [compileListNftInstruction(input)],
    });
}
export function buildPreparedBuyNftTransaction(input) {
    return buildPreparedTransaction({
        payer: input.payer,
        recentBlockhash: input.recentBlockhash,
        instructions: [compileBuyNftInstruction(input)],
    });
}
export function buildPreparedCancelListingTransaction(input) {
    return buildPreparedTransaction({
        payer: input.payer,
        recentBlockhash: input.recentBlockhash,
        instructions: [compileCancelListingInstruction(input)],
    });
}
export function buildPreparedRecordDelegateUsageTransaction(input) {
    const instruction = buildWalletPermissionsInstruction(input.accounts, concatBytes(Uint8Array.from([6]), encodePubkey(input.delegate), encodeOptionPubkey(input.targetProgram), encodeOptionPubkey(input.mint), encodeU64(input.amount), encodeU64(input.dayIndex), encodeU64(input.currentEpoch), encodeU64(input.currentSlot)));
    return buildPreparedTransaction({
        payer: input.payer,
        recentBlockhash: input.recentBlockhash,
        instructions: [instruction],
    });
}
