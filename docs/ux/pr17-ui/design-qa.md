# 第17份原图册与实际页面

固定原图册acd5f99的21张最终图，App暖白铜橙、网页浅色深绿。代理分别逐张查看原图，根任务查看实际首页、需求、接单、合作、佣金、规则及窄屏截图。标题与返回、摄影横幅、分组表单、两列独立审核、佣金金额/增减历史和三榜空态按图组织，原图未改。

|最终原图|实际路径|实际证据|
|---|---|---|
|APP-02-01|`/discover`|[实际截图](evidence/screenshots/pr17-app-discover-mobile.png)|
|APP-02-02|`/gigs/ranking?recordId=<id>`|[实际截图](evidence/screenshots/pr17-app-ranking-mobile.png)|
|APP-19-01-v2|`/cultivate`|[实际截图](evidence/screenshots/pr17-app-cultivate-shell-mobile.png)|
|APP-20-01-v2|`/gigs/request?gigId=<id>`|[实际截图](evidence/screenshots/pr17-app-catalogue-mobile.png)|
|APP-20-02-v2|`/gigs/requests/new`|[实际截图](evidence/screenshots/pr17-app-request-new-mobile.png)|
|APP-21-01-v3|`/gigs/offers/new?gigId=<id>`|[实际截图](evidence/screenshots/pr17-app-offer-new-mobile.png)|
|APP-21-02-v2|`/gigs/record?recordId=<id>`|[实际截图](evidence/screenshots/pr17-app-offer-confirm-mobile.png)|
|APP-22-01|`/mcn`|[实际截图](evidence/screenshots/pr17-app-mcn-mobile.png)|
|APP-22-02-v2|`/gigs/relations/new`|[实际截图](evidence/screenshots/pr17-app-relation-new-mobile.png)|
|WEB-19-01-v2|`/gigs/catalogue`|[实际截图](evidence/screenshots/pr17-web-catalogue-desktop.png)|
|WEB-19-02|`/gigs/requests/new`|[实际截图](evidence/screenshots/pr17-web-request-new-desktop.png)|
|WEB-19-03|`/gigs/reviews/requests/<id>`|[实际截图](evidence/screenshots/pr17-web-review-requests-desktop.png)|
|WEB-20-01|`/gigs/offers/new?gigId=<id>`|[实际截图](evidence/screenshots/pr17-web-offer-new-desktop.png)|
|WEB-20-02-v2|`/gigs/reviews/offers/<id>`|[实际截图](evidence/screenshots/pr17-web-review-offers-desktop.png)|
|WEB-20-03|`/gigs/offers/<id>`|[实际截图](evidence/screenshots/pr17-web-offer-confirm-desktop.png)|
|WEB-21-01-v2|`/gigs/relations/new`|[实际截图](evidence/screenshots/pr17-web-relation-new-desktop.png)|
|WEB-21-02|`/gigs/relations/<id>`|[实际截图](evidence/screenshots/pr17-web-relation-confirm-desktop.png)|
|WEB-21-03-v3|`/gigs/commissions/<id>`|[实际截图](evidence/screenshots/pr17-web-commission-desktop.png)|
|WEB-22-01|`/gigs/rules/new`|[实际截图](evidence/screenshots/pr17-web-rule-new-desktop.png)|
|WEB-22-02-v3|`/gigs/reviews/rules/<id>`|[实际截图](evidence/screenshots/pr17-web-review-rules-desktop.png)|
|WEB-22-03|`/gigs/rankings/<id>`|[实际截图](evidence/screenshots/pr17-web-ranking-desktop.png)|

日期与排他下拉曾合并辅助操作区域，已增加独立语义边界并重新验证真实点击。文件选择前结束旧编辑连接，避免最后输入值被清空；实际上传成功和取消均覆盖字段保留，视觉排版保持不变。

真实接口只返回编号时显示真实编号及必要中文说明；没有公开艺人头像、昵称或搜索目录，不能把设计示例填进业务数据。接单页使用本人商业脸声同意，证明实际上传并经本记录受控下载；每一项独立人工核验由操作者明确选择。网页规则和费率无默认业务值；App比例按百分数输入，接口转整数基点。

明确适配：网页保留完整24项共享导航，长编号与指纹可折叠，真实记录/财务事实/负计提增加页面高度；MCN只能读取自己获授权的历史佣金，原订单仅买卖双方读取；没有出款/税务接口的图册按钮禁用。App发现按原空态图保留可用入口，商单通知有真实接口，不能宣称全平台消息已开通。榜单目前真实数据不足，三榜无假艺人。

日期采用已有Flutter日期/时间选择器；当前浏览器弹窗的SDK按钮仍为英文，未新增本地化依赖。

App390/320宽子页没有底栏，五主栏目不消失；网页1440/390宽共享菜单和唯一高亮已实点，整页无横向溢出。新摄影横幅仅装饰，来源与提示见[素材说明](image-assets.md)，不用于人物或权利证明。表单下方完整字段、上传和确认通过实际操作验证；不宣称逐像素复制或原生真机验收。

[完整操作记录](ui-checks.md)另列接口、身份、未知请求和412。正式渠道、SDK、生成供应商、出款和生产榜单调度仍待验收。
