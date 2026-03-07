$dirs = @("tokens", "cli", "cli-output", "validator", "ledger", "rpc", "gossip", "core", "sdk", "transaction-status")
$root = Get-Location

foreach ($dir in $dirs) {
    $path = Join-Path $root $dir
    if (Test-Path $path) {
        Write-Host "Processing $dir..."
        $files = Get-ChildItem -Path $path -Recurse -Filter *.rs
        foreach ($file in $files) {
            $content = Get-Content $file.FullName -Raw
            $originalContent = $content
            
            # Crate renames
            $content = $content -replace 'aeko_program', 'aeko_program'
            $content = $content -replace 'aeko_sdk', 'aeko_sdk'
            $content = $content -replace 'aeko_client', 'aeko_client'
            $content = $content -replace 'aeko_logger', 'aeko_logger'
            $content = $content -replace 'aeko_vote_program', 'aeko_vote_program'
            $content = $content -replace 'aeko_account_decoder', 'aeko_account_decoder'
            $content = $content -replace 'aeko_transaction_status', 'aeko_transaction_status'
            $content = $content -replace 'aeko_runtime', 'aeko_runtime'
            $content = $content -replace 'aeko_ledger', 'aeko_ledger'
            $content = $content -replace 'aeko_gossip', 'aeko_gossip'
            $content = $content -replace 'aeko_rpc', 'aeko_rpc'
            $content = $content -replace 'aeko_streamer', 'aeko_streamer'
            $content = $content -replace 'aeko_faucet', 'aeko_faucet'
            $content = $content -replace 'aeko_validator', 'aeko_validator'
            $content = $content -replace 'aeko_metrics', 'aeko_metrics'
            $content = $content -replace 'aeko_perf', 'aeko_perf'
            $content = $content -replace 'aeko_measure', 'aeko_measure'
            $content = $content -replace 'aeko_frozen_abi', 'aeko_frozen_abi'
            $content = $content -replace 'aeko_net_utils', 'aeko_net_utils'
            $content = $content -replace 'aeko_version', 'aeko_version'
            $content = $content -replace 'aeko_zk_token_sdk', 'aeko_zk_token_sdk'
            $content = $content -replace 'aeko_entry', 'aeko_entry'
            $content = $content -replace 'aeko_poh', 'aeko_poh'
            $content = $content -replace 'aeko_rayon_threadlimit', 'aeko_rayon_threadlimit'
            $content = $content -replace 'aeko_storage_bigtable', 'aeko_storage_bigtable'
            $content = $content -replace 'aeko_geyser_plugin_manager', 'aeko_geyser_plugin_manager'
            $content = $content -replace 'aeko_bpf_loader_program', 'aeko_bpf_loader_program'
            $content = $content -replace 'aeko_compute_budget', 'aeko_compute_budget'
            $content = $content -replace 'aeko_address_lookup_table_program', 'aeko_address_lookup_table_program'
            $content = $content -replace 'aeko_config_program', 'aeko_config_program'
            $content = $content -replace 'aeko_stake_program', 'aeko_stake_program'
            $content = $content -replace 'aeko_system_program', 'aeko_system_program'
            
            # Terminology renames
            $content = $content -replace 'sol_to_lamports', 'aeko_to_lamports'
            $content = $content -replace 'lamports_to_sol', 'lamports_to_aeko'
            $content = $content -replace 'LAMPORTS_PER_SOL', 'LAMPORTS_PER_AEKO'
            
            # Documentation/String renames (be careful not to break URLs too badly, but docs.aeko.com -> docs.aeko.network is desired)
            $content = $content -replace 'docs.aeko.com', 'docs.aeko.network'
            $content = $content -replace 'docs.solanalabs.com', 'docs.aeko.network'
            $content = $content -replace 'aeko-labs', 'aeko-chain' 
            
            if ($content -ne $originalContent) {
                Set-Content -Path $file.FullName -Value $content -NoNewline
                Write-Host "Updated $($file.FullName)"
            }
        }
    }
}
