"""Validate the R0.6 OpenAPI candidate and protocol payloads, with no network/DB.

Install contracts/requirements.txt into an isolated development venv first.
"""
import argparse
from copy import deepcopy
import hashlib
from importlib.metadata import version
import json
from pathlib import Path
import platform
import re
import sys
from unittest.mock import patch

import yaml
from jsonschema import Draft202012Validator, FormatChecker
from openapi_spec_validator import OpenAPIV31SpecValidator

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / 'contracts/openapi.yaml'


class UniqueKeyLoader(yaml.SafeLoader):
    """Reject silent shadowing of a duplicated route/schema/response key."""


def mapping(loader, node, deep=False):
    loader.flatten_mapping(node)
    result = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        if key in result:
            raise ValueError(f'Duplicate YAML key {key!r} at line {key_node.start_mark.line + 1}')
        result[key] = loader.construct_object(value_node, deep=deep)
    return result


UniqueKeyLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, mapping)


def refs(node):
    if isinstance(node, dict):
        if '$ref' in node:
            yield node['$ref']
        for value in node.values():
            yield from refs(value)
    elif isinstance(node, list):
        for value in node:
            yield from refs(value)


def resolve(spec, pointer):
    if not pointer.startswith('#/'):
        raise ValueError('Only bundled local references allowed: ' + pointer)
    result = spec
    for key in pointer[2:].split('/'):
        result = result[key.replace('~1', '/').replace('~0', '~')]
    return result


