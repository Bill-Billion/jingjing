# W14 Web 修订后通告的新投稿绑定

基线 18862fba。仅新增 useNoticeSubmissionContext.ts、接线 BusinessView.vue 与本文。修改前已在仓库外备份。未改后端、共享 useBusiness、OrganizationBatchPanel、App 或已冻结预览。

## 确证缺口与本批处理
原业务字段仅 rule_id/submission，后端 modules/notices/repository.js:18–23 对有 revision_id 的通告要求 notice_version/notice_sha256，因此原 Web 新投稿必然被拒绝。

现以用户所选合法 notice_id 读取公开 catalog/:id，校验原编号、接收方、规则、正版本、正文hash及正文；公开 rules 分页找到同一有效规则，展示完整正文、规则正文/版本及双方hash。两类请求均不发送 acting party。公开规则没有 object_version，不虚构规则记录版本。原 submission-options 人物授权目录及其绑定不变，公开正文不能替代授权。

专用确认默认未勾选。全部draft、操作开关/路由、账号、主体及会话代际变化清读取和确认；请求票据及上下文比较防旧响应回写。提交前重读通告和有效规则：版本/hash/规则/接收方变化则展示新内容、取消确认、不提交，要求重新阅读。原body仍由既有encode生成，追加冻结notice_version/notice_sha256后交原ui.execute。无notice_id主动投稿与独立邀约不走新增绑定。

回执以command.body而非当前表单核 SUBMISSION、主体/接收方/父通告、规则、人物/数字人/授权、意向正文/角色/材料及原notice_snapshot版本/hash；异常使用UNEXPECTED_RESPONSE_SHAPE保留原未知请求。

## 原请求恢复边界
恢复仍ui.execute(undefined)，原pending的path/body/key/version不变，不要求重新勾选新增确认，也不要求当前通告版本等于新提交快照。原命令携带notice_version时采用同一回执校验；旧无版本请求保持兼容。新提交门禁不用于阻断原幂等重放。

后端submit在C.command查重前仍核资格、原规则与当前通告；失效/过期可能阻止恢复。本批没有解决该服务器边界，恢复409不能证明原请求从未提交。共享层对确定错误的清理策略未改，不能承诺跨重启持久保留所有此类原请求。UI说明保留该限制。

## 同文件确认失效补正
原整draft watcher仅建房启用，其他普通操作勾选提交确认后编辑draft不会撤勾。本批扩为所有已选择operation的draft变化仅重置agreed。它不变更pending，不清原请求，不影响独立恢复按钮；适用于W22参演等当前Web新发起操作。

## 静态核对及待测
仅源码阅读、差异和hash；未测试、编译、格式化、业务调用或提交推送。
待同事固定版本验证：修订/未修订通告新投稿；正文/规则/身份/人物/授权变更重确认；读取期间切页；请求未知后原key恢复；回执绑定错误保留pending；无通告主动投稿和邀约回归；W22等确认后改draft撤勾、原恢复不受影响。均为待测，不记通过。
