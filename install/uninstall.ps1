$link = Join-Path $env:APPDATA 'Adobe\CEP\extensions\LayerMemorier'
if (Test-Path $link) { cmd /c rmdir "$link" | Out-Null; Write-Output "removed $link" } else { Write-Output "not installed" }
