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
        $content = $content -replace 'aeko_core', 'aeko_core'
        $content = $content -replace 'aeko_replica', 'aeko_replica'
        $content = $content -replace 'aeko_local_cluster', 'aeko_local_cluster'
        $content = $content -replace 'aeko_cost_model', 'aeko_cost_model'
        $content = $content -replace 'aeko_connection_cache', 'aeko_connection_cache'
        $content = $content -replace 'aeko_unified_scheduler_pool', 'aeko_unified_scheduler_pool'
        $content = $content -replace 'aeko_unified_scheduler_logic', 'aeko_unified_scheduler_logic'
        $content = $content -replace 'aeko_transaction_dos', 'aeko_transaction_dos'
        $content = $content -replace 'aeko_tpu_client', 'aeko_tpu_client'
        $content = $content -replace 'aeko_udp_client', 'aeko_udp_client'
        $content = $content -replace 'aeko_quic_client', 'aeko_quic_client'
        $content = $content -replace 'aeko_thin_client', 'aeko_thin_client'
        $content = $content -replace 'aeko_pubsub_client', 'aeko_pubsub_client'
        $content = $content -replace 'aeko_rpc_client', 'aeko_rpc_client'
        $content = $content -replace 'aeko_rpc_client_api', 'aeko_rpc_client_api'
        $content = $content -replace 'aeko_rpc_client_nonce_utils', 'aeko_rpc_client_nonce_utils'
        
        # Generic fallback for crates starting with aeko_
        # Be careful not to replace things that are already aeko_
        # This regex looks for aeko_ followed by a word character, and replaces aeko_ with aeko_
        $content = [Regex]::Replace($content, 'aeko_([a-z][a-z0-9_]*)', 'aeko_$1')

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
        $content = $content -replace 'aeko-core', 'aeko-core'
        $content = $content -replace 'aeko-local-cluster', 'aeko-local-cluster'
        $content = $content -replace 'aeko-cost-model', 'aeko-cost-model'
        $content = $content -replace 'aeko-connection-cache', 'aeko-connection-cache'
        $content = $content -replace 'aeko-unified-scheduler-pool', 'aeko-unified-scheduler-pool'
        $content = $content -replace 'aeko-unified-scheduler-logic', 'aeko-unified-scheduler-logic'
        $content = $content -replace 'aeko-transaction-dos', 'aeko-transaction-dos'
        $content = $content -replace 'aeko-tpu-client', 'aeko-tpu-client'
        $content = $content -replace 'aeko-udp-client', 'aeko-udp-client'
        $content = $content -replace 'aeko-quic-client', 'aeko-quic-client'
        $content = $content -replace 'aeko-thin-client', 'aeko-thin-client'
        $content = $content -replace 'aeko-pubsub-client', 'aeko-pubsub-client'
        $content = $content -replace 'aeko-rpc-client', 'aeko-rpc-client'
        $content = $content -replace 'aeko-rpc-client-api', 'aeko-rpc-client-api'
        $content = $content -replace 'aeko-rpc-client-nonce-utils', 'aeko-rpc-client-nonce_utils'
        
        # Generic fallback for dependencies
        $content = [Regex]::Replace($content, 'aeko-([a-z][a-z0-9-]*)', 'aeko-$1')

        if ($content -ne $originalContent) {
            Set-Content -Path $file.FullName -Value $content -NoNewline
            Write-Host "Updated Cargo.toml: $($file.FullName)"
        }
    }
}
