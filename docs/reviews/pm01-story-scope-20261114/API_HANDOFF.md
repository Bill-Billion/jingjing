# 同项目附件接口

0.31.70-rc.1/0221。GET /api/v1/production/projects/{record_id}/story/attachments/{asset_id}/content，无查询参数。普通项目人员带X-Acting-Party；独立审核员省略且同时具备PRODUCTION_REVIEW、CUSTOMIZATION_INTAKE。返回私有二进制，no-store、nosniff，不提供对象路径或公开地址。

项目资格与原story接口共用：买方/商家负责人、当前受派人员或独审兼受理。仅原订单绑定正式提交中的PRIVATE_ATTACHMENT字段可引用；旧正式、草稿附件和其他项目均不在此入口。当前项目资格和文件摘要在读前/读后重新检查；状态非READY、来源异常及存储损坏拒绝。没有以附件保留授予新用途，取消/结案的历史查看沿原story权限，本轮不发明自动永久演员授权。

页面接续尚未实施或认领，Bill-Billion仅既有UI。未来页面从story响应的正式字段取得asset_id，不读取其他附件列表补齐。没有本轮App/Web执行，真实存储和签收仍待。
