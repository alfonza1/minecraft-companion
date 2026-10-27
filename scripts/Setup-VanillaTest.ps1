param([switch]$AcceptMinecraftEula)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$cache = Join-Path $env:LOCALAPPDATA 'MinecraftCompanion/test-runtime'
$cache = [System.IO.Path]::GetFullPath($cache)
function Test-CachePath([string]$candidate) {
    return $candidate -and [System.IO.Path]::GetFullPath($candidate).StartsWith($cache + [System.IO.Path]::DirectorySeparatorChar,[System.StringComparison]::OrdinalIgnoreCase)
}
New-Item -ItemType Directory -Path $cache -Force | Out-Null
$acceptance = Join-Path $cache 'eula-accepted.json'
if ($AcceptMinecraftEula) {
    @{ accepted = $true; at = [DateTime]::UtcNow.ToString('o'); url = 'https://aka.ms/MinecraftEULA'; scope = 'Local isolated vanilla integration test server' } | ConvertTo-Json | Set-Content -LiteralPath $acceptance -Encoding UTF8
}
if (-not (Test-Path -LiteralPath $acceptance)) { throw 'Minecraft EULA acceptance is required. Read https://aka.ms/MinecraftEULA and run with -AcceptMinecraftEula only after accepting.' }
if (-not ((Get-Content -Raw -LiteralPath $acceptance | ConvertFrom-Json).accepted)) { throw 'No valid local server EULA acceptance receipt.' }
$manifestFile = Join-Path $cache 'runtime.json'
if (Test-Path -LiteralPath $manifestFile) {
    $existing = Get-Content -Raw -LiteralPath $manifestFile | ConvertFrom-Json
    if ((Test-CachePath $existing.java) -and (Test-CachePath $existing.serverJar) -and (Test-Path -LiteralPath $existing.java) -and (Test-Path -LiteralPath $existing.serverJar) -and $existing.javaExecutableSha256 -and ((Get-FileHash -LiteralPath $existing.java -Algorithm SHA256).Hash.ToLowerInvariant() -eq $existing.javaExecutableSha256.ToLowerInvariant()) -and ((Get-FileHash -LiteralPath $existing.serverJar -Algorithm SHA1).Hash.ToLowerInvariant() -eq 'e6ec2f64e6080b9b5d9b471b291c33cc7f509733')) { Write-Output "Vanilla test runtime ready: $manifestFile"; exit 0 }
}
Write-Output 'Downloading official Minecraft 1.21.5 server and private Temurin Java 21 runtime.'
$metadata = Invoke-RestMethod -Uri 'https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&image_type=jre&os=windows&vendor=eclipse'
$asset = @($metadata)[0]
$archive = Join-Path $cache $asset.binary.package.name
if (-not (Test-Path -LiteralPath $archive)) { Invoke-WebRequest -UseBasicParsing -Uri $asset.binary.package.link -OutFile $archive }
if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $asset.binary.package.checksum.ToLowerInvariant()) { throw 'Temurin archive SHA256 does not match official Adoptium metadata.' }
$javaRoot = Join-Path $cache 'temurin21'
New-Item -ItemType Directory -Path $javaRoot -Force | Out-Null
Expand-Archive -LiteralPath $archive -DestinationPath $javaRoot -Force
$java = @(Get-ChildItem -LiteralPath $javaRoot -Recurse -File -Filter java.exe | Where-Object { $_.Directory.Name -eq 'bin' })[0].FullName
if (-not $java) { throw 'Java executable missing from verified runtime archive.' }
$jar = Join-Path $cache 'minecraft-server-1.21.5.jar'
if (-not (Test-Path -LiteralPath $jar)) { Invoke-WebRequest -UseBasicParsing -Uri 'https://piston-data.mojang.com/v1/objects/e6ec2f64e6080b9b5d9b471b291c33cc7f509733/server.jar' -OutFile $jar }
if ((Get-FileHash -LiteralPath $jar -Algorithm SHA1).Hash.ToLowerInvariant() -ne 'e6ec2f64e6080b9b5d9b471b291c33cc7f509733') { throw 'Official Minecraft server SHA1 verification failed.' }
@{ java = $java; serverJar = $jar; minecraftVersion = '1.21.5'; minecraftServerSha1 = 'e6ec2f64e6080b9b5d9b471b291c33cc7f509733'; javaVersion = $asset.version.semver; javaExecutableSha256 = (Get-FileHash -LiteralPath $java -Algorithm SHA256).Hash.ToLowerInvariant(); javaArchiveSha256 = $asset.binary.package.checksum; javaSource = $asset.binary.package.link; eulaReceipt = $acceptance } | ConvertTo-Json | Set-Content -LiteralPath $manifestFile -Encoding UTF8
& $java -version
Write-Output "Vanilla test runtime ready: $manifestFile"
