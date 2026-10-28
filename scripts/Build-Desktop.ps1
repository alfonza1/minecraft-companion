[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$source = Join-Path $projectRoot 'apps/desktop'
$cache = Join-Path $env:LOCALAPPDATA 'MinecraftCompanion/launcher'
$dotnet = Get-Command dotnet -ErrorAction SilentlyContinue
if (-not $dotnet -or -not ((& $dotnet.Source --list-sdks) -match '^10\.')) { throw 'The desktop window requires the .NET 10 SDK. Run Bootstrap.ps1 -DesktopShortcut to install it.' }
$env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'
$env:DOTNET_NOLOGO = '1'
$files = @('MinecraftCompanion.Desktop.csproj', 'packages.lock.json', 'Program.cs', 'DesktopIdentity.cs') | ForEach-Object { Join-Path $source $_ }
$files += $PSCommandPath
$hash = [System.Security.Cryptography.SHA256]::Create()
$bytes = New-Object System.IO.MemoryStream
try {
    foreach ($filename in $files) { $content = [System.IO.File]::ReadAllBytes($filename); $bytes.Write($content, 0, $content.Length) }
    $revision = [BitConverter]::ToString($hash.ComputeHash($bytes.ToArray())).Replace('-', '').ToLowerInvariant()
} finally { $hash.Dispose(); $bytes.Dispose() }
$directory = Join-Path $cache "desktop/$revision"
$executable = Join-Path $directory 'MinecraftCompanion.Desktop.exe'
$receipt = Join-Path $directory 'desktop-ready.txt'
if (-not (Test-Path -LiteralPath $executable) -or -not (Test-Path -LiteralPath $receipt) -or (Get-Content -LiteralPath $receipt -Raw).Trim() -ne $revision) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    $icon = Join-Path $cache 'companion.ico'
    $arguments = 'publish "' + (Join-Path $source 'MinecraftCompanion.Desktop.csproj') + '" --configuration Release --no-self-contained --disable-build-servers --output "' + $directory + '" -p:RestoreLockedMode=true -p:UseSharedCompilation=false "-p:CompanionIcon=' + $icon + '"'
    $build = Start-Process -FilePath $dotnet.Source -ArgumentList $arguments -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $cache 'desktop-build.log') -RedirectStandardError (Join-Path $cache 'desktop-build-error.log')
    $processHandle = $build.Handle
    $build.WaitForExit()
    if ($build.ExitCode -ne 0) { throw "Desktop window build failed. See $cache/desktop-build.log" }
    foreach ($required in @('MinecraftCompanion.Desktop.exe', 'MinecraftCompanion.Desktop.dll', 'MinecraftCompanion.Desktop.runtimeconfig.json', 'Microsoft.Web.WebView2.Core.dll', 'Microsoft.Web.WebView2.WinForms.dll')) {
        if (-not (Test-Path -LiteralPath (Join-Path $directory $required))) { throw 'The desktop build is incomplete. Run Install-DesktopLauncher.ps1 again.' }
    }
    [System.IO.File]::WriteAllText($receipt, $revision)
}
Write-Output $executable
