import {
  ChevronDown,
  FileCode2,
  Loader2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Trash2,
  WalletCards,
} from 'lucide-react';
import { createElement, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import NetworkToggle from '../../../components/NetworkToggle';
import {
  formatAeko,
} from '../../../utils/aekoRpcClient';
import {
  shortAddress,
} from '../../../utils/aekoTestKeypair';
import EditorTerminal from '../shell/EditorTerminal';
import { cx } from './helpers';

export function ActionButton({ icon, label, onClick, disabled = false, primary = false, busy = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className={cx(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aeko-accent focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090d]',
        primary
          ? 'border-aeko-accent bg-aeko-accent text-black hover:bg-white'
          : 'border-white/10 bg-white/[0.04] text-gray-200 hover:border-white/20 hover:bg-white/[0.08]',
        (disabled || busy) && 'cursor-not-allowed opacity-45',
      )}
    >
      {busy
        ? <Loader2 size={16} className="animate-spin motion-reduce:animate-none" />
        : createElement(icon, { size: 16 })}
      <span>{label}</span>
    </button>
  );
}

export function PanelHeader({ title, action = null }) {
  return (
    <div className="flex h-11 items-center justify-between border-b border-white/10 px-3">
      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">{title}</span>
      {action}
    </div>
  );
}

