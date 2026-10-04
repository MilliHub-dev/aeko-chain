import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Code2,
  Download,
  FileCode2,
  FlaskConical,
  FolderOpen,
  Hammer,
  Loader2,
  Menu,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Rocket,
  Save,
  Trash2,
  Upload,
  WalletCards,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import NetworkToggle from '../components/NetworkToggle';
import { useNetwork } from '../components/NetworkContext';
import {
  aekoToLamports,
  confirmSignature,
  formatAeko,
  getBalance,
  getFundingPolicy,
  requestAirdrop,
  requestConsoleAirdrop,
} from '../utils/aekoRpcClient';
import {
  generateTestWallet,
  loadWallets,
  saveWallets,
  shortAddress,
} from '../utils/aekoTestKeypair';
import {
  closeProgram,
  deployProgram,
  recoverProgramBuffer,
  upgradeProgram,
  validateProgramArtifactBase64,
} from '../utils/aekoProgramDeploy';
import {
  buildEditorProject,
  getEditorCapabilities,
  testEditorProject,
} from '../utils/editorApi';
import {
  createEmptyProject,
  createStarterProject,
  EDITOR_MAX_SOURCE_BYTES,
  deleteFile,
  exportProject,
  importProject,
  loadProjects,
  recordBuild,
  recordDeployment,
  removeDeployment,
  renameFile,
  saveProjects,
  setFileContent,
  upsertFile,
} from '../utils/editorProject';
import { getNetworkConfig } from '../utils/networkConfig';

const EMPTY_CAPABILITIES = {
  enabled: false,
  buildEnabled: false,
  testEnabled: false,
  deployEnabled: false,
  upgradeEnabled: false,
  mainnetDeployBlocked: true,
};

function cx(...values) {
  return values.filter(Boolean).join(' ');
}

