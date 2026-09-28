import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  ChevronRight,
  ExternalLink,
  Menu,
  Network,
} from 'lucide-react';
import { motion as Motion, useReducedMotion } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import DocsContent from '../components/docs/DocsContent';
import DocsSidebar from '../components/docs/DocsSidebar';
import NetworkToggle from '../components/NetworkToggle';
import { useNetwork } from '../components/NetworkContext';
import NetworkToolsPanel from '../components/NetworkToolsPanel';
import {
  defaultDocsPageId,
  docsPagesById,
  docsSections,
  getDocsPage,
  getDocsPageNeighbors,
  getDocsPageOutline,
  getDocsStatus,
} from '../data/docs';

const statusClasses = {
  success: 'border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-300',
  testnet: 'border-sky-400/20 bg-sky-400/[0.08] text-sky-300',
  neutral: 'border-white/10 bg-white/[0.05] text-gray-300',
  warning: 'border-amber-400/20 bg-amber-400/[0.08] text-amber-300',
};

function PageNavButton({ page, direction, onNavigate }) {
  if (!page) return <div />;

  const previous = direction === 'previous';
  return (
    <button
      type="button"
      onClick={() => onNavigate(page.id)}
      className={`group min-h-24 rounded-2xl border border-white/10 bg-white/[0.025] p-4 text-left transition hover:border-aeko-accent/30 hover:bg-aeko-accent/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aeko-accent/70 ${
        previous ? '' : 'text-right'
      }`}
    >
      <span
        className={`flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-600 ${
          previous ? '' : 'justify-end'
        }`}
      >
        {previous ? <ArrowLeft size={14} aria-hidden="true" /> : null}
        {previous ? 'Previous' : 'Next'}
        {!previous ? <ArrowRight size={14} aria-hidden="true" /> : null}
      </span>
      <span className="mt-2 block text-sm font-semibold text-gray-200 transition group-hover:text-white">
        {page.title}
      </span>
    </button>
  );
}

