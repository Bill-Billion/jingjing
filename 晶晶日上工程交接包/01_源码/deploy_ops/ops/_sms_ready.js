// 只读：确认服务器短信通道本地配置就绪度（不发送、不打印密钥）
const sms = require('/opt/jjsr/services/smsService');
console.log('CHANNEL_STATUS=', JSON.stringify(sms.channelStatus()));
process.exit(0);
