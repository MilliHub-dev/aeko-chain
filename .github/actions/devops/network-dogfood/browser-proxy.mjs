export const DOGFOOD_ENDPOINTS = Object.freeze({
  publicRpcOrigin: 'https://rpc.aeko.online',
  publicApiOrigin: 'https://api.aeko.online',
  localRpcOrigin: 'http://127.0.0.1:8899',
  localApiOrigin: 'http://127.0.0.1:8088',
});

function origin(value) {
  return new URL(value).origin;
}

export function rewriteDogfoodUrl(rawUrl, endpoints = DOGFOOD_ENDPOINTS) {
  const source = new URL(rawUrl);
  let targetOrigin = null;

  if (source.origin === origin(endpoints.publicRpcOrigin)) {
    targetOrigin = endpoints.localRpcOrigin;
  } else if (source.origin === origin(endpoints.publicApiOrigin)) {
    targetOrigin = endpoints.localApiOrigin;
  }

  if (!targetOrigin) return rawUrl;

  const target = new URL(`${source.pathname}${source.search}`, `${origin(targetOrigin)}/`);
  target.hash = source.hash;
  return target.toString();
}

function requestHeadersForLocalProxy(request) {
  const headers = { ...request.headers() };
  for (const name of ['host', 'connection', 'content-length', 'origin', 'referer']) {
    delete headers[name];
  }
  return headers;
}

function corsHeaders(request, responseHeaders = {}) {
  const requestHeaders = request.headers();
  const headers = { ...responseHeaders };
  headers['access-control-allow-origin'] = requestHeaders.origin || '*';
  headers['access-control-allow-methods'] = 'GET,POST,OPTIONS';
  headers['access-control-allow-headers'] =
    requestHeaders['access-control-request-headers'] || 'accept,content-type';

  // Node fetch transparently decompresses the body. Let Playwright recalculate
  // transport framing rather than forwarding stale compression/length metadata.
  delete headers['content-encoding'];
  delete headers['content-length'];
  delete headers['transfer-encoding'];
  return headers;
}

async function proxyDogfoodRequest(route, endpoints) {
  const request = route.request();
  const localUrl = rewriteDogfoodUrl(request.url(), endpoints);
  if (localUrl === request.url()) {
    await route.continue();
    return;
  }

  if (request.method() === 'OPTIONS') {
    await route.fulfill({ status: 204, headers: corsHeaders(request) });
    return;
  }

  const method = request.method();
  const body = method === 'GET' || method === 'HEAD' ? undefined : request.postDataBuffer() || undefined;
  const response = await fetch(localUrl, {
    method,
    headers: requestHeadersForLocalProxy(request),
    body,
  });
  const responseBody = Buffer.from(await response.arrayBuffer());
  const responseHeaders = Object.fromEntries(response.headers.entries());

  await route.fulfill({
    status: response.status,
    headers: corsHeaders(request, responseHeaders),
    body: responseBody,
  });
}

export async function installDogfoodEndpointProxy(page, endpoints = DOGFOOD_ENDPOINTS) {
  const handler = (route) => proxyDogfoodRequest(route, endpoints);
  await page.route(`${origin(endpoints.publicRpcOrigin)}/**`, handler);
  await page.route(`${origin(endpoints.publicApiOrigin)}/**`, handler);
}
