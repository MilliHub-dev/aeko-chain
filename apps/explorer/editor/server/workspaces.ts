import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { createReadStream, type Stats } from 'node:fs'
import {
  chmod,
  chown,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import type {
  DeletePathResult,
  DirectoryCreateResult,
  FileContents,
  FileEntry,
  FileWriteResult,
  RenamePathResult,
} from '../shared/contracts/filesystem.js'
import type { ProgramArtifactStatus } from '../shared/contracts/artifact.js'
import type { EditorSession } from '../shared/contracts/session.js'
import type { PreviewStatus } from '../shared/contracts/preview.js'
import type {
  CreateWorkspaceRequest,
  Workspace,
  WorkspaceMetadata,
} from '../shared/contracts/workspace.js'
import { getTemplate, isProjectTemplate } from './templates.js'
import type { EditorServerConfig } from './types.js'

type WorkspaceConfig = Pick<
  EditorServerConfig,
  | 'production'
  | 'workspaceRoot'
  | 'maxWorkspacesPerSession'
  | 'maxFilesPerWorkspace'
  | 'maxFileBytes'
  | 'maxWorkspaceBytes'
  | 'workspaceTtlMs'
>

interface PathRecord {
  relativePath: string
  path: string
}

interface ExistingPathRecord extends PathRecord {
  info: Stats
}

interface WorkspaceLimits {
  maxFiles: number
  maxBytes: number
}

interface PreviewCapability {
  token: string
  sessionId: string
  workspaceId: string
  root: string
  expiresAt: number
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}

function cleanName(value: unknown): string {
  const invalidFilenameCharacter = /[<>:"/\\|?*]/
  const name = Array.from(String(value || '').trim())
    .map((character) => character.charCodeAt(0) <= 0x1f || invalidFilenameCharacter.test(character) ? '-' : character)
    .join('')
    .slice(0, 80)
  if (!name) throw new Error('Project name is required.')
  return name
}

function readCreateWorkspaceRequest(input: unknown): CreateWorkspaceRequest {
  const record = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const template = String(record.template || '')
  if (!isProjectTemplate(template)) throw new Error('Unknown AEKO project template.')
  return { name: cleanName(record.name), template }
}

function parseWorkspaceMetadata(value: unknown): WorkspaceMetadata {
  if (!value || typeof value !== 'object') throw new Error('Workspace metadata is invalid.')
  const record = value as Record<string, unknown>
  const template = String(record.template || '')
  if (!isProjectTemplate(template)) throw new Error('Workspace metadata template is invalid.')

  const fields = ['name', 'templateLabel', 'defaultNewFile', 'createdAt', 'updatedAt'] as const
  for (const field of fields) {
    if (typeof record[field] !== 'string' || !record[field]) {
      throw new Error(`Workspace metadata field ${field} is invalid.`)
    }
  }

  return {
    name: record.name as string,
    template,
    templateLabel: record.templateLabel as string,
    defaultNewFile: record.defaultNewFile as string,
    createdAt: record.createdAt as string,
    updatedAt: record.updatedAt as string,
  }
}

export function normalizeWorkspacePath(raw: unknown): string {
  const value = String(raw || '').trim().replace(/^\.\//, '')
  if (!value || value.length > 300 || value.includes('\0') || value.startsWith('/') || value.includes('\\')) {
    throw new Error('Use a relative workspace path.')
  }
  const parts = value.split('/')
  if (parts.length > 16 || parts.some((part) => !part || part === '.' || part === '..')) {
    throw new Error('Workspace path traversal is not allowed.')
  }
  return parts.join('/')
}

function isInside(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(root + sep)
}

async function containedExisting(root: string, raw: unknown): Promise<ExistingPathRecord> {
  const relativePath = normalizeWorkspacePath(raw)
  const candidate = resolve(root, relativePath)
  if (!isInside(root, candidate)) throw new Error('Workspace path escapes the project root.')
  const info = await lstat(candidate)
  if (info.isSymbolicLink()) throw new Error('Workspace symlinks are not editable.')
  const resolved = await realpath(candidate)
  if (!isInside(root, resolved)) throw new Error('Workspace path escapes the project root.')
  return { relativePath, path: resolved, info }
}

async function ensureDirectory(
  root: string,
  raw: unknown,
  uid: number,
  gid: number,
): Promise<PathRecord> {
  const relativePath = normalizeWorkspacePath(raw)
  let current = root
  for (const part of relativePath.split('/')) {
    const next = join(current, part)
    try {
      const info = await lstat(next)
      if (info.isSymbolicLink() || !info.isDirectory()) {
        throw new Error('A workspace path component is not a regular directory.')
      }
    } catch (error) {
      if (!isErrnoException(error) || error.code !== 'ENOENT') throw error
      await mkdir(next, { mode: 0o770 })
      // Apply the final mode before handing ownership to the sandbox identity.
      // The hardened runtime intentionally does not grant CAP_FOWNER, so chmod
      // after chown would fail once root is no longer the inode owner.
      await chmod(next, 0o770)
      if (typeof process.getuid === 'function' && process.getuid() === 0) {
        await chown(next, uid, gid)
      }
    }
    current = await realpath(next)
    if (!isInside(root, current)) throw new Error('Workspace directory escapes the project root.')
  }
  return { relativePath, path: current }
}

async function containedNewFile(
  root: string,
  raw: unknown,
  uid: number,
  gid: number,
): Promise<PathRecord> {
  const relativePath = normalizeWorkspacePath(raw)
  const candidate = resolve(root, relativePath)
  if (!isInside(root, candidate)) throw new Error('Workspace path escapes the project root.')

  const parentRelative = dirname(relativePath)
  const parent = parentRelative === '.'
    ? { path: root }
    : await ensureDirectory(root, parentRelative, uid, gid)
  if (!isInside(root, parent.path)) throw new Error('Workspace parent escapes the project root.')
  return { relativePath, path: candidate }
}

async function directoryStats(root: string, limits: WorkspaceLimits): Promise<{ count: number; bytes: number }> {
  let count = 0
  let bytes = 0

  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'target' || entry.name === 'out' || entry.name === 'dist') continue
      const path = join(directory, entry.name)
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) {
        await visit(path)
        if (count > limits.maxFiles || bytes > limits.maxBytes) return
        continue
      }
      if (!entry.isFile()) continue
      count += 1
      bytes += (await stat(path)).size
      if (count > limits.maxFiles || bytes > limits.maxBytes) return
    }
  }

  await visit(root)
  return { count, bytes }
}

