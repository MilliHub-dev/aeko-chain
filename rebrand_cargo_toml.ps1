$exclude = @("target", ".git", ".github", "docs", "scripts")
$dirs = Get-ChildItem -Path . -Directory | Where-Object { $exclude -notcontains $_.Name }

foreach ($dir in $dirs) {
    Write-Host "Processing $($dir.Name) Cargo.toml..."
    $files = Get-ChildItem -Path $dir.FullName -Recurse -Filter Cargo.toml
    foreach ($file in $files) {
        $content = Get-Content $file.FullName -Raw
        $originalContent = $content
        
        # Dependency renames
        $content = $content -replace 'solana-program', 'aeko-program'
        $content = $content -replace 'solana-sdk', 'aeko-sdk'
        $content = $content -replace 'solana-client', 'aeko-client'
        $content = $content -replace 'solana-logger', 'aeko-logger'
        $content = $content -replace 'solana-vote-program', 'aeko-vote-program'
        $content = $content -replace 'solana-account-decoder', 'aeko-account-decoder'
        $content = $content -replace 'solana-transaction-status', 'aeko-transaction-status'
        $content = $content -replace 'solana-runtime', 'aeko-runtime'
        $content = $content -replace 'solana-ledger', 'aeko-ledger'
        $content = $content -replace 'solana-gossip', 'aeko-gossip'
        $content = $content -replace 'solana-rpc', 'aeko-rpc'
        $content = $content -replace 'solana-streamer', 'aeko-streamer'
        $content = $content -replace 'solana-faucet', 'aeko-faucet'
        $content = $content -replace 'solana-validator', 'aeko-validator'
        $content = $content -replace 'solana-metrics', 'aeko-metrics'
        $content = $content -replace 'solana-perf', 'aeko-perf'
        $content = $content -replace 'solana-measure', 'aeko-measure'
        $content = $content -replace 'solana-frozen-abi', 'aeko-frozen-abi'
        $content = $content -replace 'solana-net-utils', 'aeko-net-utils'
        $content = $content -replace 'solana-version', 'aeko-version'
        $content = $content -replace 'solana-zk-token-sdk', 'aeko-zk-token-sdk'
        $content = $content -replace 'solana-entry', 'aeko-entry'
        $content = $content -replace 'solana-poh', 'aeko-poh'
        $content = $content -replace 'solana-rayon-threadlimit', 'aeko-rayon-threadlimit'
        $content = $content -replace 'solana-storage-bigtable', 'aeko-storage_bigtable'
        $content = $content -replace 'solana-geyser-plugin-manager', 'aeko-geyser-plugin-manager'
        $content = $content -replace 'solana-bpf-loader-program', 'aeko-bpf-loader-program'
        $content = $content -replace 'solana-compute-budget', 'aeko-compute-budget'
        $content = $content -replace 'solana-address-lookup-table-program', 'aeko-address-lookup-table-program'
        $content = $content -replace 'solana-config-program', 'aeko-config-program'
        $content = $content -replace 'solana-stake-program', 'aeko-stake-program'
        $content = $content -replace 'solana-system-program', 'aeko-system-program'
        $content = $content -replace 'solana-clap-utils', 'aeko-clap-utils'
        $content = $content -replace 'solana-remote-wallet', 'aeko-remote-wallet'
        $content = $content -replace 'solana-send-transaction-service', 'aeko-send-transaction-service'
        $content = $content -replace 'solana-tpu-client', 'aeko-tpu-client'
        $content = $content -replace 'solana-udp-client', 'aeko-udp-client'
        $content = $content -replace 'solana-quic-client', 'aeko-quic_client'
        $content = $content -replace 'solana-thin-client', 'aeko-thin-client'
        $content = $content -replace 'solana-banks-client', 'aeko-banks-client'
        $content = $content -replace 'solana-banks-server', 'aeko-banks-server'
        $content = $content -replace 'solana-banks-interface', 'aeko-banks-interface'
        $content = $content -replace 'solana-test-validator', 'aeko-test-validator'
        $content = $content -replace 'solana-program-test', 'aeko-program-test'
        $content = $content -replace 'solana-bucket-map', 'aeko-bucket-map'
        $content = $content -replace 'solana-merkle-tree', 'aeko-merkle-tree'
        $content = $content -replace 'solana-merkle-root-bench', 'aeko-merkle-root-bench'
        $content = $content -replace 'solana-lattice-hash', 'aeko-lattice-hash'
        $content = $content -replace 'solana-download-utils', 'aeko-download-utils'
        $content = $content -replace 'solana-bloom', 'aeko-bloom'
        $content = $content -replace 'solana-accounts-db', 'aeko-accounts-db'
        $content = $content -replace 'solana-crypto', 'aeko-crypto'
        
        # Package name renames (if name = "solana-...")
        $content = $content -replace 'name = "solana-', 'name = "aeko-'
        
        if ($content -ne $originalContent) {
            Set-Content -Path $file.FullName -Value $content -NoNewline
            Write-Host "Updated $($file.FullName)"
        }
    }
}
