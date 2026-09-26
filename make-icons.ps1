Add-Type -AssemblyName System.Drawing

function New-AppIcon([int]$size, [string]$path) {
  $bitmap = [System.Drawing.Bitmap]::new($size, $size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.ScaleTransform($size / 512.0, $size / 512.0)

  $cream = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(247, 244, 236))
  $ink = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(38, 35, 30))
  $gold = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(181, 139, 59))
  $goldLine = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(123, 85, 28), 12)
  $lightLine = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255, 229, 174), 14)

  $background = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $background.AddArc(0, 0, 112, 112, 180, 90)
  $background.AddArc(400, 0, 112, 112, 270, 90)
  $background.AddArc(400, 400, 112, 112, 0, 90)
  $background.AddArc(0, 400, 112, 112, 90, 90)
  $background.CloseFigure()
  $graphics.FillPath($cream, $background)
  $graphics.FillEllipse($ink, 66, 66, 380, 380)

  # A simple pineapple mark, kept clear at small home-screen icon sizes.
  $graphics.FillEllipse($gold, 163, 200, 186, 215)
  $graphics.DrawLine($lightLine, 200, 236, 312, 361)
  $graphics.DrawLine($lightLine, 177, 290, 276, 398)
  $graphics.DrawLine($lightLine, 312, 235, 199, 362)
  $graphics.DrawLine($lightLine, 333, 290, 238, 395)
  $graphics.DrawEllipse($goldLine, 163, 200, 186, 215)
  $graphics.FillEllipse($gold, 244, 107, 29, 106)
  $graphics.FillEllipse($gold, 198, 123, 31, 99)
  $graphics.FillEllipse($gold, 285, 123, 31, 99)

  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $bitmap.Dispose()
  $background.Dispose()
  $cream.Dispose()
  $ink.Dispose()
  $gold.Dispose()
  $goldLine.Dispose()
  $lightLine.Dispose()
}

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
New-AppIcon 192 (Join-Path $root 'icon-192.png')
New-AppIcon 512 (Join-Path $root 'icon-512.png')
New-AppIcon 180 (Join-Path $root 'apple-touch-icon.png')
