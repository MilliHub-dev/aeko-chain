import type {
  AccountInfoResponse,
  JsonRpcId,
  JsonRpcRequest,
  JsonRpcResponse,
  LatestBlockhashResponse,
  ProgramAccount,
  PublicKeyString,
  RpcAccountNotification,
  SignatureStatusesResponse,
  TokenAccountOwnerResult,
} from './types.js';

export interface AekoConnectionOptions {
  fetchImpl?: typeof fetch;
  websocketFactory?: (url: string) => WebSocket;
  defaultCommitment?: 'processed' | 'confirmed' | 'finalized';
}

export interface SendTransactionOptions {
  encoding?: 'base64';
  skipPreflight?: boolean;
  preflightCommitment?: 'processed' | 'confirmed' | 'finalized';
}

export class AekoRpcError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
    public readonly data?: unknown,
  ) {
    super(message);
    this.name = 'AekoRpcError';
  }
}

export interface AirdropOptions {
  commitment?: 'processed' | 'confirmed' | 'finalized';
  recentBlockhash?: string;
}

export interface FundingRequestOptions {
  /** Explorer API base URL, e.g. https://api.aeko.online */
  explorerApiUrl: string;
  fetchImpl?: typeof fetch;
  /** Seconds to wait for admin approval before giving up. Default 300. */
  timeoutSecs?: number;
  /** Poll interval in ms. Default 4000. */
  pollIntervalMs?: number;
  /** Return after submission without waiting for approval. */
  noWait?: boolean;
  /** AbortSignal to stop waiting (request stays pending for admin). */
  signal?: AbortSignal;
}

export interface DirectGrantOptions {
  explorerApiUrl: string;
  /** Admin settings token; bypasses approval. Never expose in browser public flows. */
  adminToken: string;
  fetchImpl?: typeof fetch;
}

export class AekoConnection {
  readonly endpoint: string;
  readonly websocketEndpoint: string;
  private readonly fetchImpl: typeof fetch;
  private readonly websocketFactory?: (url: string) => WebSocket;
  private readonly defaultCommitment: 'processed' | 'confirmed' | 'finalized';

  constructor(endpoint: string, options: AekoConnectionOptions = {}) {
    this.endpoint = endpoint;
    this.websocketEndpoint = endpoint.replace(/^http/i, 'ws');
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.websocketFactory = options.websocketFactory;
    this.defaultCommitment = options.defaultCommitment ?? 'confirmed';
  }

  async rpc<TResult = unknown, TParams = unknown>(
    method: string,
    params?: TParams,
    id: JsonRpcId = method,
  ): Promise<TResult> {
    const request: JsonRpcRequest<TParams> = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    const response = await this.fetchImpl(this.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new AekoRpcError(`RPC request failed with HTTP ${response.status}`);
    }

    const payload = (await response.json()) as JsonRpcResponse<TResult>;
    if (payload.error) {
      throw new AekoRpcError(payload.error.message, payload.error.code, payload.error.data);
    }
    if (typeof payload.result === 'undefined') {
      throw new AekoRpcError('RPC response did not include a result');
    }
    return payload.result;
  }

  async getLatestBlockhash(): Promise<string> {
    const result = await this.rpc<LatestBlockhashResponse>('getLatestBlockhash', [
      { commitment: this.defaultCommitment },
    ]);
    const blockhash = result?.value?.blockhash ?? result?.blockhash;
    if (!blockhash) {
      throw new AekoRpcError('RPC did not return a recent blockhash');
    }
    return blockhash;
  }

  async getBalance(address: PublicKeyString): Promise<number> {
    return this.rpc<number>('getBalance', [
      address,
      { commitment: this.defaultCommitment },
    ]).then((result) =>
      typeof result === 'number' ? result : (result as unknown as { value: number }).value,
    );
  }

  async getAccountInfo(address: PublicKeyString): Promise<AccountInfoResponse['value']> {
    const result = await this.rpc<AccountInfoResponse>('getAccountInfo', [
      address,
      { encoding: 'base64', commitment: this.defaultCommitment },
    ]);
    return result.value;
  }

