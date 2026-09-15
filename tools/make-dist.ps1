# 배포용 zip을 만든다. 패널 실행에 필요한 것만 담고 개발 파일은 뺀다.
# 파일명의 버전은 package.json에서 읽는다.
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$version = (Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
$dist = Join-Path $root 'dist'
$zip = Join-Path $dist "LayerMemorier-$version.zip"
$stage = Join-Path $env:TEMP 'LayerMemorier-dist'
$pkg = Join-Path $stage 'LayerMemorier'

if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force $pkg | Out-Null
New-Item -ItemType Directory -Force $dist | Out-Null

foreach ($i in @('CSXS', 'client', 'core', 'host', 'install', 'README.md', '.debug')) {
    $src = Join-Path $root $i
    if (-not (Test-Path $src)) { Write-Error "missing: $i"; exit 1 }
    Copy-Item $src -Destination $pkg -Recurse -Force
}

if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path $pkg -DestinationPath $zip
Remove-Item $stage -Recurse -Force

$kb = [math]::Round((Get-Item $zip).Length / 1KB)
Write-Output "$zip ($kb KB)"
