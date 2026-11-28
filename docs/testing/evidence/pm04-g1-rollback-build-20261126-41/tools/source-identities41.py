import hashlib,json,subprocess,zipfile,re
from pathlib import Path
r=Path.cwd();out=r/'.local/qa18/rollback-20261126-41';sha=lambda b:hashlib.sha256(b).hexdigest();rev=lambda s:subprocess.check_output(['git','rev-parse',s],text=True).strip()
prefix='晶晶日上工程交接包/01_源码/';paths=[prefix+'backend_server',prefix+'frontend_jingjingshangri_app',prefix+'frontend_ops_workspace','contracts','.github/workflows']
head=rev('HEAD');ci='1f42dfb64442cec097cd64c9aaee28f02b35b165';trees={p:dict(candidate=rev(head+':'+p),ci=rev(ci+':'+p))for p in paths};assert all(x['candidate']==x['ci']for x in trees.values())
app=json.loads((r/'.local/qa18/app-quality-20261126-39/SOURCE_FREEZE.json').read_text(encoding='utf8'));assert len(app['files'])==674
for f in app['files']:assert sha((r/f['path']).read_bytes())==f['sha256'],f['path']
def verify_build(folder,files):
 for f in files:assert sha((folder/f['path']).read_bytes())==f['sha256'],f['path']
 return len(files)
ab=json.loads((r/'docs/testing/evidence/pm04-g1-app-quality-20261126-39/BUILD_SOURCES.json').read_text(encoding='utf8'));vb=json.loads((r/'docs/testing/evidence/pm04-g1-privacy-copy-20261126-40/BUILD_SOURCES.json').read_text(encoding='utf8'))
normal=verify_build(r/(prefix+'frontend_jingjingshangri_app/build/qa39-app'),ab['production_web']);isolated=verify_build(r/(prefix+'frontend_jingjingshangri_app/build/web'),ab['isolated_web']);vue=verify_build(r/(prefix+'frontend_ops_workspace/dist'),vb['vue_dist'])
def text(p):
 b=p.read_bytes();return b.decode('utf-16' if b.startswith(b'\xff\xfe')else'utf-8-sig')
for s in ['android-badging','android-signature','android-network-security','android-download']:assert text(out/(s+'.exit')).strip()=='0'
badging=text(out/'android-badging.log');assert "name='com.jingjingshangri.jingjingshangri_app.acceptance'" in badging and 'application-debuggable' in badging
sig=text(out/'android-signature.log');assert 'CN=Android Debug' in sig and 'v2): true' in sig
network=text(out/'android-network-security.log');assert 'cleartextTrafficPermitted=(type 0x12)0x0' in network
apk=out/'android/jingjing-acceptance.apk';artifact=json.loads((out/'ANDROID_ARTIFACT.json').read_text(encoding='utf8'));assert sha(apk.read_bytes())==artifact['apk_sha256']
with zipfile.ZipFile(apk)as z:
 kernel=z.read('assets/flutter_assets/kernel_blob.bin');assert b'https://not-configured.invalid' in kernel
j=dict(result='PASS',candidate=head,ci_source=ci,product_and_contract_trees_identical=trees,app_frozen_files=674,normal_web_files=normal,isolated_web_files=isolated,vue_files=vue,app_source=ab['app_source'],backend_source=vb['backend_source'],vue_source=vb['vue_source'],api='0.31.81-rc.1',migrations=225,last_migration='0225',android=artifact,android_application_id='com.jingjingshangri.jingjingshangri_app.acceptance',debuggable=True,signature='Android Debug / v2 verified',cleartext_traffic=False,kernel_contains_unconfigured_endpoint=True,actual_install=False,manual_device_experience=False)
(out/'SOURCE_IDENTITIES.json').write_text(json.dumps(j,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print(json.dumps(dict(result='PASS',app_frozen=674,web_normal=normal,web_isolated=isolated,vue=vue,android_signature='DEBUG_V2_VERIFIED',installed=False)))