async function setOwnership(
  path: string,
  uid: number,
  gid: number,
  mode: number,
  production: boolean,
): Promise<void> {
  if (typeof process.getuid === 'function' && process.getuid() === 0) {
    // chmod must happen while the control plane still owns the inode. Production
    // drops CAP_FOWNER by design, so transferring ownership first would make the
    // subsequent chmod fail with EPERM.
    await chmod(path, mode)
    await chown(path, uid, gid)
  } else if (production) {
    throw new Error('Production Contract Studio must run its control plane as root so PTYs can drop privileges.')
  } else {
    await chmod(path, mode)
  }
}

async function applySandboxOwnership(
  root: string,
  uid: number,
  gid: number,
  production: boolean,
): Promise<void> {
  const visit = async (path: string): Promise<void> => {
    const info = await lstat(path)
    if (info.isSymbolicLink()) return
    await setOwnership(path, uid, gid, info.isDirectory() ? 0o770 : 0o660, production)
    if (!info.isDirectory()) return
    for (const entry of await readdir(path)) await visit(join(path, entry))
  }
  await visit(root)
}

async function writeTemplate(root: string, files: Readonly<Record<string, string>>): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    const target = join(root, path)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, content, 'utf8')
  }
}

async function linkDappRuntimeDependencies(root: string): Promise<void> {
  const runtimeDependencies = await realpath(resolve(process.cwd(), 'node_modules'))
  await symlink(runtimeDependencies, join(root, 'node_modules'), 'dir')
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256')
  const stream = createReadStream(path)
  for await (const chunk of stream) hash.update(chunk)
  return hash.digest('hex')
}

function emptyArtifactStatus(supported: boolean): ProgramArtifactStatus {
  return { supported, available: false, fileName: null, byteLength: null, sha256: null, builtAt: null }
}

