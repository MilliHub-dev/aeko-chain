import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import test from 'node:test';

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
}

async function unusedPort() {
  const probe = createServer();
  const port = await listen(probe);
  await new Promise((resolve, reject) => {
    probe.close((error) => (error ? reject(error) : resolve()));
  });
  return port;
}

async function waitForScan(port, child, stderr) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Scan test server exited early (${child.exitCode}): ${stderr.value}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/healthz`);
      if (response.ok) return;
    } catch {
      // Startup race.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Scan test server did not become healthy: ${stderr.value}`);
}

test('funding proxy converts an upstream HTML 403 into the Explorer JSON error contract', async (t) => {
  let upstreamRequests = 0;
  const upstream = createServer((req, res) => {
    upstreamRequests += 1;
    assert.equal(req.method, 'POST');
    assert.equal(req.url, '/funding/request');
    res.writeHead(403, { 'content-type': 'text/html; charset=UTF-8' });
    res.end('<!doctype html><html><body>edge challenge</body></html>');
  });
  const upstreamPort = await listen(upstream);
  t.after(() => upstream.close());

  const scanPort = await unusedPort();
  const stderr = { value: '' };
  const serverPath = fileURLToPath(
    new URL('../../../../../docker/explorer-ui-server.mjs', import.meta.url),
  );
  const child = spawn(process.execPath, [serverPath], {
    env: {
      ...process.env,
      PORT: String(scanPort),
      AEKO_NETWORK: 'testnet',
      AEKO_EXPLORER_API_URL: 'https://public-api.invalid',
      AEKO_EXPLORER_PROXY_UPSTREAM_URL: `http://127.0.0.1:${upstreamPort}`,
      AEKO_LOG_LEVEL: 'error',
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderr.value += chunk;
  });
  t.after(() => child.kill('SIGTERM'));

  await waitForScan(scanPort, child, stderr);

  const response = await fetch(
    `http://127.0.0.1:${scanPort}/api/explorer/testnet/funding/request`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address: 'test-address' }),
    },
  );

  assert.equal(upstreamRequests, 1, 'server-only upstream override should receive the request');
  assert.equal(response.status, 502);
  assert.match(response.headers.get('content-type') || '', /application\/json/i);
  const payload = await response.json();
  assert.equal(payload.error?.code, 'EXPLORER_UPSTREAM_INVALID_RESPONSE');
  assert.match(payload.error?.message || '', /non-JSON response/i);
  assert.match(stderr.value, /funding_upstream_contract_violation/);
});


test('production Scan refuses to fall back through the public Explorer edge', async () => {
  const scanPort = await unusedPort();
  const stderr = { value: '' };
  const serverPath = fileURLToPath(
    new URL('../../../../../docker/explorer-ui-server.mjs', import.meta.url),
  );
  const child = spawn(process.execPath, [serverPath], {
    env: {
      ...process.env,
      PORT: String(scanPort),
      AEKO_NETWORK: 'testnet',
      AEKO_EXPLORER_API_URL: 'https://public-api.invalid',
      AEKO_EXPLORER_PROXY_UPSTREAM_URL: '',
      AEKO_LOG_LEVEL: 'error',
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderr.value += chunk;
  });

  const [code] = await once(child, 'exit');
  assert.notEqual(code, 0);
  assert.match(stderr.value, /AEKO_EXPLORER_PROXY_UPSTREAM_URL is required/);
});
