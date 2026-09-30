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

test('production Scan starts without an Explorer proxy upstream', async (t) => {
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
      AEKO_EXPLORER_PROXY_UPSTREAM_URL: '',
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
  assert.equal(child.exitCode, null);
});

test('legacy Scan Explorer proxy paths fail explicitly instead of serving SPA HTML', async (t) => {
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
  );
  assert.equal(response.status, 410);
  assert.match(response.headers.get('content-type') || '', /application\/json/i);
  const payload = await response.json();
  assert.equal(payload.error?.code, 'SCAN_EXPLORER_PROXY_REMOVED');
  assert.match(payload.error?.message || '', /runtime-config\.js directly/i);
});