function conflict(message: string): Error {
  return Object.assign(new Error(message), { status: 409 })
}

export class WorkspaceManager {
  readonly previewCapabilities = new Map<string, PreviewCapability>()
  readonly previewCapabilityKeys = new Map<string, string>()

  constructor(private readonly config: Readonly<WorkspaceConfig>) {}

  async init(): Promise<this> {
    await mkdir(this.config.workspaceRoot, { recursive: true })
    return this
  }

  sessionRoot(session: EditorSession): string {
    return join(this.config.workspaceRoot, session.id)
  }

  metadataRoot(session: EditorSession): string {
    return join(this.sessionRoot(session), '.metadata')
  }

  metadataPath(session: EditorSession, workspaceId: string): string {
    return join(this.metadataRoot(session), `${workspaceId}.json`)
  }

  workspaceRoot(session: EditorSession, workspaceId: string): string {
    if (!/^[0-9a-f-]{36}$/i.test(String(workspaceId || ''))) throw new Error('Invalid workspace id.')
    return join(this.sessionRoot(session), workspaceId)
  }

  async ensureSessionRoot(session: EditorSession): Promise<string> {
    const root = this.sessionRoot(session)
    const metadata = this.metadataRoot(session)
    await mkdir(root, { recursive: true, mode: 0o710 })
    if (typeof process.getuid === 'function' && process.getuid() === 0) {
      await chown(root, 0, session.gid)
      await chmod(root, 0o710)
    } else {
      if (this.config.production) {
        throw new Error('Production Contract Studio requires root control-plane ownership.')
      }
      await chmod(root, 0o700)
    }
    await mkdir(metadata, { recursive: true, mode: 0o700 })
    await setOwnership(metadata, 0, 0, 0o700, this.config.production)
    return root
  }

