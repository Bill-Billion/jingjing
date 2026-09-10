cd /opt/jjsr
echo "node=$(node -v)"
npm install --omit=dev --no-audit --no-fund 2>&1 | tail -25
echo "--- verify sdk load ---"
node -e "const {SmsService}=require('@volcengine/openapi').sms; const c=new SmsService({accessKeyId:'x',secretKey:'x',region:'cn-north-1'}); console.log('SmsService.Send =', typeof c.Send)"
