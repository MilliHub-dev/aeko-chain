import { useMemo, useState } from 'react'
import type { FileEntry } from '../../shared/contracts/filesystem.js'
import type { Workspace } from '../../shared/contracts/workspace.js'
interface Props { workspace: Workspace; entries: FileEntry[]; activePath: string; onOpen: (path: string) => void | Promise<void>; onNewFile: () => void | Promise<void>; onNewDirectory: () => void | Promise<void>; onRename: (entry: FileEntry) => void | Promise<void>; onDelete: (entry: FileEntry) => void | Promise<void>; onRefresh: () => void }
function hidden(entry: FileEntry, collapsed: ReadonlySet<string>) { const parts=entry.path.split('/'); parts.pop(); let current=''; for(const part of parts){current=current?`${current}/${part}`:part;if(collapsed.has(current))return true} return false }
export default function ExplorerPane({ workspace, entries, activePath, onOpen, onNewFile, onNewDirectory, onRename, onDelete, onRefresh }: Props) {
 const [collapsed,setCollapsed]=useState<Set<string>>(()=>new Set()); const visible=useMemo(()=>entries.filter(e=>!hidden(e,collapsed)),[collapsed,entries])
 const toggle=(path:string)=>setCollapsed(current=>{const next=new Set(current);next.has(path)?next.delete(path):next.add(path);return next})
 return <aside className="explorer-pane"><div className="pane-title"><span>Project</span><small>{workspace.templateLabel}</small></div>
  <div className="workspace-heading"><strong>{workspace.name}</strong><div className="pane-actions"><button type="button" onClick={()=>void onNewFile()}>+ File</button><button type="button" onClick={()=>void onNewDirectory()}>+ Dir</button><button type="button" onClick={onRefresh}>↻</button></div></div>
  <div className="file-tree" role="tree" aria-label="Project files">{visible.map(entry=>{const dir=entry.type==='directory';const shut=dir&&collapsed.has(entry.path);return <div key={entry.path} className={`file-row ${activePath===entry.path?'active':''}`} style={{paddingLeft:`${10+entry.depth*14}px`}} role="treeitem" aria-expanded={dir?!shut:undefined}>
   <button type="button" className="file-open" title={entry.path} onClick={()=>dir?toggle(entry.path):void onOpen(entry.path)}><span className="file-kind">{dir?(shut?'▸':'▾'):'·'}</span><span>{entry.name}</span></button>
   <div className="file-actions"><button type="button" onClick={()=>void onRename(entry)}>Rename</button><button type="button" onClick={()=>void onDelete(entry)}>Delete</button></div></div>})}</div>
 </aside>
}
