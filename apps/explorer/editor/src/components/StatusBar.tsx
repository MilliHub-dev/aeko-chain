import type { StudioConfig } from '../../shared/contracts/session.js'
import type { Workspace } from '../../shared/contracts/workspace.js'
interface ActiveFile { path: string; content: string }
interface StatusBarProps { config: StudioConfig; workspace: Workspace; activeFile: ActiveFile | null; saving: boolean }
export default function StatusBar({ config, workspace, activeFile, saving }: StatusBarProps) {
  return <footer className="status-bar">
    <div><span className="network-dot" /> <strong>{config.network || 'network'}</strong><span>AEKO Network</span></div>
    <div><span>{saving ? 'Saving…' : 'Saved'}</span><span>{workspace.templateLabel}</span><span>{activeFile?.path || 'No file selected'}</span></div>
  </footer>
}
