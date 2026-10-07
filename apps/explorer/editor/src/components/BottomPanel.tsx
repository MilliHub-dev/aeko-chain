import { ChevronDown, ChevronUp, Maximize2, Minimize2 } from 'lucide-react'
import type { StudioCommand } from '../../shared/contracts/command.js'
import type { StudioConfig } from '../../shared/contracts/session.js'
import type { DevelopmentWallet } from '../aeko/wallet'
import AekoShell from '../ide/AekoShell'
import StudioConsole from '../ide/StudioConsole'
import Terminal from '../ide/Terminal'
import type { StudioTasksController } from '../ide/useStudioTasks'
import { cn } from '../lib/utils'
import { Button } from './ui/button'

export type BottomPanelTab = 'TERMINAL' | 'AEKO' | 'TASKS'

interface Props {
  workspaceId: string
  config: StudioConfig
  wallet: DevelopmentWallet | null
  tasks: StudioTasksController
  tab: BottomPanelTab
  onTabChange: (tab: BottomPanelTab) => void
  onRunTask: (command: StudioCommand) => void | Promise<void>
  onTransactionConfirmed?: () => void | Promise<void>
  collapsed: boolean
  onToggleCollapsed: () => void
  maximized?: boolean
  onToggleMaximized?: () => void
}

const TABS: Array<{ id: BottomPanelTab; label: string }> = [
  { id: 'TERMINAL', label: 'BASH / AEKO CLI' },
  { id: 'AEKO', label: 'AEKO SHELL' },
  { id: 'TASKS', label: 'BUILD & RUN' },
]

export default function BottomPanel({
  workspaceId,
  config,
  wallet,
  tasks,
  tab,
  onTabChange,
  onRunTask,
  onTransactionConfirmed,
  collapsed,
  onToggleCollapsed,
  maximized = false,
  onToggleMaximized,
}: Props) {
  return (
    <section className="flex size-full min-h-0 flex-col border-t border-border bg-background">
      <header className="flex h-10 shrink-0 items-center justify-between px-2">
        <div className="flex h-full items-center gap-1 overflow-x-auto">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={cn(
                'h-full shrink-0 cursor-pointer border-b-2 border-transparent px-3 text-xs font-medium text-muted-foreground hover:text-foreground',
                tab === item.id && 'border-primary text-foreground',
              )}
              onClick={() => {
                onTabChange(item.id)
                if (collapsed) onToggleCollapsed()
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {onToggleMaximized ? (
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label={maximized ? 'Restore panel' : 'Maximize panel'}
              onClick={onToggleMaximized}
            >
              {maximized ? <Minimize2 /> : <Maximize2 />}
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={collapsed ? 'Show panel' : 'Hide panel'}
            onClick={onToggleCollapsed}
          >
            {collapsed ? <ChevronUp /> : <ChevronDown />}
          </Button>
        </div>
      </header>
      {!collapsed ? (
        <div className="min-h-0 flex-1">
          {tab === 'TERMINAL' ? <Terminal workspaceId={workspaceId} /> : null}
          {tab === 'AEKO' ? <AekoShell config={config} wallet={wallet} onTransactionConfirmed={onTransactionConfirmed} /> : null}
          {tab === 'TASKS' ? <StudioConsole tasks={tasks} onRun={onRunTask} /> : null}
        </div>
      ) : null}
    </section>
  )
}
