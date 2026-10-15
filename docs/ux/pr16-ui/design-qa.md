# 第16份原图册与真实页面

固定原图册acd5f99，15张最终图；App暖白铜橙、网页浅色深绿。页面标题、返回导航、分组表单、版本内容、两列独立审查及客户决定按原图组织，原图未改。

|最终视图|真实路径|实际证据|
|---|---|---|
|APP-14-01|`/trade/record?recordId=<orderId>`|[订单回归](evidence/pr15-regression-results.json)|
|APP-15-01|`/production/version?versionId=<versionId>`|[实际截图](evidence/screenshots/pr16-app-script-before-mobile.png)|
|APP-15-02|`/production/version?versionId=<versionId>`|[实际截图](evidence/screenshots/pr16-app-sample-preview-mobile.png)|
|APP-15-03|`/production/feedback?versionId=<versionId>`|[实际截图](evidence/screenshots/pr16-app-feedback-form-mobile.png)|
|APP-18-01|`/production/works`|[实际截图](evidence/screenshots/pr16-app-works-mobile.png)|
|APP-18-02|`/production/work?projectId=<projectId>`|[实际截图](evidence/screenshots/pr16-app-private-work-mobile.png)|
|WEB-16-01|`/production/projects`|[实际截图](evidence/screenshots/pr16-web-projects-desktop.png)|
|WEB-16-02|`/production/projects/new`|[实际截图](evidence/screenshots/pr16-web-create-desktop.png)|
|WEB-16-03|`/production/projects/{id}/assignment`|[实际截图](evidence/screenshots/pr16-web-assignment-desktop.png)|
|WEB-17-01|`/production/projects/{id}`|[实际截图](evidence/screenshots/pr16-web-project-files-desktop.png)|
|WEB-17-02|`/production/reviews/projects/{id}`|[实际截图](evidence/screenshots/pr16-web-review-projects-desktop.png)|
|WEB-17-03|`/production/projects/{id}/generation`|[实际截图](evidence/screenshots/pr16-web-generation-disabled-desktop.png)|
|WEB-18-01|`/production/projects/{id}/versions`|[实际截图](evidence/screenshots/pr16-web-version-submit-desktop.png)|
|WEB-18-02|`/production/reviews/versions/{id}`|[实际截图](evidence/screenshots/pr16-web-review-versions-sample-desktop.png)|
|WEB-18-03|`/production/versions/{id}`|[实际截图](evidence/screenshots/pr16-web-customer-final-desktop.png)|

图册示例的人名、头像、时间、金额、封面、视频和审核成功不填入真实资料。实际记录只有编号时保留短编号；没有已授权预览先显示播放控件，通过受控接口后才展示内容。订单原条款默认折叠，长字段和必要证据按接口实际值增加高度；不宣称逐像素复制。APP14复用PR15订单结构，仅扩展真实制作与付款节点。

生成页如实显示未启用；单独原任务恢复页是同工作台适配，不冒充供应商已开通。审核画面保持原素材左、决定右，窄屏改一列；共用完整菜单保持一致。App390/320宽详情无底栏，五顶层栏目保留；网页1440/390宽无整页横向溢出。根任务亲自查看最终剧本、样片、意见、作品、私有成片、撤回、320宽以及网页建单、负责人、材料、独立核验、客户验收、实际任务和窄屏截图。

接口状态、指纹、未知请求与权限的检查见[实际记录](ui-checks.md)。手机浏览器检查不等于原生iPhone验收，合成片的内容标识不代表真实供应商水印服务通过。
