# W12 人工样片与制作意见确认上下文

仅改 production/manual_sample_page.dart 与 production/production_pages.dart；ManualSampleApi在前一文件内，无其他API文件修改。修改前已在仓库外备份。无后端/共享恢复变化。

## 人工样片
- 恢复弹窗显示原pending版本/hash，明确其后是最新读取条款，不是原请求历史正文，不作新版确认。没有新增历史读取契约。
- 弹窗前冻结账号、epoch、主体、当前快照及pending指纹；返回后变化即停止并撤销reviewed。
- API冻结本次实际body/version及账号，保留session.write原key机制；validate核request（原ManualSample构造）、rights owner、原账号、confirmation.confirmed_sha256及原version+1。依据后端customization/manual-sample确认更新object_version+1后返回load原记录；幂等仍返回原命令结果。
- 不匹配经productionRequire抛uncertain响应错误，在session.write校验阶段拒绝，不作为成功清原请求。不是保证所有后端拒绝均可持久恢复。

## 制作版本意见
- 弹窗前冻结epoch、账号、主体、读取ticket、版本/项目raw、pending、checklist/changeKind及两个意见字段/决定指纹。
- 返回后核身份/记录/读取代际/原pending仍一致；新请求另核表单未变，然后用冻结checklist/changeKind发请求。变化则取消本次确认并提示重新核对。
- 原pending恢复不因最新表单内容不同而重建请求，仍走api.retry原path/body/version/key；此次只增加确认期间上下文校验。

## 静态与待测
仅静态源码/差异/hash核对；未功能测试、编译、analyzer、格式化、接口调用或提交推送。
待同事验证：弹窗期间身份/版本变化停止；checklist及changeKind改变需重确认；原样片pending恢复显示原版本/hash；错账号/hash/request/version回执保留未知请求；正常新确认及原key重复恢复。以上均未运行，不标通过。