def validate(runtime_fixtures=None):
    spec = yaml.load(CONTRACT.read_text(encoding='utf-8'), Loader=UniqueKeyLoader)
    for pointer in refs(spec):
        resolve(spec, pointer)
    OpenAPIV31SpecValidator(spec).validate()
    schemas = spec['components']['schemas']
    fixtures = json.loads((ROOT/'contracts/examples/platform.json').read_text(encoding='utf-8'))
    negatives = json.loads((ROOT/'contracts/tests/schema_cases.json').read_text(encoding='utf-8'))['cases']
    negatives += json.loads((ROOT/'contracts/tests/account_permission_cases.json').read_text(encoding='utf-8'))['cases']
    failures, checks = [], []
    runtime_cases, runtime_sources, runtime_reports = [], [], []
    inputs = runtime_fixtures if isinstance(runtime_fixtures, list) else ([runtime_fixtures] if runtime_fixtures else [])
    for source in inputs:
        raw = source.read_bytes()
        runtime_data = json.loads(raw.decode('utf-8'))
        if runtime_data.get('synthetic_only') is not True or not isinstance(runtime_data.get('cases'), list) or not runtime_data['cases']:
            raise ValueError('Runtime fixtures must contain explicitly synthetic cases: ' + str(source))
        runtime_sources.append((source, hashlib.sha256(raw).hexdigest(), runtime_data['cases']))
        runtime_cases.extend(runtime_data['cases'])

    def check(condition, name):
        checks.append(name)
        if not condition:
            failures.append(name)

    validators = {}
    def valid(schema, value):
        if schema not in validators:
            root = {'$schema':'https://json-schema.org/draft/2020-12/schema',
                    '$ref':'#/components/schemas/'+schema,'components':spec['components']}
            validators[schema] = Draft202012Validator(root, format_checker=FormatChecker())
        return validators[schema].is_valid(value)

    check(fixtures['synthetic_only'] is True, 'Examples explicitly synthetic')
    fixture_map = {x['schema']:x for x in fixtures['cases']}
    for x in fixtures['cases']:
        check(valid(x['schema'], x['value']), 'Valid example: '+x['name'])
    for x in negatives:
        if 'fixture' in x:
            fixture = fixture_map[x['fixture']]
            schema, value = fixture['schema'], deepcopy(fixture['value'])
            path = x.get('mutate_path', x.get('remove_path'))
            target = value
            for key in path[:-1]:
                target = target[key]
            if 'remove_path' in x:
                del target[path[-1]]
            else:
                target[path[-1]] = x['replace_with']
        else:
            schema, value = x['schema'], x['value']
        check(not valid(schema, value), 'Rejected example: '+x['name'])

    # Compile route patterns once; preserve concrete-path precedence and ambiguity rejection.
    routes = {}
    for route, item in spec['paths'].items():
        pattern = re.compile(re.sub(r'\{[^}]+\}', '[^/]+', route))
        for method, operation in item.items():
            if method in {'get','post','patch','put','delete','head','options','trace'}:
                routes.setdefault(method, []).append((pattern, operation))
    runtime_failure_start, runtime_check_start = len(failures), len(checks)
    for source, sha, cases in runtime_sources:
        failure_start, check_start = len(failures), len(checks)
        for x in cases:
            schema = x['schema']
            if 'method' in x and 'path' in x:
                method = x['method'].lower()
                matches = [op for pattern, op in routes.get(method, []) if pattern.fullmatch(x['path'])]
                exact = spec['paths'].get(x['path'], {}).get(method)
                if exact is not None:
                    matches = [exact]
                check(len(matches) == 1, 'Actual HTTP route declared: '+x['method']+' '+x['path'])
                if len(matches) == 1 and schema != 'ErrorResponse':
                    schema = matches[0]['responses']['200']['content']['application/json']['schema']['$ref'].split('/')[-1]
            check(valid(schema,x['value']), 'Actual HTTP response: '+schema)
        runtime_reports.append({'fixtures':str(source), 'sha256':sha, 'runtime_response_cases':len(cases),
                                'checks':len(checks)-check_start, 'failures':failures[failure_start:]})
    runtime_failure_end, runtime_check_end = len(failures), len(checks)

    # Candidate protocol invariants. These are not server behavioral tests.
    implemented_ids=set(json.loads((ROOT/'contracts/implementation.json').read_text(encoding='utf-8'))['isolated_tested_operations'])
    operations = []
    provider_callbacks={'receiveAppleTradeNotification','receiveAlipayTradeNotification'}
    public_ids = provider_callbacks | {'createSmsChallenge','createSession','getLiveness','getReadiness'}
    customization_account_scopes = {
        'listCustomizationCategories': 'ACCOUNT',
        'getCustomizationRequest': 'ACCOUNT_OR_AUTHORIZED_REVIEWER',
        'getCustomizationSupplement':'ACCOUNT_OR_AUTHORIZED_REVIEWER',
        'listCustomizationSubmissions':'ACCOUNT_OR_AUTHORIZED_REVIEWER',
        'listCustomizationQuotes':'ACCOUNT_OR_AUTHORIZED_REVIEWER',
        'getCustomizationSubmission':'ACCOUNT_OR_AUTHORIZED_REVIEWER',
        'requestCustomizationSupplement':'AUTHORIZED_CUSTOMIZATION_OPERATOR',
        'listCustomizationIntakeRequests': 'AUTHORIZED_CUSTOMIZATION_OPERATOR',
        'intakeCustomizationRequest': 'AUTHORIZED_CUSTOMIZATION_OPERATOR',
    }
    personal_collection_ops = {'recordPersonalVisit', 'getCollectionPreferences', 'listPersonalFavorites', 'listPersonalHistory', 'getPersonalCollectionTarget', 'setCollectionPreferences', 'clearPersonalHistory', 'removePersonalHistory', 'setPersonalFavorite'}
    personal_collection_ops.update({'cancelPhoneChange', 'getPhoneChange', 'getCurrentPhoneChange', 'createPhoneChange', 'confirmPhoneChange', 'verifyPhoneChangeChallenge', 'sendPhoneChangeChallenge'})
    # Newly reviewed operator-only endpoints use no acting-party header.
    for path, item in spec['paths'].items():
        for method, op in item.items():
            if method not in {'get','post','patch','put','delete'}:
                continue
            operations.append(op['operationId'])
            security = op.get('security', spec.get('security'))
            check((security == []) == (op['operationId'] in public_ids), 'Security: '+op['operationId'])
            params = [resolve(spec, p['$ref']) if '$ref' in p else p for p in op.get('parameters',[])]
            headers = {p['name']:p for p in params if p['in']=='header'}
            if op['operationId'] in provider_callbacks:
                check(op.get('x-provider-signature-required') is True, 'Provider signature required: '+path)
            if method in {'post','patch','put','delete'} and op['operationId'] not in provider_callbacks:
                if op['operationId'] == 'reportPersonalUsage':
                    check(path == '/api/v1/privacy/usage/pulse' and method == 'post' and op.get('x-idempotency-mode') == 'SERVER_TIME_SAMPLE', 'Server time sampling exception is explicit and bounded')
                else:
                    check(headers.get('Idempotency-Key',{}).get('required') is True, 'Mutation idempotency: '+path)
                check('409' in op['responses'], 'Mutation replay conflict: '+path)
            if method == 'patch' or op['operationId'] in {'submitCustomizationRequest','intakeCustomizationRequest','requestCustomizationSupplement','submitCustomizationSupplement'}:
                check(headers.get('If-Match',{}).get('required') is True, 'Mutation version: '+path)
                check({'412','428'} <= set(op['responses']), 'Version error statuses: '+path)
            account_scoped_supply = {'listDiscoveryCities','searchPublicCatalogues','listStockSalesPublications','createStockSalesPublication','reviewStockSalesPublication','listStockSalesPublicationSources','readPublicArtistListing','readPublicArtistMedia','listWalletRules','createWalletRule','reviewWalletRule','reviewWalletLevelSix','reviewAuditionDelivery','reviewAuditionOffer','reviewAuditionBooking','expireAudition','resolveAuditionCase','manageAuditionSupport','sendAuditionMessage','markAuditionMessagesRead','reviewAuditionReschedule','listAuditionCatalog','listAuditionRecords','getAuditionRecord','getAuditionContacts','getAuditionMessages','getAuditionItinerary','downloadAuditionMaterial','listNoticeRules','createNoticeRule','recordNoticeFinancialFact','createAnnouncement','reviewNoticeRecord','closeNoticeRecord','linkNoticeQuote','listNoticeRecords','getNoticeRecord','listNoticeCatalog','getNoticePublic','downloadNoticeMaterial','listStockListings','getStockListing','reviewStockListing','changeReviewedStockStatus','listStockCatalog','getStockOffer','downloadStockPreview','downloadStockReviewFile','downloadStockEvidence','getStockPurchase','resolveStockCase','getCustomizationFulfillment','getProductionStory','resolveCustomizationCase','downloadCustomizationCaseEvidence','getArtistServices','listArtistCatalogue','listArtistReviews','getArtistRecord','reviewArtistRecord','recordArtistServiceResult','downloadArtistReviewAsset','downloadArtistPublicPreview','previewMarketplaceFinance','listSupplyRecords','getSupplyRecord','getSupplyAsset','downloadSupplyAsset',
                'reviewSupplyProfile','reviewSupplyWorkVersion','reviewSupplyConsent','withdrawSupplyConsent',
                'reviewLicenseRecord','activateLicense','suspendLicense','listLicenseRecords','getLicenseRecord','downloadLicenseEvidence','downloadIPProcurementEvidence','reviewTradeRecord','executeTradeRefund','importTradeLegacyOrder','listTradeRecords','getTradeRecord','downloadTradeEvidence','reviewProductionRecord','getProductionRecord','listProductionRecords','downloadManualSampleOwnedContent','downloadProductionContent','downloadProductionEvidence','getProductionJob','retryProductionJob','reviewProjectOperation','listProjectCatalogue','listManagedProjects','getProjectRecord','listProjectRecords','listProjectConfirmations','getProjectReadiness','downloadProjectEvidence','createGigRule','retireGigRule','reviewGigRecord','suspendGig','createGigRanking','listGigRecords','getGigRecord','listGigCatalogue','getGigRanking','downloadGigEvidence','decideDisputeFinanceOperation','reviewFinanceOperation','listFinanceAgreements','listFinanceRecords','getFinanceRecord','listFinanceConfirmations','getFinanceReadiness','getFinanceBalances','listFinanceEntries','downloadFinanceEvidence','listBusinessComments','addBusinessComment','changeBusinessComment','listOperationsAudit','listBusinessAudit','requestBusinessReport','listMyBusinessReports','getBusinessReport','downloadBusinessReport','retryBusinessReport'}
            account_scoped_supply.update({'getPrivacyCopyOptions','downloadPrivacyCopyFile','getPrivacyStoryCopy','getPrivacyTransactionCopy','getPrivacyAccountCopy'})
            account_scoped_supply.update({'getStockPublicMedia','downloadStockCover'})
            account_scoped_supply.update({'getDiscoveryRecommendations','getDiscoveryMatches','getEngagementRankingExplanation'})
            account_scoped_supply.update({'listDirectoryRecords', 'downloadDirectoryMaterial', 'listPublicOrganizations', 'downloadOrganizationCover', 'listFeaturedArtists', 'getDirectoryRecord', 'getPublicOrganization', 'withdrawDirectoryRecord', 'proposeDirectoryFeature', 'reviewDirectoryRecord'})
            account_scoped_supply.update({'customizationAttachments','downloadCustomizationAttachment'})
            account_scoped_supply.update({'withdrawPrivacyConsent', 'requestPrivacyModelDeletion', 'getPrivacyActions', 'getPrivacyModelAssets', 'getPrivacyModelCreations'})
            account_scoped_supply.update({'applyPrivacyExecution', 'applyPrivacyExecutionForHandler', 'getMediaTask', 'proposePrivacyExecutionForHandler', 'listPrivacyExecutionsForHandler', 'listPrivacyExecutions', 'reviewPrivacyExecution', 'exportPrivacyData', 'proposePrivacyExecution'})
            account_scoped_supply.update({'reviewMediaTask', 'getMediaTaskForReview'})
            personal_collection_ops.update({'getPersonalUsage','reportPersonalUsage','acknowledgePersonalRest'})
            account_scoped_supply.update({'getConsumerRiskStatus','listConsumerRiskRules','createConsumerRiskRule','reviewConsumerRiskRule'})
            account_scoped_supply.update({'listPrivacyExecutionPolicyOptions','listOperationsPrivacyExecutionPolicyOptions','listPrivacyRetentionPolicyOptions','listPrivacyFileOptions','downloadPrivacyOriginalFile','getPrivacyRequest', 'startPrivacyRequest', 'reviewPrivacyResponse', 'downloadPrivacyResponseFile', 'createPrivacyRequest', 'savePrivacyPreferences', 'getPrivacyPreferences', 'getPrivacyRequestForHandler', 'proposePrivacyResponse', 'listPrivacyRequestsForHandler', 'getPrivacyResponseHistory', 'reopenPrivacyRequest', 'listPrivacyRequests'})
            account_scoped_supply.update({'reviewProjectIncomeAgreement','controlCommercialConversation', 'engagementProposeTie', 'engagementQueue', 'engagementCompetitionResult', 'listAuditionSupplements', 'engagementInteraction', 'listCommercialMessages', 'engagementRead', 'readCommercialMessage', 'engagementSyncGrowth', 'engagementReviewTie', 'engagementBuyerCityRank', 'engagementReviewRule', 'reviewAuditionSupplementRefund', 'engagementFinalize', 'engagementRankings', 'engagementExposures', 'engagementReviewRewardStock', 'engagementModerate', 'engagementCreateRule', 'engagementRedeemReward', 'engagementReferralSync', 'engagementExcludeOrder', 'engagementVoteReview', 'engagementCompetition', 'downloadCommercialMessageFile', 'getCommercialContacts', 'engagementRankingSnapshot', 'reviewAuditionSupplement', 'engagementReviewCandidate', 'engagementRankingIndex', 'sendCommercialMessage', 'moderateCommercialMessage', 'engagementCompetitions', 'downloadEngagementListen', 'engagementJudge', 'engagementResolveAppeal', 'engagementReviewCompetition'})
            account_scoped_supply.update({'cocreationDownloadReviewFile', 'cocreationReviewCase', 'cocreationClose', 'cocreationQueue', 'cocreationReviewSnippet', 'cocreationRules', 'cocreationCreateRule', 'cocreationCases', 'cocreationRoom', 'cocreationReviewRule'})
            account_scoped_supply.update({'reviewParticipationAgreement', 'getParticipationProgress'})
            account_scoped_supply.update({'redemptionExposures', 'redemptionCatalog', 'redemptionEvidence', 'redemptionReviewPool', 'redemptionRetirePool', 'redemptionPools', 'redemptionPool', 'redemptionProposeDelivery', 'redemptionReviewStock', 'redemptionReviewDelivery', 'redemptionQueue', 'redemptionReviewRemedy', 'redemptionFinish'})
            account_scoped_supply.add('redemptionDeliveryEvidenceOptions')
            account_scoped_supply.update({'decideGuardianRecordForOperator', 'getInfringementCaseForOperator', 'listGuardianRecords', 'listInfringementCasesForOperator', 'getGuardianRecordForOperator', 'requestReviewedGuardianRefund', 'inviteGuardianLink', 'listGuardianRecordsForOperator', 'reviewPrivacyClosureClock', 'createGuardianRefundRequest', 'downloadInfringementEvidenceForOperator', 'getGuardianRecord', 'listPrivacyClosureClocks', 'createGuardianSpendingConsent', 'getGuardianUsage', 'decideGuardianRecord', 'createGuardianUsageSession', 'createGuardianPrivacyRequest', 'proposePrivacyClosureClock', 'getPrivacyClosureClock', 'actOnInfringementCaseForOperator', 'getPrivacyClosureClockForOperator', 'updateGuardianControls', 'getGuardianInformation'})
            account_scoped_supply.update({'listGuardianSuitableContent','downloadGuardianSuitablePreview'})
            account_scoped_supply.update({'importDailyReconciliationStatement', 'recordDailyReconciliationManualEvidence', 'createDailyReconciliation', 'getDailyReconciliationHistory', 'reviewDailyReconciliation', 'reopenDailyReconciliation', 'getDailyReconciliation', 'downloadDailyReconciliationEvidence', 'listDailyReconciliationFacts', 'compareDailyReconciliation', 'listDailyReconciliations'})
            account_scoped_supply.add('getOperatorInvoiceCommandResult')
            account_scoped_supply.add('downloadAuditionDisputeEvidence')
            account_scoped_supply.add('listNoticeCaseQuoteOptions')
            account_scoped_supply.update({'listInvoiceRequestsForOperator', 'downloadInvoiceDocumentForOperator', 'listInvoiceDocumentsForOperator', 'downloadInvoiceEvidenceForOperator', 'listInvoiceHistoryForOperator', 'actOnInvoiceForOperator', 'getInvoiceRequestForOperator'})
            account_scoped_supply.update({'actOnSupportTicketForSupport', 'downloadSupportEvidenceForSupport', 'listSupportHistoryForSupport', 'listSupportTicketsForSupport', 'getSupportTicketForSupport'})
            if op['operationId'] in customization_account_scopes:
                check(op.get('x-actor-scope') == customization_account_scopes[op['operationId']],
                      'Customization actor scope: '+path)
                if op['operationId'] in {'getCustomizationRequest','getCustomizationSupplement','listCustomizationSubmissions','getCustomizationSubmission','listCustomizationQuotes'}:
                    check(headers.get('X-Acting-Party',{}).get('required') is False,
                          'Customization owner-or-operator read: '+path)
                else:
                    check('X-Acting-Party' not in headers, 'Customization account-scoped action: '+path)
            if op['operationId'] in account_scoped_supply:
                expected_scope = 'ACCOUNT_SELF' if op['operationId'] in {'exportPrivacyData','getPrivacyCopyOptions','downloadPrivacyCopyFile','getPrivacyStoryCopy','getPrivacyTransactionCopy','getPrivacyAccountCopy'} else 'ACCOUNT_OR_AUTHORIZED_REVIEWER'
                check(op.get('x-actor-scope') == expected_scope, 'Supply actor scope: '+path)
            if op['operationId'] in personal_collection_ops | {'getMyPartyAccess'}:
                check(op.get('x-actor-scope') == 'ACCOUNT' and 'X-Acting-Party' not in headers, 'Personal collection scope: '+path)
            if path.startswith('/api/v1/') and op['operationId'] not in account_scoped_supply | provider_callbacks | set(customization_account_scopes) | personal_collection_ops | {'getMyPartyAccess'} and path not in {
                    '/api/v1/auth/sms-challenges','/api/v1/auth/sessions','/api/v1/me',
                    '/api/v1/me/parties','/api/v1/identity-verifications/current',
                    '/api/v1/auth/sessions/current','/api/v1/organizations','/api/v1/me/invitations'}:
                check(headers.get('X-Acting-Party',{}).get('required') is True, 'Acting party: '+path)
            check(op['x-implementation-status'] in {'NOT_IMPLEMENTED','IMPLEMENTED_ISOLATED_TESTS'}, 'Implementation status declared: '+op['operationId'])
            if op['x-implementation-status']=='IMPLEMENTED_ISOLATED_TESTS':
                check(op['operationId'] in implemented_ids, 'Runtime evidence declared: '+op['operationId'])
            else:
                check(op['operationId'] not in implemented_ids, 'Unimplemented boundary: '+op['operationId'])
            if op['operationId'] in {'createCustomizationRequest','getCustomizationRequest',
                    'updateCustomizationRequest','submitCustomizationRequest','intakeCustomizationRequest','getCustomizationSupplement','saveCustomizationSupplement','requestCustomizationSupplement','submitCustomizationSupplement'}:
                check('ETag' in op['responses']['200'].get('headers',{}),
                      'Customization object version header: '+path+' '+method)
            for code, response in op['responses'].items():
                response = resolve(spec,response['$ref']) if '$ref' in response else response
                check('X-Request-Id' in response.get('headers',{}), f'Request correlation: {path} {code}')
                if op['operationId'] in {'downloadPrivacyCopyFile','downloadDailyReconciliationEvidence','downloadGuardianSuitablePreview','downloadInfringementEvidence','downloadInfringementEvidenceForOperator','downloadInvoiceEvidence','downloadInvoiceDocument','downloadInvoiceEvidenceForOperator','downloadInvoiceDocumentForOperator','downloadSupportEvidence','downloadSupportEvidenceForSupport','downloadDirectoryMaterial','downloadCustomizationAttachment','downloadPrivacyOriginalFile','downloadPrivacyResponseFile','redemptionEvidence','cocreationDownloadReviewFile','cocreationDownloadMaterial','cocreationDownloadSnippet','downloadEngagementReward','downloadEngagementListen','downloadCommercialMessageFile','downloadAuditionMaterial','downloadAuditionDisputeEvidence','downloadNoticeMaterial','downloadStockPreview','downloadStockReviewFile','downloadStockEvidence','downloadPurchasedStock','downloadCustomizationCaseEvidence','downloadArtistAsset','downloadArtistReviewAsset','downloadArtistPublicPreview','downloadSupplyAsset','downloadLicenseEvidence','downloadIPProcurementEvidence','downloadTradeEvidence','downloadManualSampleOwnedContent','downloadProductionContent','downloadProductionEvidence','downloadProjectEvidence','downloadGigEvidence','downloadFinanceEvidence'} and code=='200':
                    check(response['content'].get('application/octet-stream',response['content'].get('audio/*',response['content'].get('video/*',{})))['schema']=={'type':'string','format':'binary'}, 'Private file binary response')
                    check('Cache-Control' in response.get('headers',{}), 'Private file no-store declared')
                    continue
                if op['operationId'] in {'downloadStockCover','downloadOrganizationCover'} and code=='200':
                    check(response['content']['image/jpeg']['schema']=={'type':'string','format':'binary'}, 'Stock cover binary response')
                    check('Cache-Control' in response.get('headers',{}), 'Stock cover no-store declared')
                    continue
                if op['operationId']=='downloadBusinessReport' and code=='200':
                    check(response['content']['text/csv']['schema']=={'type':'string','format':'binary'}, 'Report CSV response')
                    check('Cache-Control' in response.get('headers',{}), 'Report no-store declared')
                    continue
                if op['operationId']=='receiveAlipayTradeNotification' and code=='200':
                    check(response['content']['text/plain']['schema'].get('const')=='success', 'Alipay acknowledgement')
                    continue
                schema_ref = response['content']['application/json']['schema']['$ref']
                check(schema_ref.split('/')[-1] in fixture_map, f'Response fixture: {path} {code}')
                if int(code)>=400 and path!='/ready':
                    check(schema_ref.endswith('/ErrorResponse'), f'Consistent error body: {path} {code}')
    check(len(operations)==len(set(operations)), 'Unique operation IDs')
    check(all(s['url'].startswith('http://127.0.0.1:') for s in spec['servers']), 'Local server only')
    check(set(spec['paths']['/api/v1/contract-snapshots/{snapshot_id}'])=={'get'}, 'Snapshot is read-only')
    # Positive boundary cases prevent rejection tests from passing on an always-invalid schema.
    check(valid('Money',{'amount_minor':0,'currency':'CNY'}), 'Zero minor amount valid')
    check(valid('Money',{'amount_minor':9007199254740991,'currency':'JPY'}), 'Maximum safe integer and non-CNY valid')
    check(valid('IdentityVerification',{'current_status':'VERIFIED','verification_id':'verification_test',
              'verified_at':'2026-09-21T00:00:00Z','allowed_actions':[]}), 'Verified with evidence structurally valid')
    production = deepcopy(fixture_map['ProviderReadinessPageResponse']['value']['data']['items'][0])
    production['current_status']='PRODUCTION_VERIFIED'
    production['verification_history'].append({'verified_state':'PRODUCTION_VERIFIED','environment':'PRODUCTION',
        'verified_at':'2026-09-21T00:00:00Z','evidence_ref':'production_synthetic'})
    check(valid('ProviderReadiness',production), 'Production with matching evidence structurally valid')
    report = {'result':'FAIL' if failures else 'PASS','contract_version':spec['info']['version'],
              'contract_sha256':hashlib.sha256(CONTRACT.read_bytes()).hexdigest(),
              'openapi_version':spec['openapi'],'operations':len(operations),'schemas':len(schemas),
              'runtime_response_cases':len(runtime_cases),'valid_fixtures':len(fixtures['cases']),'negative_cases':len(negatives),
              'checks':len(checks),'failures':failures,'python':platform.python_version(),
              'tools':{p:version(p) for p in ['openapi-spec-validator','jsonschema','PyYAML']},
              'network_during_validation':'DISABLED','runtime_tests':'NOT_RUN',
              'limits':'Schema and declared protocol only. Runtime permissions, SMS/payment, DB transactions, idempotency races and client SDK generation remain unverified.'}
    if isinstance(runtime_fixtures, list):
        report['runtime_files'] = runtime_reports
        report['common_checks'] = len(checks) - (runtime_check_end-runtime_check_start)
        report['common_failures'] = failures[:runtime_failure_start] + failures[runtime_failure_end:]
    return report


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--report',type=Path,help='Optional JSON result file')
    parser.add_argument('--runtime-fixtures',type=Path,help='Synthetic responses captured by real loopback HTTP tests')
    args=parser.parse_args()
    try:
        with patch('socket.socket.connect',side_effect=RuntimeError('Network forbidden during contract validation')):
            report=validate(args.runtime_fixtures)
    except Exception as exc:
        report={'result':'FAIL','error':str(exc),'runtime_tests':'NOT_RUN'}
    output=json.dumps(report,ensure_ascii=False,indent=2)+'\n'
    print(output,end='')
    if args.report:
        args.report.parent.mkdir(parents=True,exist_ok=True)
        args.report.write_text(output,encoding='utf-8',newline='\n')
    sys.exit(0 if report['result']=='PASS' else 1)
