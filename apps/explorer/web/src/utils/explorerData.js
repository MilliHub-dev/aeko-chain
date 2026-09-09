export function normalizeSearchMatch(match) {
  if (!match || typeof match !== 'object' || typeof match.kind !== 'string') {
    return null;
  }

  // Current Rust serde representation is internally tagged and therefore
  // flat: { kind: 'block', slot, ... }. Keep compatibility with the earlier
  // nested UI assumption ({ kind: 'block', block: {...} }) while deployments
  // roll forward.
  const nested = match[match.kind];
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return { kind: match.kind, data: nested };
  }

  const { kind, ...data } = match;
  return { kind, data };
}

export function normalizeSearchMatches(payload) {
  const matches = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.matches)
      ? payload.matches
      : [];

  return matches.map(normalizeSearchMatch).filter(Boolean);
}

export function formatExplorerMetric(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return '—';
  }
  return value.toLocaleString('en-US');
}
