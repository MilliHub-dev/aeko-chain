import { createElement } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  CheckCircle2,
  Clock3,
  Code2,
  Cpu,
  FileJson,
  Hash,
  ListTree,
  ScrollText,
  Wallet,
  XCircle,
} from 'lucide-react';
import CopyButton from '../components/CopyButton';
import NetworkToggle from '../components/NetworkToggle';
import { useNetwork } from '../components/NetworkContext';
import { fetchTransactionDetails } from '../utils/explorerApi';
import { useExplorerResource } from '../utils/explorerQueries';

const TAB_KEYS = ['overview', 'instructions', 'accounts', 'transfers', 'logs', 'advanced'];

export default function TransactionDetails() {
  const { hash } = useParams();
  const { network } = useNetwork();
  const [searchParams, setSearchParams] = useSearchParams();
  const { unavailable, state } = useExplorerResource(
    network,
    'transaction',
    hash,
    () => fetchTransactionDetails(network, hash),
  );
  const tx = state.data;
  const requestedTab = searchParams.get('tab') || 'overview';
  const tab = TAB_KEYS.includes(requestedTab) ? requestedTab : 'overview';

  function selectTab(nextTab) {
    const next = new URLSearchParams(searchParams);
    if (nextTab === 'overview') next.delete('tab');
    else next.set('tab', nextTab);
    setSearchParams(next, { replace: true });
  }

  return (
    <div className="mx-auto max-w-[1440px] px-4 pb-20 pt-24 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Link
          to="/explorer"
          className="inline-flex min-h-11 items-center gap-2 self-start rounded-xl px-2 text-sm text-gray-400 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aeko-accent/70"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to Explorer
        </Link>
        <NetworkToggle />
      </div>

      {unavailable ? (
        <Notice tone="warning">Explorer API not configured for {network}.</Notice>
      ) : null}

      {!unavailable && state.loading ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-6 text-sm text-gray-400">
          Loading transaction trace…
        </div>
      ) : null}

      {!unavailable && state.error ? (
        <Notice tone="error">{state.error}</Notice>
      ) : null}

      {!unavailable && tx ? (
        <div className="space-y-6">
          <TransactionHeader tx={tx} />

          {!tx.detailAvailable ? (
            <Notice tone="info">
              The finalized index has this transaction, but live RPC trace enrichment is currently unavailable.
              Indexed identity, participating accounts, block time, and transfers are shown where available.
            </Notice>
          ) : null}

          <TransactionTabs tx={tx} value={tab} onChange={selectTab} />

          {tab === 'overview' ? <OverviewTab tx={tx} /> : null}
          {tab === 'instructions' ? <InstructionsTab tx={tx} /> : null}
          {tab === 'accounts' ? <AccountsTab tx={tx} /> : null}
          {tab === 'transfers' ? <TransfersTab tx={tx} /> : null}
          {tab === 'logs' ? <LogsTab tx={tx} /> : null}
          {tab === 'advanced' ? <AdvancedTab tx={tx} /> : null}
        </div>
      ) : null}
    </div>
  );
}

function TransactionHeader({ tx }) {
  return (
    <header className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035]">
      <div className="border-b border-white/10 px-4 py-5 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-aeko-accent/20 bg-aeko-accent/10 text-aeko-accent">
                <Activity className="size-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Aeko Scan</p>
                <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">Transaction details</h1>
              </div>
            </div>
            <div className="mt-5 flex min-w-0 items-start gap-2">
              <code className="min-w-0 flex-1 break-all rounded-lg border border-white/10 bg-black/15 px-3 py-2.5 text-xs leading-5 text-gray-300 sm:text-sm">
                {tx.signature}
              </code>
              <CopyButton value={tx.signature} label="Copy transaction hash" compact />
            </div>
          </div>
          <StatusPill success={tx.success} />
        </div>
      </div>

      <div className="grid divide-y divide-white/10 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
        <HeaderMetric icon={Hash} label="Slot" value={formatInteger(tx.slot)} />
        <HeaderMetric icon={Clock3} label="Timestamp" value={formatTimestamp(tx.blockTime)} />
        <HeaderMetric icon={Cpu} label="Compute units" value={formatInteger(tx.computeUnitsConsumed)} />
        <HeaderMetric icon={Wallet} label="Fee" value={formatLamports(tx.fee)} />
      </div>
    </header>
  );
}

