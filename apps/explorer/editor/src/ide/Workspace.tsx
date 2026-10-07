import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Hammer, Play, Rocket, Square, TestTube2, WalletCards, X } from 'lucide-react'
import type { ProgramArtifactStatus } from '../../shared/contracts/artifact.js'
import type { StudioCommand } from '../../shared/contracts/command.js'
import type { FileEntry } from '../../shared/contracts/filesystem.js'
import type { StudioConfig } from '../../shared/contracts/session.js'
import type { Workspace as WorkspaceContract } from '../../shared/contracts/workspace.js'
import { errorMessage } from '../../shared/errors/editor-errors.js'
import ActivityBar, { type WorkbenchView } from '../components/ActivityBar'
import BottomPanel, { type BottomPanelTab } from '../components/BottomPanel'
import InteractSidebar from '../components/InteractSidebar'
import ProgramInteractPanel from '../components/ProgramInteractPanel'
import EditorTabs from '../components/EditorTabs'
import ExplorerPane from '../components/ExplorerPane'
import StatusBar from '../components/StatusBar'
import { Alert, AlertDescription } from '../components/ui/alert'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { getBalance } from '../aeko/rpc'
import { parseRustProgramInterface } from '../aeko/rust-interface'
import {
  generateDevelopmentWallet,
  importDevelopmentWallet,
  loadDevelopmentWallets,
  saveDevelopmentWallets,
  shortAddress,
  type DevelopmentWallet,
} from '../aeko/wallet'
import RuntimePanel from '../components/RuntimePanel'
import WalletPanel from '../components/WalletPanel'
import { api } from '../lib/api'
import { languageForPath } from '../lib/language'
import MonacoEditor from './MonacoEditor'
import PreviewPanel from './PreviewPanel'
import { ensureWorkspaceModel, hasWorkspaceModel } from './monaco'
import { useStudioTasks } from './useStudioTasks'

interface Props {
  workspace: WorkspaceContract
  config: StudioConfig
  onHome: () => void | Promise<void>
  onLogout: () => void | Promise<void>
}

function remap(path: string, from: string, to: string) {
  return path === from ? to : path.startsWith(`${from}/`) ? to + path.slice(from.length) : path
}

