[CmdletBinding()]
param([string]$JavaHome)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$proxyVersion = '3.4.14'
$proxySha256 = '2894bbfb2f4342f8fde887af6c689313efd5b0e46a8006775eea0e21e2948ab5'
$proxyUrl = "https://github.com/ViaVersion/ViaProxy/releases/download/v$proxyVersion/ViaProxy-$proxyVersion.jar"
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$sourceRoot = Join-Path $projectRoot 'services/protocol-bridge/java'
$sourceFiles = @(
    (Join-Path $sourceRoot 'companion/bridge/BridgeConfiguration.java'),
    (Join-Path $sourceRoot 'companion/bridge/CompanionBridgeMain.java'),
    (Join-Path $sourceRoot 'companion/bridge/CompanionBridgePlugin.java'),
    (Join-Path $sourceRoot 'viaproxy.yml')
)
$cache = [System.IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'MinecraftCompanion/protocol-bridge'))
New-Item -ItemType Directory -Force -Path $cache | Out-Null

function Get-Sha256([string]$Path) {
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Get-SourcesHash {
    $stream = New-Object System.IO.MemoryStream
    $algorithm = [System.Security.Cryptography.SHA256]::Create()
    try {
        foreach ($source in $sourceFiles) {
            $bytes = [System.IO.File]::ReadAllBytes($source)
            $stream.Write($bytes, 0, $bytes.Length)
        }
        return ([System.BitConverter]::ToString($algorithm.ComputeHash($stream.ToArray()))).Replace('-', '').ToLowerInvariant()
    } finally {
        $algorithm.Dispose()
        $stream.Dispose()
    }
}

function Test-CacheChild([string]$Path) {
    return [System.IO.Path]::GetFullPath($Path).StartsWith($cache + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)
}

function Get-Jdk([string[]]$Candidates) {
    foreach ($candidate in $Candidates) {
        if (-not $candidate) { continue }
        $compiler = Join-Path $candidate 'bin/javac.exe'
        $java = Join-Path $candidate 'bin/java.exe'
        $jarTool = Join-Path $candidate 'bin/jar.exe'
        if (-not ((Test-Path -LiteralPath $compiler) -and (Test-Path -LiteralPath $java) -and (Test-Path -LiteralPath $jarTool))) { continue }
        $versionOutput = & $compiler -version 2>&1
        if ($LASTEXITCODE -ne 0 -or "$versionOutput" -notmatch 'javac\s+(\d+)') { continue }
        if ([int]$Matches[1] -ge 17) {
            return @{ java = [System.IO.Path]::GetFullPath($java); compiler = $compiler; jarTool = $jarTool; version = "$versionOutput".Trim() }
        }
    }
    return $null
}

$candidates = @($JavaHome, $env:JAVA_HOME)
$installedCompiler = Get-Command javac.exe -ErrorAction SilentlyContinue
if ($installedCompiler) { $candidates += Split-Path -Parent (Split-Path -Parent $installedCompiler.Source) }
$privateJdk = Join-Path $cache 'temurin21'
if (Test-Path -LiteralPath $privateJdk) {
    $candidates += @(Get-ChildItem -LiteralPath $privateJdk -Directory | Select-Object -ExpandProperty FullName)
}
$jdk = Get-Jdk $candidates
if (-not $jdk) {
    Write-Output 'No Java 17+ development kit was found. Installing a private Temurin 21 JDK in the Companion cache.'
    $assets = Invoke-RestMethod -Uri 'https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&image_type=jdk&os=windows&vendor=eclipse'
    $asset = @($assets)[0]
    $package = $asset.binary.package
    if (-not $package.name.EndsWith('.zip') -or $package.checksum -notmatch '^[a-fA-F0-9]{64}$' -or ([System.Uri]$package.link).Scheme -ne 'https') { throw 'Invalid private Java download metadata.' }
    $archive = Join-Path $cache ([System.IO.Path]::GetFileName($package.name))
    if (-not (Test-Path -LiteralPath $archive)) { Invoke-WebRequest -UseBasicParsing -Uri $package.link -OutFile $archive }
    if ((Get-Sha256 $archive) -ne $package.checksum.ToLowerInvariant()) { throw 'Private Java archive SHA256 verification failed.' }
    New-Item -ItemType Directory -Force -Path $privateJdk | Out-Null
    Expand-Archive -LiteralPath $archive -DestinationPath $privateJdk -Force
    $jdk = Get-Jdk @(Get-ChildItem -LiteralPath $privateJdk -Directory | Select-Object -ExpandProperty FullName)
    if (-not $jdk) { throw 'Verified private Java archive did not provide a compatible JDK.' }
    @{ source = $package.link; sha256 = $package.checksum; version = $asset.version.semver } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $cache 'java-source.json') -Encoding UTF8
}

