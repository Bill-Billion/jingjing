# 支付宝 APP 支付 · 沙箱联调步骤（V12.4 骨架配套）

> 目标：在不接正式商户的前提下，用支付宝「沙箱环境」跑通
> `创建支付(拿 orderString) → 沙箱钱包付款 → 异步 notify 验签入账 → status 查询` 全链路。
> 代码骨架：`services/alipay.js`、`routes/pay.js`、表 `payments`；开关/密钥全部走 `.env`。
> 铁律：**金额永远由服务端订单/config 决定（分），前端只传 orderNo/bizType(/stage)，不传金额。**

---

## 0. 前置
- Node v20，后端依赖已装（`alipay-sdk@4.x` 已在 package.json）。
- 支付宝开放平台账号，进入「控制台 → 沙箱」（沙箱应用、沙箱买家账号、沙箱版支付宝）。
- 本机启动后端：`npm run dev`（默认 3000）。

## 1. 生成 RSA2 密钥对（RSA2 = SHA256withRSA，2048 位）

### 方式 A：用仓库自带跨平台脚本（推荐，Windows 免装 openssl）
```bash
cd work/server/server
node scripts/gen_alipay_rsa_keypair.js ./certs
# 产物：
#   certs/app_private_pkcs8.pem  应用私钥(PKCS8)，只放服务器，绝不入库/入APP
#   certs/app_public.pem         应用公钥，贴到开放平台
#   终端还会打印单行应用公钥，方便直接粘到网页文本框
```

### 方式 B：openssl 命令（等价）
```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out app_private_pkcs8.pem
openssl rsa -in app_private_pkcs8.pem -pubout -out app_public.pem
```

## 2. 开放平台沙箱配置
1. 「沙箱 → 沙箱应用」拿到 **APPID（16 位数字）**、**沙箱网关**、**沙箱买家账号 + 登录密码 + 支付密码**。
2. 「接口加签方式」选 **公钥模式（自定义公钥/公钥证书二选一，本骨架两种都支持）**：
   - 公钥模式：把 `app_public.pem`（或终端打印的单行公钥）贴进去保存，平台回显 **支付宝公钥**，复制下来。
   - 证书模式：下载「应用公钥证书 / 支付宝公钥证书 / 支付宝根证书」三张证书，记录文件路径。
3. 沙箱网关地址：`https://openapi-sandbox.dl.alipaydev.com/gateway.do`（本骨架用 `ALIPAY_GATEWAY=sandbox` 自动指向它）。

## 3. 回填本地 `.env`（沙箱）
```ini
ALIPAY_ENABLED=true
ALIPAY_APP_ID=沙箱APPID
ALIPAY_PID=沙箱卖家(合作伙伴)2088开头账号         # 可选，seller_id
ALIPAY_GATEWAY=sandbox

# 公钥模式（二选一）：应用私钥 + 平台回传的支付宝公钥，支持内联或文件路径
ALIPAY_PRIVATE_KEY_PATH=./certs/app_private_pkcs8.pem
ALIPAY_PUBLIC_KEY=粘贴平台回显的支付宝公钥(单行/PEM均可)
# 若用证书模式，则改为三证书路径并留空公钥：
# ALIPAY_APP_CERT_PATH=./certs/appCertPublicKey.crt
# ALIPAY_ALIPAY_CERT_PATH=./certs/alipayCertPublicKey_RSA2.crt
# ALIPAY_ROOT_CERT_PATH=./certs/alipayRootCert.crt

# 异步通知地址：必须支付宝服务器能公网访问到（见第 6 步内网穿透）
ALIPAY_NOTIFY_URL=https://<你的穿透域名>/api/pay/alipay/notify
```
改完重启后端。自检（不打印任何密钥）：
```bash
node -e "const a=require('./services/alipay');console.log(a.status(),a.isConfigured())"
# 期望 configured:true, mode:'public'(或'cert'), sandbox:true
```

## 4. 前端/接口调用：创建支付拿 orderString
- `POST /api/pay/alipay/create`，带 `Authorization: Bearer <JWT>`，JSON body：
  - 祝福视频：`{"orderNo":"业务订单号","bizType":"video"}`
  - 品牌代言：`{"orderNo":"...","bizType":"endorsement"}`
  - 定制剧席位：`{"orderNo":"...","bizType":"dream"}`
  - 样片意向金/制作款：`{"orderNo":"...","bizType":"sample","stage":"intent"|"production"}`
