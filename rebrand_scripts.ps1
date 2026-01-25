$scriptsDir = "scripts"
$files = Get-ChildItem -Path $scriptsDir

foreach ($file in $files) {
    # Rename file if it contains "solana"
    if ($file.Name -match "solana") {
        $newName = $file.Name -replace "solana", "aeko"
        Rename-Item -Path $file.FullName -NewName $newName
        Write-Host "Renamed $($file.Name) to $newName"
        $file = Get-Item -Path "$scriptsDir\$newName" # Update file reference
    }

    # Replace content
    if ($file.Extension -eq ".sh" -or $file.Extension -eq ".py") {
        $content = Get-Content $file.FullName -Raw
        $originalContent = $content
        
        $content = $content -replace 'solana', 'aeko'
        $content = $content -replace 'SOLANA', 'AEKO'
        $content = $content -replace 'Solana', 'AEKO'
        
        if ($content -ne $originalContent) {
            Set-Content -Path $file.FullName -Value $content -NoNewline
            Write-Host "Updated content in $($file.Name)"
        }
    }
}
