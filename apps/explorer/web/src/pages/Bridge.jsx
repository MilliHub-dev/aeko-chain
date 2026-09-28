import { ArrowRight, Construction, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Bridge() {
  return (
    <div className="pt-24 pb-32">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 sm:p-12">
          <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-400/25 bg-amber-400/10">
            <Construction className="text-amber-300" size={22} />
          </div>
          <div className="text-xs font-medium uppercase tracking-[0.18em] text-gray-500">Bridge</div>
          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Cross-chain transfers are not available yet</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-gray-400">
            Aeko Scan does not currently have a verified bridge runtime or transfer API. This page will stay disabled until the chain-side bridge, wallet signing flow, fee calculation, route discovery, and settlement verification are implemented end to end.
          </p>

          <div className="mt-8 flex items-start gap-3 rounded-2xl border border-white/10 bg-black/20 p-5">
            <ShieldAlert className="mt-0.5 shrink-0 text-aeko-accent" size={18} />
            <p className="text-sm leading-6 text-gray-400">
              No balances, fees, exchange rates, supported routes, or transfer estimates are simulated here. Use Aeko Scan for live chain data while bridge support is under development.
            </p>
          </div>

          <Link
            to="/explorer"
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-gray-200"
          >
            Open Aeko Scan
            <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </div>
  );
}
