import { useCallback, useEffect, useRef, useState } from 'react'
import type { FileEntry } from '../../shared/contracts/filesystem.js'
import type { StudioConfig } from '../../shared/contracts/session.js'
import type { Workspace as WorkspaceContract } from '../../shared/contracts/workspace.js'
import { errorMessage } from '../../shared/errors/editor-errors.js'
import ActivityBar from '../components/ActivityBar'
import BottomPanel from '../components/BottomPanel'
import EditorTabs from '../components/EditorTabs'
import ExplorerPane from '../components/ExplorerPane'
import StatusBar from '../components/StatusBar'
import { api } from '../lib/api'
import MonacoEditor from './MonacoEditor'

interface Props { workspace: WorkspaceContract; config: StudioConfig; onHome: () => void | Promise<void>; onLogout: () => void | Promise<void> }
function remap(path:string,from:string,to:string){return path===from?to:path.startsWith(from+'/')?to+path.slice(from.length):path}

export default function Workspace({ workspace, config, onHome, onLogout }: Props) {
 const [entries,setEntries]=useState<FileEntry[]>([]), [openFiles,setOpenFiles]=useState<string[]>([]), [activePath,setActivePath]=useState('')
 const [buffers,setBuffers]=useState<Map<string,string>>(()=>new Map()), [dirtyPaths,setDirtyPaths]=useState<Set<string>>(()=>new Set())
 const [saving,setSaving]=useState(false), [error,setError]=useState(''), [consoleCollapsed,setConsoleCollapsed]=useState(false)
 const saveTimers=useRef<Map<string,number>>(new Map())
 const refreshTree=useCallback(async()=>{const next=await api.tree(workspace.id);setEntries(next.files)},[workspace.id])
 const report=useCallback((cause:unknown)=>setError(errorMessage(cause,'Workspace operation failed.')),[])
 useEffect(()=>{const timers=saveTimers.current;void refreshTree().catch(report);return()=>{for(const timer of timers.values())window.clearTimeout(timer);timers.clear()}},[refreshTree,report])
 const openFile=useCallback(async(path:string)=>{try{let content=buffers.get(path);if(content===undefined){const result=await api.readFile(workspace.id,path);content=result.content;setBuffers(current=>new Map(current).set(path,result.content))}setOpenFiles(current=>current.includes(path)?current:[...current,path]);setActivePath(path);setError('')}catch(cause){report(cause)}},[buffers,report,workspace.id])
 useEffect(()=>{const first=entries.find(e=>e.type==='file');if(!activePath&&first)void openFile(first.path)},[activePath,entries,openFile])
 const saveFile=useCallback(async(path:string,content:string)=>{if(!path)return;setSaving(true);try{await api.writeFile(workspace.id,path,content);setDirtyPaths(current=>{const next=new Set(current);next.delete(path);return next});setError('')}catch(cause){report(cause);throw cause}finally{setSaving(false)}},[report,workspace.id])
 const flushDirty=useCallback(async()=>{for(const path of dirtyPaths){const timer=saveTimers.current.get(path);if(timer!==undefined){clearTimeout(timer);saveTimers.current.delete(path)}await saveFile(path,buffers.get(path)??'')}},[buffers,dirtyPaths,saveFile])
 const changeFile=(content:string)=>{if(!activePath)return;setBuffers(current=>new Map(current).set(activePath,content));setDirtyPaths(current=>new Set(current).add(activePath));const existing=saveTimers.current.get(activePath);if(existing!==undefined)clearTimeout(existing);saveTimers.current.set(activePath,window.setTimeout(()=>{saveTimers.current.delete(activePath);void saveFile(activePath,content).catch(()=>undefined)},900))}
 const closeFile=async(path:string)=>{try{if(dirtyPaths.has(path))await saveFile(path,buffers.get(path)??'');setOpenFiles(current=>{const next=current.filter(item=>item!==path);if(path===activePath)setActivePath(next.at(-1)||'');return next})}catch{}}
 const newFile=async()=>{const path=prompt('Relative file path',workspace.defaultNewFile||'src/new_file.rs');if(!path)return;try{await api.createFile(workspace.id,path,'');await refreshTree();await openFile(path)}catch(cause){report(cause)}}
 const newDirectory=async()=>{const path=prompt('Relative folder path','src/module');if(!path)return;try{await api.createDirectory(workspace.id,path);await refreshTree()}catch(cause){report(cause)}}
 const renameEntry=async(entry:FileEntry)=>{const to=prompt('Rename path',entry.path);if(!to||to===entry.path)return;try{const result=await api.renamePath(workspace.id,entry.path,to);setBuffers(current=>{const next=new Map<string,string>();for(const [path,value] of current)next.set(remap(path,result.from,result.to),value);return next});setOpenFiles(current=>current.map(path=>remap(path,result.from,result.to)));setDirtyPaths(current=>new Set([...current].map(path=>remap(path,result.from,result.to))));setActivePath(path=>remap(path,result.from,result.to));await refreshTree()}catch(cause){report(cause)}}
 const deleteEntry=async(entry:FileEntry)=>{if(!confirm(`Delete ${entry.path}? This cannot be undone.`))return;try{await api.deletePath(workspace.id,entry.path);const affected=(path:string)=>path===entry.path||path.startsWith(entry.path+'/');setOpenFiles(current=>current.filter(path=>!affected(path)));setBuffers(current=>{const next=new Map(current);for(const path of next.keys())if(affected(path))next.delete(path);return next});setDirtyPaths(current=>new Set([...current].filter(path=>!affected(path))));if(affected(activePath))setActivePath('');await refreshTree()}catch(cause){report(cause)}}
 const activeFile=activePath?{path:activePath,content:buffers.get(activePath)??''}:null
 const leave=async(target:()=>void|Promise<void>)=>{try{await flushDirty();await target()}catch{}}
 return <div className="studio-root">
  <header className="studio-topbar"><div className="studio-title"><span className="aeko-glyph">A</span><div><strong>AEKO Studio</strong><small>{workspace.name}</small></div></div><div className="workflow-strip"><span className="active">Write</span><span>Build</span><span>Test</span><span className="locked">Deploy</span><span className="locked">Interact</span></div><div className="network-chip"><span className="network-dot"/>{config.network}</div></header>
  <div className="studio-body">
   <ActivityBar onHome={()=>void leave(onHome)} onLogout={()=>void leave(onLogout)}/>
   <ExplorerPane workspace={workspace} entries={entries} activePath={activePath} onOpen={openFile} onNewFile={newFile} onNewDirectory={newDirectory} onRename={renameEntry} onDelete={deleteEntry} onRefresh={()=>void refreshTree().catch(report)}/>
   <main className="code-workspace"><div className="editor-stack"><EditorTabs paths={openFiles} activePath={activePath} dirtyPaths={dirtyPaths} onOpen={setActivePath} onClose={closeFile}/><div className="monaco-slot"><MonacoEditor key={`${workspace.id}:${activePath}`} workspaceId={workspace.id} file={activeFile} onChange={changeFile} onSave={content=>saveFile(activePath,content)}/></div></div><BottomPanel workspaceId={workspace.id} collapsed={consoleCollapsed} onToggleCollapsed={()=>setConsoleCollapsed(v=>!v)}/></main>
   <aside className="contract-panel"><p className="eyebrow">PROJECT CONTEXT</p><h2>{workspace.name}</h2><dl><div><dt>Type</dt><dd>{workspace.templateLabel}</dd></div><div><dt>Network</dt><dd>{config.network}</dd></div><div><dt>Source</dt><dd>{activePath||'Select a file'}</dd></div><div><dt>Program ID</dt><dd>Not deployed</dd></div></dl><div className="context-callout"><strong>Deployment signing</strong><p>Deploy and Interact stay locked until AEKO Studio has a wallet-backed signing contract. Server validator keys are never exposed here.</p></div></aside>
  </div>
  {error?<div className="workspace-notice" role="alert"><span>{error}</span><button type="button" onClick={()=>setError('')}>×</button></div>:null}
  <StatusBar config={config} workspace={workspace} activeFile={activeFile} saving={saving}/>
 </div>
}
