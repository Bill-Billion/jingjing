#!/bin/bash
echo '== current ALIPAY lines in online .env =='
grep -nE '^#?ALIPAY' /opt/jjsr/.env || echo '(none)'
echo '== already has V12.4 block? =='
grep -n 'V12.4' /opt/jjsr/.env || echo 'NO_V124_BLOCK'
echo '== DONE =='
