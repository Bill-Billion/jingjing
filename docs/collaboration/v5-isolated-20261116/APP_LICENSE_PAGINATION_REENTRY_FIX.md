# 许可分页与办理防重入

写前核两源码与 HEAD 完全相同，先备份两文件再写入。仅 license_api.dart all() 与 license_pages.dart _LicenseDetailState._operate()。

- all() 固定整次起始 owner/epoch，每页前后沿原 check 校验；同 ID 保留较大 record.version，同版保留先读记录，插入顺序不变。既有 page DTO/权限/游标循环拒绝均不改；异常不当空列表吞掉。跨页仍不是一致性快照。
- _operate() 入口与确认 await 后只加 _busy 守卫。pending 不作为拒绝条件；原 body/version/key 的 retry 路径、身份核对、预留商品归属校验及 API 权限不变。
- 静态核对 LicenseRecord.version 对应 object_version；diff 仅上述方法。不触碰 65/68 等其他文件。未测试、编译、分析器、格式化、业务请求或提交。


冻结 SHA256：
license_api.dart: `7bc37cc3d213582082323837f09f46695974054c2c771110dee1a180785d3a4b`
license_pages.dart: `bda16b1dd427dc848b34dabfa42d35f50b6401e8060277a5339e6433cf0c0a29`
