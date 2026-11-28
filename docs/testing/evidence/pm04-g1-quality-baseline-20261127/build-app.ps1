$ErrorActionPreference='Continue'
$qaOut='J:/worktrees/pm04-qa18/.local/qa18/quality-baseline-20261127'
$env:JAVA_HOME='J:/.local/tools/java/jdk-17.0.20.1+1'
$env:ANDROID_HOME='J:/.local/tools/android-sdk'
$env:ANDROID_SDK_ROOT=$env:ANDROID_HOME
$env:PUB_CACHE='J:/.local/tools/pub-cache'
$env:PATH="$env:JAVA_HOME/bin;$env:ANDROID_HOME/platform-tools;$env:PATH"
$env:GRADLE_OPTS='-Dorg.gradle.workers.max=2 -Dorg.gradle.parallel=false -Dorg.gradle.jvmargs=-Xmx2g -Dorg.gradle.project.kotlin.incremental=false -Dorg.gradle.project.kotlin.compiler.execution.strategy=in-process'
if ($env:HTTPS_PROXY) {
  $qaProxy=[uri]$env:HTTPS_PROXY
  if ($qaProxy.Host -eq '127.0.0.1' -and -not $qaProxy.UserInfo) {
    $env:GRADLE_OPTS+=" -Dhttp.proxyHost=127.0.0.1 -Dhttp.proxyPort=$($qaProxy.Port) -Dhttps.proxyHost=127.0.0.1 -Dhttps.proxyPort=$($qaProxy.Port) -Dhttp.nonProxyHosts=127.*"
  }
}
$env:HTTP_PROXY=$null;$env:HTTPS_PROXY=$null;$env:ALL_PROXY=$null
$env:NO_PROXY='localhost,127.0.0.1'
$env:FLUTTER_SUPPRESS_ANALYTICS='true'
$env:ORG_GRADLE_PROJECT_pm03Isolated='true'
Set-Location -LiteralPath 'R:/frontend_jingjingshangri_app'
& 'J:/.local/tools/flutter/bin/flutter.bat' build web --release --no-pub --no-web-resources-cdn --dart-define=JX_ACCOUNT_API_URL=http://127.0.0.1:53876 --output=build/baseline-normal-web *> (Join-Path $qaOut 'app-web-normal.log')
$normalExit=$LASTEXITCODE
$normalExit | Set-Content (Join-Path $qaOut 'app-web-normal.exit')
& 'J:/.local/tools/flutter/bin/flutter.bat' build web --release --no-pub --no-web-resources-cdn --target=test/support/v5_business_browser_main.dart --dart-define=R05_R12_SYNTHETIC_ONLY=true --dart-define=JX_ACCOUNT_API_URL=http://127.0.0.1:53876 *> (Join-Path $qaOut 'app-web-synthetic.log')
$syntheticExit=$LASTEXITCODE
$syntheticExit | Set-Content (Join-Path $qaOut 'app-web-synthetic.exit')
& 'J:/.local/tools/flutter/bin/flutter.bat' build apk --debug --no-pub --target=lib/main.dart --target-platform android-arm64 --dart-define=JX_ACCOUNT_API_URL=http://127.0.0.1:53876 *> (Join-Path $qaOut 'android-build.log')
$apkExit=$LASTEXITCODE
$apkExit | Set-Content (Join-Path $qaOut 'android-build.exit')
"normal=$normalExit synthetic=$syntheticExit apk=$apkExit"
exit ([int]($normalExit -ne 0 -or $syntheticExit -ne 0 -or $apkExit -ne 0))
