import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { formatAeko } from '../../../utils/aekoRpcClient.js';

function Detail({ label, value, mono = false }) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 py-1.5 text-xs">
      <span className="text-gray-600">{label}</span>
      <span className={mono ? 'break-all font-mono text-gray-300' : 'text-gray-300'}>
        {value}
      </span>
    </div>
  );
}

export default function TransferReview({
  transaction,
  busy,
  onConfirm,
  onCancel,
}) {
  const mainnet = transaction.network === 'mainnet';

  return (
    <section
      aria-label="Review AEKO transfer"
      className="my-3 overflow-hidden rounded-lg border border-amber-400/20 bg-amber-400/[0.04]"
    >
      <div className="flex items-center gap-2 border-b border-amber-400/15 px-3 py-2.5">
        <AlertTriangle size={14} className="text-amber-300" aria-hidden="true" />
        <span className="text-xs font-semibold text-amber-100">Review transaction</span>
        <span className="ml-auto rounded border border-amber-400/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-amber-300">
          TX · {transaction.network}
        </span>
      </div>

      <div className="px-3 py-2">
        <Detail label="From" value={transaction.from} mono />
        <Detail label="To" value={transaction.to} mono />
        <Detail label="Amount" value={transaction.amountAeko + ' AEKO'} />
        <Detail label="Network fee" value={formatAeko(transaction.feeLamports)} />
        <Detail label="Total debit" value={formatAeko(transaction.totalLamports)} />
        <Detail label="Balance" value={formatAeko(transaction.balanceLamports)} />

        <div
          className={
            'mt-2 rounded-md border px-2.5 py-2 text-[11px] leading-4 '
            + (
              mainnet
                ? 'border-red-400/20 bg-red-500/[0.06] text-red-200'
                : 'border-white/[0.06] bg-black/20 text-gray-500'
            )
          }
        >
          {mainnet
            ? 'Mainnet transaction. Approval signs locally and can spend real AEKO from this development wallet.'
            : 'Approval signs only in this browser, then submits the signed transaction to the selected AEKO RPC.'}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-white/[0.06] p-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-white/10 text-xs font-medium text-gray-300 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <X size={14} aria-hidden="true" />
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-aeko-accent text-xs font-semibold text-black hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aeko-accent focus-visible:ring-offset-2 focus-visible:ring-offset-[#07070b] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <CheckCircle2 size={14} aria-hidden="true" />
          {busy ? 'Submitting…' : 'Approve & send'}
        </button>
      </div>
    </section>
  );
}
