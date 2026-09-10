const fs = require('fs');
const f = 'C:\\Users\\user\\Doubao\\chats\\2026-08-24\\new-chat-3\\项目档案\\17_V12.4支付宝APP支付沙箱联调与自审热修记录.md';
let old = fs.readFileSync(f, 'utf8');
const nl = old.includes('\r\n') ? '\r\n' : '\n';
const add = `
---

## 十、V12.4.2 真实沙箱凭证联调 + SDK 驼峰归一热修（2026-09-01）

### 10.1 背景
老板已在支付宝开放平台取齐真实材料（值只存本机 \`work/server/server/secrets/alipay/\`，不入仓库/聊天/日志）：
- 正式网页/移动应用 APPID、PID（2088 开头）、RSA2 公钥模式加签（应用公钥已上传，平台回显支付宝公钥，本机私钥与之成对、crypto 校验 match）。
- 沙箱：沙箱 APPID、沙箱卖家 PID、沙箱买家（登录/支付密码，用于真机沙箱钱包）、系统默认密钥三段（应用公钥/应用私钥/支付宝公钥），沙箱网关 openapi-sandbox.dl.alipaydev.com。

### 10.2 新增：真实沙箱网关联调脚本
\`scripts/pay_sandbox_real.js\`（9 项断言，密钥从 secrets 文件读、进程内注入 env，**不改本地 .env、不碰线上**；0.01 元测试单创建后立即 trade.close，不发生付款）：
- R1 service 装配（enabled/configured/公钥模式/sandbox/APPID/PID）且 status() 不泄漏密钥；
- R2 离线 APP 订单串经沙箱应用公钥独立验签通过，金额 0.01、product_code、seller_id=沙箱卖家；
- R3 真实 trade.query 不存在单返回业务码 40004 / ACQ.TRADE_NOT_EXIST（证明 APPID 有效、应用私钥签名被沙箱接受，而非签名错误）；R3b validateSign:true 不抛错（沙箱支付宝公钥正确、响应验签通过）；
- R4 真实 trade.create 返回 10000 并生成真实 tradeNo；R4b 经 service.queryTrade 读到 trade_status=WAIT_BUYER_PAY；R4c trade.close 关闭、沙箱无残留挂单。
- 结果：**9/9 全绿，连续复跑 2 次稳定**，证据 \`scripts/pay_sandbox_real_evidence.log\`。

### 10.3 真实联调抓出并修复 1 个离线桩掩盖的真实缺陷（关键）
- 现象：alipay-sdk **v4 把网关响应字段转成驼峰**（tradeStatus/tradeNo/totalAmount/subCode…），而异步 notify 表单是下划线。原 \`queryTrade/refund\` 直接回传 SDK 响应，\`routes/pay.js\` 主动查单补入账却读 \`q.trade_status/q.total_amount/q.trade_no\`（下划线）→ 全部 undefined → **一旦异步 notify 丢失，前端轮询 /status 永远无法把已付款订单补置为 paid**。离线测试用下划线桩造数据，故此前 33+33 全绿也没暴露。
- 修法（service 层内聚归一，路由层口径不变）：\`services/alipay.js\` 新增 \`snakeAlias()\`，给 SDK 响应“补齐”下划线别名（保留驼峰原值、不覆盖已有下划线键、平级对象、数组透传）；\`queryTrade/refund\` 返回前统一归一。异步 notify 是原始下划线表单，不受影响。
- 三轮自审：①全局排查仅此一处 SDK 响应消费点；②snakeAlias 边界（驼峰转换/下划线不覆盖/错误响应 fail-closed）走读；③真实沙箱二次复跑稳定 + 本地 .env 未被进程内注入污染（仍 ENABLED=false、APP_ID 空）。

### 10.4 上线 SOP（零回归）
- 备份线上：\`/opt/jjsr/backups/alipay.js.before_snake_20260901_133931\`；SFTP 上传 \`services/alipay.js\`（12862 B）；线上 \`node --check\` 通过；本地=线上 MD5 \`e9a8eedd5e7aac3a8bce176eed5c3f7b\`。
- \`pm2 restart jjsr\`（↺=10）后 online、health ok v10.1.0、error.log 0 字节、\`pm2 save\`。
- 回归全绿：服务器本机 API **58/58**（测试数据零残留）、支付骨架 **33/33**、离线联调 **33/33**；本机走公网 Nginx **17/17** + 支付专项 **7/7**。线上仍 \`ALIPAY_ENABLED=false\` 演示降级（未配置密钥，修复为惰性、零行为变化）。沙箱测试密钥与脚本只留本机，未上服务器。

### 10.5 仍缺（不阻塞）
1. 真机沙箱钱包付款闭环：用沙箱买家账号登录**沙箱版支付宝**，APP 内走「下单→唤起沙箱付款→notify 入账→status 查单」（服务端真实沙箱网关部分本节已证明通）。
2. 正式收款：APP 支付产品签约/进件通过、HTTPS 域名回调后，把正式 APPID/PID/本机正式私钥+支付宝公钥写入服务器 .env、GATEWAY=formal、ENABLED=true、重启并小额真机验单。
3. 开放平台补填安卓包名与签名指纹（可从 release APK 取）。

- 版本：package.json 仍 10.1.0；内部标记 V12.4 骨架 + V12.4.1 自审热修 + **V12.4.2 真实沙箱联调/驼峰归一一轮热修**。
`;
fs.writeFileSync(f, old.replace(/\s*$/, '') + nl + add, 'utf8');
console.log('appended, new bytes=', Buffer.byteLength(fs.readFileSync(f), 'utf8'));
