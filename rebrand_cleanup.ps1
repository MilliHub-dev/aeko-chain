$exclude = @("target", ".git", ".github", "docs", "scripts")
$dirs = Get-ChildItem -Path . -Directory | Where-Object { $exclude -notcontains $_.Name }

foreach ($dir in $dirs) {
    Write-Host "Processing $($dir.Name)..."
    
    # Process .rs files
    $rsFiles = Get-ChildItem -Path $dir.FullName -Recurse -Filter *.rs
    foreach ($file in $rsFiles) {
        $content = Get-Content $file.FullName -Raw
        $originalContent = $content
        
        # Missed crates
        $content = $content -replace 'solana_core', 'aeko_core'
        $content = $content -replace 'solana_replica', 'aeko_replica'
        $content = $content -replace 'solana_local_cluster', 'aeko_local_cluster'
        $content = $content -replace 'solana_cost_model', 'aeko_cost_model'
        $content = $content -replace 'solana_connection_cache', 'aeko_connection_cache'
        $content = $content -replace 'solana_unified_scheduler_pool', 'aeko_unified_scheduler_pool'
        $content = $content -replace 'solana_unified_scheduler_logic', 'aeko_unified_scheduler_logic'
        $content = $content -replace 'solana_transaction_dos', 'aeko_transaction_dos'
        $content = $content -replace 'solana_tpu_client', 'aeko_tpu_client'
        $content = $content -replace 'solana_udp_client', 'aeko_udp_client'
        $content = $content -replace 'solana_quic_client', 'aeko_quic_client'
        $content = $content -replace 'solana_thin_client', 'aeko_thin_client'
        $content = $content -replace 'solana_pubsub_client', 'aeko_pubsub_client'
        $content = $content -replace 'solana_rpc_client', 'aeko_rpc_client'
        $content = $content -replace 'solana_rpc_client_api', 'aeko_rpc_client_api'
        $content = $content -replace 'solana_rpc_client_nonce_utils', 'aeko_rpc_client_nonce_utils'
        
        # Generic fallback for crates starting with solana_
        # Be careful not to replace things that are already aeko_
        # This regex looks for solana_ followed by a word character, and replaces solana_ with aeko_
        $content = [Regex]::Replace($content, 'solana_([a-z][a-z0-9_]*)', 'aeko_$1')

        if ($content -ne $originalContent) {
            Set-Content -Path $file.FullName -Value $content -NoNewline
            Write-Host "Updated .rs: $($file.FullName)"
        }
    }

    # Process Cargo.toml files
    $tomlFiles = Get-ChildItem -Path $dir.FullName -Recurse -Filter Cargo.toml
    foreach ($file in $tomlFiles) {
        $content = Get-Content $file.FullName -Raw
        $originalContent = $content
        
        # Missed crates in Cargo.toml
        $content = $content -replace 'solana-core', 'aeko-core'
        $content = $content -replace 'solana-local-cluster', 'aeko-local-cluster'
        $content = $content -replace 'solana-cost-model', 'aeko-cost-model'
        $content = $content -replace 'solana-connection-cache', 'aeko-connection-cache'
        $content = $content -replace 'solana-unified-scheduler-pool', 'aeko-unified-scheduler-pool'
        $content = $content -replace 'solana-unified-scheduler-logic', 'aeko-unified-scheduler-logic'
        $content = $content -replace 'solana-transaction-dos', 'aeko-transaction-dos'
        $content = $content -replace 'solana-tpu-client', 'aeko-tpu-client'
        $content = $content -replace 'solana-udp-client', 'aeko-udp-client'
        $content = $content -replace 'solana-quic-client', 'aeko-quic-client'
        $content = $content -replace 'solana-thin-client', 'aeko-thin-client'
        $content = $content -replace 'solana-pubsub-client', 'aeko-pubsub-client'
        $content = $content -replace 'solana-rpc-client', 'aeko-rpc-client'
        $content = $content -replace 'solana-rpc-client-api', 'aeko-rpc-client-api'
        $content = $content -replace 'solana-rpc-client-nonce-utils', 'aeko-rpc-client-nonce_utils'
        
        # Generic fallback for dependencies
        $content = [Regex]::Replace($content, 'solana-([a-z][a-z0-9-]*)', 'aeko-$1')

        if ($content -ne $originalContent) {
            Set-Content -Path $file.FullName -Value $content -NoNewline
            Write-Host "Updated Cargo.toml: $($file.FullName)"
        }
    }
}
