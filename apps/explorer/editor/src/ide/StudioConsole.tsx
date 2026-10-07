import { useEffect, useRef } from 'react'
import { Braces, CheckCheck, Hammer, Play, RotateCcw, Sparkles, Square, TestTube2 } from 'lucide-react'
import type { StudioCommand } from '../../shared/contracts/command.js'
import { Alert, AlertDescription } from '../components/ui/alert'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import type { StudioTasksController } from './useStudioTasks'

interface Props {
  tasks: StudioTasksController
  onRun: (command: StudioCommand) => void | Promise<void>
}

const LABELS: Record<StudioCommand, string> = {
  build: 'Build',
  check: 'Check',
  lint: 'Lint',
  typecheck: 'Typecheck',
  format: 'Format',
  test: 'Test',
  run: 'Run',
  clean: 'Clean',
}

const ICONS: Record<StudioCommand, typeof Hammer> = {
  build: Hammer,
  check: CheckCheck,
  lint: Sparkles,
  typecheck: Braces,
  format: Sparkles,
  test: TestTube2,
  run: Play,
  clean: RotateCcw,
}

export default function StudioConsole({ tasks, onRun }: Props) {
  const outputRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    const node = outputRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [tasks.history])

  return (
    <section className="flex size-full min-h-0 flex-col" aria-label="AEKO Console">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <strong className="text-xs">AEKO Console</strong>
          <Badge>{tasks.running ? `${LABELS[tasks.running]} running` : tasks.connected ? 'Ready' : 'Connecting'}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {tasks.available.map((command) => {
            const Icon = ICONS[command]
            return (
              <Button
                key={command}
                variant="ghost"
                size="sm"
                disabled={tasks.running !== null || !tasks.connected}
                onClick={() => void onRun(command)}
              >
                <Icon />
                {LABELS[command]}
              </Button>
            )
          })}
          {tasks.running ? (
            <Button variant="destructive" size="sm" onClick={tasks.cancel}>
              <Square />
              Stop
            </Button>
          ) : null}
        </div>
      </header>
      {tasks.error ? (
        <Alert className="m-2 w-auto border-destructive">
          <AlertDescription className="text-destructive">{tasks.error}</AlertDescription>
        </Alert>
      ) : null}
      <pre
        ref={outputRef}
        className="min-h-0 flex-1 overflow-auto bg-card/40 p-3 font-mono text-xs leading-5 text-muted-foreground"
      >
        {tasks.history || 'Choose Build, Check, Lint, Typecheck, Format, Test, Run, or Clean. AEKO Studio executes only project-scoped commands.\n'}
      </pre>
    </section>
  )
}
