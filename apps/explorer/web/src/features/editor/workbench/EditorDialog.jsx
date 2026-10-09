import { X } from 'lucide-react';
import { handleContainedDialogKeyDown } from './helpers';

export default function EditorDialog({ dialog, onClose, onSubmit }) {
  if (!dialog) return null;
  const isDelete = dialog.type === 'delete' || dialog.type === 'delete-project' || dialog.type === 'close-program';
  const title = {
    'new-project': 'New AEKO project',
    'new-file': 'New Rust file',
    rename: 'Rename Rust file',
    'rename-project': 'Rename project',
    delete: 'Delete source file',
    'delete-project': 'Delete project',
    'close-program': 'Close deployed program',
  }[dialog.type];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="presentation" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="editor-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => handleContainedDialogKeyDown(event, onClose)}
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#111118] p-5 shadow-2xl shadow-black/50"
      >
        <div className="flex items-center justify-between gap-4">
          <h2 id="editor-dialog-title" className="text-lg font-semibold text-white">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close dialog" className="rounded-lg p-2 text-gray-500 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aeko-accent">
            <X size={18} />
          </button>
        </div>
        {isDelete ? (
          <p className="mt-4 text-sm leading-6 text-gray-400">
            {dialog.type === 'close-program' ? 'Close ' : 'Delete '}
            <span className="font-mono text-gray-200">{dialog.path || dialog.value}</span>?
            {dialog.type === 'delete-project'
              ? ' This removes the browser-local project and its saved deployment history.'
              : dialog.type === 'close-program'
                ? ' This submits an irreversible loader Close transaction and returns the program rent to the selected development wallet.'
                : ' This removes the file from the local project.'}
          </p>
        ) : (
          <form
            className="mt-4"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const value = form.get('value');
              const template = form.get('template');
              onSubmit(String(value || ''), String(template || 'hello'));
            }}
          >
            <label htmlFor="editor-dialog-value" className="mb-2 block text-xs font-medium text-gray-400">
              {dialog.type === 'new-project' || dialog.type === 'rename-project' ? 'Project name' : 'Path'}
            </label>
            <input
              id="editor-dialog-value"
              name="value"
              autoFocus
              defaultValue={dialog.value || ''}
              placeholder={dialog.type === 'new-project' || dialog.type === 'rename-project' ? 'hello-aeko' : 'src/state.rs'}
              className="min-h-11 w-full rounded-lg border border-white/10 bg-black/30 px-3 font-mono text-sm text-white outline-none focus:border-aeko-accent focus:ring-1 focus:ring-aeko-accent"
            />
            {dialog.type === 'new-project' ? (
              <div className="mt-4">
                <label htmlFor="editor-project-template" className="mb-2 block text-xs font-medium text-gray-400">
                  Template
                </label>
                <select
                  id="editor-project-template"
                  name="template"
                  defaultValue="hello"
                  className="min-h-11 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-aeko-accent focus:ring-1 focus:ring-aeko-accent"
                >
                  <option value="hello">Hello AEKO starter</option>
                  <option value="empty">Empty native Rust program</option>
                </select>
              </div>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={onClose} className="min-h-11 rounded-lg px-4 text-sm text-gray-400 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aeko-accent">Cancel</button>
              <button type="submit" className="min-h-11 rounded-lg bg-aeko-accent px-4 text-sm font-semibold text-black hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aeko-accent">{dialog.type === 'rename' || dialog.type === 'rename-project' ? 'Rename' : 'Create'}</button>
            </div>
          </form>
        )}
        {isDelete ? (
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="min-h-11 rounded-lg px-4 text-sm text-gray-400 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aeko-accent">Cancel</button>
            <button type="button" autoFocus onClick={() => onSubmit(dialog.path || dialog.value)} className="min-h-11 rounded-lg bg-red-500 px-4 text-sm font-semibold text-white hover:bg-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400">
              {dialog.type === 'delete-project' ? 'Delete project' : dialog.type === 'close-program' ? 'Close program' : 'Delete file'}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
