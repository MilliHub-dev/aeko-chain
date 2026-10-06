import * as monaco from 'monaco-editor'
import 'monaco-editor/esm/vs/basic-languages/monaco.contribution'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
interface MonacoEnvironmentContract{getWorker:(moduleId:string,label:string)=>Worker}
type MonacoGlobal=typeof globalThis&{MonacoEnvironment?:MonacoEnvironmentContract}
;(globalThis as MonacoGlobal).MonacoEnvironment={getWorker(_moduleId,label){if(label==='json'||label==='JsonWorker')return new JsonWorker();if(['css','scss','less','CssWorker'].includes(label))return new CssWorker();if(['html','handlebars','razor','HtmlWorker'].includes(label))return new HtmlWorker();if(['typescript','javascript','TypeScriptWorker'].includes(label))return new TsWorker();return new EditorWorker()}}
monaco.editor.defineTheme('aeko-dark',{base:'vs-dark',inherit:true,rules:[],colors:{'editor.background':'#052E2B','editor.foreground':'#f4f4f5','editorLineNumber.foreground':'#55736f','editorLineNumber.activeForeground':'#d4d4d8','editorCursor.foreground':'#5FB51F','editor.selectionBackground':'#24544f','editor.inactiveSelectionBackground':'#183f3b','editorIndentGuide.background1':'#17433f','editorIndentGuide.activeBackground1':'#35655f'}})
export function workspaceUri(workspaceId:string,path:string){return monaco.Uri.parse('file:///workspaces/'+workspaceId+'/'+path)}
export function hasWorkspaceModel(workspaceId:string,path:string){return Boolean(monaco.editor.getModel(workspaceUri(workspaceId,path)))}
export function ensureWorkspaceModel(workspaceId:string,path:string,content:string,language:string){const uri=workspaceUri(workspaceId,path);const existing=monaco.editor.getModel(uri);if(existing)return existing;return monaco.editor.createModel(content,language,uri)}
export { monaco }
