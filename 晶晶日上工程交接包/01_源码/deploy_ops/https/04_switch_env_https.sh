#!/bin/bash
# 幂等把支付回调/CORS 切到正式 HTTPS 域名；先备份 .env，其余配置不动，不回显任何密钥。
set -euo pipefail
ENV=/opt/jjsr/.env
W=www.jingjingrishang.com
cp -a "$ENV" "$ENV.bak.$(date +%Y%m%d%H%M%S)"

upsert() {
  local k="$1" v="$2"
  if grep -q "^${k}=" "$ENV"; then
    sed -i "s|^${k}=.*|${k}=${v}|" "$ENV"
  else
    echo "${k}=${v}" >> "$ENV"
  fi
}

upsert WX_NOTIFY_URL     "https://$W/api/payment/wx/notify"
upsert ALIPAY_NOTIFY_URL "https://$W/api/pay/alipay/notify"
if ! grep -q "https://$W" "$ENV"; then
  sed -i "s|^CORS_ORIGIN=.*|&,https://$W|" "$ENV"
fi

echo "== after (non-secret lines only) =="
grep -nE 'NOTIFY_URL|^CORS_ORIGIN' "$ENV"

echo "== config resolves =="
cd /opt/jjsr
node -e "const c=require('./config');console.log('wx='+c.wxPay.notifyUrl);console.log('ali='+c.alipay.notifyUrl);console.log('cors='+c.cors.origin.join(','));"

PM2="$(command -v pm2 || echo /usr/lib/node_modules/pm2/bin/pm2)"
"$PM2" restart jjsr && "$PM2" save
sleep 2
echo "== health via https =="
curl -sk -m8 https://127.0.0.1/api/health -H "Host: $W" --resolve "$W:443:127.0.0.1"; echo
echo "== pm2 =="
"$PM2" list | grep -Ei 'name|jjsr' | head
echo SWITCH_DONE
