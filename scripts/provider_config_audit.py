"""Offline inventory of provider configuration. Never imports app/SDKs or calls services.
Values are neither printed nor written into reports. Drafts may only go under repo/.local.
"""
import argparse
import base64
import json
import re
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
GROUPS = {
    'base': ('服务器和MySQL', ['NODE_ENV','DB_CLIENT','MYSQL_HOST','MYSQL_PORT','MYSQL_USER','MYSQL_PASSWORD','MYSQL_DATABASE','MYSQL_SSL_MODE','AUTH_SECRET_BASE64','API_ALLOWED_ORIGINS'], None, True),
    'sms': ('短信登录', ['VOLC_ACCESS_KEY_ID','VOLC_SECRET_ACCESS_KEY','SMS_ACCOUNT','SMS_SIGN_NAME','SMS_LOGIN_TEMPLATE_ID','SMS_CONFIG_REVISION'], 'SMS_ENABLED', True),
    'storage': ('私有文件存储（OSS）', ['OSS_REGION','OSS_BUCKET','OSS_ACCESS_KEY_ID','OSS_ACCESS_KEY_SECRET','OSS_ENVIRONMENT'], None, True),
    'alipay': ('支付宝', ['TRADE_ALIPAY_'+k for k in ['APP_ID','MERCHANT_ID','MERCHANT_PARTY_ID','PRIVATE_KEY','PUBLIC_KEY','NOTIFY_URL','CONFIG_REVISION']], 'TRADE_ALIPAY_ENABLED', True),
    'apple': ('Apple购买', ['TRADE_APPLE_'+k for k in ['BUNDLE_ID','APP_APPLE_ID','MERCHANT_PARTY_ID','PRIVATE_KEY','KEY_ID','ISSUER_ID','ROOT_CERT_PATHS','CONFIG_REVISION']], 'TRADE_APPLE_ENABLED', True),
    'models': ('模型和数字人（还需新版接入实现）', ['ARK_API_KEY','ARK_LLM_MODEL','ARK_T2I_MODEL','ARK_T2V_MODEL'], None, False),
    'speech': ('语音（还需新版接入实现）', ['SPEECH_API_KEY','SPEECH_APP_ID','SPEECH_VOICE_ID'], None, False),
}
ALIASES = { 'TRADE_ALIPAY_APP_ID':'ALIPAY_APP_ID','TRADE_ALIPAY_MERCHANT_ID':'ALIPAY_PID',
            'TRADE_ALIPAY_PRIVATE_KEY':'ALIPAY_PRIVATE_KEY','TRADE_ALIPAY_PUBLIC_KEY':'ALIPAY_PUBLIC_KEY'}
PLACEHOLDER = re.compile(r'your|placeholder|example|change.?me|replace|todo|待填|填写|请填|示例|^x{4,}$|^\*+$', re.I)

def supplied(value):
    return isinstance(value,str) and bool(value.strip()) and not PLACEHOLDER.search(value)

def parse_env(text):
    result = {}
    for number, raw in enumerate(text.splitlines(),1):
        line=raw.strip()
        if not line or line.startswith('#'): continue
        m=re.fullmatch(r'(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*)',line)
        if not m: raise ValueError(f'ENV_SYNTAX_LINE_{number}')
        key,value=m.groups()
        if key in result: raise ValueError(f'ENV_DUPLICATE_LINE_{number}')
        if value.startswith(('"',"'")):
            quote=value[0]; closing=value.find(quote,1)
            if closing<0 or (value[closing+1:].strip() and not value[closing+1:].lstrip().startswith('#')):
                raise ValueError(f'ENV_QUOTING_LINE_{number}')
            value=value[1:closing]
        else: value=re.split(r'\s+#',value,1)[0].strip()
        # Do not evaluate shell syntax, interpolation, or escaped multi-line private keys.
        result[key]=value
    return result

