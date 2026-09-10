#!/bin/bash
echo '== ops smoke =='
find /opt/jjsr/ops -maxdepth 1 -type f -name '*moke*'
echo '== scripts smoke/pay =='
find /opt/jjsr/scripts -maxdepth 1 -type f \( -name '*moke*' -o -name '*pay*' \) 2>/dev/null
