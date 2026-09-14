# LayerMemorier 설치: PlayerDebugMode 레지스트리 + 확장 폴더 정션. 다시 실행해도 안전하다.
$ErrorActionPreference = 'Stop'
$extRoot = Join-Path $env:APPDATA 'Adobe\CEP\extensions'
$link = Join-Path $extRoot 'LayerMemorier'
$src = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

New-Item -ItemType Directory -Force $extRoot | Out-Null

$key = 'HKCU:\SOFTWARE\Adobe\CSXS.9'
if (-not (Test-Path $key)) { New-Item -Path $key -Force | Out-Null }
Set-ItemProperty -Path $key -Name PlayerDebugMode -Value '1' -Type String

if (Test-Path $link) { cmd /c rmdir "$link" | Out-Null }
cmd /c mklink /J "$link" "$src" | Out-Null

$debug = (Get-ItemProperty $key).PlayerDebugMode
$manifestOk = Test-Path (Join-Path $link 'CSXS\manifest.xml')
Write-Output "PlayerDebugMode=$debug"
Write-Output "junction=$link -> $src"
Write-Output "manifest=$manifestOk"
if ($debug -ne '1' -or -not $manifestOk) { Write-Error 'install failed'; exit 1 }
Write-Output 'OK. Restart Photoshop, then Window > Extensions > LayerMemorier.'