  async getProgramAccounts(programId: PublicKeyString): Promise<ProgramAccount[]> {
    return this.rpc<ProgramAccount[]>('getProgramAccounts', [
      programId,
      { encoding: 'base64', commitment: this.defaultCommitment },
    ]);
  }

  async getTokenAccountsByOwner(
    owner: PublicKeyString,
    filter: { mint?: PublicKeyString; programId?: PublicKeyString },
  ): Promise<TokenAccountOwnerResult[]> {
    const result = await this.rpc<{ value: TokenAccountOwnerResult[] }>('getTokenAccountsByOwner', [
      owner,
      filter,
      { encoding: 'base64', commitment: this.defaultCommitment },
    ]);
    return result.value;
  }

  async sendTransaction(
    signedTransactionBase64: string,
    options: SendTransactionOptions = {},
  ): Promise<string> {
    return this.rpc<string>('sendTransaction', [
      signedTransactionBase64,
      {
        encoding: options.encoding ?? 'base64',
        skipPreflight: options.skipPreflight ?? false,
        preflightCommitment: options.preflightCommitment ?? this.defaultCommitment,
      },
    ]);
  }

  async getSignatureStatuses(signatures: string[]): Promise<SignatureStatusesResponse['value']> {
    const result = await this.rpc<SignatureStatusesResponse>('getSignatureStatuses', [
      signatures,
      { searchTransactionHistory: true },
    ]);
    return result.value;
  }

  /**
   * Instant developer airdrop: no admin approval, dispatched immediately
   * subject only to faucet caps. Works from CLI, SDK, or Test Console.
   */
  async requestAirdrop(
    address: PublicKeyString,
    lamports: number,
    options: AirdropOptions = {},
  ): Promise<string> {
    const config: Record<string, unknown> = {
      commitment: options.commitment ?? this.defaultCommitment,
    };
    if (options.recentBlockhash) {
      config.recentBlockhash = options.recentBlockhash;
    }
    return this.rpc<string>('requestAirdrop', [address, lamports, config]);
  }

  /**
   * Instant airdrop with explicit recent blockhash (safe-replay friendly).
   */
  async requestAirdropWithBlockhash(
    address: PublicKeyString,
    lamports: number,
    recentBlockhash: string,
  ): Promise<string> {
    return this.requestAirdrop(address, lamports, { recentBlockhash });
  }

  /**
   * Approval-gated funding grant via direct RPC. Requires the server-only
   * funding authorization credential when the validator configures one.
   * Prefer the Explorer approval-queue flow (`requestFunding`) for public
   * clients; use this only from trusted settlement service code holding the
   * credential. Replays of the same intent recover the same signature.
   */
  async requestGrant(
    address: PublicKeyString,
    lamports: number,
    fundingAuthorization?: string,
    recentBlockhash?: string,
  ): Promise<string> {
    const config: Record<string, unknown> = {
      commitment: this.defaultCommitment,
      fundingAuthorization: fundingAuthorization ?? null,
    };
    if (recentBlockhash) {
      config.recentBlockhash = recentBlockhash;
    }
    return this.rpc<string>('requestGrant', [address, lamports, config]);
  }

