import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, Copy } from 'lucide-react';

async function copyWithFallback(value) {
  if (globalThis.navigator?.clipboard?.writeText) {
    await globalThis.navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(textarea);
  if (!copied) throw new Error('Clipboard copy is unavailable');
}

export default function CopyButton({ value, label = 'Copy', compact = false, className = '' }) {
  const [state, setState] = useState('idle');
  const resetTimer = useRef(null);

  useEffect(() => () => {
    if (resetTimer.current) window.clearTimeout(resetTimer.current);
  }, []);

  const handleCopy = async () => {
    if (!value) return;
    try {
      await copyWithFallback(value);
      setState('copied');
    } catch {
      setState('error');
    }
    if (resetTimer.current) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setState('idle'), 1800);
  };

  const Icon = state === 'copied' ? Check : state === 'error' ? AlertCircle : Copy;
  const announcement = state === 'copied' ? 'Copied' : state === 'error' ? 'Copy failed' : '';

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={!value}
      aria-label={state === 'copied' ? `${label}: copied` : state === 'error' ? `${label}: copy failed` : label}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-gray-300 transition hover:border-white/25 hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aeko-accent/70 disabled:cursor-not-allowed disabled:opacity-40 ${compact ? 'min-w-11 px-2' : ''} ${className}`}
    >
      <Icon size={14} aria-hidden="true" />
      <span className="sr-only" aria-live="polite">{announcement}</span>
    </button>
  );
}
