import { MonitorPlay, RefreshCw, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { PreviewStatus } from '../../shared/contracts/preview.js'
import { errorMessage } from '../../shared/errors/editor-errors.js'
import { api } from '../lib/api'
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert'
import { Button } from '../components/ui/button'

export default function PreviewPanel({
  workspaceId,
  revision,
  buildBusy,
  onRebuild,
}: {
  workspaceId: string
  revision: number
  buildBusy: boolean
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
    <section className="size-full min-h-0 bg-white" aria-label="DApp preview">
      {loading ? (
        <div className="grid size-full place-items-center bg-[#090b0b] text-xs text-muted-foreground">Loading preview…</div>
      ) : error ? (
        <div className="size-full bg-[#090b0b] p-6">
          <div className="mx-auto max-w-xl">
            <Alert className="border-destructive">
              <TriangleAlert className="mb-2 size-4 text-destructive" />
              <AlertTitle>Preview unavailable</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        </div>
      ) : !status?.supported ? (
        <div className="grid size-full place-items-center bg-[#090b0b] p-6 text-center text-sm text-muted-foreground">
          Preview is available only for React + TypeScript DApp projects.
        </div>
      ) : !status.available || !status.url ? (
        <div className="grid size-full place-items-center bg-[#090b0b] p-6">
          <div className="max-w-md text-center">
            <MonitorPlay className="mx-auto size-8 text-muted-foreground" />
            <h2 className="mt-3 text-sm font-semibold">Build the DApp to preview it</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Interact renders the generated DApp as the editor canvas in an isolated frame. It never exposes the Studio session to DApp code.
            </p>
            <Button className="mt-4" size="sm" onClick={() => void onRebuild()} disabled={buildBusy}>
              <RefreshCw className={buildBusy ? 'animate-spin motion-reduce:animate-none' : ''} />
              {buildBusy ? 'Building…' : 'Build preview'}
            </Button>
          </div>
        </div>
      ) : (
        <iframe
          key={status.url + ':' + String(revision)}
          data-aeko-preview
          title="AEKO DApp preview"
          src={status.url}
          sandbox="allow-scripts allow-forms"
          referrerPolicy="no-referrer"
          className="size-full border-0 bg-white"
        />
      )}
    </section>
  )
}
