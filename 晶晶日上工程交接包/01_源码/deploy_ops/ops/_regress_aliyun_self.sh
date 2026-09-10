#!/bin/bash
cd /opt/jjsr
echo "=aliyun_selftest_on_server="
node scripts/aliyun_compliance_selftest.js 2>&1 | grep -E 'RESULT|✗|== A|== B'
