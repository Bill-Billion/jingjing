# 24 · 正式域名 HTTPS 部署上线记录（jingjingrishang.com）

> 日期：2026-09-02。范围：域名解析核对 → Let's Encrypt 双域证书 → Nginx 443 → 后端回调/CORS 切 HTTPS → 前端默认 Base 切域名并重出 release 包 → Node 绑回环 → 主机防火墙收口 3000。全程先备份、可回滚，未改任何商业逻辑/价格/密钥。

## 0. 域名纠偏（最重要，避免再错）

- **正式域名 = `jingjingrishang.com`（"晶晶日上"拼音，日上=rishang）**；统一访问/接口入口 **`https://www.jingjingrishang.com`**，主域 `https://jingjingrishang.com` 同时可用。
- 旧代码/旧预案里的 `jingjingshangri.com`、`api.jingjingshangri.com`（把"日上"拼成 shangri）**全球 NXDOMAIN，不存在，已废弃，禁止再用**。
- 解析（火山云 DNS，ns1/ns2.volcengine-dns.com）：`@` 与 `www` 的 A 记录均 = 8.222.213.43；用 223.5.5.5 / 8.8.8.8 / 1.1.1.1 三公共 DNS 复核一致、已全球生效。
- 服务器为阿里云轻量**新加坡 ap-southeast-1**节点（海外，**免 ICP 备案**）。

## 1. 证书（已签发并公网可信）

- 签发方 Let's Encrypt（issuer CN=R3 链 YE2），certbot 2.9.0，webroot 方式，**双 SAN**：jingjingrishang.com + www.jingjingrishang.com。
- 路径：`/etc/letsencrypt/live/www.jingjingrishang.com/{cert,chain,fullchain,privkey}.pem`；notAfter **2026-12-01**。
- `certbot.timer` 已 enable --now；续期部署钩子 `/etc/letsencrypt/renewal-hooks/deploy/nginx-reload.sh`（`nginx -t && systemctl reload nginx`）；`certbot renew --dry-run` 已成功。
- 关键坑：服务器 **nginx 1.24.0 不支持独立 `http2 on;`（需 1.25+）**，必须用旧语法 `listen 443 ssl http2 default_server;`，否则 `nginx -t` 报 `unknown directive "http2"`。

## 2. Nginx（站点 /etc/nginx/sites-available/jjsr）

- 80：仅放行 `/.well-known/acme-challenge/`（续期用），其余 **301 跳 https**。
- 443：ssl http2；反代 `127.0.0.1:3000`；`/uploads/` alias `/opt/jjsr/uploads/`；下发 HSTS（max-age=31536000; includeSubDomains）、X-Content-Type-Options、X-Frame-Options:DENY、Referrer-Policy、gzip；隐藏 Server 版本。
- 渲染模板（本地留存）：`work/deploy/https/nginx_dual.conf.template`（`__PRIMARY__/__ROOT__` 占位）。
- **回滚锚点**：切换前站点备份在 `/etc/nginx/sites-available/jjsr.httpbak`（另有 default.httpbak）。回滚：`cp` 覆盖回 jjsr → `nginx -t && systemctl reload nginx`。
- 服务器本机 `curl https` 报 exit 60 是其本地 CA 链问题（公网可信、不影响业务），本机巡检统一加 `-k`。

## 3. 后端切换（/opt/jjsr/.env，先备份；密钥一律未动、不回显）

| 键 | 新值 |
|---|---|
| WX_NOTIFY_URL | `https://www.jingjingrishang.com/api/payment/wx/notify` |
| ALIPAY_NOTIFY_URL | `https://www.jingjingrishang.com/api/pay/alipay/notify` |
| CORS_ORIGIN | `http://localhost:8080,http://localhost:3000,https://www.jingjingrishang.com`（localhost 保留调试） |

- **回调路径以真实路由为准**（已公网探测非 404）：支付宝走 `routes/pay.js` 挂 `/api/pay`（带完整 RSA2 验签/幂等/金额校验），微信走 `routes/payment.js` 挂 `/api/payment`。
- 上传走相对前缀 `/uploads`，前端按当前 serverUrl 自动补全，后端无需拼绝对地址。
- **踩坑（CRLF）**：`.env` 原文件是 CRLF；用 sed 在 CORS 行尾追加会把 `\r` 挤到行内，导致 dotenv 只解析出 2 项、正式域丢失（带正式 Origin 请求 403）。修复=删除该行用 `printf` 重建为干净 LF 行；并在本地 `config.js` 的 CORS 解析加 `.map(trim).filter(Boolean)` 防御（下次部署带上）。
- 每次改动后 `pm2 restart jjsr && pm2 save`，进程 v13.0.0 在线。
- 本地 `work/server/server/config.js` 同步修正了对外默认值：wx/alipay notifyUrl 默认域名改为 www.jingjingrishang.com（支付宝默认路径也纠正为 /api/pay/alipay/notify）、DSO 邮箱占位改 dpo@jingjingrishang.com；**未改** JWT issuer、数据库名等内部标识（那些不是域名，不能动）。

