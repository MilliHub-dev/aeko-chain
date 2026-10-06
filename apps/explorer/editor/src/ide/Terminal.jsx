import { FitAddon } from '@xterm/addon-fit'
import { Terminal as Xterm } from '@xterm/xterm'
import { io } from 'socket.io-client'
import { useEffect, useRef } from 'react'

export default function Terminal({ workspaceId, active = true }) {
  const hostRef = useRef(null)

  useEffect(() => {
    if (!workspaceId || !hostRef.current) return undefined

    const terminal = new Xterm({
      allowProposedApi: false,
      convertEol: true,
      cursorBlink: true,
      fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
      fontSize: 12,
      lineHeight: 1.2,
      scrollback: 5000,
      theme: {
        background: '#181818',
        foreground: '#cccccc',
        cursor: '#aeafad',
        selectionBackground: '#264f78',
      },
    })
    const fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.open(hostRef.current)
    fit.fit()

    const socket = io({
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      withCredentials: true,
    })

    socket.on('connect', () => {
      socket.emit('terminal:start', {
        workspaceId,
        cols: terminal.cols,
        rows: terminal.rows,
      })
    })
    socket.on('terminal:ready', ({ history = '' }) => {
      if (history) terminal.write(history)
      terminal.focus()
    })
    socket.on('terminal:data', (data) => terminal.write(String(data || '')))
    socket.on('terminal:error', (message) => {
      terminal.writeln(`\r\n\x1b[31m${String(message || 'Terminal error')}\x1b[0m`)
    })

    const input = terminal.onData((data) => socket.emit('terminal:input', { workspaceId, data }))
    const resize = terminal.onResize(({ cols, rows }) => socket.emit('terminal:resize', { workspaceId, cols, rows }))
    const observer = new ResizeObserver(() => {
      fit.fit()
    })
    observer.observe(hostRef.current)

    return () => {
      observer.disconnect()
      input.dispose()
      resize.dispose()
      socket.disconnect()
      terminal.dispose()
    }
  }, [workspaceId])

  useEffect(() => {
    if (active) {
      window.requestAnimationFrame(() => hostRef.current?.querySelector('textarea')?.focus())
    }
  }, [active])

  return <div ref={hostRef} className="terminal-host" aria-label="Workspace terminal" />
}
