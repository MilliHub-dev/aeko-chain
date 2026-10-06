import { useState } from 'react'

const TEMPLATES = [
  {
    id: 'rust-program',
    icon: 'symbol-structure',
    title: 'AEKO Rust Program',
    description: 'Native SBF program with Cargo manifest, entrypoint, and smoke test.',
  },
  {
    id: 'typescript-client',
    icon: 'symbol-interface',
    title: 'TypeScript Client',
    description: 'Node 22 TypeScript project with AEKO JSON-RPC client and tests.',
  },
  {
    id: 'python-client',
    icon: 'symbol-method',
    title: 'Python Client',
    description: 'Python 3 project with an AEKO RPC client example and unittest suite.',
  },
]

export default function WorkspaceLauncher({
  workspaces,
  onOpen,
  onCreate,
  onDelete,
  busy,
}) {
  const [name, setName] = useState('hello-aeko')
  const [template, setTemplate] = useState('rust-program')

  return (
    <main className="welcome-shell">
      <section className="welcome-content">
        <header className="welcome-header">
          <div className="brand-mark large">A</div>
          <div>
            <p className="eyebrow">AEKO CONTRACT STUDIO</p>
            <h1>Build on AEKO in the browser</h1>
            <p>Monaco editing, isolated project files, and a real per-project terminal.</p>
          </div>
        </header>

        <div className="welcome-grid">
          <section>
            <h2>New project</h2>
            <label className="field-label" htmlFor="project-name">Project name</label>
            <input
              id="project-name"
              className="text-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
            />
            <div className="template-grid">
              {TEMPLATES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`template-card ${template === item.id ? 'selected' : ''}`}
                  onClick={() => setTemplate(item.id)}
                >
                  <i className={`codicon codicon-${item.icon}`} aria-hidden="true" />
                  <strong>{item.title}</strong>
                  <span>{item.description}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="primary-button create-workspace"
              disabled={busy || !name.trim()}
              onClick={() => onCreate({ name: name.trim(), template })}
            >
              {busy ? 'Creating workspace…' : 'Create project'}
            </button>
          </section>

          <section>
            <h2>Recent projects</h2>
            <div className="recent-list">
              {workspaces.length ? workspaces.map((workspace) => (
                <div className="recent-item" key={workspace.id}>
                  <button type="button" className="recent-open" onClick={() => onOpen(workspace.id)}>
                    <i className="codicon codicon-folder-opened" aria-hidden="true" />
                    <span>
                      <strong>{workspace.name}</strong>
                      <small>{workspace.templateLabel} · {new Date(workspace.updatedAt).toLocaleString()}</small>
                    </span>
                    <i className="codicon codicon-chevron-right" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="recent-delete"
                    aria-label={`Delete ${workspace.name}`}
                    title="Delete project"
                    onClick={() => onDelete(workspace)}
                  >
                    <i className="codicon codicon-trash" aria-hidden="true" />
                  </button>
                </div>
              )) : (
                <div className="empty-recent">No server workspace exists for this session yet.</div>
              )}
            </div>
          </section>
        </div>
      </section>
    </main>
  )
}
