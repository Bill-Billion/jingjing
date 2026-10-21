import importlib.util
import json
import pathlib
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('audit',pathlib.Path(__file__).with_name('provider_config_audit.py'))
audit=importlib.util.module_from_spec(spec);spec.loader.exec_module(audit)

class ConfigurationTest(unittest.TestCase):
    def test_report_does_not_disclose_secret_and_never_connects(self):
        secret='TEST_ONLY_SECRET_123456789'
        with patch('socket.socket',side_effect=AssertionError('network forbidden')):
            report=audit.audit({'ARK_API_KEY':secret,'MYSQL_PASSWORD':secret},'sandbox')
        self.assertNotIn(secret,json.dumps(report))
        self.assertTrue(all(not g['real_service_verified'] for g in report['groups']))
    def test_embedded_placeholder_models_are_missing(self):
        report=audit.audit({'ARK_LLM_MODEL':'ep-your_llm_endpoint'},'sandbox')
        group=next(x for x in report['groups'] if x['id']=='models')
        self.assertIn('ARK_LLM_MODEL',group['missing_or_placeholder_fields'])
        self.assertFalse(group['current_runtime_implementation'])
    def test_production_forbids_sqlite_root_and_unverified_tls(self):
        base=audit.audit({'NODE_ENV':'development','DB_CLIENT':'sqlite','MYSQL_USER':'root','MYSQL_SSL_MODE':'disabled'},'production')['groups'][0]
        self.assertEqual(len(base['configuration_issues']),4)
        self.assertIn('MYSQL_SSL_CA',base['missing_or_placeholder_fields'])
    def test_complete_sms_still_not_verified(self):
        env={k:'TESTVALUE' for k in audit.GROUPS['sms'][1]};env['SMS_ENABLED']='false'
        sms=next(x for x in audit.audit(env,'sandbox')['groups'] if x['id']=='sms')
        self.assertTrue(sms['configuration_complete']);self.assertFalse(sms['switch_enabled']);self.assertFalse(sms['real_service_verified'])
    def test_old_oss_switch_cannot_pretend_to_disable_new_adapter(self):
        env={'NODE_ENV':'test','OSS_ENABLED':'false','OSS_REGION':'oss-cn-test','OSS_BUCKET':'test-private-bucket','OSS_ACCESS_KEY_ID':'TESTVALUE','OSS_ACCESS_KEY_SECRET':'TESTVALUE','OSS_ENVIRONMENT':'SANDBOX'}
        storage=next(x for x in audit.audit(env,'sandbox')['groups'] if x['id']=='storage')
        self.assertTrue(storage['configuration_complete']);self.assertIsNone(storage['switch_enabled']);self.assertFalse(storage['real_service_verified'])
    def test_wildcard_origin_is_not_a_valid_explicit_origin(self):
        base=audit.audit({'API_ALLOWED_ORIGINS':'https://*'},'production')['groups'][0]
        self.assertTrue(any('网页来源' in x for x in base['configuration_issues']))
    def test_old_payment_fields_are_not_accepted_as_new_fields(self):
        report=audit.audit({'ALIPAY_APP_ID':'TESTVALUE','ALIPAY_PID':'TESTVALUE'},'sandbox')
        payment=next(x for x in report['groups'] if x['id']=='alipay')
        self.assertIn('TRADE_ALIPAY_MERCHANT_PARTY_ID',payment['missing_or_placeholder_fields'])
        self.assertIn('TRADE_ALIPAY_APP_ID',payment['missing_or_placeholder_fields'])
    def test_parser_refuses_duplicates_without_echoing_values(self):
        with self.assertRaisesRegex(ValueError,'^ENV_DUPLICATE_LINE_2$'):
            audit.parse_env('ARK_API_KEY=TESTSECRET\nARK_API_KEY=ANOTHERSECRET')
        with self.assertRaisesRegex(ValueError,'^ENV_SYNTAX_LINE_1$'):
            audit.parse_env('TESTSECRET')
    def test_draft_only_private_no_overwrite_and_no_legacy_database(self):
        private=audit.ROOT/'.local';private.mkdir(exist_ok=True)
        folder=pathlib.Path(tempfile.mkdtemp(prefix='provider-audit-test-',dir=private))
        try:
            dest=folder/'sandbox.env'
            audit.write_draft({'MYSQL_HOST':'PRIVATE_OLD_HOST','MYSQL_PASSWORD':'TESTSECRET','ALIPAY_PID':'TESTMERCHANT','ARK_API_KEY':'TEST_ARK_KEY'},dest,'sandbox')
            text=dest.read_text('utf-8');self.assertNotIn('PRIVATE_OLD_HOST',text);self.assertNotIn('TESTSECRET',text)
            parsed=audit.parse_env(text)
            self.assertEqual(parsed['TRADE_ALIPAY_MERCHANT_ID'],'TESTMERCHANT')
            self.assertEqual(parsed['TRADE_ALIPAY_MERCHANT_PARTY_ID'],'')
            self.assertEqual(parsed['SMS_ENABLED'],'false')
            with self.assertRaises(FileExistsError):audit.write_draft({},dest,'sandbox')
            with self.assertRaisesRegex(ValueError,'DRAFT_MUST_BE_INSIDE_REPO_LOCAL'):audit.write_draft({},audit.ROOT/'forbidden.env','sandbox')
            with self.assertRaisesRegex(ValueError,'DRAFT_SANDBOX_ONLY'):audit.write_draft({},folder/'production.env','production')
        finally:
            self.assertEqual(folder.resolve().parent,private.resolve());shutil.rmtree(folder)
    def test_cli_unknown_group_and_malformed_values_do_not_leak(self):
        with tempfile.TemporaryDirectory(prefix='jx-config-test-') as folder:
            source=pathlib.Path(folder)/'source.env';source.write_text('ARK_API_KEY="PRIVATE_TEST_VALUE',encoding='utf-8')
            cmd=[sys.executable,str(pathlib.Path(audit.__file__)),'--env',str(source),'--environment','sandbox']
            result=subprocess.run(cmd,capture_output=True,text=True)
            self.assertEqual(result.returncode,1);self.assertNotIn('PRIVATE_TEST_VALUE',result.stdout+result.stderr)
            result=subprocess.run(cmd+['--require','does_not_exist'],capture_output=True,text=True)
            self.assertEqual(result.returncode,2);self.assertNotIn('PRIVATE_TEST_VALUE',result.stdout+result.stderr)

if __name__=='__main__':unittest.main()
