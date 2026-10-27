[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $projectRoot
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules')) -or -not (Test-Path -LiteralPath (Join-Path $projectRoot 'apps/dashboard/dist/index.html'))) {
    & (Join-Path $PSScriptRoot 'Bootstrap.ps1')
}
try {
    $status = Invoke-RestMethod -Uri 'http://127.0.0.1:4365/api/health' -TimeoutSec 2
    if ($status.name -eq 'Minecraft Companion') {
        Write-Host 'Minecraft Companion is already running: http://127.0.0.1:4365'
        exit 0
    }
} catch { }
Write-Host 'Minecraft Companion: http://127.0.0.1:4365'
Write-Host 'Keep this window open. Press Ctrl+C to shut down the local service.'
& node (Join-Path $projectRoot 'services/api/index.js')
exit $LASTEXITCODE
