$paths = @("sdk\src", "transaction-status")
$files = Get-ChildItem -Path $paths -Recurse -Filter *.rs
foreach ($file in $files) {
    (Get-Content $file.FullName) `
        -replace 'Solana', 'AEKO' `
        -replace 'solana-program', 'aeko-program' `
        -replace 'solana-client', 'aeko-client' `
        -replace 'solana-sdk', 'aeko-sdk' `
        -replace 'solana-frozen-abi', 'aeko-frozen-abi' `
        -replace 'solana-logger', 'aeko-logger' `
        | Set-Content ($file.FullName + ".tmp")
    Move-Item -Force ($file.FullName + ".tmp") $file.FullName
}
