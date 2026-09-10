# 晶晶日上 · HTTP→HTTPS 切换预案（域名 + 证书 + 关闭 3000 公网口）

> 现状（2026-08-31）：阿里云轻量新加坡 `8.222.213.43`（ap-southeast-1，Ubuntu24，1C1G），
> Nginx 80 → 127.0.0.1:3000（PM2 守护），**安全组同时对公网开了 3000（临时调试用，需在 HTTPS 就绪后关闭）**。
> 目标：域名 + 免费证书（Let's Encrypt webroot）→ 全站 HTTPS → Node 只绑回环 → 关闭公网 3000，全程可回滚、业务不中断。
> 本目录文件：
> - `nginx_jjsr_https.conf.template`：Nginx HTTPS 配置模板（80 跳 443 + ACME 目录 + 443 反代 + /uploads 静态）
> - `01_certbot_webroot.sh`：证书 webroot 一键签发/续期脚本
> - 本文件：总流程、DNS、绑回环、关端口顺序与回滚、备案说明

---

## 一、总体顺序（务必按序，每步验证通过再下一步）
1. **DNS 解析（A 记录）**：域名指向 8.222.213.43，等待全球解析生效。
2. **证书签发**：上传本目录到服务器，跑 `01_certbot_webroot.sh`（签发期网站仍走 HTTP，不中断）。
3. **HTTPS 验证**：`https://域名/api/health` 返回 ok；`http://域名` 301 到 https；全量公开接口冒烟。
4. **后端/APP 切到 HTTPS 域名**：`.env` 的 `ALIPAY_NOTIFY_URL`、前端 API base 改为 `https://域名`，重启/出包。
5. **Node 只绑回环 127.0.0.1**（改 `app.listen`，PM2 重启）。
6. **关闭公网 3000**：先云防火墙（安全组）删 3000，再主机 ufw 删 3000；外网验证 3000 已不可达、22 仍在。
7. 收尾：定时续期（certbot.timer）、健康巡检、回写运维手册 16 与本预案执行结果。

> 关键原则：**先把 HTTPS 链路验证到 100% 可用，最后才动 3000**；全程保留至少一个已登录 SSH 会话，并另开一个新会话做“断连演练”。

---

## 二、DNS A 记录怎么配
在**域名注册商/解析服务商控制台**添加（以主域 example.com、接口域 api.example.com 为例）：

| 记录类型 | 主机记录 | 记录值 | TTL | 说明 |
|---|---|---|---|---|
| A | `@`（或 `api`） | `8.222.213.43` | 600 | 主/接口域名直接指服务器 |
| A 或 CNAME | `www` | 同 `@`（A 指 IP）或 CNAME 到主域 | 600 | 可选 |

- 只做后端接口：建议用独立子域 `api.主域`，避免和未来官网/前端静态站冲突。
- 生效验证（本地与服务器各执行一次）：
  ```bash
  dig +short api.example.com
  # 期望输出 8.222.213.43；Windows 可用 nslookup api.example.com
  ```
- 生效前不要跑 certbot（Let's Encrypt 会校验域名确实解析到本机）。

### 海外免备案 vs 国内备案（两条路径，按节点选）
- **当前节点是新加坡（海外）**：域名解析到海外 IP、走 HTTPS 演示/接口，**无需 ICP 备案**即可用 Let's Encrypt 签发并对外；适合当前“先跑通支付沙箱/真机验单”。
- **若迁回中国大陆节点 / 用国内 CDN / 微信支付正规经营 / 应用商店要求**：域名需先完成 **ICP 备案**（主体：河南万霖新媒体科技有限公司，通常 2–3 周），备案期间 80/443 会被拦截、证书也签不下来；应先备案再切国内。
- 支付宝开放平台本身不强制 ICP，但**正式 APP 支付上线、应用上架、支付经营类目审核**通常要求备案域名 + HTTPS 回调，故排期上把备案当作国内正式上线前置项。

---

## 三、签发证书（webroot，不中断服务）
```bash
# 本机把本目录上传到服务器（示例，复用现有 Node ssh2 通道亦可）
scp -r work/deploy/https root@8.222.213.43:/opt/jjsr/https
# 服务器上执行（域名换成真实域名，邮箱用于证书到期提醒，可留空第二个参数）
cd /opt/jjsr/https
bash 01_certbot_webroot.sh api.example.com ops@jingjingshangri.com
```
脚本做了什么：装 certbot → 建 `/var/www/letsencrypt` → 下发“签发期临时 80 配置”（ACME 目录可访问、其余继续反代，**业务不中断**）→ webroot 签发 → 渲染 HTTPS 模板并 reload → 配续期钩子 + `certbot renew --dry-run`。
验证：
```bash
curl -s -m8 http://127.0.0.1/api/health -H "Host: api.example.com"            # 80 仍可用
curl -s -m8 -I http://api.example.com | grep -i location                       # 301 → https
curl -s -m8 https://api.example.com/api/health                                 # {"status":"ok"...}
```

---

