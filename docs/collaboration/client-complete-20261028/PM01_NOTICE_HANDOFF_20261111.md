# 普通通告发布：W03当前页面与审阅入口

用户确认没有并行前端施工，chengcongcong222已接手并补齐App资格提示与网页规则选项；Bill-Billion实际审阅未确认。当前接口0.31.56-rc.1/0211，普通发布政策由0.31.54引入，本批未改变其后端业务口径。旧页面和历史交付保留，准确上传/检查见双方CURRENT。

## 可调用接口和规则

1. 运营用既有 POST /api/v1/notices/rules 提交新规则，rule.publishing_policy=VERIFIED_ADULT_20261111，再由另一岗位审核。其余旧必填字段仍保留供旧会员规则兼容；新普通个人发布不读取最低星探等级。未审规则不能使用。
2. App GET /api/v1/notices/rules 读取已审规则；普通发布选取明确的新政策，不依赖无序列表第一项或猜最高版本。不把缺省的旧规则当作新政策。
3. GET /api/v1/notices/eligibility?rule_id=… 返回 active/types 作为实际可发范围。新普通个人可 active=true、level=0；这个0不是“发布失败”，也不是会员升级。模型识别新政策，本批App已验证普通实名level=0可继续、缺资格不引导充值；原有通告测试一并通过。
4. 既有 announcements、reviews、catalog、records、submissions、decision、cases/quote 全部可沿原路径调用。“我发布的”沿本人 records 查询；结果未知先查原记录，再用原键原体恢复。
5. 新规则普通个人支持 DRAMA、PERFORMANCE、COMMERCIAL、EVENT、RECRUITMENT；只有DRAMA/RECRUITMENT接投稿。机构继续所审types；官方只用专门岗位。不得把普通发活动通告说明为已经取得线下活动/试镜组织资格。

## 页面已改与下一步

App notices_pages.dart按选中规则区分普通成年实名发布与历史会员政策；新政策缺资格说明不能以充值替代。网页notices.ts规则表单明确选择VERIFIED_ADULT_20261111或历史SCOUT_QUALIFIED，不将无字段旧规则当新规则。已保留“我发布的”、投稿和原请求恢复入口。本批为页面补缺与分层复验，实际团队独立审阅及原生设备检查未代做。

验收至少覆盖：从普通账号创建→运营独审→另一艺人投稿→另一岗位审稿→本人感兴趣→客服关联真实报价。记录相同通告/投稿/工单/报价/订单编号。补未审、未实名、未成年人、官方冒用、机构越权、会员失效、关闭通告、原键恢复和切身份清缓存；页面/原生/实体机分层登记。后端现有证据走到未付款订单，不代替付款、制作、退款整链。

W05本人资料、W06机构五动作、W07匹配与榜单说明已由chengcongcong222接续；同申请App组件→网页→App组件已有实际API证据。当前先验收W01—W09，不开展W10后完整路线。共享权限和契约仍需另一方实审，PR39不自动合并或部署。

## 证据和限制

[前批后端报告](../../reviews/pm01-start-notices-20261111/REPORT.md)、[同记录编号](../../reviews/pm01-start-notices-20261111/records.json)、[来源与有效预期](../../requirements/NOTICE_PUBLISHING_PM01_20261111.md)。资料均合成，规则审批和主要通告流程通过真实本机HTTP；实名、素材、商单报价及订单接受部分使用隔离助手/仓储。没有真实付款、供应商、全页或实体机验收。原人工3490未更新，不将其中旧页面用于验本批新政策。

本批页面/跨端证据及准确限制见[W01—W09报告](../../reviews/pm01-w01-w09-closure-20261111/REPORT.md)。[旧接法原文归档](../../archive/pm01-w01-w09-before-20261111/PM01_NOTICE_HANDOFF_20261111.md)。
