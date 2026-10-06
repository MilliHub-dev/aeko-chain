import * as monaco from 'monaco-editor'
import { useEffect, useRef } from 'react'
import { languageForPath } from '../lib/language'

interface EditorFile { path: string; content: string }
interface MonacoEditorProps {
  workspaceId: string
  file: EditorFile | null
  onChange: (content: string) => void
  onSave: (content: string) => void | Promise<void>
}

export default function MonacoEditor({ workspaceId, file, onChange, onSave }: MonacoEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const onChangeRef = useRef(onChange)
  const onSaveRef = useRef(onSave)
  const filePath = file?.path || ''
  const initialContentRef = useRef(file?.content ?? '')

  useEffect(() => {
    onChangeRef.current = onChange
    onSaveRef.current = onSave
  }, [onChange, onSave])

  useEffect(() => {
    const host = hostRef.current
    if (!filePath || !host) return undefined

    const uri = monaco.Uri.parse(`file:///workspaces/${workspaceId}/${filePath}`)
    const language = languageForPath(filePath)
    let model = monaco.editor.getModel(uri)
    if (!model) model = monaco.editor.createModel(initialContentRef.current, language, uri)
    else {
      monaco.editor.setModelLanguage(model, language)
      if (model.getValue() !== initialContentRef.current) model.setValue(initialContentRef.current)
    }

    const instance = monaco.editor.create(host, {
      model,
      theme: 'aeko-dark',
      automaticLayout: false,
      fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
      fontSize: 13,
      lineHeight: 21,
      fontLigatures: true,
      glyphMargin: false,
      folding: true,
      guides: { indentation: true, bracketPairs: true },
      minimap: { enabled: false },
      padding: { top: 14, bottom: 14 },
      renderWhitespace: 'selection',
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      stickyScroll: { enabled: true },
      tabSize: 2,
    })

    const layout = () => {
      const rect = host.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) instance.layout({ width: rect.width, height: rect.height })
    }
    const observer = new ResizeObserver(layout)
    observer.observe(host)
    requestAnimationFrame(layout)

    const subscription = model.onDidChangeContent(() => onChangeRef.current(model.getValue()))
    instance.addAction({
      id: 'aeko.save',
      label: 'Save',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      run: () => onSaveRef.current(model.getValue()),
    })
    instance.focus()

    return () => {
      observer.disconnect()
      subscription.dispose()
      instance.dispose()
    }
  }, [filePath, workspaceId])

  if (!filePath) return <div className="editor-empty"><div className="editor-empty-mark">AEKO</div><p>Select a source file to begin.</p></div>
  return <div ref={hostRef} className="monaco-editor-host" aria-label={`Editor for ${filePath}`} />
}
