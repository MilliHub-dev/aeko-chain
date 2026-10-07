import type { ProjectTemplate } from '../shared/contracts/workspace.js'

export interface ProjectTemplateDefinition {
  label: string
  defaultNewFile: string
  files: Readonly<Record<string, string>>
}

const RUST_MAIN = `use aeko_program::{
    account_info::AccountInfo,
    entrypoint,
    entrypoint::ProgramResult,
    msg,
    pubkey::Pubkey,
};

entrypoint!(process_instruction);

pub fn process_instruction(
    _program_id: &Pubkey,
    _accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    msg!("Hello from AEKO Contract Studio");
    msg!("instruction bytes: {}", instruction_data.len());
    Ok(())
}
`

const TEMPLATES: Readonly<Record<ProjectTemplate, ProjectTemplateDefinition>> = {
  'rust-program': {
    label: 'Rust · SBF Program',
    defaultNewFile: 'src/state.rs',
    files: {
      'Cargo.toml': `[package]
name = "aeko_contract_studio_program"
version = "0.1.0"
edition = "2021"
publish = false

[lib]
crate-type = ["cdylib", "lib"]

[dependencies]
aeko-program = { path = "/opt/aeko/sdk/program" }
`,
      'src/lib.rs': RUST_MAIN,
      'tests/smoke.rs': `#[test]
fn studio_test_harness_runs() {
    assert_eq!(2 + 2, 4);
}
`,
      'README.md': `# AEKO Rust Program

Build a native AEKO SBF program from this isolated workspace.

## Commands

\`\`\`bash
cargo test --offline
cargo-build-sbf --manifest-path Cargo.toml --sbf-out-dir out
\`\`\`

The image includes the AEKO repository and SBF build entrypoint at \`/opt/aeko\`. The first SBF build may initialize workspace-local toolchain cache. The workspace is isolated from validator keys, databases, Docker, and host files.
`,
    },
  },
  'typescript-client': {
    label: 'TypeScript · AEKO Client',
    defaultNewFile: 'src/module.ts',
    files: {
      'package.json': `{
  "name": "aeko-studio-typescript-client",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc --noEmit",
    "test": "node --experimental-strip-types --test tests/*.test.ts",
    "start": "node --experimental-strip-types src/index.ts"
  }
}
`,
      'tsconfig.json': `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "lib": ["ES2022", "DOM"]
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
`,
      'src/index.ts': `const rpcUrl = process.env.AEKO_RPC_URL || 'http://127.0.0.1:8899'

export async function rpc<T>(method: string, params: unknown[] = []): Promise<T> {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  if (!response.ok) throw new Error(\`RPC request failed with HTTP \${response.status}\`)
  const payload = await response.json()
  if (payload.error) throw new Error(payload.error.message)
  return payload.result as T
}

const health = await rpc<string>('getHealth')
console.log('AEKO RPC health:', health)
`,
      'tests/rpc.test.ts': `import assert from 'node:assert/strict'
import test from 'node:test'

test('TypeScript workspace test harness runs', () => {
  assert.equal(2 + 2, 4)
})
`,
      'README.md': `# AEKO TypeScript Client

The studio runtime exposes \`AEKO_RPC_URL\` to the terminal.

\`\`\`bash
npm run build
npm test
npm start
\`\`\`

No package install is required for this starter; TypeScript is provided by the studio runtime.
`,
    },
  },
  'typescript-dapp': {
    label: 'React + TypeScript · AEKO DApp',
    defaultNewFile: 'src/components/Feature.tsx',
    files: {
      'package.json': `{
  "name": "aeko-studio-dapp",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "typecheck": "tsc --noEmit",
    "clean": "node -e \\"require('node:fs').rmSync('dist',{recursive:true,force:true})\\""
  },
  "dependencies": {
    "@vitejs/plugin-react": "^5.1.1",
    "vite": "^7.2.4",
    "typescript": "^5.9.3",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "@types/react": "^19.3.0",
    "@types/react-dom": "^19.3.0"
  },
  "devDependencies": {}
}
`,
      'biome.json': `{
  "formatter": { "enabled": true, "indentStyle": "space" },
  "linter": { "enabled": true, "rules": { "recommended": true } },
  "javascript": { "formatter": { "quoteStyle": "single" } }
}
`,
      'index.html': `<!doctype html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>AEKO DApp</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>
`,
      'vite.config.ts': `import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
export default defineConfig({ plugins: [react()] })
`,
      'tsconfig.json': `{"compilerOptions":{"target":"ES2022","lib":["ES2022","DOM","DOM.Iterable"],"module":"ESNext","moduleResolution":"Bundler","jsx":"react-jsx","strict":true,"noEmit":true,"skipLibCheck":true},"include":["src","vite.config.ts"]}
`,
      'src/main.tsx': `import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './style.css'
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
`,
      'src/App.tsx': `import { useState } from 'react'
const rpcUrl = import.meta.env.VITE_AEKO_RPC_URL || 'https://rpc.aeko.online'
async function rpc(method: string, params: unknown[] = []) {
  const response = await fetch(rpcUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})})
  const payload = await response.json()
  if (payload.error) throw new Error(payload.error.message)
  return payload.result
}
export default function App(){const[status,setStatus]=useState('Not checked');return <main><p>AEKO DApp</p><h1>Build against the live AEKO RPC.</h1><button onClick={async()=>setStatus(String(await rpc('getHealth')))}>Check network</button><pre>{status}</pre></main>}
`,
      'src/style.css': `:root{font-family:system-ui;color:#fff;background:#052E2B}body{margin:0}main{max-width:720px;margin:10vh auto;padding:2rem}button{background:#5FB51F;color:#052E2B;border:0;padding:.75rem 1rem;border-radius:.6rem;font-weight:700}
`,
      '.env.example': `VITE_AEKO_RPC_URL=https://rpc.aeko.online
`,
      'README.md': `# AEKO React + TypeScript DApp

The Studio provides the pinned React, TypeScript, and Vite runtime used by this starter, so no package-install step is required.\n\nUse **Preview** to build an isolated static preview, or run \`npm run dev\` in Bash when you specifically need the raw Vite development server. Use \`VITE_AEKO_RPC_URL\` to select the RPC endpoint.
`,
    },
  },
  'python-client': {
    label: 'Python · AEKO Client',
    defaultNewFile: 'src/module.py',
    files: {
      'src/main.py': `import json
import os
from urllib import request

RPC_URL = os.environ.get("AEKO_RPC_URL", "http://127.0.0.1:8899")


def rpc(method: str, params: list | None = None):
    body = json.dumps({
        "jsonrpc": "2.0",
        "id": 1,
        "method": method,
        "params": params or [],
    }).encode("utf-8")
    req = request.Request(
        RPC_URL,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with request.urlopen(req, timeout=30) as response:
        payload = json.loads(response.read().decode("utf-8"))
    if "error" in payload:
        raise RuntimeError(payload["error"]["message"])
    return payload["result"]


if __name__ == "__main__":
    print("AEKO RPC health:", rpc("getHealth"))
`,
      'tests/test_smoke.py': `import unittest


class StudioSmokeTest(unittest.TestCase):
    def test_harness_runs(self):
        self.assertEqual(2 + 2, 4)


if __name__ == "__main__":
    unittest.main()
`,
      'README.md': `# AEKO Python Client

This starter uses only Python's standard library and the studio-provided \`AEKO_RPC_URL\`.

\`\`\`bash
python3 -m unittest discover -s tests
python3 src/main.py
\`\`\`
`,
    },
  },
}

const TEMPLATE_IDS = Object.freeze(Object.keys(TEMPLATES) as ProjectTemplate[])

export function templateIds(): readonly ProjectTemplate[] {
  return TEMPLATE_IDS
}

export function isProjectTemplate(value: string): value is ProjectTemplate {
  return Object.prototype.hasOwnProperty.call(TEMPLATES, value)
}

export function getTemplate(id: ProjectTemplate): ProjectTemplateDefinition {
  return TEMPLATES[id]
}
