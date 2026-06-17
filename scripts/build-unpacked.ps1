$ErrorActionPreference = 'Stop'

$root = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')
$electronDist = Join-Path $root 'node_modules\electron\dist'
$releaseRoot = Join-Path $root 'release'
$outDir = Join-Path $releaseRoot 'Swordmancy Optimizer-win32-x64'
$appDir = Join-Path $outDir 'resources\app'
$appAsar = Join-Path $outDir 'resources\app.asar'

if (-not (Test-Path -LiteralPath (Join-Path $electronDist 'electron.exe'))) {
    throw "Electron runtime was not found. Run npm install first."
}

if (-not (Test-Path -LiteralPath (Join-Path $root 'dist\index.html'))) {
    throw "Vite build output was not found. Run npm run build first."
}

New-Item -ItemType Directory -Force -Path $releaseRoot | Out-Null

if (Test-Path -LiteralPath $outDir) {
    $resolvedOut = Resolve-Path -LiteralPath $outDir
    $resolvedRelease = Resolve-Path -LiteralPath $releaseRoot
    if (-not $resolvedOut.Path.StartsWith($resolvedRelease.Path)) {
        throw "Refusing to remove output outside release directory: $($resolvedOut.Path)"
    }
    Remove-Item -LiteralPath $resolvedOut.Path -Recurse -Force
}

Copy-Item -LiteralPath $electronDist -Destination $outDir -Recurse

$exePath = Join-Path $outDir 'electron.exe'
$appExePath = Join-Path $outDir 'Swordmancy Optimizer.exe'
if (Test-Path -LiteralPath $appExePath) {
    Remove-Item -LiteralPath $appExePath -Force
}
Rename-Item -LiteralPath $exePath -NewName 'Swordmancy Optimizer.exe'

Remove-Item -LiteralPath (Join-Path $outDir 'resources\default_app.asar') -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $appDir | Out-Null

Copy-Item -LiteralPath (Join-Path $root 'dist') -Destination (Join-Path $appDir 'dist') -Recurse
Copy-Item -LiteralPath (Join-Path $root 'electron') -Destination (Join-Path $appDir 'electron') -Recurse
Copy-Item -LiteralPath (Join-Path $root 'package.json') -Destination (Join-Path $appDir 'package.json')

$asarBin = Join-Path $root 'node_modules\.bin\asar.cmd'
if (Test-Path -LiteralPath $asarBin) {
    & $asarBin pack $appDir $appAsar
    Remove-Item -LiteralPath $appDir -Recurse -Force
}

Write-Host "Built unpacked app:"
Write-Host $appExePath
