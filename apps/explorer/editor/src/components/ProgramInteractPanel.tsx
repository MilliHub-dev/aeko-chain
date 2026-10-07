import { Activity, Database, ExternalLink, Loader2, RadioTower, Send, ShieldCheck, TriangleAlert } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { StudioConfig } from '../../shared/contracts/session.js'
import {
  encodeRawInstruction,
  encodeRustOperation,
  parseRawAccountMetas,
  type RustProgramInterface,
  type RustInteractionOperation,
} from '../aeko/rust-interface'
import {
  confirmSignature,
  formatAeko,
  getAccountInfo,
  getFeeForMessage,
  getLatestBlockhash,
  getProgramAccounts,
  sendTransaction,
} from '../aeko/rpc'
import {
  buildLegacyMessageBase64,
  buildSignedLegacyTransaction,
  decodeBase58,
  type TransactionInstruction,
} from '../aeko/transaction'
import { shortAddress, type DevelopmentWallet } from '../aeko/wallet'
import { AekoWsClient, confirmSignatureViaWs, type AekoWsStatus } from '../aeko/ws'
import { Alert, AlertDescription, AlertTitle } from './ui/alert'
import { Badge } from './ui/badge'
import { Button } from './ui/button'

interface Props {
  workspaceId: string
  config: StudioConfig
  wallet: DevelopmentWallet | null
  programInterface: RustProgramInterface | null
  selectedOperationId: string
  onTransactionConfirmed: () => void | Promise<void>
}

interface PreparedReview {
  operationLabel: string
  instruction: TransactionInstruction
  feeLamports: number
  instructionBytes: number
}

function storageKey(workspaceId: string, network: string): string {
  return 'aeko:studio:program-id:' + network + ':' + workspaceId
}

function readProgramId(workspaceId: string, network: string): string {
  try {
    return window.localStorage.getItem(storageKey(workspaceId, network)) ?? ''
  } catch {
    return ''
  }
}

function validPubkey(value: string): boolean {
  try {
    return decodeBase58(value).length === 32
  } catch {
    return false
  }
}

function accountValueKey(name: string, index: number): string {
  return name + ':' + String(index)
}

