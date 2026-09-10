# 供应商适配层（Provider）契约

统一收口支付 / 短信 / AI（LLM·TTS·视觉）/ 存储 / 内容机审 / 告警六类上游。
**铁律**：凭证只从 `.env`→`config` 读取，不硬编码、不进前端/日志/仓库；缺凭证显式降级或禁用，绝不"假装已接通"。
统一就绪度查询：`require('../services/providers').providerStatus()`（后台 `GET /api/admin/providers/status`）。

## 1. 存储 StorageProvider（services/storage）
- `put({key, body:Buffer, contentType?, isPrivate?}) → {key,url}`
- `getBuffer(key) → Buffer`；`signedUrl(key,expiresSec) → url`；`publicUrl(key)`；`remove(key)`
- local（默认，=历史本地 uploads，行为不变）；oss（`OSS_ENABLED=true` 且四要素齐全，否则降级 local 并告警一次）。

## 2. 内容机审 ModerationProvider（services/providers/moderation.js）
- `moderateText/Image/Video(input) → {decision:'pass'|'reject'|'review', score, reason, provider, needsHuman}`
- 云机审（阿里云/腾讯）未接入：文本走本地敏感词；图片/视频本地无法判定→`review` 转人工。

## 3. 支付 PaymentProvider（services/paymentService.js）
- `createPayment / verifyCallback / refund / profitSharing`；通道：Mock（仅非生产）、微信电商收付通、支付宝直付通（后两者为生产骨架，未配置即抛错，生产禁用 Mock，防二清/伪造回调）。
- 退款严格状态机：`processing→success|rejected`，区分 full/partial，幂等键防重复出款。

## 4. 短信 SmsProvider（services/smsService.js）
- `sendLoginCode(phone,purpose,ip)` / `verifyCode(phone,input,purpose)` / `channelStatus()`
- 火山 SMS 未配置时：非生产可用 `SMS_DEV_CODE` 兜底；生产未就绪直接拒绝并告警。

## 5. AI Provider（services/volc.js、volcVisual.js）
- 方舟 Bearer Key：LLM 文案、TTS、声音复刻、Seedream 文生图、Seedance 异步视频；缺 `ARK_API_KEY` 即抛"未配置"。
- 异步视频：创建→轮询/供应商 webhook（HMAC 验签 + 幂等 + CAS 互斥）→交付物版本化→（开关）审核。

## 6. 告警 AlertProvider（services/alert.js）
- `emit(type,payload,{severity})`：永远落结构化日志；配置 `ALERT_WEBHOOK_URL` 才外发（钉钉/飞书/企微机器人），5 分钟同类去重，外发失败不影响业务。

## 替换/新增供应商
新增同类供应商时实现上述接口形状，在 `services/providers/index.js` 注册并补 `providerStatus` 就绪位；业务侧只依赖接口，不直接散连 SDK。
