[CmdletBinding()]
param([switch]$SkipVoice, [switch]$SkipBridge, [switch]$DesktopShortcut)
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $projectRoot
function Confirm-Command([string]$Name, [string]$PackageId) {
    if (Get-Command $Name -ErrorAction SilentlyContinue) { return }
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) { throw "$Name is missing and Windows Package Manager is unavailable." }
    & winget install --id $PackageId --exact --silent --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) { throw "Could not install $PackageId. See the installer output." }
    $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
}
Confirm-Command 'node' 'OpenJS.NodeJS.LTS'
Confirm-Command 'git' 'Git.Git'
$nodeVersionParts = (& node --version).TrimStart('v').Split('.')
if ([int]$nodeVersionParts[0] -lt 22 -or ([int]$nodeVersionParts[0] -eq 22 -and [int]$nodeVersionParts[1] -lt 12)) { throw 'Node 22.12 or newer is required. Install the current Node LTS, then rerun this script.' }
& npm.cmd ci --ignore-scripts
if ($LASTEXITCODE -ne 0) { throw 'Project dependency installation failed.' }
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Dashboard build failed.' }
if (-not $SkipVoice) {
    Confirm-Command 'python' 'Python.Python.3.12'
    & (Join-Path $projectRoot 'services/voice/setup.ps1')
    if ($LASTEXITCODE -ne 0) { throw 'Speech setup failed. Rerun Bootstrap.ps1 to retry.' }
}
if (-not $SkipBridge) {
    & (Join-Path $PSScriptRoot 'Setup-ProtocolBridge.ps1')
}
if ($DesktopShortcut) {
    $desktopPath = [Environment]::GetFolderPath('Desktop')
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut((Join-Path $desktopPath 'Minecraft Companion.lnk'))
    $shortcut.TargetPath = Join-Path $projectRoot 'Start Minecraft Companion.cmd'
    $shortcut.WorkingDirectory = $projectRoot
    $shortcut.Description = 'Launch the local Minecraft Companion dashboard'
    $shortcut.Save()
}
& node (Join-Path $PSScriptRoot 'health.mjs')
Write-Host 'Ready. Launch Start Minecraft Companion.cmd, then open http://127.0.0.1:4365'
