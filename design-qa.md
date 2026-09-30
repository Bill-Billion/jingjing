# 作者与作品页面：图册与实际界面验收

2026-09-29开工，2026-09-30完成最终复查。本批采用暖白App、浅色深绿工作台，接第13份真实接口。逐页打开图册和浏览器实际截图，每组把原图及实现放在同一次图像输入中比较；未用构建成功代替界面验收。

final result: passed

## 对照依据、尺寸和状态

原图为已选图册提交`acd5f99`，本机目录`/Users/yanghaoran/Code/jingjing-ui-design/design/full-ui-20260929/images/`；完整来源和字段见[页面依据](docs/ux/pr13-ui/page-plan.json)。实施范围见[页面方案](docs/ux/pr13-ui/page-plan.md)。

App-36-01/02/03/04原图分别为851×1847、852×1846、853×1844、852×1846。实现为真实Flutter Web同源390×844内容框，完整截图1418×892包含外侧灰色舞台；比较时只取App内容区域，把原图宽度归一到390。网页原图1586×992（WEB-08-01为1585×992），实现桌面1418×756，前期部分为1418×812；按对应布局宽度比较，较矮视口通过滚动检查下方内容。图像密度不同，未把整张浏览器截图当逐像素同尺寸对照。

网页390×844响应检查实测`innerWidth=390`、根宽度390，无横向溢出；临时视口已恢复。App没有仿制状态栏或手机壳。

|原图|实际截图|状态与比较结果|
|---|---|---|
|APP-36-01-v2|[首次申请](docs/ux/pr13-ui/evidence/app-profile-first.jpg)、[补正表单](docs/ux/pr13-ui/evidence/app-profile-form.jpg)|最终空申请显示真实个人身份；名称、介绍、证明未填，提交禁用；补正保留原资料|
|APP-36-02-v2|[申请与作品](docs/ux/pr13-ui/evidence/app-works.jpg)|图册待审示例，实现为已批准资格及多版本；对照列表层级、状态、投稿入口，不将数据不同判成视觉问题|
|APP-36-03-v2|[原作](docs/ux/pr13-ui/evidence/app-new-work.jpg)、[缺项提示](docs/ux/pr13-ui/evidence/app-new-work-required.jpg)、[新修订](docs/ux/pr13-ui/evidence/app-work-revision-form.jpg)|空权利人行可见，缺项保存禁用；上一稿只读，新正文有真实上传回执。最后身份条与申请共用组件，个人/机构有页面断言|
|APP-36-04|[版本资料](docs/ux/pr13-ui/evidence/app-work-withdrawn.jpg)、[双轨意见](docs/ux/pr13-ui/evidence/app-work-detail.jpg)|原图草稿，截图为真实撤回/补正；只对照详情分组、稿件和独立审核，不把撤回截图当草稿。草稿→提交→撤回见操作记录|
|WEB-05-01-v2|[空申请](docs/ux/pr13-ui/evidence/web-profile-first.jpg)、[补正](docs/ux/pr13-ui/evidence/web-profile-form.jpg)、[小屏](docs/ux/pr13-ui/evidence/web-mobile-profile-fields.jpg)|当前身份、必填字段、私有证明与缺项禁用可辨，小屏可滚动|
|WEB-05-02|[审核队列](docs/ux/pr13-ui/evidence/web-profile-queue.jpg)|实际队列保留已核对历史，真实状态、无虚构总数或搜索|
|WEB-05-03|[待审详情](docs/ux/pr13-ui/evidence/web-profile-review.jpg)、[新批准](docs/ux/pr13-ui/evidence/web-profile-approved.jpg)|资料/材料与结论双列；新批准保留原补正理由|
|WEB-07-01-v2|[作品列表](docs/ux/pr13-ui/evidence/web-works.jpg)|多版本真实列表，通过查看进入详情；状态未冒充上架或许可|
|WEB-07-02-v4|[原作表单](docs/ux/pr13-ui/evidence/web-work-form.jpg)、[填写后](docs/ux/pr13-ui/evidence/web-work-form-complete.jpg)|正文/证明桌面双列、关系独立举证、文件控件44px，只开放原作|
|WEB-08-01-v2|[权属审核](docs/ux/pr13-ui/evidence/web-rights-review.jpg)|权利人和证明优先，本轨结论独立，缺理由禁用|
|WEB-08-02|[内容审核](docs/ux/pr13-ui/evidence/web-content-review.jpg)|最终正文提前，首次视口可找到下载当前正文，结论独立|

