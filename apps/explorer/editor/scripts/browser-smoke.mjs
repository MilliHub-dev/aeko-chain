import { spawn } from 'node:child_process'
import { access, mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const baseUrl = process.env.AEKO_STUDIO_SMOKE_URL || 'http://127.0.0.1:4100/'
const executable = process.env.AEKO_BROWSER_EXECUTABLE
if (!executable) throw new Error('AEKO_BROWSER_EXECUTABLE is required for the Contract Studio browser smoke.')
await access(executable)

async function availableDebugPort() {
  return await new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('Could not allocate a Chromium DevTools port.'))
        return
      }
      server.close((error) => error ? reject(error) : resolve(address.port))
    })
  })
}

const configuredDebugPort = Number(process.env.AEKO_BROWSER_DEBUG_PORT || 0)
if (!Number.isInteger(configuredDebugPort) || configuredDebugPort < 0 || configuredDebugPort > 65535) {
  throw new Error('AEKO_BROWSER_DEBUG_PORT must be a valid TCP port.')
}
const debugPort = configuredDebugPort || await availableDebugPort()

const profile = await mkdtemp(join(tmpdir(), 'aeko-studio-browser-'))
const child = spawn(executable, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--no-first-run',
  '--no-default-browser-check',
  '--remote-debugging-address=127.0.0.1',
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`,
  'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] })
const childExit = new Promise((resolve) => child.once('exit', resolve))

let browserStderr = ''
let socket
let closed = false

function stopBrowser() {
  if (closed) return
  closed = true
  try { socket?.close() } catch {}
  if (!child.killed) child.kill('SIGTERM')
}

process.once('SIGINT', stopBrowser)
process.once('SIGTERM', stopBrowser)

child.stderr.setEncoding('utf8')
child.stderr.on('data', (chunk) => {
  browserStderr += chunk
})

try {
  const devtoolsUrl = `http://127.0.0.1:${debugPort}/json/version`
  const deadline = Date.now() + 20_000
  let browserWebSocketUrl = ''

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Chromium exited before the smoke test started (exit ${child.exitCode}).\n${browserStderr}`)
    }

    try {
      const response = await fetch(devtoolsUrl)
      if (response.ok) {
        const payload = await response.json()
        if (typeof payload.webSocketDebuggerUrl === 'string' && payload.webSocketDebuggerUrl) {
          browserWebSocketUrl = payload.webSocketDebuggerUrl
          break
        }
      }
    } catch {
      // Chromium may take a few seconds to bind the DevTools endpoint on CI.
    }

    await new Promise((resolve) => setTimeout(resolve, 200))
  }

  if (!browserWebSocketUrl) {
    throw new Error(`Chromium DevTools endpoint did not start at ${devtoolsUrl}.\n${browserStderr}`)
  }

  socket = new WebSocket(browserWebSocketUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })

  let nextId = 1
  const pending = new Map()
  const runtimeErrors = []

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)

    if (message.id && pending.has(message.id)) {
      const waiter = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) {
        waiter.reject(new Error(`${message.error.message || 'CDP error'} (${message.error.code ?? 'unknown'})`))
      } else {
        waiter.resolve(message.result)
      }
      return
    }

    if (message.method === 'Runtime.exceptionThrown') {
      const details = message.params?.exceptionDetails
      runtimeErrors.push(details?.exception?.description || details?.text || 'Uncaught browser exception')
    }

    if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') {
      const output = (message.params.args || [])
        .map((arg) => arg.value || arg.description || '')
        .join(' ')
      if (/AEKO Contract Studio bootstrap failed|Failed to resolve import|Internal server error|ReferenceError|TypeError|SyntaxError/i.test(output)) {
        runtimeErrors.push(output)
      }
    }
  })

  function send(method, params = {}, sessionId) {
    const id = nextId++
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
    })
  }

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
  await send('Runtime.enable', {}, sessionId)
  await send('Page.enable', {}, sessionId)
  await send('Page.navigate', { url: baseUrl }, sessionId)

  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    }, sessionId)

    if (result.exceptionDetails) {
      const details = result.exceptionDetails
      throw new Error(details.exception?.description || details.text || 'Browser evaluation failed.')
    }
    return result.result?.value
  }

  async function waitFor(expression, label, timeoutMs = 30_000) {
    const deadline = Date.now() + timeoutMs
    let lastValue

    while (Date.now() < deadline) {
      try {
        lastValue = await evaluate(expression)
        if (lastValue) return lastValue
      } catch (cause) {
        lastValue = cause instanceof Error ? cause.message : String(cause)
      }
      await new Promise((resolve) => setTimeout(resolve, 200))
    }

    const body = await evaluate('document.body?.innerText || ""').catch(() => '')
    throw new Error(`Timed out waiting for ${label}. Last value: ${String(lastValue)}\nRendered page:\n${body}`)
  }

  await waitFor(
    `document.body?.innerText.includes('Open Contract Studio') || document.body?.innerText.includes('Studio failed to start')`,
    'Studio startup result',
  )

  const startupText = await evaluate('document.body?.innerText || ""')
  if (String(startupText).includes('Studio failed to start')) {
    throw new Error(`Contract Studio rendered its startup failure state.\n${startupText}`)
  }

  await evaluate(`(() => {
    const button = [...document.querySelectorAll('button')]
      .find((element) => element.textContent?.includes('Open Contract Studio'))
    if (!button) throw new Error('Open Contract Studio button was not found.')
    button.click()
    return true
  })()`)

  await waitFor(
    `document.body?.innerText.includes('AEKO CONTRACT STUDIO') && Boolean(document.querySelector('#project-name'))`,
    'workspace launcher',
  )

  await evaluate(`(() => {
    const template = [...document.querySelectorAll('button')]
      .find((element) => element.textContent?.includes('DApp Client'))
    if (!template) throw new Error('DApp Client template button was not found.')
    template.click()
    return true
  })()`)

  await waitFor(
    `[...document.querySelectorAll('button')].some((element) =>
      element.textContent?.includes('DApp Client') && element.getAttribute('aria-pressed') === 'true'
    )`,
    'DApp Client template selection',
  )

  await evaluate(`(() => {
    const button = [...document.querySelectorAll('button')]
      .find((element) => element.textContent?.includes('Create project'))
    if (!button) throw new Error('Create project button was not found.')
    button.click()
    return true
  })()`)

  await waitFor(
    `Boolean(document.querySelector('[aria-label^="Editor for "] .monaco-editor'))`,
    'a mounted Monaco editor',
    45_000,
  )

  const editorState = await evaluate(`(() => {
    const host = document.querySelector('[aria-label^="Editor for "]')
    const editor = host?.querySelector('.monaco-editor')
    if (!(host instanceof HTMLElement) || !(editor instanceof HTMLElement)) return null
    const rect = editor.getBoundingClientRect()
    return {
      label: host.getAttribute('aria-label') || '',
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    }
  })()`)

  if (!editorState || editorState.width < 100 || editorState.height < 100) {
    throw new Error(`Monaco mounted without a usable viewport: ${JSON.stringify(editorState)}`)
  }
  if (!/\.tsx?$/.test(editorState.label)) {
    throw new Error(`Browser smoke did not exercise a TypeScript editor: ${editorState.label}`)
  }
  if (runtimeErrors.length) {
    throw new Error(`Browser runtime reported critical errors:\n${runtimeErrors.join('\n\n')}`)
  }

  process.stdout.write(
    `Contract Studio browser smoke passed (${editorState.label}, ${editorState.width}x${editorState.height}).\n`,
  )
  stopBrowser()
  await childExit
} finally {
  stopBrowser()
  await childExit.catch(() => undefined)
  await rm(profile, { recursive: true, force: true })
}
