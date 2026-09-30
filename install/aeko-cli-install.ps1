$ErrorActionPreference = 'Stop'

$Repository = if ($env:AEKO_GITHUB_REPOSITORY) { $env:AEKO_GITHUB_REPOSITORY } else { 'MilliHub-dev/aeko-chain' }
$Version = if ($env:AEKO_VERSION) { $env:AEKO_VERSION } else { 'latest' }
$LocalAppData = [Environment]::GetFolderPath('LocalApplicationData')
if (-not $LocalAppData) { $LocalAppData = $env:LOCALAPPDATA }
if (-not $LocalAppData) { throw 'aeko-install: unable to determine the current user LocalAppData directory' }
$InstallDir = if ($env:AEKO_INSTALL_DIR) { $env:AEKO_INSTALL_DIR } else { Join-Path $LocalAppData 'Aeko\bin' }
$AssetBaseOverride = $env:AEKO_CLI_ASSET_BASE_URL

function Fail([string]$Message) {
    throw "aeko-install: $Message"
}

if (-not [Environment]::Is64BitOperatingSystem) {
    Fail '32-bit Windows is not supported.'
}

# Windows PowerShell 5.1 can expose RuntimeInformation.OSArchitecture as null.
# Prefer the Windows architecture environment variables and only consult
# RuntimeInformation as a null-checked fallback. Do not infer x64 merely from
# OS bitness because that would misclassify ARM64 Windows.
$Architecture = if ($env:PROCESSOR_ARCHITEW6432) {
    $env:PROCESSOR_ARCHITEW6432
} elseif ($env:PROCESSOR_ARCHITECTURE) {
    $env:PROCESSOR_ARCHITECTURE
} else {
    $RuntimeArchitecture = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture
    if ($null -ne $RuntimeArchitecture) { $RuntimeArchitecture.ToString() } else { $null }
}

if (-not $Architecture) {
    Fail 'unable to determine Windows architecture'
}

switch ($Architecture.ToUpperInvariant()) {
    'AMD64' { $Target = 'x86_64-pc-windows-msvc' }
    'X64' { $Target = 'x86_64-pc-windows-msvc' }
    default { Fail "unsupported Windows architecture: $Architecture. Current release assets support x86_64 Windows." }
}

$Asset = "aeko-cli-$Target.zip"
if ($AssetBaseOverride) {
    $AssetBase = $AssetBaseOverride.TrimEnd('/')
} elseif ($Version -eq 'latest') {
    $AssetBase = "https://github.com/$Repository/releases/latest/download"
} else {
    $AssetBase = "https://github.com/$Repository/releases/download/$Version"
}

$TempDir = Join-Path ([IO.Path]::GetTempPath()) ("aeko-cli-" + [guid]::NewGuid().ToString('N'))
$Archive = Join-Path $TempDir $Asset
$Checksum = "$Archive.sha256"
$ExtractDir = Join-Path $TempDir 'extracted'
$AekoStaged = $null
$KeygenStaged = $null

function Install-StagedFile([string]$Source, [string]$Destination) {
    for ($Attempt = 1; $Attempt -le 5; $Attempt++) {
        try {
            Copy-Item -LiteralPath $Source -Destination $Destination -Force
            return
        } catch {
            if ($Attempt -eq 5) { throw }
            Start-Sleep -Seconds 1
        }
    }
}

