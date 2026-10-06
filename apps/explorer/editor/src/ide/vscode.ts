import * as monaco from 'monaco-editor'
import { initialize } from '@codingame/monaco-vscode-api'
import getConfigurationServiceOverride, { updateUserConfiguration } from '@codingame/monaco-vscode-configuration-service-override'
import getKeybindingsServiceOverride from '@codingame/monaco-vscode-keybindings-service-override'
import getThemeServiceOverride from '@codingame/monaco-vscode-theme-service-override'
import '@codingame/monaco-vscode-theme-defaults-default-extension'
import 'monaco-editor/esm/vs/basic-languages/monaco.contribution'
import 'monaco-editor/esm/vs/language/typescript/monaco.contribution'

import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

interface MonacoEnvironmentContract {
  getWorker: (moduleId: string, label: string) => Worker
}

type MonacoGlobal = typeof globalThis & { MonacoEnvironment?: MonacoEnvironmentContract }

interface CompilerOptions {
  target: number
  module: number
  moduleResolution: number
  jsx: number
  allowJs: boolean
  checkJs: boolean
  allowNonTsExtensions: boolean
  esModuleInterop: boolean
  allowSyntheticDefaultImports: boolean
  strict: boolean
  noEmit: boolean
}

interface LanguageServiceDefaults {
  setCompilerOptions: (options: CompilerOptions) => void
  setDiagnosticsOptions: (options: {
    noSemanticValidation: boolean
    noSyntaxValidation: boolean
    noSuggestionDiagnostics: boolean
  }) => void
  setEagerModelSync: (value: boolean) => void
}

interface TypeScriptLanguageApi {
  ScriptTarget: { ES2022: number }
  ModuleKind: { ESNext: number }
  ModuleResolutionKind: { NodeJs: number }
  JsxEmit: { ReactJSX: number }
  typescriptDefaults: LanguageServiceDefaults
  javascriptDefaults: LanguageServiceDefaults
}

function typescriptLanguageApi(): TypeScriptLanguageApi {
  const languages = monaco.languages as typeof monaco.languages & {
    typescript?: TypeScriptLanguageApi
  }
  if (!languages.typescript) {
    throw new Error('Monaco TypeScript language services were not registered.')
  }
  return languages.typescript
}

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

  const ts = typescriptLanguageApi()
  const compilerOptions: CompilerOptions = {
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
  }
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