export function FileTree({ project, onOpen, onCreate, onRename, onDelete }) {
  const groups = useMemo(() => {
    const result = new Map();
    for (const file of [...project.files].sort((a, b) => a.path.localeCompare(b.path))) {
      const [root] = file.path.split('/');
      const items = result.get(root) || [];
      items.push(file);
      result.set(root, items);
    }
    return Array.from(result.entries());
  }, [project.files]);

  return (
    <div className="min-h-0 flex-1 overflow-auto py-2">
      {groups.map(([folder, files]) => (
        <div key={folder} className="mb-2">
          <div className="flex h-8 items-center gap-2 px-3 text-xs font-semibold text-gray-400">
            <ChevronDown size={13} />
            <span>{folder}</span>
          </div>
          {files.map((file) => (
            <div
              key={file.path}
              className={cx(
                'group flex h-9 items-center gap-2 border-l-2 pr-1 text-sm',
                project.activeFile === file.path
                  ? 'border-aeko-accent bg-white/[0.07] text-white'
                  : 'border-transparent text-gray-400 hover:bg-white/[0.04] hover:text-gray-200',
              )}
            >
              <button
                type="button"
                onClick={() => onOpen(file.path)}
                className="flex min-w-0 flex-1 items-center gap-2 px-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-aeko-accent"
              >
                <FileCode2 size={14} className="shrink-0 text-aeko-accent/80" />
                <span className="truncate">{file.path.split('/').slice(1).join('/')}</span>
              </button>
              {file.path !== 'src/lib.rs' ? (
                <div className="hidden items-center group-hover:flex group-focus-within:flex">
                  <button
                    type="button"
                    aria-label={`Rename ${file.path}`}
                    onClick={() => onRename(file.path)}
                    className="rounded p-2 text-gray-500 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aeko-accent"
                  >
                    <MoreHorizontal size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${file.path}`}
                    onClick={() => onDelete(file.path)}
                    className="rounded p-2 text-gray-500 hover:bg-red-500/10 hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ))}
      <button
        type="button"
        onClick={onCreate}
        className="mx-2 flex min-h-10 w-[calc(100%-1rem)] items-center gap-2 rounded-md px-3 text-sm text-gray-500 hover:bg-white/[0.04] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aeko-accent"
      >
        <Plus size={14} />
        New Rust file
      </button>
    </div>
  );
}

export function CodeEditor({ path, value, onChange, onSave }) {
  const gutterRef = useRef(null);
  const lineCount = Math.max(1, value.split('\n').length);
  const lineNumbers = Array.from({ length: lineCount }, (_, index) => index + 1).join('\n');

  const handleKeyDown = (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      onSave();
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      const target = event.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const next = `${value.slice(0, start)}  ${value.slice(end)}`;
      onChange(next);
      requestAnimationFrame(() => {
        target.selectionStart = target.selectionEnd = start + 2;
      });
    }
  };

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden bg-[#09090d]">
      <div className="absolute inset-0 flex">
        <pre
          ref={gutterRef}
          aria-hidden="true"
          className="w-14 shrink-0 overflow-hidden border-r border-white/[0.06] bg-black/20 py-4 pr-3 text-right font-mono text-[13px] leading-6 text-gray-700"
        >
          {lineNumbers}
        </pre>
        <textarea
          aria-label={`Rust editor for ${path}`}
          value={value}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onScroll={(event) => {
            if (gutterRef.current) gutterRef.current.scrollTop = event.currentTarget.scrollTop;
          }}
          className="min-w-0 flex-1 resize-none overflow-auto bg-transparent p-4 font-mono text-[13px] leading-6 text-gray-200 caret-aeko-accent outline-none selection:bg-aeko-accent/25"
        />
      </div>
    </div>
  );
}

export function OutputPanel({
  tab,
  setTab,
  buildResult,
  testResult,
  deploymentLog,
  job,
  network,
  config,
  wallet,
  onTransactionConfirmed,
}) {
  const tabs = [
    ['problems', 'Problems'],
    ['build', 'Build'],
    ['tests', 'Tests'],
    ['terminal', 'Terminal'],
    ['logs', 'Deploy logs'],
  ];
  const content = (() => {
    if (tab === 'problems') {
      const diagnostics = buildResult?.diagnostics || [];
      if (!diagnostics.length) return 'No compiler diagnostics.';
      return diagnostics.map((item) => `[${item.level}] ${item.message}`).join('\n');
    }
    if (tab === 'build') {
      if (!buildResult) return 'Run Build to compile this project with the AEKO SBF toolchain.';
      return [buildResult.stdout, buildResult.stderr].filter(Boolean).join('\n') || 'Build completed without textual output.';
    }
    if (tab === 'tests') {
      if (!testResult) return 'Run Test to execute the project test suite in the isolated runner.';
      return [testResult.stdout, testResult.stderr].filter(Boolean).join('\n') || 'Tests completed without textual output.';
    }
    if (tab === 'logs') {
      return deploymentLog.length
        ? deploymentLog.map((entry) => `[${entry.time}] ${entry.message}`).join('\n')
        : 'Deploy and upgrade progress will appear here.';
    }
    return '';
  })();

  return (
    <section className="flex h-52 min-h-40 flex-col border-t border-white/10 bg-[#0b0b10]">
      <div className="flex h-10 items-center gap-1 overflow-x-auto border-b border-white/10 px-2">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cx(
              'h-10 shrink-0 border-b-2 px-3 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-aeko-accent',
              tab === id ? 'border-aeko-accent text-white' : 'border-transparent text-gray-500 hover:text-gray-300',
            )}
          >
            {label}
          </button>
        ))}
        {job?.status === 'running' ? (
          <div className="ml-auto flex items-center gap-2 px-2 text-xs text-gray-400" role="status" aria-live="polite">
            <Loader2 size={13} className="animate-spin motion-reduce:animate-none" />
            <span>{job.label}</span>
            <button
              type="button"
              onClick={() => job.controller?.abort()}
              className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-gray-300 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aeko-accent"
            >
              Cancel
            </button>
          </div>
        ) : null}
      </div>
      {tab === 'terminal' ? (
        <EditorTerminal
          network={network}
          rpcUrl={config.rpcUrl}
          explorerUrl={config.explorerUrl}
          wallet={wallet}
          onTransactionConfirmed={onTransactionConfirmed}
        />
      ) : (
        <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-xs leading-5 text-gray-400">
          {content}
        </pre>
      )}
    </section>
  );
}

export function ContextPanel({
  network,
  config,
  capabilities,
  wallet,
  wallets,
  walletId,
  setWalletId,
  onCreateWallet,
  balance,
  onRefreshBalance,
  onFund,
  fundingBusy,
  buildResult,
  deployment,
  recoverableBuffer,
  onRecoverBuffer,
  onRequestCloseProgram,
  lifecycleBusy,
}) {
  return (
    <aside className="flex min-h-0 flex-col bg-[#0b0b10]">
      <PanelHeader title="Runtime" />
      <div className="space-y-5 overflow-auto p-4">
        <section>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-600">Network</div>
          <NetworkToggle />
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="text-gray-500">Editor lifecycle</span>
            <span className={capabilities.enabled ? 'text-emerald-300' : 'text-amber-300'}>
              {capabilities.enabled ? 'Runner ready' : 'Runner unavailable'}
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
              onClick={onRefreshBalance}
              aria-label="Refresh wallet balance"
              className="rounded p-2 text-gray-500 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aeko-accent"
            >
              <RefreshCw size={14} />
            </button>
          </div>
          {wallets.length ? (
            <>
              <label className="sr-only" htmlFor="editor-wallet">Development wallet</label>
              <select
                id="editor-wallet"
                value={walletId}
                onChange={(event) => setWalletId(event.target.value)}
                className="min-h-11 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-gray-200 outline-none focus:border-aeko-accent"
              >
                {wallets.map((item) => (
                  <option key={item.id} value={item.id}>{item.name} · {shortAddress(item.address)}</option>
                ))}
              </select>
              <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
                <div className="font-mono text-xs text-gray-300">{shortAddress(wallet?.address)}</div>
                <div className="mt-1 text-sm font-semibold text-white">{formatAeko(balance)}</div>
              </div>
              {network !== 'mainnet' && (config.fundingEnabled || config.key === 'localnet') ? (
                <button
                  type="button"
                  onClick={onFund}
                  disabled={fundingBusy}
                  className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-white/10 text-sm text-gray-300 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aeko-accent disabled:opacity-50"
                >
                  {fundingBusy ? <Loader2 size={15} className="animate-spin motion-reduce:animate-none" /> : <WalletCards size={15} />}
                  Fund with Test AEKO
                </button>
              ) : null}
              <p className="mt-2 text-[11px] leading-4 text-gray-600">
                Development wallets are stored unencrypted in this browser. Never use them for valuable funds.
              </p>
            </>
          ) : (
            <button
              type="button"
              onClick={onCreateWallet}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-aeko-accent/40 bg-aeko-accent/10 text-sm text-aeko-accent hover:bg-aeko-accent/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aeko-accent"
            >
              <Plus size={15} />
              Create development wallet
            </button>
          )}
        </section>

        <section className="border-t border-white/10 pt-4">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-600">Artifact</div>
          {buildResult?.artifact ? (
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between gap-3">
                <span className="text-gray-500">SBF</span>
                <span className="text-emerald-300">Built</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-gray-500">Size</span>
                <span className="text-gray-300">{buildResult.artifact.byteLength.toLocaleString()} bytes</span>
              </div>
              <div className="truncate font-mono text-[10px] text-gray-600" title={buildResult.artifact.sha256}>
                {buildResult.artifact.sha256}
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
              onClick={onRecoverBuffer}
              disabled={lifecycleBusy}
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
              <Link
                to={`/explorer/account/${deployment.programId}`}
                className="block truncate font-mono text-aeko-accent hover:text-white"
              >
                {deployment.programId}
              </Link>
              <Link
                to={`/explorer/tx/${deployment.signature}`}
                className="block truncate text-gray-500 hover:text-white"
              >
                tx {shortAddress(deployment.signature)}
              </Link>
              {network !== 'mainnet' ? (
                <button
                  type="button"
                  onClick={onRequestCloseProgram}
                  disabled={lifecycleBusy}
                  className="mt-2 min-h-10 w-full rounded-lg border border-red-500/20 px-3 text-xs font-medium text-red-300 hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:opacity-50"
                >
                  Close program and recover rent
                </button>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-gray-600">Nothing deployed from this project on {config.label} yet.</p>
          )}
        </section>
      </div>
    </aside>
  );
}
