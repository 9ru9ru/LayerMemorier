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
# Windows PowerShell 5.1의 Compress-Archive는 항목 경로에 역슬래시를 써서, Windows 밖에서는 폴더가 풀리지 않을 수 있다.
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::Open($zip, 'Create')
try {
    foreach ($f in Get-ChildItem $stage -Recurse -File -Force) {
        $name = $f.FullName.Substring($stage.Length + 1).Replace('\', '/')
        [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $f.FullName, $name)
    }
} finally {
    $archive.Dispose()
}
Remove-Item $stage -Recurse -Force

$kb = [math]::Round((Get-Item $zip).Length / 1KB)
Write-Output "$zip ($kb KB)"
