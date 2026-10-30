# 同一个故事从上传到首次共创：组合版本检查

2026-10-29，后端负责人 chengcongcong222 接续前端负责人 Bill-Billion 的0db4d3aa交接。业务代码使用已上传7882a986，包含前端0db4d3aa；接口0.31.4-rc.1、数据库0167。两项后端修复已在该提交提供，本次新增的是串联检查和证据，没有重写两项功能，也没有修改前端页面。

## 结论与范围

同一个故事从草稿、上传恢复、保存重开、提交、补件私稿、正式重提、历史保留到首次建房邀请，9步实际HTTP检查通过；身份切换检查另在同一步内覆盖10次拒绝访问。故事模块连同新检查共74项通过，0失败、0跳过。PR39当前7882a986的7项远端检查已全部通过；原前端0db4d3aa有9项是另一提交的结果，不能混算。

本次从真实本机接口访问隔离MySQL，存储使用合成文件和故障注入。上传连接在文件写入后主动中断，再用原请求恢复，确认不重复写文件。不是手机断网实测，也不是重新点击App和Vue；已有页面证据仍来自前端交接，后续新提示接入后需再做页面组合检查。新检查已加入故事模块运行清单，下一次自动检查会包含它。

## 同一组记录与逐步结果

[完整编号及预期/实际结果](../../testing/evidence/story-room-journey-20261029/journey.json)。所有编号来自本次同一临时库，结束后已清理，不能当成甲方测试站可查的业务记录。规则、机构、人物、文件均为合成资料，没有调用真实OSS或收费服务。

|检查|预期|实际|
|---|---|---|
|新建私人故事|创建草稿，运营列表和详情均不可见|通过；{"story_id": "b57c5686-f815-4e1d-92a6-659ddd7589c5", "status": "DRAFT", "operator_visible": false}|
|预留成功但文件未写入，恢复原请求|暂时读不到存储时不盲写；恢复后同一记录变为可用，额度不重复占用|通过；{"asset_id": "9747a46d-8d79-4466-90d7-a2e071ddd564", "status": "READY", "record_count": 1, "successful_writes": 1}|
|保存、返回列表、重新打开|同一草稿和附件可恢复，运营仍不可读|通过；{"story_id": "b57c5686-f815-4e1d-92a6-659ddd7589c5", "restored_asset_id": "9747a46d-8d79-4466-90d7-a2e071ddd564", "operator_download": 404}|
|正式提交及运营下载|运营只能在正式提交后读取，下载内容逐字节一致|通过；{"status": "SUBMITTED", "asset_id": "9747a46d-8d79-4466-90d7-a2e071ddd564", "sha256": "95cc1e6347cccbb74ec015b8aac4457142d31b389e1a10747099e886e647aa18", "bytes_equal": true}|
|运营要求补件，上传时断开请求后恢复|原请求恢复同一新附件，不重复写入|通过；{"asset_id": "5498bd07-eb91-4f9e-a978-98706817a118", "status": "READY", "repeated_write": false, "http_request_aborted_after_storage_write": true}|
|换文件但仅保存私稿|本人重开可见新文件；运营仍只有旧文件，无法下载新文件|通过；{"private_draft_asset": "5498bd07-eb91-4f9e-a978-98706817a118", "operator_visible_assets": ["9747a46d-8d79-4466-90d7-a2e071ddd564"], "new_download": 404}|
|正式重提及历史附件保留|当前版本引用新文件，旧版本仍引用旧文件，两者显示正式版本保留原因，旧文件不可撤回|通过；{"current_asset_id": "5498bd07-eb91-4f9e-a978-98706817a118", "historical_asset_id": "9747a46d-8d79-4466-90d7-a2e071ddd564", "retention_reason": "FORMAL_SUBMISSION", "revoke": {"status": 409, "code": "CUSTOMIZATION_ATTACHMENT_RETENTION_REQUIRED"}}|
|首次建房、邀请和人数进度|同一故事无报价、无待补件，选择实际可用承制方和已审核规则建房，邀请合成人物；重复建房被拒绝|通过；{"room_id": "bf0dd310-75d3-4e61-8a75-64aed72b9dbe", "invitation_id": "c83ec56c-6d63-4895-a30d-948fd1c3b5b5", "counts": {"joined_count": 0, "eligible_count": 0, "minimum_people": 10, "benefit_people": 20, "people_remaining": 10, "benefit_remaining": 20, "payment_confirmed": false}, "duplicate": "COCREATION_ROOM_EXISTS"}|
|切换机构身份及其他账号隔离|同一账号切到自己的机构不能读取个人故事；其他账号也不能读取故事、附件、历史或房间|通过；{"denied_requests": 10, "switched_back_story_id": "b57c5686-f815-4e1d-92a6-659ddd7589c5"}|

## 分工与下一步

- 后端负责人 chengcongcong222：两项修复已上传；本次同记录证据本地保存，随下一阶段交付集中同步。继续补作品封面、实际时长、缩略处理，再公开机构与搜索、个人中心；同时继续原18组的完整链检查。
- 前端负责人 Bill-Billion：原上传/补件/建房不需重写。需接受附件可选 `retention_reason` 并主动请求 `include_retention=true`，让首次打开即可提示历史正式附件不能撤回。新字段未接页面不能说已完成用户提示。艺人主肖像/媒体类型接入仍按[前端任务](../../collaboration/client-complete-20261028/FRONTEND_MEDIA_HANDOFF.md)继续，由用户转达，尚未收到这三个新增接线的确认。
- 本次没有把第15组整体标完：参与者授权、报价、主订单、制作到个人片段仍需串联；18组/151条也未批量改成通过。PR39仍为草稿，未合入共同版本，未更新甲方网站。

## 验证与复现

在后端目录设置既有本机隔离 `JX_MYSQL_TEST_ENV_FILE` 后运行 `node scripts/test-mysql.js customization`，只连接127.0.0.1:33316测试实例，创建随机临时库，结束删除该库；也可单跑 `node --test test/story-room-journey.integration.test.cjs`。测试报告生成在本工作树 `.local/story-room-journey.json`。不应传生产配置。

[74项日志](../../testing/evidence/story-room-journey-20261029/customization.log) · [当前7项远端成功结果](../../testing/evidence/story-room-journey-20261029/remote-checks.json)。初次新测试误用历史详情字段层级，改为实际接口的 `submission.answers` 后通过；这是测试脚本修正，不是放宽权限或改变产品规则。此前949通过/1缺样本跳过是7882a986实现的整体回归证据，本次未重复跑整套，更不能把9步算成9个新功能。
