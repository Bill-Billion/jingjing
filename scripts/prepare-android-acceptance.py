"""Apply isolated debug identity in disposable CI checkout only; never builds release."""
from pathlib import Path
import os,json
from urllib.parse import urlparse
root=Path(__file__).resolve().parents[1]
app=root/'晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app'
url=os.environ.get('ACCEPTANCE_API_URL','https://not-configured.invalid').strip()
u=urlparse(url)
assert u.scheme=='https' and u.hostname and not u.username and not u.password and not u.query and not u.fragment
assert u.hostname.endswith('.trycloudflare.com') or u.hostname=='not-configured.invalid'
p=app/'android/app/build.gradle.kts';s=p.read_text(encoding='utf-8');needle='    buildTypes {\n';assert s.count(needle)==1
s=s.replace(needle,needle+'        getByName("debug") { applicationIdSuffix = ".acceptance" }\n');p.write_text(s,encoding='utf-8')
p=app/'android/app/src/debug/AndroidManifest.xml';p.write_text('''<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools"><uses-permission android:name="android.permission.INTERNET"/><application android:label="晶晶日上·测试" tools:replace="android:label"/></manifest>''',encoding='utf-8')
p=app/'android/app/src/debug/res/xml/network_security_config.xml';p.parent.mkdir(parents=True,exist_ok=True);p.write_text('''<network-security-config><base-config cleartextTrafficPermitted="false"><trust-anchors><certificates src="system"/></trust-anchors></base-config></network-security-config>''',encoding='utf-8')
# file_picker 11.0.3 skips KGP on AGP 9 even with built-in Kotlin disabled.
# CI-only workaround; do not silently upgrade all frontend dependencies.
p=app/'android/build.gradle.kts'
s=p.read_text(encoding='utf-8')
needle_sub='subprojects {\n'
assert needle_sub in s
compat='''subprojects {
    if (name == "file_picker") {
        pluginManager.apply("org.jetbrains.kotlin.android")
        tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile>().configureEach {
            compilerOptions.jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
        }
    }
}

'''
s=s.replace(needle_sub,compat+needle_sub,1)
p.write_text(s,encoding='utf-8')
(root/'.local').mkdir(exist_ok=True)
(root/'.local/android-acceptance-config.json').write_text(json.dumps({'JX_ACCOUNT_API_URL':url}),encoding='utf-8')
print('Prepared DEBUG-only acceptance identity and HTTPS endpoint; no provider keys loaded.')
