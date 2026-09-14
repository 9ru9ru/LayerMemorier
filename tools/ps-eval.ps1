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
$ps = New-Object -ComObject Photoshop.Application
$result = $ps.DoJavaScript($script)
if ($null -ne $result) { Write-Output ([string]$result) }
