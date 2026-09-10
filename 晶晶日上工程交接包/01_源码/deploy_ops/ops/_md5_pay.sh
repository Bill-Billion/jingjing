#!/bin/bash
cd /opt/jjsr
for f in services/alipay.js routes/pay.js app.js db.js package.json package-lock.json scripts/verify_pay_skeleton.js scripts/gen_alipay_rsa_keypair.js; do
  if [ -f "$f" ]; then echo "$(md5sum "$f" | awk '{print $1}')  $f  $(stat -c%s "$f")"; else echo "MISSING $f"; fi
done
echo '== DONE =='
