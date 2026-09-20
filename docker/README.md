# AEKO Docker layout

All first-party AEKO container and Compose definitions live in this directory. The Docker build context remains the repository root because the canonical image needs the Rust workspace plus the Admin and Explorer applications.

| File | Purpose |
| --- | --- |
| `Dockerfile` | Single multi-target image definition for validator, faucet, SocialFi bootstrap, tools, Explorer API/UI and Admin |
| `compose.local.yml` | Portable local/testnet topology, including the optional `rpc-node` profile |
| `compose.dokploy.yml` | Image-only public topology for Dokploy |
| `compose.coolify.yml` | Image-only public topology with Coolify-safe persistent-storage syntax |
| `env.public.example` | Public-deployment environment template shared by Dokploy and Coolify |
| `validator-entrypoint.sh` | Shared validator/RPC role entrypoint |
| `key-preflight.sh` | Reusable fail-closed keypair diagnostic helper; Coolify does not use it as a global startup gate |

Build from the repository root so `COPY` paths use the root workspace as their context:

```bash
docker build -f docker/Dockerfile --target validator -t surdma/aeko-validator:latest .
```

Validate the deployment contracts from the repository root:

```bash
docker compose -f docker/compose.local.yml config
docker compose -f docker/compose.dokploy.yml config
docker compose -f docker/compose.coolify.yml config
python3 scripts/validate-deployment-contract.py
```

The two public Compose files intentionally share service names, images, ports, health checks and dependency ordering. Platform-specific differences should stay limited to deployment concerns such as storage parsing and platform routing.

Dokploy keeps `AEKO_KEYS_DIR` configurable as an absolute host path. Coolify deliberately does not parameterize key bind sources: `compose.coolify.yml` binds the literal host path `/data/aeko/keys` and uses a Docker-managed `validator-ledger` volume so its storage validator never sees `${...}` in a volume source.
