# 第11–14份页面：原图册样式验收

2026-09-30。用户要求所有页面参考原图册实现，本轮将当前已开发的 App 和管理网页统一修订。基准是 `ux/full-ui-design-20260929` 的 `acd5f99`，采用 manifest 指定的最终 v2/v4 图片；原图册未改动。图册共172个状态视图，包含后续阶段，本轮完成范围是当前第11–14份页面及其共用外壳。

[逐页对应](../gallery-page-map.md) · [实现标准](../gallery-implementation-standard.md) · [视觉参数](../gallery-visual-system.json) · [覆盖与逐图证据](evidence/style-coverage.json) · [原图编号与最终图片清单](evidence/style-inventory.json)

## 已按图册落实的结构

|页面组|本轮落实|代表实拍|
|---|---|---|
|App首页、入戏|自然摄影、三项平行入口、主副标题、图标与正文分栏、主价格和整行按钮|[首页](evidence/screenshots/style-app-home-390.png)、[目录](evidence/screenshots/style-app-catalog-390.png)|
|登录、我的、身份|顶部登录内容、外置字段标签、真实禁用状态、业务分组卡、身份资料独立成卡|[登录](evidence/screenshots/style-app-login-empty-390.png)、[我的](evidence/screenshots/style-app-my-390.png)、[身份](evidence/screenshots/style-app-account-identities-390.png)|
|作者、作品、版本|资料与审核状态分组，正文和证明分别上传，白色字段卡、虚线私有上传边界|[作品表单](evidence/screenshots/style-app-work-form-390.png)、[表单下半部](evidence/screenshots/style-app-work-form-lower-390.png)|
|许可、绑定、阅稿|金额及期限分组，权利逐项显示，技术编号次级展开，独立白色纯文本阅读区|[许可](evidence/screenshots/style-app-grant-390.png)、[受控正文](evidence/screenshots/style-app-reader-390.png)|
|网页工作台|64px顶栏、220px侧栏、32px主区留白、28px主标题、同一套12项导航|[许可凭证](evidence/screenshots/style-web-grant-1440.png)|
|账号、成员与邀请|能力表、左侧成员表与右侧邀请表单、收到邀请的表格、空表单灰置动作|[成员与邀请](evidence/screenshots/style-web-workspace-members-1440.png)|
|网页作品及商品表单|编号分组、140px横向标签、桌面两列、明确私有上传区域|[作品表单](evidence/screenshots/style-web-work-form-1440.png)、[商品表单](evidence/screenshots/style-web-product-form-1440.png)|
|许可与独立核验|许可摘要/范围/期限/额度四卡两列，核验材料与结论分开，不预勾审核|[许可四卡](evidence/screenshots/style-web-grant-1440.png)、[阅稿核验](evidence/screenshots/style-web-reading-review-1440.png)|
|合同与阅读|原合同、原规则和保存时状态独立呈现，完整编号可查看；正文按文字显示|[治理合同成功页](evidence/screenshots/style-web-contract-1440.png)、[带水印正文](evidence/screenshots/style-web-reader-1440.png)|

暖白 App 使用铜橙动作，管理网页使用浅底深绿动作。字号、间距、边框、圆角和图标统一到共用组件。首页与入戏的静态摄影素材用内置 image_gen 生成，[保存路径及完整提示词](image-assets.md)已登记；不合图册的立体纸雕试稿已从工程移除。页面标题、业务资料、价格与授权事实由真实接口和代码绘制。

## 实际检查和修复

最终只读渲染检查 App 29组、95张实拍，网页39组、183张实拍，均通过；43组实际页面族有图册映射和对应截图。278张PNG尺寸及哈希已核对。App每张截图均绑定实际网络加载的最终构建 `67b6568b562b533e3707a39833305b26aaaad6fb5d66a30288a6bbf2f8e67f87`。三方分工检查页面结构与关键布局锚点，根侧另亲看最终邀请、登录、首页/目录、作品表单、许可、合同和正文；未声称逐像素或全部业务状态完全复现。

当前最终浏览器报告见 [App](evidence/style-app-runtime.json) 和 [网页](evidence/style-web-runtime.json)。App检查390×844与320×693；网页检查1440×900、390×844与320×693。长页按真实滚动位置保存上下部，编号按正常操作展开，没有临时隐藏导航或向页面注入登录会话。覆盖清单记录各页的实际地址、图册编号、PNG尺寸和哈希；运行检查与目视图册核对分别记录。

修复了实际发现的320宽下拉框和机构表格溢出、字段标签移出输入框后缺少无障碍名称、首页提醒与“我的”设置入口、登录位置及空验证码按钮状态、身份角色读取字段错误。未知登录或邀请请求仍按原请求恢复，不因表单灰置而丢失恢复动作。最终邀请弹窗白底、12px圆角和灰置发送在390/320均已实拍核对，实际禁用断言通过：[320宽证据](evidence/screenshots/style-app-account-invite-dialog-empty-320.png)。

合同验收还纠正了测试记录混用：许可预留内嵌合同编号与“合同与规则”的治理快照编号属于不同接口。用原治理构造器在本机随机测试库保存合法、明确未签署的合成快照，然后由普通页面登录读取。[夹具证据](evidence/style-governance-fixture.json)只证明可信测试数据设置；正常受权读取由浏览器报告证明，不代表真实签署、付款或创建合同流程验收。

所有入口保持新版外壳。App顶层五项入口及子页返回正常，管理端12项菜单保持完整；读取错误、无权、空态、版本冲突与未知请求恢复使用共用组件。保留原接口、身份权限、幂等请求、版本核对和阅读清空逻辑，没有修改许可后端、迁移或第15–17份远端分支。

## 与图册的必要适配

- 当前账号与机构功能集中在同一路由内分区，机构邀请采用弹窗；沿用图册信息层级和控件，不为复制单张图拆出虚假业务。
- 买方网页目录没有独立WEB原图，采用APP-07内容层级与网页共用外壳。许可办理、发放、项目和绑定按当前真实接口分步；完整编号、原合同及额外权利字段允许使页面更长。
- 额度显示服务端条款与“本次读取的绑定”，没有根据一页列表推算剩余额度。只有当前有效授权才显示相应业务动作。
- 管理网页窄屏改为单列、表格在自身区域滚动，完整菜单占用顶部高度；重点证据来自正常滚动位置。图册没有独立窄屏管理版，不把此适配称作逐像素复刻。
- “我的项目”当前是许可用途项目记录；培育、成角及完整制作/发行等后续业务保留真实未开放状态，随后续阶段继续按原图册实现，不能冒充APP-26制作工作区已完成。

本轮验证使用合成资料和Flutter Web/Vue本机预览。收到邀请的待处理态当前无实际记录，未为截图制造邀请；本轮只读复拍未再次提交作品、审批、发放、暂停或付款。已有业务流程证据保留在[视觉修订前的功能记录](design-qa.md)，新界面结果不能替代原生真机、生产供应商或正式上线验收。

[测试日志与具体结果](ui-checks.md) · [预览与审查路径](README.md)
