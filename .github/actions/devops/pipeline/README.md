# AEKO DevOps pipeline support

This directory contains support code for `.github/workflows/build-images.yml`.

GitHub only discovers workflow and reusable-workflow YAML directly under `.github/workflows`; nested workflow directories are not supported. To keep the root workflow directory from accumulating AEKO-specific helper YAML, shared setup, CI-contract smoke checks, and final result verification live here as composite actions/scripts.

The top-level workflow is intentionally a multi-job DAG:

- one lightweight classification job decides which domains are selected;
- Operations Web, Explorer Web, CLI, Explorer backend, network, and SDK jobs run independently on standard `ubuntu-latest` runners;
- CI-only pull requests build all deployable Docker targets without running unrelated product validation, proving the image orchestration itself;
- a final job named `devops` fails closed if any selected job failed or was unexpectedly skipped;
- only successful `main` runs publish immutable SHA images, promote those remote images to `latest`, and trigger deployment.

No Docker image tarballs or build artifacts are transferred between jobs. Existing GHA/sccache/BuildKit caches remain the acceleration mechanism.