$proxyJar = Join-Path $cache "ViaProxy-$proxyVersion.jar"
if (-not (Test-Path -LiteralPath $proxyJar) -or (Get-Sha256 $proxyJar) -ne $proxySha256) {
    Write-Output "Downloading pinned ViaProxy $proxyVersion."
    $download = Join-Path $cache ('download-' + [guid]::NewGuid().ToString('N') + '.jar')
    try {
        Invoke-WebRequest -UseBasicParsing -Uri $proxyUrl -OutFile $download
        if ((Get-Sha256 $download) -ne $proxySha256) { throw 'ViaProxy SHA256 verification failed.' }
        Move-Item -LiteralPath $download -Destination $proxyJar -Force
    } finally {
        if ((Test-CacheChild $download) -and (Test-Path -LiteralPath $download)) { Remove-Item -LiteralPath $download -Force }
    }
}

$sourcesHash = Get-SourcesHash
$classpathJar = Join-Path $cache "CompanionBridgeMain-$sourcesHash.jar"
$pluginJar = Join-Path $cache "CompanionAuthPlugin-$sourcesHash.jar"
$buildDirectory = Join-Path $cache ('build-' + [guid]::NewGuid().ToString('N'))
$manifestFile = Join-Path $cache 'runtime.json'
$manifestTemporary = Join-Path $cache ('runtime-' + [guid]::NewGuid().ToString('N') + '.json')
try {
    New-Item -ItemType Directory -Force -Path $buildDirectory | Out-Null
    $classes = Join-Path $buildDirectory 'classes'
    New-Item -ItemType Directory -Force -Path $classes | Out-Null
    $javaSources = @($sourceFiles | Where-Object { $_.EndsWith('.java') })
    Write-Output "Compiling protocol bridge with $($jdk.version)."
    & $jdk.compiler --release 17 -encoding UTF-8 -cp $proxyJar -d $classes @javaSources
    if ($LASTEXITCODE -ne 0) { throw 'Protocol bridge Java compilation failed.' }
    $wrapperBuild = Join-Path $buildDirectory 'CompanionBridgeMain.jar'
    $pluginBuild = Join-Path $buildDirectory 'CompanionAuthPlugin.jar'
    & $jdk.jarTool --create --file $wrapperBuild -C $classes .
    if ($LASTEXITCODE -ne 0) { throw 'Protocol bridge wrapper packaging failed.' }
    & $jdk.jarTool --create --file $pluginBuild -C $classes 'companion/bridge/CompanionBridgePlugin.class' -C $sourceRoot 'viaproxy.yml'
    if ($LASTEXITCODE -ne 0) { throw 'Protocol bridge plugin packaging failed.' }
    if ((Get-SourcesHash) -ne $sourcesHash) { throw 'Protocol bridge sources changed during setup. Rerun setup.' }
    Move-Item -LiteralPath $wrapperBuild -Destination $classpathJar -Force
    Move-Item -LiteralPath $pluginBuild -Destination $pluginJar -Force
    @{
        proxyVersion = $proxyVersion
        proxyJar = $proxyJar
        proxySha256 = $proxySha256
        proxySource = $proxyUrl
        classpathJar = $classpathJar
        classpathSha256 = Get-Sha256 $classpathJar
        pluginJar = $pluginJar
        pluginSha256 = Get-Sha256 $pluginJar
        java = $jdk.java
        javaSha256 = Get-Sha256 $jdk.java
        javaVersion = $jdk.version
        sourcesHash = $sourcesHash
        installedAt = [DateTime]::UtcNow.ToString('o')
    } | ConvertTo-Json | Set-Content -LiteralPath $manifestTemporary -Encoding UTF8
    Move-Item -LiteralPath $manifestTemporary -Destination $manifestFile -Force
    Write-Output "Protocol bridge installed: $manifestFile"
    Write-Output 'Realm login and actual gameplay compatibility are verified separately.'
} finally {
    if ((Test-CacheChild $buildDirectory) -and (Test-Path -LiteralPath $buildDirectory)) { Remove-Item -LiteralPath $buildDirectory -Recurse -Force }
    if ((Test-CacheChild $manifestTemporary) -and (Test-Path -LiteralPath $manifestTemporary)) { Remove-Item -LiteralPath $manifestTemporary -Force }
}
