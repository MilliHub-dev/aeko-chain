import type { StudioConfig } from '../../shared/contracts/session.js'
import type { Workspace } from '../../shared/contracts/workspace.js'
import { Badge } from './ui/badge'
interface ActiveFile{path:string;content:string} interface Props{config:StudioConfig;workspace:Workspace;activeFile:ActiveFile|null;saving:boolean}
export default function StatusBar({config,workspace,activeFile,saving}:Props){return <footer className="flex h-7 items-center justify-between border-t border-border bg-background px-3 text-[11px] text-muted-foreground"><div className="flex items-center gap-2"><span className="size-2 rounded-full bg-primary"/><strong className="text-foreground">{config.network||'network'}</strong><span>AEKO Network</span></div><div className="flex min-w-0 items-center gap-3"><Badge>{saving?'Saving…':'Saved'}</Badge><span>{workspace.templateLabel}</span><span className="max-w-72 truncate">{activeFile?.path||'No file selected'}</span></div></footer>}
