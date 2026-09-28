import { useMemo, useState } from 'react';
import { BookOpenText, Search, X } from 'lucide-react';

export default function DocsSidebar({
  sections,
  pagesById,
  activePageId,
  onNavigate,
  mobile = false,
  onClose,
}) {
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();

  const visibleSections = useMemo(() => {
    if (!normalizedQuery) return sections;

    return sections
      .map((section) => ({
        ...section,
        items: section.items.filter((pageId) => {
          const page = pagesById[pageId];
          if (!page) return false;
          const haystack = [
            page.title,
            page.summary,
            ...(page.tags || []),
          ]
            .join(' ')
            .toLowerCase();
          return haystack.includes(normalizedQuery);
        }),
      }))
      .filter((section) => section.items.length > 0);
  }, [normalizedQuery, pagesById, sections]);

  return (
    <aside
      className={mobile ? 'min-h-full bg-aeko-dark' : 'w-full'}
      aria-label="Developer documentation navigation"
    >
      <div className={mobile ? 'p-5' : ''}>
        <div className="mb-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl border border-aeko-accent/20 bg-aeko-accent/[0.08] text-aeko-accent">
              <BookOpenText size={18} aria-hidden="true" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">Developer docs</div>
              <div className="mt-0.5 text-xs text-gray-500">Build, verify, recover</div>
            </div>
          </div>
          {mobile ? (
            <button
              type="button"
              onClick={onClose}
              className="flex size-11 items-center justify-center rounded-xl border border-white/10 text-gray-400 transition hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aeko-accent/70"
              aria-label="Close documentation menu"
            >
              <X size={19} aria-hidden="true" />
            </button>
          ) : null}
        </div>

        <label className="relative block">
          <span className="sr-only">Search documentation</span>
          <Search
            size={16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-600"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a guide"
            className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.035] pl-10 pr-3 text-sm text-white outline-none transition placeholder:text-gray-600 focus:border-aeko-accent/40 focus:ring-2 focus:ring-aeko-accent/20"
          />
        </label>

        <nav className="mt-7 space-y-7">
          {visibleSections.length > 0 ? (
            visibleSections.map((section) => (
              <section key={section.id}>
                <div className="mb-2 px-2">
                  <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">
                    {section.title}
                  </h2>
                </div>
                <ul className="space-y-0.5">
                  {section.items.map((pageId) => {
                    const page = pagesById[pageId];
                    if (!page) return null;
                    const active = pageId === activePageId;

                    return (
                      <li key={pageId}>
                        <button
                          type="button"
                          aria-current={active ? 'page' : undefined}
                          onClick={() => onNavigate(pageId)}
                          className={`group w-full rounded-lg border px-3 py-2.5 text-left text-sm leading-5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aeko-accent/70 ${
                            active
                              ? 'border-aeko-accent/20 bg-aeko-accent/[0.075] font-medium text-white'
                              : 'border-transparent text-gray-400 hover:bg-white/[0.035] hover:text-white'
                          }`}
                        >
                          <span className="flex items-start gap-2.5">
                            <span
                              className={`mt-2 size-1.5 shrink-0 rounded-full transition ${
                                active
                                  ? 'bg-aeko-accent shadow-[0_0_0_3px_rgba(95,181,31,0.12)]'
                                  : 'bg-gray-700 group-hover:bg-gray-500'
                              }`}
                              aria-hidden="true"
                            />
                            <span>{page.title}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-white/10 p-4 text-sm leading-6 text-gray-500">
              No documentation pages match “{query}”.
            </div>
          )}
        </nav>
      </div>
    </aside>
  );
}
