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
  | 'rpc_submission_failed'
  | 'rpc_confirmation_failed'
  | 'onchain_verification_failed';

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
    | 'onchain_verified'
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

interface SignatureStatusLike {
  err: unknown;
  confirmationStatus?: 'processed' | 'confirmed' | 'finalized' | null;
  slot?: number | null;
}

interface RpcEnvelope<T> {
  value: T;
}

interface OnchainPostAnchor {
  postId: string;
  creator: string;
  contentHash: string;
  metadataHash: string;
  contentUri: string;
}

const DEFAULT_CONFIRM_TIMEOUT_MS = 30_000;
const DEFAULT_CONFIRM_POLL_MS = 750;

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

    let transactionSignature: string | undefined;
    try {
      transactionSignature = await this.client.sendTransaction(request.signedTransactionBase64, {
        encoding: 'base64',
      });
    } catch (error) {
      await this.failAnchor(
        request,
        preparedTransactionBase64,
        undefined,
        'rpc_submission_failed',
        errorMessage(error),
      );
    }

    try {
      await waitForConfirmation(this.client, transactionSignature!);
    } catch (error) {
      await this.failAnchor(
        request,
        preparedTransactionBase64,
        transactionSignature,
        'rpc_confirmation_failed',
        errorMessage(error),
      );
    }

    let onchainPost: OnchainPostAnchor;
    try {
      onchainPost = await waitForPostAnchor(this.client, request.anchor.postId);
      assertAnchorMatchesRequest(onchainPost, request.anchor);
    } catch (error) {
      await this.failAnchor(
        request,
        preparedTransactionBase64,
        transactionSignature,
        'onchain_verification_failed',
        errorMessage(error),
      );
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
      mode: 'onchain-verified' as const,
      transactionSignature: transactionSignature!,
      preparedTransactionBase64,
      onchainPost: onchainPost!,
      verificationRecord,
    };
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

  private async failAnchor(
    request: AnchorPostRequest,
    preparedTransactionBase64: string,
    transactionSignature: string | undefined,
    code: ApiErrorCode,
    message: string,
  ): Promise<never> {
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

async function waitForConfirmation(
  client: AekoNodeClient,
  signature: string,
  timeoutMs = DEFAULT_CONFIRM_TIMEOUT_MS,
): Promise<SignatureStatusLike> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const [status] = (await client.getSignatureStatuses([signature])) as Array<SignatureStatusLike | null>;
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

async function waitForPostAnchor(
  client: AekoNodeClient,
  postId: string,
  timeoutMs = DEFAULT_CONFIRM_TIMEOUT_MS,
): Promise<OnchainPostAnchor> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const response = await client.rpc<RpcEnvelope<OnchainPostAnchor | null>>('getPostAnchor', [
        postId,
        { commitment: 'confirmed' },
      ]);
      if (response.value) return response.value;
    } catch (error) {
      lastError = error;
    }
    await sleep(DEFAULT_CONFIRM_POLL_MS);
  }
  const suffix = lastError ? ` Last RPC error: ${errorMessage(lastError)}` : '';
  throw new Error(`Confirmed anchor ${postId} was not readable from getPostAnchor.${suffix}`);
}

function assertAnchorMatchesRequest(
  post: OnchainPostAnchor,
  expected: AnchorPostTransactionInput,
): void {
  const mismatches: string[] = [];
  if (post.postId !== expected.postId) mismatches.push('postId');
  if (post.creator !== expected.creator) mismatches.push('creator');
  if (post.contentHash !== expected.contentHash) mismatches.push('contentHash');
  if (post.metadataHash !== expected.metadataHash) mismatches.push('metadataHash');
  if (post.contentUri !== expected.contentUri) mismatches.push('contentUri');
  if (mismatches.length) {
    throw new Error(`On-chain anchor does not match submitted payload: ${mismatches.join(', ')}`);
  }
}

function parsePayload(payload: string): { postId?: string; creator?: PublicKeyString } | null {
  try {
    return JSON.parse(payload) as { postId?: string; creator?: PublicKeyString };
  } catch {
    return null;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? 'unknown_error');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}
