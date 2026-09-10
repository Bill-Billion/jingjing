cd /opt/jjsr || exit 1
cat > /tmp/_sms_chk.js <<'EOF'
const c = require('/opt/jjsr/config');
console.log(JSON.stringify({
  enabled: c.sms.enabled,
  sign: c.sms.signName,
  tpl: c.sms.loginTemplateId,
  account: c.sms.smsAccount,
  region: c.sms.region,
  host: c.sms.host,
  hasAk: !!(c.sms.accessKey || c.sms.ak || process.env.VOLC_ACCESSKEY || process.env.SMS_AK),
}));
EOF
echo '=== config as seen by runtime ==='
node /tmp/_sms_chk.js
rm -f /tmp/_sms_chk.js
echo '=== recent error log (should be clean after restart) ==='
pm2 logs jjsr --err --lines 12 --nostream 2>/dev/null | tail -14
