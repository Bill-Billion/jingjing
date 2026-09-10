#!/bin/bash
# Nginx 反代 + PM2 开机自启
set -u
PM2=/usr/lib/node_modules/pm2/bin/pm2

echo "==== 1. PM2 开机自启 ===="
$PM2 startup systemd 2>&1 | tail -3
LINE=$($PM2 startup systemd 2>/dev/null | grep -E 'env PATH' | tail -1 | sed 's/^sudo //')
[ -n "$LINE" ] && eval "$LINE" && echo "startup cmd executed"
$PM2 save
systemctl daemon-reload
systemctl is-enabled pm2-root 2>/dev/null && echo "pm2-root ENABLED" || echo "pm2-root NOT enabled"

echo "==== 2. 安装 Nginx ===="
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq 2>&1 | tail -2
apt-get install -y -qq nginx 2>&1 | tail -4
nginx -v

echo "==== 3. 配置反代 80 -> 3000 ===="
cat > /etc/nginx/sites-available/jjsr <<'EOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    client_max_body_size 50m;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 30s;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }
}
EOF
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/jjsr /etc/nginx/sites-enabled/jjsr
nginx -t 2>&1
systemctl enable nginx >/dev/null 2>&1
systemctl restart nginx
sleep 1
systemctl is-active nginx

echo "==== 4. 本机经 Nginx 验证 ===="
curl -s -m8 http://127.0.0.1/api/health; echo
ss -tlnp | grep -E ':80 |:3000 '
echo "==== DONE ===="