def audit(env,environment):
    groups=[]
    for ident,(label,fields,flag,implemented) in GROUPS.items():
        fields=list(fields)
        if ident=='base' and environment=='production': fields.append('MYSQL_SSL_CA')
        missing=[k for k in fields if not supplied(env.get(k))]
        issues=[]
        def issue(condition,code):
            if condition: issues.append(code)
        if ident=='base':
            issue(env.get('DB_CLIENT')!='mysql','DB_CLIENT必须为mysql')
            issue(env.get('NODE_ENV') not in (['production'] if environment=='production' else ['development','test']),'NODE_ENV与目标环境不一致')
            if environment=='production':
                issue(env.get('MYSQL_SSL_MODE')!='verify_identity','正式MySQL需要验证TLS')
                issue(env.get('MYSQL_USER')=='root','正式MySQL不能用root账号')
            elif supplied(env.get('MYSQL_SSL_MODE')): issue(env['MYSQL_SSL_MODE'] not in ['disabled','verify_identity'],'MYSQL_SSL_MODE无效')
            if supplied(env.get('MYSQL_PORT')): issue(not env['MYSQL_PORT'].isdigit() or not 1<=int(env['MYSQL_PORT'])<=65535,'MYSQL_PORT无效')
            if supplied(env.get('MYSQL_DATABASE')): issue(not re.fullmatch(r'[A-Za-z0-9_]{1,64}',env['MYSQL_DATABASE']),'数据库名称格式无效')
            if supplied(env.get('AUTH_SECRET_BASE64')):
                try: valid=bool(re.fullmatch(r'[A-Za-z0-9+/]{43}=',env['AUTH_SECRET_BASE64'])) and len(base64.b64decode(env['AUTH_SECRET_BASE64'],validate=True))==32
                except Exception: valid=False
                issue(not valid,'登录签名密钥应为32字节的Base64')
            if supplied(env.get('API_ALLOWED_ORIGINS')):
                try:
                    for origin in env['API_ALLOWED_ORIGINS'].split(','):
                        u=urlsplit(origin)
                        port=u.port  # Validate a supplied port without echoing its value.
                        issue(not u.hostname or '*' in (u.hostname or '') or u.scheme not in (['https'] if environment=='production' else ['http','https']) or bool(u.username or u.password or u.query or u.fragment or u.path),'网页来源须填写准确域名和端口，不允许通配或附路径')
                except ValueError: issues.append('网页来源地址格式无效')
        if ident=='sms': issue(bool(env.get('DEBUG')),'短信配置禁止开启DEBUG日志')
        if ident=='storage':
            issue(env.get('OSS_ENVIRONMENT')!=('PRODUCTION' if environment=='production' else 'SANDBOX'),'OSS_ENVIRONMENT与目标环境不一致')
            issue(bool(env.get('OSS_ENDPOINT')),'新版OSS_ENDPOINT必须留空')
            if supplied(env.get('OSS_REGION')): issue(not re.fullmatch(r'oss-[a-z0-9-]+',env['OSS_REGION']),'OSS地域格式应为oss-开头')
            if supplied(env.get('OSS_BUCKET')): issue(not re.fullmatch(r'[a-z0-9][a-z0-9-]{1,61}[a-z0-9]',env['OSS_BUCKET']),'OSS桶名格式无效')
        if ident=='alipay' and supplied(env.get('TRADE_ALIPAY_NOTIFY_URL')):
            u=urlsplit(env['TRADE_ALIPAY_NOTIFY_URL']);issue(u.scheme!='https' or not u.hostname or u.path!='/api/v1/trade/notifications/alipay','支付宝通知需HTTPS及新版通知路径')
        if ident=='apple' and supplied(env.get('TRADE_APPLE_ROOT_CERT_PATHS')):
            try:
                certs=json.loads(env['TRADE_APPLE_ROOT_CERT_PATHS']);valid=isinstance(certs,list) and len(certs)>0 and all(isinstance(v,str) and v for v in certs)
            except Exception: valid=False
            issue(not valid,'Apple根证书路径需要非空JSON列表')
        complete=not missing and not issues
        groups.append({'id':ident,'work':label,'fields_present':[k for k in fields if supplied(env.get(k))],
            'missing_or_placeholder_fields':missing,'configuration_issues':list(dict.fromkeys(issues)),
            'configuration_complete':complete,'current_runtime_implementation':implemented,
            'switch_enabled':env.get(flag)=='true' if flag else None,
            'result':('资料字段齐全，仍未验证真实服务' if complete else '配置尚未齐全或不符合新版要求') if implemented else '仅有旧调用资料，新版接入未完成',
            'real_service_verified':False})
    return {'environment':environment,'offline_only':True,'network_calls':0,'values_in_report':False,'groups':groups,
        'notes':['配置检查通过不代表密钥有效、权限开通、余额充足或服务已经启用。',
                 '新版OSS不读取旧OSS_ENABLED开关；能否调用仍取决于完整配置和数据库中的服务验证记录。',
                 '旧ALIPAY_*只可作为字段迁移线索；平台商户主体ID必须另行核对。',
                 '实名、内容审核和电子签还需确定产品/接口与新版实现，不能仅靠环境变量声称接通。',
                 '本工具不检查证书真实性或读取证书内容、不验证合同及素材授权。']}