## 四、后端 / 前端切到 HTTPS 域名
1. 服务器 `/opt/jjsr/.env`：
   ```ini
   ALIPAY_NOTIFY_URL=https://api.example.com/api/pay/alipay/notify
   ```
   （支付沙箱阶段也可先填穿透域名；正式必须 https 域名）
2. Flutter 前端 API base 改为 `https://api.example.com`（禁止 http、禁止直连 IP:3000），重新出包。
3. `pm2 restart jjsr && pm2 save`，再次 https 全量冒烟（登录/验证码/AI/接口）。

---

## 五、Node 只绑回环 127.0.0.1（不再对公网监听）
当前 `app.js` 末尾：
```js
app.listen(config.port, '0.0.0.0', () => { ... });   // 0.0.0.0 = 对所有网卡公网监听
```
改为：
```js
app.listen(config.port, '127.0.0.1', () => { ... }); // 只接受本机 Nginx 反代进来的流量
```
执行与验证（服务器）：
```bash
cd /opt/jjsr
cp app.js app.js.bak.$(date +%Y%m%d%H%M)
sed -i "s/app.listen(config.port, '0.0.0.0'/app.listen(config.port, '127.0.0.1'/" app.js
node --check app.js
/usr/lib/node_modules/pm2/bin/pm2 restart jjsr && /usr/lib/node_modules/pm2/bin/pm2 save
ss -tlnp | grep 3000        # 期望 127.0.0.1:3000，而不是 0.0.0.0:3000 / *:3000
curl -s -m8 http://127.0.0.1:3000/api/health     # 本机仍 200
curl -s -m8 https://api.example.com/api/health  # 经 Nginx 仍 200
```
> 这一步之后，即使云防火墙还没改，公网也已经连不上 3000（进程只在回环监听）；Nginx 本机反代不受影响。

---

## 六、关闭公网 3000 的精确顺序（先云防火墙，后主机 ufw）
> 前提：第五节已完成且 https 全绿；**保留当前 SSH，再新开一个 SSH 窗口做断连验证**，避免把自己关在外面。
1. **先关云端**：阿里云轻量控制台 → 防火墙/安全组 → 删除 `TCP 3000 允许` 规则（22/80/443 保留）。
2. **再关主机**：
   ```bash
   ufw status numbered
   ufw delete allow 3000/tcp     # 按提示确认；若是 status inactive 则主机层本就没拦，跳过
   ufw reload; ufw status verbose
   ```
3. **外网验证（在你自己电脑/手机流量上执行，不要在服务器本机）**：
   ```bash
   curl -m8 http://8.222.213.43:3000/api/health   # 期望：超时/拒绝（已不可达）
   curl -m8 https://api.example.com/api/health    # 期望：200 ok
   # 新开一个 SSH：ssh root@8.222.213.43           # 期望：仍可登录（22 未受影响）
   ```
4. 巡检：跑 `work/deploy/ops/healthcheck.sh`，确认 PM2 online、Nginx active、证书有效期、备份 cron 正常。

### 回滚（任一步异常，按下面立即恢复，业务回到 HTTP+公网3000 的现状）
- **回滚 Node 监听**：
  ```bash
  cd /opt/jjsr && cp app.js.bak.* app.js   # 选最近一个备份
  node --check app.js && /usr/lib/node_modules/pm2/bin/pm2 restart jjsr && /usr/lib/node_modules/pm2/bin/pm2 save
  ```
- **回滚 3000 端口**：云控制台重新添加 `TCP 3000 允许 0.0.0.0/0`；主机 `ufw allow 3000/tcp && ufw reload`。
- **回滚 Nginx 到 HTTP only**：用签发前备份的站点配置覆盖并 reload：
  ```bash
  # 若执行前手动备份过：cp /etc/nginx/sites-available/jjsr.httpbak /etc/nginx/sites-available/jjsr
  nginx -t && systemctl reload nginx
  ```
  （建议在跑 01 脚本前先 `cp /etc/nginx/sites-available/jjsr /etc/nginx/sites-available/jjsr.httpbak`）
- 证书签发失败不影响业务：临时 80 配置仍正常反代，排查 DNS/webroot 后重跑脚本即可（`--keep-until-expiring` 幂等）。

---

## 七、验收清单
- [ ] `dig +short 域名` = 8.222.213.43（本地+服务器一致）
- [ ] `https://域名/api/health` 200；`http://域名` 301→https；证书链有效、无浏览器告警
- [ ] `ALIPAY_NOTIFY_URL` 为 https，且外网 POST `/api/pay/alipay/notify` 能到（未签名回 fail 属正常，说明可达）
- [ ] Node `ss -tlnp` 显示 127.0.0.1:3000；公网 `IP:3000` 不可达
- [ ] 云防火墙 + ufw 均无 3000；22/80/443 正常；新 SSH 可登录
- [ ] `certbot renew --dry-run` 通过；续期 reload 钩子就位
- [ ] 健康巡检全绿并回写运维手册 16 / 项目档案 17
