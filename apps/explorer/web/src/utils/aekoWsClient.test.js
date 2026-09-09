import assert from 'node:assert/strict';
import test from 'node:test';
import { AekoWsClient } from './aekoWsClient.js';

class FakeSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.OPEN = 1;
    this.listeners = new Map();
    this.sent = [];
  }

  addEventListener(type, handler) {
    const list = this.listeners.get(type) || [];
    list.push(handler);
    this.listeners.set(type, list);
  }

  emit(type, payload = {}) {
    for (const handler of this.listeners.get(type) || []) handler(payload);
  }

  open() {
    this.readyState = 1;
    this.emit('open');
  }

  send(payload) {
    this.sent.push(JSON.parse(payload));
  }

  message(payload) {
    this.emit('message', { data: JSON.stringify(payload) });
  }

  close() {
    this.readyState = 3;
    this.emit('close');
  }
}

test('multiplexes slot and account subscriptions on one websocket', () => {
  const sockets = [];
  const statuses = [];
  const slotEvents = [];
  const accountEvents = [];
  const client = new AekoWsClient('wss://ws.aeko.test', {
    websocketFactory: (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    },
    onStatus: (status) => statuses.push(status),
  });

  const stopSlot = client.subscribeSlot((event) => slotEvents.push(event));
  const stopAccount = client.subscribeAccount('Wallet111111111111111111111111111111111', (event) => accountEvents.push(event));
  assert.equal(sockets.length, 1);
  const socket = sockets[0];
  socket.open();

  assert.equal(socket.sent.length, 2);
  assert.equal(socket.sent[0].method, 'slotSubscribe');
  assert.equal(socket.sent[1].method, 'accountSubscribe');
  assert.deepEqual(socket.sent[1].params[1], { commitment: 'confirmed', encoding: 'base64' });

  const slotRequest = socket.sent[0];
  const accountRequest = socket.sent[1];
  socket.message({ jsonrpc: '2.0', id: slotRequest.id, result: 41 });
  socket.message({ jsonrpc: '2.0', id: accountRequest.id, result: 42 });
  socket.message({ jsonrpc: '2.0', method: 'slotNotification', params: { subscription: 41, result: { slot: 123 } } });
  socket.message({ jsonrpc: '2.0', method: 'accountNotification', params: { subscription: 42, result: { context: { slot: 124 }, value: { lamports: 500 } } } });

  assert.equal(slotEvents[0].slot, 123);
  assert.equal(accountEvents[0].value.lamports, 500);
  assert.ok(statuses.includes('connected'));

  stopSlot();
  stopAccount();
  assert.equal(socket.sent.at(-2).method, 'slotUnsubscribe');
  assert.equal(socket.sent.at(-1).method, 'accountUnsubscribe');
  client.close();
});

test('resubscribes desired subscriptions after reconnect', () => {
  const sockets = [];
  const timers = [];
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  globalThis.setTimeout = (handler) => {
    timers.push(handler);
    return timers.length;
  };
  globalThis.clearTimeout = () => {};

  try {
    const client = new AekoWsClient('wss://ws.aeko.test', {
      websocketFactory: (url) => {
        const socket = new FakeSocket(url);
        sockets.push(socket);
        return socket;
      },
    });
    client.subscribeSlot(() => {});
    sockets[0].open();
    assert.equal(sockets[0].sent.filter((item) => item.method === 'slotSubscribe').length, 1);
    sockets[0].close();
    assert.equal(timers.length, 1);
    timers[0]();
    assert.equal(sockets.length, 2);
    sockets[1].open();
    assert.equal(sockets[1].sent.filter((item) => item.method === 'slotSubscribe').length, 1);
    client.close();
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});
