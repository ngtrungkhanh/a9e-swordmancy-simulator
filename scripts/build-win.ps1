$ErrorActionPreference = 'Stop'

$root = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')
$tempBuild = Join-Path $env:TEMP 'swordmancy-build'
$releaseRoot = Join-Path $root 'release'

Write-Host "Cleaning up previous build directories..."
if (Test-Path -LiteralPath $tempBuild) {
    Remove-Item -LiteralPath $tempBuild -Recurse -Force
}
if (Test-Path -LiteralPath $releaseRoot) {
    Remove-Item -LiteralPath $releaseRoot -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "Building Vite project..."
Set-Location $root
npm run build

Write-Host "Running electron-builder in temp directory to avoid file locks..."
npx electron-builder --win --config.directories.output=$tempBuild

Write-Host "Copying build outputs back to release folder..."
New-Item -ItemType Directory -Force -Path $releaseRoot | Out-Null
Copy-Item -Path (Join-Path $tempBuild '*') -Destination $releaseRoot -Recurse -Force

Write-Host "Cleaning up temp build directories..."
Remove-Item -LiteralPath $tempBuild -Recurse -Force

Write-Host "Build complete! Output located at:"
Write-Host $releaseRoot
