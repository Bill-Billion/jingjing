# 用户能提问题、查处理进度，消息按身份标已读

2026-10-30。本批是原第9、10组。后端负责人 **chengcongcong222**；前端负责人 **Bill-Billion**。候选接口 **0.31.9-rc.1**，数据库迁移到 **0181**。沿用PR39完整分支；具体上传提交与检查结果见CURRENT。本批不修改App/Vue页面，前端接好后还需同一版本整链验收。

用户已说“我已转发说明到前端”，该事实适用于此前目录、搜索、收藏材料。此文件是新增接入说明，不能据此写成前端已经收到、认领或完成新页面。

## 页面需要完成什么

|页面工作|负责人|依赖与完成标准|
|---|---|---|
|本人反馈／举报|前端负责人 Bill-Billion|当前办事身份提交，保留文字和已上传附件；成功后可返回列表重开，清楚显示处理状态|
|查看答复与补件|前端负责人 Bill-Billion|按历史顺序显示本人／客服记录；仅待补件允许补交，答复后可关闭或重新提出问题；旧附件不能被新附件替换|
|客服处理|前端负责人 Bill-Billion|运营账号须已有SUPPORT_HANDLE；先受理再要求补件或答复；不能处理自己的反馈，不冒充举报成立或退款成功|
|四频道通知|前端负责人 Bill-Billion|保留订单会话／投稿意向／活动投票／系统通知四类；接新通知列表、未读和批量已读；每次换身份重取，清除旧请求结果|
|同版本验证|后端负责人 chengcongcong222|前端给实际提交后，组合核对一笔工单全流程、附件字节、权限与新消息保护；接口完成不等于页面验收|

## 正式反馈／举报

根路径 `/api/v1/support`。本人接口必须带 `X-Acting-Party`，仅允许提交人和原办事身份读取；机构其他成员不会因为同属机构就读到这份个人反馈。运营路径不能带该头，由服务器核验客服权限和利益冲突。所有写入带 `Idempotency-Key`，处理动作另带 `If-Match: "版本"`。动作成功后返回当前工单和ETag；旧键重试只返回当前状态，不倒退工单或重写历史。

|办理事项|调用|
|---|---|
|提交|`POST /tickets`：`kind`为FEEDBACK或REPORT；`title`≤200字；`text`≤4000字；`target`为null或`{domain,record_id}`；`asset_ids`最多10个且不重复|
|本人列表、详情|`GET /tickets?status=...&cursor=...&limit=20`；`GET /tickets/{ticket_id}`|
|本人处理记录|`GET /tickets/{ticket_id}/history?cursor=版本号&limit=20`，按版本递增；首屏不传cursor|
|本人补件／关闭／重开|`POST /tickets/{ticket_id}/actions`：`{action,text,asset_ids}`|
|客服列表、详情、记录|上述GET路径在`tickets`前加`operations/`|
|客服受理／补件要求／答复／关闭|`POST /operations/tickets/{ticket_id}/actions`：`{action,text,asset_ids:[]}`|
|附件下载|本人`GET /tickets/{ticket_id}/assets/{asset_id}/content`；客服路径加`operations/`，必须用当前授权请求取字节，不生成公开链接|

状态和按钮按下表显示，不能让用户猜英文状态。服务器也会再次检查，不只靠按钮隐藏。

|状态|页面显示|本人可做|客服可做|
|---|---|---|---|
|SUBMITTED|已提交，等待受理|查看记录|START：开始处理|
|PROCESSING|正在处理|查看记录|REQUEST_INFO：要求补充材料；ANSWER：给出答复|
|NEEDS_INFO|请补充材料|SUPPLEMENT：补交说明与附件|查看已有材料|
|ANSWERED|已有答复|CLOSE：结束本次反馈；REOPEN：重新提出问题|CLOSE：关闭|
|CLOSED|已关闭|REOPEN：重新提出问题|查看记录|

每个动作要求说明；提交、补件和重开不会自动承诺处理时限或赔偿。举报只是待核查线索，不自动封禁、扣款或判断侵权。订单售后仍提供回原订单入口，反馈工单不替代原退款、争议与隐私请求流程。

附件复用现有私有上传：`POST /api/v1/supply/assets?purpose=RIGHTS_EVIDENCE&media_type=...`，二进制body与当前本人／机构身份；只有READY、本人上传且属于同一办事身份的RIGHTS_EVIDENCE或REVIEW_EVIDENCE可提交。最大文件8MB沿原上传限制。失败保留文字和其他已成功附件，不把未就绪编号提交为成功。客服答复本批只用文字，不新开放客服上传他人材料。已正式引用的附件在历次补件中保留，删除请求须人工核对保留依据；没有编造永久或法定期限。

