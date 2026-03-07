$exclude = @("target", ".git", ".github", "docs", "scripts")
$dirs = Get-ChildItem -Path . -Directory | Where-Object { $exclude -notcontains $_.Name }

foreach ($dir in $dirs) {
    Write-Host "Processing $($dir.Name) Cargo.toml..."
    $files = Get-ChildItem -Path $dir.FullName -Recurse -Filter Cargo.toml
    foreach ($file in $files) {
        $content = Get-Content $file.FullName -Raw
        $originalContent = $content
        
        # Dependency renames
        $content = $content -replace 'aeko-program', 'aeko-program'
        $content = $content -replace 'aeko-sdk', 'aeko-sdk'
        $content = $content -replace 'aeko-client', 'aeko-client'
        $content = $content -replace 'aeko-logger', 'aeko-logger'
        $content = $content -replace 'aeko-vote-program', 'aeko-vote-program'
        $content = $content -replace 'aeko-account-decoder', 'aeko-account-decoder'
        $content = $content -replace 'aeko-transaction-status', 'aeko-transaction-status'
        $content = $content -replace 'aeko-runtime', 'aeko-runtime'
        $content = $content -replace 'aeko-ledger', 'aeko-ledger'
        $content = $content -replace 'aeko-gossip', 'aeko-gossip'
        $content = $content -replace 'aeko-rpc', 'aeko-rpc'
        $content = $content -replace 'aeko-streamer', 'aeko-streamer'
        $content = $content -replace 'aeko-faucet', 'aeko-faucet'
        $content = $content -replace 'aeko-validator', 'aeko-validator'
        $content = $content -replace 'aeko-metrics', 'aeko-metrics'
        $content = $content -replace 'aeko-perf', 'aeko-perf'
        $content = $content -replace 'aeko-measure', 'aeko-measure'
        $content = $content -replace 'aeko-frozen-abi', 'aeko-frozen-abi'
        $content = $content -replace 'aeko-net-utils', 'aeko-net-utils'
        $content = $content -replace 'aeko-version', 'aeko-version'
        $content = $content -replace 'aeko-zk-token-sdk', 'aeko-zk-token-sdk'
        $content = $content -replace 'aeko-entry', 'aeko-entry'
        $content = $content -replace 'aeko-poh', 'aeko-poh'
        $content = $content -replace 'aeko-rayon-threadlimit', 'aeko-rayon-threadlimit'
        $content = $content -replace 'aeko-storage-bigtable', 'aeko-storage_bigtable'
        $content = $content -replace 'aeko-geyser-plugin-manager', 'aeko-geyser-plugin-manager'
        $content = $content -replace 'aeko-bpf-loader-program', 'aeko-bpf-loader-program'
        $content = $content -replace 'aeko-compute-budget', 'aeko-compute-budget'
        $content = $content -replace 'aeko-address-lookup-table-program', 'aeko-address-lookup-table-program'
        $content = $content -replace 'aeko-config-program', 'aeko-config-program'
        $content = $content -replace 'aeko-stake-program', 'aeko-stake-program'
        $content = $content -replace 'aeko-system-program', 'aeko-system-program'
        $content = $content -replace 'aeko-clap-utils', 'aeko-clap-utils'
        $content = $content -replace 'aeko-remote-wallet', 'aeko-remote-wallet'
        $content = $content -replace 'aeko-send-transaction-service', 'aeko-send-transaction-service'
        $content = $content -replace 'aeko-tpu-client', 'aeko-tpu-client'
        $content = $content -replace 'aeko-udp-client', 'aeko-udp-client'
        $content = $content -replace 'aeko-quic-client', 'aeko-quic_client'
        $content = $content -replace 'aeko-thin-client', 'aeko-thin-client'
        $content = $content -replace 'aeko-banks-client', 'aeko-banks-client'
        $content = $content -replace 'aeko-banks-server', 'aeko-banks-server'
        $content = $content -replace 'aeko-banks-interface', 'aeko-banks-interface'
        $content = $content -replace 'aeko-test-validator', 'aeko-test-validator'
        $content = $content -replace 'aeko-program-test', 'aeko-program-test'
        $content = $content -replace 'aeko-bucket-map', 'aeko-bucket-map'
        $content = $content -replace 'aeko-merkle-tree', 'aeko-merkle-tree'
        $content = $content -replace 'aeko-merkle-root-bench', 'aeko-merkle-root-bench'
        $content = $content -replace 'aeko-lattice-hash', 'aeko-lattice-hash'
        $content = $content -replace 'aeko-download-utils', 'aeko-download-utils'
        $content = $content -replace 'aeko-bloom', 'aeko-bloom'
        $content = $content -replace 'aeko-accounts-db', 'aeko-accounts-db'
        $content = $content -replace 'aeko-crypto', 'aeko-crypto'
        
        # Package name renames (if name = "aeko-...")
        $content = $content -replace 'name = "aeko-', 'name = "aeko-'
        
        if ($content -ne $originalContent) {
            Set-Content -Path $file.FullName -Value $content -NoNewline
            Write-Host "Updated $($file.FullName)"
        }
    }
}
