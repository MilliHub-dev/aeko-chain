# AEKO Contract Studio

Standalone browser IDE for AEKO development.

**Production route:** `https://editor.aeko.online`

This application is intentionally independent from Aeko Scan and from the older `/docs/editor` route. It owns its own Vite frontend, TypeScript Node control plane, filesystem workspace boundary, and project-scoped command runtime.

## Product stack

- React 19 + TypeScript + Vite
- Upstream Monaco Editor used only as the source editor surface
- AEKO-native blockchain workbench and project context UI
- AEKO Console backed by an allowlisted command runner rather than an operating-system terminal
- TypeScript + Express + Socket.IO control plane
- shared TypeScript contracts for browser/server API, workspace, filesystem, session, and console events

## Type safety

Browser and server code are compiled with strict TypeScript. The project enables `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, and `noFallthroughCasesInSwitch`.

Run the complete source checks with:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

The production server is compiled to `dist-server/`; the container runs the emitted JavaScript rather than executing TypeScript at runtime.

## Runtime model

A browser session creates one or more isolated project workspaces. Monaco edits files through the Studio HTTP API, while AEKO Console streams output from explicit project actions over Socket.IO.

The Node control plane is deliberately separate from the command identity. Each authenticated browser session receives a unique numeric Linux UID/GID from a bounded pool. All workspaces for that session are owned by that identity, and project commands drop to it before execution.

Workspace metadata is stored outside the shell-writable project directories under a root-only metadata directory.

## Security boundary

The browser never receives the server access token after login. A successful login creates an opaque HttpOnly, SameSite session cookie.

Production isolation rules:

- Node control plane runs as container root with all Linux capabilities dropped except `CHOWN`, `DAC_OVERRIDE`, `SETUID`, and `SETGID`. `DAC_OVERRIDE` is retained by the trusted control plane so HTTP workspace operations can traverse files owned by sandbox identities; project commands drop to their session UID/GID before execution.
- Each authenticated session receives a distinct unprivileged UID/GID.
- Every project command drops to that session identity on Linux.
- Command environment variables are allowlisted; no interactive PowerShell or Bash session is exposed.
- Workspace paths reject traversal and editable symlinks.
- Project files live only in the container `/workspaces` tmpfs.
- Root filesystem is read-only.
- No Docker socket, PostgreSQL credentials, validator keys, chain key directory, or host filesystem is mounted.
- `no-new-privileges` is enabled.
- HTTP file operations enforce workspace/file limits, while the container-level tmpfs, PID, memory, CPU, session-lifetime, and console-history limits bound command execution as a whole.
- Mutating HTTP APIs reject cross-origin requests in production.

AEKO Studio does not expose a general-purpose operating-system shell. Build, test, run, and clean are explicit project actions executed inside the isolated editor runtime.

## Development

Node 22 is the supported local runtime. The project pins pnpm 10.34.6 so Corepack and local development use the same patched package-manager version.

```bash
cd apps/explorer/editor
corepack enable
pnpm --version
pnpm install
pnpm dev
```

`pnpm dev` passes an explicit local-development flag, so no shared access token is required for that command. Production still requires `AEKO_EDITOR_ACCESS_TOKEN`, and custom non-production launch commands remain fail-closed unless `AEKO_EDITOR_ALLOW_INSECURE_LOCAL=1` is explicitly set.

In non-production mode, workspaces default to `.aeko-workspaces/` inside the editor app rather than the production-only `/workspaces` path. The server runs the Vite middleware and API/Socket.IO endpoint together on port 4100, so the local workflow exercises the same HTTP and WebSocket origin.

### Development logs

Local development defaults to the human-readable `text` logger. Interactive terminals receive ANSI level colors and compact request lines, while stack traces are printed on indented continuation lines. Successful API operations remain visible at the default `info` level; successful Vite modules, source files, assets, health checks, and other GET/HEAD traffic are reduced to `debug`. Set `AEKO_LOG_LEVEL=debug` when you need the complete request stream and request-start events.

`AEKO_LOG_FORMAT=json` remains available locally when machine-readable output is needed. Production defaults to JSON, and the Coolify example pins `AEKO_LOG_FORMAT=json` so collectors retain structured fields and full request IDs.

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

The repository `AEKO DevOps (single runner)` workflow treats Contract Studio as its own editor domain. Pull requests validate the Studio source and image through the self-contained `explorer-editor` action; eligible `main` changes publish and promote `aeko-editor-web`, then trigger the resource-scoped `WEBHOOK_EXPLORER_EDITOR` deployment hook.
