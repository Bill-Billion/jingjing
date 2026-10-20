# 这批功能怎样准备启用

这份说明用于测试和审阅，不是上线批准。本轮没有读取生产库、发送短信、调用收费内容审核或发布公网服务。

## 个人信息实际处理

规则由原有规则审核系统发布，不能直接用测试脚本的synthetic规则上线。

1. privacy.execution：列出允许的actions、正式basis和contact_reference；涉及文件删除/注销须提供retention_rule_id及backup_strategy=REAPPLY_ERASURE_REGISTER_BEFORE_ACCESS。
2. privacy.retention：按资料类别写保留依据和复查期限。正式材料仍缺，登记EXT-PRIVACY-20261020。不要把“有订单”扩成一律保留全部资料。
3. 工作人员按PRIVACY_HANDLE处理、另一人按PRIVACY_REVIEW复核。账号本人最终确认更正、删除或注销；工作人员只能处理经复核的投诉限制。
4. 删除后台开关PRIVACY_WORKER_ENABLED；私有OSS配置和服务验证记录必须匹配。桶迁移或凭证更换后旧任务不能直接在新位置执行。

当前对象删除先读同一对象核对摘要，再删除并确认不可读。404必须是明确NoSuchKey；AccessDenied、超时或内容不一致不能当已删除。OSS开启版本控制时，删除当前对象可能只形成删除标记，历史版本并未据此消失：[OSS DeleteObject说明](https://help.aliyun.com/en/oss/developer-reference/deleteobject)。本轮没有提供真实桶历史版本永久清理或备份轮换任务。

## 旧备份恢复

现有restore工具仍只允许隔离测试库。恢复结果始终保持QUARANTINED，复制来的旧放行记录不能替代本次核对。

- 使用scripts/release-tools.cjs privacy-register，从恢复前最新库生成清理登记。该文件含私有对象引用，放入受限本地目录，不能提交Git。
- 恢复旧库后运行privacy-replay，显式提供登记文件摘要、reviewer-ref及latest-register-confirmed=true。
- 重放停止被删除文件的访问、关闭此前已注销的账号并撤销会话；新库仍不自动开放。未重放的恢复库不能通过恢复保护。
- 重放是防止旧库重新开放资料，不能证明实际OSS历史版本/离线备份字节已经销毁。生产恢复方式和备份到期清理由授权运维另验。

## 文件处理与机审

后台开关MEDIA_WORKER_ENABLED。本地转码配置MEDIA_FFMPEG、MEDIA_FFPROBE、MEDIA_FONT_FILE都为绝对路径，MEDIA_PROCESSOR_REVISION用于登记此次工具配置。必须先准备可用字体及经维护的FFmpeg版本；进程只读本地协议，限制输入大小、时长、输出大小与运行时间，临时目录在退出后清理。

已审核media.processing规则中，media_processing包含ai_label、preview_label、require_marking、require_moderation、provider_code。不得对不适用AI标识的视频误标，正式范围先审核。规则启用后，现货与制作提交必须拿到对应文件、规则及预览/正式类型的处理凭据；人工勾选不能替代缺少的文件凭据。

候选机审采用已安装的阿里云SDK。仅在MEDIA_MODERATION_ENABLED=true、MODERATION_ENVIRONMENT、MODERATION_REGION、MODERATION_ACCESS_KEY_ID、MODERATION_ACCESS_KEY_SECRET以及所需MODERATION_TEXT_SERVICE/IMAGE_SERVICE/VIDEO_SERVICE齐备，且ModerationProvider / aliyun-green / file_review有同配置的服务验证记录时允许调用。密钥放受限配置，不写文档或Git。图片/视频另需OSS授权与匹配地域，不能为机审把私有文件改成公开。

参考：[文本请求范围](https://help.aliyun.com/en/document_detail/434034.html)、[图片私有OSS接法](https://help.aliyun.com/en/document_detail/467829.html)、[视频提交与结果查询](https://help.aliyun.com/en/document_detail/2505810.html)。本轮未对真实产品调用收费接口，不能据SDK存在宣布开通。视频提交成功只说明已受理，原任务查询得到完整判定后才记录；未知提交不自动重发。

后台任务失败会保留BLOCKED和原因。恢复删除任务可由授权运维用原任务编号核对后重试；视频若已取得供应商任务号，只查询原号。转码在上传后中断须先核对具体产物，当前没有面向普通用户的“忽略错误继续”入口。

## 仍须补充

甲方：正式隐私联系人/投诉渠道、分类保留依据、机审产品与地域及第三方条款、AI标识适用规则。队友：对应页面、手机权限和SDK同意时序。部署方：日志保留、OSS版本和备份轮换的实际配置及演练。本侧继续跟踪，不将这些项写成通过。
