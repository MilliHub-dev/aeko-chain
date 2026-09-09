const DEFAULT_RECONNECT_MS = 1000;
const DEFAULT_MAX_RECONNECT_MS = 10000;

function nextBackoff(current, max) {
  return Math.min(Math.max(current * 2, DEFAULT_RECONNECT_MS), max);
}

export class AekoWsClient {
  constructor(
    url,
    {
      websocketFactory = (endpoint) => new WebSocket(endpoint),
      reconnectMs = DEFAULT_RECONNECT_MS,
      maxReconnectMs = DEFAULT_MAX_RECONNECT_MS,
      onStatus = () => {},
    } = {},
  ) {
    this.url = url;
    this.websocketFactory = websocketFactory;
    this.reconnectMs = reconnectMs;
    this.maxReconnectMs = maxReconnectMs;
    this.onStatus = onStatus;
    this.socket = null;
    this.closed = false;
    this.reconnectTimer = null;
    this.reconnectDelay = reconnectMs;
    this.nextLocalId = 1;
    this.nextRequestId = 1;
    this.subscriptions = new Map();
    this.serverSubscriptions = new Map();
    this.pending = new Map();
  }

  connect() {
    if (this.closed || !this.url) return;
    if (this.socket && [0, 1].includes(this.socket.readyState)) return;

    this.onStatus('connecting');
    const socket = this.websocketFactory(this.url);
    this.socket = socket;

    socket.addEventListener('open', () => {
      if (this.socket !== socket) return;
      this.reconnectDelay = this.reconnectMs;
      this.onStatus('connected');
      this.serverSubscriptions.clear();
      this.pending.clear();
      for (const [localId, subscription] of this.subscriptions.entries()) {
        subscription.serverId = null;
        this.#sendSubscribe(localId, subscription);
      }
    });

    socket.addEventListener('message', (event) => {
      if (this.socket !== socket) return;
      this.#handleMessage(event.data);
    });

    socket.addEventListener('error', () => {
      if (this.socket === socket) this.onStatus('error');
    });

    socket.addEventListener('close', () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.serverSubscriptions.clear();
      this.pending.clear();
      for (const subscription of this.subscriptions.values()) subscription.serverId = null;
      if (this.closed) {
        this.onStatus('closed');
        return;
      }
      this.onStatus('disconnected');
      this.#scheduleReconnect();
    });
  }

  subscribe(method, params, unsubscribeMethod, onNotification) {
    const localId = this.nextLocalId++;
    const subscription = {
      method,
      params,
      unsubscribeMethod,
      onNotification,
      serverId: null,
    };
    this.subscriptions.set(localId, subscription);
    this.connect();
    if (this.socket?.readyState === 1) this.#sendSubscribe(localId, subscription);

    return () => this.unsubscribe(localId);
  }

  subscribeSlot(onNotification) {
    return this.subscribe('slotSubscribe', [], 'slotUnsubscribe', onNotification);
  }

  subscribeAccount(address, onNotification, commitment = 'confirmed') {
    return this.subscribe(
      'accountSubscribe',
      [address, { commitment, encoding: 'base64' }],
      'accountUnsubscribe',
      onNotification,
    );
  }

  subscribeProgram(programId, onNotification, commitment = 'confirmed') {
    return this.subscribe(
      'programSubscribe',
      [programId, { commitment, encoding: 'base64' }],
      'programUnsubscribe',
      onNotification,
    );
  }

  unsubscribe(localId) {
    const subscription = this.subscriptions.get(localId);
    if (!subscription) return;
    this.subscriptions.delete(localId);

    if (subscription.serverId != null) {
      this.serverSubscriptions.delete(subscription.serverId);
      if (this.socket?.readyState === 1) {
        this.socket.send(
          JSON.stringify({
            jsonrpc: '2.0',
            id: this.nextRequestId++,
            method: subscription.unsubscribeMethod,
            params: [subscription.serverId],
          }),
        );
      }
    }
  }

  close() {
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.subscriptions.clear();
    this.serverSubscriptions.clear();
    this.pending.clear();
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.onStatus('closed');
  }

  #sendSubscribe(localId, subscription) {
    if (this.socket?.readyState !== 1) return;
    const requestId = this.nextRequestId++;
    this.pending.set(requestId, localId);
    this.socket.send(
      JSON.stringify({
        jsonrpc: '2.0',
        id: requestId,
        method: subscription.method,
        params: subscription.params,
      }),
    );
  }

  #handleMessage(raw) {
    let payload;
    try {
      payload = JSON.parse(String(raw));
    } catch {
      return;
    }

    if (payload?.id != null && this.pending.has(payload.id)) {
      const localId = this.pending.get(payload.id);
      this.pending.delete(payload.id);
      const subscription = this.subscriptions.get(localId);
      if (!subscription) return;
      if (payload.error) {
        subscription.onNotification?.({ type: 'subscriptionError', error: payload.error });
        return;
      }
      if (typeof payload.result === 'number') {
        subscription.serverId = payload.result;
        this.serverSubscriptions.set(payload.result, localId);
      }
      return;
    }

    const serverId = payload?.params?.subscription;
    if (typeof serverId !== 'number') return;
    const localId = this.serverSubscriptions.get(serverId);
    const subscription = localId == null ? null : this.subscriptions.get(localId);
    if (!subscription) return;
    subscription.onNotification?.(payload.params.result, payload.method);
  }

  #scheduleReconnect() {
    if (this.closed || this.reconnectTimer || this.subscriptions.size === 0) return;
    const delay = this.reconnectDelay;
    this.reconnectDelay = nextBackoff(this.reconnectDelay, this.maxReconnectMs);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}
