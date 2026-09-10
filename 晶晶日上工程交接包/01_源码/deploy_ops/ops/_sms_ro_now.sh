cd /opt/jjsr || exit 1
echo '== recent sms_verification_codes (raw) =='
node -e 'const db=require("better-sqlite3")("/opt/jjsr/jingjingshangri.db",{readonly:true});const rows=db.prepare("SELECT phone,purpose,provider_msg_id IS NOT NULL hasMsg,consumed,created_at FROM sms_verification_codes ORDER BY id DESC LIMIT 6").all();console.log(JSON.stringify(rows,null,1));db.close()'
echo '== done =='
