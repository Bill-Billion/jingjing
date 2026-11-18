# 73通知偏好响应校验与74历史分页保护
基线25083e63。修改前已仓库外备份，仅privacy/privacy_pages.dart及support/tickets.dart；不改矩阵或公共请求机制。
## 73
savePreferences原PATCH响应校验保留版本/个性化/营销/休息间隔，按本次body实际包含的字段追加push_enabled/night_reminder_enabled布尔相等及quiet_hours.enabled/start_minute/end_minute类型与值相等检查。兼容未提供通知字段的旧响应路径，不补默认值；夜间跨午夜、原If-Match、pending恢复及成功后重新读取流程未改。
## 74
moreHistory冻结原工单ID、当前记录ID、cursor、页面ticket与session epoch/party。返回后先核全部上下文再解析/追加，错误仅同上下文发布。
finally仅按mounted与本次ticket释放busy，不依赖成功后变化的cursor或过期身份，避免当前页面锁死；不回写私有记录/错误，也不释放较新请求的锁。
原CommunityApi.read的单请求身份校验继续保留。未修改反馈提交、附件上传下载或原pending语义，无新增接口。
## 未验证
仅源码静态范围核对；未测试、编译、格式化、analyzer、业务请求、浏览器、提交或推送。待同事验证通知字段不一致响应、旧字段兼容、跨午夜保存、工单分页成功/失败、身份/工单变化、离页与原请求恢复。不宣称运行通过。
## 冻结SHA256
- privacy/privacy_pages.dart: 9c60cc37b4f1dce22a064c116a1f0f6a39d11448e749a2cafed7bd92aa932834
- support/tickets.dart: 108422ab0b253f480c858b9f4b8e93cb8069040440ef822631001e137b719c7b
