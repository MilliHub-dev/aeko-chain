import { AlertTriangle, CheckCircle2, Droplets, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  getFundingPolicy,
  getFundingRequestStatus,
  requestFundingApproval,
} from '../utils/aekoRpcClient';

const ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const TERMINAL_STATUSES = new Set(['confirmed', 'rejected', 'failed']);

function requestMessage(request) {
  switch (request?.status) {
    case 'pending':
      return 'Request received. It is waiting for an Admin decision.';
    case 'processing':
      return 'Admin approved the grant and settlement started. No action is required from you.';
    case 'submitted':
      return 'Admin approved the grant. The transfer was submitted and is awaiting chain confirmation.';
    case 'confirmed':
      return `${request.amountAeko} AEKO grant confirmed on-chain.`;
    case 'rejected':
      return 'The Admin rejected this funding request.';
    case 'failed':
      return 'The approved grant transfer failed on-chain. No confirmed grant was recorded.';
    default:
      return 'Funding request status is being checked.';
  }
}

export default function TestnetFundingRequest({ fundingUrl }) {
  const [policy, setPolicy] = useState(
    /** @type {{ enabled: boolean, amountAeko: number, cooldownHours: number, dailyBudgetAeko: number, dailyRemainingAeko: number } | null} */ (null),
  );
  const [policyError, setPolicyError] = useState('');
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [request, setRequest] = useState(
    /** @type {{ id: string, amountAeko: number, status: string, signature?: string | null, confirmed?: boolean, errorCode?: string | null } | null} */ (null),
  );
  const [requestError, setRequestError] = useState('');

  useEffect(() => {
    let cancelled = false;

    if (!fundingUrl) {
      setPolicy(null);
      setPolicyError('Test AEKO is temporarily unavailable. Please try again later.');
      return () => {
        cancelled = true;
      };
    }

    setPolicyError('');
    getFundingPolicy(fundingUrl)
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
  }, [fundingUrl]);

  useEffect(() => {
    if (!fundingUrl || !request?.id || TERMINAL_STATUSES.has(request.status)) return undefined;

    let cancelled = false;
    let timer;

    async function refreshStatus() {
      try {
        const next = await getFundingRequestStatus(fundingUrl, request.id);
        if (cancelled) return;
        setRequest(next);
        setRequestError('');
        if (!TERMINAL_STATUSES.has(next.status)) {
          timer = globalThis.setTimeout(refreshStatus, 4_000);
        }
      } catch (error) {
        if (cancelled) return;
        setRequestError(error.message || String(error));
        timer = globalThis.setTimeout(refreshStatus, 8_000);
      }
    }

    timer = globalThis.setTimeout(refreshStatus, 2_000);
    return () => {
      cancelled = true;
      if (timer) globalThis.clearTimeout(timer);
    };
  }, [fundingUrl, request?.id, request?.status]);

  const valid = ADDRESS_RE.test(address.trim());

  async function submit(event) {
    event.preventDefault();
    if (!valid || !fundingUrl || !policy?.enabled) return;

    setBusy(true);
    setRequest(null);
    setRequestError('');
    try {
      const created = await requestFundingApproval(fundingUrl, address.trim());
      setRequest(created);
    } catch (error) {
      setRequestError(error.message || String(error));
    } finally {
      setBusy(false);
    }
  }

  const requestSucceeded = request?.status === 'confirmed';
  const requestFailed = request?.status === 'rejected' || request?.status === 'failed';

  return (
    <section className="mb-10 overflow-hidden rounded-2xl border border-aeko-accent/30 bg-gradient-to-br from-aeko-accent/[0.08] via-white/[0.025] to-transparent">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <div className="p-6 sm:p-8">
          <div className="mb-5 flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-aeko-accent/30 bg-aeko-accent/10">
              <Droplets size={19} className="text-aeko-accent" />
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.16em] text-aeko-accent">Test funding request</div>
              <h2 className="mt-1 text-2xl font-bold text-white">Request test AEKO</h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-400">
                Enter your Testnet wallet address to request test AEKO. You can leave this page open to follow the request until it is approved, rejected, or confirmed.
              </p>
            </div>
          </div>

          {policy && !policy.enabled ? (
            <div className="mb-4 flex gap-2 rounded-xl border border-amber-400/25 bg-amber-400/10 p-3 text-sm text-amber-100">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              Public test funding is currently paused by the Admin.
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
                placeholder="Paste a base58 AEKO test-network address"
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
              disabled={busy || !valid || !policy?.enabled}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-aeko-accent px-5 text-sm font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Droplets size={15} />}
              {busy ? 'Submitting…' : policy ? `Request ${policy.amountAeko} AEKO` : 'Loading funding policy…'}
            </button>
          </form>

          {request ? (
            <div
              className={`mt-4 rounded-xl border p-4 text-sm ${
                requestSucceeded
                  ? 'border-green-400/25 bg-green-500/10 text-green-100'
                  : requestFailed
                    ? 'border-red-400/25 bg-red-500/10 text-red-100'
                    : 'border-amber-400/25 bg-amber-400/10 text-amber-100'
              }`}
            >
              <div className="flex items-start gap-2">
                {requestSucceeded ? (
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                ) : requestFailed ? (
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                ) : (
                  <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin" />
                )}
                <div className="min-w-0">
                  <div>{requestMessage(request)}</div>
                  <div className="mt-2 break-all font-mono text-[11px] text-gray-300">
                    Request {request.id}
                  </div>
                  {request.signature ? (
                    <div className="mt-1 break-all font-mono text-[11px] text-gray-400">
                      Transaction {request.signature}
                    </div>
                  ) : null}
                  {request.errorCode && !requestFailed ? (
                    <div className="mt-1 text-xs text-amber-200/80">
                      Settlement observation: {request.errorCode}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {requestError ? (
            <div className="mt-4 flex gap-2 rounded-xl border border-red-400/25 bg-red-500/10 p-4 text-sm text-red-100">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <div>
                <div>{requestError}</div>
                {request?.id ? (
                  <div className="mt-1 text-xs text-red-100/70">
                    Your request id is retained and status checks will retry automatically.
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <aside className="border-t border-white/10 bg-black/20 p-6 sm:p-8 lg:border-l lg:border-t-0">
          <div className="text-sm font-semibold text-white">Grant policy</div>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">
            Requests use the published Testnet funding policy. Limits and settlement checks are enforced automatically before test AEKO is released.
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
