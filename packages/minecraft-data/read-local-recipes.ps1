param([Parameter(Mandatory = $true)][ValidatePattern('^\d+\.\d+(\.\d+)?$')][string]$Version, [Parameter(Mandatory = $true)][string]$MinecraftDirectory)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$jarPath = Join-Path $MinecraftDirectory "versions/$Version/$Version.jar"
if (-not (Test-Path -LiteralPath $jarPath -PathType Leaf)) { throw 'No installed client jar for this exact version.' }
$archive = [IO.Compression.ZipFile]::OpenRead($jarPath)
$recipes = [Collections.Generic.List[object]]::new()
$tags = @{}
$totalBytes = 0
try {
  foreach ($entry in $archive.Entries) {
    $isRecipe = $entry.FullName -match '^data/minecraft/recipes?/[a-z0-9_]+\.json$'
    $isTag = $entry.FullName -match '^data/minecraft/tags/items?/[a-z0-9_/]+\.json$'
    if (-not ($isRecipe -or $isTag)) { continue }
    if ($entry.Length -gt 1048576) { throw 'An installed recipe or tag exceeds its size bound.' }
    $totalBytes += $entry.Length
    if ($totalBytes -gt 16777216) { throw 'Installed recipe data exceeds its size bound.' }
    $reader = [IO.StreamReader]::new($entry.Open())
    try { $json = $reader.ReadToEnd() } finally { $reader.Dispose() }
    # Windows PowerShell's parser treats shaped-recipe keys I/i as duplicates.
    # Only production recipes are relevant here; leave other recipes untouched.
    if ($isRecipe -and $json -notmatch '"type"\s*:\s*"minecraft:(smelting|stonecutting)"') { continue }
    $value = $json | ConvertFrom-Json
    if ($isRecipe -and $value.type -in @('minecraft:smelting', 'minecraft:stonecutting')) {
      $recipes.Add(@{ id = [IO.Path]::GetFileNameWithoutExtension($entry.FullName); type = $value.type; ingredient = $value.ingredient; result = $value.result; cookingtime = $value.cookingtime })
    } elseif ($isTag) {
      $tagName = ($entry.FullName -replace '^data/minecraft/tags/items?/', '' -replace '\.json$', '')
      $tags[$tagName] = $value.values
    }
  }
} finally { $archive.Dispose() }
@{ version = $Version; source = @{ kind = 'installed-vanilla-client'; filename = "$Version.jar"; sha256 = (Get-FileHash -LiteralPath $jarPath -Algorithm SHA256).Hash.ToLowerInvariant() }; recipes = $recipes.ToArray(); tags = $tags } | ConvertTo-Json -Depth 30 -Compress