function prettyName(value: string): string {
  return value
    .replace(/_pubkey$/i, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function json(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export default function ProgramInteractPanel({
  workspaceId,
  config,
  wallet,
  programInterface,
  selectedOperationId,
  onTransactionConfirmed,
}: Props) {
  const operation = useMemo<RustInteractionOperation | null>(
    () => programInterface?.operations.find((item) => item.id === selectedOperationId) ?? null,
    [programInterface, selectedOperationId],
  )
  const [programId, setProgramIdState] = useState(() => readProgramId(workspaceId, config.network))
  const [fieldValues, setFieldValues] = useState<Record<string, string | boolean>>({})
  const [accountValues, setAccountValues] = useState<Record<string, string>>({})
  const [rawEncoding, setRawEncoding] = useState<'utf8' | 'hex'>('utf8')
  const [rawData, setRawData] = useState('')
  const [rawAccounts, setRawAccounts] = useState('')
  const [inspectAddress, setInspectAddress] = useState('')
  const [accountOutput, setAccountOutput] = useState('')
  const [review, setReview] = useState<PreparedReview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [signature, setSignature] = useState('')
  const [wsStatus, setWsStatus] = useState<AekoWsStatus>('idle')
  const [activity, setActivity] = useState<string[]>([])

  const setProgramId = (value: string) => {
    setProgramIdState(value)
    setReview(null)
    setSignature('')
    setWsStatus('idle')
    try {
      const key = storageKey(workspaceId, config.network)
      if (value.trim()) window.localStorage.setItem(key, value.trim())
      else window.localStorage.removeItem(key)
    } catch {
      // Storage availability must not block direct RPC interaction.
    }
  }

  const appendActivity = useCallback((message: string) => {
    setActivity((current) => [message, ...current].slice(0, 40))
  }, [])

  useEffect(() => {
    if (!config.websocketUrl || !validPubkey(programId)) return
    const client = new AekoWsClient(config.websocketUrl, setWsStatus)
    const stopLogs = client.subscribeLogs(programId, (value) => {
      appendActivity('Program log · ' + json(value))
    })
    const stopProgram = client.subscribeProgram(programId, (value) => {
      appendActivity('Program account update · ' + json(value))
    })
    return () => {
      stopLogs()
      stopProgram()
      client.close()
    }
  }, [appendActivity, config.websocketUrl, programId])

  const resolveInstruction = (): { instruction: TransactionInstruction; label: string } => {
    if (!wallet) throw new Error('Select or create a development wallet before reviewing a transaction.')
    if (!validPubkey(programId)) throw new Error('Enter a valid deployed AEKO program ID.')

    if (selectedOperationId === 'raw' || !operation) {
      const raw = parseRawAccountMetas(rawAccounts)
      for (const account of raw) {
        if (account.isSigner && account.address !== wallet.address) {
          throw new Error('Raw instructions currently support only the selected browser wallet as signer.')
        }
      }
      return {
        label: 'Raw instruction',
        instruction: {
          programId,
          keys: raw,
          data: encodeRawInstruction(rawData, rawEncoding),
        },
      }
    }

    if (!operation.supported) {
      throw new Error(operation.unsupportedReason || 'This instruction needs manual raw encoding.')
    }
    const keys = operation.accounts.map((account, index) => {
      const key = accountValueKey(account.name, index)
      const configured = account.defaultAddress || accountValues[key]?.trim() || (account.isSigner ? wallet.address : '')
      if (!configured || !validPubkey(configured)) {
        throw new Error(prettyName(account.name) + ' must be a valid AEKO public key.')
      }
      if (account.isSigner && configured !== wallet.address) {
        throw new Error(prettyName(account.name) + ' is a signer. The current browser transaction builder supports only the selected wallet signer.')
      }
      return { address: configured, isSigner: account.isSigner, isWritable: account.isWritable }
    })

    return {
      label: operation.functionName ?? operation.variant,
      instruction: {
        programId,
        keys,
        data: encodeRustOperation(operation, fieldValues),
      },
    }
  }

  const prepare = async () => {
    if (config.network.trim().toLowerCase() === 'mainnet') {
      setError('Browser program invocation is read-only on AEKO Mainnet. Use Testnet for Studio-signed instructions.')
      return
    }
    setBusy(true)
    setError('')
    setSignature('')
    try {
      const { instruction, label } = resolveInstruction()
      if (!wallet) throw new Error('Select a development wallet first.')
      const recentBlockhash = await getLatestBlockhash(config.rpcUrl)
      if (!recentBlockhash) throw new Error('AEKO RPC did not return a recent blockhash.')
      const message = buildLegacyMessageBase64({
        feePayerAddress: wallet.address,
        recentBlockhash,
        instructions: [instruction],
      })
      const feeLamports = await getFeeForMessage(config.rpcUrl, message)
      setReview({
        operationLabel: label,
        instruction,
        feeLamports,
        instructionBytes: instruction.data.length,
      })
    } catch (cause) {
      setReview(null)
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const submit = async () => {
    if (!review || !wallet) return
    setBusy(true)
    setError('')
    try {
      const recentBlockhash = await getLatestBlockhash(config.rpcUrl)
      if (!recentBlockhash) throw new Error('AEKO RPC did not return a recent blockhash.')
      const message = buildLegacyMessageBase64({
        feePayerAddress: wallet.address,
        recentBlockhash,
        instructions: [review.instruction],
      })
      const currentFee = await getFeeForMessage(config.rpcUrl, message)
      if (currentFee > review.feeLamports) {
        setReview({ ...review, feeLamports: currentFee })
        throw new Error('Network fee increased after review. Review the updated fee before signing.')
      }

      const transaction = await buildSignedLegacyTransaction({
        feePayer: wallet,
        recentBlockhash,
        instructions: [review.instruction],
      })
      const submitted = await sendTransaction(config.rpcUrl, transaction)
      setSignature(submitted)
      appendActivity('Submitted ' + submitted)

      let confirmedBy = 'RPC'
      if (config.websocketUrl) {
        try {
          await confirmSignatureViaWs(config.websocketUrl, submitted)
          confirmedBy = 'WebSocket'
        } catch {
          await confirmSignature(config.rpcUrl, submitted)
        }
      } else {
        await confirmSignature(config.rpcUrl, submitted)
      }
      appendActivity('Confirmed via ' + confirmedBy + ' · ' + submitted)
      setReview(null)
      await onTransactionConfirmed()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const inspect = async () => {
    const address = inspectAddress.trim()
    if (!validPubkey(address)) {
      setError('Enter a valid AEKO account address to inspect.')
      return
    }
    setBusy(true)
    setError('')
    try {
      setAccountOutput(json(await getAccountInfo(config.rpcUrl, address)))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const listProgramAccounts = async () => {
    if (!validPubkey(programId)) {
      setError('Enter a valid deployed AEKO program ID.')
      return
    }
    setBusy(true)
    setError('')
    try {
      setAccountOutput(json(await getProgramAccounts(config.rpcUrl, programId)))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const accountsView = selectedOperationId === 'accounts'
  const rawView = selectedOperationId === 'raw' || (!operation && !accountsView)

  return (
    <section className="flex size-full min-h-0 flex-col bg-[#090b0b]" data-aeko-program-interact>
      <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-2 border-b border-border bg-background px-4 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <RadioTower className="size-4 text-primary" />
            <strong className="text-sm">Program Interact</strong>
            <Badge>Direct RPC / WS</Badge>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Generated from Rust source. No Explorer backend is used for reads, subscriptions, or transactions.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="size-2 rounded-full bg-primary" />
          {config.network}
          <span className="hidden sm:inline">WS {wsStatus}</span>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-4 md:p-6">
        <div className="mx-auto grid w-full max-w-5xl gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-5">
            <section className="rounded-xl border border-border bg-card/35 p-4">
              <label htmlFor="aeko-program-id" className="text-xs font-semibold">Deployed program ID</label>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                  id="aeko-program-id"
                  value={programId}
                  onChange={(event) => setProgramId(event.target.value)}
                  placeholder="AEKO program public key"
                  spellCheck={false}
                  className="min-h-11 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 font-mono text-xs outline-none focus:border-primary"
                />
                <Button variant="secondary" onClick={() => void listProgramAccounts()} disabled={busy || !validPubkey(programId)}>
                  <Database />
                  Program accounts
                </Button>
              </div>
              <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
                This value is stored only in this browser for this workspace and network. A future Studio deployment can populate the same program context automatically.
              </p>
            </section>

            {accountsView ? (
              <section className="rounded-xl border border-border bg-card/35 p-4">
                <div className="flex items-center gap-2">
                  <Database className="size-4 text-primary" />
                  <h2 className="text-sm font-semibold">Program accounts</h2>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Query program-owned accounts or inspect one account directly through AEKO JSON-RPC.</p>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <input
                    value={inspectAddress}
                    onChange={(event) => setInspectAddress(event.target.value)}
                    placeholder="Account public key"
                    spellCheck={false}
                    className="min-h-11 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 font-mono text-xs outline-none focus:border-primary"
                  />
                  <Button variant="secondary" onClick={() => void inspect()} disabled={busy}>Inspect account</Button>
                </div>
                <Button className="mt-2" variant="outline" onClick={() => void listProgramAccounts()} disabled={busy || !validPubkey(programId)}>
                  Query all program accounts
                </Button>
                {accountOutput ? (
                  <pre className="mt-4 max-h-[28rem] overflow-auto rounded-lg border border-border bg-black/30 p-3 text-[11px] leading-5 text-muted-foreground">{accountOutput}</pre>
                ) : null}
              </section>
            ) : rawView ? (
              <section className="rounded-xl border border-border bg-card/35 p-4">
                <div className="flex items-center gap-2">
                  <TerminalSquareIcon />
                  <h2 className="text-sm font-semibold">Raw instruction</h2>
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Use this fallback for minimal Rust programs or instruction schemas the source parser cannot encode yet.
                </p>
                <label className="mt-4 block text-xs font-medium" htmlFor="raw-encoding">Instruction encoding</label>
                <select
                  id="raw-encoding"
                  value={rawEncoding}
                  onChange={(event) => setRawEncoding(event.target.value === 'hex' ? 'hex' : 'utf8')}
                  className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"
                >
                  <option value="utf8">UTF-8 text</option>
                  <option value="hex">Hex bytes</option>
                </select>
                <label className="mt-4 block text-xs font-medium" htmlFor="raw-data">Instruction data</label>
                <textarea
                  id="raw-data"
                  value={rawData}
                  onChange={(event) => setRawData(event.target.value)}
                  rows={4}
                  className="mt-1 w-full rounded-lg border border-border bg-background p-3 font-mono text-xs outline-none focus:border-primary"
                  placeholder={rawEncoding === 'hex' ? '01000000ff…' : 'hello-from-aeko'}
                />
                <label className="mt-4 block text-xs font-medium" htmlFor="raw-accounts">Accounts</label>
                <textarea
                  id="raw-accounts"
                  value={rawAccounts}
                  onChange={(event) => setRawAccounts(event.target.value)}
                  rows={4}
                  className="mt-1 w-full rounded-lg border border-border bg-background p-3 font-mono text-xs outline-none focus:border-primary"
                  placeholder={'address, signer, writable\naddress, false, true'}
                />
                <p className="mt-1 text-[10px] text-muted-foreground">One account per line: public key, signer boolean, writable boolean.</p>
              </section>
            ) : operation ? (
              <section className="rounded-xl border border-border bg-card/35 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold">{prettyName(operation.functionName ?? operation.variant)}</h2>
                  <Badge>{operation.category}</Badge>
                  <span className="font-mono text-[10px] text-muted-foreground">{operation.enumName + '::' + operation.variant}</span>
                </div>
                {!operation.supported ? (
                  <Alert className="mt-4 border-amber-400/30">
                    <TriangleAlert className="mb-2 size-4 text-amber-300" />
                    <AlertTitle>Manual encoding required</AlertTitle>
                    <AlertDescription>{operation.unsupportedReason}</AlertDescription>
                  </Alert>
                ) : null}

                {operation.fields.length ? (
                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    {operation.fields.map((field) => (
                      <label key={field.name} className="block min-w-0 text-xs">
                        <span className="flex items-center justify-between gap-2">
                          <span className="font-medium">{prettyName(field.name)}</span>
                          <code className="text-[10px] text-muted-foreground">{field.rustType}</code>
                        </span>
                        {field.kind === 'bool' && !field.optional ? (
                          <input
                            type="checkbox"
                            checked={fieldValues[field.name] === true}
                            onChange={(event) => setFieldValues((current) => ({ ...current, [field.name]: event.target.checked }))}
                            className="mt-3 size-4"
                          />
                        ) : field.kind === 'bool' ? (
                          <select
                            value={String(fieldValues[field.name] ?? '')}
                            onChange={(event) => setFieldValues((current) => ({ ...current, [field.name]: event.target.value }))}
                            className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3"
                          >
                            <option value="">None</option>
                            <option value="true">true</option>
                            <option value="false">false</option>
                          </select>
                        ) : (
                          <input
                            value={String(fieldValues[field.name] ?? '')}
                            onChange={(event) => setFieldValues((current) => ({ ...current, [field.name]: event.target.value }))}
                            placeholder={field.optional ? 'Optional' : field.kind === 'pubkey' ? 'AEKO public key' : field.kind === 'bytes' ? 'Hex or base58 bytes' : field.rustType}
                            spellCheck={false}
                            className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 font-mono text-xs outline-none focus:border-primary disabled:opacity-50"
                            disabled={field.kind === 'unsupported'}
                          />
                        )}
                      </label>
                    ))}
                  </div>
                ) : null}

                {operation.accounts.length ? (
                  <div className="mt-5 border-t border-border pt-4">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Accounts</h3>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {operation.accounts.map((account, index) => {
                        const key = accountValueKey(account.name, index)
                        const value = account.defaultAddress ?? accountValues[key] ?? (account.isSigner ? wallet?.address ?? '' : '')
                        return (
                          <label key={key} className="block text-xs">
                            <span className="flex items-center justify-between gap-2">
                              <span>{prettyName(account.name)}</span>
                              <span className="text-[9px] text-muted-foreground">
                                {account.isSigner ? 'signer · ' : ''}{account.isWritable ? 'writable' : 'read-only'}
                              </span>
                            </span>
                            <input
                              value={value}
                              onChange={(event) => setAccountValues((current) => ({ ...current, [key]: event.target.value }))}
                              spellCheck={false}
                              readOnly={Boolean(account.defaultAddress)}
                              placeholder="AEKO public key"
                              className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 font-mono text-xs outline-none focus:border-primary read-only:cursor-default read-only:text-muted-foreground"
                            />
                          </label>
                        )
                      })}
                    </div>
                  </div>
                ) : null}
              </section>
            ) : (
              <section className="rounded-xl border border-border bg-card/35 p-5 text-sm text-muted-foreground">
                Choose an instruction from the Interact sidebar or use Raw instruction.
              </section>
            )}

            {!accountsView ? (
              <div className="space-y-2">
                {config.network.trim().toLowerCase() === 'mainnet' ? (
                  <p className="text-xs text-amber-300">Mainnet Interact is read-only in the browser. RPC account reads and WebSocket subscriptions remain available.</p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => void prepare()}
                  disabled={busy || config.network.trim().toLowerCase() === 'mainnet' || (!rawView && !operation?.supported)}
                >
                  {busy ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <ShieldCheck />}
                  Review transaction
                </Button>
                {signature ? (
                  <span className="flex min-h-10 items-center rounded-lg border border-border px-3 font-mono text-[10px] text-emerald-300">
                    confirmed {shortAddress(signature)}
                  </span>
                ) : null}
                </div>
              </div>
            ) : null}

            {error ? (
              <Alert className="border-destructive">
                <TriangleAlert className="mb-2 size-4 text-destructive" />
                <AlertTitle>Interaction failed</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
          </div>

          <aside className="min-w-0 space-y-4">
            {review ? (
              <section className="rounded-xl border border-primary/30 bg-primary/[0.06] p-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="size-4 text-primary" />
                  <h2 className="text-sm font-semibold">Review before signing</h2>
                </div>
                <dl className="mt-4 space-y-3 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Network</dt>
                    <dd className="mt-1">{config.network}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Method</dt>
                    <dd className="mt-1">{review.operationLabel}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Program</dt>
                    <dd className="mt-1 break-all font-mono text-[10px]">{programId}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Instruction bytes</dt>
                    <dd>{review.instructionBytes}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Network fee</dt>
                    <dd>{formatAeko(review.feeLamports)}</dd>
                  </div>
                </dl>
                <Button className="mt-4 w-full" onClick={() => void submit()} disabled={busy}>
                  {busy ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Send />}
                  Sign and send
                </Button>
                <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
                  Fee and recent blockhash are revalidated immediately before browser-local signing.
                </p>
              </section>
            ) : null}

            <section className="rounded-xl border border-border bg-card/35 p-4">
              <div className="flex items-center gap-2">
                <Activity className="size-4 text-primary" />
                <h2 className="text-sm font-semibold">Live activity</h2>
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {config.websocketUrl ? 'Program logs and account changes stream from AEKO WebSocket.' : 'No AEKO WebSocket endpoint is configured.'}
              </p>
              <div className="mt-3 max-h-72 space-y-2 overflow-auto">
                {activity.length ? activity.map((line, index) => (
                  <div key={String(index) + line.slice(0, 12)} className="rounded-md border border-border bg-black/20 p-2 font-mono text-[9px] leading-4 text-muted-foreground">
                    {line}
                  </div>
                )) : (
                  <p className="text-xs text-muted-foreground">No live events yet.</p>
                )}
              </div>
              {signature && config.explorerUrl ? (
                <a
                  href={config.explorerUrl.replace(/\/$/, '') + '/tx/' + signature}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  Open confirmed transaction <ExternalLink className="size-3" />
                </a>
              ) : null}
            </section>
          </aside>
        </div>
      </div>
    </section>
  )
}

function TerminalSquareIcon() {
  return <span className="grid size-4 place-items-center rounded-sm border border-primary/50 font-mono text-[8px] text-primary">&gt;_</span>
}
