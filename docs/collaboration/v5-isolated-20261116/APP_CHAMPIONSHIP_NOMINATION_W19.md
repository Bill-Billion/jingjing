# W19 本人月冠军提名入口

基线9b1e4af1。仅修改engagement/engagement_pages.dart，未新增后端接口或Web独审。

## 已落实
- 活动详情增加本人提名分区，沿原已读competition记录获取event_id；本人档案只从GET /api/v1/engagement/profiles/mine获得，禁止手填profile_id。目录独立加载，错误不覆盖活动详情/投票查询；检查id、person_id、city/district/category及重复ID，选项按活动三字段匹配。
- 门禁沿本人PERSON OWNER；目录后端还核真实本人、成年及有效公开授权。不把目录可见等同具备参选资格，光环/原榜首/排名证据仍由nominate实际核验。
- 提名开放条件为PUBLISHED且未截止，不误用投票开始时间或投票剩余次数。明确同意后POST candidates，仅event_id/profile_id；新请求无If-Match，按既有act保存原幂等key。返回核CANDIDATE、当前owner、原event parent、profile及person关联。
- 成功展示服务器候选状态和本记录入口，不声称已入选/已通过/获得奖励，也不声称提名扣用投票晶钻。
- 目录读取冻结活动、页面ticket、目录ticket及epoch/party；改变选择或重读活动撤销勾选。未知结果期间禁止新提名；既有会话身份清理继续生效。
- reconcilePending新增candidates分支：读原活动、本人目录，有resultId时读原候选记录并校验。recover沿原body/key，validateResult对原event/profile/owner再核；不把新选择换进原未知请求。

## 真正边界
公开competition.candidates只列已审核且仍可见者，不能拿空列表断言没有待审提名。没有按event/profile查询本人待审候选的专用端点。后端championship.js:13在幂等command前重新检查当前活动/档案资格，所以活动截止或资格变化后，原未知请求恢复也可能失败。本页保留醒目说明“恢复失败不代表从未提交”，本页未知标记不因普通恢复错误而自动打开新提名；通用请求层在该409等确定错误时可能清除pending；本页未知标记仅内存，因此跨离页/重启不能承诺保留自动恢复能力。这不等于新增跨重启完整未知案件目录。不能承诺已解决后端边界，仍需按原请求/候选记录核对。禁止由前端改key或重复建案掩盖未知结果。

## 源码依据
- H/engagement-routes.js:12、14：POST candidates与GET profiles/mine、competitions/:id、records/:id。
- M/engagement/rankings.js:3–5：visible及myProfiles，返回本人的有效公开档案。
- M/engagement/championship.js:13：A.self本人、活动地域类别、光环/榜首、原composite排名、IN_REVIEW插入；:22起competitionResult不公开待审候选。
- 原Web business/references.ts:19–21、82亦使用profiles/mine并校验目录；本批只补用户App入口。

## 同事待验证
本人合法/无资格档案、地域类别不匹配、目录读取失败不影响投票、同页重读/换身份/截止、新建重复提名错误、未知恢复及原活动截止、实际返回候选与原event/profile/person一致。未执行测试、编译、分析器、格式化或业务API请求。