## 发现、修复和复拍

1. **P2，网页原生文件按钮偏小、单列布局与初始空关系不明显**：改44px控件、桌面双列和默认空关系行；[初版](docs/ux/pr13-ui/evidence/web-work-form-first.jpg)及最终原作/填写后截图与WEB-07-02-v4对照通过。
2. **P2，写后历史同一记录仍显示旧状态**：成功后的真实GET统一替换详情、列表和历史中的同一ID，保留其他修订；实际申请补正、双审和撤回复查，添加回归。
3. **P2，App空表单仍可保存、必填权利人未展开**：初始空权利人、完整必填判断与具体缺项提示；[初版](docs/ux/pr13-ui/evidence/app-new-work-first.jpg)及最终原作/缺项截图重新对照APP-36-03-v2，保存禁用。
4. **P2，网页长编号挤占版面、内容审核正文过晚**：只读编号缩略，title及辅助标签保留全文，请求用原UUID；CONTENT正文移到资料卡后，RIGHTS顺序保留。最终两轨截图重新对照WEB-08，正文与权利人可找到；18组供给检查包含实际组件顺序及完整编号断言。
5. **P2，App首次申请缺当前身份**：申请、原作、新修订表单补真实个人/机构身份条，无选择器、不代填权利人。最终构建正常登录09104，机构MEMBER切换个人OWNER后复拍空申请，与APP-36-01-v2比较通过。

没有剩余可操作的P0/P1/P2。

## 必查视觉与可用性

- **文字**：中文系统字体；网页实测PingFang SC/微软雅黑/system-ui回退，主标题28px/700/40.6px行高。App章节18px/700、次级元信息12px，长意见正常换行。按归一后的原图层级比较，申请、材料、结论清晰分组。
- **布局**：App390宽、16px边距、暖白底白卡；网页约220px导航、主区留白、12px圆角，审核双列。实际接口的多行权利关系与元信息使页面更长，保留滚动而不隐藏必填；桌面文件双列在小屏变单列。
- **颜色**：App`#F7F5F0`/`#B45D3D`，网页`#F5F6F2`/`#335D46`。状态同时有文字，禁用、失败、选中清楚，不靠颜色表达授权结果。
- **图像与图标**：原图无业务照片/插画，采用标准Material与现有网页图标；未生成头像、封面或版权徽章。截图里的浏览器助手头像、开发工具属于浏览器环境。
- **文案**：真实标题、意见、修订替代设计示例；8 MiB和格式来自接口，参与方主动填写。申请通过、草稿、双审、补正、撤回各自表述，不出现假商业成功。
- **交互**：正常键盘表单、必填禁用、提交确认、撤回理由、登录返回、403清空、503提示和MEMBER拒绝均有真实页面/针对性测试证据，范围见[操作记录](docs/ux/pr13-ui/ui-checks.md)。

焦点区域另查原作底部缺项、审核表格/表单、App双轨长意见、小屏字段；细字与操作可读，不只凭全景缩略图判断。浏览器控制台有扩展“Receiving end does not exist”连接噪声，未据此宣称零日志；预期接口403/503按失败路径验收。

## 接口适配及后续

接受的业务适配：网页列表通过查看进入详情；App作者工作区同时列申请与作品；实际材料回执、多行证据、修订和旧意见完整展示；审核按账号真实授权，没有可自选审批角色。作品详情状态按真实数据变化，未为接近示例而改写测试库状态。

P3可继续细化标准表单字重、留白和详情元信息密度。原生真机、大字体/屏幕阅读器完整流程、正式短信与持久存储未验收；浏览器发起保存不等于取消系统面板后仍已落盘。数字人、本人同意、许可和选本属于后续页面。

实施检查：本批页面与字段已接入；P2已修复复查；截图、日志、README已保存；上传、合并及正式服务单独办理。[交付记录](docs/tasks/records/UX-PR13-SUPPLY-PAGES-20260929.md) · [第一批PR12报告](docs/ux/pr12-ui/design-qa.md)。
