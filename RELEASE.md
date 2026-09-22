# AEKO Release and Distribution

AEKO uses different distribution channels for different artifact types. Do not
treat Docker Hub, GitHub Releases, and language package registries as
interchangeable.

## Authoritative channels

| Artifact | Canonical channel | Why |
| --- | --- | --- |
| Validator, Faucet Daemon, Social bootstrap, Explorer API/UI, Operations Web, tools images | Docker Hub | These are runnable container images used by deployment platforms such as Coolify/Dokploy. |
| `aeko` CLI and `aeko-keygen` desktop/server binaries | GitHub Releases | Users download versioned executables and checksums directly. |
| `@aeko-chain/web3.js` | npm | Native JavaScript package distribution. |
| `@aeko-chain/sdk` | npm | Native Node.js package distribution. |
| `aeko-sdk` | PyPI | Native Python package distribution. |
| `aeko-rust-sdk` | crates.io | Native Rust package distribution. |

SDKs are **not** published as Docker images. GitHub Releases may document an
SDK release, but the installable SDK package remains the package-registry
artifact.

## Runtime image release behavior

`.github/workflows/build-images.yml` is the normal validated runtime release
path. On a successful push to `main` it:

1. detects which domains actually changed;
2. validates only the affected application/network/SDK surfaces, including
   package-version release readiness when SDK source changed;
3. publishes immutable Docker image tags for changed deployable surfaces;
4. promotes only validated images to `latest`;
5. triggers the configured deployment webhook after successful image promotion.

Native SDK package publication is deliberately not part of the runtime image
pipeline. A package-registry credential outage must not strand already
validated chain images before promotion or deployment.

## SDK package release behavior

`.github/workflows/publish-sdks.yml` owns irreversible npm, PyPI, and
crates.io publication. It is explicitly dispatched by a release operator, who
selects the exact SDK packages to release. The workflow reruns the selected
SDK release-readiness checks before publication and then fails closed if a
required registry credential is unavailable.

The required repository secrets are:

- `NPM_TOKEN` for `@aeko-chain/web3.js` and `@aeko-chain/sdk`;
- `PYPI_API_TOKEN` for `aeko-sdk`;
- `CRATES_IO_TOKEN` for `aeko-rust-sdk`.

Package versions must be new in their native registry. Pull requests never
publish packages or promote images.

## CLI binary releases

`.github/workflows/cli-release.yml` owns cross-platform CLI binary releases.
A `v*` tag must point to a commit already contained in `main`. The workflow
builds `aeko` and `aeko-keygen`, verifies them, creates checksums, and uploads
the resulting archives to the GitHub Release for that tag.

The lightweight installers in `install/aeko-cli-install.sh` and
`install/aeko-cli-install.ps1` consume those GitHub Release assets. Their
repository/asset base can be overridden with environment variables when a
mirror is required.

## Docker deployment configuration

Container-to-container traffic must use the Docker network and internal service
ports, for example:

- validator RPC: `http://validator:8899`
- Explorer API: `http://explorer-api:8088`
- Faucet Daemon: `faucet:9900`

Public domains belong only at the ingress/browser boundary and are deployment
configuration. Coolify/Dokploy receive them through environment variables such
as `AEKO_PUBLIC_RPC_URL`, `AEKO_PUBLIC_WS_URL`,
`AEKO_PUBLIC_EXPLORER_API_URL`, `AEKO_PUBLIC_EXPLORER_URL`,
`AEKO_PUBLIC_FUNDING_URL`, and `AEKO_PUBLIC_ADMIN_URL`.

The Explorer UI is deployment-neutral at build time. Its container entrypoint
writes runtime public endpoint configuration when the container starts.

## Historical release pipelines

The old S3/channel GitHub release-artifact workflows are intentionally removed.
They duplicated the current Docker Hub + GitHub Releases + native SDK registry
model and referenced the pre-fork release infrastructure.

Legacy Buildkite scripts may remain for historical validation/build tooling, but
they are not the authoritative AEKO publication path described above.
