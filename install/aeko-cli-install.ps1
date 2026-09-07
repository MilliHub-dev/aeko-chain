$ErrorActionPreference = 'Stop'

$Repository = if ($env:AEKO_GITHUB_REPOSITORY) { $env:AEKO_GITHUB_REPOSITORY } else { 'MilliHub-dev/aeko-chain' }
$Version = if ($env:AEKO_VERSION) { $env:AEKO_VERSION } else { 'latest' }
$InstallDir = if ($env:AEKO_INSTALL_DIR) { $env:AEKO_INSTALL_DIR } else { Join-Path $env:LOCALAPPDATA 'Aeko\bin' }
$AssetBaseOverride = $env:AEKO_CLI_ASSET_BASE_URL

function Fail([string]$Message) {
    throw "aeko-install: $Message"
}

if (-not [Environment]::Is64BitOperatingSystem) {
    Fail '32-bit Windows is not supported.'
}

$Architecture = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()
if ($Architecture -ne 'X64') {
    Fail "unsupported Windows architecture: $Architecture. Current release assets support x86_64 Windows."
}

$Target = 'x86_64-pc-windows-msvc'
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

try {
    New-Item -ItemType Directory -Force -Path $TempDir | Out-Null
    Write-Host "aeko-install: downloading $Asset ($Version)"
    Invoke-WebRequest -UseBasicParsing -Uri "$AssetBase/$Asset" -OutFile $Archive
    Invoke-WebRequest -UseBasicParsing -Uri "$AssetBase/$Asset.sha256" -OutFile $Checksum

    $Expected = ((Get-Content -LiteralPath $Checksum -Raw).Trim() -split '\s+')[0].ToLowerInvariant()
    if (-not $Expected) { Fail 'checksum file is empty' }
    $Actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $Archive).Hash.ToLowerInvariant()
    if ($Actual -ne $Expected) { Fail "SHA-256 mismatch for $Asset" }

    Expand-Archive -LiteralPath $Archive -DestinationPath $ExtractDir -Force
    $AekoSource = Join-Path $ExtractDir 'aeko.exe'
    $KeygenSource = Join-Path $ExtractDir 'aeko-keygen.exe'
    if (-not (Test-Path -LiteralPath $AekoSource)) { Fail 'release archive does not contain aeko.exe' }
    if (-not (Test-Path -LiteralPath $KeygenSource)) { Fail 'release archive does not contain aeko-keygen.exe' }

    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
    Copy-Item -LiteralPath $AekoSource -Destination (Join-Path $InstallDir 'aeko.exe') -Force
    Copy-Item -LiteralPath $KeygenSource -Destination (Join-Path $InstallDir 'aeko-keygen.exe') -Force

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
    if (Test-Path -LiteralPath $TempDir) {
        Remove-Item -LiteralPath $TempDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}