- **不要传金额**。返回：
```json
{ "configured": true, "payMode": "alipay", "status": "pending",
  "payNo": "AP...", "orderString": "app_id=...&biz_content=...&sign=...",
  "amountFen": 9900, "amountYuan": "99.00" }
```
curl 示例：
```bash
curl -s -X POST http://127.0.0.1:3000/api/pay/alipay/create \
  -H "Authorization: Bearer <JWT>" -H "Content-Type: application/json" \
  -d '{"orderNo":"VVIDEO1","bizType":"video"}'
```

## 5. 用沙箱钱包完成支付
- Android APP：把 `orderString` 交给支付宝 APP 支付 SDK 的 `PayTask.payV2(orderString, true)`；
  手机安装**沙箱版支付宝**，用第 2 步的**沙箱买家账号**登录、用沙箱支付密码付款。
- 纯后端联调（无 APP）：也可先用沙箱页面/工具验证下单串能被沙箱识别；最终以 APP 真机 + 沙箱钱包为准。
- 支付成功后，支付宝服务器会主动 POST `ALIPAY_NOTIFY_URL`（即 `/api/pay/alipay/notify`），
  后端 **RSA2 验签 + app_id 校验 + 金额对账 + 幂等** 通过后：`payments` 置 `paid`、业务订单推进为已支付。

## 6. 异步 notify 内网穿透（本机联调必备）
支付宝服务器必须能从公网回调到你本机。项目已含 `localtunnel` 依赖，任选其一：
```bash
# 方式A：localtunnel（依赖自带）
npx localtunnel --port 3000 --subdomain jjsr-sandbox
#   得到 https://jjsr-sandbox.loca.lt → 回填 ALIPAY_NOTIFY_URL 后重启

# 方式B：ngrok
ngrok http 3000
```
> 通知是 `application/x-www-form-urlencoded`，本骨架用全局 urlencoded 解析，再 `checkNotifySign(body,true)` 验签。
> 若暂时没有公网回调，可用第 7 步的「主动查单」兜底；但正式上线必须保证 notify 公网可达（最终走 HTTPS 域名）。

## 7. 主动查单/对账（回调丢失时的兜底）
```bash
curl -s http://127.0.0.1:3000/api/pay/status/<业务订单号> -H "Authorization: Bearer <JWT>"
```
后端在已配置且本地为 pending 时，会调用 `alipay.trade.query` 主动对账一次（金额一致且成功则补入账，幂等）。

## 8. 沙箱验收清单
- [ ] 创建支付返回 orderString，解码 `biz_content.total_amount` 等于服务端金额（前端无法篡改）。
- [ ] body 里塞 `amount:0.01` 等伪造金额 → 400 被拒。
- [ ] 沙箱钱包付款成功 → 收到 notify 返回纯文本 `success`；业务订单变 paid、payments 回填 trade_no。
- [ ] 同一 notify 重放多次 → 始终 success 且业务只推进一次（幂等）。
- [ ] 伪造/坏签名 notify、金额不符 notify、app_id 不符 notify → 一律 `fail`，不入账。
- [ ] `GET /api/pay/status/:orderNo` 与实际一致。
- 本地一键回归（无需真实密钥，自签闭环，33 项断言）：`node scripts/verify_pay_skeleton.js`
- 沙箱联调全链路脚本（密钥生成脚本实测→sdkExecute 订单串独立验签→自签 notify→篡改/坏签名拒绝→trade.query 查单推进→并发双击→dream 防双加→真实沙箱网关负向探测，33 项断言，证据落 `scripts/pay_sandbox_joint_evidence.log`）：`node scripts/pay_sandbox_joint_test.js`
- 订单串已自动签入 `notify_url`（取自 `ALIPAY_NOTIFY_URL`），不再依赖开放平台后台默认回调地址；金额对账按数值比较，兼容 `99` 与 `99.00`，缺失/乱值一律 fail-closed。

## 9. 切正式环境
1. 换成正式「自研/开放平台应用」的 APPID、正式应用私钥与正式支付宝公钥（或正式三证书）；
2. `ALIPAY_GATEWAY=formal`、`ALIPAY_ENABLED=true`；
3. `ALIPAY_NOTIFY_URL` 改为 **https 域名** `/api/pay/alipay/notify`（HTTPS 切换见 `work/deploy/https/`）；
4. 经营收款合规：本平台为撮合分账，正式收款应走支付宝「直付通/分账」，资金不过平台自有账户（与 paymentService 合规注释一致）；
5. 小额（99 元）真机验单通过后再放量；密钥只存服务器 `.env`/certs，绝不进 APP/仓库/日志。
