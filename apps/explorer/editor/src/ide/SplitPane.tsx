import Split from 'split.js'
import { useEffect, useRef, type ReactNode } from 'react'

interface SplitPaneProps {
  children: ReactNode
  direction?: 'horizontal' | 'vertical'
  sizes: number[]
  minSize: number[]
  gutterSize?: number
  onDragEnd?: (sizes: number[]) => void
  className?: string
}

interface PaneProps {
  children: ReactNode
  className?: string
}

export default function SplitPane({
  children,
  direction = 'horizontal',
  sizes,
  minSize,
  gutterSize = 4,
  onDragEnd,
  className = '',
}: SplitPaneProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const dragEndRef = useRef(onDragEnd)
  const sizesKey = JSON.stringify(sizes)
  const minSizeKey = JSON.stringify(minSize)

  useEffect(() => {
    dragEndRef.current = onDragEnd
  }, [onDragEnd])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return undefined

    const panes = Array.from(root.children)
      .filter((node): node is HTMLElement => node instanceof HTMLElement && node.dataset.splitPane === 'true')
    if (panes.length < 2) return undefined

    const instance = Split(panes, {
      direction,
      sizes: JSON.parse(sizesKey) as number[],
      minSize: JSON.parse(minSizeKey) as number[],
      gutterSize,
      snapOffset: 0,
      cursor: direction === 'horizontal' ? 'col-resize' : 'row-resize',
      onDragEnd: (nextSizes) => dragEndRef.current?.(nextSizes),
    })

    return () => instance.destroy()
  }, [direction, gutterSize, minSizeKey, sizesKey])

  return <div ref={rootRef} className={className}>{children}</div>
}

export function Pane({ children, className = '' }: PaneProps) {
  return <div data-split-pane="true" className={className}>{children}</div>
}