export default function Docs() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { network, config: networkConfig } = useNetwork();
  const location = useLocation();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();

  const searchParams = useMemo(
    () => new URLSearchParams(location.search),
    [location.search],
  );
  const requestedPageId = searchParams.get('page');
  const page = getDocsPage(requestedPageId || defaultDocsPageId)
    || getDocsPage(defaultDocsPageId);
  const currentSection = docsSections.find((section) => section.id === page.section);
  const status = getDocsStatus(page.status);
  const neighbors = getDocsPageNeighbors(page.id);
  const outline = getDocsPageOutline(page);

  const navigatePage = useCallback((pageId) => {
    if (!getDocsPage(pageId)) return;
    const nextParams = new URLSearchParams(location.search);
    nextParams.set('page', pageId);
    setIsMobileMenuOpen(false);
    navigate({
      pathname: location.pathname,
      search: `?${nextParams.toString()}`,
      hash: '',
    });
  }, [location.pathname, location.search, navigate]);

  useEffect(() => {
    if (!requestedPageId || getDocsPage(requestedPageId)) return;
    const nextParams = new URLSearchParams(location.search);
    nextParams.set('page', defaultDocsPageId);
    navigate(
      {
        pathname: location.pathname,
        search: `?${nextParams.toString()}`,
        hash: '',
      },
      { replace: true },
    );
  }, [location.pathname, location.search, navigate, requestedPageId]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (location.hash) {
        const id = decodeURIComponent(location.hash.slice(1));
        document.getElementById(id)?.scrollIntoView({ block: 'start' });
        return;
      }
      window.scrollTo({ top: 0, behavior: 'auto' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [location.hash, page.id]);

  useEffect(() => {
    if (!isMobileMenuOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsMobileMenuOpen(false);
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMobileMenuOpen]);

  return (
    <div className="min-h-screen bg-aeko-dark">
      <div className="mx-auto max-w-[1540px] px-4 pb-24 pt-24 sm:px-6 lg:px-8">
        <div className="mb-5 flex items-center justify-between gap-4 lg:hidden">
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(true)}
            className="flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aeko-accent/70"
            aria-expanded={isMobileMenuOpen}
            aria-controls="mobile-docs-navigation"
          >
            <Menu size={18} aria-hidden="true" />
            Browse docs
          </button>
          <div className="min-w-0 text-right">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-600">
              Section
            </div>
            <div className="truncate text-xs text-gray-400">
              {currentSection?.title || 'Developer docs'}
            </div>
          </div>
        </div>

        <div className="grid items-start gap-8 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,880px)_220px]">
          <div className="hidden lg:block">
            <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pr-3">
              <DocsSidebar
                sections={docsSections}
                pagesById={docsPagesById}
                activePageId={page.id}
                onNavigate={navigatePage}
              />
            </div>
          </div>

          <main id="developer-docs-content" className="min-w-0">
            <header className="relative overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.025] p-6 sm:p-8">
              <div
                className="pointer-events-none absolute -right-24 -top-28 size-72 rounded-full bg-aeko-accent/[0.07] blur-3xl"
                aria-hidden="true"
              />
              <div className="relative">
                <div className="mb-6 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                  <span>Developer docs</span>
                  <ChevronRight size={13} aria-hidden="true" />
                  <span>{currentSection?.title || 'Guide'}</span>
                </div>

                <div className="flex flex-col gap-7 xl:flex-row xl:items-start xl:justify-between">
                  <div className="max-w-3xl">
                    <div className="mb-4 flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                          statusClasses[status.tone] || statusClasses.neutral
                        }`}
                      >
                        {status.label}
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] font-medium text-gray-400">
                        <Network size={12} aria-hidden="true" />
                        {networkConfig?.label || network}
                      </span>
                    </div>
                    <h1 className="max-w-[18ch] text-4xl font-semibold leading-[1.05] tracking-[-0.035em] text-white sm:text-5xl">
                      {page.title}
                    </h1>
                    <p className="mt-5 max-w-2xl text-base leading-7 text-gray-400 sm:text-[17px]">
                      {page.summary}
                    </p>
                  </div>

                  <div className="shrink-0">
                    <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-600">
                      Documentation network
                    </div>
                    <NetworkToggle />
                  </div>
                </div>
              </div>
            </header>

            {page.networkTools ? (
              <section className="mt-6 rounded-[24px] border border-white/10 bg-white/[0.02] p-5 sm:p-6">
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-aeko-accent">
                      Live network surface
                    </div>
                    <h2 className="mt-1 text-lg font-semibold text-white">
                      Copy the endpoints for {networkConfig?.label || network}
                    </h2>
                  </div>
                </div>
                <NetworkToolsPanel network={network} />
              </section>
            ) : null}

            <Motion.div
              key={page.id}
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.2, ease: 'easeOut' }}
              className="mt-10"
            >
              <DocsContent
                page={page}
                networkConfig={networkConfig}
                pagesById={docsPagesById}
                onNavigatePage={navigatePage}
              />
            </Motion.div>

            <div className="mt-14 grid gap-3 border-t border-white/10 pt-8 sm:grid-cols-2">
              <PageNavButton
                page={neighbors.previous}
                direction="previous"
                onNavigate={navigatePage}
              />
              <PageNavButton
                page={neighbors.next}
                direction="next"
                onNavigate={navigatePage}
              />
            </div>

            <div className="mt-8 flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3 text-sm text-gray-500">
                <BookOpenCheck size={17} className="text-aeko-accent" aria-hidden="true" />
                <span>Found a mismatch? The implementation source is the authority for this portal.</span>
              </div>
              <a
                href="https://github.com/MilliHub-dev/aeko-chain/blob/main/apps/explorer/web/src/data/docs/index.js"
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-medium text-gray-400 no-underline transition hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aeko-accent/70"
              >
                Edit docs source
                <ExternalLink size={15} aria-hidden="true" />
              </a>
            </div>
          </main>

          <aside className="hidden xl:block" aria-label="On this page">
            <div className="sticky top-24">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-600">
                On this page
              </div>
              {outline.length ? (
                <nav className="mt-4 border-l border-white/10">
                  {outline.map((item) => (
                    <a
                      key={item.id}
                      href={`#${item.id}`}
                      className="block border-l border-transparent py-2 pl-4 text-xs leading-5 text-gray-500 no-underline transition hover:border-aeko-accent/50 hover:text-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aeko-accent/70"
                    >
                      {item.title}
                    </a>
                  ))}
                </nav>
              ) : (
                <p className="mt-3 text-xs leading-5 text-gray-600">
                  This guide is intentionally concise.
                </p>
              )}

              <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-600">
                  Source policy
                </div>
                <p className="mt-2 text-xs leading-5 text-gray-500">
                  Executable client code and current program implementations take precedence over stale prose.
                </p>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {isMobileMenuOpen ? (
        <div
          id="mobile-docs-navigation"
          className="fixed inset-0 z-[80] lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Developer documentation navigation"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-label="Close documentation menu"
          />
          <div className="absolute inset-y-0 left-0 w-[min(88vw,360px)] overflow-y-auto border-r border-white/10 bg-aeko-dark shadow-2xl">
            <DocsSidebar
              sections={docsSections}
              pagesById={docsPagesById}
              activePageId={page.id}
              onNavigate={navigatePage}
              mobile
              onClose={() => setIsMobileMenuOpen(false)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
