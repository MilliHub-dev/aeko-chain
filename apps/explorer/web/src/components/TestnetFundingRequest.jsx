import { AlertTriangle, CheckCircle2, Droplets, ExternalLink, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getFundingPolicy, requestFundingApproval } from '../utils/aekoRpcClient';

const ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export default function TestnetFundingRequest({ fundingUrl }) {
  const [policy, setPolicy] = useState(
    /** @type {{ enabled: boolean, amountAeko: number, cooldownHours: number, dailyBudgetAeko: number, dailyRemainingAeko: number } | null} */ (null),
  );
  const [policyError, setPolicyError] = useState('');
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(
    /** @type {{ kind: 'success' | 'error', message: string, requestId?: string, explorerUrl?: string } | null} */ (null),
  );

  useEffect(() => {
    let cancelled = false;

    if (!fundingUrl) {
      setPolicy(null);
      setPolicyError('The Testnet Funding endpoint is not configured for this deployment.');
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

  const valid = ADDRESS_RE.test(address.trim());

  async function submit(event) {
    event.preventDefault();
    if (!valid || !fundingUrl || !policy?.enabled) return;

    setBusy(true);
    setResult(null);
    try {
      const request = await requestFundingApproval(fundingUrl, address.trim());
      setResult({
        kind: 'success',
        message: `${request.amountAeko} AEKO funding request submitted for operator approval.`,
        requestId: request.id,
        explorerUrl: request.explorerUrl,
      });
    } catch (error) {
      setResult({ kind: 'error', message: error.message || String(error) });
    } finally {
      setBusy(false);
    }
  }

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
                Paste any AEKO testnet wallet address. This creates a pending funding request for the operator to review and release from the Admin Console. Network Console airdrops are a separate developer flow.
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
              disabled={busy || !valid || !policy?.enabled}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-aeko-accent px-5 text-sm font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Droplets size={15} />}
              {busy ? 'Submitting…' : policy ? `Request ${policy.amountAeko} AEKO` : 'Loading funding policy…'}
            </button>
          </form>

          {result ? (
            <div className={`mt-4 rounded-xl border p-4 text-sm ${result.kind === 'success' ? 'border-green-400/25 bg-green-500/10 text-green-100' : 'border-red-400/25 bg-red-500/10 text-red-100'}`}>
              <div className="flex items-start gap-2">
                {result.kind === 'success' ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
                <div className="min-w-0">
                  <div>{result.message}</div>
                  {result.requestId ? <div className="mt-2 break-all font-mono text-[11px] text-gray-300">Request {result.requestId}</div> : null}
                  {result.explorerUrl ? (
                    <a href={result.explorerUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-aeko-accent hover:underline">
                      View wallet on Explorer <ExternalLink size={11} />
                    </a>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <aside className="border-t border-white/10 bg-black/20 p-6 sm:p-8 lg:border-l lg:border-t-0">
          <div className="text-sm font-semibold text-white">Funding policy</div>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">
            The public Funding Gateway controls request size and abuse limits. Requests remain pending until an operator approves them; only the server can reach the private Faucet Daemon.
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
