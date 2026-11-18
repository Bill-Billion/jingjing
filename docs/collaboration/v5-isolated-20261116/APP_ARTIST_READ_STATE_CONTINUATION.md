# C06/C09 公共艺人读取态最小修正
仅artists_pages.dart/_PublicArtistDetailsState。备份及增量patch在仓库外备份。
- AccountError.status为401/403/404/410继续走原不可用路径与实际错误说明，不归类普通读取失败；没有猜新错误枚举。
- 其他AccountError采用现有ReadFailureContent/ReadFailureActions，原reload重读，原返回目录pop。
- 每次reload仍清空current/media并关闭available；普通失败不留旧媒体。身份变化及媒体主动unavailable清除readFailed和旧error，避免旧网络错误覆盖最新失效。
- API、模型、授权与数据请求未改，原详情成功后UI/底栏保持。
只是静态分类与代码修改，未运行测试/编译/analyzer/formatter/业务请求，未提交推送。
待同事核一般网络失败、401/403/404/410、读取中切身份、媒体主动失效、失败重读成功与返回；不称已验证。
SHA256: 6374374311b56c02e43e45126bb3150f8553d590df960c46d05c3036cf682ce7
