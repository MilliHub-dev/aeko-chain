// Global toast system. Any component can call `pushToast({kind, title, ...})`
// via the `useToaster()` hook and a stack of overlay cards appears pinned
// to the top-right of the viewport (top-center on small screens). They
// auto-dismiss success/info after 5s, persist errors until clicked, and
// announce themselves via aria-live so screen readers don't miss them.
//
// Why not the existing StatusBanner? Banners live inline above content —
// if the user has scrolled past them, a success message about an action
// they just took is literally invisible. Toasts solve that by being
// fixed-position, never scrolling off, and always above content.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, Loader2, X } from 'lucide-react';

const ToasterContext = createContext(null);

const DEFAULT_DURATION = { success: 5000, info: 4500, loading: null, error: null };

const PALETTES = {
  success: {
    Icon: CheckCircle2,
    ring: 'border-emerald-400/40',
    bg: 'bg-emerald-500/[0.13]',
    accent: 'text-emerald-300',
    progress: 'bg-emerald-400',
  },
  error: {
    Icon: AlertTriangle,
    ring: 'border-red-400/40',
    bg: 'bg-red-500/[0.13]',
    accent: 'text-red-300',
    progress: 'bg-red-400',
  },
  info: {
    Icon: Info,
    ring: 'border-aeko-accent/40',
    bg: 'bg-aeko-accent/[0.13]',
    accent: 'text-aeko-accent',
    progress: 'bg-aeko-accent',
  },
  loading: {
    Icon: Loader2,
    ring: 'border-white/15',
    bg: 'bg-white/[0.05]',
    accent: 'text-gray-300',
    progress: 'bg-white/30',
  },
};

let idCounter = 0;
function nextId() {
  idCounter += 1;
  return `toast-${Date.now()}-${idCounter}`;
}

export function ToasterProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (input) => {
      const id = input.id || nextId();
      const kind = input.kind || 'info';
      const duration =
        input.duration !== undefined ? input.duration : DEFAULT_DURATION[kind];
      const toast = {
        id,
        kind,
        title: input.title,
        message: input.message,
        action: input.action, // { label, onClick }
        duration,
        createdAt: Date.now(),
      };
      setToasts((current) => {
        // De-dupe: if a toast with the same key (title+message) is already
        // visible, just bump it instead of stacking duplicates.
        const dupeKey = `${toast.kind}:${toast.title || ''}:${toast.message || ''}`;
        const existing = current.find(
          (t) => `${t.kind}:${t.title || ''}:${t.message || ''}` === dupeKey,
        );
        if (existing) {
          return current.map((t) =>
            t.id === existing.id ? { ...t, createdAt: Date.now() } : t,
          );
        }
        // Cap to 5 visible; oldest is dropped silently.
        const next = [...current, toast];
        return next.length > 5 ? next.slice(next.length - 5) : next;
      });
      return id;
    },
    [],
  );

  // Convenience helpers — most callers just want toast.success(msg) etc.
  const api = {
    push,
    dismiss,
    success: (msg, opts = {}) => push({ kind: 'success', message: msg, ...opts }),
    error: (msg, opts = {}) => push({ kind: 'error', message: msg, ...opts }),
    info: (msg, opts = {}) => push({ kind: 'info', message: msg, ...opts }),
    loading: (msg, opts = {}) => push({ kind: 'loading', message: msg, ...opts }),
  };

  return (
    <ToasterContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToasterContext.Provider>
  );
}

export function useToaster() {
  const ctx = useContext(ToasterContext);
  if (!ctx) {
    throw new Error('useToaster must be used within <ToasterProvider>');
  }
  return ctx;
}

function ToastViewport({ toasts, onDismiss }) {
  return (
    <div
      // Top-center on small screens (most thumb-friendly position; doesn't
      // collide with the floating nav pill). Top-right on larger screens
      // so it doesn't hide content below the nav.
      className="fixed top-20 inset-x-4 sm:inset-x-auto sm:right-4 z-[1200] flex flex-col items-stretch sm:items-end gap-2 pointer-events-none"
      role="region"
      aria-label="Notifications"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastCard({ toast, onDismiss }) {
  const palette = PALETTES[toast.kind] || PALETTES.info;
  const { Icon } = palette;
  const timerRef = useRef(null);
  const [paused, setPaused] = useState(false);

  // Schedule auto-dismiss for finite-duration toasts. Hovering or focusing
  // pauses the timer so users with motor / reading-speed needs don't lose
  // the message while they're trying to read it.
  useEffect(() => {
    if (!toast.duration || paused) return undefined;
    timerRef.current = setTimeout(onDismiss, toast.duration);
    return () => clearTimeout(timerRef.current);
  }, [toast.duration, paused, onDismiss]);

  return (
    <motion.div
      role={toast.kind === 'error' ? 'alert' : 'status'}
      aria-live={toast.kind === 'error' ? 'assertive' : 'polite'}
      initial={{ opacity: 0, y: -12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 24, scale: 0.96 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={`pointer-events-auto w-full sm:w-[360px] max-w-full rounded-2xl border ${palette.ring} ${palette.bg} backdrop-blur-md text-white shadow-2xl shadow-black/40 overflow-hidden`}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <Icon
          size={18}
          aria-hidden="true"
          className={`shrink-0 mt-0.5 ${palette.accent} ${
            toast.kind === 'loading' ? 'animate-spin' : ''
          }`}
        />
        <div className="flex-1 min-w-0 text-sm leading-relaxed">
          {toast.title && <div className="font-semibold mb-0.5">{toast.title}</div>}
          {toast.message && (
            <div className="text-gray-200 break-words">{toast.message}</div>
          )}
          {toast.action && (
            <button
              type="button"
              onClick={() => {
                toast.action.onClick?.();
                onDismiss();
              }}
              className={`mt-2 inline-flex items-center gap-1 text-xs font-semibold ${palette.accent} hover:underline`}
            >
              {toast.action.label}
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss notification"
          className="shrink-0 inline-flex items-center justify-center w-7 h-7 -mr-1 rounded-md text-gray-400 hover:text-white hover:bg-white/10 transition"
        >
          <X size={14} />
        </button>
      </div>
      {toast.duration && (
        <ToastProgress duration={toast.duration} paused={paused} color={palette.progress} />
      )}
    </motion.div>
  );
}

function ToastProgress({ duration, paused, color }) {
  // Visual countdown bar so users see how long they have before the toast
  // disappears. Uses CSS animation (paused via animation-play-state) so it
  // costs nothing on the main thread and matches the timer above.
  return (
    <div className="h-[2px] bg-white/5">
      <div
        className={`h-full ${color}`}
        style={{
          animation: `toast-progress ${duration}ms linear forwards`,
          animationPlayState: paused ? 'paused' : 'running',
        }}
      />
    </div>
  );
}