原业务关联只保存类型和编号，不复制原私有正文，不赋予客服读取整个订单／故事的权限。支持公开艺人／现货／通告（ARTIST_PUBLIC、STOCK_PUBLIC、NOTICE_PUBLIC）；私人故事CUSTOMIZATION；原TRADE订单、PRODUCTION、PROJECTS、FINANCE、SUPPLY、LICENSE、GIGS、NOTICES、PRIVACY；本人STOCK商品、AUDITIONS预约、ENGAGEMENT记录、COCREATION房间、REDEMPTION已获权益。依原业务检查提交人的当前权限；拿不到获准编号时用普通反馈`target:null`，不猜编号或伪造关联。

## 未读和全部已读

新增入口：

- `GET /api/v1/operations/notifications/feed`：可选`cursor`、`limit`、`unread_only`、`channel`。每条返回`channel`和`target`。原`/notifications`保留旧业务域，旧页面暂不切也不会收到无法识别的新域。
- `GET /api/v1/operations/notifications/unread`：返回四频道计数、总数、`snapshot_id`、`as_of`与`expires_at`。它代表本次查询时本人当前身份获准的通知集合，不是全平台消息总数或所有历史会话条数。
- `POST /api/v1/operations/notifications/read-all`：`{snapshot_id,channel}`；全频道用`channel:null`，指定频道用下表值。必须带原身份和幂等键；返回本次实际标记数与权限失效跳过数。
- 单条已读继续使用`POST /api/v1/operations/notifications/{event_id}/read`，空JSON body与幂等键。

|频道值|给用户的名字|内容|
|---|---|---|
|ORDER_CONVERSATIONS|订单会话|订单／项目留言、试镜会话、商单会话更新|
|SUBMISSION_INTENTS|投稿意向|原通告投稿和合作客服处理变化|
|ACTIVITY_VOTING|活动投票|本人活动／投票等实际业务记录变化|
|SYSTEM|系统通知|其他业务状态与客服答复／补件提醒|

`target`是跳回原业务的定位信息：SUPPORT打开本人反馈；AUDITIONS打开预约会话；GIG_ORDER打开商单订单会话；ENGAGEMENT打开原活动记录；旧域仍回原业务。不要拿AUDITION_MESSAGE或GIG_MESSAGE的消息编号当订单编号，实际跳转用`target.record_id`。

一次“全部已读”只影响本次查询留下的精确集合。快照有效一小时；到期返回NOTIFICATION_SNAPSHOT_EXPIRED，请刷新计数后让用户再操作。禁止收到409就自动换快照再次清除，避免把用户没看过的新消息清掉。新消息、换账号、换身份后旧快照不能乱用；重新打开页面刷新未读，不从本地减总数猜服务器结果。处理中按钮禁重入，断网用原键和原body恢复。

通知已读和原会话消息已读是两种事实：“我不再需要这条提醒”不代表“我已经看过会话内容”。进入原试镜／商单会话并按原接口标记已读，会同步对应提醒。原会话记录也已改为账号＋办事身份，旧系统无法确认身份的已读记录不猜归属，升级后相应消息可能重新显示未读一次。新增源只记录升级后的实际通知，不编造旧消息曾经发过提醒。

列表先按原业务再次过滤权限，所以中间页可能没有可显示项但仍有next_cursor；须继续加载到没有cursor才显示最终空列表。错误5xx不当作未读为0，保留失败和重试入口。

## 使用同一批记录验收

1. 个人身份提交带两份模拟附件的反馈，记录工单编号；退回列表重开，核对内容和字节。另一账号、同账号错误机构身份、无权限运营均不可读。
2. 客服受理→要求补件；用户上传新材料后明确补交；旧版本仍保留旧文件；客服重新受理→答复；本人关闭→重开。并发提交和断网重试不能多建工单或倒退状态。
3. 客服答复产生系统通知；查未读，期间产生第二条通知，再用旧快照全部已读，第二条仍未读。再测另一身份、过期快照、权限撤销。
4. 在真实隔离试镜／商单订单中发消息、读取、撤权与冻结；新通知只给获准身份。会话已读同步提醒，另一个身份的记录不变。
5. 损坏附件不能下载成功；读取存储过程中撤销客服权限，也不能把已经读出的字节交给页面。关联隐私删除请求应明确显示反馈证据依赖。

后端已准备可复跑合成资料：`node scripts/test-mysql.js support`重建并清理隔离库；试镜与商单沿原auditions/gigs测试种子复跑。证据里的随机工单编号仅用于记录，不是长期可登录的甲方账号。页面联调时由后端按同一版本准备持久隔离会话，不将已清理的测试库交给用户。

真实客服人员、正式隐私联系人与留存依据、真实外部服务均按原启用条件管理；本批没有部署或续期甲方网址。
