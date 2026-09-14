param([string]$Out = "test/out/shots/screen.png")
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$b = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($b.Left, $b.Top, 0, 0, $bmp.Size)
$dir = Split-Path $Out
New-Item -ItemType Directory -Force $dir | Out-Null
$full = Join-Path (Resolve-Path $dir).Path (Split-Path $Out -Leaf)
$bmp.Save($full, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Output $full
