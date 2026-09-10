#!/bin/bash
for k in NODE_ENV SMS_ENABLED OSS_ENABLED WX_ECOMMERCE_ENABLED ALIPAY_DIRECT_ENABLED TAX_MODE DB_CLIENT PORT CORS_ORIGIN; do
  grep -m1 "^$k=" /opt/jjsr/.env
done
echo '--- uploads ---'
find /opt/jjsr/uploads -type f | wc -l
du -sh /opt/jjsr/uploads
echo '--- public static asset check ---'
F=$(find /opt/jjsr/uploads -type f | head -1)
echo "sample file: $F"
