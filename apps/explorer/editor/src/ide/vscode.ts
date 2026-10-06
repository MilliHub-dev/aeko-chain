import * as monaco from 'monaco-editor'
import { initialize } from '@codingame/monaco-vscode-api'
import getConfigurationServiceOverride, { updateUserConfiguration } from '@codingame/monaco-vscode-configuration-service-override'
import getKeybindingsServiceOverride from '@codingame/monaco-vscode-keybindings-service-override'
import {
  javascriptDefaults,
  typescriptDefaults,
} from '@codingame/monaco-vscode-standalone-typescript-language-features'
import 'monaco-editor/esm/vs/basic-languages/monaco.contribution'

import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import TsWorker from '@codingame/monaco-vscode-standalone-typescript-language-features/worker?worker'

interface MonacoEnvironmentContract {
  getWorker: (moduleId: string, label: string) => Worker
}

type MonacoGlobal = typeof globalThis & { MonacoEnvironment?: MonacoEnvironmentContract }
type TypeScriptCompilerOptions = Parameters<typeof typescriptDefaults.setCompilerOptions>[0]

// The standalone package exposes the defaults/worker but not these enum objects at runtime.
// Keep their pinned TypeScript numeric values here so Vite never requests non-existent exports.
const TS_COMPILER = {
  scriptTargetLatest: 99,
  moduleEsNext: 99,
  moduleResolutionNodeJs: 2,
  jsxReactJsx: 4,
} as const

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
  })

  const compilerOptions: TypeScriptCompilerOptions = {
    target: TS_COMPILER.scriptTargetLatest,
    module: TS_COMPILER.moduleEsNext,
    moduleResolution: TS_COMPILER.moduleResolutionNodeJs,
    jsx: TS_COMPILER.jsxReactJsx,
    allowJs: true,
    checkJs: true,
    allowNonTsExtensions: true,
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    strict: true,
    noEmit: true,
  }
  typescriptDefaults.setCompilerOptions(compilerOptions)
  javascriptDefaults.setCompilerOptions(compilerOptions)
  typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
    noSuggestionDiagnostics: false,
  })
  javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
    noSuggestionDiagnostics: false,
  })
  typescriptDefaults.setEagerModelSync(true)
  javascriptDefaults.setEagerModelSync(true)

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
  }))

  initialized = true
  return monaco
}
