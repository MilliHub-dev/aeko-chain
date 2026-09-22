import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { buildCanonicalPostPayload, buildPostHashBundle, buildPreparedAnchorPostTransaction, verifyPostSignature, } from './socialPosts.js';
export class JsonFilePostVerificationStore {
    filePath;
    constructor(filePath) {
        this.filePath = filePath;
    }
    async get(postId) {
        const store = await this.loadStore();
        return store[postId] ?? null;
    }
    async upsert(postId, patch) {
        const store = await this.loadStore();
        const current = store[postId];
        const next = {
            ...current,
            ...patch,
            postId,
            creator: patch.creator,
            anchorStatus: patch.anchorStatus ?? current?.anchorStatus ?? 'draft',
            updatedAtUnix: patch.updatedAtUnix ?? nowUnix(),
        };
        store[postId] = next;
        await this.saveStore(store);
        return next;
    }
    async loadStore() {
        try {
            const raw = await readFile(this.filePath, 'utf8');
            return JSON.parse(raw);
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                return {};
            }
            throw error;
        }
    }
    async saveStore(store) {
        await mkdir(dirname(this.filePath), { recursive: true });
        await writeFile(this.filePath, JSON.stringify(store, null, 2));
    }
}
export class SocialBackendError extends Error {
    code;
    statusCode;
    extra;
    constructor(code, message, statusCode, extra) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
        this.extra = extra;
        this.name = 'SocialBackendError';
    }
}
const DEFAULT_CONFIRM_TIMEOUT_MS = 30_000;
const DEFAULT_CONFIRM_POLL_MS = 750;
export class SocialPostVerificationService {
    client;
    store;
    constructor(client, store) {
        this.client = client;
        this.store = store;
    }
    async hashPost(request) {
        const payload = buildCanonicalPostPayload(request.canonicalPayload);
        const bundle = buildPostHashBundle({
            content: request.content,
            metadata: JSON.stringify(request.metadata),
            canonicalPayload: request.canonicalPayload,
        });
        const verificationRecord = await this.store.upsert(request.canonicalPayload.postId, {
            postId: request.canonicalPayload.postId,
            creator: request.canonicalPayload.creator,
            payload,
            payloadHashHex: bundle.payloadHashHex,
            payloadHashBase58: bundle.payloadHashBase58,
            contentHashHex: bundle.contentHashHex,
            contentHashBase58: bundle.contentHashBase58,
            metadataHashHex: bundle.metadataHashHex,
            metadataHashBase58: bundle.metadataHashBase58,
            anchorStatus: 'hashed',
            updatedAtUnix: nowUnix(),
        });
        return {
            payload,
            payloadHashHex: bundle.payloadHashHex,
            payloadHashBase58: bundle.payloadHashBase58,
            contentHashHex: bundle.contentHashHex,
            contentHashBase58: bundle.contentHashBase58,
            metadataHashHex: bundle.metadataHashHex,
            metadataHashBase58: bundle.metadataHashBase58,
            verificationRecord,
        };
    }
    async verifyPost(request) {
        const signatureValid = verifyPostSignature({
            signer: request.signer,
            payload: request.payload,
            signature: request.signature,
            signatureEncoding: request.signatureEncoding ?? 'base64',
        });
        const parsedPayload = parsePayload(request.payload);
        const verificationRecord = parsedPayload?.postId && parsedPayload?.creator
            ? await this.store.upsert(parsedPayload.postId, {
                postId: parsedPayload.postId,
                creator: parsedPayload.creator,
                payload: request.payload,
                signatureValid,
                signer: request.signer,
                verificationMode: 'backend-only',
                anchorStatus: signatureValid ? 'verified' : 'signed',
                lastErrorCode: signatureValid ? undefined : 'invalid_signature',
                lastErrorMessage: signatureValid ? undefined : 'Signature verification failed.',
                updatedAtUnix: nowUnix(),
            })
            : null;
        if (!signatureValid) {
            throw new SocialBackendError('invalid_signature', 'Signature verification failed.', 422, {
                signer: request.signer,
                verificationRecord,
            });
        }
        return {
            signatureValid,
            signer: request.signer,
            errorCode: null,
            verificationRecord,
        };
    }
    async submitAnchor(request) {
        const preparedTransactionBase64 = buildPreparedAnchorPostTransaction(request.anchor);
        if (!request.signedTransactionBase64) {
            const verificationRecord = await this.store.upsert(request.anchor.postId, {
                postId: request.anchor.postId,
                creator: request.anchor.creator,
                preparedTransactionBase64,
                anchorStatus: 'verified',
                verificationMode: 'backend-only',
                updatedAtUnix: nowUnix(),
            });
            return {
                mode: 'prepared',
                preparedTransactionBase64,
                verificationRecord,
            };
        }
        await this.store.upsert(request.anchor.postId, {
            postId: request.anchor.postId,
            creator: request.anchor.creator,
            preparedTransactionBase64,
            anchorStatus: 'anchor_pending',
            verificationMode: 'anchored-reference',
            updatedAtUnix: nowUnix(),
        });
        let transactionSignature;
        try {
            transactionSignature = await this.client.sendTransaction(request.signedTransactionBase64, {
                encoding: 'base64',
            });
        }
        catch (error) {
            await this.failAnchor(request, preparedTransactionBase64, undefined, 'rpc_submission_failed', errorMessage(error));
        }
        try {
            await waitForConfirmation(this.client, transactionSignature);
        }
        catch (error) {
            await this.failAnchor(request, preparedTransactionBase64, transactionSignature, 'rpc_confirmation_failed', errorMessage(error));
        }
        let onchainPost;
        try {
            onchainPost = await waitForPostAnchor(this.client, request.anchor.postId);
            assertAnchorMatchesRequest(onchainPost, request.anchor);
        }
        catch (error) {
            await this.failAnchor(request, preparedTransactionBase64, transactionSignature, 'onchain_verification_failed', errorMessage(error));
        }
        const verificationRecord = await this.store.upsert(request.anchor.postId, {
            postId: request.anchor.postId,
            creator: request.anchor.creator,
            preparedTransactionBase64,
            anchorTransactionSignature: transactionSignature,
            anchorStatus: 'onchain_verified',
            verificationMode: 'onchain-verified',
            lastErrorCode: undefined,
            lastErrorMessage: undefined,
            updatedAtUnix: nowUnix(),
        });
        return {
            mode: 'onchain-verified',
            transactionSignature: transactionSignature,
            preparedTransactionBase64,
            onchainPost: onchainPost,
            verificationRecord,
        };
    }
    async getVerification(postId) {
        const record = await this.store.get(postId);
        if (!record) {
            throw new SocialBackendError('not_found', 'No verification record exists for that post.', 404, { postId });
        }
        return record;
    }
    async failAnchor(request, preparedTransactionBase64, transactionSignature, code, message) {
        const verificationRecord = await this.store.upsert(request.anchor.postId, {
            postId: request.anchor.postId,
            creator: request.anchor.creator,
            preparedTransactionBase64,
            anchorTransactionSignature: transactionSignature,
            anchorStatus: 'anchor_failed',
            verificationMode: transactionSignature ? 'anchored-reference' : 'backend-only',
            lastErrorCode: code,
            lastErrorMessage: message,
            updatedAtUnix: nowUnix(),
        });
        const statusCode = code === 'rpc_submission_failed' ? 502 : 504;
        throw new SocialBackendError(code, message, statusCode, {
            transactionSignature,
            verificationRecord,
        });
    }
}
async function waitForConfirmation(client, signature, timeoutMs = DEFAULT_CONFIRM_TIMEOUT_MS) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const [status] = (await client.getSignatureStatuses([signature]));
        if (status) {
            if (status.err !== null) {
                throw new Error(`Anchor transaction ${signature} failed: ${JSON.stringify(status.err)}`);
            }
            if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') {
                return status;
            }
        }
        await sleep(DEFAULT_CONFIRM_POLL_MS);
    }
    throw new Error(`Timed out waiting for anchor transaction ${signature} to confirm.`);
}
async function waitForPostAnchor(client, postId, timeoutMs = DEFAULT_CONFIRM_TIMEOUT_MS) {
    const deadline = Date.now() + timeoutMs;
    let lastError;
    while (Date.now() < deadline) {
        try {
            const response = await client.rpc('getPostAnchor', [
                postId,
                { commitment: 'confirmed' },
            ]);
            if (response.value)
                return response.value;
        }
        catch (error) {
            lastError = error;
        }
        await sleep(DEFAULT_CONFIRM_POLL_MS);
    }
    const suffix = lastError ? ` Last RPC error: ${errorMessage(lastError)}` : '';
    throw new Error(`Confirmed anchor ${postId} was not readable from getPostAnchor.${suffix}`);
}
function assertAnchorMatchesRequest(post, expected) {
    const mismatches = [];
    if (post.postId !== expected.postId)
        mismatches.push('postId');
    if (post.creator !== expected.creator)
        mismatches.push('creator');
    if (post.contentHash !== expected.contentHash)
        mismatches.push('contentHash');
    if (post.metadataHash !== expected.metadataHash)
        mismatches.push('metadataHash');
    if (post.contentUri !== expected.contentUri)
        mismatches.push('contentUri');
    if (mismatches.length) {
        throw new Error(`On-chain anchor does not match submitted payload: ${mismatches.join(', ')}`);
    }
}
function parsePayload(payload) {
    try {
        return JSON.parse(payload);
    }
    catch {
        return null;
    }
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error ?? 'unknown_error');
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function nowUnix() {
    return Math.floor(Date.now() / 1000);
}