def write_draft(env,destination,environment):
    # No silent overwrite, no secrets anywhere other than ignored local directory.
    if environment!='sandbox': raise ValueError('DRAFT_SANDBOX_ONLY')
    dest=Path(destination).resolve(); private=(ROOT/'.local').resolve()
    if private not in dest.parents: raise ValueError('DRAFT_MUST_BE_INSIDE_REPO_LOCAL')
    values={}
    for _,(_,fields,_,_) in GROUPS.items():
        for key in fields:
            value=env.get(key,env.get(ALIASES.get(key,''),''))
            values[key]=value if supplied(value) else ''
    values.update({'NODE_ENV':'production' if environment=='production' else 'test','DB_CLIENT':'mysql',
        'MYSQL_SSL_MODE':'verify_identity' if environment=='production' else 'disabled',
        'MYSQL_SSL_CA':'','OSS_ENVIRONMENT':'PRODUCTION' if environment=='production' else 'SANDBOX','OSS_ENDPOINT':'',
        'SMS_ENABLED':'false','TRADE_ALIPAY_ENABLED':'false','TRADE_APPLE_ENABLED':'false'})
    # Never repurpose legacy database host/password or populate production by inference.
    for k in ['MYSQL_HOST','MYSQL_PORT','MYSQL_USER','MYSQL_PASSWORD','MYSQL_DATABASE','AUTH_SECRET_BASE64','API_ALLOWED_ORIGINS']:
        values[k]=''
    # Funding decisions are not copied from legacy defaults.
    text=['# 本地待补草稿。未启用、未验证，不可直接作为正式环境。',
          '# 可能含真实凭证：禁止入Git、禁止发给软著撰写方。',
          '# OSS_ENABLED不是新版开关；仅配置齐全不等于服务可用。']
    for key,value in values.items():
        if any(c in value for c in ['\n','\r','"']): raise ValueError('DRAFT_VALUE_REQUIRES_MANUAL_ENTRY')
        text.append(f'{key}="{value}"')
    dest.parent.mkdir(parents=True,exist_ok=True)
    with dest.open('x',encoding='utf-8',newline='\n') as f: f.write('\n'.join(text)+'\n')
    dest.chmod(0o600)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--env',type=Path,required=True)
    parser.add_argument('--environment',choices=['sandbox','production'],required=True)
    parser.add_argument('--report',type=Path)
    parser.add_argument('--draft',type=Path)
    parser.add_argument('--require',default='')
    args=parser.parse_args()
    requested=[x for x in args.require.split(',') if x]
    if any(x not in GROUPS for x in requested): parser.error('unknown required group')
    try:
        env=parse_env(args.env.read_text('utf-8-sig')); report=audit(env,args.environment)
        if args.draft: write_draft(env,args.draft,args.environment)
        result=json.dumps(report,ensure_ascii=False,indent=2)+'\n'
        if args.report:
            if args.report.resolve()==args.env.resolve() or args.draft and args.report.resolve()==args.draft.resolve(): raise ValueError('OUTPUT_PATH_CONFLICT')
            args.report.parent.mkdir(parents=True,exist_ok=True)
            with args.report.open('x',encoding='utf-8',newline='\n') as f:f.write(result)
        else: print(result,end='')
        return 2 if any(g['id'] in requested and not g['configuration_complete'] for g in report['groups']) else 0
    except (OSError,ValueError) as error:
        # Do not echo a filename or an invalid input value from parser/OS exceptions.
        print(json.dumps({'result':'ERROR','code':str(error) if isinstance(error,ValueError) and str(error).startswith(('ENV_','DRAFT_','OUTPUT_')) else 'FILE_OR_CONFIGURATION_ERROR'},ensure_ascii=False))
        return 1

if __name__=='__main__':
    raise SystemExit(main())
