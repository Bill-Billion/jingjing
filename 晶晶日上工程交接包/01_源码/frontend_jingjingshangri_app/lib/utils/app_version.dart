/// App 展示版本号的唯一前端常量（SSOT）。
///
/// 为什么不直接读 pubspec：未引入 package_info_plus，以保持 `flutter test/build --no-pub`
/// 的离线链路与 .dart_tool/.plugin_symlinks 的 37 个 junction 不被 pub get 破坏。
///
/// 维护约定：每次发版升 pubspec.yaml 的 `version:` 时，必须同步 [kAppVersionName]；
/// 出包节点用 build-tools 的 aapt 读取 APK versionName 与此常量交叉核对，防止设置页版本号落后。
library;

/// 与 pubspec.yaml `version: 12.3.1+N` 的名称段一致（不含 +buildNumber）。
const String kAppVersionName = '12.3.1';

/// 设置页「版本信息」展示文案。
const String kAppVersionLabel = 'V$kAppVersionName 云端版';
