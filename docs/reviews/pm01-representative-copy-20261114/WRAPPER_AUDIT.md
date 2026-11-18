# 企业业务入口只读核查

- auditions/context.js:11、17：买方身份与预约访问仍用A.owner；建议下一轮接TRADE，保留成年人/企业核准及卖方授权。尚未新增运行证据。
- customization/repository.js:25—40：当前成员验证再核created_by与party_id；是本人创建私密请求，不是所有企业成员共享故事。不得为代办简单取消创建者限制。
- notices/repository.js:13、15、17、51：资质、发布/投稿及列表仍存在A.owner，须区分企业买方办理与资质/本人权利；本轮未改这些入口。

只是源码事实与下一步，不把静态核查写成业务已验。
