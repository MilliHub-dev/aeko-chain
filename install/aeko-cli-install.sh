#!/bin/sh
set -eu

REPOSITORY="${AEKO_GITHUB_REPOSITORY:-MilliHub-dev/aeko-chain}"
VERSION="${AEKO_VERSION:-latest}"
INSTALL_DIR="${AEKO_INSTALL_DIR:-${HOME}/.local/bin}"
ASSET_BASE_OVERRIDE="${AEKO_CLI_ASSET_BASE_URL:-}"

say() {
  printf 'aeko-install: %s\n' "$*"
}

fail() {
  printf 'aeko-install: error: %s\n' "$*" >&2
  exit 1
}

need() {
  command -v "$1" >/dev/null 2>&1 || fail "required command not found: $1"
}

download() {
  url=$1
  output=$2
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --retry 3 --retry-delay 1 --connect-timeout 15 "$url" -o "$output"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$output" "$url"
  else
    fail "curl or wget is required"
  fi
}

sha256_file() {
  file=$1
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$file" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$file" | awk '{print $1}'
  elif command -v openssl >/dev/null 2>&1; then
    openssl dgst -sha256 "$file" | awk '{print $NF}'
  else
    fail "sha256sum, shasum, or openssl is required to verify the download"
  fi
}

case "$(uname -s)" in
  Linux) os=unknown-linux-gnu ;;
  *) fail "this installer supports Linux; on Windows use install/aeko-cli-install.ps1" ;;
esac

case "$(uname -m)" in
  x86_64|amd64) arch=x86_64 ;;
  *) fail "unsupported architecture: $(uname -m). Current release assets support x86_64 glibc Linux." ;;
esac

target="${arch}-${os}"
asset="aeko-cli-${target}.tar.gz"

if [ -n "$ASSET_BASE_OVERRIDE" ]; then
  asset_base=${ASSET_BASE_OVERRIDE%/}
elif [ "$VERSION" = latest ]; then
  asset_base="https://github.com/${REPOSITORY}/releases/latest/download"
else
  asset_base="https://github.com/${REPOSITORY}/releases/download/${VERSION}"
fi

need uname
need mktemp
need tar
need awk
need mkdir
need chmod
need cp
need mv
need rm

tmp_dir=$(mktemp -d 2>/dev/null || mktemp -d -t aeko-cli)
trap 'rm -rf "$tmp_dir"' EXIT HUP INT TERM

archive="$tmp_dir/$asset"
checksum="$archive.sha256"

say "downloading ${asset} (${VERSION})"
download "$asset_base/$asset" "$archive"
download "$asset_base/$asset.sha256" "$checksum"

expected=$(awk 'NR == 1 { print $1 }' "$checksum")
[ -n "$expected" ] || fail "checksum file is empty"
actual=$(sha256_file "$archive")
[ "$actual" = "$expected" ] || fail "SHA-256 mismatch for $asset"

extract_dir="$tmp_dir/extracted"
mkdir -p "$extract_dir"
tar -xzf "$archive" -C "$extract_dir"
[ -f "$extract_dir/aeko" ] || fail "release archive does not contain aeko"
[ -f "$extract_dir/aeko-keygen" ] || fail "release archive does not contain aeko-keygen"

mkdir -p "$INSTALL_DIR"
for binary in aeko aeko-keygen; do
  staged="$INSTALL_DIR/.${binary}.tmp.$$"
  cp "$extract_dir/$binary" "$staged"
  chmod 0755 "$staged"
  mv -f "$staged" "$INSTALL_DIR/$binary"
done

"$INSTALL_DIR/aeko" --version >/dev/null 2>&1 || fail "installed aeko binary cannot run on this platform"
"$INSTALL_DIR/aeko-keygen" --version >/dev/null 2>&1 || fail "installed aeko-keygen binary cannot run on this platform"

say "installed aeko and aeko-keygen into $INSTALL_DIR"
case ":$PATH:" in
  *":$INSTALL_DIR:"*) ;;
  *)
    say "$INSTALL_DIR is not currently on PATH"
    say "add this to your shell profile: export PATH=\"$INSTALL_DIR:\$PATH\""
    ;;
esac
say "verify with: aeko --version && aeko-keygen --version"