function handleContainedDialogKeyDown(event, onClose) {
  if (event.key === 'Escape') {
    event.preventDefault();
    onClose();
    return;
  }
  if (event.key !== 'Tab') return;

  const focusable = Array.from(event.currentTarget.querySelectorAll(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
  ));
  if (!focusable.length) {
    event.preventDefault();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function ActionButton({ icon: Icon, label, onClick, disabled, primary = false, busy = false }) {
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
      {busy ? <Loader2 size={16} className="animate-spin motion-reduce:animate-none" /> : <Icon size={16} />}
      <span>{label}</span>
    </button>
  );
}

function PanelHeader({ title, action }) {
  return (
    <div className="flex h-11 items-center justify-between border-b border-white/10 px-3">
      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">{title}</span>
      {action}
    </div>
  );
}

function FileTree({ project, onOpen, onCreate, onRename, onDelete }) {
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

function CodeEditor({ path, value, onChange, onSave }) {
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

function OutputPanel({ tab, setTab, buildResult, testResult, deploymentLog, job }) {
  const tabs = [
    ['problems', 'Problems'],
    ['build', 'Build'],
    ['tests', 'Tests'],
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
    return deploymentLog.length
      ? deploymentLog.map((entry) => `[${entry.time}] ${entry.message}`).join('\n')
      : 'Deploy and upgrade progress will appear here.';
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
      <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-xs leading-5 text-gray-400">
        {content}
      </pre>
    </section>
  );
}

function ContextPanel({
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

function EditorDialog({ dialog, onClose, onSubmit }) {
  if (!dialog) return null;
  const isDelete = dialog.type === 'delete' || dialog.type === 'delete-project' || dialog.type === 'close-program';
  const title = {
    'new-project': 'New AEKO project',
    'new-file': 'New Rust file',
    rename: 'Rename Rust file',
    'rename-project': 'Rename project',
    delete: 'Delete source file',
    'delete-project': 'Delete project',
    'close-program': 'Close deployed program',
  }[dialog.type];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="presentation" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="editor-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => handleContainedDialogKeyDown(event, onClose)}
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#111118] p-5 shadow-2xl shadow-black/50"
      >
        <div className="flex items-center justify-between gap-4">
          <h2 id="editor-dialog-title" className="text-lg font-semibold text-white">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close dialog" className="rounded-lg p-2 text-gray-500 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aeko-accent">
            <X size={18} />
          </button>
        </div>
        {isDelete ? (
          <p className="mt-4 text-sm leading-6 text-gray-400">
            {dialog.type === 'close-program' ? 'Close ' : 'Delete '}
            <span className="font-mono text-gray-200">{dialog.path || dialog.value}</span>?
            {dialog.type === 'delete-project'
              ? ' This removes the browser-local project and its saved deployment history.'
              : dialog.type === 'close-program'
                ? ' This submits an irreversible loader Close transaction and returns the program rent to the selected development wallet.'
                : ' This removes the file from the local project.'}
          </p>
        ) : (
          <form
            className="mt-4"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const value = form.get('value');
              const template = form.get('template');
              onSubmit(String(value || ''), String(template || 'hello'));
            }}
          >
            <label htmlFor="editor-dialog-value" className="mb-2 block text-xs font-medium text-gray-400">
              {dialog.type === 'new-project' || dialog.type === 'rename-project' ? 'Project name' : 'Path'}
            </label>
            <input
              id="editor-dialog-value"
              name="value"
              autoFocus
              defaultValue={dialog.value || ''}
              placeholder={dialog.type === 'new-project' || dialog.type === 'rename-project' ? 'hello-aeko' : 'src/state.rs'}
              className="min-h-11 w-full rounded-lg border border-white/10 bg-black/30 px-3 font-mono text-sm text-white outline-none focus:border-aeko-accent focus:ring-1 focus:ring-aeko-accent"
            />
            {dialog.type === 'new-project' ? (
              <div className="mt-4">
                <label htmlFor="editor-project-template" className="mb-2 block text-xs font-medium text-gray-400">
                  Template
                </label>
                <select
                  id="editor-project-template"
                  name="template"
                  defaultValue="hello"
                  className="min-h-11 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-aeko-accent focus:ring-1 focus:ring-aeko-accent"
                >
                  <option value="hello">Hello AEKO starter</option>
                  <option value="empty">Empty native Rust program</option>
                </select>
              </div>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={onClose} className="min-h-11 rounded-lg px-4 text-sm text-gray-400 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aeko-accent">Cancel</button>
              <button type="submit" className="min-h-11 rounded-lg bg-aeko-accent px-4 text-sm font-semibold text-black hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aeko-accent">{dialog.type === 'rename' || dialog.type === 'rename-project' ? 'Rename' : 'Create'}</button>
            </div>
          </form>
        )}
        {isDelete ? (
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="min-h-11 rounded-lg px-4 text-sm text-gray-400 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aeko-accent">Cancel</button>
            <button type="button" autoFocus onClick={() => onSubmit(dialog.path || dialog.value)} className="min-h-11 rounded-lg bg-red-500 px-4 text-sm font-semibold text-white hover:bg-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400">
              {dialog.type === 'delete-project' ? 'Delete project' : dialog.type === 'close-program' ? 'Close program' : 'Delete file'}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function SmartContractEditor() {
  const { network } = useNetwork();
  const config = getNetworkConfig(network);
  const initialProjects = useMemo(() => {
    const stored = loadProjects();
    return stored.length ? stored : [createStarterProject()];
  }, []);
  const [projects, setProjects] = useState(initialProjects);
  const [projectId, setProjectId] = useState(initialProjects[0].id);
  const [capabilities, setCapabilities] = useState(EMPTY_CAPABILITIES);
  const [capabilityError, setCapabilityError] = useState('');
  const [buildResult, setBuildResult] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [job, setJob] = useState(null);
  const [outputTab, setOutputTab] = useState('build');
  const [deploymentLog, setDeploymentLog] = useState([]);
  const [deployBusy, setDeployBusy] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [notice, setNotice] = useState(null);
  const [mobilePanel, setMobilePanel] = useState(null);
  const [wallets, setWallets] = useState(() => loadWallets());
  const [walletId, setWalletId] = useState(() => loadWallets()[0]?.id || '');
  const [balance, setBalance] = useState(0);
  const [fundingBusy, setFundingBusy] = useState(false);
  const [recoverableBuffer, setRecoverableBuffer] = useState(null);
  const [saveState, setSaveState] = useState('saved');
  const importRef = useRef(null);

  const project = projects.find((item) => item.id === projectId) || projects[0];
  const activeFile = project.files.find((file) => file.path === project.activeFile) || project.files[0];
  const wallet = wallets.find((item) => item.id === walletId) || wallets[0] || null;
  const deployment = (project.deployments || []).find((item) => item.network === network) || null;

  const updateProject = (next) => {
    setProjects((current) => current.map((item) => (item.id === next.id ? next : item)));
  };

  useEffect(() => {
    setSaveState('saving');
    const timer = window.setTimeout(() => {
      saveProjects(projects);
      setSaveState('saved');
    }, 250);
    return () => window.clearTimeout(timer);
  }, [projects]);

  useEffect(() => {
    let active = true;
    setCapabilityError('');
    setCapabilities(EMPTY_CAPABILITIES);
    getEditorCapabilities(config.explorerApiUrl)
      .then((value) => {
        if (active) setCapabilities({ ...EMPTY_CAPABILITIES, ...value });
      })
      .catch((error) => {
        if (active) setCapabilityError(error.message);
      });
    return () => {
      active = false;
    };
  }, [config.explorerApiUrl]);

  const refreshBalance = async () => {
    if (!wallet?.address || !config.rpcUrl) {
      setBalance(0);
      return;
    }
    try {
      setBalance(await getBalance(config.rpcUrl, wallet.address));
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    }
  };

  useEffect(() => {
    refreshBalance();
    // wallet/network is the actual refresh boundary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet?.address, config.rpcUrl]);

  const persistNow = () => {
    saveProjects(projects);
    setSaveState('saved');
    setNotice({ type: 'success', message: 'Project saved in this browser.' });
  };

  const runBuild = async () => {
    if (!capabilities.buildEnabled) {
      setNotice({ type: 'error', message: capabilityError || 'The isolated AEKO compiler runner is unavailable.' });
      return;
    }
    const controller = new AbortController();
    setJob({ type: 'build', status: 'running', label: 'Building SBF…', controller });
    setOutputTab('build');
    setNotice(null);
    try {
      const result = await buildEditorProject(config.explorerApiUrl, project.files, { signal: controller.signal });
      setBuildResult(result);
      if (result.status !== 'succeeded' || !result.artifact?.base64) {
        throw new Error(result.stderr || 'AEKO SBF build failed.');
      }
      validateProgramArtifactBase64(result.artifact.base64);
      updateProject(recordBuild(project, result));
      setNotice({ type: 'success', message: `Build succeeded · ${result.artifact.byteLength.toLocaleString()} byte SBF artifact.` });
    } catch (error) {
      setBuildResult((current) => current || { status: 'failed', stdout: '', stderr: error.message, diagnostics: [] });
      setNotice({ type: 'error', message: error.message });
    } finally {
      setJob(null);
    }
  };

  const runTests = async () => {
    if (!capabilities.testEnabled) {
      setNotice({ type: 'error', message: capabilityError || 'The isolated AEKO test runner is unavailable.' });
      return;
    }
    const controller = new AbortController();
    setJob({ type: 'test', status: 'running', label: 'Running tests…', controller });
    setOutputTab('tests');
    setNotice(null);
    try {
      const result = await testEditorProject(config.explorerApiUrl, project.files, { signal: controller.signal });
      setTestResult(result);
      if (result.status !== 'succeeded') throw new Error(result.stderr || 'AEKO tests failed.');
      setNotice({
        type: 'success',
        message: `Tests passed${result.testSummary ? ` · ${result.testSummary.passed} passed` : ''}.`,
      });
    } catch (error) {
      setTestResult((current) => current || { status: 'failed', stdout: '', stderr: error.message });
      setNotice({ type: 'error', message: error.message });
    } finally {
      setJob(null);
    }
  };

  const logDeploy = (entry) => {
    setDeploymentLog((current) => [
      ...current,
      { time: new Date().toLocaleTimeString(), message: entry.message },
    ].slice(-250));
    setOutputTab('logs');
  };

  const deploy = async (upgrade = false) => {
    if (!buildResult?.artifact) {
      setNotice({ type: 'error', message: 'Build the current source successfully before deploying.' });
      return;
    }
    if (!wallet) {
      setNotice({ type: 'error', message: 'Create or select a development wallet first.' });
      return;
    }
    if (!capabilities.deployEnabled || network === 'mainnet') {
      setNotice({ type: 'error', message: 'Browser deployment is available only on AEKO Testnet/local development.' });
      return;
    }
    setDeployBusy(true);
    setNotice(null);
    try {
      const result = upgrade && deployment
        ? await upgradeProgram({
            network,
            rpcUrl: config.rpcUrl,
            wallet,
            programId: deployment.programId,
            artifact: buildResult.artifact,
            onProgress: logDeploy,
          })
        : await deployProgram({
            network,
            rpcUrl: config.rpcUrl,
            apiUrl: config.explorerApiUrl,
            wallet,
            artifact: buildResult.artifact,
            onProgress: logDeploy,
          });
      const next = recordDeployment(project, {
        network,
        programId: result.programId,
        authority: result.authority,
        artifactHash: buildResult.artifact.sha256,
        signature: result.signature,
      });
      updateProject(next);
      setRecoverableBuffer(null);
      setNotice({
        type: 'success',
        message: upgrade
          ? `Program ${shortAddress(result.programId)} upgraded and confirmed.`
          : `Program ${shortAddress(result.programId)} deployed and confirmed.`,
      });
      await refreshBalance();
    } catch (error) {
      if (error?.recoveryBufferAddress) {
        setRecoverableBuffer(error.recoveryBufferAddress);
        logDeploy({
          message: `A loader buffer may still hold recoverable rent: ${error.recoveryBufferAddress}`,
        });
      }
      logDeploy({ message: `Deployment failed: ${error.message}` });
      setNotice({ type: 'error', message: error.message });
    } finally {
      setDeployBusy(false);
    }
  };

  const recoverBuffer = async () => {
    if (!recoverableBuffer || !wallet) return;
    setDeployBusy(true);
    setNotice(null);
    try {
      const result = await recoverProgramBuffer({
        network,
        rpcUrl: config.rpcUrl,
        wallet,
        bufferAddress: recoverableBuffer,
        onProgress: logDeploy,
      });
      setRecoverableBuffer(null);
      setNotice({
        type: 'success',
        message: result.alreadyClosed
          ? 'The interrupted buffer was already consumed or closed.'
          : 'Interrupted buffer rent recovered.',
      });
      await refreshBalance();
    } catch (error) {
      logDeploy({ message: `Buffer recovery failed: ${error.message}` });
      setNotice({ type: 'error', message: error.message });
    } finally {
      setDeployBusy(false);
    }
  };

  const closeCurrentProgram = async () => {
    if (!deployment || !wallet) return;
    setDeployBusy(true);
    setNotice(null);
    try {
      const result = await closeProgram({
        network,
        rpcUrl: config.rpcUrl,
        wallet,
        programId: deployment.programId,
        onProgress: logDeploy,
      });
      updateProject(removeDeployment(project, network, deployment.programId));
      setNotice({
        type: 'success',
        message: result.alreadyClosed
          ? 'Program was already closed.'
          : `Program ${shortAddress(deployment.programId)} closed and rent recovered.`,
      });
      await refreshBalance();
    } catch (error) {
      logDeploy({ message: `Program close failed: ${error.message}` });
      setNotice({ type: 'error', message: error.message });
    } finally {
      setDeployBusy(false);
    }
  };

  const createWallet = () => {
    const next = generateTestWallet(`Editor wallet ${wallets.length + 1}`);
    const updated = [...wallets, next];
    saveWallets(updated);
    setWallets(updated);
    setWalletId(next.id);
    setNotice({ type: 'success', message: 'Development wallet created in this browser.' });
  };

  const fundWallet = async () => {
    if (!wallet || network === 'mainnet') return;
    setFundingBusy(true);
    setNotice(null);
    try {
      let signature;
      let amount = 10;
      if (config.key === 'localnet') {
        signature = await requestAirdrop(config.rpcUrl, wallet.address, aekoToLamports(amount));
      } else {
        if (!config.fundingUrl) throw new Error('Test AEKO funding is not configured for this network.');
        const policy = await getFundingPolicy(config.fundingUrl);
        if (!policy.developerAirdropEnabled || !policy.enabled) {
          throw new Error('Developer Test AEKO funding is disabled for this network.');
        }
        amount = Math.min(
          amount,
          Number(policy.consoleAirdropCapAeko || 0),
          Number(policy.faucetPerRequestCapAeko || 0),
        );
        if (!(amount > 0)) throw new Error('No Test AEKO airdrop amount is currently available.');
        const result = await requestConsoleAirdrop(config.fundingUrl, wallet.address, amount);
        signature = result.signature;
      }
      await confirmSignature(config.rpcUrl, signature, { attempts: 40, intervalMs: 750 });
      await refreshBalance();
      setNotice({ type: 'success', message: `Funded ${amount} Test AEKO.` });
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    } finally {
      setFundingBusy(false);
    }
  };

  const openFile = (path) => updateProject({ ...project, activeFile: path });

  const updateCode = (content) => {
    try {
      const next = setFileContent(project, activeFile.path, content);
      updateProject(next);
      setBuildResult(null);
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    }
  };

  const submitDialog = (value, template = 'hello') => {
    try {
      if (dialog.type === 'close-program') {
        setDialog(null);
        closeCurrentProgram();
        return;
      }
      if (dialog.type === 'new-project') {
        const next = template === 'empty' ? createEmptyProject(value) : createStarterProject(value);
        setProjects((current) => [...current, next]);
        setProjectId(next.id);
        setBuildResult(null);
        setTestResult(null);
      } else if (dialog.type === 'rename-project') {
        const name = value.trim().slice(0, 80);
        if (!name) throw new Error('Project name is required.');
        updateProject({ ...project, name, updatedAt: new Date().toISOString() });
      } else if (dialog.type === 'delete-project') {
        const remaining = projects.filter((item) => item.id !== project.id);
        const nextProjects = remaining.length ? remaining : [createStarterProject()];
        setProjects(nextProjects);
        setProjectId(nextProjects[0].id);
        setBuildResult(null);
        setTestResult(null);
      } else if (dialog.type === 'new-file') {
        updateProject(upsertFile(project, value, ''));
        setBuildResult(null);
      } else if (dialog.type === 'rename') {
        updateProject(renameFile(project, dialog.path, value));
        setBuildResult(null);
      } else if (dialog.type === 'delete') {
        updateProject(deleteFile(project, dialog.path));
        setBuildResult(null);
      }
      setDialog(null);
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    }
  };

  const downloadProject = () => {
    const blob = new Blob([exportProject(project)], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = `${project.name.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase() || 'aeko-project'}.aeko.json`;
    anchor.click();
    URL.revokeObjectURL(href);
  };

  const loadImport = async (event) => {
    const [file] = Array.from(event.target.files || []);
    event.target.value = '';
    if (!file) return;
    try {
      if (file.size > EDITOR_MAX_SOURCE_BYTES * 2) {
        throw new Error('Project export is too large to import safely.');
      }
      const next = importProject(await file.text());
      setProjects((current) => [...current, next]);
      setProjectId(next.id);
      setBuildResult(null);
      setTestResult(null);
      setNotice({ type: 'success', message: `Imported ${next.name}.` });
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    }
  };

  return (
    <div className="h-full min-h-0 overflow-hidden bg-[#09090d] text-white">
      <div className="flex h-full flex-col border-t border-white/10">
        <header className="flex min-h-14 shrink-0 items-center gap-2 border-b border-white/10 bg-[#0d0d13] px-2 sm:px-3">
          <button
            type="button"
            onClick={() => setMobilePanel('files')}
            aria-label="Open project files"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-gray-400 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aeko-accent lg:hidden"
          >
            <Menu size={18} />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Code2 size={16} className="shrink-0 text-aeko-accent" />
              <select
                aria-label="Active editor project"
                value={project.id}
                onChange={(event) => {
                  setProjectId(event.target.value);
                  setBuildResult(null);
                  setTestResult(null);
                }}
                className="max-w-44 truncate bg-transparent text-sm font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-aeko-accent sm:max-w-64"
              >
                {projects.map((item) => <option key={item.id} value={item.id} className="bg-[#111118]">{item.name}</option>)}
              </select>
              <span className="hidden rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-gray-600 sm:inline">Rust · SBF</span>
              <span className="hidden text-[10px] text-gray-600 md:inline" aria-live="polite">
                {saveState === 'saving' ? 'Saving…' : 'Saved locally'}
              </span>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={persistNow}
              aria-label="Save project"
              className="hidden min-h-11 min-w-11 items-center justify-center rounded-lg border border-white/10 text-gray-400 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aeko-accent sm:flex"
            >
              <Save size={16} />
            </button>
            <div className="hidden xl:flex xl:gap-1.5">
              <ActionButton icon={Hammer} label="Build" onClick={runBuild} disabled={!capabilities.buildEnabled || Boolean(job)} busy={job?.type === 'build'} />
              <ActionButton icon={FlaskConical} label="Test" onClick={runTests} disabled={!capabilities.testEnabled || Boolean(job)} busy={job?.type === 'test'} />
              <ActionButton icon={Rocket} label={deployment ? 'Upgrade' : 'Deploy'} onClick={() => deploy(Boolean(deployment))} disabled={!capabilities.deployEnabled || !buildResult?.artifact || !wallet || Boolean(job)} busy={deployBusy} primary />
            </div>
            <button
              type="button"
              onClick={() => setMobilePanel('actions')}
              aria-label="Open build and deploy actions"
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-white/10 text-gray-300 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aeko-accent xl:hidden"
            >
              <Rocket size={16} />
            </button>
            <button
              type="button"
              onClick={() => setMobilePanel('runtime')}
              aria-label="Open runtime panel"
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-gray-400 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aeko-accent lg:hidden"
            >
              <WalletCards size={17} />
            </button>
          </div>
        </header>

        {notice ? (
          <div
            role="status"
            aria-live="polite"
            className={cx(
              'flex min-h-10 shrink-0 items-center gap-2 border-b px-4 text-xs',
              notice.type === 'error'
                ? 'border-red-500/20 bg-red-500/[0.07] text-red-200'
                : 'border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-200',
            )}
          >
            {notice.type === 'error' ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
            <span className="min-w-0 flex-1 truncate">{notice.message}</span>
            <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss status" className="rounded p-1 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current">
              <X size={13} />
            </button>
          </div>
        ) : null}

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[250px_minmax(0,1fr)_280px]">
          <aside className="hidden min-h-0 flex-col border-r border-white/10 bg-[#0b0b10] lg:flex">
            <PanelHeader
              title="Explorer"
              action={(
                <div className="flex items-center">
                  <button type="button" onClick={() => setDialog({ type: 'new-project' })} aria-label="New project" title="New project" className="rounded p-2 text-gray-500 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aeko-accent"><FolderOpen size={14} /></button>
                  <button type="button" onClick={() => setDialog({ type: 'rename-project', value: project.name })} aria-label="Rename project" title="Rename project" className="rounded p-2 text-gray-500 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aeko-accent"><MoreHorizontal size={14} /></button>
                  <button type="button" onClick={() => setDialog({ type: 'delete-project', value: project.name })} aria-label="Delete project" title="Delete project" className="rounded p-2 text-gray-500 hover:bg-red-500/10 hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"><Trash2 size={14} /></button>
                  <button type="button" onClick={() => setDialog({ type: 'new-file' })} aria-label="New Rust file" title="New Rust file" className="rounded p-2 text-gray-500 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aeko-accent"><Plus size={14} /></button>
                </div>
              )}
            />
            <FileTree
              project={project}
              onOpen={openFile}
              onCreate={() => setDialog({ type: 'new-file' })}
              onRename={(path) => setDialog({ type: 'rename', path, value: path })}
              onDelete={(path) => setDialog({ type: 'delete', path })}
            />
            <div className="border-t border-white/10 p-2">
              <div className="grid grid-cols-2 gap-1">
                <button type="button" onClick={downloadProject} className="flex min-h-10 items-center justify-center gap-2 rounded-md text-xs text-gray-500 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aeko-accent"><Download size={13} /> Export</button>
                <button type="button" onClick={() => importRef.current?.click()} className="flex min-h-10 items-center justify-center gap-2 rounded-md text-xs text-gray-500 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aeko-accent"><Upload size={13} /> Import</button>
              </div>
            </div>
          </aside>

          <main className="flex min-h-0 min-w-0 flex-col">
            <div className="flex h-10 shrink-0 items-end overflow-x-auto border-b border-white/10 bg-[#0d0d13]">
              {project.files.map((file) => (
                <button
                  key={file.path}
                  type="button"
                  onClick={() => openFile(file.path)}
                  className={cx(
                    'flex h-10 shrink-0 items-center gap-2 border-r border-white/[0.06] px-3 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-aeko-accent',
                    file.path === project.activeFile ? 'bg-[#09090d] text-gray-100' : 'text-gray-600 hover:bg-white/[0.03] hover:text-gray-300',
                  )}
                >
                  <FileCode2 size={13} className="text-aeko-accent/70" />
                  {file.path.split('/').pop()}
                </button>
              ))}
            </div>
            <CodeEditor path={activeFile.path} value={activeFile.content} onChange={updateCode} onSave={persistNow} />
            <OutputPanel
              tab={outputTab}
              setTab={setOutputTab}
              buildResult={buildResult}
              testResult={testResult}
              deploymentLog={deploymentLog}
              job={job}
            />
          </main>

          <div className="hidden min-h-0 border-l border-white/10 lg:block">
            <ContextPanel
              network={network}
              config={config}
              capabilities={capabilities}
              wallet={wallet}
              wallets={wallets}
              walletId={walletId}
              setWalletId={setWalletId}
              onCreateWallet={createWallet}
              balance={balance}
              onRefreshBalance={refreshBalance}
              onFund={fundWallet}
              fundingBusy={fundingBusy}
              buildResult={buildResult}
              deployment={deployment}
              recoverableBuffer={recoverableBuffer}
              onRecoverBuffer={recoverBuffer}
              onRequestCloseProgram={() => setDialog({ type: 'close-program', value: deployment?.programId })}
              lifecycleBusy={deployBusy}
            />
          </div>
        </div>

        <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-white/10 bg-[#0d0d13] px-3 font-mono text-[10px] text-gray-600">
          <span className="text-aeko-accent">{config.label}</span>
          <span>{wallet ? shortAddress(wallet.address) : 'no wallet'}</span>
          <span className="hidden sm:inline">{activeFile.path}</span>
          <span className="ml-auto">{capabilities.enabled ? 'compiler connected' : 'compiler offline'}</span>
        </footer>
      </div>

      <input ref={importRef} type="file" accept=".json,.aeko.json,application/json" onChange={loadImport} className="hidden" />

      {mobilePanel ? (
        <div className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm lg:hidden" role="presentation" onMouseDown={() => setMobilePanel(null)}>
          <div
            className="absolute inset-y-0 right-0 flex w-[min(92vw,360px)] flex-col border-l border-white/10 bg-[#0b0b10] pt-24 shadow-2xl shadow-black"
            role="dialog"
            aria-modal="true"
            aria-label="Editor tools"
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => handleContainedDialogKeyDown(event, () => setMobilePanel(null))}
          >
            <button type="button" autoFocus onClick={() => setMobilePanel(null)} aria-label="Close editor tools" className="absolute right-3 top-20 rounded-lg p-2 text-gray-500 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aeko-accent"><X size={18} /></button>
            {mobilePanel === 'files' ? (
              <>
                <PanelHeader
                  title="Explorer"
                  action={(
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => setDialog({ type: 'new-project' })} aria-label="New project" className="rounded p-2 text-gray-400 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aeko-accent"><FolderOpen size={15} /></button>
                      <button type="button" onClick={() => setDialog({ type: 'new-file' })} aria-label="New Rust file" className="rounded p-2 text-gray-400 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aeko-accent"><Plus size={15} /></button>
                    </div>
                  )}
                />
                <FileTree
                  project={project}
                  onOpen={(path) => { openFile(path); setMobilePanel(null); }}
                  onCreate={() => setDialog({ type: 'new-file' })}
                  onRename={(path) => setDialog({ type: 'rename', path, value: path })}
                  onDelete={(path) => setDialog({ type: 'delete', path })}
                />
                <div className="border-t border-white/10 p-3">
                  <div className="grid grid-cols-2 gap-2">
                    <ActionButton icon={Download} label="Export" onClick={downloadProject} />
                    <ActionButton icon={Upload} label="Import" onClick={() => importRef.current?.click()} />
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setDialog({ type: 'rename-project', value: project.name })} className="min-h-10 rounded-lg border border-white/10 text-xs text-gray-400 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aeko-accent">Rename project</button>
                    <button type="button" onClick={() => setDialog({ type: 'delete-project', value: project.name })} className="min-h-10 rounded-lg border border-red-500/20 text-xs text-red-300 hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400">Delete project</button>
                  </div>
                </div>
              </>
            ) : null}
            {mobilePanel === 'runtime' ? (
              <ContextPanel
                network={network}
                config={config}
                capabilities={capabilities}
                wallet={wallet}
                wallets={wallets}
                walletId={walletId}
                setWalletId={setWalletId}
                onCreateWallet={createWallet}
                balance={balance}
                onRefreshBalance={refreshBalance}
                onFund={fundWallet}
                fundingBusy={fundingBusy}
                buildResult={buildResult}
                deployment={deployment}
                recoverableBuffer={recoverableBuffer}
                onRecoverBuffer={recoverBuffer}
                onRequestCloseProgram={() => setDialog({ type: 'close-program', value: deployment?.programId })}
                lifecycleBusy={deployBusy}
              />
            ) : null}
            {mobilePanel === 'actions' ? (
              <div className="space-y-3 p-4 pt-12">
                <ActionButton icon={Hammer} label="Build SBF" onClick={() => { setMobilePanel(null); runBuild(); }} disabled={!capabilities.buildEnabled || Boolean(job)} busy={job?.type === 'build'} />
                <ActionButton icon={FlaskConical} label="Run tests" onClick={() => { setMobilePanel(null); runTests(); }} disabled={!capabilities.testEnabled || Boolean(job)} busy={job?.type === 'test'} />
                <ActionButton icon={Rocket} label={deployment ? 'Upgrade program' : 'Deploy program'} onClick={() => { setMobilePanel(null); deploy(Boolean(deployment)); }} disabled={!capabilities.deployEnabled || !buildResult?.artifact || !wallet || Boolean(job)} busy={deployBusy} primary />
                <p className="text-xs leading-5 text-gray-600">Build and tests execute inside the isolated AEKO runner. Deployment transactions are signed only by the development wallet stored in this browser.</p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <EditorDialog dialog={dialog} onClose={() => setDialog(null)} onSubmit={submitDialog} />
    </div>
  );
}
