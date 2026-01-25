$files = @(
    @{ Url="https://raw.githubusercontent.com/solana-labs/solana/master/sdk/src/fee.rs"; Path="sdk/src/fee.rs" },
    @{ Url="https://raw.githubusercontent.com/solana-labs/solana/master/sdk/src/lib.rs"; Path="sdk/src/lib.rs" },
    @{ Url="https://raw.githubusercontent.com/solana-labs/solana/master/sdk/src/log.rs"; Path="sdk/src/log.rs" },
    @{ Url="https://raw.githubusercontent.com/solana-labs/solana/master/sdk/src/pubkey.rs"; Path="sdk/src/pubkey.rs" },
    @{ Url="https://raw.githubusercontent.com/solana-labs/solana/master/sdk/src/recent_blockhashes_account.rs"; Path="sdk/src/recent_blockhashes_account.rs" },
    @{ Url="https://raw.githubusercontent.com/solana-labs/solana/master/sdk/src/rent_collector.rs"; Path="sdk/src/rent_collector.rs" },
    @{ Url="https://raw.githubusercontent.com/solana-labs/solana/master/sdk/src/secp256k1_instruction.rs"; Path="sdk/src/secp256k1_instruction.rs" },
    @{ Url="https://raw.githubusercontent.com/solana-labs/solana/master/sdk/src/transaction/mod.rs"; Path="sdk/src/transaction/mod.rs" },
    @{ Url="https://raw.githubusercontent.com/solana-labs/solana/master/transaction-status/benches/extract_memos.rs"; Path="transaction-status/benches/extract_memos.rs" }
)

foreach ($item in $files) {
    Write-Host "Restoring $($item.Path)..."
    try {
        $response = Invoke-WebRequest -Uri $item.Url -UseBasicParsing
        if ($response.StatusCode -eq 200) {
            $content = $response.Content
            
            # Apply rebranding
            $content = $content -replace 'solana_program', 'aeko_program'
            $content = $content -replace 'solana_sdk', 'aeko_sdk'
            $content = $content -replace 'solana_logger', 'aeko_logger'
            $content = $content -replace 'solana_frozen_abi', 'aeko_frozen_abi'
            $content = $content -replace 'solana_account_decoder', 'aeko_account_decoder'
            $content = $content -replace 'solana_transaction_status', 'aeko_transaction_status'
            $content = $content -replace 'docs.solanalabs.com', 'docs.aeko.network'
            $content = $content -replace 'docs.solana.com', 'docs.aeko.network'
            $content = $content -replace 'sol_to_lamports', 'aeko_to_lamports'
            $content = $content -replace 'lamports_to_sol', 'lamports_to_aeko'
            $content = $content -replace 'LAMPORTS_PER_SOL', 'LAMPORTS_PER_AEKO'
            
            $dir = Split-Path -Path $item.Path
            if (!(Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
            
            Set-Content -Path $item.Path -Value $content -Encoding UTF8
            Write-Host "Restored and rebranded $($item.Path)"
        } else {
            Write-Error "Failed to download $($item.Url). Status code: $($response.StatusCode)"
        }
    } catch {
        Write-Error "Failed to restore $($item.Path): $_"
    }
}
