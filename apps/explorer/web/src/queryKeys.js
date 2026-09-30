export const queryKeys = {
  explorer: {
    overview: (network) => ['explorer', network, 'overview'],
    home: (network, filters, listSize) => ['explorer', network, 'home', filters, listSize],
    search: (network, query, limit) => ['explorer', network, 'search', query, limit],
    resource: (network, kind, id) => ['explorer', network, kind, id],
  },
  funding: {
    policy: (fundingUrl) => ['funding', fundingUrl, 'policy'],
    request: (fundingUrl, requestId) => ['funding', fundingUrl, 'request', requestId],
  },
  settings: {
    public: ['settings', 'public'],
  },
};
