param(
  [string]$JavaHome = $env:JAVA_HOME,
  [string]$AndroidSdk = $env:ANDROID_HOME,
  [string]$BuildDir = (Join-Path $env:TEMP 'mc-atlas-native'),
  [string]$GradleUserHome = $env:GRADLE_USER_HOME
)
$ErrorActionPreference = 'Stop'
$sourceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../android_native'))
$buildRoot = [IO.Path]::GetFullPath($BuildDir)
if ($buildRoot -eq $sourceRoot -or $buildRoot.StartsWith($sourceRoot + [IO.Path]::DirectorySeparatorChar)) { throw '请选择仓库之外的 NTFS 构建目录' }
if (-not $JavaHome -or -not (Test-Path -LiteralPath (Join-Path $JavaHome 'bin/java.exe'))) { throw '请通过 -JavaHome 指定 JDK 17 目录' }
if (-not $AndroidSdk -or -not (Test-Path -LiteralPath $AndroidSdk)) { throw '请通过 -AndroidSdk 指定 Android SDK 目录' }
New-Item -ItemType Directory -Force -Path $buildRoot | Out-Null
& robocopy $sourceRoot $buildRoot /E /XD .gradle .kotlin build artifacts /XF local.properties /NFL /NDL /NJH /NJS
if ($LASTEXITCODE -gt 7) { throw '复制源码失败' }
$sdkValue = [IO.Path]::GetFullPath($AndroidSdk).Replace('\', '/').Replace(':', '\:')
[IO.File]::WriteAllText((Join-Path $buildRoot 'local.properties'), "sdk.dir=$sdkValue`n")
$env:JAVA_HOME = $JavaHome
if ($GradleUserHome) { $env:GRADLE_USER_HOME = $GradleUserHome }
Push-Location $buildRoot
try {
  & ./gradlew.bat :app:assembleDebug :app:testDebugUnitTest :app:lintDebug --console=plain
  if ($LASTEXITCODE -ne 0) { throw 'Android 构建或检查未通过，请查看上方报告' }
} finally { Pop-Location }
$artifactDir = Join-Path $sourceRoot 'artifacts'
New-Item -ItemType Directory -Force -Path $artifactDir | Out-Null
Copy-Item -LiteralPath (Join-Path $buildRoot 'app/build/outputs/apk/debug/app-debug.apk') -Destination (Join-Path $artifactDir 'MC-Atlas-debug.apk') -Force
Write-Output "已生成 $artifactDir/MC-Atlas-debug.apk"
