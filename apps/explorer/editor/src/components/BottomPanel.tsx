import { ChevronDown, ChevronUp } from 'lucide-react'
import StudioConsole from '../ide/StudioConsole'
import { Button } from './ui/button'
interface Props{workspaceId:string;collapsed:boolean;onToggleCollapsed:()=>void}
export default function BottomPanel({workspaceId,collapsed,onToggleCollapsed}:Props){return <section className="flex min-h-0 flex-col border-t border-border bg-background"><header className="flex h-10 shrink-0 items-center justify-between px-3"><div className="flex items-center gap-2"><strong className="text-xs">Console</strong><span className="text-xs text-muted-foreground">Build · test · run</span></div><Button variant="ghost" size="icon" aria-label={collapsed?'Show console':'Hide console'} onClick={onToggleCollapsed}>{collapsed?<ChevronUp/>:<ChevronDown/>}</Button></header>{!collapsed?<div className="min-h-0 flex-1"><StudioConsole workspaceId={workspaceId}/></div>:null}</section>}
