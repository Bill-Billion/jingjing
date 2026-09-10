#!/bin/bash
# =============================================================================
# 晶晶日上 · Let's Encrypt 证书 webroot 一键签发/续期（Ubuntu 24 + Nginx）
# 用法（在服务器上，root）：
#   bash 01_certbot_webroot.sh api.example.com [you@example.com]
# 前提：
#   1) 域名 A 记录已指向本机公网 IP（8.222.213.43），dig +short 域名 已解析到该 IP；
#   2) 安全组/防火墙放行 80、443；
#   3) Nginx 已装（deploy/nginx_setup.sh），Node 在 127.0.0.1:3000 运行。
# 说明：用 webroot 模式（非 nginx 插件），签发期间网站保持 HTTP 可用，不中断服务。
# =============================================================================
set -euo pipefail
DOMAIN="${1:?用法: bash 01_certbot_webroot.sh <域名> [邮箱]}"
EMAIL="${2:-}"
WEBROOT=/var/www/letsencrypt
SITE=/etc/nginx/sites-available/jjsr
TPL="$(cd "$(dirname "$0")" && pwd)/nginx_jjsr_https.conf.template"

echo "==> [1/6] 安装 certbot（如已安装则跳过）"
export DEBIAN_FRONTEND=noninteractive
if ! command -v certbot >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y -qq certbot
fi
certbot --version

echo "==> [2/6] 准备 webroot 目录"
mkdir -p "$WEBROOT/.well-known/acme-challenge"
chown -R www-data:www-data /var/www/letsencrypt || true

echo "==> [3/6] 下发「签发期临时 HTTP 配置」：保留 ACME 校验目录 + 其余照常反代（服务不中断）"
cat > "$SITE" <<EOF
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name $DOMAIN _;
    client_max_body_size 50m;
    location ^~ /.well-known/acme-challenge/ {
        root $WEBROOT;
        default_type "text/plain";
        try_files \$uri =404;
    }
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }
}
EOF
ln -sf "$SITE" /etc/nginx/sites-enabled/jjsr
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "==> [4/6] webroot 签发证书（90 天有效，certbot.timer 自动续期）"
EMAIL_ARG=(); if [ -n "$EMAIL" ]; then EMAIL_ARG=(--email "$EMAIL"); else EMAIL_ARG=(--register-unsafely-without-email); fi
certbot certonly --webroot -w "$WEBROOT" -d "$DOMAIN" \
  --non-interactive --agree-tos "${EMAIL_ARG[@]}" --keep-until-expiring
ls -l "/etc/letsencrypt/live/$DOMAIN/"

echo "==> [5/6] 渲染并启用 HTTPS 配置（80 跳 443）"
[ -f "$TPL" ] || { echo "找不到模板 $TPL，请先上传 nginx_jjsr_https.conf.template"; exit 2; }
sed "s/__DOMAIN__/$DOMAIN/g" "$TPL" > "$SITE"
nginx -t
systemctl reload nginx

echo "==> [6/6] 配置续期后自动 reload，并自检"
mkdir -p /etc/letsencrypt/renewal-hooks/deploy
cat > /etc/letsencrypt/renewal-hooks/deploy/nginx-reload.sh <<'EOF'
#!/bin/bash
nginx -t && systemctl reload nginx
EOF
chmod +x /etc/letsencrypt/renewal-hooks/deploy/nginx-reload.sh
systemctl enable --now certbot.timer >/dev/null 2>&1 || true
certbot renew --dry-run || echo "（续期演练可稍后手动执行：certbot renew --dry-run）"

echo "==== 自检 ===="
curl -s -m8 -I http://127.0.0.1/ -H "Host: $DOMAIN" | grep -iE 'HTTP/|location' || true
curl -s -m8 https://127.0.0.1/api/health -H "Host: $DOMAIN" --resolve "$DOMAIN:443:127.0.0.1" ; echo
echo "完成：https://$DOMAIN/api/health 应返回 status:ok；80 应 301 到 443。"
