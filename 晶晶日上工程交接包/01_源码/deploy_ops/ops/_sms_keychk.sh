cd /opt/jjsr || exit 1
cat > /tmp/_kchk.js <<'EOF'
const c = require('/opt/jjsr/config');
const ak = c.sms.accessKeyId || '';
const sk = c.sms.secretAccessKey || '';
console.log(JSON.stringify({
  akConfigured: ak.length > 0,
  akLen: ak.length,
  skConfigured: sk.length > 0,
  skLen: sk.length,
  account: c.sms.smsAccount,
  sign: c.sms.signName,
  tpl: c.sms.loginTemplateId,
  enabled: c.sms.enabled,
}));
EOF
node /tmp/_kchk.js
rm -f /tmp/_kchk.js
