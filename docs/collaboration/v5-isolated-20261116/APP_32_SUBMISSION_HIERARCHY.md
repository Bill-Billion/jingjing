# 32 投稿详情：真实 App 层级去重

## 依据与范围
依据此前清晰目视的 V5 32 原画布（file iycd9D7RrESCJ9c6GbLOMo，node 4016:8638）：状态题头、人物摘要、投稿说明与关联通告、进度、审阅提示及回应动作的层级。本批仅调整 notices_pages.dart 的 _recordBody 中 SUBMISSION 显示，不以独立预览代替真实数据。

## 实际改动
- 保留页首真实状态标题，移除第二个概括性投稿进度大标题；实际 r.title 作为次级标题保留。
- SUBMISSION 不再显示人物摘要前的通用重复状态卡；NOTICE/CASE 继续原显示分支。
- 查看关联通告移动到投稿说明之后，原非空条件与路由完整保留。
- 真实 _nextStep、version、expired 提示和独立审核 review.reason 合并在材料之后、审阅提示之前的当前办理进度卡。
- 不虚构人物名称、头像、阶段完成事实。原缺少人物信息说明保留。

## 静态检查
逐段阅读与改前副本的 diff。原授权历史、新版确认、私有材料读取、回应表单的 SENT/接收方/expired 条件、actionInFooter 条件、canSubmit、version/reload、客服工单、匹配试镜及后续撤回分支均未改；接口、请求体、恢复记录和权限不变。未改共享表单、预览、矩阵或其他业务页面。

## 验证边界
仅原图结构依据与源码静态检查，不是 Flutter 渲染验收。未运行功能测试、编译、analyzer、格式化或浏览器；未提交推送。待同事核对不同状态/身份的显示、长文本与大字布局，以及原回应/撤回及恢复流程。

## 冻结
文件：lib/notices/notices_pages.dart，主要调整范围 984–1076。
SHA-256：`f76634990a7a849c8b9c8463bad247d2113fbc4c568ee768fdb8fcbdfd0fd12d`
