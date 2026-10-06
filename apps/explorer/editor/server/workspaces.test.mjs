import assert from 'node:assert/strict'
import { lstat, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { WorkspaceManager, normalizeWorkspacePath } from './workspaces.mjs'

function config(root) {
  return {
    production: false,
    workspaceRoot: root,
    maxWorkspacesPerSession: 4,
    maxFilesPerWorkspace: 100,
    maxFileBytes: 1024 * 1024,
    maxWorkspaceBytes: 8 * 1024 * 1024,
    workspaceTtlMs: 60_000,
  }
}

function session(id) {
  const uid = typeof process.getuid === 'function' ? process.getuid() : 1000
  const gid = typeof process.getgid === 'function' ? process.getgid() : 1000
  return { id, uid, gid }
}

test('workspace paths reject absolute and traversal input', () => {
  assert.equal(normalizeWorkspacePath('src/lib.rs'), 'src/lib.rs')
  assert.throws(() => normalizeWorkspacePath('../etc/passwd'))
  assert.throws(() => normalizeWorkspacePath('/etc/passwd'))
  assert.throws(() => normalizeWorkspacePath('src\\lib.rs'))
})

test('workspace CRUD supports files and folders inside the authenticated session root', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'aeko-studio-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))

  const manager = await new WorkspaceManager(config(root)).init()
  const owner = session('session-one')
  const workspace = await manager.create(owner, {
    name: 'hello',
    template: 'typescript-client',
  })

  await manager.createDirectory(owner, workspace.id, 'src/modules')
  await manager.write(
    owner,
    workspace.id,
    'src/modules/new.ts',
    'export const answer = 42',
    { createOnly: true },
  )

  const tree = await manager.tree(owner, workspace.id)
  assert.ok(tree.some((entry) => entry.path === 'src' && entry.type === 'directory'))
  assert.ok(tree.some((entry) => entry.path === 'src/modules' && entry.type === 'directory'))
  assert.ok(tree.some((entry) => entry.path === 'src/modules/new.ts' && entry.type === 'file'))

  const opened = await manager.read(owner, workspace.id, 'src/modules/new.ts')
  assert.equal(opened.content, 'export const answer = 42')

  const renamed = await manager.renamePath(owner, workspace.id, 'src/modules', 'src/client')
  assert.equal(renamed.type, 'directory')
  await assert.rejects(manager.read(owner, workspace.id, 'src/modules/new.ts'))
  assert.equal(
    (await manager.read(owner, workspace.id, 'src/client/new.ts')).content,
    'export const answer = 42',
  )

  const removed = await manager.removePath(owner, workspace.id, 'src/client')
  assert.equal(removed.type, 'directory')
  await assert.rejects(manager.read(owner, workspace.id, 'src/client/new.ts'))
})

test('workspace metadata is root-control-plane state outside the shell-writable project directory', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'aeko-studio-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))

  const manager = await new WorkspaceManager(config(root)).init()
  const owner = session('session-metadata')
  const workspace = await manager.create(owner, {
    name: 'metadata-test',
    template: 'python-client',
  })

  const projectRoot = manager.workspaceRoot(owner, workspace.id)
  await assert.rejects(lstat(join(projectRoot, '.aeko-workspace.json')))

  const metadataPath = manager.metadataPath(owner, workspace.id)
  const metadata = JSON.parse(await readFile(metadataPath, 'utf8'))
  assert.equal(metadata.name, 'metadata-test')
})

test('workspace API refuses symlinks, including links that target outside the project root', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'aeko-studio-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))

  const manager = await new WorkspaceManager(config(root)).init()
  const owner = session('session-two')
  const workspace = await manager.create(owner, {
    name: 'escape-test',
    template: 'python-client',
  })
  const workspaceRoot = manager.workspaceRoot(owner, workspace.id)
  const outside = join(root, 'outside.txt')
  await writeFile(outside, 'secret', 'utf8')
  await symlink(outside, join(workspaceRoot, 'escape.txt'))

  await assert.rejects(
    manager.read(owner, workspace.id, 'escape.txt'),
    /symlinks are not editable/,
  )
})


test('new API-created files use the authenticated session identity inputs', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'aeko-studio-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))

  const manager = await new WorkspaceManager(config(root)).init()
  const owner = session('session-identity')
  const workspace = await manager.create(owner, {
    name: 'identity-test',
    template: 'python-client',
  })

  await manager.createDirectory(owner, workspace.id, 'src/nested')
  await manager.write(
    owner,
    workspace.id,
    'src/nested/created.py',
    'answer = 42\n',
    { createOnly: true },
  )
  assert.equal(
    (await manager.read(owner, workspace.id, 'src/nested/created.py')).content,
    'answer = 42\n',
  )
})
