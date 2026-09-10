# iOS 上架遗留清单（后端已就绪项 / 客户端待办 / 外部依赖）

## 一、后端本次已补齐
1. **Apple IAP 服务端校验**
   - `services/providers/appleIap.js`：向 Apple `verifyReceipt` 校验，21007 自动回退沙盒，校验 BundleId；缺 `APPLE_IAP_SHARED_SECRET` 直接拒绝，不伪造成功。
   - `POST /api/payment/apple/verify`：客户端 StoreKit 支付后提交 receiptData，服务端校验→按 transactionId 幂等→写支付流水→推进订单。
   - `paymentService` 注册 `apple_iap` 通道（Apple 已代收，平台分账 no-op，不构成二清）。
2. **账号注销** `DELETE /api/auth/account`：有在途订单/资金则 409；否则软注销并脱敏 PII，保留资金台账（满足 5.1.1(v) App 内注销）。
3. **AI 生成标识/版本/审核**：交付物版本化、`deliverable_status`、人工审核接口（见 18 记录 D 节），便于在成片上叠加"AI 生成"水印（视频已强制 watermark）。

## 二、iOS 客户端（Flutter）待办
1. **支付分流（3.1.1 硬性）**：数字商品（祝福视频、数字人定制、定制剧席位、样片）在 iOS 端**只能走 IAP**，隐藏微信/支付宝；实物/线下服务（如有）才可走第三方支付。
   - 在 App Store Connect 建内购商品，productId 与后端价格档一一对应；下单后调 StoreKit 购买，把 receiptData 传 `/api/payment/apple/verify`。
2. **Privacy Manifest（PrivacyInfo.xcprivacy）**：按采集类型声明
   - 手机号（用于登录/联系）、用户内容（上传照片/视频用于生成）、IDFV、崩溃日志；
   - 第三方 SDK（火山方舟/语音、支付宝/微信——iOS 数字商品不含支付 SDK 时相应移除）逐一补其 required reason API 声明。
3. **Info.plist 使用描述**：NSCameraUsageDescription、NSPhotoLibraryUsageDescription、NSMicrophoneUsageDescription（声音复刻/上传照片开口视频需要），文案说明用途。
4. **ATT / IDFA**：未投放跨 App 广告追踪则不申请 IDFA、不弹 ATT；若用 IDFA 需 Info.plist NSUserTrackingUsageDescription 并在审核说明。
5. **AI 合规展示**：成片显著位置"AI 生成"标识；数字人/真人授权材料在审核备注给出；提供内容举报入口（后端 reports 已具备）。
6. **注销入口**：我的→设置→注销账号，调用 DELETE /api/auth/account，按 409 文案引导先结算。
7. **登录方式**：iOS 需提供 Sign in with Apple（后端 `/api/auth/apple` 已具备），若同时提供第三方登录则 Apple 登录必须并列。

## 三、外部依赖（不阻塞 Android 交付，iOS 提审前需备齐）
- Apple Developer 公司开发者账号、App 内购协议（付费 App 协议/税务/银行）生效；
- `APPLE_IAP_SHARED_SECRET`、`APPLE_BUNDLE_ID` 写入服务器 `.env`（不入库）；
- 算法备案号/深度合成标识（AI 视频/数字人合规，属主体资质）；
- 真人肖像授权素材（数字人/照片开口）。

## 四、安卓侧说明
安卓不受 3.1.1 限制，继续微信/支付宝（持牌直连/电商收付通就绪前，生产支付通道仍为外部依赖，见档案17）。