try {
    New-Item -ItemType Directory -Force -Path $TempDir | Out-Null
    Write-Host "aeko-install: downloading $Asset ($Version)"
    Invoke-WebRequest -UseBasicParsing -Uri "$AssetBase/$Asset" -OutFile $Archive
    Invoke-WebRequest -UseBasicParsing -Uri "$AssetBase/$Asset.sha256" -OutFile $Checksum

    $ChecksumText = (Get-Content -LiteralPath $Checksum -Raw).Trim()
    if (-not $ChecksumText) { Fail 'checksum file is empty' }
    $Expected = ($ChecksumText -split '\s+')[0].ToLowerInvariant()
    $Actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $Archive).Hash.ToLowerInvariant()
    if ($Actual -ne $Expected) { Fail "SHA-256 mismatch for $Asset" }

    Expand-Archive -LiteralPath $Archive -DestinationPath $ExtractDir -Force
    $AekoSource = Join-Path $ExtractDir 'aeko.exe'
    $KeygenSource = Join-Path $ExtractDir 'aeko-keygen.exe'
    if (-not (Test-Path -LiteralPath $AekoSource)) { Fail 'release archive does not contain aeko.exe' }
    if (-not (Test-Path -LiteralPath $KeygenSource)) { Fail 'release archive does not contain aeko-keygen.exe' }

    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
    $StageId = [guid]::NewGuid().ToString('N')
    $AekoStaged = Join-Path $InstallDir ".aeko.exe.update.$StageId"
    $KeygenStaged = Join-Path $InstallDir ".aeko-keygen.exe.update.$StageId"
    Copy-Item -LiteralPath $AekoSource -Destination $AekoStaged -Force
    Copy-Item -LiteralPath $KeygenSource -Destination $KeygenStaged -Force

    if ($env:AEKO_WAIT_FOR_PID) {
        $WaitForPid = 0
        if (-not [int]::TryParse($env:AEKO_WAIT_FOR_PID, [ref]$WaitForPid) -or $WaitForPid -le 0) {
            Fail "AEKO_WAIT_FOR_PID must be a positive process id, got: $($env:AEKO_WAIT_FOR_PID)"
        }
        if ($WaitForPid -ne $PID) {
            Write-Host "aeko-install: waiting for AEKO CLI process $WaitForPid to exit before replacing binaries"
            Wait-Process -Id $WaitForPid -ErrorAction SilentlyContinue
        }
    }

    Install-StagedFile $KeygenStaged (Join-Path $InstallDir 'aeko-keygen.exe')
    Install-StagedFile $AekoStaged (Join-Path $InstallDir 'aeko.exe')

    & (Join-Path $InstallDir 'aeko.exe') --version | Out-Null
    if ($LASTEXITCODE -ne 0) { Fail 'installed aeko.exe cannot run on this platform' }
    & (Join-Path $InstallDir 'aeko-keygen.exe') --version | Out-Null
    if ($LASTEXITCODE -ne 0) { Fail 'installed aeko-keygen.exe cannot run on this platform' }

    $PathPersisted = $true
    try {
        $UserPath = [Environment]::GetEnvironmentVariable('Path', 'User')
        $PathParts = @($UserPath -split ';' | Where-Object { $_ })
        if ($PathParts -notcontains $InstallDir) {
            $NewUserPath = if ($UserPath) { "$UserPath;$InstallDir" } else { $InstallDir }
            [Environment]::SetEnvironmentVariable('Path', $NewUserPath, 'User')
        }
    } catch {
        $PathPersisted = $false
        Write-Warning "aeko-install: binaries installed, but the user PATH could not be updated: $($_.Exception.Message)"
    }
    if (($env:Path -split ';') -notcontains $InstallDir) {
        $env:Path = "$env:Path;$InstallDir"
    }

    Write-Host "aeko-install: installed aeko and aeko-keygen into $InstallDir"
    if ($PathPersisted) {
        Write-Host 'aeko-install: open a new terminal, then run: aeko --version; aeko-keygen --version'
    } else {
        Write-Host "aeko-install: add $InstallDir to your user PATH, then open a new terminal."
    }
}
finally {
    foreach ($Staged in @($AekoStaged, $KeygenStaged)) {
        if ($Staged -and (Test-Path -LiteralPath $Staged)) {
            Remove-Item -LiteralPath $Staged -Force -ErrorAction SilentlyContinue
        }
    }
    if (Test-Path -LiteralPath $TempDir) {
        Remove-Item -LiteralPath $TempDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}
