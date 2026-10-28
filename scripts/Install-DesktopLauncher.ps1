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
$graphics.Clear([System.Drawing.Color]::FromArgb(17, 27, 31))
$brushes = @('#8BD4AC', '#39886A', '#D6BD75') | ForEach-Object { New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml($_)) }
try {
    $graphics.FillPolygon($brushes[0], [System.Drawing.Point[]]@([System.Drawing.Point]::new(32,8), [System.Drawing.Point]::new(55,21), [System.Drawing.Point]::new(32,34), [System.Drawing.Point]::new(9,21)))
    $graphics.FillPolygon($brushes[1], [System.Drawing.Point[]]@([System.Drawing.Point]::new(9,23), [System.Drawing.Point]::new(30,36), [System.Drawing.Point]::new(30,58), [System.Drawing.Point]::new(9,45)))
    $graphics.FillPolygon($brushes[2], [System.Drawing.Point[]]@([System.Drawing.Point]::new(34,36), [System.Drawing.Point]::new(55,23), [System.Drawing.Point]::new(55,45), [System.Drawing.Point]::new(34,58)))
    $icon = [System.Drawing.Icon]::FromHandle($bitmap.GetHicon())
    $stream = [System.IO.File]::Create((Join-Path $directory 'companion.ico'))
    try { $icon.Save($stream) } finally { $stream.Dispose(); $icon.Dispose() }
} finally { $graphics.Dispose(); $bitmap.Dispose(); foreach ($brush in $brushes) { $brush.Dispose() } }
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) { throw 'The Windows .NET Framework C# compiler is unavailable.' }
$executable = Join-Path $directory 'Minecraft Companion.exe'
& $compiler /nologo /target:winexe "/out:$executable" "/win32icon:$(Join-Path $directory 'companion.ico')" /reference:System.Windows.Forms.dll (Join-Path $PSScriptRoot 'desktop/Launcher.cs')
if ($LASTEXITCODE -ne 0) { throw 'Desktop launcher compilation failed.' }
$nativeExecutable = & (Join-Path $PSScriptRoot 'Build-Desktop.ps1')
$shell = New-Object -ComObject WScript.Shell
$programs = [Environment]::GetFolderPath('Programs')
$locations = @($programs)
if ($DesktopShortcut) { $locations += [Environment]::GetFolderPath('Desktop') }
foreach ($location in $locations) {
    $shortcut = $shell.CreateShortcut((Join-Path $location 'Minecraft Companion.lnk'))
    $shortcut.TargetPath = $executable
    $shortcut.WorkingDirectory = $projectRoot
    $shortcut.IconLocation = Join-Path $directory 'companion.ico'
    $shortcut.Description = 'Open the local working copy; rebuild changes and start its localhost service'
    $shortcut.Save()
    $registration = Start-Process -FilePath $nativeExecutable -ArgumentList @('--register-shortcut', ('"' + $shortcut.FullName + '"')) -WindowStyle Hidden -PassThru -Wait
    if ($registration.ExitCode -ne 0) { throw 'Could not register the desktop application identity.' }
}
Write-Output "Installed launcher: $executable"
Write-Output "Start menu shortcut: $(Join-Path $programs 'Minecraft Companion.lnk')"
