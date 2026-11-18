# 60 许可凭证与绑定资料补齐

仅 license_pages.dart build 的 GRANT/BINDING 分区；无新 API、读取、写入或权限条件。

- GRANT：用已有 parent 与 data.evidence_id 增加原预留、发放核验材料只读原记录入口；busy 时禁用。沿现有 /licensing/record 路由和目标页面权限读取，不预取材料，不冒充电子签署或支付成功。
- BINDING：直接使用 _read 已获取的 _bindingGrant/_bindingProject 展示许可真实状态、记录版本、开始/开发/有效期限，以及用途项目名称、用途、地域、语言、集数。强调绑定状态不代表当前使用有效，付款与权利仍分别核对。
- 保留原改稿按钮及所有权限表达式、查看项目/许可入口、额度提示；不计算剩余额度，不改 validBinding，不新设聚合。

已有契约依据：license_models GRANT evidence_id/parent、LicenseTerms 日期、PROJECT 用途字段；后端 modules/licensing/repository.js activate 以批准材料及匹配合同发放许可。之前页面已读取对象，仅缺对应展示与原记录导航。

静态 diff 仅两处分区插入；未测试、编译、分析器、格式化或运行业务接口。不是整页像素/功能验收。
