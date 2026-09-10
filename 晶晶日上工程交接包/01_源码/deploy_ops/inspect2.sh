#!/bin/bash
echo "==pm2 location=="; npm root -g; ls /usr/lib/node_modules 2>/dev/null
PM2=$(find /usr/lib/node_modules/pm2/bin -maxdepth 1 -name 'pm2*' 2>/dev/null | head -1)
echo "PM2BIN=$PM2"
echo "==pm2 list=="; node "$PM2" list 2>/dev/null
echo "==pm2 startup=="; systemctl is-enabled pm2-root 2>/dev/null || echo "pm2-root not enabled"
echo "==server .env keys(masked)=="; sed -E 's#=.*#=***#' /opt/jjsr/.env
echo "==certs=="; ls -la /opt/jjsr/certs 2>/dev/null
echo "==nginx=="; dpkg -l 2>/dev/null | grep -i nginx || echo "no nginx"
echo "==apt lock / sources=="; head -3 /etc/apt/sources.list 2>/dev/null; ls /etc/apt/sources.list.d 2>/dev/null
