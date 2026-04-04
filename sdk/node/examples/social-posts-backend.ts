import { createServer } from 'node:http';

import {
  AekoNodeClient,
  JsonFilePostVerificationStore,
  SocialBackendError,
  SocialPostVerificationService,
  type AnchorPostRequest,
  type HashPostRequest,
  type VerifyPostRequest,
} from '../src/index.js';

const rpcUrl = process.env.AEKO_SOCIAL_RPC_URL ?? 'https://api.testnet.aeko.chain';
const bindHost = process.env.AEKO_SOCIAL_BIND_HOST ?? '127.0.0.1';
const bindPort = Number.parseInt(process.env.AEKO_SOCIAL_BIND_PORT ?? '8787', 10);
const persistencePath =
  process.env.AEKO_SOCIAL_STATE_PATH ??
  `${process.cwd()}/sdk/node/.aeko-social-posts-backend.json`;

const client = new AekoNodeClient(rpcUrl, {
  appName: 'aeko-social-backend-reference',
});
const verificationStore = new JsonFilePostVerificationStore(persistencePath);
const service = new SocialPostVerificationService(client, verificationStore);

const server = createServer(async (request, response) => {
  try {
    if (request.method === 'POST' && request.url === '/social/posts/hash') {
      const body = await readJson<HashPostRequest>(request);
      return sendJson(response, 200, await service.hashPost(body));
    }

    if (request.method === 'POST' && request.url === '/social/posts/verify') {
      const body = await readJson<VerifyPostRequest>(request);
      return sendJson(response, 200, await service.verifyPost(body));
    }

    if (request.method === 'POST' && request.url === '/social/posts/anchor') {
      const body = await readJson<AnchorPostRequest>(request);
      return sendJson(response, 200, await service.submitAnchor(body));
    }

    if (request.method === 'GET' && request.url?.startsWith('/social/posts/')) {
      const url = new URL(request.url, `http://${bindHost}:${bindPort}`);
      const match = url.pathname.match(/^\/social\/posts\/([^/]+)\/verification$/);
      if (match) {
        const postId = decodeURIComponent(match[1]);
        return sendJson(response, 200, await service.getVerification(postId));
      }
    }

    if (request.method === 'GET' && request.url?.startsWith('/health')) {
      return sendJson(response, 200, {
        ok: true,
        rpcUrl,
        persistencePath,
      });
    }

    return sendError(response, 404, 'not_found', 'Route not found.');
  } catch (error) {
    if (error instanceof SocialBackendError) {
      return sendError(response, error.statusCode, error.code, error.message, error.extra);
    }
    const message = error instanceof Error ? error.message : 'unknown_error';
    const code = message.includes('Unexpected token') ? 'invalid_payload' : 'bad_request';
    return sendError(response, 400, code, message);
  }
});

server.listen(bindPort, bindHost, () => {
  console.log(`Aeko Social reference backend listening on http://${bindHost}:${bindPort}`);
  console.log(`Using AEKO RPC: ${rpcUrl}`);
  console.log(`Persisting verification state at: ${persistencePath}`);
});

async function readJson<T>(request: Parameters<typeof createServer>[0]): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return JSON.parse(raw) as T;
}

function sendJson(
  response: Parameters<Parameters<typeof createServer>[1]>[1],
  statusCode: number,
  body: unknown,
) {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify(body, null, 2));
}

function sendError(
  response: Parameters<Parameters<typeof createServer>[1]>[1],
  statusCode: number,
  code: string,
  message: string,
  extra?: Record<string, unknown>,
) {
  return sendJson(response, statusCode, {
    errorCode: code,
    message,
    ...extra,
  });
}