  async list(session: EditorSession): Promise<Workspace[]> {
    const root = await this.ensureSessionRoot(session)
    const result: Workspace[] = []
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === '.metadata' || !/^[0-9a-f-]{36}$/i.test(entry.name)) continue
      try {
        result.push(await this.metadata(session, entry.name))
      } catch {
        // Ignore incomplete workspaces left by interrupted creation.
      }
    }
    return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  async metadata(session: EditorSession, workspaceId: string): Promise<Workspace> {
    const root = this.workspaceRoot(session, workspaceId)
    await realpath(root)
    const parsed: unknown = JSON.parse(await readFile(this.metadataPath(session, workspaceId), 'utf8'))
    return { ...parseWorkspaceMetadata(parsed), id: workspaceId }
  }

  async writeMetadata(
    session: EditorSession,
    workspaceId: string,
    metadata: WorkspaceMetadata,
  ): Promise<void> {
    await this.ensureSessionRoot(session)
    const path = this.metadataPath(session, workspaceId)
    await writeFile(path, JSON.stringify(metadata, null, 2), { encoding: 'utf8', mode: 0o600 })
    await chmod(path, 0o600)
  }

  async create(session: EditorSession, input: unknown): Promise<Workspace> {
    const existing = await this.list(session)
    if (existing.length >= this.config.maxWorkspacesPerSession) {
      throw Object.assign(new Error('This editor session reached its workspace limit.'), { status: 429 })
    }

    const request = readCreateWorkspaceRequest(input)
    const template = getTemplate(request.template)
    const id = randomUUID()
    const root = this.workspaceRoot(session, id)
    const timestamp = new Date().toISOString()
    const metadata: WorkspaceMetadata = {
      name: request.name,
      template: request.template,
      templateLabel: template.label,
      defaultNewFile: template.defaultNewFile,
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    await mkdir(root, { mode: 0o770 })
    try {
      await writeTemplate(root, template.files)
      if (request.template === 'typescript-dapp') await linkDappRuntimeDependencies(root)
      await applySandboxOwnership(root, session.uid, session.gid, this.config.production)
      await this.writeMetadata(session, id, metadata)
    } catch (error) {
      await rm(root, { recursive: true, force: true })
      await rm(this.metadataPath(session, id), { force: true })
      throw error
    }
    return { id, ...metadata }
  }

  async assertOwned(
    session: EditorSession,
    workspaceId: string,
  ): Promise<{ root: string; metadata: Workspace }> {
    const root = this.workspaceRoot(session, workspaceId)
    const resolved = await realpath(root)
    const sessionRoot = await realpath(this.sessionRoot(session))
    if (!isInside(sessionRoot, resolved)) throw new Error('Workspace is outside this session.')
    const metadata = await this.metadata(session, workspaceId)
    return { root: resolved, metadata }
  }

  async tree(session: EditorSession, workspaceId: string): Promise<FileEntry[]> {
    const { root } = await this.assertOwned(session, workspaceId)
    const entries: FileEntry[] = []

    const visit = async (directory: string, depth: number): Promise<void> => {
      const children = await readdir(directory, { withFileTypes: true })
      children.sort((left, right) => {
        if (left.isDirectory() !== right.isDirectory()) return left.isDirectory() ? -1 : 1
        return left.name.localeCompare(right.name)
      })

      for (const entry of children) {
        if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'target' || entry.name === 'out' || entry.name === 'dist') continue
        const path = join(directory, entry.name)
        if (entry.isSymbolicLink()) continue
        const relativePath = relative(root, path).split(sep).join('/')
        if (entry.isDirectory()) {
          entries.push({ path: relativePath, name: entry.name, depth, type: 'directory' })
          await visit(path, depth + 1)
        } else if (entry.isFile()) {
          entries.push({ path: relativePath, name: entry.name, depth, type: 'file' })
        }
      }
    }

    await visit(root, 0)
    return entries
  }

  async read(session: EditorSession, workspaceId: string, rawPath: unknown): Promise<FileContents> {
    const { root } = await this.assertOwned(session, workspaceId)
    const target = await containedExisting(root, rawPath)
    if (!target.info.isFile()) throw new Error('Only regular workspace files can be opened.')
    if (target.info.size > this.config.maxFileBytes) {
      throw Object.assign(new Error('File is too large to open in the browser editor.'), { status: 413 })
    }
    return { path: target.relativePath, content: await readFile(target.path, 'utf8') }
  }

  async artifactStatus(session: EditorSession, workspaceId: string): Promise<ProgramArtifactStatus> {
    const { root, metadata } = await this.assertOwned(session, workspaceId)
    if (metadata.template !== 'rust-program') return emptyArtifactStatus(false)

    try {
      const output = await containedExisting(root, 'out')
      if (!output.info.isDirectory()) throw conflict('SBF output path is not a regular directory.')

      const candidates: Array<{ name: string; target: ExistingPathRecord }> = []
      for (const entry of await readdir(output.path, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.so')) continue
        const target = await containedExisting(root, `out/${entry.name}`)
        if (target.info.isFile()) candidates.push({ name: entry.name, target })
      }
      candidates.sort((left, right) => (
        right.target.info.mtimeMs - left.target.info.mtimeMs || left.name.localeCompare(right.name)
      ))
      const selected = candidates[0]
      if (!selected) return emptyArtifactStatus(true)

      return {
        supported: true,
        available: true,
        fileName: selected.name,
        byteLength: selected.target.info.size,
        sha256: await sha256File(selected.target.path),
        builtAt: selected.target.info.mtime.toISOString(),
      }
    } catch (error) {
      if (isErrnoException(error) && error.code === 'ENOENT') return emptyArtifactStatus(true)
      throw error
    }
  }

  previewCapabilityKey(sessionId: string, workspaceId: string): string {
    return `${sessionId}:${workspaceId}`
  }

  revokePreview(sessionId: string, workspaceId: string): void {
    const key = this.previewCapabilityKey(sessionId, workspaceId)
    const token = this.previewCapabilityKeys.get(key)
    if (token) this.previewCapabilities.delete(token)
    this.previewCapabilityKeys.delete(key)
  }

  issuePreviewCapability(session: EditorSession, workspaceId: string, root: string): string {
    const key = this.previewCapabilityKey(session.id, workspaceId)
    const existingToken = this.previewCapabilityKeys.get(key)
    const existing = existingToken ? this.previewCapabilities.get(existingToken) : undefined
    if (
      existing
      && existing.workspaceId === workspaceId
      && existing.root === root
      && existing.expiresAt > Date.now()
    ) {
      existing.expiresAt = Date.now() + this.config.workspaceTtlMs
      return existing.token
    }

    this.revokePreview(session.id, workspaceId)
    const token = randomBytes(24).toString('base64url')
    this.previewCapabilities.set(token, {
      token,
      sessionId: session.id,
      workspaceId,
      root,
      expiresAt: Date.now() + this.config.workspaceTtlMs,
    })
    this.previewCapabilityKeys.set(key, token)
    return token
  }

  async previewStatus(session: EditorSession, workspaceId: string): Promise<PreviewStatus> {
    const { root, metadata } = await this.assertOwned(session, workspaceId)
    if (metadata.template !== 'typescript-dapp') {
      return { supported: false, available: false, url: null, builtAt: null }
    }
    try {
      const target = await containedExisting(root, 'dist/index.html')
      if (!target.info.isFile()) throw conflict('DApp preview index is not a regular file.')
      const token = this.issuePreviewCapability(session, workspaceId, root)
      return {
        supported: true,
        available: true,
        url: `/preview/${workspaceId}/${token}/`,
        builtAt: target.info.mtime.toISOString(),
      }
    } catch (error) {
      if (isErrnoException(error) && error.code === 'ENOENT') {
        this.revokePreview(session.id, workspaceId)
        return { supported: true, available: false, url: null, builtAt: null }
      }
      throw error
    }
  }

  async previewAsset(
    workspaceId: string,
    token: string,
    rawPath: unknown,
  ): Promise<{ path: string; relativePath: string }> {
    const capability = this.previewCapabilities.get(token)
    if (
      !capability
      || capability.workspaceId !== workspaceId
      || capability.expiresAt <= Date.now()
    ) {
      if (capability) this.previewCapabilities.delete(token)
      throw Object.assign(new Error('DApp preview link is invalid or expired.'), { status: 404 })
    }

    const root = await realpath(capability.root)
    const relativePath = String(rawPath || '').trim()
      ? normalizeWorkspacePath(rawPath)
      : 'index.html'
    const target = await containedExisting(root, `dist/${relativePath}`)
    if (!target.info.isFile()) throw new Error('Only regular DApp preview files can be served.')
    return { path: target.path, relativePath }
  }

  async createDirectory(
    session: EditorSession,
    workspaceId: string,
    rawPath: unknown,
  ): Promise<DirectoryCreateResult> {
    const { root, metadata } = await this.assertOwned(session, workspaceId)
    const directory = await ensureDirectory(root, rawPath, session.uid, session.gid)
    await this.touch(session, workspaceId, metadata)
    return { path: directory.relativePath }
  }

  async write(
    session: EditorSession,
    workspaceId: string,
    rawPath: unknown,
    content: unknown,
    { createOnly = false }: { createOnly?: boolean } = {},
  ): Promise<FileWriteResult> {
    const { root, metadata } = await this.assertOwned(session, workspaceId)
    const text = String(content ?? '')
    const nextBytes = Buffer.byteLength(text)
    if (nextBytes > this.config.maxFileBytes) {
      throw Object.assign(new Error('File exceeds the editor file-size limit.'), { status: 413 })
    }

    let target: PathRecord
    let previousBytes = 0
    let isNew = false
    try {
      const existing = await containedExisting(root, rawPath)
      if (createOnly) throw Object.assign(new Error('File already exists.'), { status: 409 })
      if (!existing.info.isFile()) throw new Error('Only regular workspace files can be written.')
      previousBytes = existing.info.size
      target = existing
    } catch (error) {
      if (error && typeof error === 'object' && 'status' in error && Number(error.status) === 409) throw error
      if (!isErrnoException(error) || error.code !== 'ENOENT') throw error
      target = await containedNewFile(root, rawPath, session.uid, session.gid)
      isNew = true
    }

    const totals = await directoryStats(root, {
      maxFiles: this.config.maxFilesPerWorkspace,
      maxBytes: this.config.maxWorkspaceBytes,
    })
    const projectedFiles = totals.count + (isNew ? 1 : 0)
    const projectedBytes = totals.bytes - previousBytes + nextBytes
    if (projectedFiles > this.config.maxFilesPerWorkspace || projectedBytes > this.config.maxWorkspaceBytes) {
      throw Object.assign(new Error('Workspace exceeds its storage quota.'), { status: 413 })
    }

    await writeFile(target.path, text, { encoding: 'utf8', flag: createOnly ? 'wx' : 'w' })
    await setOwnership(target.path, session.uid, session.gid, 0o660, this.config.production)
    await this.touch(session, workspaceId, metadata)
    return { path: target.relativePath, byteLength: nextBytes }
  }

  async renamePath(
    session: EditorSession,
    workspaceId: string,
    from: unknown,
    to: unknown,
  ): Promise<RenamePathResult> {
    const { root, metadata } = await this.assertOwned(session, workspaceId)
    const source = await containedExisting(root, from)
    const destinationPath = normalizeWorkspacePath(to)
    const destination = resolve(root, destinationPath)
    if (!isInside(root, destination)) throw new Error('Destination escapes the workspace.')

    const parentRelative = dirname(destinationPath)
    if (parentRelative !== '.') {
      await ensureDirectory(root, parentRelative, session.uid, session.gid)
    }

    try {
      await lstat(destination)
      throw Object.assign(new Error('Destination already exists.'), { status: 409 })
    } catch (error) {
      if (error && typeof error === 'object' && 'status' in error && Number(error.status) === 409) throw error
      if (!isErrnoException(error) || error.code !== 'ENOENT') throw error
    }

    await rename(source.path, destination)
    await this.touch(session, workspaceId, metadata)
    return {
      from: source.relativePath,
      to: destinationPath,
      type: source.info.isDirectory() ? 'directory' : 'file',
    }
  }

  async removePath(
    session: EditorSession,
    workspaceId: string,
    rawPath: unknown,
  ): Promise<DeletePathResult> {
    const { root, metadata } = await this.assertOwned(session, workspaceId)
    const target = await containedExisting(root, rawPath)
    await rm(target.path, { recursive: target.info.isDirectory(), force: false })
    await this.touch(session, workspaceId, metadata)
    return { path: target.relativePath, type: target.info.isDirectory() ? 'directory' : 'file' }
  }

  async removeWorkspace(session: EditorSession, workspaceId: string): Promise<void> {
    const { root } = await this.assertOwned(session, workspaceId)
    this.revokePreview(session.id, workspaceId)
    await rm(root, { recursive: true, force: true })
    await rm(this.metadataPath(session, workspaceId), { force: true })
  }

  closeSession(sessionId: string): void {
    for (const [token, capability] of this.previewCapabilities) {
      if (capability.sessionId !== sessionId) continue
      this.previewCapabilities.delete(token)
      this.previewCapabilityKeys.delete(this.previewCapabilityKey(sessionId, capability.workspaceId))
    }
  }

  async touch(session: EditorSession, workspaceId: string, metadata: WorkspaceMetadata): Promise<void> {
    await this.writeMetadata(session, workspaceId, {
      ...metadata,
      updatedAt: new Date().toISOString(),
    })
  }

  async sweep(activeSessionIds: ReadonlySet<string> = new Set()): Promise<void> {
    const now = Date.now()
    for (const [token, capability] of this.previewCapabilities) {
      if (capability.expiresAt > now) continue
      this.previewCapabilities.delete(token)
      this.previewCapabilityKeys.delete(this.previewCapabilityKey(capability.sessionId, capability.workspaceId))
    }
    const sessions = await readdir(this.config.workspaceRoot, { withFileTypes: true })
    for (const session of sessions) {
      if (!session.isDirectory() || activeSessionIds.has(session.name)) continue
      const root = join(this.config.workspaceRoot, session.name)
      const info = await stat(root)
      if (now - info.mtimeMs > this.config.workspaceTtlMs) {
        this.closeSession(session.name)
        await rm(root, { recursive: true, force: true })
      }
    }
  }
}

export const workspacePathInternals = {
  containedExisting,
  ensureDirectory,
  isInside,
}

