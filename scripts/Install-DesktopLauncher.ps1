[CmdletBinding()]
param([switch]$DesktopShortcut)
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$directory = Join-Path $env:LOCALAPPDATA 'MinecraftCompanion/launcher'
New-Item -ItemType Directory -Path $directory -Force | Out-Null
[System.IO.File]::WriteAllText((Join-Path $directory 'project-path.txt'), $projectRoot)
Add-Type -AssemblyName System.Drawing
$bitmap = New-Object System.Drawing.Bitmap(64, 64)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.Clear([System.Drawing.Color]::FromArgb(8, 11, 16))
$brushes = @('#EDF2F8', '#79B8FF', '#080B10') | ForEach-Object { New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml($_)) }
try {
    $graphics.FillPolygon($brushes[0], [System.Drawing.Point[]]@([System.Drawing.Point]::new(4,10), [System.Drawing.Point]::new(26,10), [System.Drawing.Point]::new(32,16), [System.Drawing.Point]::new(32,34), [System.Drawing.Point]::new(26,40), [System.Drawing.Point]::new(12,40), [System.Drawing.Point]::new(12,54), [System.Drawing.Point]::new(4,54)))
    $graphics.FillRectangle($brushes[2], 12, 18, 12, 14)
    $graphics.FillPolygon($brushes[1], [System.Drawing.Point[]]@([System.Drawing.Point]::new(38,10), [System.Drawing.Point]::new(54,10), [System.Drawing.Point]::new(60,16), [System.Drawing.Point]::new(60,32), [System.Drawing.Point]::new(46,46), [System.Drawing.Point]::new(60,46), [System.Drawing.Point]::new(60,54), [System.Drawing.Point]::new(36,54), [System.Drawing.Point]::new(36,42), [System.Drawing.Point]::new(52,26), [System.Drawing.Point]::new(52,18), [System.Drawing.Point]::new(38,18)))
    $icon = [System.Drawing.Icon]::FromHandle($bitmap.GetHicon())
    $stream = [System.IO.File]::Create((Join-Path $directory 'companion.ico'))
    try { $icon.Save($stream) } finally { $stream.Dispose(); $icon.Dispose() }
} finally { $graphics.Dispose(); $bitmap.Dispose(); foreach ($brush in $brushes) { $brush.Dispose() } }
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) { throw 'The Windows .NET Framework C# compiler is unavailable.' }
$executable = Join-Path $directory 'Player Two.exe'
& $compiler /nologo /target:winexe "/out:$executable" "/win32icon:$(Join-Path $directory 'companion.ico')" /reference:System.Windows.Forms.dll (Join-Path $PSScriptRoot 'desktop/Launcher.cs')
if ($LASTEXITCODE -ne 0) { throw 'Desktop launcher compilation failed.' }
# Keep previously pinned launch targets working across the product rename.
$legacyExecutable = Join-Path $directory 'Minecraft Companion.exe'
if (Test-Path -LiteralPath $legacyExecutable) { Copy-Item -LiteralPath $executable -Destination $legacyExecutable -Force }
$nativeExecutable = & (Join-Path $PSScriptRoot 'Build-Desktop.ps1')
$shell = New-Object -ComObject WScript.Shell
$programs = [Environment]::GetFolderPath('Programs')
$locations = @($programs)
if ($DesktopShortcut) { $locations += [Environment]::GetFolderPath('Desktop') }
# Register before copying: the Windows property store cannot replace a shortcut
# inside some EFS-encrypted Start-menu folders. Folder encryption stays intact.
$shortcutPath = Join-Path $directory 'Player Two.lnk'
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $executable
$shortcut.WorkingDirectory = $projectRoot
$shortcut.IconLocation = Join-Path $directory 'companion.ico'
$shortcut.Description = 'Player Two: open the local working copy and its localhost workspace'
$shortcut.Save()
[System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($shortcut) | Out-Null
$shortcut = $null
$registration = Start-Process -FilePath $nativeExecutable -ArgumentList @('--register-shortcut', ('"' + $shortcutPath + '"')) -WindowStyle Hidden -PassThru -Wait
if ($registration.ExitCode -ne 0) { throw 'Could not register the desktop application identity.' }
foreach ($location in $locations) {
    Copy-Item -LiteralPath $shortcutPath -Destination (Join-Path $location 'Player Two.lnk') -Force
    $oldPath = Join-Path $location 'Minecraft Companion.lnk'
    if (Test-Path -LiteralPath $oldPath) {
        $oldShortcut = $shell.CreateShortcut($oldPath)
        $isOurShortcut = $oldShortcut.TargetPath -eq $legacyExecutable
        [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($oldShortcut) | Out-Null
        if ($isOurShortcut) { Remove-Item -LiteralPath $oldPath }
    }
}
# Preserve the registered pin's filename and AppID while updating its target,
# icon and relaunch display name. Do not edit Windows' taskbar registry.
$pinnedPath = Join-Path $env:APPDATA 'Microsoft/Internet Explorer/Quick Launch/User Pinned/TaskBar/Minecraft Companion.lnk'
if (Test-Path -LiteralPath $pinnedPath) {
    $pin = $shell.CreateShortcut($pinnedPath)
    $isOurPin = $pin.TargetPath -in @($legacyExecutable, $executable)
    [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($pin) | Out-Null
    if ($isOurPin) { Copy-Item -LiteralPath $shortcutPath -Destination $pinnedPath -Force }
}
Write-Output "Installed launcher: $executable"
Write-Output "Start menu shortcut: $(Join-Path $programs 'Player Two.lnk')"
