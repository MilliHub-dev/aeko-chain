import { AlertTriangle, CheckCircle2, X } from 'lucide-react'
import { formatAeko } from '../aeko/rpc'
import type { TransferReviewPayload } from '../aeko/transfer'
import { Button } from './ui/button'

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 py-1.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? 'break-all font-mono text-foreground' : 'text-foreground'}>{value}</span>
    </div>
  )
}

export default function TransferReview({
  transaction,
  busy,
  onConfirm,
  onCancel,
}: {
  transaction: TransferReviewPayload
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const mainnet = transaction.network === 'mainnet'
  return (
    <section aria-label="Review AEKO transfer" className="my-3 overflow-hidden rounded-lg border border-amber-400/20 bg-amber-400/[0.04]">
      <div className="flex items-center gap-2 border-b border-amber-400/15 px-3 py-2.5">
        <AlertTriangle className="size-4 text-amber-300" aria-hidden="true" />
        <span className="text-xs font-semibold text-amber-100">Review transaction</span>
        <span className="ml-auto rounded border border-amber-400/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-amber-300">
          TX · {transaction.network}
        </span>
      </div>
      <div className="px-3 py-2">
        <Detail label="From" value={transaction.from} mono />
        <Detail label="To" value={transaction.to} mono />
        <Detail label="Amount" value={`${transaction.amountAeko} AEKO`} />
        <Detail label="Network fee" value={formatAeko(transaction.feeLamports)} />
        <Detail label="Total debit" value={formatAeko(transaction.totalLamports)} />
        <Detail label="Balance" value={formatAeko(transaction.balanceLamports)} />
        <div className={`mt-2 rounded-md border px-2.5 py-2 text-[11px] leading-4 ${mainnet ? 'border-red-400/20 bg-red-500/[0.06] text-red-200' : 'border-border bg-black/20 text-muted-foreground'}`}>
          {mainnet
            ? 'Mainnet transaction. Approval signs locally and can spend real AEKO from this development wallet.'
            : 'Approval signs only in this browser, then submits the signed transaction to the selected AEKO RPC.'}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 border-t border-border p-3">
        <Button variant="outline" onClick={onCancel} disabled={busy}><X />Cancel</Button>
        <Button onClick={onConfirm} disabled={busy}><CheckCircle2 />{busy ? 'Submitting…' : 'Approve & send'}</Button>
      </div>
    </section>
  )
}
