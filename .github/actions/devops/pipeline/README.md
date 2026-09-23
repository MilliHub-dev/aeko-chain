# AEKO DevOps pipeline support

This directory contains support code for `.github/workflows/build-images.yml`.

GitHub only discovers workflow and reusable-workflow YAML directly under `.github/workflows`; nested workflow directories are not supported. To keep the root workflow directory from accumulating AEKO-specific helper YAML, shared setup, CI-contract smoke checks, and final result verification live here as composite actions/scripts.

The top-level workflow is intentionally a multi-job DAG:

- one lightweight classification job decides which domains are selected;
- Operations Web, Explorer Web, CLI, Explorer backend, network, and SDK jobs run independently on standard `ubuntu-latest` runners;
- CI-orchestrator changes run every deployable Docker target and all external SDK validation lanes on both pull requests and merged `main`;
- a final job named `devops` fails closed if any selected job failed or was unexpectedly skipped;
- successful Docker-owning or CI-orchestrator `main` runs publish immutable SHA images, promote those remote images to `latest`, and trigger deployment.

No Docker image tarballs or build artifacts are transferred between jobs. Existing GHA/sccache/BuildKit caches remain the acceleration mechanism.

## CI-only change behavior

Changes under `.github/actions/devops/**` or `.github/workflows/**` select the complete deployable image DAG on both pull requests and the merged `main` push. This proves that the orchestrator still builds every image after merge.

A CI-only `main` push exercises the complete release path: every deployable image is rebuilt and pushed with the immutable merge SHA, then the final `devops` gate permits promotion to `latest` and the production deployment webhook. This prevents CI changes from being proven only on pull requests while silently skipping the real post-merge release path.

External SDK code validation is part of the hard gate. Registry publication is deliberately separate and best-effort: changed SDK packages may attempt npm, PyPI, or crates.io publication after validation, but missing credentials, an already-published version, or another registry failure is logged and cannot block Docker image promotion or production deployment. The standalone `AEKO SDK Release` workflow remains strict because its explicit purpose is registry publication.
