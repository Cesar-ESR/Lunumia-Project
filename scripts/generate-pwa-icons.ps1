Add-Type -AssemblyName System.Drawing

$iconDirectory = Join-Path $PSScriptRoot '..\public\icons'
New-Item -ItemType Directory -Force -Path $iconDirectory | Out-Null

function New-LunumiaIcon {
  param([int]$Size, [string]$FileName)

  $bitmap = [System.Drawing.Bitmap]::new($Size, $Size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#153d34'))
  $accentBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#d6f264'))
  $textBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#153d34'))
  $margin = [int]($Size * 0.18)
  $graphics.FillEllipse($accentBrush, $margin, $margin, $Size - (2 * $margin), $Size - (2 * $margin))
  $font = [System.Drawing.Font]::new('Segoe UI', $Size * 0.42, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $format = [System.Drawing.StringFormat]::new()
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $format.LineAlignment = [System.Drawing.StringAlignment]::Center
  $graphics.DrawString('L', $font, $textBrush, [System.Drawing.RectangleF]::new(0, 0, $Size, $Size), $format)
  $bitmap.Save((Join-Path $iconDirectory $FileName), [System.Drawing.Imaging.ImageFormat]::Png)
  $format.Dispose(); $font.Dispose(); $textBrush.Dispose(); $accentBrush.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}

New-LunumiaIcon -Size 192 -FileName 'icon-192.png'
New-LunumiaIcon -Size 512 -FileName 'icon-512.png'
New-LunumiaIcon -Size 512 -FileName 'icon-maskable-512.png'
