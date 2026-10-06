const EXTENSIONS = new Map<string, string>([
  ['.c', 'c'],
  ['.cc', 'cpp'],
  ['.cpp', 'cpp'],
  ['.css', 'css'],
  ['.html', 'html'],
  ['.js', 'javascript'],
  ['.json', 'json'],
  ['.jsx', 'javascript'],
  ['.md', 'markdown'],
  ['.mjs', 'javascript'],
  ['.py', 'python'],
  ['.rs', 'rust'],
  ['.sh', 'shell'],
  ['.toml', 'ini'],
  ['.ts', 'typescript'],
  ['.tsx', 'typescript'],
  ['.yaml', 'yaml'],
  ['.yml', 'yaml'],
])

export function languageForPath(path: string): string {
  const name = String(path || '').toLowerCase()
  for (const [extension, language] of EXTENSIONS) {
    if (name.endsWith(extension)) return language
  }
  return 'plaintext'
}

export function fileIcon(path: string): string {
  const name = String(path || '').toLowerCase()
  if (name.endsWith('.rs')) return 'symbol-structure'
  if (name.endsWith('.ts') || name.endsWith('.tsx')) return 'symbol-interface'
  if (name.endsWith('.py')) return 'symbol-method'
  if (name.endsWith('.json')) return 'json'
  if (name.endsWith('.toml')) return 'settings-gear'
  if (name.endsWith('.md')) return 'markdown'
  return 'file'
}
