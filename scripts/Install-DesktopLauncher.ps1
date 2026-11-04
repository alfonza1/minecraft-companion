[CmdletBinding()]
param([switch]$DesktopShortcut)
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$directory = Join-Path $env:LOCALAPPDATA 'MinecraftCompanion/launcher'
New-Item -ItemType Directory -Path $directory -Force | Out-Null
[System.IO.File]::WriteAllText((Join-Path $directory 'project-path.txt'), $projectRoot)
$iconPath = Join-Path $directory 'player-two.ico'
& (Join-Path $PSScriptRoot 'Build-DesktopIcon.ps1') -OutputPath $iconPath
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) { throw 'The Windows .NET Framework C# compiler is unavailable.' }
$executable = Join-Path $directory 'Player Two.exe'
& $compiler /nologo /target:winexe "/out:$executable" "/win32icon:$iconPath" /reference:System.Windows.Forms.dll (Join-Path $PSScriptRoot 'desktop/Launcher.cs')
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
$shortcut.IconLocation = $iconPath
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
$pinnedDirectory = Join-Path $env:APPDATA 'Microsoft/Internet Explorer/Quick Launch/User Pinned/TaskBar'
$updatedShortcuts = @($shortcutPath) + @($locations | ForEach-Object { Join-Path $_ 'Player Two.lnk' })
foreach ($name in @('Minecraft Companion.lnk', 'Player Two.lnk')) {
    $pinnedPath = Join-Path $pinnedDirectory $name
    if (-not (Test-Path -LiteralPath $pinnedPath)) { continue }
    $pin = $shell.CreateShortcut($pinnedPath)
    $isOurPin = $pin.TargetPath -in @($legacyExecutable, $executable)
    [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($pin) | Out-Null
    if ($isOurPin) {
        Copy-Item -LiteralPath $shortcutPath -Destination $pinnedPath -Force
        $updatedShortcuts += $pinnedPath
    }
}
if (-not ('PlayerTwoShellIcons' -as [type])) {
    Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class PlayerTwoShellIcons {
    [DllImport("shell32.dll", CharSet=CharSet.Unicode)]
    public static extern void SHChangeNotify(uint change, uint flags, string first, IntPtr second);
}
"@
}
foreach ($path in $updatedShortcuts) { [PlayerTwoShellIcons]::SHChangeNotify(0x2000, 0x1005, $path, [IntPtr]::Zero) }
Write-Output "Installed launcher: $executable"
Write-Output "Start menu shortcut: $(Join-Path $programs 'Player Two.lnk')"
