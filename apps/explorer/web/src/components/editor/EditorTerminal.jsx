import { ChevronRight, Loader2, Terminal, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  executeEditorShellCommand,
  getEditorShellSuggestions,
} from '../../utils/editorShell';

const WELCOME = {
  id: 0,
  kind: 'system',
  text: 'AEKO Shell · read-only RPC console. Type help to list commands.',
};

function TerminalLine({ entry }) {
  const tone = entry.kind === 'error'
    ? 'text-red-300'
    : entry.kind === 'command'
      ? 'text-gray-100'
      : entry.kind === 'system'
        ? 'text-aeko-accent'
        : 'text-gray-400';

  return (
    <div className={'whitespace-pre-wrap break-words ' + tone}>
      {entry.kind === 'command' ? (
        <span className="mr-2 text-aeko-accent" aria-hidden="true">aeko&gt;</span>
      ) : null}
      {entry.text}
    </div>
  );
}

export default function EditorTerminal({ network, rpcUrl, wallet }) {
  const [entries, setEntries] = useState([WELCOME]);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const nextId = useRef(1);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  const suggestions = useMemo(
    () => getEditorShellSuggestions(input),
    [input],
  );

  const append = (kind, text) => {
    const lines = Array.isArray(text) ? text : [text];
    setEntries((current) => [
      ...current,
      ...lines.map((value) => ({
        id: nextId.current++,
        kind,
        text: String(value ?? ''),
      })),
    ].slice(-500));
  };

  const clear = () => {
    setEntries([{
      ...WELCOME,
      id: nextId.current++,
    }]);
  };

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [entries, running]);

  const applySuggestion = (candidate) => {
    const prefixed = input.trimStart().toLowerCase().startsWith('aeko ');
    setInput((prefixed ? 'aeko ' : '') + candidate.name + ' ');
    inputRef.current?.focus();
  };

  const run = async () => {
    const command = input.trim();
    if (!command || running) return;

    const nextHistory = [...history, command].slice(-100);
    append('command', command);
    setHistory(nextHistory);
    setHistoryIndex(nextHistory.length);
    setInput('');
    setRunning(true);

    try {
      const result = await executeEditorShellCommand(command, {
        network,
        rpcUrl,
        wallet,
        history: nextHistory,
      });
      if (result.kind === 'clear') clear();
      else append(result.kind === 'error' ? 'error' : 'output', result.lines);
    } catch (error) {
      append('error', error?.message || 'AEKO shell command failed.');
    } finally {
      setRunning(false);
      window.requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  const onKeyDown = (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'l') {
      event.preventDefault();
      clear();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      run();
      return;
    }
    if (event.key === 'Tab' && suggestions[0]) {
      event.preventDefault();
      applySuggestion(suggestions[0]);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!history.length) return;
      const next = Math.max(0, historyIndex - 1);
      setHistoryIndex(next);
      setInput(history[next] || '');
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!history.length) return;
      const next = Math.min(history.length, historyIndex + 1);
      setHistoryIndex(next);
      setInput(next === history.length ? '' : history[next] || '');
    }
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[#07070b]">
      <div className="flex min-h-11 shrink-0 items-center gap-2 border-b border-white/[0.06] px-3 font-mono text-[10px] text-gray-600">
        <Terminal size={12} className="text-aeko-accent" aria-hidden="true" />
        <span>{network || 'unknown network'}</span>
        <span aria-hidden="true">·</span>
        <span>READ</span>
        <span className="ml-auto hidden truncate sm:inline" title={rpcUrl || ''}>
          {rpcUrl || 'RPC not configured'}
        </span>
        <button
          type="button"
          onClick={clear}
          aria-label="Clear AEKO terminal"
          title="Clear terminal (Ctrl/Cmd+L)"
          className="ml-1 flex min-h-11 min-w-11 items-center justify-center rounded text-gray-600 hover:bg-white/5 hover:text-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aeko-accent"
        >
          <Trash2 size={12} />
        </button>
      </div>

      <div
        ref={scrollRef}
        role="log"
        aria-label="AEKO shell output"
        className="min-h-0 flex-1 space-y-1 overflow-auto px-3 py-2 font-mono text-xs leading-5"
      >
        {entries.map((entry) => <TerminalLine key={entry.id} entry={entry} />)}
        {running ? (
          <div className="flex items-center gap-2 text-gray-500" role="status" aria-live="polite">
            <Loader2 size={12} className="animate-spin motion-reduce:animate-none" />
            Reading selected AEKO network…
          </div>
        ) : null}
      </div>

      {input.trim() && suggestions.length ? (
        <div className="absolute bottom-12 left-3 z-10 w-[min(34rem,calc(100%-1.5rem))] overflow-hidden rounded-lg border border-white/10 bg-[#111118] shadow-2xl shadow-black/60">
          {suggestions.map((candidate) => (
            <button
              key={candidate.name}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => applySuggestion(candidate)}
              className="flex min-h-11 w-full items-center gap-3 px-3 text-left hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-aeko-accent"
            >
              <span className="font-mono text-xs text-white">{candidate.name}</span>
              <span className="min-w-0 flex-1 truncate text-[11px] text-gray-500">{candidate.description}</span>
              <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-gray-700">{candidate.risk}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex min-h-11 shrink-0 items-center border-t border-white/[0.06] px-3 font-mono text-xs">
        <ChevronRight size={13} className="mr-1 shrink-0 text-aeko-accent" aria-hidden="true" />
        <span className="mr-2 shrink-0 text-aeko-accent">aeko</span>
        <label htmlFor="aeko-editor-shell-input" className="sr-only">AEKO shell command</label>
        <input
          ref={inputRef}
          id="aeko-editor-shell-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={onKeyDown}
          disabled={running}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="help"
          className="min-w-0 flex-1 bg-transparent py-2 text-gray-200 caret-aeko-accent outline-none placeholder:text-gray-700 disabled:cursor-wait"
        />
      </div>
    </div>
  );
}
