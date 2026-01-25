$paths = @("sdk\cargo-build-sbf\src", "sdk\cargo-build-bpf\src", "programs\sbf")
$files = Get-ChildItem -Path $paths -Recurse -Filter *.rs
foreach ($file in $files) {
    (Get-Content $file.FullName) `
        -replace 'solana_download_utils', 'aeko_download_utils' `
        -replace 'solana_sdk', 'aeko_sdk' `
        -replace 'solana_logger', 'aeko_logger' `
        -replace 'solana_version', 'aeko_version' `
        -replace 'solana_program', 'aeko_program' `
        -replace 'solana_account_decoder', 'aeko_account_decoder' `
        -replace 'solana_accounts_db', 'aeko_accounts_db' `
        -replace 'solana_bpf_loader_program', 'aeko_bpf_loader_program' `
        -replace 'solana_cli_output', 'aeko_cli_output' `
        -replace 'solana_ledger', 'aeko_ledger' `
        -replace 'solana_measure', 'aeko_measure' `
        -replace 'solana_program_runtime', 'aeko_program_runtime' `
        -replace 'solana_program_test', 'aeko_program_test' `
        -replace 'solana_runtime', 'aeko_runtime' `
        -replace 'solana_sbf_rust_128bit_dep', 'aeko_sbf_rust_128bit_dep' `
        -replace 'solana_sbf_rust_invoke', 'aeko_sbf_rust_invoke' `
        -replace 'solana_sbf_rust_invoked', 'aeko_sbf_rust_invoked' `
        -replace 'solana_sbf_rust_many_args_dep', 'aeko_sbf_rust_many_args_dep' `
        -replace 'solana_sbf_rust_mem', 'aeko_sbf_rust_mem' `
        -replace 'solana_sbf_rust_param_passing_dep', 'aeko_sbf_rust_param_passing_dep' `
        -replace 'solana_sbf_rust_realloc', 'aeko_sbf_rust_realloc' `
        -replace 'solana_sbf_rust_realloc_invoke', 'aeko_sbf_rust_realloc_invoke' `
        -replace 'solana_svm', 'aeko_svm' `
        -replace 'solana_transaction_status', 'aeko_transaction_status' `
        -replace 'solana_validator', 'aeko_validator' `
        -replace 'solana_zk_token_sdk', 'aeko_zk_token_sdk' `
        | Set-Content ($file.FullName + ".tmp")
    Move-Item -Force ($file.FullName + ".tmp") $file.FullName
}
