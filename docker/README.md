# AEKO Docker layout

All first-party AEKO container and Compose definitions live in this directory. The Docker build context remains the repository root because the canonical image needs the Rust workspace plus the Admin and Explorer applications.

| File | Purpose |
| --- | --- |
| `Dockerfile` | Single multi-target image definition for validator, faucet, SocialFi bootstrap, tools, Explorer API/UI and Operations Web. Public hostnames are supplied at deployment time. |
| `compose.local.yml` | Portable local/testnet topology, including the optional `rpc-node` profile |
| `compose.dokploy.yml` | Image-only public topology for Dokploy |
| `compose.coolify.yml` | Legacy image-only all-in-one Coolify topology retained for compatibility/rollback |
| `coolify/*/compose.yml` | Preferred independently deployable Coolify resources with per-resource environment examples and stable `/data/aeko/**` state paths |
| `env.public.example` | Public-deployment environment template shared by Dokploy and Coolify |
| `validator-entrypoint.sh` | Shared validator/RPC role entrypoint |
| `key-preflight.sh` | Reusable fail-closed keypair diagnostic helper; Coolify does not use it as a global startup gate |
| `../scripts/audit-validator-storage.sh` | Read-only host audit for the running validator ledger mount, Docker storage root, genesis presence and chain-key fingerprints |

Build from the repository root so `COPY` paths use the root workspace as their context:

```bash
docker build -f docker/Dockerfile --target validator -t surdma/aeko-validator:latest .
```

Validate the deployment contracts from the repository root:

```bash
docker compose -f docker/compose.local.yml config
docker compose -f docker/compose.dokploy.yml config
docker compose -f docker/compose.coolify.yml config
python3 scripts/validate-coolify-split.py
for compose in docker/coolify/*/compose.yml; do docker compose -f "$compose" config; done
python3 scripts/validate-deployment-contract.py
```

The Dokploy and legacy Coolify files preserve the original all-in-one topology. The split Coolify tree intentionally changes only the deployment boundary: images and runtime contracts remain the same, but each role is its own Coolify resource and cross-resource endpoints are explicit environment values.

Dokploy keeps `AEKO_KEYS_DIR` configurable as an absolute host path. Coolify deliberately does not parameterize bind sources. The legacy file fixes `/data/aeko/keys`; the split resources additionally fix validator ledger, Social state and Protocol state/continuity under `/data/aeko/**` so changing a Coolify Compose project name cannot allocate empty replacement named volumes. On public deployments, normal redeploys fail closed if established ledger/key/continuity material is missing. Coolify chain-key generation still requires the explicit first-boot flag `AEKO_ALLOW_CHAIN_KEY_GENERATION=1`.

## CI release boundary

The `AEKO DevOps (single runner)` workflow owns validation, immutable Docker
image publication, `latest` promotion, and the deployment webhook. Native SDK
registry publication is intentionally separate in `AEKO SDK Release`, so
missing npm, PyPI, or crates.io credentials cannot block a validated chain
image from being promoted and deployed.