function HeaderMetric({ icon, label, value }) {
  return (
    <div className="min-w-0 px-4 py-4 sm:px-5">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-gray-500">
        {createElement(icon, { className: 'size-3.5', 'aria-hidden': true })}
        {label}
      </div>
      <div className="mt-2 min-w-0 break-words text-sm font-semibold tabular-nums text-gray-200">{value}</div>
    </div>
  );
}

function StatusPill({ success }) {
  return (
    <div
      className={
        'inline-flex min-h-11 shrink-0 items-center gap-2 self-start rounded-xl border px-4 text-sm font-semibold ' +
        (success
          ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300'
          : 'border-red-400/25 bg-red-400/10 text-red-300')
      }
    >
      {success ? <CheckCircle2 className="size-4" aria-hidden="true" /> : <XCircle className="size-4" aria-hidden="true" />}
      {success ? 'Success' : 'Failed'}
    </div>
  );
}

function TransactionTabs({ tx, value, onChange }) {
  const tabs = [
    { key: 'overview', label: 'Overview', icon: Activity },
    { key: 'instructions', label: 'Instructions', icon: ListTree, count: tx.instructions?.length ?? 0 },
    { key: 'accounts', label: 'Accounts', icon: Wallet, count: tx.accounts?.length ?? 0 },
    {
      key: 'transfers',
      label: 'Transfers',
      icon: ArrowRightLeft,
      count: (tx.tokenTransfers?.length ?? 0) + (tx.tokenBalanceChanges?.length ?? 0),
    },
    { key: 'logs', label: 'Logs', icon: ScrollText, count: tx.logMessages?.length ?? 0 },
    { key: 'advanced', label: 'Advanced', icon: Code2 },
  ];

  return (
    <div className="min-w-0 overflow-x-auto pb-1">
      <div
        role="tablist"
        aria-label="Transaction detail sections"
        className="flex min-w-max gap-1 rounded-xl border border-white/10 bg-black/10 p-1"
      >
        {tabs.map(({ key, label, icon, count }) => {
          const active = value === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(key)}
              className={
                'inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-lg px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aeko-accent/70 ' +
                (active
                  ? 'bg-white/10 text-white'
                  : 'text-gray-500 hover:bg-white/[0.04] hover:text-gray-200')
              }
            >
              {createElement(icon, { className: 'size-4', 'aria-hidden': true })}
              {label}
              {typeof count === 'number' ? (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${active ? 'bg-aeko-accent/15 text-aeko-accent' : 'bg-white/5 text-gray-600'}`}>
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function OverviewTab({ tx }) {
  return (
    <div className="space-y-6">
      {tx.signer || tx.primaryProgram ? (
        <Section title="Transaction action" description="The fee payer or signer and the first program invoked by this transaction.">
          <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
            {tx.signer ? <IdentityLink address={tx.signer} label="Signer / fee payer" /> : <MutedValue>Unknown signer</MutedValue>}
            <ArrowRight className="size-4 shrink-0 rotate-90 text-gray-600 sm:rotate-0" aria-hidden="true" />
            {tx.primaryProgram ? <IdentityLink address={tx.primaryProgram} label="Primary program" /> : <MutedValue>No program identified</MutedValue>}
          </div>
        </Section>
      ) : null}

      <Section title="Overview" description="Execution identity, placement, cost and runtime metadata.">
        <DetailRow label="Status">
          <span className={tx.success ? 'font-semibold text-emerald-300' : 'font-semibold text-red-300'}>
            {tx.success ? 'Success' : 'Failed'}
          </span>
        </DetailRow>
        <DetailRow label="Slot">
          <Link className="font-mono text-aeko-accent hover:text-white hover:underline" to={`/explorer/block/${tx.slot}`}>
            {formatInteger(tx.slot)}
          </Link>
        </DetailRow>
        <DetailRow label="Timestamp">
          <span>{formatTimestamp(tx.blockTime)}</span>
        </DetailRow>
        <DetailRow label="Signer / fee payer">
          {tx.signer ? <AddressValue address={tx.signer} /> : <MutedValue>Unavailable</MutedValue>}
        </DetailRow>
        <DetailRow label="Primary program">
          {tx.primaryProgram ? <AddressValue address={tx.primaryProgram} /> : <MutedValue>No instruction program identified</MutedValue>}
        </DetailRow>
        <DetailRow label="Transaction fee">
          <div>
            <div className="font-semibold text-white">{formatLamports(tx.fee)}</div>
            <div className="mt-1 font-mono text-xs text-gray-600">{formatInteger(tx.fee)} lamports</div>
          </div>
        </DetailRow>
        <DetailRow label="Compute units">
          {tx.computeUnitsConsumed != null ? formatInteger(tx.computeUnitsConsumed) : <MutedValue>Not reported by RPC</MutedValue>}
        </DetailRow>
        <DetailRow label="Version">
          {tx.version != null ? <span className="font-mono">{tx.version}</span> : <MutedValue>Legacy / not reported</MutedValue>}
        </DetailRow>
        <DetailRow label="Recent blockhash">
          {tx.recentBlockhash ? <CopyableCode value={tx.recentBlockhash} label="Copy recent blockhash" /> : <MutedValue>Unavailable</MutedValue>}
        </DetailRow>
        {!tx.success ? (
          <DetailRow label="Execution error">
            {tx.error ? <JsonInline value={tx.error} /> : <MutedValue>Failure detail unavailable</MutedValue>}
          </DetailRow>
        ) : null}
      </Section>
    </div>
  );
}

function InstructionsTab({ tx }) {
  const instructions = tx.instructions ?? [];
  const innerGroups = tx.innerInstructions ?? [];
  if (!instructions.length && !innerGroups.length) {
    return <EmptySection icon={ListTree} title="No instruction trace available" body="This transaction has no decoded instruction trace in the current detail response." />;
  }

  return (
    <div className="space-y-6">
      <Section title="Top-level instructions" description="Programs invoked directly by the transaction message.">
        {instructions.length ? instructions.map((instruction) => (
          <InstructionRow key={instruction.index} instruction={instruction} prefix="Instruction" />
        )) : <EmptyRow>No top-level instructions were reported.</EmptyRow>}
      </Section>

      {innerGroups.length ? (
        <Section title="Inner instructions" description="Cross-program invocations emitted while top-level instructions executed.">
          {innerGroups.map((group) => (
            <div key={group.index} className="border-b border-white/10 last:border-b-0">
              <div className="bg-white/[0.025] px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 sm:px-5">
                Invoked from instruction #{group.index + 1}
              </div>
              {group.instructions.map((instruction) => (
                <InstructionRow
                  key={`${group.index}-${instruction.index}`}
                  instruction={instruction}
                  prefix="Inner"
                />
              ))}
            </div>
          ))}
        </Section>
      ) : null}
    </div>
  );
}

function InstructionRow({ instruction, prefix }) {
  const parsedType = instruction.parsed?.type;
  return (
    <details className="group border-b border-white/10 last:border-b-0">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-aeko-accent/70 sm:px-5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.035] font-mono text-xs text-gray-400">
          {instruction.index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-white">{prefix} {instruction.index + 1}</span>
            {instruction.program ? <Badge>{instruction.program}</Badge> : null}
            {parsedType ? <Badge accent>{parsedType}</Badge> : null}
          </div>
          <div className="mt-1 break-all font-mono text-xs text-gray-500">
            {instruction.programId}
          </div>
        </div>
        <span className="text-xs font-medium text-gray-500 group-open:text-aeko-accent">Details</span>
      </summary>
      <div className="space-y-4 border-t border-white/10 bg-black/10 px-4 py-4 sm:px-5">
        <div>
          <Subheading>Program account</Subheading>
          <Link to={`/explorer/account/${instruction.programId}`} className="mt-2 block break-all font-mono text-xs text-aeko-accent hover:text-white hover:underline">
            {instruction.programId}
          </Link>
        </div>
        {instruction.accounts?.length ? (
          <div>
            <Subheading>Referenced accounts</Subheading>
            <div className="mt-2 grid gap-2">
              {instruction.accounts.map((address, index) => (
                <div key={`${address}-${index}`} className="flex min-w-0 items-center gap-2">
                  <span className="w-7 shrink-0 text-right font-mono text-xs text-gray-600">{index}</span>
                  <Link to={`/explorer/account/${address}`} className="min-w-0 break-all font-mono text-xs text-aeko-accent hover:text-white hover:underline">
                    {address}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {instruction.parsed ? (
          <div>
            <Subheading>Parsed instruction</Subheading>
            <JsonBlock value={instruction.parsed} />
          </div>
        ) : null}
        {instruction.data ? (
          <div>
            <Subheading>Instruction data</Subheading>
            <CopyableCode value={instruction.data} label="Copy instruction data" />
          </div>
        ) : null}
        {instruction.stackHeight != null ? (
          <div className="text-xs text-gray-500">Invocation stack height <span className="font-mono text-gray-300">{instruction.stackHeight}</span></div>
        ) : null}
      </div>
    </details>
  );
}

function AccountsTab({ tx }) {
  const accounts = tx.accounts ?? [];
  if (!accounts.length) {
    return <EmptySection icon={Wallet} title="No account list available" body="The index and live trace did not return participating account metadata." />;
  }

  return (
    <Section title="Account inputs" description="Every account referenced by the message, with signer/write roles and native balance changes when RPC metadata is available.">
      <div className="hidden grid-cols-[3rem_minmax(0,1fr)_9rem_10rem_10rem_10rem] gap-3 border-b border-white/10 bg-white/[0.025] px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-600 lg:grid">
        <span>#</span>
        <span>Account</span>
        <span>Role</span>
        <span className="text-right">Before</span>
        <span className="text-right">After</span>
        <span className="text-right">Change</span>
      </div>
      {accounts.map((account) => (
        <div key={`${account.index}-${account.address}`} className="grid gap-3 border-b border-white/10 px-4 py-4 last:border-b-0 sm:px-5 lg:grid-cols-[3rem_minmax(0,1fr)_9rem_10rem_10rem_10rem] lg:items-center">
          <div className="font-mono text-xs text-gray-600">#{account.index}</div>
          <div className="min-w-0">
            <AddressValue address={account.address} compact />
            {account.source ? <div className="mt-1 text-[11px] text-gray-600">Source: {humanizeSource(account.source)}</div> : null}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {account.signer === true ? <Badge accent>Signer</Badge> : null}
            {account.writable === true ? <Badge>Writable</Badge> : null}
            {account.writable === false ? <Badge>Read only</Badge> : null}
            {account.signer == null && account.writable == null ? <Badge>Role unavailable</Badge> : null}
          </div>
          <BalanceColumn label="Before" value={account.preBalance} />
          <BalanceColumn label="After" value={account.postBalance} />
          <BalanceDeltaColumn pre={account.preBalance} post={account.postBalance} />
        </div>
      ))}
    </Section>
  );
}

function TransfersTab({ tx }) {
  const transfers = tx.tokenTransfers ?? [];
  const balanceChanges = tx.tokenBalanceChanges ?? [];
  if (!transfers.length && !balanceChanges.length) {
    return <EmptySection icon={ArrowRightLeft} title="No token movement detected" body="No indexed token transfers or token-balance deltas were reported for this transaction." />;
  }

  return (
    <div className="space-y-6">
      {transfers.length ? (
        <Section title="Indexed token transfers" description="Token-20 transfer events projected from finalized chain instructions.">
          {transfers.map((transfer) => {
            const decimals = balanceChanges.find((change) => change.mint === transfer.mint)?.decimals;
            return (
              <div key={`${transfer.signature}-${transfer.eventIndex}`} className="border-b border-white/10 px-4 py-4 last:border-b-0 sm:px-5">
                <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(0,1fr)_2rem_minmax(0,1fr)_minmax(10rem,0.7fr)] xl:items-center">
                  <IdentityLink address={transfer.source} label="From token account" />
                  <ArrowRight className="size-4 rotate-90 text-gray-600 xl:rotate-0" aria-hidden="true" />
                  <IdentityLink address={transfer.destination} label="To token account" />
                  <div className="xl:text-right">
                    <div className="text-xs uppercase tracking-[0.12em] text-gray-600">Amount</div>
                    <div className="mt-1 font-mono text-sm font-semibold text-white">
                      {formatTokenAmount(transfer.amount, decimals)}
                    </div>
                    <Link to={`/explorer/token/${transfer.mint}`} className="mt-1 block break-all font-mono text-xs text-aeko-accent hover:text-white hover:underline">
                      {transfer.mint}
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </Section>
      ) : null}

      {balanceChanges.length ? (
        <Section title="Token balance changes" description="Pre/post token balances reported by transaction metadata.">
          {balanceChanges.map((change) => (
            <div key={`${change.accountIndex}-${change.mint}-${change.owner || ''}`} className="grid gap-3 border-b border-white/10 px-4 py-4 last:border-b-0 sm:px-5 lg:grid-cols-[minmax(0,1fr)_9rem_9rem_9rem] lg:items-center">
              <div className="min-w-0">
                <Link to={`/explorer/token/${change.mint}`} className="break-all font-mono text-sm text-aeko-accent hover:text-white hover:underline">
                  {change.mint}
                </Link>
                <div className="mt-1 text-xs text-gray-600">
                  Account #{change.accountIndex}{change.owner ? ' · owner ' : ''}
                  {change.owner ? (
                    <Link to={`/explorer/account/${change.owner}`} className="font-mono text-gray-400 hover:text-white hover:underline">
                      {shortIdentity(change.owner)}
                    </Link>
                  ) : null}
                </div>
              </div>
              <TokenBalanceCell label="Before" raw={change.preAmount} ui={change.preUiAmount} decimals={change.decimals} />
              <TokenBalanceCell label="After" raw={change.postAmount} ui={change.postUiAmount} decimals={change.decimals} />
              <TokenDeltaCell change={change} />
            </div>
          ))}
        </Section>
      ) : null}
    </div>
  );
}

function LogsTab({ tx }) {
  const logs = tx.logMessages ?? [];
  if (!logs.length) {
    return <EmptySection icon={ScrollText} title="No program logs available" body="This transaction did not return log messages in the live trace." />;
  }

  return (
    <Section title="Program logs" description="Chronological runtime messages emitted while instructions executed.">
      <ol className="divide-y divide-white/5 bg-black/10">
        {logs.map((line, index) => (
          <li key={`${index}-${line}`} className="grid grid-cols-[2.75rem_minmax(0,1fr)] px-4 py-2.5 sm:px-5">
            <span className="select-none pr-3 text-right font-mono text-xs tabular-nums text-gray-700">{index + 1}</span>
            <code className="break-all font-mono text-xs leading-5 text-gray-300">{line}</code>
          </li>
        ))}
      </ol>
    </Section>
  );
}

function AdvancedTab({ tx }) {
  return (
    <div className="space-y-6">
      {tx.returnData ? (
        <Section title="Program return data" description="Raw return payload emitted by the transaction runtime.">
          <div className="p-4 sm:p-5"><JsonBlock value={tx.returnData} /></div>
        </Section>
      ) : null}

      {tx.error ? (
        <Section title="Execution error object" description="Machine-readable runtime failure metadata.">
          <div className="p-4 sm:p-5"><JsonBlock value={tx.error} /></div>
        </Section>
      ) : null}

      <Section title="Raw RPC transaction" description="Full public getTransaction payload used to enrich this page.">
        {tx.rawTransaction ? (
          <details>
            <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-gray-300 hover:bg-white/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-aeko-accent/70 sm:px-5">
              <span>Show raw JSON</span>
              <FileJson className="size-4 text-gray-500" aria-hidden="true" />
            </summary>
            <div className="border-t border-white/10 p-4 sm:p-5">
              <JsonBlock value={tx.rawTransaction} />
            </div>
          </details>
        ) : (
          <EmptyRow>Raw RPC detail is unavailable for this indexed transaction.</EmptyRow>
        )}
      </Section>
    </div>
  );
}

function Section({ title, description, children }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
      <div className="border-b border-white/10 px-4 py-4 sm:px-5">
        <h2 className="font-semibold text-white">{title}</h2>
        {description ? <p className="mt-1 text-xs leading-5 text-gray-500">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function DetailRow({ label, children }) {
  return (
    <div className="grid gap-2 border-b border-white/10 px-4 py-3.5 last:border-b-0 sm:grid-cols-[11rem_minmax(0,1fr)] sm:px-5">
      <div className="text-xs font-medium text-gray-500">{label}</div>
      <div className="min-w-0 break-words text-sm text-gray-300">{children}</div>
    </div>
  );
}

function IdentityLink({ address, label }) {
  return (
    <div className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/10 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-600">{label}</div>
      <Link to={`/explorer/account/${address}`} className="mt-1 block break-all font-mono text-xs leading-5 text-aeko-accent hover:text-white hover:underline">
        {address}
      </Link>
    </div>
  );
}

function AddressValue({ address, compact = false }) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <Link
        to={`/explorer/account/${address}`}
        className={`min-w-0 break-all font-mono text-aeko-accent hover:text-white hover:underline ${compact ? 'text-xs' : 'text-sm'}`}
      >
        {address}
      </Link>
      <CopyButton value={address} label="Copy address" compact />
    </div>
  );
}

function CopyableCode({ value, label }) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <code className="min-w-0 flex-1 break-all rounded-lg border border-white/10 bg-black/15 px-3 py-2 font-mono text-xs text-gray-300">
        {value}
      </code>
      <CopyButton value={value} label={label} compact />
    </div>
  );
}

function BalanceColumn({ label, value }) {
  return (
    <div className="lg:text-right">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-600 lg:hidden">{label}</div>
      <div className="mt-1 font-mono text-xs text-gray-300 lg:mt-0">{value != null ? formatLamports(value) : '—'}</div>
    </div>
  );
}

function BalanceDeltaColumn({ pre, post }) {
  const delta = lamportDelta(pre, post);
  return (
    <div className="lg:text-right">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-600 lg:hidden">Change</div>
      <div className={`mt-1 font-mono text-xs lg:mt-0 ${delta?.startsWith('+') ? 'text-emerald-300' : delta?.startsWith('-') ? 'text-red-300' : 'text-gray-400'}`}>
        {delta ?? '—'}
      </div>
    </div>
  );
}

function TokenBalanceCell({ label, raw, ui, decimals }) {
  return (
    <div className="lg:text-right">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-600">{label}</div>
      <div className="mt-1 font-mono text-xs text-gray-300">
        {ui ?? (raw != null ? formatTokenAmount(raw, decimals) : '—')}
      </div>
    </div>
  );
}

function TokenDeltaCell({ change }) {
  const delta = integerDelta(change.preAmount, change.postAmount);
  const formatted = delta == null ? null : formatSignedTokenDelta(delta, change.decimals);
  return (
    <div className="lg:text-right">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-600">Change</div>
      <div className={`mt-1 font-mono text-xs ${formatted?.startsWith('+') ? 'text-emerald-300' : formatted?.startsWith('-') ? 'text-red-300' : 'text-gray-400'}`}>
        {formatted ?? '—'}
      </div>
    </div>
  );
}

function EmptySection({ icon, title, body }) {
  return (
    <section className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-5 py-12 text-center">
      {createElement(icon, { className: 'mx-auto size-6 text-gray-600', 'aria-hidden': true })}
      <h2 className="mt-3 font-semibold text-gray-300">{title}</h2>
      <p className="mx-auto mt-1 max-w-xl text-sm leading-6 text-gray-500">{body}</p>
    </section>
  );
}

function EmptyRow({ children }) {
  return <div className="px-4 py-8 text-sm text-gray-500 sm:px-5">{children}</div>;
}

function Notice({ tone, children }) {
  const styles = tone === 'error'
    ? 'border-red-400/20 bg-red-400/10 text-red-200'
    : tone === 'warning'
      ? 'border-amber-400/20 bg-amber-400/10 text-amber-200'
      : 'border-sky-400/20 bg-sky-400/10 text-sky-200';
  return <div role={tone === 'error' ? 'alert' : 'status'} className={`mb-6 rounded-2xl border p-4 text-sm leading-6 ${styles}`}>{children}</div>;
}

function Badge({ accent = false, children }) {
  return (
    <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${accent ? 'border-aeko-accent/25 bg-aeko-accent/10 text-aeko-accent' : 'border-white/10 bg-white/[0.04] text-gray-400'}`}>
      {children}
    </span>
  );
}

function MutedValue({ children }) {
  return <span className="text-gray-600">{children}</span>;
}

function Subheading({ children }) {
  return <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-600">{children}</div>;
}

function JsonInline({ value }) {
  return <code className="break-all font-mono text-xs text-red-200">{JSON.stringify(value)}</code>;
}

function JsonBlock({ value }) {
  return (
    <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/25 p-4 font-mono text-xs leading-5 text-gray-300">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function formatInteger(value) {
  if (value == null || value === '') return '—';
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toLocaleString('en-US') : String(value);
}

function formatTimestamp(unixSeconds) {
  if (unixSeconds == null) return 'Not reported';
  const numeric = Number(unixSeconds);
  if (!Number.isFinite(numeric)) return String(unixSeconds);
  const date = new Date(numeric * 1000);
  return `${date.toLocaleString()} · ${date.toISOString()}`;
}

function toBigInt(value) {
  if (value == null || value === '') return null;
  try {
    return BigInt(String(value));
  } catch {
    return null;
  }
}

function formatLamports(value) {
  const raw = toBigInt(value);
  if (raw == null) return '—';
  const sign = raw < 0n ? '-' : '';
  const absolute = raw < 0n ? -raw : raw;
  const whole = absolute / 1_000_000_000n;
  const fraction = (absolute % 1_000_000_000n).toString().padStart(9, '0').replace(/0+$/, '');
  return `${sign}${whole.toLocaleString('en-US')}${fraction ? `.${fraction}` : ''} AEKO`;
}

function integerDelta(before, after) {
  const pre = toBigInt(before);
  const post = toBigInt(after);
  if (pre == null || post == null) return null;
  return post - pre;
}

function lamportDelta(before, after) {
  const delta = integerDelta(before, after);
  if (delta == null) return null;
  const prefix = delta > 0n ? '+' : '';
  return prefix + formatLamports(delta);
}

function formatTokenAmount(rawValue, decimals = 0) {
  const raw = toBigInt(rawValue);
  if (raw == null) return String(rawValue ?? '—');
  const places = Number.isInteger(decimals) ? Math.max(0, decimals) : 0;
  if (places === 0) return raw.toLocaleString('en-US');
  const negative = raw < 0n;
  const absolute = negative ? -raw : raw;
  const base = 10n ** BigInt(places);
  const whole = absolute / base;
  const fraction = (absolute % base).toString().padStart(places, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole.toLocaleString('en-US')}${fraction ? `.${fraction}` : ''}`;
}

function formatSignedTokenDelta(delta, decimals = 0) {
  const prefix = delta > 0n ? '+' : '';
  return prefix + formatTokenAmount(delta, decimals);
}

function humanizeSource(source) {
  return source === 'lookupTable' ? 'address lookup table' : source;
}

function shortIdentity(value) {
  if (!value || value.length <= 16) return value || '—';
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}
