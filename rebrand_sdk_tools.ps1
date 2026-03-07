$paths = @("sdk\cargo-build-sbf\src", "sdk\cargo-build-bpf\src", "programs\sbf")
$files = Get-ChildItem -Path $paths -Recurse -Filter *.rs
foreach ($file in $files) {
    (Get-Content $file.FullName) `
        -replace 'aeko_download_utils', 'aeko_download_utils' `
        -replace 'aeko_sdk', 'aeko_sdk' `
        -replace 'aeko_logger', 'aeko_logger' `
        -replace 'aeko_version', 'aeko_version' `
        -replace 'aeko_program', 'aeko_program' `
        -replace 'aeko_account_decoder', 'aeko_account_decoder' `
        -replace 'aeko_accounts_db', 'aeko_accounts_db' `
        -replace 'aeko_bpf_loader_program', 'aeko_bpf_loader_program' `
        -replace 'aeko_cli_output', 'aeko_cli_output' `
        -replace 'aeko_ledger', 'aeko_ledger' `
        -replace 'aeko_measure', 'aeko_measure' `
        -replace 'aeko_program_runtime', 'aeko_program_runtime' `
        -replace 'aeko_program_test', 'aeko_program_test' `
        -replace 'aeko_runtime', 'aeko_runtime' `
        -replace 'aeko_sbf_rust_128bit_dep', 'aeko_sbf_rust_128bit_dep' `
        -replace 'aeko_sbf_rust_invoke', 'aeko_sbf_rust_invoke' `
        -replace 'aeko_sbf_rust_invoked', 'aeko_sbf_rust_invoked' `
        -replace 'aeko_sbf_rust_many_args_dep', 'aeko_sbf_rust_many_args_dep' `
        -replace 'aeko_sbf_rust_mem', 'aeko_sbf_rust_mem' `
        -replace 'aeko_sbf_rust_param_passing_dep', 'aeko_sbf_rust_param_passing_dep' `
        -replace 'aeko_sbf_rust_realloc', 'aeko_sbf_rust_realloc' `
        -replace 'aeko_sbf_rust_realloc_invoke', 'aeko_sbf_rust_realloc_invoke' `
        -replace 'aeko_svm', 'aeko_svm' `
        -replace 'aeko_transaction_status', 'aeko_transaction_status' `
        -replace 'aeko_validator', 'aeko_validator' `
        -replace 'aeko_zk_token_sdk', 'aeko_zk_token_sdk' `
        | Set-Content ($file.FullName + ".tmp")
    Move-Item -Force ($file.FullName + ".tmp") $file.FullName
}
