$paths = @("sdk\src", "transaction-status")
$files = Get-ChildItem -Path $paths -Recurse -Filter *.rs
foreach ($file in $files) {
    (Get-Content $file.FullName) `
        -replace 'Aeko', 'AEKO' `
        -replace 'aeko-program', 'aeko-program' `
        -replace 'aeko-client', 'aeko-client' `
        -replace 'aeko-sdk', 'aeko-sdk' `
        -replace 'aeko-frozen-abi', 'aeko-frozen-abi' `
        -replace 'aeko-logger', 'aeko-logger' `
        | Set-Content ($file.FullName + ".tmp")
    Move-Item -Force ($file.FullName + ".tmp") $file.FullName
}
