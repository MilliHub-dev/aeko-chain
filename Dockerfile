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
#   admin            Next.js administrative application

FROM rust:1.75 AS rust-build-base

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

# Keep blockchain/network binaries on their own build path. Application-only
# targets must not compile validator, genesis, faucet, or bootstrap binaries.
FROM rust-build-base AS network-rust-builder

RUN --mount=type=cache,id=aeko-sccache,target=/root/.cache/sccache \
    --mount=type=cache,id=aeko-registry,target=/usr/local/cargo/registry \
    --mount=type=cache,id=aeko-git,target=/usr/local/cargo/git \
    --mount=type=cache,id=aeko-target,target=/aeko/target \
    cargo build --release \
      --bin aeko-validator \
      --bin aeko-genesis \
      --bin aeko-faucet \
      --bin aeko-social-bootstrap && \
    mkdir -p /binaries && \
    cp target/release/aeko-validator /binaries/ && \
    cp target/release/aeko-genesis /binaries/ && \
    cp target/release/aeko-faucet /binaries/ && \
    cp target/release/aeko-social-bootstrap /binaries/

# The operator CLI is an app under apps/cli. Keep its Docker image isolated so
# a CLI-only change does not build validator or other network executables.
FROM rust-build-base AS tools-builder

RUN --mount=type=cache,id=aeko-sccache,target=/root/.cache/sccache \
    --mount=type=cache,id=aeko-registry,target=/usr/local/cargo/registry \
    --mount=type=cache,id=aeko-git,target=/usr/local/cargo/git \
    --mount=type=cache,id=aeko-target,target=/aeko/target \
    cargo build --release --bin aeko --bin aeko-keygen && \
    mkdir -p /binaries && \
    cp target/release/aeko /binaries/ && \
    cp target/release/aeko-keygen /binaries/

# Explorer API has an isolated Rust build stage so selecting explorer-api does
# not build the blockchain/network executables above.
FROM rust-build-base AS explorer-api-builder

RUN --mount=type=cache,id=aeko-sccache,target=/root/.cache/sccache \
    --mount=type=cache,id=aeko-registry,target=/usr/local/cargo/registry \
    --mount=type=cache,id=aeko-git,target=/usr/local/cargo/git \
    --mount=type=cache,id=aeko-target,target=/aeko/target \
    cargo build --release --bin aeko-explorer-backend -p aeko-explorer-backend && \
    mkdir -p /binaries && \
    cp target/release/aeko-explorer-backend /binaries/

FROM debian:bookworm-slim AS rust-runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
    bzip2 \
    ca-certificates \
    curl \
    libudev1 \
    && rm -rf /var/lib/apt/lists/*

FROM rust-runtime AS validator
COPY --from=network-rust-builder /binaries/aeko-validator /usr/local/bin/aeko-validator
COPY --from=network-rust-builder /binaries/aeko-genesis /usr/local/bin/aeko-genesis
COPY docker/validator-entrypoint.sh /usr/local/bin/validator-entrypoint.sh
RUN chmod 0755 /usr/local/bin/validator-entrypoint.sh
EXPOSE 8001/tcp 8001/udp 8899/tcp 8900/tcp
ENTRYPOINT ["/usr/local/bin/validator-entrypoint.sh"]

FROM rust-runtime AS faucet
COPY --from=network-rust-builder /binaries/aeko-faucet /usr/local/bin/aeko-faucet
EXPOSE 9900/tcp
ENTRYPOINT ["aeko-faucet"]

FROM rust-runtime AS social-bootstrap
COPY --from=network-rust-builder /binaries/aeko-social-bootstrap /usr/local/bin/aeko-social-bootstrap
ENTRYPOINT ["aeko-social-bootstrap"]

FROM rust-runtime AS tools
COPY --from=tools-builder /binaries/aeko /usr/local/bin/aeko
COPY --from=tools-builder /binaries/aeko-keygen /usr/local/bin/aeko-keygen
CMD ["aeko", "--help"]

FROM rust-runtime AS explorer-api
COPY --from=explorer-api-builder /binaries/aeko-explorer-backend /usr/local/bin/aeko-explorer-backend
EXPOSE 8088/tcp
# Fail closed. Docker/Dokploy owns restart policy; the image must not hide a
# missing database, bad migration, or invalid RPC configuration in an internal
# shell retry loop.
ENTRYPOINT ["aeko-explorer-backend"]

FROM node:22-alpine AS explorer-ui-builder
WORKDIR /web
COPY apps/explorer/web/package*.json ./
RUN npm ci
COPY apps/explorer/web/ ./
# Vite endpoint values are build-time configuration. These optional args are
# intentionally empty for normal production builds; PR validation supplies local
# runner endpoints so the exact PR-built UI can target the local release stack.
ARG VITE_AEKO_LOCAL_RPC=
ARG VITE_AEKO_LOCAL_WS=
ARG VITE_AEKO_LOCAL_EXPLORER_API=
ENV VITE_AEKO_LOCAL_RPC=${VITE_AEKO_LOCAL_RPC} \
    VITE_AEKO_LOCAL_WS=${VITE_AEKO_LOCAL_WS} \
    VITE_AEKO_LOCAL_EXPLORER_API=${VITE_AEKO_LOCAL_EXPLORER_API}
RUN npm run build

FROM node:22-alpine AS explorer-ui
WORKDIR /app
RUN npm install -g serve@14
COPY --from=explorer-ui-builder /web/dist /app/dist
EXPOSE 4000/tcp
CMD ["serve", "-s", "/app/dist", "-l", "4000"]

# Admin is an independent off-chain application. Its target has no dependency
# on any Rust/network builder, so an admin-only change cannot compile the chain.
FROM node:22-alpine AS admin-builder
WORKDIR /admin
ENV NEXT_TELEMETRY_DISABLED=1
COPY apps/admin/package*.json ./
RUN npm ci
COPY apps/admin/ ./
RUN npm run build

FROM node:22-alpine AS admin
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1
COPY apps/admin/package*.json ./
RUN npm ci --omit=dev
COPY --from=admin-builder /admin/.next ./.next
COPY --from=admin-builder /admin/next.config.js ./next.config.js
EXPOSE 3001/tcp
CMD ["npm", "run", "start"]

FROM validator AS default
