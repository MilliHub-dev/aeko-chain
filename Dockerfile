# syntax=docker/dockerfile:1
#
# Canonical AEKO Chain container build.
#
# One Dockerfile, multiple runtime targets:
#   validator        block producer / voting node (default target)
#   faucet           testnet faucet service
#   social-bootstrap one-shot SocialFi state initializer
#   tools            aeko CLI + aeko-keygen operator utilities
#   explorer-api     Rust explorer indexer / REST API
#   explorer-ui      Vite explorer frontend
#
# Build a specific runtime image with:
#   docker build --target <target> -t <image> .
# Plain `docker build .` produces the validator image.

FROM rust:1.75 AS rust-builder

RUN curl -fsSL https://github.com/mozilla/sccache/releases/download/v0.8.2/sccache-v0.8.2-x86_64-unknown-linux-musl.tar.gz \
    | tar xzf - --strip-components=1 -C /usr/local/cargo/bin sccache-v0.8.2-x86_64-unknown-linux-musl/sccache

ENV RUSTC_WRAPPER=sccache \
    SCCACHE_DIR=/root/.cache/sccache

RUN apt-get update && apt-get install -y --no-install-recommends \
    clang \
    libclang-dev \
    libudev-dev \
    pkg-config \
    protobuf-compiler \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /aeko
COPY . .

# Compile the complete Rust runtime set once. Runtime targets below copy only
# the binaries they actually need, so a validator container no longer carries
# faucet/bootstrap/operator tooling.
RUN --mount=type=cache,id=aeko-sccache,target=/root/.cache/sccache \
    --mount=type=cache,id=aeko-registry,target=/usr/local/cargo/registry \
    --mount=type=cache,id=aeko-git,target=/usr/local/cargo/git \
    --mount=type=cache,id=aeko-target,target=/aeko/target \
    cargo build --release \
      --bin aeko-validator \
      --bin aeko-keygen \
      --bin aeko-genesis \
      --bin aeko \
      --bin aeko-faucet \
      --bin aeko-social-bootstrap && \
    cargo build --release --bin aeko-explorer-backend -p aeko-explorer-backend && \
    mkdir -p /binaries && \
    cp target/release/aeko-validator /binaries/ && \
    cp target/release/aeko-keygen /binaries/ && \
    cp target/release/aeko-genesis /binaries/ && \
    cp target/release/aeko /binaries/ && \
    cp target/release/aeko-faucet /binaries/ && \
    cp target/release/aeko-social-bootstrap /binaries/ && \
    cp target/release/aeko-explorer-backend /binaries/

FROM debian:bookworm-slim AS rust-runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
    bzip2 \
    ca-certificates \
    curl \
    libudev1 \
    && rm -rf /var/lib/apt/lists/*

# ---------------------------------------------------------------------------
# Validator / RPC node runtime
# ---------------------------------------------------------------------------
FROM rust-runtime AS validator
COPY --from=rust-builder /binaries/aeko-validator /usr/local/bin/aeko-validator
COPY --from=rust-builder /binaries/aeko-genesis /usr/local/bin/aeko-genesis
COPY docker/validator-entrypoint.sh /usr/local/bin/validator-entrypoint.sh
RUN chmod 0755 /usr/local/bin/validator-entrypoint.sh
EXPOSE 8001/tcp 8001/udp 8899/tcp 8900/tcp
ENTRYPOINT ["/usr/local/bin/validator-entrypoint.sh"]

# ---------------------------------------------------------------------------
# Faucet runtime
# ---------------------------------------------------------------------------
FROM rust-runtime AS faucet
COPY --from=rust-builder /binaries/aeko-faucet /usr/local/bin/aeko-faucet
EXPOSE 9900/tcp
ENTRYPOINT ["aeko-faucet"]

# ---------------------------------------------------------------------------
# One-shot SocialFi state bootstrap runtime
# ---------------------------------------------------------------------------
FROM rust-runtime AS social-bootstrap
COPY --from=rust-builder /binaries/aeko-social-bootstrap /usr/local/bin/aeko-social-bootstrap
ENTRYPOINT ["aeko-social-bootstrap"]

# ---------------------------------------------------------------------------
# Operator tooling runtime. No fixed entrypoint so either binary can be called.
# ---------------------------------------------------------------------------
FROM rust-runtime AS tools
COPY --from=rust-builder /binaries/aeko /usr/local/bin/aeko
COPY --from=rust-builder /binaries/aeko-keygen /usr/local/bin/aeko-keygen
CMD ["aeko", "--help"]

# ---------------------------------------------------------------------------
# Explorer indexer / REST API runtime
# ---------------------------------------------------------------------------
FROM rust-runtime AS explorer-api
COPY --from=rust-builder /binaries/aeko-explorer-backend /usr/local/bin/aeko-explorer-backend
ENV AEKO_EXPLORER_BIND=0.0.0.0:8088
EXPOSE 8088/tcp
CMD ["sh", "-c", "while true; do aeko-explorer-backend && break || (echo 'explorer-api exited, retrying in 5s' && sleep 5); done"]

# ---------------------------------------------------------------------------
# Explorer web frontend runtime
# ---------------------------------------------------------------------------
FROM node:18-alpine AS explorer-ui-builder
WORKDIR /web
COPY web/package*.json ./
RUN npm install
COPY web/ ./
RUN npm run build

FROM node:18-alpine AS explorer-ui
WORKDIR /app
RUN npm install -g serve@14
COPY --from=explorer-ui-builder /web/dist /app/dist
EXPOSE 4000/tcp
CMD ["serve", "-s", "/app/dist", "-l", "4000"]

# Default target for `docker build .`.
FROM validator AS default
