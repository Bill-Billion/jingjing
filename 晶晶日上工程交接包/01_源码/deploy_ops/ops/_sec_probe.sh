#!/bin/bash
echo '===== .env 键清单（只显示键名与值长度，绝不回显值）====='
if [ -f /opt/jjsr/.env ]; then
  awk 'BEGIN{FS="="} /^[A-Za-z_][A-Za-z0-9_]*=/{ v=substr($0,index($0,"=")+1); gsub(/^"|"$/,"",v); printf "  %-26s len=%-4s nonempty=%s\n", $1, length(v), (length(v)>0?"yes":"EMPTY") }' /opt/jjsr/.env
else echo 'NO .env'; fi
echo '===== 关键开关（只看是否存在，不打印值）====='
for k in NODE_ENV ALLOW_ANON_AI SMS_ENABLED UPLOAD_URL_PREFIX JWT_SECRET ARK_API_KEY SPEECH_API_KEY VOLC_AK VOLC_SK; do
  if grep -q "^$k=" /opt/jjsr/.env; then echo "  $k present"; else echo "  $k MISSING"; fi
done
echo '===== uploads 持久化与占用 ====='
ls -la /opt/jjsr/uploads
du -sh /opt/jjsr/uploads/* 2>/dev/null
echo '===== 磁盘总体 ====='
df -h /
echo '===== 监听端口 ====='
ss -ltnp
echo '===== ufw 状态（只读）====='
ufw status verbose
echo '===== iptables NAT/过滤摘要（只读）====='
iptables -S | head -20
echo '===== Nginx 站点配置 ====='
nginx -T 2>/dev/null | sed -n '1,80p'
