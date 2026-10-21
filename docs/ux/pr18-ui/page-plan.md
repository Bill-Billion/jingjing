# 项目选角、会签与发行页面方案

按固定原图册acd5f99的25张最终图实现，App暖白铜橙、网页浅色深绿。本批以PR16前端与原PR18后端0a51e9e为基础，原PR17前端在下一阶段整合；不改旧图册。

成角首页保留五个底部tab；角色、报名、邀请、项目、会签和发行详情使用返回。公开发现只展示接口允许公开的项目摘要、角色和用途；容量是总容量，不推算剩余人数，不添加搜索、热度、人物封面或报价默认值。

报名、筛选与本人入组是三个不同决定。公开使用本人数字人另有FACE和VOICE同意，旧PRIVATE制作不能直接发行。网页建立角色、六层权利方案、费用来源和确认职责，并办理独立核验；App阅读准确版本、确认本人职责及查看工作区。方案与成片核验完成后仍须逐方确认；确认成功必须重新读取确认记录核对本人、内容指纹与决定。

开工只显示真实AVAILABLE或BLOCKED以及当前一项阻碍。发行可送出不代表渠道已发布，实际外部结果另有凭据和独立核验。补件或拒绝保留旧记录，以prior_release_id新建申请。普通参与方不能读取全部私有权利证据或发行档案。

所有写入保留原操作编号、原正文、身份、目标和版本。结果不明先核对，恢复仍用原请求；412需重读并重新确认。身份或权限变化清除私有数据与待写入，忽略旧响应；有游标的空页可继续加载。

|原图|页面|计划路径|
|---|---|---|
|APP-23-01（APP-23-01-v2）|成角|`/roles`|
|APP-24-01（APP-24-01）|项目与角色|`/projects/role?roleId=`|
|APP-25-01（APP-25-01）|申请角色|`/projects/apply?roleId= ; /projects/invitation?candidateId=`|
|APP-25-02（APP-25-02）|确认入组|`/projects/apply?roleId= ; /projects/invitation?candidateId=`|
|APP-26-01（APP-26-01-v2）|我的项目|`/my-projects ; /projects/project?projectId=`|
|APP-26-02（APP-26-02-v2）|项目工作区|`/my-projects ; /projects/project?projectId=`|
|APP-27-01（APP-27-01-v2）|确认当前方案|`/projects/record?recordId=`|
|APP-28-01（APP-28-01）|发行进度|`/projects/release/new?projectId= ; /projects/record?recordId= ; /projects/external/new?releaseId=`|
|APP-28-02（APP-28-02）|提交发行材料|`/projects/release/new?projectId= ; /projects/record?recordId= ; /projects/external/new?releaseId=`|
|APP-28-03（APP-28-03）|登记外部结果|`/projects/release/new?projectId= ; /projects/record?recordId= ; /projects/external/new?releaseId=`|
|WEB-23-01（WEB-23-01-v2）|项目与角色招募管理|`/projects/projects ; /projects/projects/new ; /projects/projects/:id/roles`|
|WEB-23-02（WEB-23-02）|建立项目与招募角色|`/projects/projects ; /projects/projects/new ; /projects/projects/:id/roles`|
|WEB-23-03（WEB-23-03-v2）|候选筛选与入选决定|`/projects/projects ; /projects/projects/new ; /projects/projects/:id/roles`|
|WEB-23-04（WEB-23-04-v3）|角色申请与本人主体确认|`/projects/projects ; /projects/projects/new ; /projects/projects/:id/roles`|
|WEB-24-01（WEB-24-01）|提交项目方案与权利依据|`/projects/projects/:id/plans/new ; /projects/plans/:id/confirm ; /projects/projects/:id/readiness ; /projects/reviews/plans/:id`|
|WEB-24-02（WEB-24-02-v2）|项目方案独立核验|`/projects/projects/:id/plans/new ; /projects/plans/:id/confirm ; /projects/projects/:id/readiness ; /projects/reviews/plans/:id`|
|WEB-24-03（WEB-24-03-v2）|项目方案按顺序确认|`/projects/projects/:id/plans/new ; /projects/plans/:id/confirm ; /projects/projects/:id/readiness ; /projects/reviews/plans/:id`|
|WEB-24-04（WEB-24-04-v2）|项目开工条件与启动|`/projects/projects/:id/plans/new ; /projects/plans/:id/confirm ; /projects/projects/:id/readiness ; /projects/reviews/plans/:id`|
|WEB-25-01（WEB-25-01）|提交项目成片版本|`/projects/projects/:id/editions/new ; /projects/editions/:id/confirm ; /projects/projects/:id/releases/new ; /projects/reviews/releases/:id`|
|WEB-25-02（WEB-25-02-v2）|成片与材料独立核验|`/projects/projects/:id/editions/new ; /projects/editions/:id/confirm ; /projects/projects/:id/releases/new ; /projects/reviews/releases/:id`|
|WEB-25-03（WEB-25-03-v2）|项目成片与材料会签|`/projects/projects/:id/editions/new ; /projects/editions/:id/confirm ; /projects/projects/:id/releases/new ; /projects/reviews/releases/:id`|
|WEB-25-04（WEB-25-04-v2）|登记发行申请|`/projects/projects/:id/editions/new ; /projects/editions/:id/confirm ; /projects/projects/:id/releases/new ; /projects/reviews/releases/:id`|
|WEB-26-01（WEB-26-01）|登记发行渠道档案|`/projects/channels/new ; /projects/channels/:id ; /projects/releases/:id/external`|
|WEB-26-02（WEB-26-02-v2）|发行事项独立审核|`/projects/channels/new ; /projects/channels/:id ; /projects/releases/:id/external`|
|WEB-26-03（WEB-26-03-v2）|记录真实外部发行结果|`/projects/channels/new ; /projects/channels/:id ; /projects/releases/:id/external`|

原图文件摘要见[映射](gallery-map.json)。实际路由、截图与检查待实现后填写，不将计划当作验收结果。
