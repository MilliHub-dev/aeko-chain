import { CornerDownLeft, LoaderCircle, ShieldCheck, TerminalSquare } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import type { StudioConfig } from '../../shared/contracts/session.js'
import { executeShellCommand, shellSuggestions } from '../aeko/shell'
import { executeEditorTransfer, type TransferReviewPayload } from '../aeko/transfer'
import type { DevelopmentWallet } from '../aeko/wallet'
import TransferReview from '../components/TransferReview'

interface OutputLine { id: number; kind: 'command' | 'output' | 'error' | 'system'; text: string }

export default function AekoShell({
  config,
  wallet,
  onTransactionConfirmed,
}: {
  config: StudioConfig
  wallet: DevelopmentWallet | null
  onTransactionConfirmed?: () => void | Promise<void>
}) {
  const [input, setInput] = useState('')
  const [lines, setLines] = useState<OutputLine[]>([
    { id: 1, kind: 'system', text: 'AEKO Shell · structured chain console' },
    { id: 2, kind: 'system', text: 'Type help for commands. Use Bash / AEKO CLI for a real operating-system terminal.' },
  ])
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [busy, setBusy] = useState(false)
  const [pendingTransfer, setPendingTransfer] = useState<TransferReviewPayload | null>(null)
  const nextId = useRef(3)
  const viewportRef = useRef<HTMLDivElement>(null)
  const suggestions = useMemo(() => shellSuggestions(input), [input])

  const append = (kind: OutputLine['kind'], text: string) => {
    setLines((current) => [...current, { id: nextId.current++, kind, text }])
    window.setTimeout(() => {
      const node = viewportRef.current
      if (node) node.scrollTop = node.scrollHeight
    }, 0)
  }

  const execute = async () => {
    const command = input.trim()
    if (!command || busy || pendingTransfer) return
    setInput('')
    setHistory((current) => [...current, command])
    setHistoryIndex(-1)
    append('command', command)
    setBusy(true)
    try {
      const result = await executeShellCommand(command, {
        network: config.network,
        rpcUrl: config.rpcUrl,
        wallet,
        history: [...history, command],
      })
      if (result.kind === 'clear') {
        setLines([])
      } else if (result.kind === 'transaction_request') {
        setPendingTransfer(result.transaction)
      } else {
        for (const line of result.lines) append(result.kind === 'error' ? 'error' : 'output', line)
      }
    } catch (cause) {
      append('error', cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const confirmTransfer = async () => {
    if (!pendingTransfer || busy) return
    setBusy(true)
    try {
      const result = await executeEditorTransfer(pendingTransfer, {
        network: config.network,
        rpcUrl: config.rpcUrl,
        wallet,
        onProgress: (message) => append('system', message),
      })
      append('output', `Confirmed transaction: ${result.signature}`)
      setPendingTransfer(null)
      await onTransactionConfirmed?.()
    } catch (cause) {
      const error = cause as Error & { submittedSignature?: string }
      append('error', error.message || String(cause))
      if (error.submittedSignature) append('system', `Submission signature retained: ${error.submittedSignature}. Do not blindly resubmit.`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex size-full min-h-0 flex-col bg-[#08080c]" aria-label="AEKO Shell">
      <header className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3 text-xs">
        <TerminalSquare className="size-4 text-primary" />
        <strong>AEKO Shell</strong>
        <span className="text-muted-foreground">reviewed RPC + wallet actions</span>
        <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-muted-foreground">
          <ShieldCheck className="size-3" />No host-shell forwarding
        </span>
      </header>
      <div ref={viewportRef} className="min-h-0 flex-1 overflow-auto p-3 font-mono text-xs leading-5">
        {lines.map((line) => (
          <div key={line.id} className={line.kind === 'error' ? 'text-red-300' : line.kind === 'command' ? 'mt-2 text-primary' : line.kind === 'system' ? 'text-zinc-500' : 'text-zinc-300'}>
            {line.kind === 'command' ? `$ aeko ${line.text.replace(/^aeko\s+/i, '')}` : line.text || ' '}
          </div>
        ))}
        {pendingTransfer ? (
          <TransferReview
            transaction={pendingTransfer}
            busy={busy}
            onConfirm={() => void confirmTransfer()}
            onCancel={() => setPendingTransfer(null)}
          />
        ) : null}
      </div>
      <div className="relative shrink-0 border-t border-border bg-background/80 p-2">
        {suggestions.length && input.trim() ? (
          <div className="absolute bottom-full left-2 mb-1 w-80 overflow-hidden rounded-lg border border-border bg-popover shadow-2xl">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.name}
                type="button"
                className="block w-full px-3 py-2 text-left hover:bg-accent"
                onMouseDown={(event) => { event.preventDefault(); setInput(suggestion.name) }}
              >
                <span className="block font-mono text-xs text-foreground">{suggestion.usage}</span>
                <span className="block truncate text-[10px] text-muted-foreground">{suggestion.description}</span>
              </button>
            ))}
          </div>
        ) : null}
        <div className="flex items-center gap-2 rounded-md border border-border bg-black/30 px-2.5">
          <span className="font-mono text-xs text-primary">aeko@{config.network || 'network'} ›</span>
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            disabled={busy || Boolean(pendingTransfer)}
            aria-label="AEKO Shell command"
            className="h-9 min-w-0 flex-1 bg-transparent font-mono text-xs text-foreground outline-none placeholder:text-zinc-700"
            placeholder={wallet ? 'balance, slot, account…, transfer…' : 'help, health, slot, balance <address>…'}
            onKeyDown={(event) => {
              if (event.key === 'Enter') { event.preventDefault(); void execute(); return }
              if (event.key === 'ArrowUp') {
                event.preventDefault()
                if (!history.length) return
                const next = historyIndex < 0 ? history.length - 1 : Math.max(0, historyIndex - 1)
                setHistoryIndex(next)
                setInput(history[next] ?? '')
              }
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                if (historyIndex < 0) return
                const next = historyIndex + 1
                if (next >= history.length) { setHistoryIndex(-1); setInput('') }
                else { setHistoryIndex(next); setInput(history[next] ?? '') }
              }
              if (event.key === 'Tab' && suggestions[0]) {
                event.preventDefault()
                setInput(suggestions[0].name)
              }
            }}
          />
          {busy ? <LoaderCircle className="size-4 animate-spin text-primary motion-reduce:animate-none" /> : <CornerDownLeft className="size-4 text-zinc-600" />}
        </div>
      </div>
    </section>
  )
}
