import { useState } from 'react'
import type {
  CreateWorkspaceRequest,
  ProjectTemplate,
  Workspace,
} from '../../shared/contracts/workspace.js'

interface TemplateCard {
  id: ProjectTemplate
  mark: string
  title: string
  description: string
}

interface WorkspaceLauncherProps {
  workspaces: Workspace[]
  onOpen: (workspaceId: string) => void
  onCreate: (input: CreateWorkspaceRequest) => void | Promise<void>
  onDelete: (workspace: Workspace) => void | Promise<void>
  busy: boolean
}

const TEMPLATES: readonly TemplateCard[] = [
  {
    id: 'rust-program',
    mark: 'SBF',
    title: 'Smart Contract',
    description: 'Native SBF program with Cargo manifest, entrypoint, and smoke test.',
  },
  {
    id: 'typescript-client',
    mark: 'TS',
    title: 'DApp Client',
    description: 'Node 22 TypeScript project with AEKO JSON-RPC client and tests.',
  },
  {
    id: 'python-client',
    mark: 'PY',
    title: 'Automation Client',
    description: 'Python 3 project with an AEKO RPC client example and unittest suite.',
  },
]

export default function WorkspaceLauncher({
  workspaces,
  onOpen,
  onCreate,
  onDelete,
  busy,
}: WorkspaceLauncherProps) {
  const [name, setName] = useState('hello-aeko')
  const [template, setTemplate] = useState<ProjectTemplate>('rust-program')

  return (
    <main className="welcome-shell">
      <section className="welcome-content">
        <header className="welcome-header">
          <div className="brand-mark large">A</div>
          <div>
            <p className="eyebrow">AEKO CONTRACT STUDIO</p>
            <h1>Build contracts and DApps for AEKO</h1>
            <p>A focused blockchain workspace for source, testing, builds, artifacts, and chain workflows.</p>
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
                  <span className="template-mark">{item.mark}</span>
                  <strong>{item.title}</strong>
                  <span>{item.description}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="primary-button create-workspace"
              disabled={busy || !name.trim()}
              onClick={() => void onCreate({ name: name.trim(), template })}
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
                    <span className="project-dot" aria-hidden="true" />
                    <span>
                      <strong>{workspace.name}</strong>
                      <small>{workspace.templateLabel} · {new Date(workspace.updatedAt).toLocaleString()}</small>
                    </span>
                    <span aria-hidden="true">→</span>
                  </button>
                  <button
                    type="button"
                    className="recent-delete"
                    aria-label={`Delete ${workspace.name}`}
                    title="Delete project"
                    onClick={() => void onDelete(workspace)}
                  >
                    ×
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
