import * as monaco from 'monaco-editor'
monaco.editor.defineTheme('aeko-dark',{base:'vs-dark',inherit:true,rules:[],colors:{'editor.background':'#052E2B','editor.foreground':'#f4f4f5','editorLineNumber.foreground':'#55736f','editorLineNumber.activeForeground':'#d4d4d8','editorCursor.foreground':'#5FB51F','editor.selectionBackground':'#24544f','editor.inactiveSelectionBackground':'#183f3b','editorIndentGuide.background1':'#17433f','editorIndentGuide.activeBackground1':'#35655f'}})
export function workspaceUri(workspaceId:string,path:string){return monaco.Uri.parse('file:///workspaces/'+workspaceId+'/'+path)}
export function hasWorkspaceModel(workspaceId:string,path:string){return Boolean(monaco.editor.getModel(workspaceUri(workspaceId,path)))}
export function ensureWorkspaceModel(workspaceId:string,path:string,content:string,language:string){const uri=workspaceUri(workspaceId,path);const existing=monaco.editor.getModel(uri);if(existing)return existing;return monaco.editor.createModel(content,language,uri)}
export { monaco }
