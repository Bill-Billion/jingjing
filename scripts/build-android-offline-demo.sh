#!/usr/bin/env bash
set -euo pipefail
repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
app_dir="$repo_dir/晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app"
flutter_bin="${FLUTTER_BIN:-flutter}"
cd "$app_dir"
"$flutter_bin" pub get --offline
"$flutter_bin" build apk --debug --no-pub --target lib/main_offline.dart \
  --dart-define=JX_OFFLINE_DEMO=true "$@"
printf '\n%s\n' "离线演示包：$app_dir/build/app/outputs/flutter-apk/"
