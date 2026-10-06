import React from 'react'
import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import '@vscode/codicons/dist/codicon.css'
import '@xterm/xterm/css/xterm.css'
import './styles.css'

export function StartingStudio() {
  return (
    <main className="grid min-h-dvh place-items-center bg-background p-6 text-foreground" role="status" aria-live="polite">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
        <div className="mb-4 grid size-10 place-items-center rounded-lg bg-primary font-black text-primary-foreground">A</div>
        <p className="text-xs font-semibold tracking-[0.18em] text-primary">AEKO CONTRACT STUDIO</p>
        <h1 className="mt-2 text-xl font-semibold">Starting Studio…</h1>
        <p className="mt-2 text-sm text-muted-foreground">Loading the editor runtime and language services.</p>
      </div>
    </main>
  )
}

export function StartupFailure({ cause }: { cause: unknown }) {
  const detail = cause instanceof Error
    ? cause.stack || cause.message
    : String(cause || 'Unknown editor initialization error.')

  return (
    <main className="grid min-h-dvh place-items-center bg-background p-6 text-foreground">
      <section className="w-full max-w-lg rounded-xl border border-destructive bg-card p-6 shadow-xl" role="alert">
        <div className="mb-4 grid size-10 place-items-center rounded-lg bg-destructive font-black text-white">!</div>
        <p className="text-xs font-semibold tracking-[0.18em] text-destructive">AEKO CONTRACT STUDIO</p>
        <h1 className="mt-2 text-xl font-semibold">Studio failed to start</h1>
        <p className="mt-2 text-sm text-muted-foreground">The editor runtime could not be initialized.</p>
        <pre className="mt-4 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-background p-3 text-xs text-foreground">{detail}</pre>
        <button
          type="button"
          className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          onClick={() => window.location.reload()}
        >
          Reload Studio
        </button>
      </section>
    </main>
  )
}

async function bootstrapStudio(root: Root): Promise<void> {
  try {
    const { initializeVscode } = await import('./ide/vscode')
    await initializeVscode()

    const [{ default: App }, { TooltipProvider }] = await Promise.all([
      import('./App'),
      import('./components/ui/tooltip'),
    ])

    root.render(
      <React.StrictMode>
        <TooltipProvider><App /></TooltipProvider>
      </React.StrictMode>,
    )
  } catch (cause) {
    console.error('AEKO Contract Studio bootstrap failed.', cause)
    root.render(
      <React.StrictMode>
        <StartupFailure cause={cause} />
      </React.StrictMode>,
    )
  }
}

const element = document.getElementById('root')
if (!element) throw new Error('AEKO Studio root element is missing.')

const root = createRoot(element)
flushSync(() => {
  root.render(
    <React.StrictMode>
      <StartingStudio />
    </React.StrictMode>,
  )
})
void bootstrapStudio(root)
