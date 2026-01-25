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
            $content = $content -replace 'solana_program', 'aeko_program'
            $content = $content -replace 'solana_sdk', 'aeko_sdk'
            $content = $content -replace 'solana_client', 'aeko_client'
            $content = $content -replace 'solana_logger', 'aeko_logger'
            $content = $content -replace 'solana_vote_program', 'aeko_vote_program'
            $content = $content -replace 'solana_account_decoder', 'aeko_account_decoder'
            $content = $content -replace 'solana_transaction_status', 'aeko_transaction_status'
            $content = $content -replace 'solana_runtime', 'aeko_runtime'
            $content = $content -replace 'solana_ledger', 'aeko_ledger'
            $content = $content -replace 'solana_gossip', 'aeko_gossip'
            $content = $content -replace 'solana_rpc', 'aeko_rpc'
            $content = $content -replace 'solana_streamer', 'aeko_streamer'
            $content = $content -replace 'solana_faucet', 'aeko_faucet'
            $content = $content -replace 'solana_validator', 'aeko_validator'
            $content = $content -replace 'solana_metrics', 'aeko_metrics'
            $content = $content -replace 'solana_perf', 'aeko_perf'
            $content = $content -replace 'solana_measure', 'aeko_measure'
            $content = $content -replace 'solana_frozen_abi', 'aeko_frozen_abi'
            $content = $content -replace 'solana_net_utils', 'aeko_net_utils'
            $content = $content -replace 'solana_version', 'aeko_version'
            $content = $content -replace 'solana_zk_token_sdk', 'aeko_zk_token_sdk'
            $content = $content -replace 'solana_entry', 'aeko_entry'
            $content = $content -replace 'solana_poh', 'aeko_poh'
            $content = $content -replace 'solana_rayon_threadlimit', 'aeko_rayon_threadlimit'
            $content = $content -replace 'solana_storage_bigtable', 'aeko_storage_bigtable'
            $content = $content -replace 'solana_geyser_plugin_manager', 'aeko_geyser_plugin_manager'
            $content = $content -replace 'solana_bpf_loader_program', 'aeko_bpf_loader_program'
            $content = $content -replace 'solana_compute_budget', 'aeko_compute_budget'
            $content = $content -replace 'solana_address_lookup_table_program', 'aeko_address_lookup_table_program'
            $content = $content -replace 'solana_config_program', 'aeko_config_program'
            $content = $content -replace 'solana_stake_program', 'aeko_stake_program'
            $content = $content -replace 'solana_system_program', 'aeko_system_program'
            
            # Terminology renames
            $content = $content -replace 'sol_to_lamports', 'aeko_to_lamports'
            $content = $content -replace 'lamports_to_sol', 'lamports_to_aeko'
            $content = $content -replace 'LAMPORTS_PER_SOL', 'LAMPORTS_PER_AEKO'
            
            # Documentation/String renames (be careful not to break URLs too badly, but docs.solana.com -> docs.aeko.network is desired)
            $content = $content -replace 'docs.solana.com', 'docs.aeko.network'
            $content = $content -replace 'docs.solanalabs.com', 'docs.aeko.network'
            $content = $content -replace 'solana-labs', 'aeko-chain' 
            
            if ($content -ne $originalContent) {
                Set-Content -Path $file.FullName -Value $content -NoNewline
                Write-Host "Updated $($file.FullName)"
            }
        }
    }
}
