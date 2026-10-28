[CmdletBinding()]
param([switch]$NoOpen, [switch]$CheckOnly, [string]$ResultFile)
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$cache = Join-Path $env:LOCALAPPDATA 'MinecraftCompanion/launcher'
$base = 'http://127.0.0.1:4365'
if ($ResultFile) {
    $ResultFile = [System.IO.Path]::GetFullPath($ResultFile)
    if ([System.IO.Path]::GetDirectoryName($ResultFile) -ne [System.IO.Path]::GetFullPath($cache) -or [System.IO.Path]::GetFileName($ResultFile) -notmatch '^desktop-update-[a-f0-9]{32}\.json$') { throw 'Invalid desktop update receipt path.' }
}
$mutex = New-Object System.Threading.Mutex($false, 'Local\MinecraftCompanionDesktopLauncher')
$locked = $false
function Read-Health {
    try {
        $result = Invoke-RestMethod -Uri "$base/api/health" -TimeoutSec 2
        try {
            $revision = Invoke-RestMethod -Uri "$base/api/desktop/revision" -TimeoutSec 2
            $result | Add-Member -NotePropertyName sourceFingerprint -NotePropertyValue $revision.sourceFingerprint -Force
        } catch { }
        return $result
    } catch { return $null }
}
try {
    try { $locked = $mutex.WaitOne(0) }
    catch [System.Threading.AbandonedMutexException] { $locked = $true }
    if (-not $locked) { exit 0 }
    Set-Location -LiteralPath $projectRoot
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js is missing. Run scripts/Bootstrap.ps1.' }
    $fingerprint = (& node (Join-Path $PSScriptRoot 'desktop-source.mjs')).Trim()
    if ($LASTEXITCODE -ne 0 -or $fingerprint -notmatch '^[a-f0-9]{64}$') { throw 'Could not inspect local application sources.' }
    $health = Read-Health
    if ($health -and $health.name -ne 'Minecraft Companion') { throw 'Port 4365 is occupied by another application.' }
    $requiresRestart = $health -and $health.sourceFingerprint -ne $fingerprint
    if ($CheckOnly) {
        @{ projectRoot = $projectRoot; fingerprint = $fingerprint; running = [bool]$health; requiresRestart = [bool]$requiresRestart } | ConvertTo-Json -Compress
        exit 0
    }
    New-Item -ItemType Directory -Path $cache -Force | Out-Null
    if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules'))) { throw 'Project dependencies are missing. Run scripts/Bootstrap.ps1.' }
    $buildReceipt = Join-Path $cache 'dashboard-source.txt'
    $previous = if (Test-Path -LiteralPath $buildReceipt) { (Get-Content -LiteralPath $buildReceipt -Raw).Trim() } else { '' }
    if ($previous -ne $fingerprint -or -not (Test-Path -LiteralPath (Join-Path $projectRoot 'apps/dashboard/dist/index.html'))) {
        # Windows PowerShell promotes native stderr warnings to terminating
        # errors under Stop. Read the actual process exit code instead.
        $npmCli = Join-Path (Split-Path (Get-Command npm.cmd).Source) 'node_modules/npm/bin/npm-cli.js'
        if (-not (Test-Path -LiteralPath $npmCli)) { throw 'The installed npm CLI could not be located.' }
        $build = Start-Process -FilePath (Get-Command node).Source -ArgumentList @(('"' + $npmCli + '"'), 'run', 'build') -WorkingDirectory $projectRoot -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput (Join-Path $cache 'build.log') -RedirectStandardError (Join-Path $cache 'build-error.log')
        if ($build.ExitCode -ne 0) { throw "Dashboard build failed. See $cache/build-error.log" }
        Set-Content -LiteralPath $buildReceipt -Value $fingerprint -Encoding ASCII
    }
    $updatesPending = $false
    if ($requiresRestart) {
        $state = Invoke-RestMethod -Uri "$base/api/state" -TimeoutSec 3
        if ($state.state -eq 'DISCONNECTED' -and $state.auth.status -ne 'authenticating' -and $state.connection.status -ne 'connecting') {
            Invoke-RestMethod -Uri "$base/api/system/shutdown" -Method Post -ContentType 'application/json' -Body '{}' -TimeoutSec 5 | Out-Null
            for ($attempt = 0; $attempt -lt 30 -and (Read-Health); $attempt++) { Start-Sleep -Milliseconds 200 }
            if (Read-Health) { throw 'The previous companion service is still shutting down. Try the launcher again.' }
            $health = $null
        } else { $updatesPending = $true }
    }
    if (-not $health) {
        $node = (Get-Command node).Source
        $api = Join-Path $projectRoot 'services/api/index.js'
        $server = Start-Process -FilePath $node -ArgumentList @('"' + $api + '"') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $cache 'api.log') -RedirectStandardError (Join-Path $cache 'api-error.log') -PassThru
        for ($attempt = 0; $attempt -lt 60; $attempt++) {
            $health = Read-Health
            if ($health) { break }
            if ($server.HasExited) { throw "The local service stopped. See $cache/api-error.log" }
            Start-Sleep -Milliseconds 250
        }
        if (-not $health) { throw 'The local service did not become ready. Try the launcher again.' }
    }
    if (-not $NoOpen) {
        $launcher = Join-Path $cache 'Minecraft Companion.exe'
        if (-not (Test-Path -LiteralPath $launcher)) { & (Join-Path $PSScriptRoot 'Install-DesktopLauncher.ps1') | Out-Null }
        $nativeExecutable = & (Join-Path $PSScriptRoot 'Build-Desktop.ps1')
        # Reuse the selected account when reopening after a service update.
        # First-time account setup still starts from the Connect button.
        $accountState = Invoke-RestMethod -Uri "$base/api/state" -TimeoutSec 3
        if ($accountState.settings.realmId -and $accountState.auth.status -eq 'disconnected') {
            Invoke-RestMethod -Uri "$base/api/realms/refresh" -Method Post -ContentType 'application/json' -Body '{}' -TimeoutSec 5 | Out-Null
        }
        $nativeArguments = @('--project', ('"' + $projectRoot + '"'), '--launcher', ('"' + $launcher + '"'))
        if ($updatesPending) { $nativeArguments += '--updates-pending' }
        Start-Process -FilePath $nativeExecutable -ArgumentList $nativeArguments | Out-Null
    }
    $result = @{ ready = $true; url = $base; backendUpdatesPending = $updatesPending; sourceFingerprint = $fingerprint } | ConvertTo-Json -Compress
    if ($ResultFile) { [System.IO.File]::WriteAllText($ResultFile, $result) }
    Write-Output $result
} catch {
    if ($NoOpen -or $CheckOnly) { throw }
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Minecraft Companion', 'OK', 'Error') | Out-Null
    exit 1
} finally {
    if ($locked) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
