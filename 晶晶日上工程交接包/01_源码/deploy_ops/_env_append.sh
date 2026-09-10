cd /opt/jjsr
if grep -q '^SMS_ENABLED=' .env; then
  echo "SMS block already present, skip append"
else
cat >> .env <<'EOF'

# ===== 火山短信 SMS（V10.1 2026-08-30；复用 VOLC_ACCESS_KEY_ID/SECRET 做V4签名）=====
# 签名/验证码模板审核通过并回填后，把 SMS_ENABLED 置 true
SMS_ENABLED=false
SMS_REGION=cn-north-1
SMS_HOST=sms.volcengineapi.com
SMS_ACCOUNT=8d0968fa
SMS_SIGN_NAME=
SMS_LOGIN_TEMPLATE_ID=
# 线上 NODE_ENV=production，dev 兜底码被代码强制忽略，故不配置 SMS_DEV_CODE
AI_DAILY_COST_CAP_FEN=20000
AI_RETRY_MAX=2
EOF
echo "SMS block appended"
fi
echo "--- current SMS/AI keys (values masked) ---"
grep -E '^(SMS_|AI_DAILY|AI_RETRY|VOLC_ACCESS|ARK_API|SPEECH_API)' .env | sed -E 's/=(.+)/=<set>/; s/=$/=<empty>/'
echo "--- NODE_ENV ---"; grep -E '^NODE_ENV=' .env
