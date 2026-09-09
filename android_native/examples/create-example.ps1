# Generates original block artwork and a v1 theme package; no downloaded assets.
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.IO.Compression
$themeOutput = Join-Path $PSScriptRoot 'Moss-Workbench.mcatlas-theme'
$themeAssets = @{}
function New-ThemePng([string]$role) {
    $bitmap = [Drawing.Bitmap]::new(64,32)
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.Clear([Drawing.Color]::FromArgb(130,191,207))
        $brush = [Drawing.SolidBrush]::new([Drawing.Color]::FromArgb(72,106,49))
        try {
            for ($x=0; $x -lt 64; $x+=4) { $graphics.FillRectangle($brush,$x,(20-($x%12)),4,32) }
            $brush.Color=[Drawing.Color]::FromArgb(236,239,218)
            $graphics.FillRectangle($brush,8,4,12,4)
            $graphics.FillRectangle($brush,40,8,16,4)
        } finally { $brush.Dispose() }
        $stream=[IO.MemoryStream]::new()
        try { $bitmap.Save($stream,[Drawing.Imaging.ImageFormat]::Png); return ,$stream.ToArray() } finally { $stream.Dispose() }
    } finally { $graphics.Dispose(); $bitmap.Dispose() }
}
$themeAssets['header']=New-ThemePng 'header'
$themeManifest=@{
 formatVersion=1; name='苔石工作台'; description='原创方块景观，苔绿与等宽文字'; author='MC Atlas'; baseTheme='grass'; accent='436B35'; darkByDefault=$false
 style=@{radius=4;border=2;font='mono';fontScale=1;lightBackground='E9F0DF';darkBackground='172014';textureOpacity=0.08}
 assets=@{header='assets/header.bin'}
}
$themeStream=[IO.File]::Open($themeOutput,[IO.FileMode]::Create)
$themeArchive=[IO.Compression.ZipArchive]::new($themeStream,[IO.Compression.ZipArchiveMode]::Create)
try {
    $entry=$themeArchive.CreateEntry('manifest.json')
    $writer=[IO.StreamWriter]::new($entry.Open(),[Text.UTF8Encoding]::new($false))
    try { $writer.Write(($themeManifest | ConvertTo-Json -Depth 5)) } finally { $writer.Dispose() }
    foreach ($role in $themeAssets.Keys) {
        $assetStream=$themeArchive.CreateEntry("assets/$role.bin").Open()
        try { $assetStream.Write($themeAssets[$role],0,$themeAssets[$role].Length) } finally { $assetStream.Dispose() }
    }
} finally { $themeArchive.Dispose(); $themeStream.Dispose() }
Get-Item -LiteralPath $themeOutput | Select-Object Name,Length
