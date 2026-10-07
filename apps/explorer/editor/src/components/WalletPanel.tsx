import { Check, Clipboard, KeyRound, Plus, RefreshCw, Trash2, WalletCards } from 'lucide-react'
import { useState } from 'react'
import type { StudioConfig } from '../../shared/contracts/session.js'
import { formatAeko } from '../aeko/rpc'
import type { DevelopmentWallet } from '../aeko/wallet'
import { shortAddress } from '../aeko/wallet'
import { Alert, AlertDescription, AlertTitle } from './ui/alert'
import { Badge } from './ui/badge'
import { Button } from './ui/button'

export default function WalletPanel({
  config,
  wallets,
  selectedId,
  balance,
  balanceBusy,
  error,
  onSelect,
  onCreate,
  onImport,
  onDelete,
  onRefreshBalance,
}: {
  config: StudioConfig
  wallets: DevelopmentWallet[]
  selectedId: string
  balance: number | null
  balanceBusy: boolean
  error?: string
  onSelect: (id: string) => void
  onCreate: (name: string) => void | Promise<void>
  onImport: (name: string, secretKeyB64: string) => void | Promise<void>
  onDelete: (wallet: DevelopmentWallet) => void
  onRefreshBalance: () => void | Promise<void>
}) {
  const [name, setName] = useState('')
  const [importKey, setImportKey] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [copied, setCopied] = useState('')
  const [actionBusy, setActionBusy] = useState(false)
  const [copyError, setCopyError] = useState('')
  const selected = wallets.find((wallet) => wallet.id === selectedId) ?? null

  const copy = async (address: string) => {
    setCopyError('')
    try {
      await navigator.clipboard.writeText(address)
      setCopied(address)
      window.setTimeout(() => setCopied(''), 1200)
    } catch {
      setCopyError('Clipboard access is unavailable in this browser context.')
    }
  }

  return (
    <section className="flex h-full min-h-0 flex-col" aria-label="Development wallets">
      <div className="border-b border-border p-3">
        <div className="flex items-center gap-2">
          <WalletCards className="size-4 text-primary" />
          <strong className="text-xs">Development wallets</strong>
          <Badge className="ml-auto">{config.network}</Badge>
        </div>
        <Alert className="mt-3 border-amber-400/20 bg-amber-400/[0.03]">
          <KeyRound className="mb-2 size-4 text-amber-300" />
          <AlertTitle>Browser-local keys</AlertTitle>
          <AlertDescription>Development keys are stored unencrypted in this browser. Use dedicated test/development funds only.</AlertDescription>
        </Alert>
        {error ? <p className="mt-2 text-xs text-red-300">{error}</p> : null}
        {copyError ? <p className="mt-2 text-xs text-red-300">{copyError}</p> : null}
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        <div className="space-y-2">
          {wallets.map((wallet) => (
            <button
              key={wallet.id}
              type="button"
              onClick={() => onSelect(wallet.id)}
              className={`w-full rounded-lg border p-3 text-left transition-colors ${wallet.id === selectedId ? 'border-primary/40 bg-primary/[0.07]' : 'border-border bg-card/40 hover:bg-accent'}`}
            >
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">{wallet.name}</span>
                {wallet.id === selectedId ? <Check className="size-4 text-primary" /> : null}
              </div>
              <code className="mt-1 block text-[10px] text-muted-foreground">{shortAddress(wallet.address)}</code>
            </button>
          ))}
          {!wallets.length ? <p className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">No development wallet yet. Create one to review and sign chain transactions from the structured AEKO shell.</p> : null}
        </div>

        {selected ? (
          <div className="mt-4 rounded-lg border border-border bg-card/30 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Selected wallet</span>
              <Button variant="ghost" size="icon" className="size-7" aria-label="Refresh wallet balance" onClick={() => void onRefreshBalance()} disabled={balanceBusy}>
                <RefreshCw className={balanceBusy ? 'animate-spin motion-reduce:animate-none' : ''} />
              </Button>
            </div>
            <p className="mt-2 text-lg font-semibold">{balance === null ? 'Balance unavailable' : formatAeko(balance)}</p>
            <div className="mt-2 flex items-start gap-2 rounded-md bg-black/20 p-2">
              <code className="min-w-0 flex-1 break-all text-[10px] leading-4 text-muted-foreground">{selected.address}</code>
              <Button variant="ghost" size="icon" className="size-7" aria-label="Copy wallet address" onClick={() => void copy(selected.address)}>
                {copied === selected.address ? <Check /> : <Clipboard />}
              </Button>
            </div>
            <Button variant="destructive" size="sm" className="mt-3 w-full" onClick={() => onDelete(selected)}><Trash2 />Delete local wallet</Button>
          </div>
        ) : null}

        <div className="mt-4 rounded-lg border border-border p-3">
          <label htmlFor="wallet-name" className="text-xs font-medium">Create wallet</label>
          <input id="wallet-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Wallet name (optional)" className="mt-2 h-9 w-full rounded-md border border-input bg-black/20 px-3 text-xs outline-none focus:ring-2 focus:ring-ring" />
          <Button
            size="sm"
            className="mt-2 w-full"
            disabled={actionBusy}
            onClick={() => {
              void (async () => {
                setActionBusy(true)
                try {
                  await onCreate(name)
                  setName('')
                } catch {
                  // Parent owns the user-facing error state.
                } finally {
                  setActionBusy(false)
                }
              })()
            }}
          ><Plus />{actionBusy ? 'Creating…' : 'Create development wallet'}</Button>
          <button type="button" className="mt-3 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground" onClick={() => setShowImport((value) => !value)}>
            {showImport ? 'Hide import' : 'Import base64 secret key'}
          </button>
          {showImport ? (
            <div className="mt-2 space-y-2">
              <textarea autoComplete="off" autoCapitalize="off" spellCheck={false} value={importKey} onChange={(event) => setImportKey(event.target.value)} aria-label="Base64 Ed25519 secret key" placeholder="64-byte secret key encoded as base64" className="min-h-24 w-full resize-y rounded-md border border-input bg-black/20 p-2 font-mono text-[10px] outline-none focus:ring-2 focus:ring-ring" />
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                disabled={!importKey.trim() || actionBusy}
                onClick={() => {
                  void (async () => {
                    setActionBusy(true)
                    try {
                      await onImport(name, importKey)
                      setImportKey('')
                      setName('')
                      setShowImport(false)
                    } catch {
                      // Parent owns the user-facing error state.
                    } finally {
                      setActionBusy(false)
                    }
                  })()
                }}
              >{actionBusy ? 'Importing…' : 'Import wallet'}</Button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}
