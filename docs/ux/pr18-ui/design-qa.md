# 项目页面与原图逐页核对

固定原图册acd5f99最终25图。App暖白铜色、网页浅色深绿，使用同一套卡片、控件和导航；下表每页均有实际浏览器截图。截图全部合成隔离资料，未知请求/权限/确认条件由真实后台验证。

|原图|页面与路径|实际截图|
|---|---|---|
|APP-23-01|成角 · `/roles`|[实拍](evidence/screenshots/pr18-app-catalogue-mobile.png)|
|APP-24-01|项目与角色 · `/projects/role?roleId=`|[实拍](evidence/screenshots/pr18-app-role-mobile.png)|
|APP-25-01|申请角色 · `/projects/apply?roleId= ; /projects/invitation?candidateId=`|[实拍](evidence/screenshots/pr18-app-application-mobile.png)|
|APP-25-02|确认入组 · `/projects/apply?roleId= ; /projects/invitation?candidateId=`|[实拍](evidence/screenshots/pr18-app-candidate-confirm-mobile.png)|
|APP-26-01|我的项目 · `/my-projects ; /projects/project?projectId=`|[实拍](evidence/screenshots/pr18-app-my-projects-mobile.png)|
|APP-26-02|项目工作区 · `/my-projects ; /projects/project?projectId=`|[实拍](evidence/screenshots/pr18-app-blocked-project-mobile.png)|
|APP-27-01|确认当前方案 · `/projects/record?recordId=`|[实拍](evidence/screenshots/pr18-app-plan-mobile.png)|
|APP-28-01|发行进度 · `/projects/release/new?projectId= ; /projects/record?recordId= ; /projects/external/new?releaseId=`|[实拍](evidence/screenshots/pr18-app-release-ready-mobile.png)|
|APP-28-02|提交发行材料 · `/projects/release/new?projectId= ; /projects/record?recordId= ; /projects/external/new?releaseId=`|[实拍](evidence/screenshots/pr18-app-release-new-mobile.png)|
|APP-28-03|登记外部结果 · `/projects/release/new?projectId= ; /projects/record?recordId= ; /projects/external/new?releaseId=`|[实拍](evidence/screenshots/pr18-app-external-new-mobile.png)|
|WEB-23-01|项目与角色招募管理 · `/projects/projects ; /projects/projects/new ; /projects/projects/:id/roles`|[实拍](evidence/screenshots/pr18-web-projects-desktop.png)|
|WEB-23-02|建立项目与招募角色 · `/projects/projects ; /projects/projects/new ; /projects/projects/:id/roles`|[实拍](evidence/screenshots/pr18-web-create-desktop.png)|
|WEB-23-03|候选筛选与入选决定 · `/projects/projects ; /projects/projects/new ; /projects/projects/:id/roles`|[实拍](evidence/screenshots/pr18-web-candidate-select-desktop.png)|
|WEB-23-04|角色申请与本人主体确认 · `/projects/projects ; /projects/projects/new ; /projects/projects/:id/roles`|[实拍](evidence/screenshots/pr18-web-candidate-confirm-desktop.png)|
|WEB-24-01|提交项目方案与权利依据 · `/projects/projects/:id/plans/new ; /projects/plans/:id/confirm ; /projects/projects/:id/readiness ; /projects/reviews/plans/:id`|[实拍](evidence/screenshots/pr18-web-plan-new-desktop.png)|
|WEB-24-02|项目方案独立核验 · `/projects/projects/:id/plans/new ; /projects/plans/:id/confirm ; /projects/projects/:id/readiness ; /projects/reviews/plans/:id`|[实拍](evidence/screenshots/pr18-web-review-plans-desktop.png)|
|WEB-24-03|项目方案按顺序确认 · `/projects/projects/:id/plans/new ; /projects/plans/:id/confirm ; /projects/projects/:id/readiness ; /projects/reviews/plans/:id`|[实拍](evidence/screenshots/pr18-web-plan-sponsor-confirm-saved-desktop.png)|
|WEB-24-04|项目开工条件与启动 · `/projects/projects/:id/plans/new ; /projects/plans/:id/confirm ; /projects/projects/:id/readiness ; /projects/reviews/plans/:id`|[实拍](evidence/screenshots/pr18-web-readiness-desktop.png)|
|WEB-25-01|提交项目成片版本 · `/projects/projects/:id/editions/new ; /projects/editions/:id/confirm ; /projects/projects/:id/releases/new ; /projects/reviews/releases/:id`|[实拍](evidence/screenshots/pr18-web-edition-new-desktop.png)|
|WEB-25-02|成片与材料独立核验 · `/projects/projects/:id/editions/new ; /projects/editions/:id/confirm ; /projects/projects/:id/releases/new ; /projects/reviews/releases/:id`|[实拍](evidence/screenshots/pr18-web-review-editions-desktop.png)|
|WEB-25-03|项目成片与材料会签 · `/projects/projects/:id/editions/new ; /projects/editions/:id/confirm ; /projects/projects/:id/releases/new ; /projects/reviews/releases/:id`|[实拍](evidence/screenshots/pr18-web-edition-sponsor-confirm-saved-desktop.png)|
|WEB-25-04|登记发行申请 · `/projects/projects/:id/editions/new ; /projects/editions/:id/confirm ; /projects/projects/:id/releases/new ; /projects/reviews/releases/:id`|[实拍](evidence/screenshots/pr18-web-release-new-desktop.png)|
|WEB-26-01|登记发行渠道档案 · `/projects/channels/new ; /projects/channels/:id ; /projects/releases/:id/external`|[实拍](evidence/screenshots/pr18-web-channel-new-desktop.png)|
|WEB-26-02|发行事项独立审核 · `/projects/channels/new ; /projects/channels/:id ; /projects/releases/:id/external`|[实拍](evidence/screenshots/pr18-web-review-releases-desktop.png)|
|WEB-26-03|记录真实外部发行结果 · `/projects/channels/new ; /projects/channels/:id ; /projects/releases/:id/external`|[实拍](evidence/screenshots/pr18-web-external-new-desktop.png)|

有依据的适配：未核实名称和金额不补默认；公开目录只显示真实摘要、角色总名额，详情按当前身份读取；准确内容指纹可展开，六层权利分项核对；内部通过只显示可送出，外部结果待独立核验。复杂建立/核验在网页，App处理本人报名、邀请、入组与会签、补件与进度。App详情无底栏，顶层五tab稳定，网页统一25项菜单。320宽App、390宽网页和外部账号拒绝均有实拍。后续PR20将项目通知与留言临时占位接入真实对象流程。
