# 一次性初始化 Cloudflare 资源（Windows PowerShell 版）
# 前置：已安装 wrangler（npm i -g wrangler）并 wrangler login
# 用法：powershell -ExecutionPolicy Bypass -File scripts/cf-init.ps1
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..\worker')

Write-Host "==> 1/5 创建 D1 数据库"
$out = (& wrangler d1 create mc-map-db 2>&1 | Out-String)
Write-Host $out
if ($out -match 'database_id = "([^"]+)"') {
    $id = $Matches[1]
    $toml = Get-Content wrangler.toml -Raw
    $toml = $toml -replace 'REPLACE_WITH_D1_DATABASE_ID', $id
    [System.IO.File]::WriteAllText((Resolve-Path wrangler.toml), $toml, [System.Text.UTF8Encoding]::new($false))
    Write-Host "database_id 已写入 wrangler.toml: $id"
} else {
    Write-Host "D1 已存在或创建失败，请手动把 database_id 填入 worker/wrangler.toml"
}

Write-Host "==> 2/5 建表（幂等）"
& wrangler d1 execute mc-map-db --remote --file=schema.sql

Write-Host "==> 3/5 导入现有数据（如存在 mcmap.db）"
$dbPath = Join-Path $PSScriptRoot '..\mcmap.db'
if (Test-Path $dbPath) {
    node (Join-Path $PSScriptRoot 'export-d1-sql.js') $dbPath "$env:TEMP\migrate.sql"
    & wrangler d1 execute mc-map-db --remote --file="$env:TEMP\migrate.sql"
    Write-Host "数据已导入 D1"
} else {
    Write-Host "未找到 mcmap.db，跳过数据导入（新部署会自动创建 Owner 账号）"
}

Write-Host "==> 4/5 创建 R2 桶（已存在则跳过）"
& wrangler r2 bucket create mc-map-tiles 2>&1 | Out-Null
Write-Host "R2 桶就绪（瓦片由 GitHub Actions 的 sync-tiles.yml 自动同步）"

Write-Host "==> 5/5 设置 JWT_SECRET"
if ($env:JWT_SECRET) {
    $jwt = $env:JWT_SECRET
} else {
    $jwt = -join ((1..48) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })
    Write-Host "已生成随机 JWT_SECRET（也可用 openssl rand -base64 48）"
}
$jwt | & wrangler secret put JWT_SECRET --name mc-map-server

Write-Host ""
Write-Host "✅ 初始化完成！现在可以把代码推送到 GitHub，push 即自动部署。"
Write-Host "建议把上面的 JWT_SECRET 同时添加到 GitHub Secrets（Settings > Secrets and variables > Actions > JWT_SECRET）"