# AEKO Contract Studio

Standalone browser IDE for AEKO development.

**Production route:** `https://editor.aeko.online`

This application is intentionally independent from Aeko Scan and from the legacy `/docs/editor` route. It owns its own Vite frontend, Node control plane, filesystem workspace boundary, Socket.IO transport, and PTY lifecycle.

## Product stack

- React 19 + Vite
- Monaco Editor through `@monaco-editor/react`
- `@codingame/monaco-vscode-api` service overrides for VS Code configuration, keybindings, and theme behavior
- xterm.js terminal rendering
- Split.js resizable Explorer/editor/terminal panes
- Express + Socket.IO
- node-pty running a real shell inside the dedicated editor container

## Runtime model

A browser session creates one or more isolated project workspaces. Monaco edits files through the Studio HTTP API, while xterm.js streams a retained pseudo-terminal over Socket.IO.

The Node control plane is deliberately separate from the shell identity. Each authenticated browser session receives a unique numeric Linux UID/GID from a bounded pool. All workspaces for that session are owned by that identity, and every PTY drops to it before Bash starts.

Workspace metadata is stored outside the shell-writable project directories under a root-only metadata directory.

## Security boundary

The browser never receives the server access token after login. A successful login creates an opaque HttpOnly, SameSite session cookie.

Production isolation rules:

- Node control plane runs as container root with all Linux capabilities dropped except `CHOWN`, `SETUID`, and `SETGID`.
- Each authenticated session receives a distinct unprivileged UID/GID.
- Every PTY drops to that session identity.
- PTY environment variables are allowlisted and do not inherit the Node process environment.
- Workspace paths reject traversal and editable symlinks.
- Project files live only in the container `/workspaces` tmpfs.
- Root filesystem is read-only.
- No Docker socket, PostgreSQL credentials, validator keys, chain key directory, or host filesystem is mounted.
- `no-new-privileges` is enabled.
- Workspace count, file size, workspace size, process count, memory, CPU, session lifetime, and terminal history are bounded.
- Mutating HTTP APIs reject cross-origin requests in production.

This makes the terminal a real shell in an isolated editor runtime, not a shell on the Explorer, API, or validator host.

## Development

For localhost-only development, explicit insecure mode can be used so a developer does not need to provision a Studio token:

```bash
cd apps/explorer/editor
npm install
AEKO_EDITOR_ALLOW_INSECURE_LOCAL=1 npm run dev
```

Production refuses to start without both `AEKO_EDITOR_ACCESS_TOKEN` and `AEKO_EDITOR_PUBLIC_ORIGIN`.

## Workspace templates

### Rust · SBF Program

Includes a Cargo project, native AEKO program entrypoint, smoke test, and commands for the AEKO SBF toolchain included in the Studio image.

### TypeScript · AEKO Client

Includes strict TypeScript configuration, an AEKO JSON-RPC client, and Node's test runner. TypeScript is supplied by the Studio runtime.

### Python · AEKO Client

Includes a dependency-free standard-library JSON-RPC client and unittest suite.

Server workspace source is not stored in Explorer PostgreSQL or another application database. The initial deployment intentionally uses ephemeral tmpfs storage, so restarting the Studio container removes server workspaces.

## Coolify

Create a dedicated Git-based Docker Compose resource:

```text
Compose Path: ./apps/explorer/editor/compose.coolify.yml
Domain: editor.aeko.online
Service: editor-web
Port: 4100
```

Set `AEKO_EDITOR_ACCESS_TOKEN` to a long random secret stored only in Coolify. The deployment must not mount the Docker socket, validator keys, Explorer database credentials, or host source directories into the Studio container.

The dedicated `AEKO Contract Studio` workflow validates the app and `editor-web` image. On `main`, it can publish `aeko-editor-web` and trigger the resource-scoped `WEBHOOK_EXPLORER_EDITOR` deployment hook.
