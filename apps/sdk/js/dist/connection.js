export class AekoRpcError extends Error {
    code;
    data;
    constructor(message, code, data) {
        super(message);
        this.code = code;
        this.data = data;
        this.name = 'AekoRpcError';
    }
}
export class AekoConnection {
    endpoint;
    websocketEndpoint;
    fetchImpl;
    websocketFactory;
    defaultCommitment;
    constructor(endpoint, options = {}) {
        this.endpoint = endpoint;
        this.websocketEndpoint = endpoint.replace(/^http/i, 'ws');
        this.fetchImpl = options.fetchImpl ?? fetch;
        this.websocketFactory = options.websocketFactory;
        this.defaultCommitment = options.defaultCommitment ?? 'confirmed';
    }
    async rpc(method, params, id = method) {
        const request = {
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
        const payload = (await response.json());
        if (payload.error) {
            throw new AekoRpcError(payload.error.message, payload.error.code, payload.error.data);
        }
        if (typeof payload.result === 'undefined') {
            throw new AekoRpcError('RPC response did not include a result');
        }
        return payload.result;
    }
    async getLatestBlockhash() {
        const result = await this.rpc('getLatestBlockhash', [
            { commitment: this.defaultCommitment },
        ]);
        const blockhash = result?.value?.blockhash ?? result?.blockhash;
        if (!blockhash) {
            throw new AekoRpcError('RPC did not return a recent blockhash');
        }
        return blockhash;
    }
    async getBalance(address) {
        return this.rpc('getBalance', [
            address,
            { commitment: this.defaultCommitment },
        ]).then((result) => typeof result === 'number' ? result : result.value);
    }
    async getAccountInfo(address) {
        const result = await this.rpc('getAccountInfo', [
            address,
            { encoding: 'base64', commitment: this.defaultCommitment },
        ]);
        return result.value;
    }
    async getProgramAccounts(programId) {
        return this.rpc('getProgramAccounts', [
            programId,
            { encoding: 'base64', commitment: this.defaultCommitment },
        ]);
    }
    async getTokenAccountsByOwner(owner, filter) {
        const result = await this.rpc('getTokenAccountsByOwner', [
            owner,
            filter,
            { encoding: 'base64', commitment: this.defaultCommitment },
        ]);
        return result.value;
    }
    async sendTransaction(signedTransactionBase64, options = {}) {
        return this.rpc('sendTransaction', [
            signedTransactionBase64,
            {
                encoding: options.encoding ?? 'base64',
                skipPreflight: options.skipPreflight ?? false,
                preflightCommitment: options.preflightCommitment ?? this.defaultCommitment,
            },
        ]);
    }
    async getSignatureStatuses(signatures) {
        const result = await this.rpc('getSignatureStatuses', [
            signatures,
            { searchTransactionHistory: true },
        ]);
        return result.value;
    }
    subscribeAccount(address, onMessage) {
        if (!this.websocketFactory) {
            throw new Error('No websocket factory configured for subscriptions.');
        }
        const socket = this.websocketFactory(this.websocketEndpoint);
        let subscriptionId = null;
        socket.addEventListener('open', () => {
            socket.send(JSON.stringify({
                jsonrpc: '2.0',
                id: `accountSubscribe:${address}`,
                method: 'accountSubscribe',
                params: [address, { commitment: this.defaultCommitment, encoding: 'base64' }],
            }));
        });
        socket.addEventListener('message', (event) => {
            const payload = JSON.parse(String(event.data));
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
                    socket.send(JSON.stringify({
                        jsonrpc: '2.0',
                        id: `accountUnsubscribe:${address}`,
                        method: 'accountUnsubscribe',
                        params: [subscriptionId],
                    }));
                }
                socket.close();
            },
        };
    }
}