  /**
   * Public funding request via the Explorer approval queue.
   * Submits `POST {explorerApiUrl}/funding/request` then polls
   * `GET {explorerApiUrl}/funding/request/:id` until `confirmed`,
   * `failed`/`rejected`, timeout, or abort. Returns the confirmed signature.
   */
  async requestFunding(
    address: PublicKeyString,
    options: FundingRequestOptions,
  ): Promise<{ requestId: string; signature: string }> {
    const fetchImpl = options.fetchImpl ?? this.fetchImpl;
    const base = options.explorerApiUrl.replace(/\/$/, '');
    const timeoutSecs = options.timeoutSecs ?? 300;
    const pollIntervalMs = options.pollIntervalMs ?? 4000;

    const submit = await fetchImpl(`${base}/funding/request`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address }),
    });
    let requestId;
    if (!submit.ok) {
      // The wallet already has an in-flight request: adopt it and poll it
      // instead of dead-ending on REQUEST_PENDING.
      const failure = (await submit.json().catch(() => null)) as {
        error?: { code?: string; requestId?: string };
      } | null;
      if (failure?.error?.code === 'REQUEST_PENDING' && failure.error.requestId) {
        requestId = failure.error.requestId;
      } else {
        const body = JSON.stringify(failure ?? '');
        throw new AekoRpcError(`Funding request failed (HTTP ${submit.status}): ${body}`);
      }
    } else {
      const created = (await submit.json()) as { data?: { id?: string } };
      requestId = created?.data?.id;
      if (!requestId) {
        throw new AekoRpcError('Funding request succeeded but returned no request id');
      }
    }
    if (options.noWait) {
      return { requestId, signature: '' };
    }

    const deadline = Date.now() + timeoutSecs * 1000;
    for (;;) {
      if (options.signal?.aborted) {
        throw new AekoRpcError(
          `Funding wait aborted for ${requestId}; request stays pending for admin review`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      const res = await fetchImpl(`${base}/funding/request/${requestId}`);
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new AekoRpcError(`Funding status poll failed (HTTP ${res.status}): ${body}`);
      }
      const status = (await res.json()) as {
        data?: { status?: string; signature?: string; errorCode?: string };
      };
      const state = status?.data?.status ?? 'unknown';
      if (state === 'confirmed') {
        return { requestId, signature: status?.data?.signature ?? '' };
      }
      if (state === 'rejected' || state === 'failed') {
        throw new AekoRpcError(
          `Funding request ${requestId} ended with status ${state} (${status?.data?.errorCode ?? state})`,
        );
      }
      if (Date.now() >= deadline) {
        throw new AekoRpcError(
          `Timed out after ${timeoutSecs}s waiting for admin approval of ${requestId} (last status: ${state})`,
        );
      }
    }
  }

  /**
   * Admin direct grant via the Explorer API. Bypasses the approval queue
   * (caller is the admin). Returns the confirmed grant record.
   */
  async createGrant(
    address: PublicKeyString,
    amountAeko: number,
    options: DirectGrantOptions,
  ): Promise<unknown> {
    const fetchImpl = options.fetchImpl ?? this.fetchImpl;
    const base = options.explorerApiUrl.replace(/\/$/, '');
    const res = await fetchImpl(`${base}/admin/funding/grant`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-aeko-settings-token': options.adminToken,
      },
      body: JSON.stringify({ address, amountAeko }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new AekoRpcError(`Direct grant failed (HTTP ${res.status}): ${body}`);
    }
    return res.json();
  }

  subscribeAccount(
    address: PublicKeyString,
    onMessage: (notification: RpcAccountNotification) => void,
  ): { unsubscribe: () => void } {
    if (!this.websocketFactory) {
      throw new Error('No websocket factory configured for subscriptions.');
    }

    const socket = this.websocketFactory(this.websocketEndpoint);
    let subscriptionId: number | null = null;

    socket.addEventListener('open', () => {
      socket.send(
        JSON.stringify({
          jsonrpc: '2.0',
          id: `accountSubscribe:${address}`,
          method: 'accountSubscribe',
          params: [address, { commitment: this.defaultCommitment, encoding: 'base64' }],
        }),
      );
    });

    socket.addEventListener('message', (event) => {
      const payload = JSON.parse(String(event.data)) as
        | JsonRpcResponse<number>
        | {
            params?: {
              result?: {
                value: RpcAccountNotification;
              };
            };
          };

      if ('result' in payload && typeof payload.result === 'number') {
        subscriptionId = payload.result;
        return;
      }

      const notification = 'params' in payload ? payload.params?.result : undefined;
      if (notification?.value) {
        onMessage(notification.value);
      }
    });

    return {
      unsubscribe: () => {
        if (subscriptionId !== null && socket.readyState === socket.OPEN) {
          socket.send(
            JSON.stringify({
              jsonrpc: '2.0',
              id: `accountUnsubscribe:${address}`,
              method: 'accountUnsubscribe',
              params: [subscriptionId],
            }),
          );
        }
        socket.close();
      },
    };
  }
}
