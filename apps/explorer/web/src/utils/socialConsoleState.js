export const SOCIAL_QUERY_KEYS = Object.freeze([
  'social',
  'profile',
  'post',
  'dialog',
  'target',
  'persona',
]);

export const SOCIAL_PAGES = Object.freeze(new Set([
  'feed',
  'me',
  'profile',
  'post',
  'rewards',
  'staking',
  'monetization',
  'assets',
  'protocol',
]));

export function resolveOwnedPersona(wallets, requestedAddress = '') {
  const owned = Array.isArray(wallets) ? wallets.filter((wallet) => wallet?.address) : [];
  return owned.find((wallet) => wallet.address === requestedAddress) || owned[0] || null;
}

export function normalizeSocialPage(value) {
  return SOCIAL_PAGES.has(value) ? value : 'feed';
}

export function applyConsoleNavigation(searchParams, {
  consoleOpen = true,
  tab = 'accounts',
  socialPage = '',
} = {}) {
  const next = new URLSearchParams(searchParams);
  if (!consoleOpen) {
    next.delete('console');
    next.delete('tab');
    SOCIAL_QUERY_KEYS.forEach((key) => next.delete(key));
    return next;
  }

  next.set('console', '1');
  next.set('tab', tab);
  if (tab !== 'social') {
    SOCIAL_QUERY_KEYS.forEach((key) => next.delete(key));
    return next;
  }

  next.set('social', normalizeSocialPage(socialPage || next.get('social') || 'feed'));
  return next;
}

export function mergeUniqueBy(items, key) {
  const seen = new Set();
  return items.filter((item) => {
    const value = item?.[key];
    if (value == null || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}
