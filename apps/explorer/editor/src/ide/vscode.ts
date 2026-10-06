import * as monaco from 'monaco-editor'
import { initialize } from '@codingame/monaco-vscode-api'
import getConfigurationServiceOverride, { updateUserConfiguration } from '@codingame/monaco-vscode-configuration-service-override'
import getKeybindingsServiceOverride from '@codingame/monaco-vscode-keybindings-service-override'
import getThemeServiceOverride from '@codingame/monaco-vscode-theme-service-override'
import '@codingame/monaco-vscode-theme-defaults-default-extension'
import 'monaco-editor/esm/vs/basic-languages/monaco.contribution'

import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

interface MonacoEnvironmentContract {
  getWorker: (moduleId: string, label: string) => Worker
}

type MonacoGlobal = typeof globalThis & { MonacoEnvironment?: MonacoEnvironmentContract }

let initialized = false

export async function initializeVscode(): Promise<typeof monaco> {
  if (initialized) return monaco

  ;(globalThis as MonacoGlobal).MonacoEnvironment = {
    getWorker(_moduleId, label) {
      if (label === 'json' || label === 'JsonWorker') return new JsonWorker()
      if (['css', 'scss', 'less', 'CssWorker'].includes(label)) return new CssWorker()
      if (['html', 'handlebars', 'razor', 'HtmlWorker'].includes(label)) return new HtmlWorker()
      if (['typescript', 'javascript', 'TypeScriptWorker'].includes(label)) return new TsWorker()
      return new EditorWorker()
    },
  }

  await initialize({
    ...getConfigurationServiceOverride(),
    ...getKeybindingsServiceOverride(),
    ...getThemeServiceOverride(),
  })

  const ts = monaco.languages.typescript
  const compilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    jsx: ts.JsxEmit.ReactJSX,
    allowJs: true,
    checkJs: true,
    allowNonTsExtensions: true,
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    strict: true,
    noEmit: true,
  } satisfies monaco.languages.typescript.CompilerOptions
  ts.typescriptDefaults.setCompilerOptions(compilerOptions)
  ts.javascriptDefaults.setCompilerOptions(compilerOptions)
  ts.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
    noSuggestionDiagnostics: false,
  })
  ts.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
    noSuggestionDiagnostics: false,
  })
  ts.typescriptDefaults.setEagerModelSync(true)
  ts.javascriptDefaults.setEagerModelSync(true)

  monaco.editor.defineTheme('aeko-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#052E2B',
      'editor.foreground': '#f4f4f5',
      'editorLineNumber.foreground': '#55736f',
      'editorLineNumber.activeForeground': '#d4d4d8',
      'editorCursor.foreground': '#5FB51F',
      'editor.selectionBackground': '#24544f',
      'editor.inactiveSelectionBackground': '#183f3b',
      'editorIndentGuide.background1': '#17433f',
      'editorIndentGuide.activeBackground1': '#35655f',
    },
  })

  await updateUserConfiguration(JSON.stringify({
    'editor.fontFamily': "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
    'editor.fontSize': 13,
    'editor.lineHeight': 20,
    'editor.minimap.enabled': true,
    'editor.renderWhitespace': 'selection',
    'editor.smoothScrolling': true,
    'editor.stickyScroll.enabled': true,
    'editor.wordWrap': 'off',
    'files.autoSave': 'afterDelay',
    'files.autoSaveDelay': 900,
    'workbench.colorTheme': 'Default Dark Modern',
  }))

  initialized = true
  return monaco
}
