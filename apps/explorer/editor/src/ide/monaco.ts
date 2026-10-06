import * as monaco from 'monaco-editor'
export function workspaceUri(workspaceId:string,path:string){return monaco.Uri.parse('file:///workspaces/'+workspaceId+'/'+path)}
export function hasWorkspaceModel(workspaceId:string,path:string){return Boolean(monaco.editor.getModel(workspaceUri(workspaceId,path)))}
export function ensureWorkspaceModel(workspaceId:string,path:string,content:string,language:string){const uri=workspaceUri(workspaceId,path);const existing=monaco.editor.getModel(uri);if(existing)return existing;return monaco.editor.createModel(content,language,uri)}
export { monaco }
