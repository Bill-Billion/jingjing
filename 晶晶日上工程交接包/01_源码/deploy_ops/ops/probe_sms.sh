echo "=== SMS env (secret masked) ==="
grep -E "^SMS_|^VOLC_" /opt/jjsr/.env | sed -E 's/(ACCESSKEY|SECRETKEY|KEY|SECRET|TOKEN)=.*/\1=***/I'
echo "=== pm2 recent sms-related logs ==="
pm2 logs jjsr --lines 300 --nostream 2>/dev/null | grep -iE "sms|sent_ok|sent_fail|RE:[0-9]|SY:[0-9]|volc|验证码|template" | tail -40
echo "=== db files ==="
ls -la /opt/jjsr/data 2>/dev/null
find /opt/jjsr -maxdepth 2 -name "*.db" -o -maxdepth 2 -name "*.sqlite*" 2>/dev/null
