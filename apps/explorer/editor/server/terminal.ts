import os from 'node:os'
import * as pty from 'node-pty'
import type { IPty, IPtyForkOptions } from 'node-pty'
import type { Server } from 'socket.io'
import type { ClientToServerEvents, InterServerEvents, ServerToClientEvents, SocketData } from '../shared/contracts/socket.js'
import type { EditorSession } from '../shared/contracts/session.js'
import type { TerminalStartRequest } from '../shared/contracts/terminal.js'
import type { EditorServerConfig } from './types.js'
import type { WorkspaceManager } from './workspaces.js'
type StudioSocketServer=Server<ClientToServerEvents,ServerToClientEvents,InterServerEvents,SocketData>
interface TerminalRecord{key:string;room:string;workspaceId:string;sessionId:string;terminal:IPty;history:string;lastUsedAt:number;exited:boolean}
function bounded(value:unknown,fallback:number,max:number){const parsed=Number(value);return Number.isInteger(parsed)&&parsed>0&&parsed<=max?parsed:fallback}
function trim(value:string,maxBytes:number){const buffer=Buffer.from(value);return buffer.length<=maxBytes?value:buffer.subarray(buffer.length-maxBytes).toString('utf8')}
export class TerminalManager{
 readonly terminals=new Map<string,TerminalRecord>()
 constructor(private readonly config:Readonly<EditorServerConfig>,private readonly io:StudioSocketServer,private readonly workspaces:WorkspaceManager){}
 key(sessionId:string,workspaceId:string){return sessionId+':'+workspaceId}
 async start(session:EditorSession,workspaceId:string,dimensions:Pick<TerminalStartRequest,'cols'|'rows'>={}){
  const{root,metadata}=await this.workspaces.assertOwned(session,workspaceId);const key=this.key(session.id,workspaceId);const existing=this.terminals.get(key);if(existing&&!existing.exited){existing.lastUsedAt=Date.now();return existing}
  const room='terminal:'+session.id+':'+workspaceId;const windows=os.platform()==='win32';const shell=windows?'bash.exe':'/bin/bash';const options:IPtyForkOptions={name:'xterm-256color',cols:bounded(dimensions.cols,100,500),rows:bounded(dimensions.rows,30,200),cwd:root,env:{...process.env,HOME:root,LANG:'C.UTF-8',TERM:'xterm-256color',PATH:[root+'/node_modules/.bin','/app/node_modules/.bin','/opt/aeko','/usr/local/cargo/bin','/usr/local/bin','/usr/bin','/bin',String(process.env.PATH||'')].join(os.platform()==='win32'?';':':'),CARGO_HOME:root+'/.cargo',RUSTUP_HOME:windows?String(process.env.RUSTUP_HOME||''):'/usr/local/rustup',CARGO_NET_OFFLINE:'false',RUSTC_WRAPPER:'',AEKO_NETWORK:this.config.network,AEKO_RPC_URL:this.config.rpcUrl,VITE_AEKO_RPC_URL:this.config.rpcUrl,AEKO_EXPLORER_URL:this.config.explorerUrl,PS1:'\\[\\e[38;5;118m\\]'+metadata.name+'\\[\\e[0m\\]:\\w\\$ '}}
  if(!windows&&process.getuid?.()===0){options.uid=session.uid;options.gid=session.gid}
  const terminal=pty.spawn(shell,windows?['--noprofile','--norc']:['--noprofile','--norc'],options);const record:TerminalRecord={key,room,workspaceId,sessionId:session.id,terminal,history:'',lastUsedAt:Date.now(),exited:false}
  terminal.onData(data=>{record.lastUsedAt=Date.now();record.history=trim(record.history+data,this.config.terminalHistoryBytes);this.io.to(room).emit('terminal:data',data)})
  terminal.onExit(({exitCode})=>{record.exited=true;const message='\r\n[terminal exited '+exitCode+']\r\n';record.history=trim(record.history+message,this.config.terminalHistoryBytes);this.io.to(room).emit('terminal:data',message)})
  this.terminals.set(key,record);return record
 }
 input(session:EditorSession,workspaceId:string,data:unknown){const record=this.terminals.get(this.key(session.id,workspaceId));if(!record||record.exited)throw new Error('Terminal is not running.');const value=String(data||'');if(Buffer.byteLength(value)>8192)throw new Error('Terminal input chunk is too large.');record.lastUsedAt=Date.now();record.terminal.write(value)}
 resize(session:EditorSession,workspaceId:string,cols:unknown,rows:unknown){const record=this.terminals.get(this.key(session.id,workspaceId));if(!record||record.exited)return;record.lastUsedAt=Date.now();record.terminal.resize(bounded(cols,100,500),bounded(rows,30,200))}
 closeWorkspace(sessionId:string,workspaceId:string){const key=this.key(sessionId,workspaceId);const record=this.terminals.get(key);try{record?.terminal.kill()}catch { /* terminal may already be closed */ }this.terminals.delete(key)}
 closeSession(sessionId:string){for(const[key,record]of this.terminals){if(record.sessionId!==sessionId)continue;try{record.terminal.kill()}catch { /* terminal may already be closed */ }this.terminals.delete(key)}}
 sweep(maxIdleMs:number){const now=Date.now();for(const[key,record]of this.terminals){if(now-record.lastUsedAt<=maxIdleMs)continue;try{record.terminal.kill()}catch { /* terminal may already be closed */ }this.terminals.delete(key)}}
}
