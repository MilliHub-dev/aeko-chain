import os from 'node:os'
import pty from 'node-pty'

function boundedDimension(value, fallback, max) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 && parsed <= max ? parsed : fallback
}

function trimHistory(value, maxBytes) {
  const buffer = Buffer.from(value)
  if (buffer.length <= maxBytes) return value
  return buffer.subarray(buffer.length - maxBytes).toString('utf8')
}

export class TerminalManager {
  constructor(config, io, workspaces) {
    this.config = config
    this.io = io
    this.workspaces = workspaces
    this.terminals = new Map()
  }

  key(sessionId, workspaceId) {
    return `${sessionId}:${workspaceId}`
  }

  async start(session, workspaceId, dimensions = {}) {
    const { root, metadata } = await this.workspaces.assertOwned(session, workspaceId)
    const key = this.key(session.id, workspaceId)
    const existing = this.terminals.get(key)
    if (existing && !existing.exited) {
      existing.lastUsedAt = Date.now()
      return existing
    }

    const room = `terminal:${session.id}:${workspaceId}`
    const shell = os.platform() === 'win32' ? 'powershell.exe' : '/bin/bash'
    const terminal = pty.spawn(shell, os.platform() === 'win32' ? [] : ['--noprofile', '--norc'], {
      name: 'xterm-256color',
      cols: boundedDimension(dimensions.cols, 100, 500),
      rows: boundedDimension(dimensions.rows, 30, 200),
      cwd: root,
      uid: os.platform() === 'win32' || process.getuid?.() !== 0 ? undefined : session.uid,
      gid: os.platform() === 'win32' || process.getuid?.() !== 0 ? undefined : session.gid,
      env: {
        HOME: root,
        LANG: 'C.UTF-8',
        TERM: 'xterm-256color',
        PATH: '/app/node_modules/.bin:/opt/aeko:/usr/local/cargo/bin:/usr/local/bin:/usr/bin:/bin',
        CARGO_HOME: `${root}/.cargo`,
        RUSTUP_HOME: '/usr/local/rustup',
        CARGO_NET_OFFLINE: 'false',
        RUSTC_WRAPPER: '',
        AEKO_NETWORK: this.config.network,
        AEKO_RPC_URL: this.config.rpcUrl,
        AEKO_EXPLORER_URL: this.config.explorerUrl,
        PS1: `\\[\\e[38;5;75m\\]${metadata.name}\\[\\e[0m\\]:\\w\\$ `,
      },
    })

    const record = {
      key,
      room,
      workspaceId,
      sessionId: session.id,
      terminal,
      history: '',
      lastUsedAt: Date.now(),
      exited: false,
    }
    terminal.onData((data) => {
      record.lastUsedAt = Date.now()
      record.history = trimHistory(record.history + data, this.config.terminalHistoryBytes)
      this.io.to(room).emit('terminal:data', data)
    })
    terminal.onExit(({ exitCode }) => {
      record.exited = true
      const message = `\r\n[process exited ${exitCode}]\r\n`
      record.history = trimHistory(record.history + message, this.config.terminalHistoryBytes)
      this.io.to(room).emit('terminal:data', message)
    })
    this.terminals.set(key, record)
    return record
  }

  input(session, workspaceId, data) {
    const record = this.terminals.get(this.key(session.id, workspaceId))
    if (!record || record.exited) throw new Error('Terminal is not running.')
    const value = String(data || '')
    if (Buffer.byteLength(value) > 8192) throw new Error('Terminal input chunk is too large.')
    record.lastUsedAt = Date.now()
    record.terminal.write(value)
  }

  resize(session, workspaceId, cols, rows) {
    const record = this.terminals.get(this.key(session.id, workspaceId))
    if (!record || record.exited) return
    record.lastUsedAt = Date.now()
    record.terminal.resize(
      boundedDimension(cols, 100, 500),
      boundedDimension(rows, 30, 200),
    )
  }

  closeSession(sessionId) {
    for (const [key, record] of this.terminals) {
      if (record.sessionId !== sessionId) continue
      try { record.terminal.kill() } catch {}
      this.terminals.delete(key)
    }
  }

  sweep(maxIdleMs) {
    const now = Date.now()
    for (const [key, record] of this.terminals) {
      if (now - record.lastUsedAt <= maxIdleMs) continue
      try { record.terminal.kill() } catch {}
      this.terminals.delete(key)
    }
  }
}
