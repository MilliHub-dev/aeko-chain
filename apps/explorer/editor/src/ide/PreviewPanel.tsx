import { Code2, MonitorPlay, RefreshCw, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { PreviewStatus } from '../../shared/contracts/preview.js'
import { errorMessage } from '../../shared/errors/editor-errors.js'
import { api } from '../lib/api'
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'

export default function PreviewPanel({
  workspaceId,
  revision,
  buildBusy,
  onBack,
  onRebuild,
}: {
  workspaceId: string
  revision: number
  buildBusy: boolean
  onBack: () => void
  onRebuild: () => void | Promise<void>
}) {
  const [status, setStatus] = useState<PreviewStatus | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let disposed = false
    void api.previewStatus(workspaceId)
      .then((next) => {
        if (!disposed) {
          setStatus(next)
          setError('')
        }
      })
      .catch((cause) => {
        if (!disposed) setError(errorMessage(cause, 'DApp preview status could not be loaded.'))
      })
      .finally(() => {
        if (!disposed) setLoading(false)
      })
    return () => { disposed = true }
  }, [revision, workspaceId])

  return (
    <section className="flex size-full min-h-0 flex-col bg-[#090b0b]" aria-label="DApp preview">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-background px-3">
        <MonitorPlay className="size-4 text-primary" />
        <strong className="text-xs">DApp Preview</strong>
        {status?.available ? <Badge>Isolated</Badge> : null}
        {status?.builtAt ? (
          <span className="hidden text-[10px] text-muted-foreground md:inline">
            Built {new Date(status.builtAt).toLocaleTimeString()}
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => void onRebuild()} disabled={buildBusy}>
            <RefreshCw className={buildBusy ? 'animate-spin motion-reduce:animate-none' : ''} />
            {buildBusy ? 'Building…' : 'Rebuild'}
          </Button>
          <Button variant="ghost" size="sm" onClick={onBack}>
            <Code2 />
            Code
          </Button>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        {loading ? (
          <div className="grid size-full place-items-center text-xs text-muted-foreground">Loading preview…</div>
        ) : error ? (
          <div className="mx-auto max-w-xl p-6">
            <Alert className="border-destructive">
              <TriangleAlert className="mb-2 size-4 text-destructive" />
              <AlertTitle>Preview unavailable</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        ) : !status?.supported ? (
          <div className="grid size-full place-items-center p-6 text-center text-sm text-muted-foreground">
            Preview is available only for React + TypeScript DApp projects.
          </div>
        ) : !status.available || !status.url ? (
          <div className="grid size-full place-items-center p-6">
            <div className="max-w-md text-center">
              <MonitorPlay className="mx-auto size-8 text-muted-foreground" />
              <h2 className="mt-3 text-sm font-semibold">Build the DApp to preview it</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Preview serves the generated static build in a sandboxed frame. It does not expose the workspace dev server or Studio session data.
              </p>
              <Button className="mt-4" size="sm" onClick={() => void onRebuild()} disabled={buildBusy}>
                <RefreshCw className={buildBusy ? 'animate-spin motion-reduce:animate-none' : ''} />
                {buildBusy ? 'Building…' : 'Build preview'}
              </Button>
            </div>
          </div>
        ) : (
          <iframe
            key={`${status.url}:${revision}`}
            data-aeko-preview
            title="AEKO DApp preview"
            src={status.url}
            sandbox="allow-scripts allow-forms"
            referrerPolicy="no-referrer"
            className="size-full border-0 bg-white"
          />
        )}
      </div>
    </section>
  )
}
