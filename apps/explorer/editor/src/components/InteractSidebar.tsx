import { Braces, Code2, Database, MonitorPlay, RefreshCw, TerminalSquare } from 'lucide-react'
import type { ProjectTemplate } from '../../shared/contracts/workspace.js'
import type { RustProgramInterface } from '../aeko/rust-interface'
import { Button } from './ui/button'

interface Props {
  template: ProjectTemplate
  programInterface: RustProgramInterface | null
  selectedOperationId: string
  onSelectOperation: (id: string) => void
  onBuildPreview: () => void | Promise<void>
  previewBusy: boolean
}

const CATEGORY_LABELS = {
  create: 'Create',
  read: 'Read',
  update: 'Update',
  delete: 'Delete',
  action: 'Actions',
} as const

export default function InteractSidebar({
  template,
  programInterface,
  selectedOperationId,
  onSelectOperation,
  onBuildPreview,
  previewBusy,
}: Props) {
  if (template === 'typescript-dapp') {
    return (
      <section className="flex size-full min-h-0 flex-col" data-aeko-interact-sidebar>
        <header className="flex h-11 shrink-0 items-center border-b border-border px-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Interact</span>
        </header>
        <div className="space-y-4 overflow-auto p-3">
          <button
            type="button"
            aria-pressed="true"
            className="flex w-full items-start gap-3 rounded-lg border border-primary/30 bg-primary/10 p-3 text-left"
          >
            <MonitorPlay className="mt-0.5 size-4 shrink-0 text-primary" />
            <span className="min-w-0">
              <strong className="block text-xs text-foreground">DApp Preview</strong>
              <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">
                The built DApp owns the editor canvas while Interact is active.
              </span>
            </span>
          </button>
          <Button
            className="w-full"
            size="sm"
            onClick={() => void onBuildPreview()}
            disabled={previewBusy}
          >
            <RefreshCw className={previewBusy ? 'animate-spin motion-reduce:animate-none' : ''} />
            {previewBusy ? 'Building preview…' : 'Build / refresh preview'}
          </Button>
          <p className="text-[11px] leading-4 text-muted-foreground">
            Preview stays sandboxed and uses the Studio-provided AEKO RPC/WS endpoints.
          </p>
        </div>
      </section>
    )
  }

  if (template !== 'rust-program') {
    return (
      <section className="flex size-full min-h-0 flex-col" data-aeko-interact-sidebar>
        <header className="flex h-11 shrink-0 items-center border-b border-border px-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Interact</span>
        </header>
        <div className="p-4 text-xs leading-5 text-muted-foreground">
          Interactive contract controls are generated for Rust programs. Client projects can use their code or the AEKO Shell directly.
        </div>
      </section>
    )
  }

  const operations = programInterface?.operations ?? []
  return (
    <section className="flex size-full min-h-0 flex-col" data-aeko-interact-sidebar>
      <header className="flex h-11 shrink-0 items-center border-b border-border px-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Interact</span>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        <div className="mb-4 rounded-lg border border-border bg-card/40 p-3">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <Braces className="size-4 text-primary" />
            {programInterface?.enumName ?? 'Raw Rust program'}
          </div>
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
            {programInterface?.enumName
              ? 'Controls are derived from Borsh instruction variants and their AccountMeta constructors.'
              : 'No Borsh instruction enum was found. Use Raw instruction to invoke this program safely.'}
          </p>
        </div>

        {(['create', 'read', 'update', 'delete', 'action'] as const).map((category) => {
          const items = operations.filter((operation) => operation.category === category)
          if (!items.length) return null
          return (
            <div key={category} className="mb-4">
              <div className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {CATEGORY_LABELS[category]}
              </div>
              <div className="space-y-1">
                {items.map((operation) => (
                  <button
                    key={operation.id}
                    type="button"
                    onClick={() => onSelectOperation(operation.id)}
                    aria-pressed={selectedOperationId === operation.id}
                    className={
                      'flex min-h-10 w-full items-center gap-2 rounded-md px-2 text-left text-xs transition-colors ' +
                      (selectedOperationId === operation.id
                        ? 'bg-primary/12 text-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground')
                    }
                  >
                    <Code2 className="size-3.5 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{operation.functionName ?? operation.variant}</span>
                    {!operation.supported ? <span className="text-[9px] text-amber-300">manual</span> : null}
                  </button>
                ))}
              </div>
            </div>
          )
        })}

        <div className="border-t border-border pt-3">
          <button
            type="button"
            onClick={() => onSelectOperation('raw')}
            aria-pressed={selectedOperationId === 'raw'}
            className={
              'flex min-h-10 w-full items-center gap-2 rounded-md px-2 text-left text-xs transition-colors ' +
              (selectedOperationId === 'raw'
                ? 'bg-primary/12 text-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground')
            }
          >
            <TerminalSquare className="size-3.5" />
            Raw instruction
          </button>
          <button
            type="button"
            onClick={() => onSelectOperation('accounts')}
            aria-pressed={selectedOperationId === 'accounts'}
            className={
              'mt-1 flex min-h-10 w-full items-center gap-2 rounded-md px-2 text-left text-xs transition-colors ' +
              (selectedOperationId === 'accounts'
                ? 'bg-primary/12 text-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground')
            }
          >
            <Database className="size-3.5" />
            Program accounts
          </button>
        </div>
      </div>
    </section>
  )
}
