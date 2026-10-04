function endpoint(baseUrl, path) {
  const base = String(baseUrl || '').trim();
  if (!base) throw new Error('Explorer API is not configured for the selected network.');
  return new URL(path.replace(/^\//, ''), `${base.replace(/\/?$/, '/')}`).toString();
}

async function read(response, label) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new Error(`${label} returned a non-JSON response (HTTP ${response.status}).`);
  }
  const payload = await response.json();
  if (!response.ok || !payload?.data) {
    const error = new Error(payload?.error?.message || `${label} failed with HTTP ${response.status}.`);
    error.code = payload?.error?.code;
    error.status = response.status;
    throw error;
  }
  return payload.data;
}

async function request(baseUrl, path, options = {}) {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 120_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint(baseUrl, path), {
      method: options.method || 'GET',
      headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
      cache: 'no-store',
      signal: options.signal || controller.signal,
    });
    return await read(response, options.label || 'Editor request');
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Editor request timed out or was cancelled.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function getEditorCapabilities(apiUrl) {
  return request(apiUrl, '/editor/capabilities', {
    label: 'Editor capability request',
    timeoutMs: 15_000,
  });
}

export function buildEditorProject(apiUrl, files, options = {}) {
  return request(apiUrl, '/editor/build', {
    method: 'POST',
    body: { files },
    label: 'AEKO SBF build',
    timeoutMs: options.timeoutMs ?? 150_000,
    signal: options.signal,
  });
}

export function testEditorProject(apiUrl, files, options = {}) {
  return request(apiUrl, '/editor/test', {
    method: 'POST',
    body: { files },
    label: 'AEKO Rust tests',
    timeoutMs: options.timeoutMs ?? 150_000,
    signal: options.signal,
  });
}

export async function deriveProgramDataAddress(apiUrl, programId) {
  const data = await request(apiUrl, '/editor/program-data-address', {
    method: 'POST',
    body: { programId },
    label: 'ProgramData address derivation',
    timeoutMs: 15_000,
  });
  return data;
}
