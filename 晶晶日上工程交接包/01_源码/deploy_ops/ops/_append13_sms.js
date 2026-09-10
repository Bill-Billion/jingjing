// 追加短信根因结论到档案13（UTF-8，仅追加不改原文）
const fs = require('fs');
const p = 'C:/Users/user/Doubao/chats/2026-08-24/new-chat-3/项目档案/13_V12.1后端缺陷修复与线上部署记录.md';
const block = `

---

## 附：2026-09-01 登录验证码"提示已发送但收不到"根因定位（SY:0500 运营商报备期）

### 现象
- App 输入 19913338881 点获取验证码，前端提示"验证码已发送"，手机收不到。
- 服务器日志 15:33/15:36/15:45/15:56/16:17 多次 \`sms_sent_ok\`，火山 SendSms 均同步返回 MessageID、无 RE:/VE: 错误码；PM2 error.log 为空。
- 火山控制台「短信测试」手动发送：发送状态=发送失败，**错误码 SY:0500 系统异常**（logid 20260901161235A301DCFF4084DED91D2F，计费条数 1）。

### 根因（官方错误码文档 volcengine.com/docs/6361/173291）
- SY:0500 第一条处置建议即：签名在火山平台审核通过后，还需提交**运营商报备，运营商审核通过后方可正常发送，通常 7-10 个工作日**；签名「万霖新媒体」2026-09-01 才在火山平台过审，尚在运营商报备期。
- SendSms 为**异步受理**：同步先回 MessageID（=平台已收单，故后端记 sent_ok、前端提示已发送），实际下发到运营商时因签名未完成报备而失败，终端收不到；控制台测试为同步呈现，直接暴露 SY:0500。两现象同源。

### 结论：非 App/后端/部署缺陷，无需改代码
- 资质、签名 ID、模板 S1T_1y2pbfeyk8cg2、消息组 8d0968fa、AK/SK、TemplateParam({code})、region 全部正确（错误会是 RE:0004/RE:0005/VE:0003，而非返回 MessageID）。
- PM2 jjsr 进程 13:41 启动，晚于 .env 回填时间 12:51，加载的是最新配置，排除"改 .env 未重启"。
- 服务器 channelStatus ready=true；.env：SMS_ENABLED=true / SMS_SIGN_NAME=万霖新媒体 / SMS_LOGIN_TEMPLATE_ID=S1T_1y2pbfeyk8cg2 / SMS_ACCOUNT=8d0968fa。

### 待办
1. 等运营商报备（约 7-10 个工作日，预计 2026-09-10 前后，以实际为准），完成后自动可发，无需改配置；可提火山工单催办/查进度。
2. 报备期若需联调 App 登录：非 production 可临时 SMS_ENABLED=false + 配 SMS_DEV_CODE 走固定测试码（仅入库不下发），报备通过后切回 true。
3. 定时任务 11641193436930 保留，持续探测，真实下发成功且手机收到后再补本记录并删任务。
4. SY:0500 为发送失败，原则上不计费，留意账单以成功条数为准。
`;
fs.appendFileSync(p, block, 'utf8');
console.log('appended, new size=', fs.statSync(p).size);
