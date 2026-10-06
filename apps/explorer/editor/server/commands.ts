import { spawn, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from 'node:child_process'
import os from 'node:os'
import { delimiter, resolve } from 'node:path'
import type { Server } from 'socket.io'
import type { StudioCommand } from '../shared/contracts/command.js'
import type { ProjectTemplate } from '../shared/contracts/workspace.js'
import type { ClientToServerEvents, InterServerEvents, ServerToClientEvents, SocketData } from '../shared/contracts/socket.js'
import type { EditorSession } from '../shared/contracts/session.js'
import type { EditorServerConfig } from './types.js'
import type { WorkspaceManager } from './workspaces.js'

type StudioSocketServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>
interface CommandSpec { executable: string; args: string[]; label: string }
interface CommandRecord {
  sessionId: string
  workspaceId: string
  history: string
  running: StudioCommand | null
  child: ChildProcessWithoutNullStreams | null
  lastUsedAt: number
}

const COMMANDS: Record<ProjectTemplate, Partial<Record<StudioCommand, CommandSpec>>> = {
  'rust-program': {
    build: { executable: 'cargo-build-sbf', args: ['--manifest-path', 'Cargo.toml', '--sbf-out-dir', 'out'], label: 'Build SBF program' },
    test: { executable: 'cargo', args: ['test', '--offline'], label: 'Run Rust tests' },
    clean: { executable: 'cargo', args: ['clean'], label: 'Clean Rust build artifacts' },
  },
  'typescript-client': {
    build: { executable: 'tsc', args: ['--noEmit', '-p', 'tsconfig.json'], label: 'Type-check client' },
    test: { executable: 'node', args: ['--experimental-strip-types', '--test'], label: 'Run client tests' },
    run: { executable: 'node', args: ['--experimental-strip-types', 'src/index.ts'], label: 'Run client' },
  },
  'python-client': {
    test: { executable: os.platform() === 'win32' ? 'python' : 'python3', args: ['-m', 'unittest', 'discover', '-s', 'tests'], label: 'Run Python tests' },
    run: { executable: os.platform() === 'win32' ? 'python' : 'python3', args: ['src/main.py'], label: 'Run client' },
  },
}

function available(template: ProjectTemplate): StudioCommand[] {
  return (Object.keys(COMMANDS[template]) as StudioCommand[])
}

function trim(value: string, maxBytes: number): string {
  const buffer = Buffer.from(value)
  return buffer.length <= maxBytes ? value : buffer.subarray(buffer.length - maxBytes).toString('utf8')
}

export class CommandManager {
  readonly records = new Map<string, CommandRecord>()

  constructor(
    private readonly config: Readonly<EditorServerConfig>,
    private readonly io: StudioSocketServer,
    private readonly workspaces: WorkspaceManager,
  ) {}

  key(sessionId: string, workspaceId: string): string { return `${sessionId}:${workspaceId}` }
  room(sessionId: string, workspaceId: string): string { return `console:${sessionId}:${workspaceId}` }

  async snapshot(session: EditorSession, workspaceId: string) {
    const { metadata } = await this.workspaces.assertOwned(session, workspaceId)
    const record = this.records.get(this.key(session.id, workspaceId))
    return {
      room: this.room(session.id, workspaceId),
      ready: {
        history: record?.history ?? '',
        running: record?.running ?? null,
        available: available(metadata.template),
      },
    }
  }

  async run(session: EditorSession, workspaceId: string, command: StudioCommand): Promise<void> {
    const { root, metadata } = await this.workspaces.assertOwned(session, workspaceId)
    const spec = COMMANDS[metadata.template][command]
    if (!spec) throw new Error(`${command} is not available for ${metadata.template} projects.`)

    const key = this.key(session.id, workspaceId)
    const existing = this.records.get(key)
    if (existing?.running) throw new Error(`${existing.running} is already running in this project.`)

    const record: CommandRecord = existing ?? {
      sessionId: session.id, workspaceId, history: '', running: null, child: null, lastUsedAt: Date.now(),
    }
    record.running = command
    record.lastUsedAt = Date.now()
    const prefix = `\n› ${spec.label}\n$ ${spec.executable} ${spec.args.join(' ')}\n\n`
    record.history = trim(record.history + prefix, this.config.terminalHistoryBytes)
    this.records.set(key, record)
    const room = this.room(session.id, workspaceId)
    this.io.to(room).emit('console:output', { workspaceId, data: prefix, stream: 'system' })
    this.io.to(room).emit('console:state', { workspaceId, command, status: 'running' })

    const env: NodeJS.ProcessEnv = {
      HOME: root,
      LANG: 'C.UTF-8',
      PATH: [
        resolve(process.cwd(), 'node_modules/.bin'),
        ...(process.platform === 'win32' ? [] : ['/opt/aeko', '/usr/local/cargo/bin', '/usr/local/bin', '/usr/bin', '/bin']),
        String(process.env.PATH || ''),
      ].filter(Boolean).join(delimiter),
      CARGO_HOME: `${root}/.cargo`,
      RUSTUP_HOME: process.platform === 'win32' ? String(process.env.RUSTUP_HOME || '') : '/usr/local/rustup',
      CARGO_NET_OFFLINE: 'false',
      RUSTC_WRAPPER: '',
      AEKO_NETWORK: this.config.network,
      AEKO_RPC_URL: this.config.rpcUrl,
      AEKO_EXPLORER_URL: this.config.explorerUrl,
    }
    const options: SpawnOptionsWithoutStdio = { cwd: root, env, shell: false }
    if (process.platform !== 'win32' && process.getuid?.() === 0) {
      options.uid = session.uid
      options.gid = session.gid
    }

    const child = spawn(spec.executable, spec.args, options)
    record.child = child
    const append = (data: Buffer, stream: 'stdout' | 'stderr') => {
      const value = data.toString('utf8')
      record.lastUsedAt = Date.now()
      record.history = trim(record.history + value, this.config.terminalHistoryBytes)
      this.io.to(room).emit('console:output', { workspaceId, data: value, stream })
    }
    child.stdout.on('data', (data: Buffer) => append(data, 'stdout'))
    child.stderr.on('data', (data: Buffer) => append(data, 'stderr'))
    child.on('error', (error) => append(Buffer.from(`\n${error.message}\n`), 'stderr'))
    child.on('close', (code, signal) => {
      const cancelled = signal !== null
      const status = cancelled ? 'cancelled' : code === 0 ? 'succeeded' : 'failed'
      const suffix = `\n[AEKO Studio: ${status}${code === null ? '' : ` · exit ${code}`}]\n`
      record.history = trim(record.history + suffix, this.config.terminalHistoryBytes)
      record.running = null
      record.child = null
      record.lastUsedAt = Date.now()
      this.io.to(room).emit('console:output', { workspaceId, data: suffix, stream: 'system' })
      this.io.to(room).emit('console:state', {
        workspaceId, command, status, ...(code === null ? {} : { exitCode: code }),
      })
    })
  }

  cancel(session: EditorSession, workspaceId: string): void {
    const record = this.records.get(this.key(session.id, workspaceId))
    if (record?.child && record.running) record.child.kill('SIGTERM')
  }

  closeWorkspace(sessionId: string, workspaceId: string): void {
    const key = this.key(sessionId, workspaceId)
    const record = this.records.get(key)
    record?.child?.kill('SIGTERM')
    this.records.delete(key)
  }

  closeSession(sessionId: string): void {
    for (const [key, record] of this.records) {
      if (record.sessionId !== sessionId) continue
      record.child?.kill('SIGTERM')
      this.records.delete(key)
    }
  }

  sweep(maxIdleMs: number): void {
    const now = Date.now()
    for (const [key, record] of this.records) {
      if (record.running || now - record.lastUsedAt <= maxIdleMs) continue
      this.records.delete(key)
    }
  }
}
