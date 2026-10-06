import { io, type Socket } from 'socket.io-client'
import { useEffect, useRef, useState } from 'react'
import type { StudioCommand } from '../../shared/contracts/command.js'
import type { ClientToServerEvents, ServerToClientEvents } from '../../shared/contracts/socket.js'

interface StudioConsoleProps { workspaceId: string }

const LABELS: Record<StudioCommand, string> = {
  build: 'Build',
  test: 'Test',
  run: 'Run',
  clean: 'Clean',
}

export default function StudioConsole({ workspaceId }: StudioConsoleProps) {
  const [history, setHistory] = useState('')
  const [available, setAvailable] = useState<StudioCommand[]>([])
  const [running, setRunning] = useState<StudioCommand | null>(null)
  const [error, setError] = useState('')
  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null)
  const outputRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({
      path: '/socket.io',
      transports: ['polling', 'websocket'],
      upgrade: true,
      withCredentials: true,
    })
    socketRef.current = socket
    let disposed = false
    socket.on('connect', () => { if (!disposed) socket.emit('console:attach', { workspaceId }) })
    socket.on('console:ready', (event) => {
      setHistory(event.history)
      setAvailable(event.available)
      setRunning(event.running)
    })
    socket.on('console:output', (event) => {
      if (event.workspaceId === workspaceId) setHistory((current) => current + event.data)
    })
    socket.on('console:state', (event) => {
      if (event.workspaceId !== workspaceId) return
      setRunning(event.status === 'running' ? event.command : null)
    })
    socket.on('console:error', setError)
    return () => {
      disposed = true
      if (socketRef.current === socket) socketRef.current = null
      socket.removeAllListeners()
      if (socket.connected) socket.disconnect()
    }
  }, [workspaceId])

  useEffect(() => {
    const node = outputRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [history])

  const run = (command: StudioCommand) => {
    setError('')
    socketRef.current?.emit('console:run', { workspaceId, command })
  }

  return (
    <section className="studio-console" aria-label="AEKO Console">
      <header className="console-toolbar">
        <div>
          <strong>AEKO Console</strong>
          <span>{running ? `${LABELS[running]} running` : 'Ready'}</span>
        </div>
        <div className="console-actions">
          {available.map((command) => (
            <button key={command} type="button" disabled={running !== null} onClick={() => run(command)}>
              {LABELS[command]}
            </button>
          ))}
          {running ? (
            <button type="button" className="danger-button" onClick={() => socketRef.current?.emit('console:cancel', { workspaceId })}>
              Stop
            </button>
          ) : null}
        </div>
      </header>
      {error ? <div className="console-error" role="alert">{error}</div> : null}
      <pre ref={outputRef} className="console-output">{history || 'Choose Build, Test, Run, or Clean. AEKO Studio executes only project-scoped commands.\n'}</pre>
    </section>
  )
}
