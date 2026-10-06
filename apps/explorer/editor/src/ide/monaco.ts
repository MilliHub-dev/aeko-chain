import * as monaco from 'monaco-editor'
import 'monaco-editor/esm/vs/basic-languages/monaco.contribution'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

interface MonacoEnvironmentContract {
  getWorker: (moduleId: string, label: string) => Worker
}

type MonacoGlobal = typeof globalThis & { MonacoEnvironment?: MonacoEnvironmentContract }

;(globalThis as MonacoGlobal).MonacoEnvironment = {
  getWorker(_moduleId, label) {
    if (label === 'json') return new JsonWorker()
    if (label === 'typescript' || label === 'javascript') return new TsWorker()
    return new EditorWorker()
  },
}

monaco.editor.defineTheme('aeko-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#0b0d10',
    'editor.foreground': '#e8edf2',
    'editorLineNumber.foreground': '#47505c',
    'editorLineNumber.activeForeground': '#aab4c0',
    'editorCursor.foreground': '#7dd3fc',
    'editor.selectionBackground': '#18344a',
    'editor.inactiveSelectionBackground': '#122838',
    'editorIndentGuide.background1': '#1d232b',
    'editorIndentGuide.activeBackground1': '#394553',
  },
})
