# 포토샵 COM으로 ExtendScript를 실행하고 마지막 식의 값을 stdout에 쓴다.
# -ScriptFile <jsx>  : 실행할 파일 (UTF-8 BOM 권장)
# -Code <string>     : 인라인 코드 (ASCII만)
# -NoHost            : host/host.jsx 를 미리 읽지 않는다
param(
  [string]$ScriptFile,
  [string]$Code,
  [switch]$NoHost
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$root = ((Resolve-Path (Join-Path $PSScriptRoot '..')).Path) -replace '\\', '/'
$parts = @()
if (-not $NoHost) { $parts += ('$.evalFile(File("' + $root + '/host/host.jsx"));') }
if ($ScriptFile) { $parts += ('$.evalFile(File("' + ((Resolve-Path $ScriptFile).Path -replace '\\', '/') + '"));') }
if ($Code) { $parts += $Code }
$script = $parts -join "`n"
# 버전 없는 ProgID(Photoshop.Application)의 CLSID·CurVer, 형식 라이브러리 경로 기본값이
# 비어 있는 PC가 있다 (2026-10-01 확인: REGDB_E_CLASSNOTREG, TYPE_E_REGISTRYACCESS).
# 그때는 2020 전용 ProgID로 붙고, 형식 라이브러리가 필요 없는 IDispatch 직접 호출을 쓴다.
try { $ps = New-Object -ComObject Photoshop.Application }
catch { $ps = New-Object -ComObject Photoshop.Application.140 }
$result = [System.__ComObject].InvokeMember('DoJavaScript', [System.Reflection.BindingFlags]::InvokeMethod, $null, $ps, @($script))
if ($null -ne $result) { Write-Output ([string]$result) }
