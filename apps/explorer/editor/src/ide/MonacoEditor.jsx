import Editor from '@monaco-editor/react'
import { useCallback } from 'react'
import { languageForPath } from '../lib/language'

export default function MonacoEditor({ workspaceId, file, onChange, onSave }) {
  const beforeMount = useCallback((monaco) => {
    monaco.editor.addKeybindingRule({
      keybinding: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
      command: 'aeko.save',
    })
  }, [])

  const onMount = useCallback((editor, monaco) => {
    editor.addAction({
      id: 'aeko.save',
      label: 'Save',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      run: () => onSave(editor.getValue()),
    })
    editor.focus()
  }, [onSave])

  if (!file) {
    return (
      <div className="editor-empty">
        <div className="editor-empty-mark">AEKO</div>
        <p>Open a file from Explorer to start editing.</p>
      </div>
    )
  }

  return (
    <Editor
      key={`${workspaceId}:${file.path}`}
      path={`file:///workspaces/${workspaceId}/${file.path}`}
      language={languageForPath(file.path)}
      value={file.content}
      theme="vs-dark"
      beforeMount={beforeMount}
      onMount={onMount}
      onChange={(value) => onChange(value ?? '')}
      options={{
        automaticLayout: true,
        fontLigatures: true,
        glyphMargin: true,
        guides: { indentation: true, bracketPairs: true },
        minimap: { enabled: true, side: 'right' },
        padding: { top: 6 },
        scrollBeyondLastLine: false,
        tabSize: 2,
      }}
    />
  )
}
