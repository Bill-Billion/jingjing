param(
  [ValidateSet('status','start','stop','test','preview')][string]$Action='status',
  [string]$AccessFile,
  [switch]$Visible
)
$ErrorActionPreference='Stop'
$repoRoot=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$workspace=(Resolve-Path (Join-Path $repoRoot '../..')).Path
$appRoot=Join-Path $repoRoot '晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app'
if(-not(Test-Path (Join-Path $workspace '.local/tools/android-sdk/emulator/emulator.exe'))){throw '本机尚未安装项目安卓工具，见 docs/testing/ANDROID_LOCAL_TEST_20261021.md'}
function Ensure-Alias([string]$drive,[string]$target) {
  if(Test-Path ($drive+'\')) {
    & python -c 'import os,sys; sys.exit(0 if os.path.samefile(sys.argv[1],sys.argv[2]) else 1)' ($drive+'\') $target
    if($LASTEXITCODE -ne 0){throw "$drive 已被其他目录占用，不覆盖。"}
  } else {
    & subst $drive $target
    if($LASTEXITCODE -ne 0){throw '创建本机短路径失败'}
  }
}
Ensure-Alias 'J:' $workspace
Ensure-Alias 'K:' $appRoot
$env:DEBUG=$null; $env:NODE_DEBUG=$null
$env:JAVA_HOME=(Get-ChildItem 'J:/.local/tools/java' -Directory | Select-Object -First 1).FullName
$env:ANDROID_HOME='J:\.local\tools\android-sdk'
$env:ANDROID_SDK_ROOT=$env:ANDROID_HOME
$env:ANDROID_AVD_HOME='J:\.local\tools\android-avd'
$env:PUB_CACHE='J:\.local\tools\pub-cache'
$env:Path="$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"
$env:GRADLE_OPTS='-Dorg.gradle.workers.max=2 -Dorg.gradle.parallel=false -Dorg.gradle.jvmargs=-Xmx2g -Dorg.gradle.project.kotlin.incremental=false -Dorg.gradle.project.kotlin.compiler.execution.strategy=in-process'
if($env:HTTPS_PROXY){
  $proxyUri=[uri]$env:HTTPS_PROXY
  if($proxyUri.Host -eq '127.0.0.1' -and -not $proxyUri.UserInfo){
    $env:GRADLE_OPTS+=" -Dhttp.proxyHost=127.0.0.1 -Dhttp.proxyPort=$($proxyUri.Port) -Dhttps.proxyHost=127.0.0.1 -Dhttps.proxyPort=$($proxyUri.Port) -Dhttp.nonProxyHosts=127.*"
  }
}
# Gradle keeps its explicit download proxy; local Dart/ADB debugging stays direct.
$env:HTTP_PROXY=$null; $env:HTTPS_PROXY=$null; $env:ALL_PROXY=$null
$env:NO_PROXY='localhost,127.0.0.1'
$adb=Join-Path $env:ANDROID_HOME 'platform-tools/adb.exe'
$emulator=Join-Path $env:ANDROID_HOME 'emulator/emulator.exe'
$flutter='J:\.local\tools\flutter\bin\flutter.bat'
$runtime=Join-Path $repoRoot '.local/android-runtime'
New-Item -ItemType Directory -Force $runtime | Out-Null
if($Action -eq 'status') { & $emulator -accel-check; & $adb devices; exit $LASTEXITCODE }
$devices=& $adb devices
$running=($devices -join "`n") -match 'emulator-5554\s+device'
if($running){
  $name=& $adb -s emulator-5554 emu avd name
  if($name[0] -ne 'JX_API35'){throw '5554端口已有其他虚拟手机，不操作。'}
}
if($Action -eq 'stop') {if($running){& $adb -s emulator-5554 emu kill}; exit 0}
if($Action -eq 'start') {
  if($running){Write-Output '项目安卓模拟器已运行。';exit 0}
  $argsList=@('-avd','JX_API35','-no-audio','-no-boot-anim','-no-snapshot','-gpu','software','-memory','2048','-cores','2','-port','5554')
  $style='Hidden'
  if($Visible){$style='Normal'}else{$argsList+='-no-window'}
  Start-Process -FilePath $emulator -ArgumentList $argsList -WindowStyle $style -RedirectStandardOutput (Join-Path $runtime 'emulator.log') -RedirectStandardError (Join-Path $runtime 'emulator-error.log') | Out-Null
  Write-Output '已启动；稍后运行 -Action status 确认设备已出现。';exit 0
}
if(-not $running){throw '先运行 -Action start，待安卓启动完成。'}
if(-not $AccessFile){throw '请提供本轮正在运行的 story 模拟资料 access.json 路径；不要传真实账号。'}
$env:CUSTOMIZATION_ACCESS_FILE=(Resolve-Path -LiteralPath $AccessFile).Path
& node (Join-Path $PSScriptRoot 'prepare-r01-app-fixture.cjs')
if($LASTEXITCODE -ne 0){throw '合成资料检查失败'}
& node (Join-Path $PSScriptRoot 'prepare-android-story.cjs')
if($LASTEXITCODE -ne 0){throw '安卓模拟报价准备失败'}
$fixture=Get-Content -Raw -Encoding UTF8 $env:CUSTOMIZATION_ACCESS_FILE | ConvertFrom-Json
$fixturePort=([uri]$fixture.base_url).Port
& $adb -s emulator-5554 reverse "tcp:$fixturePort" "tcp:$fixturePort"
if($LASTEXITCODE -ne 0){throw '连接本机测试服务失败'}
$env:JX_NATIVE_EVIDENCE_DIR=Join-Path $runtime 'screenshots'
$ErrorActionPreference='Continue'
Push-Location 'K:\'
try {
  if($Action -eq 'test') {
    & $flutter drive -d emulator-5554 --no-pub --no-dds --keep-app-running --enable-software-rendering --no-enable-impeller --timeout=360 --driver=test_driver/native_screenshots.dart --target=integration_test/android_business_test.dart --dart-define-from-file=.local/r01-browser-defines.json
  } else {
    & $flutter run -d emulator-5554 --no-pub --no-dds --enable-software-rendering --no-enable-impeller --target=test/support/android_preview_main.dart --dart-define-from-file=.local/r01-browser-defines.json
  }
  $result=$LASTEXITCODE
  if($Action -eq 'test' -and $result -eq 0){
    & python (Join-Path $PSScriptRoot 'collect-android-screenshots.py') --adb $adb --output $env:JX_NATIVE_EVIDENCE_DIR
    if($LASTEXITCODE -ne 0){$result=1}
  }
} finally {Pop-Location}
exit $result
