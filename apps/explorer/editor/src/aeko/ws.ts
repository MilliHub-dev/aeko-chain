export type AekoWsStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error' | 'closed'

interface Subscription {
  method: string
  params: unknown[]
  unsubscribeMethod: string
  onNotification: (value: unknown) => void
  serverId: number | null
}

export class AekoWsClient {
  private socket: WebSocket | null = null
  private closed = false
  private reconnectTimer: number | null = null
  private reconnectDelay = 1000
  private nextLocalId = 1
  private nextRequestId = 1
  private subscriptions = new Map<number, Subscription>()
  private serverSubscriptions = new Map<number, number>()
  private pending = new Map<number, number>()

  constructor(
    private readonly url: string,
    private readonly onStatus: (status: AekoWsStatus) => void = () => undefined,
  ) {}

  connect(): void {
    if (this.closed || !this.url) return
    if (this.socket && (this.socket.readyState === WebSocket.CONNECTING || this.socket.readyState === WebSocket.OPEN)) return
    this.onStatus('connecting')
    const socket = new WebSocket(this.url)
    this.socket = socket

    socket.addEventListener('open', () => {
      if (this.socket !== socket) return
      this.reconnectDelay = 1000
      this.onStatus('connected')
      this.serverSubscriptions.clear()
      this.pending.clear()
      for (const [localId, subscription] of this.subscriptions) {
        subscription.serverId = null
        this.sendSubscribe(localId, subscription)
      }
    })

    socket.addEventListener('message', (event) => {
      if (this.socket !== socket) return
      this.handleMessage(String(event.data))
    })

    socket.addEventListener('error', () => {
      if (this.socket === socket) this.onStatus('error')
    })

    socket.addEventListener('close', () => {
      if (this.socket !== socket) return
      this.socket = null
      this.serverSubscriptions.clear()
      this.pending.clear()
      for (const subscription of this.subscriptions.values()) subscription.serverId = null
      if (this.closed) {
        this.onStatus('closed')
        return
      }
      this.onStatus('disconnected')
      this.scheduleReconnect()
    })
  }

  subscribe(
    method: string,
    params: unknown[],
    unsubscribeMethod: string,
    onNotification: (value: unknown) => void,
  ): () => void {
    const localId = this.nextLocalId++
    const subscription: Subscription = { method, params, unsubscribeMethod, onNotification, serverId: null }
    this.subscriptions.set(localId, subscription)
    this.connect()
    if (this.socket?.readyState === WebSocket.OPEN) this.sendSubscribe(localId, subscription)
    return () => this.unsubscribe(localId)
  }

  subscribeProgram(programId: string, onNotification: (value: unknown) => void): () => void {
    return this.subscribe(
      'programSubscribe',
      [programId, { commitment: 'confirmed', encoding: 'base64' }],
      'programUnsubscribe',
      onNotification,
    )
  }

  subscribeLogs(programId: string, onNotification: (value: unknown) => void): () => void {
    return this.subscribe(
      'logsSubscribe',
      [{ mentions: [programId] }, { commitment: 'confirmed' }],
      'logsUnsubscribe',
      onNotification,
    )
  }

  subscribeSignature(signature: string, onNotification: (value: unknown) => void): () => void {
    return this.subscribe(
      'signatureSubscribe',
      [signature, { commitment: 'confirmed' }],
      'signatureUnsubscribe',
      onNotification,
    )
  }

  private unsubscribe(localId: number): void {
    const subscription = this.subscriptions.get(localId)
    if (!subscription) return
    this.subscriptions.delete(localId)
    if (subscription.serverId === null) return
    this.serverSubscriptions.delete(subscription.serverId)
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({
        jsonrpc: '2.0',
        id: this.nextRequestId++,
        method: subscription.unsubscribeMethod,
        params: [subscription.serverId],
      }))
    }
  }

  close(): void {
    this.closed = true
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    this.subscriptions.clear()
    this.serverSubscriptions.clear()
    this.pending.clear()
    this.socket?.close()
    this.socket = null
    this.onStatus('closed')
  }

  private sendSubscribe(localId: number, subscription: Subscription): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return
    const requestId = this.nextRequestId++
    this.pending.set(requestId, localId)
    this.socket.send(JSON.stringify({
      jsonrpc: '2.0',
      id: requestId,
      method: subscription.method,
      params: subscription.params,
    }))
  }

  private handleMessage(raw: string): void {
    let payload: unknown
    try {
      payload = JSON.parse(raw)
    } catch {
      return
    }
    if (!payload || typeof payload !== 'object') return
    const record = payload as {
      id?: number
      result?: unknown
      error?: unknown
      params?: { subscription?: number; result?: unknown }
    }

    if (typeof record.id === 'number' && this.pending.has(record.id)) {
      const localId = this.pending.get(record.id)
      this.pending.delete(record.id)
      if (localId === undefined) return
      const subscription = this.subscriptions.get(localId)
      if (!subscription) return
      if (record.error) {
        subscription.onNotification({ type: 'subscriptionError', error: record.error })
        return
      }
      if (typeof record.result === 'number') {
        subscription.serverId = record.result
        this.serverSubscriptions.set(record.result, localId)
      }
      return
    }

    const serverId = record.params?.subscription
    if (typeof serverId !== 'number') return
    const localId = this.serverSubscriptions.get(serverId)
    if (localId === undefined) return
    this.subscriptions.get(localId)?.onNotification(record.params?.result)
  }

  private scheduleReconnect(): void {
    if (this.closed || this.reconnectTimer !== null || this.subscriptions.size === 0) return
    const delay = this.reconnectDelay
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 10_000)
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delay)
  }
}

export async function confirmSignatureViaWs(
  websocketUrl: string,
  signature: string,
  timeoutMs = 30_000,
): Promise<unknown> {
  if (!websocketUrl) throw new Error('The selected AEKO network does not have a WebSocket endpoint configured.')
  return await new Promise((resolve, reject) => {
    let settled = false
    const client = new AekoWsClient(websocketUrl)
    const timer = window.setTimeout(() => {
      if (settled) return
      settled = true
      client.close()
      reject(new Error('WebSocket confirmation timed out.'))
    }, timeoutMs)
    const unsubscribe = client.subscribeSignature(signature, (value) => {
      if (settled) return
      if (value && typeof value === 'object' && 'type' in value) {
        settled = true
        window.clearTimeout(timer)
        unsubscribe()
        client.close()
        reject(new Error('AEKO WebSocket rejected the signature subscription.'))
        return
      }
      const candidate = value && typeof value === 'object' && 'value' in value
        ? (value as { value?: unknown }).value
        : value
      if (candidate && typeof candidate === 'object' && 'err' in candidate && (candidate as { err?: unknown }).err) {
        settled = true
        window.clearTimeout(timer)
        unsubscribe()
        client.close()
        reject(new Error('Transaction failed: ' + JSON.stringify((candidate as { err?: unknown }).err)))
        return
      }
      settled = true
      window.clearTimeout(timer)
      unsubscribe()
      client.close()
      resolve(candidate)
    })
  })
}
