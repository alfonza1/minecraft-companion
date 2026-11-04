[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$OutputPath, [string]$PreviewPath)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$sizes = @(16, 20, 24, 32, 40, 48, 64, 128, 256)
$frames = @()
foreach ($size in $sizes) {
    $canvas = New-Object System.Drawing.Bitmap(($size * 4), ($size * 4))
    $graphics = [System.Drawing.Graphics]::FromImage($canvas)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.ScaleTransform(($size / 8.0), ($size / 8.0))
    $background = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#19191C'))
    $white = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#F5F5F7'))
    $blue = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#79B8FF'))
    $tile = New-Object System.Drawing.Drawing2D.GraphicsPath
    $letter = New-Object System.Drawing.Drawing2D.GraphicsPath
    try {
        $tile.AddArc(0, 0, 10, 10, 180, 90)
        $tile.AddArc(22, 0, 10, 10, 270, 90)
        $tile.AddArc(22, 22, 10, 10, 0, 90)
        $tile.AddArc(0, 22, 10, 10, 90, 90)
        $tile.CloseFigure()
        $graphics.FillPath($background, $tile)
        # The same P2 geometry as the application's vector mark, inset for taskbar legibility.
        $graphics.TranslateTransform(2, 2)
        $graphics.ScaleTransform(0.875, 0.875)
        $letter.AddPolygon([System.Drawing.PointF[]]@(
            [System.Drawing.PointF]::new(2,5), [System.Drawing.PointF]::new(13,5), [System.Drawing.PointF]::new(16,8),
            [System.Drawing.PointF]::new(16,17), [System.Drawing.PointF]::new(13,20), [System.Drawing.PointF]::new(6,20),
            [System.Drawing.PointF]::new(6,27), [System.Drawing.PointF]::new(2,27)))
        $letter.AddRectangle([System.Drawing.RectangleF]::new(6,9,6,7))
        $graphics.FillPath($white, $letter)
        $graphics.FillPolygon($blue, [System.Drawing.PointF[]]@(
            [System.Drawing.PointF]::new(19,5), [System.Drawing.PointF]::new(27,5), [System.Drawing.PointF]::new(30,8),
            [System.Drawing.PointF]::new(30,16), [System.Drawing.PointF]::new(23,23), [System.Drawing.PointF]::new(30,23),
            [System.Drawing.PointF]::new(30,27), [System.Drawing.PointF]::new(18,27), [System.Drawing.PointF]::new(18,21),
            [System.Drawing.PointF]::new(26,13), [System.Drawing.PointF]::new(26,9), [System.Drawing.PointF]::new(19,9)))
        $image = New-Object System.Drawing.Bitmap($size, $size)
        $downsample = [System.Drawing.Graphics]::FromImage($image)
        $png = New-Object System.IO.MemoryStream
        try {
            $downsample.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $downsample.DrawImage($canvas, 0, 0, $size, $size)
            $image.Save($png, [System.Drawing.Imaging.ImageFormat]::Png)
            $frames += ,$png.ToArray()
            if ($PreviewPath -and $size -eq 256) { $image.Save($PreviewPath, [System.Drawing.Imaging.ImageFormat]::Png) }
        } finally { $png.Dispose(); $downsample.Dispose(); $image.Dispose() }
    } finally { $letter.Dispose(); $tile.Dispose(); $background.Dispose(); $white.Dispose(); $blue.Dispose(); $graphics.Dispose(); $canvas.Dispose() }
}
$stream = [System.IO.File]::Create($OutputPath)
$writer = New-Object System.IO.BinaryWriter($stream)
try {
    $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$sizes.Count)
    $offset = 6 + 16 * $sizes.Count
    for ($index = 0; $index -lt $sizes.Count; $index++) {
        $dimension = if ($sizes[$index] -eq 256) { 0 } else { $sizes[$index] }
        $writer.Write([byte]$dimension); $writer.Write([byte]$dimension)
        $writer.Write([byte]0); $writer.Write([byte]0)
        $writer.Write([uint16]1); $writer.Write([uint16]32)
        $writer.Write([uint32]$frames[$index].Length); $writer.Write([uint32]$offset)
        $offset += $frames[$index].Length
    }
    foreach ($frame in $frames) { $writer.Write([byte[]]$frame) }
} finally { $writer.Dispose(); $stream.Dispose() }
