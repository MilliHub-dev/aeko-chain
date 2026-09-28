import clsx from 'clsx';
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Link2,
  ShieldCheck,
  TerminalSquare,
} from 'lucide-react';
import CopyButton from '../CopyButton';
import { docsAnchor } from '../../data/docs';

const calloutToneClasses = {
  info: 'border-sky-400/20 bg-sky-400/[0.06] text-sky-100',
  warning: 'border-amber-400/20 bg-amber-400/[0.06] text-amber-100',
  security: 'border-aeko-accent/20 bg-aeko-accent/[0.06] text-emerald-50',
  success: 'border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-50',
};

function resolveDocValue(value, networkConfig) {
  const text = String(value || '');
  const replacements = {
    '{{rpcUrl}}': networkConfig?.rpcUrl || '<AEKO_RPC_URL>',
    '{{websocketUrl}}': networkConfig?.websocketUrl || '<AEKO_WEBSOCKET_URL>',
    '{{explorerApiUrl}}': networkConfig?.explorerApiUrl || '<AEKO_EXPLORER_API_URL>',
    '{{networkLabel}}': networkConfig?.label || 'selected network',
  };

  return Object.entries(replacements).reduce(
    (current, [token, replacement]) => current.split(token).join(replacement),
    text,
  );
}

function resolveEndpointValue(value, networkConfig) {
  const text = String(value || '');
  if (text.includes('{{rpcUrl}}') && !networkConfig?.rpcUrl) return '';
  if (text.includes('{{websocketUrl}}') && !networkConfig?.websocketUrl) return '';
  if (text.includes('{{explorerApiUrl}}') && !networkConfig?.explorerApiUrl) return '';
  return resolveDocValue(text, networkConfig);
}

function BlockHeading({ id, title }) {
  if (!title) return null;
  return (
    <h2
      id={id}
      tabIndex={-1}
      className="scroll-mt-28 text-2xl font-semibold tracking-tight text-white outline-none"
    >
      <a
        href={`#${id}`}
        className="group inline-flex items-center gap-2 text-inherit no-underline"
      >
        <span>{title}</span>
        <Link2
          size={16}
          className="text-gray-600 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          aria-hidden="true"
        />
      </a>
    </h2>
  );
}

function CodeBlock({ block, networkConfig, compact = false }) {
  const value = resolveDocValue(block.value, networkConfig);

  return (
    <div className={clsx('overflow-hidden rounded-2xl border border-white/10 bg-black/45', compact && 'mt-4')}>
      <div className="flex min-h-12 items-center justify-between gap-4 border-b border-white/10 bg-white/[0.035] px-4">
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
            {block.label || block.language || 'Code'}
          </div>
        </div>
        <CopyButton value={value} label={`Copy ${block.label || 'code'}`} compact />
      </div>
      <div className="overflow-x-auto">
        <pre className="m-0 min-w-max bg-transparent p-5 text-[13px] leading-6 text-gray-200">
          <code>{value}</code>
        </pre>
      </div>
    </div>
  );
}

function Callout({ block }) {
  const tone = block.tone || 'info';
  const icon = tone === 'warning'
    ? <AlertTriangle size={18} aria-hidden="true" />
    : tone === 'security'
      ? <ShieldCheck size={18} aria-hidden="true" />
      : tone === 'success'
        ? <CheckCircle2 size={18} aria-hidden="true" />
        : <Info size={18} aria-hidden="true" />;

  return (
    <div
      className={clsx(
        'rounded-2xl border p-5',
        calloutToneClasses[tone] || calloutToneClasses.info,
      )}
    >
      <div className="mb-2 flex items-start gap-3">
        <span className="mt-0.5 shrink-0">{icon}</span>
        <h3 className="m-0 text-sm font-semibold text-white">{block.title}</h3>
      </div>
      <p className="m-0 pl-7 text-sm leading-6 text-gray-300">{block.body}</p>
    </div>
  );
}

