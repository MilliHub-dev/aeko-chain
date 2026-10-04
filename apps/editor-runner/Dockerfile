FROM rust:1.85-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       bzip2 ca-certificates curl libudev-dev pkg-config protobuf-compiler tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/aeko
COPY . .

RUN useradd --create-home --uid 10001 --shell /usr/sbin/nologin editor \
    && mkdir -p /work \
    && chown -R editor:editor /opt/aeko /work /home/editor

USER editor
ENV HOME=/home/editor \
    CARGO_HOME=/home/editor/.cargo \
    RUSTUP_HOME=/home/editor/.rustup \
    CARGO_NET_OFFLINE=false \
    RUST_BACKTRACE=0

# Build the runner and pre-install the exact SBF platform toolchain while the
# image build is allowed network access. Runtime compilation is forced offline.
RUN cargo build --locked --release -p aeko-editor-runner \
    && mkdir -p /tmp/editor-prewarm \
    && bash ./cargo-build-sbf \
       --manifest-path contracts/hello-aeko-program/Cargo.toml \
       --sbf-out-dir /tmp/editor-prewarm \
       -- --locked \
    && test -s /tmp/editor-prewarm/hello_aeko_program.so \
    && rm -rf /tmp/editor-prewarm

ENV CARGO_NET_OFFLINE=true
EXPOSE 8090
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/opt/aeko/target/release/aeko-editor-runner"]
