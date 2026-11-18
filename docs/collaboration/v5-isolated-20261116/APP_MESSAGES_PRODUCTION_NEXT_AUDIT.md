# 28–33 / 63–70 剩余推进清单（只读审计）
2026-11-16。依据当前源码、APP_MESSAGES_HANDOFF、APP_PRODUCTION_HANDOFF、APP_PROJECTS_HANDOFF及主103页映射。未访问锁定画布，未猜新设计，未改源码/运行测试。旧交接的未提交声明属历史，当前差异以Git为准。

## 路由与代码实际归属
以下文件均相对App lib。
- 28：试镜真实会话 /auditions/messages?bookingId=… → auditions/auditions_pages.dart 的 messages/_messageBody。映射CSV仅写 operations/comments、gigs/conversation，不完整；这两种是其他业务会话，不能据试镜完成宣称三者统一。其实现分别在 operations 与 gigs 模块。
- 29：/notices/records?kind=SUBMISSION → notices/notices_pages.dart records。
- 30：/notices/submit?kind=INVITATION&listingId=…；31：/notices/submit（noticeId或sourceId）→ notices_pages + notices_submission.dart。
- 32：/notices/record?recordId=… 的 SUBMISSION；33同一路由的 CASE，均 notices_pages.dart _recordBody。
- **映射纠偏：33的/support/ticket是support/tickets.dart通用反馈工单，不是本批撮合CASE的真实路由。不能借通用反馈补撮合客服功能。**
- 63：/production/services → production/production_service_page.dart。
- 64：/customization/new → customization/customization_page.dart；/cocreation?view=new → cocreation/cocreation_pages.dart，两个真实流程不等于一屏双模式。
- 65：/projects/list、/my-projects → projects/project_pages.dart；/projects/participation为独立参演约定。
- 66：/production/project?projectId=… → production/production_pages.dart _ProjectDetailState。
- 67：/production/version?versionId=…与/production/feedback?versionId=… → 同文件 _VersionReviewState，feedbackOnly区分；/production/work是独立交付许可页面，不应合并验收与下载权限。
- 68：/cocreation?view=room；69：同页view=join/member及/projects/participation，属于不同授权记录。
- 70：/customization及/customization/request → 真实定制草稿/需求，不是通用个人手记。

## 已落地而非待重做
28气泡、真实时间/已读与OPEN权限；29紧凑记录；30/31真实附件和授权恢复；32接收方未过期SENT回复与真实notice_id链接；33真实case状态及关联原单。
63服务介绍及真实双底栏；64/70业务草稿真实保存/提交恢复；65分来源导航和项目行；66真实任务/版本与底栏；67当前版/历史入口和反馈表单；68人数与开工条件；69本人参演范围与真实确认。
这些均是局部实现，无整页验收证明。

## 可只靠现成源码推进（无需新后端，仍须下一批明确范围）
1. 修正文档28/33真实路由映射；将试镜、商单、平台留言逐项列出，不再混称一套会话完成。当前仅本审计记录纠偏，未修改主CSV。
2. 67把已存在contentCard(v)、feedbackForm(v,p)、同version_id过滤history的区域改成显式分区或局部选项卡；当前版校验、read/stale/恢复、版本绑定必须保持。现行“版本历史与修改记录”是回项目入口，不是真正页内三tab。不能宣称有新服务能力。
3. 32/33可把已加载SUBMISSION/CASE事实与原状态卡排成更紧凑的摘要，不需虚构服务阶段。准确颜色/间距/吸底次序需解锁后核原稿，数据层无需新接口。
4. 63、66及70可整理既有区块顺序与真实来源入口，不必重做表单；但70仅业务草稿，不能顺带实现个人手记存储。
5. 65继续优化现有分来源入口及分页提示可源码完成；“我发起/我参与”全域筛选不在此范围。

## 后端/产品契约缺口（不能以局部UI替代）
- NoticesApi.records当前签名只有kind/cursor，查询只有kind/limit/cursor：29方向tab可以最多做明确标注“当前已加载记录”的本地视图，不能称全量方向筛选/统计。
- 30/31没有新增保存草稿契约；真实头像需获准字段/资产，不拿设计图填充。现成附件上传不是草稿保存。
- 33当前CASE读取/原关联记录不等于补充材料或实时客服；缺相应写接口时不添可提交按钮。
- 65跨制作/参演/共创统一聚合和分类总量未证实；不得拼首屏计数。
- 68授权封面、可公开全员名单及分享待办聚合未证实；保留原定向邀请和本人记录。
- 69当前参与条款不能派生完整财务分配或外部签署；缺字段不补比例。
- 64个人/共创一屏模式涉及原故事先提交再开房的流程差异；不得仅换开关绕过先决条件。
- 70个人手记、通用协作分享、参考媒体通用关联不是现有定制草稿契约。

## 需解锁重读画布 / 运行后验证
旧交接证明以上分组曾读；并非本次重新读图。可按旧明确结构小步推进，但三tab具体内容/排布、消息各业务底栏动作分布、63–70尺寸/留白/封面位置，应重读原稿后再称新校准。任何页面完成、窄屏、媒体、权限撤销、请求恢复与业务闭环均需同事验证；本审计没有测试结论。