## 4. 前端（Flutter，只换默认地址，功能/路由/状态机一律未动）

- `lib/services/api_service.dart`：`baseUrl='https://www.jingjingrishang.com'`，`defaultUrl=baseUrl`（默认走正式 HTTPS）；保留 emulatorUrl/lanUrl/tailscaleUrl/publicUrl(`http://8.222.213.43`) 作为应急/调试回退点；init 仍优先读本地 prefs 自定义地址。
- 设置页"服务器地址"：hint 改正式域名，快捷项新增「正式域名」chip，原公网入口改名「公网IP」，Tailscale/局域网/模拟器保留。
- `android/app/src/main/res/xml/network_security_config.xml`：明文白名单仍仅 8.222.213.43、10.0.2.2（回退/模拟器用），base-config 禁明文并信任系统 CA；正式 HTTPS 域走系统信任链（Let's Encrypt），无需加白。
- 质量门：`dart analyze lib` = **No issues found**；flutter test = **124/124 全绿**。
- release 包：`build/app/outputs/flutter-apk/app-release.apk`，**58.69MB**，versionName **12.0.0** / versionCode **14**，包名 com.jingjingshangri.jingjingshangri_app，label「晶晶日上」，minSdk24/targetSdk36；aapt 核验含 INTERNET 权限、application 引用 networkSecurityConfig、无全局 usesCleartextTraffic。
- 构建命令（固定）：`$env:JAVA_HOME="C:\src\jdk17"` 后 `C:\src\flutter\bin\flutter.bat build apk --release`（PowerShell 把 KGP warning 打到 stderr 误报 exit1，以"√ Built"与产物为准）。

## 5. 端口收口（公网不再暴露 Node）

- `app.listen` 由 `0.0.0.0` 改为 `127.0.0.1`（服务器 /opt/jjsr/app.js，已备份），node 现仅听回环；Nginx 经回环反代，业务无中断。
- ufw 删除 3000/tcp（v4+v6），现仅放行 22/80/443。
- 公网复核：`http://8.222.213.43:3000` 已不可达（绑回环后 refused、删 ufw 后 DROP 超时，均符合）；SSH(22) 未动。
- **云平台防火墙（已于 2026-09-02 在控制台删除，无需用户操作）**：该新加坡实例（Ubuntu-xzjh）防火墙规则由 5 条收敛为 4 条——删除 TCP 3000（来源 0.0.0.0/0），保留 TCP 22/80/443 与 ICMP，控制台提示“删除操作成功”。至此主机 ufw + 云防火墙**双层收口完成**。

## 6. 最终公网验证矩阵（2026-09-02 22:49，本机走公网、真实校验证书链）

| 项 | 结果 |
|---|---|
| https://www /api/health | 200，v13.0.0 |
| https://主域 /api/health | 200 |
| http://任意 /api/health | 301 → https |
| CORS 带 Origin=正式域 | 200，回 Access-Control-Allow-Origin 正式域 + credentials |
| /uploads/avatars/avatar1.jpg | 200 image/jpeg |
| /api/humans | 200 真实数据（avatar 相对路径，前端自动补 https 域） |
| 支付两回调（未带签名） | alipay 回 fail-text、wx 回 400，均非 404（路由在） |
| 公网 IP:3000 | 000 不可达 |
| HSTS / HTTP2 | 已下发；443 协商 HTTP/2 |

## 7. 回滚总览（均已先备份）

- Nginx：`/etc/nginx/sites-available/jjsr.httpbak`。
- 后端 .env：`/opt/jjsr/.env.bak.*`（多份，含 cors 修复前）。
- app.js：`/opt/jjsr/app.js.bak.*`（回滚监听地址后 pm2 restart）。
- 前端：api_service.dart 保留 publicUrl IP 回退点，设置页可一键切回；无需发版即可在 App 内切回 IP。
- 证书：Let's Encrypt 自动续期，无需人工。

## 8. 遗留 / 不阻塞

- 云防火墙 TCP3000 已于 2026-09-02 删除（见第 5 节），双层收口完成、无待办。
- 服务器本机 curl https 的 exit60（本地 CA）未深究，公网可信，不影响业务。
- 本次未把本地 trim 版 config.js 整体覆盖线上（线上 .env 已干净、行为正确）；随下次正常部署同步即可。
- 版本号维持 12.0.0+14（与现网同号，侧载覆盖安装；若上应用商店需另行递增 versionCode）。
- 正式安卓 keystore、软著、服务器 2026-09-27 到期续费等沿用既有台账，不在本次范围。
