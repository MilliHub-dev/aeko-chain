interface EditorTabsProps { paths: string[]; activePath: string; dirtyPaths: ReadonlySet<string>; onOpen: (path: string) => void; onClose: (path: string) => void | Promise<void> }
export default function EditorTabs({ paths, activePath, dirtyPaths, onOpen, onClose }: EditorTabsProps) {
  return <div className="editor-tabs" role="tablist" aria-label="Open files">{paths.map((path) => {
    const name = path.split('/').pop() || path
    return <div key={path} role="tab" aria-selected={path === activePath} className={`editor-tab ${path === activePath ? 'active' : ''}`}>
      <button type="button" className="tab-open" onClick={() => onOpen(path)}><span>{name}</span></button>
      {dirtyPaths.has(path) ? <span className="dirty-dot" aria-label="Unsaved">●</span> : <button type="button" className="tab-close" aria-label={`Close ${name}`} onClick={() => void onClose(path)}>×</button>}
    </div>
  })}</div>
}
