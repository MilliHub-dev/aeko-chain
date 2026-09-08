import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SocialBackendError,
  SocialPostVerificationService,
  socialPostsProgramId,
} from '../dist/index.js';

class MemoryStore {
  constructor() {
    this.records = new Map();
  }

  async get(postId) {
    return this.records.get(postId) ?? null;
  }

  async upsert(postId, patch) {
    const current = this.records.get(postId) ?? {};
    const next = {
      ...current,
      ...patch,
      postId,
      creator: patch.creator,
      anchorStatus: patch.anchorStatus ?? current.anchorStatus ?? 'draft',
      updatedAtUnix: patch.updatedAtUnix ?? Math.floor(Date.now() / 1000),
    };
    this.records.set(postId, next);
    return next;
  }
}

function anchorFixture() {
  const fixed32 = socialPostsProgramId();
  return {
    payer: fixed32,
    recentBlockhash: fixed32,
    stateAccount: fixed32,
    creator: fixed32,
    postId: fixed32,
    contentHash: fixed32,
    metadataHash: fixed32,
    contentUri: 'https://aeko.social/posts/test',
    postKind: 'original',
    createdAtUnix: 1_700_000_000,
    visibility: 'public',
  };
}

function successfulClient(anchor) {
  return {
    async sendTransaction() {
      return 'tx-signature';
    },
    async getSignatureStatuses() {
      return [{ err: null, confirmationStatus: 'confirmed', slot: 42 }];
    },
    async rpc(method) {
      assert.equal(method, 'getPostAnchor');
      return {
        context: { slot: 42 },
        value: {
          postId: anchor.postId,
          creator: anchor.creator,
          contentHash: anchor.contentHash,
          metadataHash: anchor.metadataHash,
          contentUri: anchor.contentUri,
        },
      };
    },
  };
}

test('submitAnchor only reports onchain-verified after confirmation and bank readback', async () => {
  const anchor = anchorFixture();
  const store = new MemoryStore();
  const service = new SocialPostVerificationService(successfulClient(anchor), store);

  const result = await service.submitAnchor({
    anchor,
    signedTransactionBase64: 'signed-transaction',
  });

  assert.equal(result.mode, 'onchain-verified');
  assert.equal(result.transactionSignature, 'tx-signature');
  assert.equal(result.onchainPost.postId, anchor.postId);
  assert.equal(result.verificationRecord.anchorStatus, 'onchain_verified');
  assert.equal(result.verificationRecord.verificationMode, 'onchain-verified');
});

test('submitAnchor does not treat an execution error as an anchored post', async () => {
  const anchor = anchorFixture();
  const store = new MemoryStore();
  const client = successfulClient(anchor);
  client.getSignatureStatuses = async () => [
    { err: { InstructionError: [0, 'InvalidAccountData'] }, confirmationStatus: 'confirmed', slot: 42 },
  ];
  const service = new SocialPostVerificationService(client, store);

  await assert.rejects(
    () => service.submitAnchor({ anchor, signedTransactionBase64: 'signed-transaction' }),
    (error) => {
      assert.ok(error instanceof SocialBackendError);
      assert.equal(error.code, 'rpc_confirmation_failed');
      return true;
    },
  );

  const record = await store.get(anchor.postId);
  assert.equal(record.anchorStatus, 'anchor_failed');
  assert.equal(record.lastErrorCode, 'rpc_confirmation_failed');
});

test('submitAnchor rejects a confirmed transaction when getPostAnchor returns different data', async () => {
  const anchor = anchorFixture();
  const store = new MemoryStore();
  const client = successfulClient(anchor);
  client.rpc = async () => ({
    value: {
      postId: anchor.postId,
      creator: anchor.creator,
      contentHash: anchor.contentHash,
      metadataHash: anchor.metadataHash,
      contentUri: 'https://wrong.example/post',
    },
  });
  const service = new SocialPostVerificationService(client, store);

  await assert.rejects(
    () => service.submitAnchor({ anchor, signedTransactionBase64: 'signed-transaction' }),
    (error) => {
      assert.ok(error instanceof SocialBackendError);
      assert.equal(error.code, 'onchain_verification_failed');
      return true;
    },
  );
});
