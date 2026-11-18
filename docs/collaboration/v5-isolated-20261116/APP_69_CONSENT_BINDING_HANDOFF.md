# 69 本次参与同意与当前范围绑定

基线96f7f621。只改cocreation_pages.dart；未测试/编译/格式化/业务请求。

- 新participationCastSignature以jsonEncode比较原输入person/avatar/supplyConsent/look/voice/artist consents/usage，仅读原字符串，不调用value()校验或写接口。chooser回调仅在这些值实际不同于本次渲染记录时撤销agreed，避免单纯加载同一人档案误清勾选。
- 增加/删除本人形象均撤销agreed；sharing仅实际bool变化时撤销。既有换人清材料和材料上传变化撤销同意继续保留。
- 成功重读并通过mounted/ticket之后、替换room/member之前，比对原与新participation_sha256以及本人member.object_version；join/member页依据变化撤销agreed并给出重新核对提示。首次读取没有旧依据不冒称变更。
- 未修改提交body/API、权限、旧记录展示、load流程或公共恢复。静态核CommunityPageState.retry原样直接api.write(op.body,version:op.version)，未读取agreed；本页enabled仍在recovery存在时停新操作。清UI勾选不篡改已提交未知请求，也不阻断其原body/key恢复。
- 后端repository.js:18/19使用本次cast/sharing/participation_sha256及agreed，updateMember重记confirmed_at；本修复仅防旧勾选附着到新范围。
- 补审确认communityField的onChanged为空，私人故事原来不会撤销勾选。本页仅此字段展开为等价Padding/TextField（同controller、enabled、maxLines、label），本地onChanged比较实际文字变化后撤销agreed。不改公共helper，材料已有撤销回调不重复。全站其他表单不在本批范围。
待同事验证：同真人切头像/造型/声音/授权、同值重复选择、增删形象、分享变化、重读同hash同version与变化情况、结果未知恢复、身份变更和旧记录读取。

