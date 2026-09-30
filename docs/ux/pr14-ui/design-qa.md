# 第14份界面与图册验收

> 本页原截图与结论记录第14份功能交付阶段。用户随后要求逐页修正图册样式，新增对齐范围见[全页面视觉标准](../gallery-implementation-standard.md)及[逐页映射](../gallery-page-map.md)；新的实拍和结论见[第11–14份样式验收](style-qa.md)，不能将下方旧截图冒充修正后的页面。

继续采用已确认图册 `acd5f99`，本批固定方案为 [page-plan.md](page-plan.md) 和 [页面字段](page-plan.json)。真实业务资料、合同和价格取自接口，设计示例中的人名、金额、时间、封面不能当作产品默认值。截图使用明确标识的合成资料。

## 对应页面

|图册页面|本批实现与截图|核对重点|
|---|---|---|
|APP-07|[入戏目录](evidence/screenshots/pr14-app-catalog-mobile.png)|暖白底、铜橙动作、分区故事提示、短试读与明确价格；底部五入口一致|
|APP-08|[剧本详情](evidence/screenshots/pr14-app-product-mobile.png)、[实际预留](evidence/screenshots/pr14-app-reservation-mobile.png)|总价和生效前应付分开，范围和期限用完整文字；预留后仍等待条件核验|
|APP-16|[已获许可](evidence/screenshots/pr14-app-grant-mobile.png)|当前许可、历史合同和真实范围，保存时状态与外部材料核验分别说明|
|APP-17|[绑定](evidence/screenshots/pr14-app-binding-mobile.png)|绑定记录及用途项目、实际额度、只在有效改稿权下显示可用入口|
|APP-09|[阅稿授权](evidence/screenshots/pr14-app-reading-mobile.png)、[受控正文](evidence/screenshots/pr14-app-reader-mobile.png)|指定人和截止可核对；纯文本带真实水印，阅稿不授生成或制作|
|WEB-09-01/03|[新商品](evidence/screenshots/pr14-web-product-form-desktop.png)、[商品详情](evidence/screenshots/pr14-web-product-desktop.png)|浅色绿工作台；主动填写商业条件，核验意见与私有证据分开|
|WEB-10|[预留](evidence/screenshots/pr14-web-reservation-desktop.png)、[独立核验](evidence/screenshots/pr14-web-independent-review-desktop.png)、[证据提交](evidence/screenshots/pr14-web-evidence-submitted.png)|材料和结论分组，审核勾选默认空，实际外部事实核对后单独发放|
|WEB-11|[许可](evidence/screenshots/pr14-web-license-desktop.png)、[项目绑定](evidence/screenshots/pr14-web-project-binding-desktop.png)|历史原约定折叠可读，真实期限与额度，绑定后改稿来源和项目保持只读|
|WEB-12|[受控阅读](evidence/screenshots/pr14-web-controlled-reader-desktop.png)、[手机正文](evidence/screenshots/pr14-web-reader-focused-mobile.png)|只显示实际水印文字，不执行HTML、不提供原稿下载绕过授权|

本批不接图册里的完整制作订单、服务条件写入、数字人同意、商业报价或发行流程；这些在对应后续批次完成。项目改稿沿用已实现供给页面和独立双审，没有把作品许可自动当作作者或权利人证明。

## 布局和视觉

- App 实测390×844。暖白背景、白色卡片、铜橙主操作和标准Material图标与既有页面一致；中文标题、长许可名称与UUID可换行。详情使用返回式子页，顶层五入口完整。没有接口依据的艺术家封面或头像。
- 网页实测1440宽与390宽。桌面约220px共享导航，表单及核验用清晰卡片和双列；小屏变为单列，菜单分两列并保持同一完整集合。长编号缩略显示，完整请求编号不被缩略。
- 主字段使用中文说明，价格显示精确CNY元金额，范围、日期、用途和次数实际呈现；网页原始合同约定折叠，完整规则文本仍可查看，保存值不改写。状态由文字与颜色一起表达，禁用操作可辨。
- Reader是独立纯文本阅读区域，保留原水印内容，不转换成HTML。正文允许正常滚动，定时重新核验不反复清空重载造成跳读；失焦或到期时清空有明确提示。

## 发现与纠正

金额整数分、历史未签署状态、App CORS读失败提示、文件权限边界、深链接返回及未知写入离页保护均已修复并针对验证，详见 [操作记录](ui-checks.md)。

截图验收另发现旧网页手机全文截图出现重复栅格，实际DOM只有一份导航和页头。手机证据已改为实际390×844视口，正常滚动到字段或全文后另拍重点；没有为截图临时隐藏菜单或修改样式。不能只用“无横向溢出”断言替代视觉检查。

实际资料使页面比设计示例更长，保留完整条款、私有材料回执和真实审核依据，允许滚动。网页手机顶部完整菜单占用一定高度，正文重点截图从实际滚动位置取得。原生真机、大字体及完整屏幕阅读器流程另行验收；这里不冒充真机或生产体验检查。

[App实际流程与8张截图](evidence/app-runtime.json) · [网页实际流程](evidence/web-runtime.json) · [项目改稿](evidence/web-adaptation-runtime.json) · [原请求恢复导航](evidence/web-pending-navigation-runtime.json) · [最终视口截图](evidence/web-final-screenshots-runtime.json) · [本批交付](README.md)。
