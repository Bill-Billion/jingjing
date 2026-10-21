"""Verify a GitHub acceptance artifact before staging a local phone handoff."""
from pathlib import Path
import sys,json,hashlib,zipfile,re,shutil,time
artifact=Path(sys.argv[1]);destination=Path(sys.argv[2]);expected_commit=sys.argv[3]
assert re.fullmatch(r'[0-9a-f]{40}',expected_commit)
root=Path(__file__).resolve().parents[1]
session=json.loads((root/'.local/mobile-session/session.json').read_text(encoding='utf-8-sig'))
assert session['syntheticOnly'] and session['scenario']=='full' and not session['closed']
assert session['expiresAt']>time.time()*1000
url=session['url'];assert re.fullmatch(r'https://[a-z0-9-]+\.trycloudflare\.com',url)
apk=artifact/'jingjing-acceptance.apk';digest=hashlib.sha256(apk.read_bytes()).hexdigest()
assert digest==(artifact/'SHA256SUMS.txt').read_text().split()[0]
assert (artifact/'source-commit.txt').read_text().strip()==expected_commit
found_url=False
with zipfile.ZipFile(apk) as z:
    assert z.testzip() is None
    manifest=z.read('AndroidManifest.xml')
    def contains(value):return value.encode() in manifest or value.encode('utf-16le') in manifest
    assert contains('com.jingjingshangri.jingjingshangri_app.acceptance')
    assert contains('晶晶日上·测试')
    assert not any(n.endswith(('.env','.pem','.key','.sql','.sqlite','.db')) or '/.local/' in n for n in z.namelist())
    for entry in z.infolist():
        if entry.is_dir():continue
        data=z.read(entry)
        assert not re.search(rb'AKLT[A-Za-z0-9]{32,}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----',data),'Credential-like material: do not deliver'
        found_url=found_url or url.encode() in data
assert found_url,'Authorized URL missing from APK'
proof={'source_commit':expected_commit,'sha256':digest,'bytes':apk.stat().st_size,'testPackageIdentityVerified':True,'authorizedUrlEmbedded':True,'archiveIntegrityChecked':True,'forbiddenFileExtensionsAbsent':True,'commonCredentialPatternsAbsent':True,'knownCredentialValuesCompared':False,'cryptographicApkSignatureVerified':False,'expiresAt':session['expiresAt'],'phoneInstallation':'PENDING','phoneBusinessAcceptance':'PENDING'}
destination.mkdir(parents=True,exist_ok=True)
for name in ['jingjing-acceptance.apk','SHA256SUMS.txt','source-commit.txt']:
    target=destination/name
    assert not target.exists(),'Do not overwrite an earlier phone package'
    shutil.copyfile(artifact/name,target)
(destination/'verification.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(proof,ensure_ascii=False))
