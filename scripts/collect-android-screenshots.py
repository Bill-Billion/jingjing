"""Read only this debug App's synthetic PNG evidence through adb run-as."""
from pathlib import Path
import argparse, subprocess, re, json
p=argparse.ArgumentParser();p.add_argument('--adb',required=True);p.add_argument('--output',required=True);a=p.parse_args()
base=[a.adb,'-s','emulator-5554'];package='com.jingjingshangri.jingjingshangri_app'
items=subprocess.check_output(base+['shell','run-as',package,'ls','code_cache/jx-native-evidence'],timeout=20).decode().splitlines()
out=Path(a.output);out.mkdir(parents=True,exist_ok=True)
written=[]
for name in items:
 if not re.fullmatch(r'android-[a-z0-9-]+\.png',name):continue
 data=subprocess.check_output(base+['exec-out','run-as',package,'cat','code_cache/jx-native-evidence/'+name],timeout=30)
 if not data.startswith(bytes([137,80,78,71,13,10,26,10])):raise RuntimeError('INVALID_PNG')
 (out/name).write_bytes(data);written.append(name)
if not written:raise RuntimeError('NO_NATIVE_SCREENSHOTS')
print(json.dumps({'native_png_files':written,'count':len(written)}))
