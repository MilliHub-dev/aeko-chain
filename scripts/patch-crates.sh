# source this file

update_aeko_dependencies() {
  declare project_root="$1"
  declare aeko_ver="$2"
  declare tomls=()
  while IFS='' read -r line; do tomls+=("$line"); done < <(find "$project_root" -name Cargo.toml)

  sed -i -e "s#\(aeko-program = \"\)[^\"]*\(\"\)#\1=$aeko_ver\2#g" "${tomls[@]}" || return $?
  sed -i -e "s#\(aeko-program = { version = \"\)[^\"]*\(\"\)#\1=$aeko_ver\2#g" "${tomls[@]}" || return $?
  sed -i -e "s#\(aeko-program-test = \"\)[^\"]*\(\"\)#\1=$aeko_ver\2#g" "${tomls[@]}" || return $?
  sed -i -e "s#\(aeko-program-test = { version = \"\)[^\"]*\(\"\)#\1=$aeko_ver\2#g" "${tomls[@]}" || return $?
  sed -i -e "s#\(aeko-sdk = \"\).*\(\"\)#\1=$aeko_ver\2#g" "${tomls[@]}" || return $?
  sed -i -e "s#\(aeko-sdk = { version = \"\)[^\"]*\(\"\)#\1=$aeko_ver\2#g" "${tomls[@]}" || return $?
  sed -i -e "s#\(aeko-client = \"\)[^\"]*\(\"\)#\1=$aeko_ver\2#g" "${tomls[@]}" || return $?
  sed -i -e "s#\(aeko-client = { version = \"\)[^\"]*\(\"\)#\1=$aeko_ver\2#g" "${tomls[@]}" || return $?
  sed -i -e "s#\(aeko-cli-config = \"\)[^\"]*\(\"\)#\1=$aeko_ver\2#g" "${tomls[@]}" || return $?
  sed -i -e "s#\(aeko-cli-config = { version = \"\)[^\"]*\(\"\)#\1=$aeko_ver\2#g" "${tomls[@]}" || return $?
  sed -i -e "s#\(aeko-clap-utils = \"\)[^\"]*\(\"\)#\1=$aeko_ver\2#g" "${tomls[@]}" || return $?
  sed -i -e "s#\(aeko-clap-utils = { version = \"\)[^\"]*\(\"\)#\1=$aeko_ver\2#g" "${tomls[@]}" || return $?
  sed -i -e "s#\(aeko-account-decoder = \"\)[^\"]*\(\"\)#\1=$aeko_ver\2#g" "${tomls[@]}" || return $?
  sed -i -e "s#\(aeko-account-decoder = { version = \"\)[^\"]*\(\"\)#\1=$aeko_ver\2#g" "${tomls[@]}" || return $?
  sed -i -e "s#\(aeko-faucet = \"\)[^\"]*\(\"\)#\1=$aeko_ver\2#g" "${tomls[@]}" || return $?
  sed -i -e "s#\(aeko-faucet = { version = \"\)[^\"]*\(\"\)#\1=$aeko_ver\2#g" "${tomls[@]}" || return $?
  sed -i -e "s#\(aeko-zk-token-sdk = \"\)[^\"]*\(\"\)#\1=$aeko_ver\2#g" "${tomls[@]}" || return $?
  sed -i -e "s#\(aeko-zk-token-sdk = { version = \"\)[^\"]*\(\"\)#\1=$aeko_ver\2#g" "${tomls[@]}" || return $?
}

patch_crates_io_aeko() {
  declare Cargo_toml="$1"
  declare aeko_dir="$2"
  cat >> "$Cargo_toml" <<EOF
[patch.crates-io]
EOF
patch_crates_io_aeko_no_header "$Cargo_toml" "$aeko_dir"
}

patch_crates_io_aeko_no_header() {
  declare Cargo_toml="$1"
  declare aeko_dir="$2"
  cat >> "$Cargo_toml" <<EOF
aeko-account-decoder = { path = "$aeko_dir/account-decoder" }
aeko-clap-utils = { path = "$aeko_dir/clap-utils" }
aeko-client = { path = "$aeko_dir/client" }
aeko-cli-config = { path = "$aeko_dir/cli-config" }
aeko-program = { path = "$aeko_dir/sdk/program" }
aeko-program-test = { path = "$aeko_dir/program-test" }
aeko-sdk = { path = "$aeko_dir/sdk" }
aeko-faucet = { path = "$aeko_dir/faucet" }
aeko-zk-token-sdk = { path = "$aeko_dir/zk-token-sdk" }
EOF
}
