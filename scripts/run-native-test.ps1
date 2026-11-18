param([string]$AppRoot,[string]$Target,[string]$Device,[string]$Defines,[string]$Timeout='15m')
$ErrorActionPreference='Stop'
if($Device -notmatch '^emulator-\d+$' -or $Target -notmatch '^integration_test/[a-z0-9_]+\.dart$'){throw 'Only isolated integration tests are allowed'}
& python -c 'import os,sys; sys.exit(0 if os.path.samefile(sys.argv[1],sys.argv[2]) else 1)' 'K:\' $AppRoot
if($LASTEXITCODE -ne 0){throw 'K: must point to the intended App workspace; run android-local.ps1 first'}
$env:DEBUG=$null
$env:NODE_DEBUG=$null
$env:JAVA_HOME=(Get-ChildItem 'J:/.local/tools/java' -Directory | Select-Object -First 1).FullName
$env:ANDROID_HOME='J:\.local\tools\android-sdk'
$env:ANDROID_SDK_ROOT=$env:ANDROID_HOME
$env:ANDROID_AVD_HOME='J:\.local\tools\android-avd'
$env:PUB_CACHE='J:\.local\tools\pub-cache'
$env:PATH="$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:PATH"
$env:GRADLE_OPTS='-Dorg.gradle.workers.max=2 -Dorg.gradle.parallel=false -Dorg.gradle.jvmargs=-Xmx2g -Dorg.gradle.project.kotlin.incremental=false -Dorg.gradle.project.kotlin.compiler.execution.strategy=in-process'
if($env:HTTPS_PROXY){
 $proxyUri=[uri]$env:HTTPS_PROXY
 if($proxyUri.Host -eq '127.0.0.1' -and -not $proxyUri.UserInfo){
  $env:GRADLE_OPTS+=" -Dhttp.proxyHost=127.0.0.1 -Dhttp.proxyPort=$($proxyUri.Port) -Dhttps.proxyHost=127.0.0.1 -Dhttps.proxyPort=$($proxyUri.Port) -Dhttp.nonProxyHosts=127.*"
 }
}
$env:HTTP_PROXY=$null;$env:HTTPS_PROXY=$null;$env:ALL_PROXY=$null
$env:NO_PROXY='localhost,127.0.0.1'
$env:FLUTTER_SUPPRESS_ANALYTICS='true'
Set-Location -LiteralPath 'K:\'
$ErrorActionPreference='Continue'
& 'J:\.local\tools\flutter\bin\flutter.bat' test $Target -d $Device --no-pub --timeout $Timeout "--dart-define-from-file=$Defines" --reporter expanded
exit $LASTEXITCODE
