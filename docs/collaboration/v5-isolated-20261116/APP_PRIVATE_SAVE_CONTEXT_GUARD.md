# 私有文件保存：过期回调防护

## 修改范围
仅 lib/engagement/community_support.dart：CommunityPageState 新增私有保存所有者 token，savePrivate 捕获本次 API、session 对象、epoch、party 和读取 ticket。
- bytes 返回后、打开 FilePicker 前校验上下文。
- 保存器返回后再次校验；陈旧 success/error 不写入提示。
- finally 仅当前保存所有者清理自己的 token/busy；即便读取 ticket 已变也释放原保存锁，避免遗留忙碌状态。新保存持有不同 token 时不释放其锁。
- 原参数、account 身份选择、hash 校验、文件名、读取端点及保存/取消提示保持。

## 原有保护与边界
CommunityApi.bytes 原先已核验 epoch/party/hash；CommunityGate 按 epoch、身份及 route 设置子树 key，重建后旧 State dispose。本次补的是尚未重建窗口及过期读取 ticket 的异步 UI 回调防护，不是已证实的越权读取修复。
已经交给系统保存器或浏览器的文件不能靠此回调检查撤回；未增加这样的承诺。未改业务权限、后端或文件授权。未新增共创逐项等待提示。

## 当前全部调用点（均未修改）
- privacy/privacy_pages.dart:848：隐私请求回应证据，requests/{id}/evidence/{asset}/content，account:true。
- privacy/privacy_pages.dart:1257：个人材料，requests/{id}/files/{file}/content，保留内容 hash。
- engagement/engagement_pages.dart:1038：本人奖励文件，rewards/{id}/file。
- contract_six/contract_six_pages.dart:834：受控适龄预览，links/{linkId}/content/{listingId}/preview，account:true。
- contract_six/contract_six_pages.dart:883：案件依据文件，{ops}cases/{id}/files/{asset}，原 account 参数。
- cocreation/cocreation_pages.dart:430：本人片段，snippets/{id}/file，原 file_sha256。

## 核对与待测
修改前已库外备份，静态阅读完整 diff，并搜索所有 savePrivate 调用点。未测试、编译、analyzer、浏览器或推送。待同事验证正常保存、取消、读取失败、hash 不符、身份/权限变化、ticket 变化、页面销毁和再次保存，确认旧提示不覆盖、原锁释放。未称运行通过。

冻结 SHA-256（community_support.dart）：`a6d4ba7837b297a093b2d091a946ed2ad996b99779de9df331d3a8301065cc6d`。
