import * as monaco from 'monaco-editor'
import { loader } from '@monaco-editor/react'
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

let initialized = false

export async function initializeVscode() {
  if (initialized) return monaco

  globalThis.MonacoEnvironment = {
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

  loader.config({ monaco })
  initialized = true
  return monaco
}
