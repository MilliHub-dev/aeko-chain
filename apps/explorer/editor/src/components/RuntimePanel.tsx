import { Loader2, Plus, RefreshCw, WalletCards } from 'lucide-react'
import type { ProgramArtifactStatus } from '../../shared/contracts/artifact.js'
import type { StudioConfig } from '../../shared/contracts/session.js'
import { formatAeko } from '../aeko/rpc'
import { shortAddress, type DevelopmentWallet } from '../aeko/wallet'

export interface RuntimeDeployment {
  programId: string
  signature: string
}

function networkLabel(network: string): string {
  const normalized = network.trim().toLowerCase()
  if (normalized === 'mainnet') return 'Mainnet'
  if (normalized === 'testnet') return 'Testnet'
  if (normalized === 'localnet') return 'Local development'
  return network || 'AEKO network'
}

function NetworkToggle({ network }: { network: string }) {
  const value = network.trim().toLowerCase()
  return (
    <div className="flex items-center rounded-full border border-white/10 bg-white/5 p-1" aria-label="AEKO network">
      {(['mainnet', 'testnet'] as const).map((option) => {
        const active = value === option
        const label = networkLabel(option)
        return (
          <button
            key={option}
            type="button"
            disabled
            aria-pressed={active}
            title={active ? `${label} is the configured Studio network` : `This Studio instance is configured for ${networkLabel(network)}`}
            className={`rounded-full px-4 py-2 text-nowrap text-sm font-medium transition-colors ${
              active
                ? 'cursor-default bg-aeko-accent text-black'
                : 'cursor-not-allowed text-gray-600'
            }`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

function PanelHeader({ title }: { title: string }) {
  return (
    <div className="flex h-11 items-center justify-between border-b border-white/10 px-3">
      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">{title}</span>
    </div>
  )
}

export default function RuntimePanel({
  config,
  runnerReady,
  wallet,
  wallets,
  walletId,
  onSelectWallet,
  onCreateWallet,
  balance,
  balanceBusy,
  onRefreshBalance,
  artifact,
  artifactSupported,
  deployment,
  recoverableBuffer,
  onRecoverBuffer,
  onRequestCloseProgram,
  lifecycleBusy = false,
  controlId = 'editor-wallet',
}: {
  config: StudioConfig
  runnerReady: boolean
  wallet: DevelopmentWallet | null
  wallets: DevelopmentWallet[]
  walletId: string
  onSelectWallet: (id: string) => void
  onCreateWallet: () => void | Promise<void>
  balance: number | null
  balanceBusy: boolean
  onRefreshBalance: () => void | Promise<void>
  artifact: ProgramArtifactStatus | null
  artifactSupported: boolean
  deployment: RuntimeDeployment | null
  recoverableBuffer: string | null
  onRecoverBuffer?: () => void | Promise<void>
  onRequestCloseProgram?: () => void | Promise<void>
  lifecycleBusy?: boolean
  controlId?: string
}) {
  const network = config.network.trim().toLowerCase()
  const label = networkLabel(config.network)

  return (
    <aside data-aeko-runtime-panel className="flex size-full min-h-0 flex-col bg-[#0b0b10]">
      <PanelHeader title="Runtime" />
      <div className="space-y-5 overflow-auto p-4">
        <section>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-600">Network</div>
          <NetworkToggle network={config.network} />
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="text-gray-500">Editor lifecycle</span>
            <span className={runnerReady ? 'text-emerald-300' : 'text-amber-300'}>
              {runnerReady ? 'Runner ready' : 'Runner unavailable'}
            </span>
          </div>
          {network === 'mainnet' ? (
            <div className="mt-3 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] p-3 text-xs leading-5 text-amber-200">
              Mainnet deployment is disabled. You can still edit code, but deploy from the browser only on Testnet or local development.
            </div>
          ) : null}
        </section>

        <section className="border-t border-white/10 pt-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-600">Development wallet</div>
            <button
              type="button"
              onClick={() => void onRefreshBalance()}
              disabled={!wallet || balanceBusy}
              aria-label="Refresh wallet balance"
              className="rounded p-2 text-gray-500 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aeko-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw size={14} className={balanceBusy ? 'animate-spin motion-reduce:animate-none' : ''} />
            </button>
          </div>
          {wallets.length ? (
            <>
              <label className="sr-only" htmlFor={controlId}>Development wallet</label>
              <select
                id={controlId}
                value={walletId}
                onChange={(event) => onSelectWallet(event.target.value)}
                className="min-h-11 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-gray-200 outline-none focus:border-aeko-accent"
              >
                {wallets.map((item) => (
                  <option key={item.id} value={item.id}>{item.name} · {shortAddress(item.address)}</option>
                ))}
              </select>
              <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
                <div className="font-mono text-xs text-gray-300">{wallet ? shortAddress(wallet.address) : ''}</div>
                <div className="mt-1 text-sm font-semibold text-white">
                  {balance === null ? 'Balance unavailable' : formatAeko(balance)}
                </div>
              </div>
              <p className="mt-2 text-[11px] leading-4 text-gray-600">
                Development wallets are stored unencrypted in this browser. Never use them for valuable funds.
              </p>
            </>
          ) : (
            <button
              type="button"
              onClick={() => void onCreateWallet()}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-aeko-accent/40 bg-aeko-accent/10 text-sm text-aeko-accent hover:bg-aeko-accent/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aeko-accent"
            >
              <Plus size={15} />
              Create development wallet
            </button>
          )}
        </section>

        <section className="border-t border-white/10 pt-4">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-600">Artifact</div>
          {artifactSupported && artifact?.available && artifact.sha256 && artifact.byteLength !== null ? (
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between gap-3">
                <span className="text-gray-500">SBF</span>
                <span className="text-emerald-300">Built</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-gray-500">Size</span>
                <span className="text-gray-300">{artifact.byteLength.toLocaleString()} bytes</span>
              </div>
              <div className="truncate font-mono text-[10px] text-gray-600" title={artifact.sha256}>
                {artifact.sha256}
              </div>
            </div>
          ) : (
            <p className="text-xs leading-5 text-gray-600">No current build artifact. Editing source invalidates the previous build.</p>
          )}
        </section>

        {recoverableBuffer ? (
          <section className="border-t border-amber-400/15 pt-4">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-300">Interrupted buffer</div>
            <p className="truncate font-mono text-[10px] text-gray-500" title={recoverableBuffer}>
              {recoverableBuffer}
            </p>
            <button
              type="button"
              onClick={() => void onRecoverBuffer?.()}
              disabled={lifecycleBusy || !onRecoverBuffer}
              className="mt-2 min-h-10 w-full rounded-lg border border-amber-400/25 bg-amber-400/[0.06] px-3 text-xs font-medium text-amber-200 hover:bg-amber-400/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:opacity-50"
            >
              Recover buffer rent
            </button>
          </section>
        ) : null}

        <section className="border-t border-white/10 pt-4">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-600">Latest deployment</div>
          {deployment ? (
            <div className="space-y-2 text-xs">
              <a
                href={config.explorerUrl ? `${config.explorerUrl.replace(/\/$/, '')}/account/${deployment.programId}` : '#'}
                className="block truncate font-mono text-aeko-accent hover:text-white"
                target="_blank"
                rel="noreferrer"
              >
                {deployment.programId}
              </a>
              <a
                href={config.explorerUrl ? `${config.explorerUrl.replace(/\/$/, '')}/tx/${deployment.signature}` : '#'}
                className="block truncate text-gray-500 hover:text-white"
                target="_blank"
                rel="noreferrer"
              >
                tx {shortAddress(deployment.signature)}
              </a>
              {network !== 'mainnet' ? (
                <button
                  type="button"
                  onClick={() => void onRequestCloseProgram?.()}
                  disabled={lifecycleBusy || !onRequestCloseProgram}
                  className="mt-2 min-h-10 w-full rounded-lg border border-red-500/20 px-3 text-xs font-medium text-red-300 hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:opacity-50"
                >
                  {lifecycleBusy ? <Loader2 size={14} className="mr-2 inline animate-spin motion-reduce:animate-none" /> : null}
                  Close program and recover rent
                </button>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-gray-600">Nothing deployed from this project on {label} yet.</p>
          )}
        </section>
      </div>
    </aside>
  )
}
