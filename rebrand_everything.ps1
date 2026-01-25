$exclude = @("target", ".git", ".github", "docs", "scripts")
$dirs = Get-ChildItem -Path . -Directory | Where-Object { $exclude -notcontains $_.Name }

foreach ($dir in $dirs) {
    Write-Host "Processing $($dir.Name)..."
    $files = Get-ChildItem -Path $dir.FullName -Recurse -Filter *.rs
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
        $content = $content -replace 'solana_clap_utils', 'aeko_clap_utils'
        $content = $content -replace 'solana_remote_wallet', 'aeko_remote_wallet'
        $content = $content -replace 'solana_send_transaction_service', 'aeko_send_transaction_service'
        $content = $content -replace 'solana_tpu_client', 'aeko_tpu_client'
        $content = $content -replace 'solana_udp_client', 'aeko_udp_client'
        $content = $content -replace 'solana_quic_client', 'aeko_quic_client'
        $content = $content -replace 'solana_thin_client', 'aeko_thin_client'
        $content = $content -replace 'solana_banks_client', 'aeko_banks_client'
        $content = $content -replace 'solana_banks_server', 'aeko_banks_server'
        $content = $content -replace 'solana_banks_interface', 'aeko_banks_interface'
        $content = $content -replace 'solana_test_validator', 'aeko_test_validator'
        $content = $content -replace 'solana_program_test', 'aeko_program_test'
        $content = $content -replace 'solana_bucket_map', 'aeko_bucket_map'
        $content = $content -replace 'solana_merkle_tree', 'aeko_merkle_tree'
        $content = $content -replace 'solana_merkle_root_bench', 'aeko_merkle_root_bench'
        $content = $content -replace 'solana_lattice_hash', 'aeko_lattice_hash'
        $content = $content -replace 'solana_download_utils', 'aeko_download_utils'
        $content = $content -replace 'solana_bloom', 'aeko_bloom'
        $content = $content -replace 'solana_accounts_db', 'aeko_accounts_db'
        
        # Terminology renames
        $content = $content -replace 'sol_to_lamports', 'aeko_to_lamports'
        $content = $content -replace 'lamports_to_sol', 'lamports_to_aeko'
        $content = $content -replace 'LAMPORTS_PER_SOL', 'LAMPORTS_PER_AEKO'
        
        # Documentation/String renames
        $content = $content -replace 'docs.solana.com', 'docs.aeko.network'
        $content = $content -replace 'docs.solanalabs.com', 'docs.aeko.network'
        $content = $content -replace 'solana-labs', 'aeko-chain' 
        
        if ($content -ne $originalContent) {
            Set-Content -Path $file.FullName -Value $content -NoNewline
            Write-Host "Updated $($file.FullName)"
        }
    }
}
