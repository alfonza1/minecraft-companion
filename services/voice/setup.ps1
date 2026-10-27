$ErrorActionPreference = 'Stop'
$voiceRoot = Join-Path $env:LOCALAPPDATA 'MinecraftCompanion'
$voicePython = Join-Path $voiceRoot 'voice-venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $voicePython)) {
    py -3.12 -m venv (Join-Path $voiceRoot 'voice-venv')
    if ($LASTEXITCODE -ne 0) { throw 'Python 3.12 is required. Install it with winget install Python.Python.3.12, then run setup again.' }
}
& $voicePython -m pip install -r (Join-Path $PSScriptRoot 'requirements-lock.txt')
if ($LASTEXITCODE -ne 0) { throw 'Local speech dependency installation failed.' }
& $voicePython (Join-Path $PSScriptRoot 'worker.py') prepare
if ($LASTEXITCODE -ne 0) { throw 'Free MIT-licensed tiny.en speech model download failed. Check network access and retry.' }