export default function Workspace({ workspace, config, onHome, onLogout }: Props) {
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [openFiles, setOpenFiles] = useState<string[]>([])
  const [activePath, setActivePath] = useState('')
  const [buffers, setBuffers] = useState<Map<string, string>>(() => new Map())
  const [dirtyPaths, setDirtyPaths] = useState<Set<string>>(() => new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [consoleCollapsed, setConsoleCollapsed] = useState(false)
  const [bottomTab, setBottomTab] = useState<BottomPanelTab>('TERMINAL')
  const [workbenchView, setWorkbenchView] = useState<WorkbenchView>('code')
  const [wallets, setWallets] = useState<DevelopmentWallet[]>(() => loadDevelopmentWallets())
  const [walletId, setWalletId] = useState('')
  const [walletBalance, setWalletBalance] = useState<number | null>(null)
  const [walletBalanceBusy, setWalletBalanceBusy] = useState(false)
  const [walletError, setWalletError] = useState('')
  const [previewPending, setPreviewPending] = useState(false)
  const [previewRevision, setPreviewRevision] = useState(0)
  const [selectedInteraction, setSelectedInteraction] = useState('raw')
  const [artifact, setArtifact] = useState<ProgramArtifactStatus | null>(null)
  const [runtimeOpen, setRuntimeOpen] = useState(false)
  const saveTimers = useRef<Map<string, number>>(new Map())
  const tasks = useStudioTasks(workspace.id)
  const selectedWallet = wallets.find((wallet) => wallet.id === walletId) ?? wallets[0] ?? null
  const rustInterface = useMemo(() => parseRustProgramInterface(
    entries
      .filter((entry) => entry.type === 'file' && entry.path.endsWith('.rs'))
      .map((entry) => ({ path: entry.path, content: buffers.get(entry.path) ?? '' }))
      .filter((source) => source.content !== ''),
  ), [buffers, entries])

  useEffect(() => {
    if (!walletId && wallets[0]) setWalletId(wallets[0].id)
    if (walletId && !wallets.some((wallet) => wallet.id === walletId)) setWalletId(wallets[0]?.id ?? '')
  }, [walletId, wallets])

  const replaceWallets = useCallback((next: DevelopmentWallet[]) => {
    setWallets(next)
    saveDevelopmentWallets(next)
  }, [])

  const refreshWalletBalance = useCallback(async () => {
    if (!selectedWallet || !config.rpcUrl) {
      setWalletBalance(null)
      return
    }
    setWalletBalanceBusy(true)
    setWalletError('')
    try {
      setWalletBalance(await getBalance(config.rpcUrl, selectedWallet.address))
    } catch (cause) {
      setWalletBalance(null)
      setWalletError(errorMessage(cause, 'Wallet balance could not be loaded.'))
    } finally {
      setWalletBalanceBusy(false)
    }
  }, [config.rpcUrl, selectedWallet])

  useEffect(() => {
    void refreshWalletBalance()
  }, [refreshWalletBalance])

  const createWallet = async (name: string) => {
    try {
      const wallet = await generateDevelopmentWallet(name)
      replaceWallets([...wallets, wallet])
      setWalletId(wallet.id)
      setWalletError('')
    } catch (cause) {
      setWalletError(errorMessage(cause, 'Development wallet could not be created.'))
      throw cause
    }
  }

  const importWallet = async (name: string, secretKeyB64: string) => {
    try {
      const wallet = await importDevelopmentWallet(name, secretKeyB64)
      replaceWallets([...wallets.filter((item) => item.id !== wallet.id), wallet])
      setWalletId(wallet.id)
      setWalletError('')
    } catch (cause) {
      setWalletError(errorMessage(cause, 'Development wallet could not be imported.'))
      throw cause
    }
  }

  const deleteWallet = (wallet: DevelopmentWallet) => {
    if (!window.confirm(`Delete ${wallet.name} from this browser? This cannot be undone.`)) return
    const next = wallets.filter((item) => item.id !== wallet.id)
    replaceWallets(next)
    if (walletId === wallet.id) setWalletId(next[0]?.id ?? '')
    setWalletBalance(null)
  }

  const refreshTree = useCallback(async () => {
    const next = await api.tree(workspace.id)
    setEntries(next.files)
  }, [workspace.id])

  const report = useCallback(
    (cause: unknown) => setError(errorMessage(cause, 'Workspace operation failed.')),
    [],
  )

  const refreshArtifact = useCallback(async () => {
    if (workspace.template !== 'rust-program') {
      setArtifact(null)
      return
    }
    setArtifact(await api.artifactStatus(workspace.id))
  }, [workspace.id, workspace.template])

  useEffect(() => {
    const timers = saveTimers.current
    void refreshTree().catch(report)
    return () => {
      for (const timer of timers.values()) window.clearTimeout(timer)
      timers.clear()
    }
  }, [refreshTree, report])

  const openFile = useCallback(async (path: string) => {
    try {
      let content = buffers.get(path)
      if (content === undefined) {
        const result = await api.readFile(workspace.id, path)
        content = result.content
        setBuffers((current) => new Map(current).set(path, result.content))
      }
      setOpenFiles((current) => current.includes(path) ? current : [...current, path])
      setActivePath(path)
      setError('')
    } catch (cause) {
      report(cause)
    }
  }, [buffers, report, workspace.id])

  useEffect(() => {
    const first = entries.find((entry) => entry.type === 'file')
    if (!activePath && first) void openFile(first.path)
  }, [activePath, entries, openFile])

  useEffect(() => {
    if (workbenchView !== 'interact' || workspace.template !== 'rust-program') return
    let cancelled = false
    const missing = entries.filter(
      (entry) => entry.type === 'file' && entry.path.endsWith('.rs') && !buffers.has(entry.path),
    )
    void Promise.all(missing.map(async (entry) => {
      const result = await api.readFile(workspace.id, entry.path)
      if (!cancelled) {
        setBuffers((current) => current.has(entry.path) ? current : new Map(current).set(entry.path, result.content))
      }
    })).catch((cause) => {
      if (!cancelled) report(cause)
    })
    return () => { cancelled = true }
  }, [buffers, entries, report, workbenchView, workspace.id, workspace.template])

  useEffect(() => {
    let cancelled = false
    const source = entries.filter(
      (entry) => entry.type === 'file' && /\.(?:ts|tsx|js|jsx|json|css|html)$/.test(entry.path),
    )
    void Promise.all(source.map(async (entry) => {
      if (hasWorkspaceModel(workspace.id, entry.path)) return
      try {
        const result = await api.readFile(workspace.id, entry.path)
        if (!cancelled) {
          ensureWorkspaceModel(workspace.id, entry.path, result.content, languageForPath(entry.path))
        }
      } catch (cause) {
        if (!cancelled) report(cause)
      }
    }))
    return () => { cancelled = true }
  }, [entries, report, workspace.id])

  const saveFile = useCallback(async (path: string, content: string) => {
    if (!path) return
    setSaving(true)
    try {
      await api.writeFile(workspace.id, path, content)
      setDirtyPaths((current) => {
        const next = new Set(current)
        next.delete(path)
        return next
      })
      setError('')
    } catch (cause) {
      report(cause)
      throw cause
    } finally {
      setSaving(false)
    }
  }, [report, workspace.id])

  const flushDirty = useCallback(async () => {
    for (const path of dirtyPaths) {
      const timer = saveTimers.current.get(path)
      if (timer !== undefined) {
        clearTimeout(timer)
        saveTimers.current.delete(path)
      }
      await saveFile(path, buffers.get(path) ?? '')
    }
  }, [buffers, dirtyPaths, saveFile])

  const changeFile = (content: string) => {
    if (!activePath) return
    setArtifact(null)
    setBuffers((current) => new Map(current).set(activePath, content))
    setDirtyPaths((current) => new Set(current).add(activePath))
    const existing = saveTimers.current.get(activePath)
    if (existing !== undefined) clearTimeout(existing)
    saveTimers.current.set(activePath, window.setTimeout(() => {
      saveTimers.current.delete(activePath)
      void saveFile(activePath, content).catch(() => undefined)
    }, 900))
  }

  const closeFile = async (path: string) => {
    try {
      if (dirtyPaths.has(path)) await saveFile(path, buffers.get(path) ?? '')
      setOpenFiles((current) => {
        const next = current.filter((item) => item !== path)
        if (path === activePath) setActivePath(next.at(-1) || '')
        return next
      })
    } catch (cause) {
      report(cause)
    }
  }

  const newFile = async () => {
    const path = prompt('Relative file path', workspace.defaultNewFile || 'src/new_file.rs')
    if (!path) return
    try {
      await api.createFile(workspace.id, path, '')
      setArtifact(null)
      await refreshTree()
      await openFile(path)
    } catch (cause) {
      report(cause)
    }
  }

  const newDirectory = async () => {
    const path = prompt('Relative folder path', 'src/module')
    if (!path) return
    try {
      await api.createDirectory(workspace.id, path)
      await refreshTree()
    } catch (cause) {
      report(cause)
    }
  }

  const renameEntry = async (entry: FileEntry) => {
    const to = prompt('Rename path', entry.path)
    if (!to || to === entry.path) return
    try {
      const result = await api.renamePath(workspace.id, entry.path, to)
      setBuffers((current) => {
        const next = new Map<string, string>()
        for (const [path, value] of current) next.set(remap(path, result.from, result.to), value)
        return next
      })
      setOpenFiles((current) => current.map((path) => remap(path, result.from, result.to)))
      setDirtyPaths((current) => new Set([...current].map((path) => remap(path, result.from, result.to))))
      setActivePath((path) => remap(path, result.from, result.to))
      setArtifact(null)
      await refreshTree()
    } catch (cause) {
      report(cause)
    }
  }

  const deleteEntry = async (entry: FileEntry) => {
    if (!confirm(`Delete ${entry.path}? This cannot be undone.`)) return
    try {
      await api.deletePath(workspace.id, entry.path)
      const affected = (path: string) => path === entry.path || path.startsWith(`${entry.path}/`)
      setOpenFiles((current) => current.filter((path) => !affected(path)))
      setBuffers((current) => {
        const next = new Map(current)
        for (const path of next.keys()) if (affected(path)) next.delete(path)
        return next
      })
      setDirtyPaths((current) => new Set([...current].filter((path) => !affected(path))))
      if (affected(activePath)) setActivePath('')
      setArtifact(null)
      await refreshTree()
    } catch (cause) {
      report(cause)
    }
  }

  const activeFile = activePath
    ? { path: activePath, content: buffers.get(activePath) ?? '' }
    : null

  const leave = async (target: () => void | Promise<void>) => {
    try {
      await flushDirty()
      await target()
    } catch (cause) {
      report(cause)
    }
  }

  const runTask = async (command: StudioCommand) => {
    if (tasks.running || !tasks.connected || !tasks.available.includes(command)) return
    try {
      await flushDirty()
      setBottomTab('TASKS')
      setConsoleCollapsed(false)
      tasks.run(command)
    } catch (cause) {
      report(cause)
    }
  }

  const taskDisabled = (command: StudioCommand) => (
    tasks.running !== null || !tasks.connected || !tasks.available.includes(command)
  )

  const buildPreview = async () => {
    if (
      workspace.template !== 'typescript-dapp'
      || tasks.running
      || !tasks.connected
      || !tasks.available.includes('build')
    ) return
    try {
      await flushDirty()
      setWorkbenchView('interact')
      setPreviewPending(true)
      tasks.run('build')
    } catch (cause) {
      setPreviewPending(false)
      report(cause)
    }
  }

  useEffect(() => {
    const state = tasks.lastState
    if (!previewPending || !state || state.command !== 'build' || state.status === 'running') return
    setPreviewPending(false)
    if (state.status === 'succeeded') {
      setPreviewRevision((value) => value + 1)
      setWorkbenchView('interact')
      return
    }
    setError(`DApp preview build ${state.status}. Open Build & Run for the command output.`)
  }, [previewPending, tasks.lastState])

  useEffect(() => {
    if (!previewPending || !tasks.error) return
    setPreviewPending(false)
    setError(tasks.error)
  }, [previewPending, tasks.error])

  useEffect(() => {
    const state = tasks.lastState
    if (!state || state.status === 'running' || workspace.template !== 'rust-program') return
    if (state.command === 'clean' || (state.command === 'build' && state.status !== 'succeeded')) {
      setArtifact(null)
      return
    }
    if (state.command === 'build' && state.status === 'succeeded') {
      void refreshArtifact().catch(report)
    }
  }, [refreshArtifact, report, tasks.lastState, workspace.template])

  return (
    <div className="flex size-full flex-col bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-8 place-items-center rounded-lg bg-primary font-black text-primary-foreground">A</div>
          <div className="min-w-0">
            <strong className="block text-sm">AEKO Studio</strong>
            <span className="block max-w-48 truncate text-xs text-muted-foreground sm:max-w-72">{workspace.name}</span>
          </div>
        </div>

        <div className="ml-auto hidden items-center gap-1.5 md:flex" aria-label="Project tasks">
          <Button
            variant="secondary"
            size="sm"
            disabled={taskDisabled('build')}
            onClick={() => void runTask('build')}
          >
            <Hammer />
            Build
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={taskDisabled('test')}
            onClick={() => void runTask('test')}
          >
            <TestTube2 />
            Test
          </Button>
          {tasks.available.includes('run') ? (
            <Button
              variant="secondary"
              size="sm"
              disabled={taskDisabled('run')}
              onClick={() => void runTask('run')}
            >
              <Play />
              Run
            </Button>
          ) : null}
          {tasks.running ? (
            <Button variant="destructive" size="sm" onClick={tasks.cancel}>
              <Square />
              Stop
            </Button>
          ) : null}
          <Button variant="outline" size="sm" disabled title="Wallet-backed deployment wiring is not enabled yet">
            <Rocket />
            Deploy
          </Button>
        </div>

        {selectedWallet ? (
          <Button
            variant="ghost"
            size="sm"
            className="hidden max-w-56 gap-2 lg:inline-flex"
            onClick={() => setWorkbenchView('accounts')}
            title={selectedWallet.address}
          >
            <WalletCards />
            <span className="truncate">{shortAddress(selectedWallet.address)}</span>
            <span className="text-muted-foreground">{walletBalance === null ? '—' : `${(walletBalance / 1_000_000_000).toLocaleString('en-US', { maximumFractionDigits: 4 })} AEKO`}</span>
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          aria-label="Open runtime panel"
          onClick={() => setRuntimeOpen(true)}
        >
          <WalletCards />
        </Button>
        <Badge className="shrink-0">
          <span className="mr-1 size-2 rounded-full bg-primary" />
          {config.network}
        </Badge>
      </header>

      <div className="flex min-h-0 flex-1">
        <ActivityBar
          active={workbenchView}
          onSelect={setWorkbenchView}
          onHome={() => void leave(onHome)}
          onLogout={() => void leave(onLogout)}
        />

        <div className="hidden w-64 shrink-0 border-r border-border bg-background lg:block">
          {workbenchView === 'code' ? (
            <ExplorerPane
              workspace={workspace}
              entries={entries}
              activePath={activePath}
              onOpen={openFile}
              onNewFile={newFile}
              onNewDirectory={newDirectory}
              onRename={renameEntry}
              onDelete={deleteEntry}
              onRefresh={() => void refreshTree().catch(report)}
            />
          ) : workbenchView === 'interact' ? (
            <InteractSidebar
              template={workspace.template}
              programInterface={rustInterface}
              selectedOperationId={selectedInteraction}
              onSelectOperation={setSelectedInteraction}
              onBuildPreview={buildPreview}
              previewBusy={previewPending}
            />
          ) : workbenchView === 'accounts' ? (
            <div className="size-full">
              <WalletPanel
                config={config}
                wallets={wallets}
                selectedId={selectedWallet?.id ?? ''}
                balance={walletBalance}
                balanceBusy={walletBalanceBusy}
                error={walletError}
                onSelect={setWalletId}
                onCreate={createWallet}
                onImport={importWallet}
                onDelete={deleteWallet}
                onRefreshBalance={refreshWalletBalance}
              />
            </div>
          ) : (
            <section className="flex h-full flex-col p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{workbenchView}</p>
              <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                {workbenchView === 'contracts' ? (
                  <>
                    {entries.filter((entry) => entry.type === 'file' && entry.path.endsWith('.rs')).map((entry) => (
                      <Button
                        key={entry.path}
                        variant="ghost"
                        className="h-auto w-full justify-start px-2 py-2 text-left text-xs"
                        onClick={() => void openFile(entry.path)}
                      >
                        {entry.path}
                      </Button>
                    ))}
                    {!entries.some((entry) => entry.type === 'file' && entry.path.endsWith('.rs')) ? (
                      <p>No Rust contracts in this project.</p>
                    ) : null}
                  </>
                ) : null}
                {workbenchView === 'deployments' ? (
                  <>
                    <p>Build artifacts and deployed program context.</p>
                    {entries.filter((entry) => entry.type === 'file' && (entry.path.startsWith('out/') || entry.path.endsWith('.so'))).map((entry) => (
                      <button
                        key={entry.path}
                        className="block w-full truncate rounded-md px-2 py-1.5 text-left hover:bg-accent"
                        onClick={() => void openFile(entry.path)}
                      >
                        {entry.path}
                      </button>
                    ))}
                    <p className="rounded-md border border-border p-2">
                      Signing remains wallet-gated; use the AEKO CLI terminal for explicit deployment operations.
                    </p>
                  </>
                ) : null}
                {workbenchView === 'transactions' ? (
                  <>
                    <p>Transactions target the configured {config.network} network.</p>
                    {config.explorerUrl ? (
                      <a
                        className="text-primary underline underline-offset-4"
                        href={config.explorerUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open AEKO Explorer
                      </a>
                    ) : <p>No Explorer URL configured.</p>}
                  </>
                ) : null}
              </div>
            </section>
          )}
        </div>

        <main className="flex min-w-0 flex-1 flex-col bg-card/20">
          <div className="flex min-h-0 flex-1 flex-col">
            {workbenchView === 'interact' && workspace.template === 'typescript-dapp' ? (
              <PreviewPanel
                workspaceId={workspace.id}
                revision={previewRevision}
                buildBusy={previewPending}
                onRebuild={buildPreview}
              />
            ) : workbenchView === 'interact' && workspace.template === 'rust-program' ? (
              <ProgramInteractPanel
                key={selectedInteraction + ':' + (selectedWallet?.address ?? 'no-wallet')}
                workspaceId={workspace.id}
                config={config}
                wallet={selectedWallet}
                programInterface={rustInterface}
                selectedOperationId={selectedInteraction}
                onTransactionConfirmed={refreshWalletBalance}
              />
            ) : (
              <>
                <EditorTabs
                  paths={openFiles}
                  activePath={activePath}
                  dirtyPaths={dirtyPaths}
                  onOpen={setActivePath}
                  onClose={closeFile}
                />
                <div className="relative min-h-0 flex-1">
                  <MonacoEditor
                    key={`${workspace.id}:${activePath}`}
                    workspaceId={workspace.id}
                    file={activeFile}
                    onChange={changeFile}
                    onSave={(content) => saveFile(activePath, content)}
                  />
                </div>
              </>
            )}
          </div>
          {workbenchView !== 'interact' ? (
            <div className={consoleCollapsed ? 'h-10 shrink-0' : 'h-60 shrink-0'}>
              <BottomPanel
                workspaceId={workspace.id}
                config={config}
                wallet={selectedWallet}
                tasks={tasks}
                tab={bottomTab}
                onTabChange={setBottomTab}
                onRunTask={runTask}
                onTransactionConfirmed={refreshWalletBalance}
                collapsed={consoleCollapsed}
                onToggleCollapsed={() => setConsoleCollapsed((value) => !value)}
              />
            </div>
          ) : null}
        </main>

        <div className="hidden w-[280px] min-h-0 shrink-0 border-l border-white/10 lg:block">
          <RuntimePanel
            config={config}
            runnerReady={tasks.connected}
            wallet={selectedWallet}
            wallets={wallets}
            walletId={selectedWallet?.id ?? ''}
            onSelectWallet={setWalletId}
            onCreateWallet={() => createWallet(`Editor wallet ${wallets.length + 1}`)}
            balance={walletBalance}
            balanceBusy={walletBalanceBusy}
            onRefreshBalance={refreshWalletBalance}
            artifact={artifact}
            artifactSupported={workspace.template === 'rust-program'}
            deployment={null}
            recoverableBuffer={null}
          />
        </div>
      </div>

      {runtimeOpen ? (
        <div
          className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm lg:hidden"
          role="presentation"
          onMouseDown={() => setRuntimeOpen(false)}
        >
          <div
            className="absolute inset-y-0 right-0 flex w-[min(92vw,360px)] flex-col border-l border-white/10 bg-[#0b0b10] pt-14 shadow-2xl shadow-black"
            role="dialog"
            aria-modal="true"
            aria-label="Runtime"
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setRuntimeOpen(false)
            }}
          >
            <button
              type="button"
              autoFocus
              onClick={() => setRuntimeOpen(false)}
              aria-label="Close runtime panel"
              className="absolute right-3 top-2 z-10 rounded-lg p-2 text-gray-500 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aeko-accent"
            >
              <X className="size-4" />
            </button>
            <RuntimePanel
              config={config}
              runnerReady={tasks.connected}
              wallet={selectedWallet}
              wallets={wallets}
              walletId={selectedWallet?.id ?? ''}
              onSelectWallet={setWalletId}
              onCreateWallet={() => createWallet(`Editor wallet ${wallets.length + 1}`)}
              balance={walletBalance}
              balanceBusy={walletBalanceBusy}
              onRefreshBalance={refreshWalletBalance}
              artifact={artifact}
              artifactSupported={workspace.template === 'rust-program'}
              deployment={null}
              recoverableBuffer={null}
              controlId="editor-wallet-mobile"
            />
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="fixed bottom-10 left-20 right-4 z-40 md:right-auto md:w-[28rem]">
          <Alert className="border-destructive">
            <div className="flex items-start gap-3">
              <AlertDescription className="flex-1 text-destructive">{error}</AlertDescription>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label="Dismiss error"
                onClick={() => setError('')}
              >
                <X />
              </Button>
            </div>
          </Alert>
        </div>
      ) : null}

      <StatusBar config={config} workspace={workspace} activeFile={activeFile} saving={saving} />
    </div>
  )
}
