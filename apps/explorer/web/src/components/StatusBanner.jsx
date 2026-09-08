import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

// One banner component for all three states the explorer (and any other page)
// needs to surface above content. Replaces the per-page red/amber/green
// inline <div>s. Success banners auto-dismiss after 5s; errors stay until
// the user closes them or the underlying state clears.
const PALETTES = {
  error: {
    Icon: AlertTriangle,
    ring: 'border-red-400/30',
    bg: 'bg-red-500/10',
    text: 'text-red-50',
    accent: 'text-red-200',
    aria: 'assertive',
    role: 'alert',
  },
  success: {
    Icon: CheckCircle2,
    ring: 'border-emerald-400/30',
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-50',
    accent: 'text-emerald-200',
    aria: 'polite',
    role: 'status',
  },
  info: {
    Icon: Info,
    ring: 'border-aeko-accent/30',
    bg: 'bg-aeko-accent/10',
    text: 'text-white',
    accent: 'text-aeko-accent',
    aria: 'polite',
    role: 'status',
  },
};

export default function StatusBanner({
  kind = 'info',
  title,
  children,
  onDismiss,
  autoDismissMs,
}) {
  const palette = PALETTES[kind] || PALETTES.info;
  const { Icon } = palette;

  useEffect(() => {
    if (!autoDismissMs || !onDismiss) return undefined;
    const id = setTimeout(onDismiss, autoDismissMs);
    return () => clearTimeout(id);
  }, [autoDismissMs, onDismiss]);

  return (
    <motion.div
      role={palette.role}
      aria-live={palette.aria}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      className={`rounded-2xl border ${palette.ring} ${palette.bg} ${palette.text} px-4 py-3 flex items-start gap-3`}
    >
      <Icon size={18} className={`shrink-0 mt-0.5 ${palette.accent}`} aria-hidden="true" />
      <div className="flex-1 min-w-0 text-sm leading-relaxed">
        {title && <div className="font-semibold mb-0.5">{title}</div>}
        <div className="break-words">{children}</div>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss notification"
          className="shrink-0 inline-flex items-center justify-center w-7 h-7 -mr-1 rounded-md text-gray-400 hover:text-white hover:bg-white/10 transition"
        >
          <X size={14} />
        </button>
      )}
    </motion.div>
  );
}

// Convenience wrapper for multiple stacked banners with exit animation.
export function StatusBannerStack({ banners }) {
  return (
    <div className="space-y-2 mb-6">
      <AnimatePresence initial={false}>
        {banners.map((b) => (
          <StatusBanner key={b.id} {...b} />
        ))}
      </AnimatePresence>
    </div>
  );
}
