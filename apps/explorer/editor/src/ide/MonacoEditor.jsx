import * as monaco from 'monaco-editor'
import { useEffect, useRef } from 'react'
import { languageForPath } from '../lib/language'

export default function MonacoEditor({ workspaceId, file, onChange, onSave }) {
  const hostRef = useRef(null)
  const onChangeRef = useRef(onChange)
  const onSaveRef = useRef(onSave)
  const filePath = file?.path || ''
  const initialContentRef = useRef(file?.content ?? '')

  useEffect(() => {
    onChangeRef.current = onChange
    onSaveRef.current = onSave
  }, [onChange, onSave])

  useEffect(() => {
    if (!filePath || !hostRef.current) return undefined

    const uri = monaco.Uri.parse(`file:///workspaces/${workspaceId}/${filePath}`)
    const language = languageForPath(filePath)
    let model = monaco.editor.getModel(uri)

    if (!model) {
      model = monaco.editor.createModel(initialContentRef.current, language, uri)
    } else {
      monaco.editor.setModelLanguage(model, language)
      if (model.getValue() !== initialContentRef.current) {
        model.setValue(initialContentRef.current)
      }
    }

    const editor = monaco.editor.create(hostRef.current, {
      model,
      theme: 'vs-dark',
      automaticLayout: true,
      fontLigatures: true,
      glyphMargin: true,
      guides: { indentation: true, bracketPairs: true },
      minimap: { enabled: true, side: 'right' },
      padding: { top: 6 },
      scrollBeyondLastLine: false,
      tabSize: 2,
    })

    const changeSubscription = model.onDidChangeContent(() => {
      onChangeRef.current?.(model.getValue())
    })

    editor.addAction({
      id: 'aeko.save',
      label: 'Save',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      run: () => onSaveRef.current?.(model.getValue()),
    })

    editor.focus()

    return () => {
      changeSubscription.dispose()
      editor.dispose()
    }
  }, [filePath, workspaceId])

  if (!filePath) {
    return (
      <div className="editor-empty">
        <div className="editor-empty-mark">AEKO</div>
        <p>Open a file from Explorer to start editing.</p>
      </div>
    )
  }

  return (
    <div
      ref={hostRef}
      className="monaco-editor-host"
      aria-label={`Editor for ${filePath}`}
    />
  )
}
