# 原图和本批实拍

App暖白铜色、管理网页浅色深绿，固定原图 `acd5f99`；示例金额、人物和状态不作为默认业务依据。五tab和40项共同菜单已实际逐项检查。

|最终原图|实际页面|实拍|
|---|---|---|
|APP-32-01|业务通知列表与单条详情|[通知](evidence/screenshots/pr20-app-notifications-mobile.png) · [详情](evidence/screenshots/pr20-app-notification-detail-mobile.png)|
|APP-32-02|项目及准确对象留言|[项目](evidence/screenshots/pr20-app-commentproject-comments-mobile.png) · [版本](evidence/screenshots/pr20-app-scriptversion-comments-mobile.png)|
|WEB-32-01|我的通知与单条详情|[通知](evidence/screenshots/pr20-web-notifications-desktop.png)|
|WEB-32-02-v2|订单、制作项目、版本和选角项目留言|[版本](evidence/screenshots/pr20-web-webSCRIPTVersion-comments-desktop.png)|
|WEB-32-03|独立留言管理|[禁止自行隐藏](evidence/screenshots/pr20-web-moderation-self-denied-desktop.png)|
|WEB-32-04|获授权操作历史|[筛选历史](evidence/screenshots/pr20-web-audit-filtered-desktop.png)|
|WEB-33-01|报表申请|[申请](evidence/screenshots/pr20-web-queuedCASH-request-desktop.png)|
|WEB-33-02|等待、阻止、重试、结果与下载|[等待](evidence/screenshots/pr20-web-queuedCASH-pending-desktop.png) · [制作情况](evidence/screenshots/pr20-web-workload-result-csv-desktop.png)|

复用APP-14-01-v2和WEB-02-01的原业务入口；修复网页版本留言入口误落在新建项目表单的问题。网页390宽[留言](evidence/screenshots/pr20-web-comments-390-narrow.png)和[报表](evidence/screenshots/pr20-web-report-390-narrow.png)无横向溢出。App旧实拍发现发送按钮文字竖排，已修为单行；原9组行为证据保留其真实旧构建指纹，最终PR21相同App源码构建补验390/320布局。

修复后相同App源码的最终实拍：[390宽发送按钮](evidence/screenshots/pr20-app-composer-fixed-390-mobile.png) · [320宽发送按钮](evidence/screenshots/pr20-app-composer-fixed-320-mobile.png)。两处按钮均76×40、文字单行；[独立构建绑定](evidence/composer-layout-verification.json)明确来自PR21 API3382只读验证，不冒称PR20 API3362旧九组重新运行。
