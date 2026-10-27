param([Parameter(Mandatory=$true)][string]$TextFile,[Parameter(Mandatory=$true)][string]$OutputFile,[double]$Speed=1)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
    $speaker.Rate = [Math]::Max(-10,[Math]::Min(10,[int](($Speed - 1) * 5)))
    $speaker.SetOutputToWaveFile($OutputFile)
    $speaker.Speak([System.IO.File]::ReadAllText($TextFile))
} finally { $speaker.Dispose() }
