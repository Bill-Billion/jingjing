# 30–32 实际主动作底栏 opt-in
## 当前共享能力只读核查
V5Frame 注册表只在 widget.footer==null 且 actionInFooter 候选恰好一个时采用该表单 _action；候选多个则全部保留原内联动作。V5Form _action 保留提交/恢复原请求、busy/completed/冲突确认判断；存在原 pending 时恢复优先，不以 canSubmit 拦掉恢复。共享文件本批未改。
## 页面最小改动
- notices_submission.dart：30 _invitationForm 与31 _submissionForm 加 actionInFooter:true、canSubmit:!busy。原真实字段、恢复、buildBody、beforeSubmit、授权筛选、私有附件、成功导航不变。PROFILE/ROLE/CREATE_DRAMA 三种投稿仍走同一真实表单并保留类型切换未提交内容确认。
- 30 正常仅一个来源显示一个邀约表单。若异常同时给 listingId/noticeId 导致两个既有表单同时出现，两者均注册候选，共享逻辑安全退回两个内联动作，未隐藏任何表单/待恢复。
- notices_pages.dart：32只在原接收方SENT且未过期的回应分支里添加opt-in；若记录也属当前owner可能出现撤回表单，则回应 actionInFooter=false，两动作维持内联。其他情况下仅回应是底栏候选，拒绝/感兴趣选择仍在原表单，由同一确认按钮提交原决定与版本。
- 其他页面既有显式footer不变；未把撤回、举报、收藏或其他动作删掉，不伪造草稿。
## 边界/待验证
32仍不是两个直接写入按钮，而是保留原两种决定选择+确认底栏，以保护版本与确认。没有从UI按钮直接调用接口，没有绕开dirty guard/幂等/恢复。
仅静态读取共享实现及三处参数增量，无测试、编译、analyzer、格式化、运行或视觉验收。
同事待测：唯一表单底栏注册与解除、忙碌禁用、pending恢复、输入离开确认；多表单安全回退；接收方/所有者重合、过期或身份切换、原版本冲突。不能据静态判断称已通过。
修改前已在仓库外备份。
