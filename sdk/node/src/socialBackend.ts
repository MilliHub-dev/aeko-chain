import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { AekoNodeClient } from './client.js';
import {
  buildCanonicalPostPayload,
  buildPostHashBundle,
  buildPreparedAnchorPostTransaction,
  type AnchorPostTransactionInput,
  type CanonicalPostPayloadInput,
  type PublicKeyString,
  verifyPostSignature,
} from './socialPosts.js';

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface HashPostRequest {
  content: string;
  metadata: JsonValue;
  canonicalPayload: CanonicalPostPayloadInput;
}

export interface VerifyPostRequest {
  payload: string;
  signer: PublicKeyString;
  signature: string;
  signatureEncoding?: 'base64' | 'hex' | 'base58';
}

export interface AnchorPostRequest {
  anchor: AnchorPostTransactionInput;
  signedTransactionBase64?: string;
}

export type ApiErrorCode =
  | 'not_found'
  | 'bad_request'
  | 'invalid_signature'
  | 'invalid_payload'
  | 'rpc_submission_failed';

export interface StoredVerificationRecord {
  postId: string;
  creator: PublicKeyString;
  payload?: string;
  payloadHashHex?: string;
  payloadHashBase58?: string;
  contentHashHex?: string;
  contentHashBase58?: string;
  metadataHashHex?: string;
  metadataHashBase58?: string;
  signatureValid?: boolean;
  signer?: PublicKeyString;
  verificationMode?: 'backend-only' | 'anchored-reference' | 'onchain-verified';
  anchorStatus:
    | 'draft'
    | 'hashed'
    | 'signed'
    | 'verified'
    | 'anchor_pending'
    | 'anchored'
    | 'anchor_failed';
  preparedTransactionBase64?: string;
  anchorTransactionSignature?: string;
  lastErrorCode?: ApiErrorCode;
  lastErrorMessage?: string;
  updatedAtUnix: number;
}

export interface PostVerificationStore {
  get(postId: string): Promise<StoredVerificationRecord | null>;
  upsert(
    postId: string,
    patch: Partial<StoredVerificationRecord> & Pick<StoredVerificationRecord, 'postId' | 'creator'>,
  ): Promise<StoredVerificationRecord>;
}

export class JsonFilePostVerificationStore implements PostVerificationStore {
  constructor(private readonly filePath: string) {}

  async get(postId: string): Promise<StoredVerificationRecord | null> {
    const store = await this.loadStore();
    return store[postId] ?? null;
  }

  async upsert(
    postId: string,
    patch: Partial<StoredVerificationRecord> & Pick<StoredVerificationRecord, 'postId' | 'creator'>,
  ): Promise<StoredVerificationRecord> {
    const store = await this.loadStore();
    const current = store[postId];
    const next: StoredVerificationRecord = {
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

  private async loadStore(): Promise<Record<string, StoredVerificationRecord>> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      return JSON.parse(raw) as Record<string, StoredVerificationRecord>;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {};
      }
      throw error;
    }
  }

  private async saveStore(store: Record<string, StoredVerificationRecord>): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(store, null, 2));
  }
}

export class SocialBackendError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
    public readonly statusCode: number,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'SocialBackendError';
  }
}

export class SocialPostVerificationService {
  constructor(
    private readonly client: AekoNodeClient,
    private readonly store: PostVerificationStore,
  ) {}

  async hashPost(request: HashPostRequest) {
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

  async verifyPost(request: VerifyPostRequest) {
    const signatureValid = verifyPostSignature({
      signer: request.signer,
      payload: request.payload,
      signature: request.signature,
      signatureEncoding: request.signatureEncoding ?? 'base64',
    });

    const parsedPayload = parsePayload(request.payload);
    const verificationRecord =
      parsedPayload?.postId && parsedPayload?.creator
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

  async submitAnchor(request: AnchorPostRequest) {
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
        mode: 'prepared' as const,
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
        mode: 'submitted' as const,
        transactionSignature,
        preparedTransactionBase64,
        verificationRecord,
      };
    } catch (error) {
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

  async getVerification(postId: string) {
    const record = await this.store.get(postId);
    if (!record) {
      throw new SocialBackendError(
        'not_found',
        'No verification record exists for that post.',
        404,
        { postId },
      );
    }
    return record;
  }
}

function parsePayload(payload: string): { postId?: string; creator?: PublicKeyString } | null {
  try {
    return JSON.parse(payload) as { postId?: string; creator?: PublicKeyString };
  } catch {
    return null;
  }
}

function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}
