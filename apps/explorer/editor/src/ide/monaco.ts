import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'
import JsonWorker from 'monaco-editor/language/json/json.worker?worker'
import CssWorker from 'monaco-editor/language/css/css.worker?worker'
import HtmlWorker from 'monaco-editor/language/html/html.worker?worker'
import TsWorker from 'monaco-editor/language/typescript/ts.worker?worker'
interface MonacoEnvironmentContract{getWorker:(moduleId:string,label:string)=>Worker}
type MonacoGlobal=typeof globalThis&{MonacoEnvironment?:MonacoEnvironmentContract}
;(globalThis as MonacoGlobal).MonacoEnvironment={getWorker(_moduleId,label){if(label==='json')return new JsonWorker();if(['css','scss','less'].includes(label))return new CssWorker();if(['html','handlebars','razor'].includes(label))return new HtmlWorker();if(label==='typescript'||label==='javascript')return new TsWorker();return new EditorWorker()}}
const compilerOptions: monaco.languages.typescript.CompilerOptions={target:monaco.languages.typescript.ScriptTarget.ES2022,module:monaco.languages.typescript.ModuleKind.ESNext,moduleResolution:monaco.languages.typescript.ModuleResolutionKind.NodeJs,jsx:monaco.languages.typescript.JsxEmit.ReactJSX,allowJs:true,checkJs:true,allowNonTsExtensions:true,esModuleInterop:true,allowSyntheticDefaultImports:true,strict:true,noEmit:true}
monaco.languages.typescript.typescriptDefaults.setCompilerOptions(compilerOptions)
monaco.languages.typescript.javascriptDefaults.setCompilerOptions(compilerOptions)
monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({noSemanticValidation:false,noSyntaxValidation:false,noSuggestionDiagnostics:false})
monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({noSemanticValidation:false,noSyntaxValidation:false,noSuggestionDiagnostics:false})
monaco.languages.typescript.typescriptDefaults.setEagerModelSync(true)
monaco.languages.typescript.javascriptDefaults.setEagerModelSync(true)
monaco.editor.defineTheme('aeko-dark',{base:'vs-dark',inherit:true,rules:[],colors:{'editor.background':'#052E2B','editor.foreground':'#f4f4f5','editorLineNumber.foreground':'#55736f','editorLineNumber.activeForeground':'#d4d4d8','editorCursor.foreground':'#5FB51F','editor.selectionBackground':'#24544f','editor.inactiveSelectionBackground':'#183f3b','editorIndentGuide.background1':'#17433f','editorIndentGuide.activeBackground1':'#35655f'}})
export function workspaceUri(workspaceId:string,path:string){return monaco.Uri.parse('file:///workspaces/'+workspaceId+'/'+path)}
export function hasWorkspaceModel(workspaceId:string,path:string){return Boolean(monaco.editor.getModel(workspaceUri(workspaceId,path)))}
export function ensureWorkspaceModel(workspaceId:string,path:string,content:string,language:string){const uri=workspaceUri(workspaceId,path);const existing=monaco.editor.getModel(uri);if(existing)return existing;return monaco.editor.createModel(content,language,uri)}
export { monaco }
