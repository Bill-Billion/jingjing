#!/bin/bash
cd /opt/jjsr
echo "=syntax="
for f in config.js app.js services/providers/aliyunClient.js services/providers/idVerify.js services/providers/faceVerify.js services/providers/moderation.js utils/contentModeration.js routes/identity.js routes/compliance.js routes/faceverify.js routes/review.js routes/videos.js routes/endorsement.js scripts/aliyun_compliance_selftest.js; do
  if node --check $f 2>/tmp/e.txt; then echo "ok $f"; else echo "FAIL $f"; cat /tmp/e.txt; fi
done
echo "=assembly_no_AK="
node -e "
const idv=require('./services/providers/idVerify');
const fv=require('./services/providers/faceVerify');
const mod=require('./services/providers/moderation');
const ac=require('./services/providers/aliyunClient');
['routes/identity','routes/compliance','routes/faceverify','routes/review','routes/videos','routes/endorsement'].forEach(r=>{require('./'+r);console.log('require ok',r)});
console.log('aliyun.ready=',ac.ready());
console.log('idVerify.ready=',idv.ready());
console.log('faceVerify.ready=',fv.ready());
console.log('greenReady=',mod.cloudConfigured());
"
