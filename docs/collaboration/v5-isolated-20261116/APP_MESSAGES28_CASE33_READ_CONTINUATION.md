# 28会话读取守卫与33办理分派
修改前已在仓库外备份。仅三文件源码局部修改，未测试/编译/analyzer/formatter/业务请求或浏览器操作。
## 33当前分派只读
依据backend/src/modules/notices/assignments.js:16–22，双方CASE投影已有support_assignment三字段account_id/assigned_at/mode。notices_models校验UUID、日期、ASSIGNED或QUOTE_CLAIM及允许字段集合，兼容字段整体缺省，不将缺省推断未分派。
notices_pages仅显示真实时间、方式和可展开内部编号；无名字/在线/已入会推断。明确分派不等于已处理。没有接运营assignment-history，也没有新增补件或聊天。
## 28读取与分页
auditions_pages的load在每个相关await后先mounted/ticket与api.check原epoch/party再发布，booking关联素材与消息另绑定原booking.id/version。刷新会话清除旧messages/cursor，旧分页票据失效。
moreMessages入口busy守卫，冻结booking/id/version及cursor，使用同加载代际票据，返回核原关联才合并。相同消息ID保留最大记录版本，列表记录同样按ID保留较新版本。
setRecord对相同ID拒绝更低版本，latest核读取代际/身份/页面ID后才发布并返回当前保留版本。保留会话只读/发送条件、所有原V5Form及pending路径，未增新消息写接口。
## 未验证与边界
只是静态风险修正，不称复现或运行通过。未改其他域的会话机制；没有全站竞态结论。分页仍为接口当前页，不是全量一致快照；未新增运营事件时间线。
待同事核：刷新与分页重叠、离页/切主体、同ID旧版页、会话变为冻结/归档、读取失败、原发送未知结果恢复、CASE三字段/缺省/异常投影。没有实际执行。
## SHA256
- auditions/auditions_pages.dart: 1607e8b16d2abf3722059a73221a850773cb91f6801adf0eb45660d3c8821025
- notices/notices_models.dart: d06e6a58260fa9e4014dc558bfea25fdff76af583507d6dfdbcf80388503efef
- notices/notices_pages.dart: f02e4df3df5a5f2ddc042b07cbcdc7dd9d8898dd7db7870a8ce3a6888747bf6b

## 静态复核收紧
moreMessages将epoch/party纳入current，异常提示不跨身份回写；finally单独按请求代际/身份清busy，不依赖成功后已变化cursor。load错误/finally同样核身份。booking刷新先清旧supplements，避免新booking与旧补充记录混显；二次读取仍核booking版本。未测试。
最新auditions_pages.dart SHA256: 3348d7df83e7e48be39ba9815c8d88f2277b60148f5a2b1f96ff2253084aa5e1
