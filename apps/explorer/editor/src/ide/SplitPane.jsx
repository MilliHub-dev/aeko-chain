import Split from 'split.js'
import { useEffect, useRef } from 'react'

export default function SplitPane({
  children,
  direction = 'horizontal',
  sizes,
  minSize,
  gutterSize = 4,
  onDragEnd,
  className = '',
}) {
  const rootRef = useRef(null)
  const dragEndRef = useRef(onDragEnd)
  const sizesKey = JSON.stringify(sizes ?? [])
  const minSizeKey = JSON.stringify(minSize ?? [])

  useEffect(() => {
    dragEndRef.current = onDragEnd
  }, [onDragEnd])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return undefined

    const panes = Array.from(root.children).filter((node) => node.dataset.splitPane === 'true')
    if (panes.length < 2) return undefined

    const instance = Split(panes, {
      direction,
      sizes: JSON.parse(sizesKey),
      minSize: JSON.parse(minSizeKey),
      gutterSize,
      snapOffset: 0,
      cursor: direction === 'horizontal' ? 'col-resize' : 'row-resize',
      onDragEnd: (nextSizes) => dragEndRef.current?.(nextSizes),
    })

    return () => instance.destroy()
  }, [direction, gutterSize, minSizeKey, sizesKey])

  return <div ref={rootRef} className={className}>{children}</div>
}

export function Pane({ children, className = '' }) {
  return <div data-split-pane="true" className={className}>{children}</div>
}
