export default function EditorTabs({ paths, activePath, dirtyPaths, onOpen, onClose }) {
  return (
    <div className="editor-tabs" role="tablist" aria-label="Open files">
      {paths.map((path) => {
        const name = path.split('/').pop()
        return (
          <div
            key={path}
            role="tab"
            aria-selected={path === activePath}
            className={`editor-tab ${path === activePath ? 'active' : ''}`}
          >
            <button type="button" className="tab-open" onClick={() => onOpen(path)}>
              <span>{name}</span>
            </button>
            {dirtyPaths.has(path) ? (
              <span className="dirty-dot" aria-label="Unsaved">●</span>
            ) : (
              <button
                type="button"
                className="tab-close"
                aria-label={`Close ${name}`}
                onClick={() => onClose(path)}
              >
                <i className="codicon codicon-close" aria-hidden="true" />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
