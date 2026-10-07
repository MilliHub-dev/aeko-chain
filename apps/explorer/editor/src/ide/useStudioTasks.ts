import { io, type Socket } from 'socket.io-client'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { StudioCommand } from '../../shared/contracts/command.js'
import type { ClientToServerEvents, ServerToClientEvents } from '../../shared/contracts/socket.js'

export interface StudioTasksController {
  history: string
  available: StudioCommand[]
  running: StudioCommand | null
  error: string
  connected: boolean
  run: (command: StudioCommand) => void
  cancel: () => void
}

export function useStudioTasks(workspaceId: string): StudioTasksController {
  const [history, setHistory] = useState('')
  const [available, setAvailable] = useState<StudioCommand[]>([])
  const [running, setRunning] = useState<StudioCommand | null>(null)
  const [error, setError] = useState('')
  const [connected, setConnected] = useState(false)
  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null)

  useEffect(() => {
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({
      path: '/socket.io',
      transports: ['polling', 'websocket'],
      upgrade: true,
      withCredentials: true,
    })
    socketRef.current = socket
    let disposed = false

    socket.on('connect', () => {
      if (disposed) return
      setConnected(true)
      setError('')
      socket.emit('console:attach', { workspaceId })
    })
    socket.on('disconnect', () => {
      if (!disposed) setConnected(false)
    })
    socket.on('connect_error', (cause) => {
      if (!disposed) {
        setConnected(false)
        setError(cause.message || 'AEKO task connection failed.')
      }
    })
    socket.on('console:ready', (event) => {
      if (disposed) return
      setHistory(event.history)
      setAvailable(event.available)
      setRunning(event.running)
    })
    socket.on('console:output', (event) => {
      if (!disposed && event.workspaceId === workspaceId) {
        setHistory((current) => current + event.data)
      }
    })
    socket.on('console:state', (event) => {
      if (!disposed && event.workspaceId === workspaceId) {
        setRunning(event.status === 'running' ? event.command : null)
      }
    })
    socket.on('console:error', (message) => {
      if (!disposed) setError(message)
    })

    return () => {
      disposed = true
      if (socketRef.current === socket) socketRef.current = null
      socket.removeAllListeners()
      if (socket.connected) socket.disconnect()
    }
  }, [workspaceId])

  const run = useCallback((command: StudioCommand) => {
    setError('')
    socketRef.current?.emit('console:run', { workspaceId, command })
  }, [workspaceId])

  const cancel = useCallback(() => {
    setError('')
    socketRef.current?.emit('console:cancel', { workspaceId })
  }, [workspaceId])

  return { history, available, running, error, connected, run, cancel }
}
