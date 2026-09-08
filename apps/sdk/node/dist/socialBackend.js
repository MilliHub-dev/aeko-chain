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
        try {
            const transactionSignature = await this.client.sendTransaction(request.signedTransactionBase64, {
                encoding: 'base64',
            });
            const verificationRecord = await this.store.upsert(request.anchor.postId, {
                postId: request.anchor.postId,
                creator: request.anchor.creator,
                preparedTransactionBase64,
                anchorTransactionSignature: transactionSignature,
                anchorStatus: 'anchored',
                verificationMode: 'anchored-reference',
                lastErrorCode: undefined,
                lastErrorMessage: undefined,
                updatedAtUnix: nowUnix(),
            });
            return {
                mode: 'submitted',
                transactionSignature,
                preparedTransactionBase64,
                verificationRecord,
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'unknown_error';
            const verificationRecord = await this.store.upsert(request.anchor.postId, {
                postId: request.anchor.postId,
                creator: request.anchor.creator,
                preparedTransactionBase64,
                anchorStatus: 'anchor_failed',
                verificationMode: 'anchored-reference',
                lastErrorCode: 'rpc_submission_failed',
                lastErrorMessage: message,
                updatedAtUnix: nowUnix(),
            });
            throw new SocialBackendError('rpc_submission_failed', message, 502, {
                verificationRecord,
            });
        }
    }
    async getVerification(postId) {
        const record = await this.store.get(postId);
        if (!record) {
            throw new SocialBackendError('not_found', 'No verification record exists for that post.', 404, { postId });
        }
        return record;
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
function nowUnix() {
    return Math.floor(Date.now() / 1000);
}
