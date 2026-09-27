import { AlertTriangle, CheckCircle2, Droplets, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  getFundingPolicy,
  getFundingRequestStatus,
  requestFundingApproval,
} from '../utils/aekoRpcClient';

const ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const TERMINAL_STATUSES = new Set(['confirmed', 'rejected', 'failed', 'reconciliation_required']);

function statusCopy(request) {
  if (!request) return '';
  switch (request.status) {
    case 'pending':
      return `${request.amountAeko} AEKO requested. Waiting for operator review.`;
    case 'processing':
      return 'The operator approved this request and settlement is being prepared.';
    case 'submitted':
      return 'The transfer was submitted to the chain and is waiting for confirmation.';
    case 'confirmed':
      return `${request.amountAeko} AEKO was confirmed on-chain.`;
    case 'rejected':
      return request.errorMessage || 'The operator rejected this funding request.';
    case 'failed':
      return request.errorMessage || 'The funding transaction failed on-chain.';
    case 'reconciliation_required':
      return 'Settlement was interrupted before its transaction signature was durably recorded. The operator must reconcile it; no automatic retry will occur.';
    default:
      return `Funding request status: ${request.status}`;
  }
}

export default function TestnetFundingRequest({ explorerApiUrl }) {
  const [policy, setPolicy] = useState(null);
  const [policyError, setPolicyError] = useState('');
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [request, setRequest] = useState(null);
  const [resultError, setResultError] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (!explorerApiUrl) {
      setPolicy(null);
      setPolicyError('Test funding is not set up for this network.');
      return () => {
        cancelled = true;
      };
    }

    setPolicyError('');
    getFundingPolicy(explorerApiUrl)
      .then((nextPolicy) => {
        if (!cancelled) setPolicy(nextPolicy);
      })
      .catch((error) => {
        if (!cancelled) {
          setPolicy(null);
          setPolicyError(error.message || String(error));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [explorerApiUrl]);

  useEffect(() => {
    if (!request?.id || TERMINAL_STATUSES.has(request.status) || !explorerApiUrl) return undefined;

    let cancelled = false;
    const refresh = async () => {
      try {
        const next = await getFundingRequestStatus(explorerApiUrl, request.id);
        if (!cancelled) {
          setRequest(next);
          setResultError('');
        }
      } catch (error) {
        if (!cancelled) setResultError(error.message || String(error));
      }
    };

    const initial = window.setTimeout(() => {
      void refresh();
    }, 1500);
    const timer = window.setInterval(() => {
      void refresh();
    }, 4000);

    return () => {
      cancelled = true;
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [explorerApiUrl, request?.id, request?.status]);

  const valid = ADDRESS_RE.test(address.trim());

  async function submit(event) {
    event.preventDefault();
    if (!valid || !explorerApiUrl || !policy?.enabled) return;

    setBusy(true);
    setRequest(null);
    setResultError('');
    try {
      const created = await requestFundingApproval(explorerApiUrl, address.trim());
      setRequest(created);
    } catch (error) {
      setResultError(error.message || String(error));
    } finally {
      setBusy(false);
    }
  }

  const requestFailed = request && ['rejected', 'failed', 'reconciliation_required'].includes(request.status);
  const requestConfirmed = request?.status === 'confirmed';

  return (
    <section className="mb-10 overflow-hidden rounded-2xl border border-aeko-accent/30 bg-gradient-to-br from-aeko-accent/[0.08] via-white/[0.025] to-transparent">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <div className="p-6 sm:p-8">
          <div className="mb-5 flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-aeko-accent/30 bg-aeko-accent/10">
              <Droplets size={19} className="text-aeko-accent" />
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.16em] text-aeko-accent">Testnet Funding</div>
              <h2 className="mt-1 text-2xl font-bold text-white">Get test AEKO</h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-400">
                Submit a testnet wallet address for operator review. A request only becomes a grant after the server submits the transfer and Aeko Scan observes on-chain confirmation.
              </p>
            </div>
          </div>

          {policy && !policy.enabled ? (
            <div className="mb-4 flex gap-2 rounded-xl border border-amber-400/25 bg-amber-400/10 p-3 text-sm text-amber-100">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              Testnet funding is currently paused by the operator.
            </div>
          ) : null}

          {policyError ? (
            <div className="mb-4 flex gap-2 rounded-xl border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-100">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              {policyError}
            </div>
          ) : null}

          <form onSubmit={submit} className="space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.12em] text-gray-500">Your AEKO wallet address</span>
              <input
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                placeholder="Paste a base58 AEKO testnet address"
                spellCheck={false}
                autoComplete="off"
                className="min-h-[48px] w-full rounded-xl border border-white/10 bg-black/30 px-4 font-mono text-sm text-white outline-none transition focus:border-aeko-accent"
              />
            </label>
            {address && !valid ? (
              <div className="text-xs text-red-300">That does not look like a valid AEKO base58 address.</div>
            ) : null}
            <button
              type="submit"
              disabled={busy || !valid || !policy?.enabled || Boolean(request && !TERMINAL_STATUSES.has(request.status))}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-aeko-accent px-5 text-sm font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Droplets size={15} />}
              {busy ? 'Submitting…' : policy ? `Request ${policy.amountAeko} AEKO` : 'Loading funding policy…'}
            </button>
          </form>

          {request ? (
            <div className={`mt-4 rounded-xl border p-4 text-sm ${
              requestFailed
                ? 'border-amber-400/25 bg-amber-500/10 text-amber-100'
                : requestConfirmed
                  ? 'border-green-400/25 bg-green-500/10 text-green-100'
                  : 'border-aeko-accent/25 bg-aeko-accent/[0.07] text-gray-100'
            }`}>
              <div className="flex items-start gap-2">
                {requestConfirmed ? (
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                ) : requestFailed ? (
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                ) : (
                  <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin" />
                )}
                <div className="min-w-0">
                  <div className="font-medium capitalize">{request.status.replaceAll('_', ' ')}</div>
                  <div className="mt-1 text-xs leading-relaxed opacity-80">{statusCopy(request)}</div>
                  <div className="mt-2 break-all font-mono text-[11px] text-gray-400">Request {request.id}</div>
                  {request.signature ? (
                    <div className="mt-1 break-all font-mono text-[11px] text-gray-400">Transaction {request.signature}</div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {resultError ? (
            <div className="mt-4 rounded-xl border border-red-400/25 bg-red-500/10 p-4 text-sm text-red-100">
              {resultError}
            </div>
          ) : null}
        </div>

        <aside className="border-t border-white/10 bg-black/20 p-6 sm:p-8 lg:border-l lg:border-t-0">
          <div className="text-sm font-semibold text-white">Funding policy</div>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">
            Public requests have a fixed request amount, wallet cooldown and daily allocation. Submitted transfers remain reserved until they are confirmed or fail.
          </p>
          <div className="mt-5 grid gap-3">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-[10px] uppercase tracking-[0.14em] text-gray-600">Per request</div>
              <div className="mt-1 text-lg font-semibold text-aeko-accent">{policy ? `${policy.amountAeko} AEKO` : '—'}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-[10px] uppercase tracking-[0.14em] text-gray-600">Per wallet</div>
              <div className="mt-1 text-sm font-semibold text-white">{policy ? `Every ${policy.cooldownHours} h` : '—'}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-[10px] uppercase tracking-[0.14em] text-gray-600">Remaining today</div>
              <div className="mt-1 text-sm font-semibold text-white">{policy ? `${Number(policy.dailyRemainingAeko).toLocaleString()} AEKO` : '—'}</div>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
