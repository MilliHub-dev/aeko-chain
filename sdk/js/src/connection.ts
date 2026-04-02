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
} from './types';

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