function EndpointList({ block, networkConfig, anchor }) {
  return (
    <section className="space-y-4">
      <BlockHeading id={anchor} title={block.title} />
      <div className="grid gap-3">
        {block.items.map((item) => {
          const value = resolveEndpointValue(item.value, networkConfig);
          return (
            <div
              key={item.label}
              className="rounded-2xl border border-white/10 bg-white/[0.025] p-4"
            >
              <div className="mb-3 flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-white">{item.label}</div>
                  {item.note ? (
                    <div className="mt-1 text-xs leading-5 text-gray-500">{item.note}</div>
                  ) : null}
                </div>
                <CopyButton
                  value={value}
                  label={`Copy ${item.label}`}
                  compact
                />
              </div>
              <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/35 px-3 py-2 font-mono text-xs leading-5 text-gray-300">
                {value || 'Not configured for this deployment'}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DocsTable({ block, anchor }) {
  return (
    <section className="space-y-4">
      <BlockHeading id={anchor} title={block.title} />
      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead className="bg-white/[0.055] text-xs uppercase tracking-[0.12em] text-gray-400">
            <tr>
              {block.headers.map((header) => (
                <th key={header} className="border-b border-white/10 px-4 py-3 font-semibold">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {block.rows.map((row, rowIndex) => (
              <tr key={`${block.title}-${rowIndex}`} className="bg-black/10 align-top">
                {row.map((cell, cellIndex) => (
                  <td
                    key={`${rowIndex}-${cellIndex}`}
                    className={clsx(
                      'px-4 py-3 leading-6 text-gray-300',
                      cellIndex === 0 && 'font-medium text-white',
                    )}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function renderBlock(block, networkConfig, index) {
  const anchor = block.anchor || docsAnchor(block.title || block.label) || `section-${index + 1}`;

  switch (block.type) {
    case 'paragraph':
      return (
        <section className="space-y-4">
          <BlockHeading id={anchor} title={block.title} />
          <p className="text-[15px] leading-7 text-gray-300">{block.body}</p>
        </section>
      );
    case 'callout':
      return <Callout block={block} />;
    case 'code':
      return (
        <section className="space-y-4">
          {block.title ? <BlockHeading id={anchor} title={block.title} /> : null}
          <CodeBlock block={block} networkConfig={networkConfig} />
        </section>
      );
    case 'bullets':
      return (
        <section className="space-y-4">
          <BlockHeading id={anchor} title={block.title} />
          <ul className="space-y-3">
            {block.items.map((item) => (
              <li key={item} className="flex gap-3 text-[15px] leading-7 text-gray-300">
                <CheckCircle2
                  size={17}
                  className="mt-1.5 shrink-0 text-aeko-accent"
                  aria-hidden="true"
                />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      );
    case 'steps':
      return (
        <section className="space-y-4">
          <BlockHeading id={anchor} title={block.title} />
          <ol className="space-y-4">
            {block.items.map((item, index) => (
              <li
                key={`${block.title}-${item.title}`}
                className="rounded-2xl border border-white/10 bg-white/[0.025] p-5"
              >
                <div className="flex gap-4">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-full border border-aeko-accent/30 bg-aeko-accent/10 font-mono text-xs font-bold text-aeko-accent">
                    {index + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="m-0 text-base font-semibold text-white">{item.title}</h3>
                    <p className="mb-0 mt-2 text-sm leading-6 text-gray-400">{item.body}</p>
                    {item.code ? (
                      <CodeBlock
                        block={{ label: 'Command', language: 'bash', value: item.code }}
                        networkConfig={networkConfig}
                        compact
                      />
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      );
    case 'table':
      return <DocsTable block={block} anchor={anchor} />;
    case 'endpoints':
      return <EndpointList block={block} networkConfig={networkConfig} anchor={anchor} />;
    default:
      return null;
  }
}

export default function DocsContent({
  page,
  networkConfig,
  pagesById,
  onNavigatePage,
}) {
  return (
    <article className="min-w-0">
      {(page.prerequisites?.length || page.outcomes?.length) ? (
        <div className="mb-10 grid gap-4 md:grid-cols-2">
          {page.prerequisites?.length ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
              <div className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                Before you start
              </div>
              <ul className="space-y-2 text-sm leading-6 text-gray-300">
                {page.prerequisites.map((item) => (
                  <li key={item} className="flex gap-2.5">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-gray-600" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {page.outcomes?.length ? (
            <div className="rounded-2xl border border-aeko-accent/15 bg-aeko-accent/[0.035] p-5">
              <div className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-aeko-accent/80">
                You will leave with
              </div>
              <ul className="space-y-2 text-sm leading-6 text-gray-300">
                {page.outcomes.map((item) => (
                  <li key={item} className="flex gap-2.5">
                    <CheckCircle2
                      size={15}
                      className="mt-1.5 shrink-0 text-aeko-accent"
                      aria-hidden="true"
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-10">
        {page.blocks.map((block, index) => (
          <div key={`${page.id}-${index}`}>
            {renderBlock(block, networkConfig, index)}
          </div>
        ))}
      </div>

      {page.related?.length ? (
        <section className="mt-14 border-t border-white/10 pt-8">
          <h2 className="text-lg font-semibold text-white">Continue building</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {page.related.map((pageId) => {
              const relatedPage = pagesById[pageId];
              if (!relatedPage) return null;
              return (
                <button
                  key={pageId}
                  type="button"
                  onClick={() => onNavigatePage(pageId)}
                  className="group min-h-24 rounded-2xl border border-white/10 bg-white/[0.025] p-4 text-left transition hover:border-aeko-accent/30 hover:bg-aeko-accent/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aeko-accent/70"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-semibold text-white">{relatedPage.title}</span>
                    <TerminalSquare
                      size={16}
                      className="mt-0.5 shrink-0 text-gray-600 transition group-hover:text-aeko-accent"
                      aria-hidden="true"
                    />
                  </div>
                  <span className="mt-2 block text-xs leading-5 text-gray-500">
                    {relatedPage.summary}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

    </article>
  );
}
