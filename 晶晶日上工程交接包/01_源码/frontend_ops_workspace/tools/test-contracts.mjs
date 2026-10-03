import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import vue from '@vitejs/plugin-vue'
import { effectScope, reactive, createSSRApp, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { createPinia, setActivePinia } from 'pinia'

const root = fileURLToPath(new URL('..', import.meta.url))
const server = await createServer({ root, configFile: false, plugins: [vue()], resolve: { alias: { '@': `${root}/src` } }, server: { middlewareMode: true }, appType: 'custom' })
const originalFetch = globalThis.fetch
const tests = []
const test = (name, run) => tests.push({ name, run })
const ids = { account: '10000000-0000-4000-8000-000000000001', party: '20000000-0000-4000-8000-000000000001', other: '20000000-0000-4000-8000-000000000002', snapshot: '30000000-0000-4000-8000-000000000001', next: '30000000-0000-4000-8000-000000000002', rule: '40000000-0000-4000-8000-000000000001', rule2: '40000000-0000-4000-8000-000000000002' }
const identity = { token: 'test-opaque-token', partyId: ids.party, accountId: ids.account }
const rule = (id = ids.rule) => ({ format_version: 'rule-content-v1', id, rule_key: id === ids.rule ? '原始规则' : '历史规则', version: 'v1', terms: { items: [0, false, null], nested: { text: '<img src=x onerror=alert(1)>\n第二行' } }, content_sha256: 'a'.repeat(64) })
const snapshot = (id = ids.snapshot) => ({ format_version: 'contract-content-v1', id, contract_version_id: '50000000-0000-4000-8000-000000000001', party_ids: [ids.party], created_at: '2026-09-29T00:00:00.000Z', rule_contents: [rule(), rule(ids.rule2)], commitments: { zero: 0, agreed: false, empty: null, lines: '第一行\n第二行', ordered: ['甲', '乙'], nested: { literal: '<script>alert(1)</script>' } }, object_version: 1, current_status: 'SEALED', signing_method: 'NOT_SIGNED', content_sha256: 'b'.repeat(64) })
const status = (action = 'START_PAYMENT') => ({ action, environment: 'SANDBOX', current_status: 'NOT_ENABLED', reason_code: 'PROVIDER_NOT_IMPLEMENTED' })
const response = (data, { status = 200, actor = ids.account, party = ids.party } = {}) => new Response(JSON.stringify({ meta: { request_id: 'contract-test-request', actor: { account_id: actor }, acting_party: party }, ...(status < 300 ? { data } : { error: { code: status === 401 ? 'AUTHENTICATION_REQUIRED' : status === 404 ? 'SNAPSHOT_NOT_FOUND' : 'SERVICE_UNAVAILABLE', message: '未通过检查', retryable: false, details: [] } }) }), { status, headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'contract-test-request' } })
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
let passed = 0
try {
  const api = await server.ssrLoadModule('/src/api/modules/contracts.ts')
  const { loginRedirect } = await server.ssrLoadModule('/src/router/loginRedirect.ts')
  const { useSessionStore } = await server.ssrLoadModule('/src/stores/session.ts')
  const { useContractReader } = await server.ssrLoadModule('/src/composables/useContractReader.ts')
  const { onUnauthorized } = await server.ssrLoadModule('/src/api/client.ts')
  const ContractText = (await server.ssrLoadModule('/src/components/ContractText.vue')).default
  const createReader = () => {
    const context = reactive({ ...identity, revision: 0 })
    const scope = effectScope()
    const reader = scope.run(() => useContractReader(() => context))
    reader.snapshotId.value = ids.snapshot
    return { context, scope, reader }
  }
  test('登录仅返回工作台或指定合同，拒绝外站、双斜杠及伪UUID', async () => {
    for (const target of ['/workspace', '/contracts', `/contracts/${ids.snapshot}`]) assert.equal(loginRedirect(target), target)
    for (const target of ['https://example.com/contracts', '//example.com', '/\\example.com', '/contracts//example.com', '/contracts/' + '-'.repeat(36), '/contracts/' + 'a'.repeat(36), '/contracts/ABCDEF00-0000-4000-8000-000000000001', `/contracts/${ids.snapshot}?next=https://example.com`, `/contracts/${ids.snapshot}#fragment`, `/contracts/${ids.snapshot}\n`, '/contracts/%2f%2fexample.com', '/contracts/../workspace', ['/contracts'], null]) assert.equal(loginRedirect(target), '/workspace')
  })
  test('首次加载自动选身份不使会话过期，并以该身份读取直达合同', async () => {
    const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
    const values = new Map([['ops.session.token', identity.token]])
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) } })
    const pinia = createPinia(); setActivePinia(pinia)
    const store = useSessionStore()
    const captured = store.capture()
    const account = { id: ids.account, display_name: '测试账号', current_status: 'ACTIVE', object_version: 1, allowed_actions: [] }
    const party = { id: ids.party, kind: 'PERSON', display_name: '测试身份', current_status: 'PENDING_REVIEW', object_version: 1, capabilities: [], allowed_actions: [] }
    const membership = { id: 'member-test', account_id: ids.account, party_id: ids.party, current_status: 'ACTIVE', roles: ['MEMBER'], object_version: 1, allowed_actions: [] }
    const scope = effectScope()
    const reader = scope.run(() => useContractReader(() => ({ token: store.token, accountId: store.account?.id || '', partyId: store.selectedId, revision: store.revision })))
    reader.snapshotId.value = ids.snapshot
    const calls = []
    globalThis.fetch = async (url, options) => {
      calls.push({ url, options })
      if (url === '/api/v1/me') return response(account)
      if (url === '/api/v1/me/parties?limit=20') return response({ items: [{ party, membership }], next_cursor: null })
      return response(snapshot())
    }
    try {
      await Promise.all([store.loadAccount(), store.loadParties()])
      assert.ok(store.revision > captured.revision); assert.equal(store.current(captured), true); assert.equal(store.current(captured, true), false)
      assert.equal(store.selectedId, ids.party)
      if (store.current(captured) && reader.snapshotId.value) await reader.loadSnapshot()
      assert.equal(reader.snapshot.value.id, ids.snapshot)
      assert.equal(calls.at(-1).url, `/api/v1/contract-snapshots/${ids.snapshot}/content`)
      assert.equal(calls.at(-1).options.headers['X-Acting-Party'], ids.party)
      // A 401 from the old token cannot log out a replacement account session.
      const oldResponse = deferred(); globalThis.fetch = () => oldResponse.promise
      const pending = reader.loadSnapshot(); store.clearLocal(); store.token = 'replacement-token'; store.account = account
      oldResponse.resolve(response(null, { status: 401 })); await pending
      assert.equal(store.token, 'replacement-token'); assert.equal(reader.snapshot.value, null)
      assert.equal(store.current(captured), false)
    } finally {
      scope.stop(); store.$dispose(); setActivePinia(undefined); onUnauthorized(() => {})
      if (storageDescriptor) Object.defineProperty(globalThis, 'sessionStorage', storageDescriptor)
      else delete globalThis.sessionStorage
    }
  })
  test('三项 GET 使用精确地址、会话和身份，不带写入或缓存条件', async () => {
    const calls = []
    const data = [snapshot(), rule(), status()]
    globalThis.fetch = async (url, options) => { calls.push({ url, options }); return response(data.shift()) }
    await api.readSnapshot(identity, ids.snapshot)
    await api.readSnapshotRule(identity, ids.snapshot, ids.rule)
    await api.readServiceReadiness(identity, ids.snapshot, 'START_PAYMENT')
    assert.deepEqual(calls.map(c => c.url), [`/api/v1/contract-snapshots/${ids.snapshot}/content`, `/api/v1/rule-versions/${ids.rule}/content?snapshot_id=${ids.snapshot}`, `/api/v1/contract-snapshots/${ids.snapshot}/business-readiness?action=START_PAYMENT`])
    for (const { options } of calls) {
      assert.equal(options.method, 'GET'); assert.equal(options.cache, 'no-store'); assert.equal(options.credentials, 'omit')
      assert.equal(options.headers.Authorization, `Bearer ${identity.token}`); assert.equal(options.headers['X-Acting-Party'], ids.party)
      assert.match(options.headers['X-Request-Id'], /^[a-f0-9-]+$/)
      for (const key of ['Idempotency-Key', 'If-Match', 'If-None-Match']) assert.equal(options.headers[key], undefined)
      assert.equal(options.body, undefined)
    }
  })
  test('旧元数据、缺字段、未知格式或不正确的签署状态均拒绝', async () => {
    const invalid = [ { id: ids.snapshot, content_asset_id: 'old-file' }, { ...snapshot(), format_version: 'old' }, { ...snapshot(), signing_method: 'SIGNED' }, { ...snapshot(), object_version: 2 }, { ...snapshot(), commitments: {} }, { ...snapshot(), party_ids: [] }, { ...snapshot(), rule_contents: [] }, { ...snapshot(), content_sha256: 'invalid' }, { ...snapshot(), allowed_actions: [] }, { ...snapshot(), id: ids.next }, { ...snapshot(), rule_contents: [rule(), rule()] } ]
    for (const data of invalid) { globalThis.fetch = async () => response(data); await assert.rejects(api.readSnapshot(identity, ids.snapshot), e => e.code === 'UNEXPECTED_RESPONSE_SHAPE') }
    globalThis.fetch = async () => response(snapshot(), { actor: 'other-account' })
    await assert.rejects(api.readSnapshot(identity, ids.snapshot), e => e.code === 'UNEXPECTED_RESPONSE_SHAPE')
    globalThis.fetch = async () => new Response(JSON.stringify({ data: snapshot() }), { status: 200 })
    await assert.rejects(api.readSnapshot(identity, ids.snapshot), e => e.code === 'UNEXPECTED_RESPONSE_SHAPE')
  })
  test('开放正文保留数组、零、布尔、空值与嵌套文本', async () => {
    globalThis.fetch = async () => response(snapshot())
    assert.deepEqual((await api.readSnapshot(identity, ids.snapshot)).data.commitments, snapshot().commitments)
    globalThis.fetch = async () => response(rule())
    assert.deepEqual((await api.readSnapshotRule(identity, ids.snapshot, ids.rule)).data.terms, rule().terms)
  })
  test('四项服务和八种未启用原因可读，SERVICE_READY 仅为服务条件', async () => {
    for (const action of Object.keys(api.serviceActions)) {
      for (const reason_code of Object.keys(api.serviceReasons)) {
        globalThis.fetch = async () => response({ ...status(action), reason_code })
        assert.equal((await api.readServiceReadiness(identity, ids.snapshot, action)).data.current_status, 'NOT_ENABLED')
      }
      for (const environment of ['SANDBOX', 'PRODUCTION']) {
        globalThis.fetch = async () => response({ action, environment, current_status: 'SERVICE_READY', reason_code: null })
        const data = (await api.readServiceReadiness(identity, ids.snapshot, action)).data
        assert.equal(data.current_status, 'SERVICE_READY'); assert.equal(data.signing_method, undefined); assert.equal(data.allowed_actions, undefined)
      }
    }
    for (const data of [{ ...status(), reason_code: 'UNKNOWN' }, { ...status(), current_status: 'SERVICE_READY' }, { ...status(), current_status: 'PAID' }, { ...status(), environment: 'UNKNOWN' }, status('START_SIGNING')]) {
      globalThis.fetch = async () => response(data)
      await assert.rejects(api.readServiceReadiness(identity, ids.snapshot, 'START_PAYMENT'), e => e.code === 'UNEXPECTED_RESPONSE_SHAPE')
    }
  })
  test('无身份或错误编号不发请求，无负责人角色前置门槛', async () => {
    let calls = 0; globalThis.fetch = async () => { calls++; return response(snapshot()) }
    const { reader, context, scope } = createReader()
    context.partyId = ''; await reader.loadSnapshot(); assert.equal(calls, 0); assert.equal(reader.snapshot.value, null)
    context.partyId = ids.party; reader.snapshotId.value = 'short-id'; await reader.loadSnapshot(); assert.equal(calls, 0)
    reader.snapshotId.value = ids.snapshot; await reader.loadSnapshot(); assert.equal(calls, 1); assert.ok(reader.snapshot.value)
    scope.stop()
  })
  test('身份 A→B→A 后最初 A 的迟到成功仍被丢弃', async () => {
    const late = deferred(); globalThis.fetch = () => late.promise
    const { reader, context, scope } = createReader(); const pending = reader.loadSnapshot()
    context.partyId = ids.other; context.partyId = ids.party
    assert.equal(reader.snapshot.value, null); assert.equal(reader.busy.value, null)
    late.resolve(response(snapshot())); await pending
    assert.equal(reader.snapshot.value, null); assert.equal(reader.error.value, null)
    scope.stop()
  })
  test('同身份改合同、连续读取，只接受最新查询及其收尾', async () => {
    const first = deferred(), second = deferred(); let calls = 0
    globalThis.fetch = () => ++calls === 1 ? first.promise : second.promise
    const { reader, scope } = createReader(); const old = reader.loadSnapshot()
    reader.snapshotId.value = ids.next; const latest = reader.loadSnapshot()
    first.resolve(response(snapshot())); await old; assert.equal(reader.busy.value, 'snapshot'); assert.equal(reader.snapshot.value, null)
    second.resolve(response(snapshot(ids.next))); await latest; assert.equal(reader.snapshot.value.id, ids.next)
    const a = deferred(), b = deferred(); calls = 0; globalThis.fetch = () => ++calls === 1 ? a.promise : b.promise
    const p1 = reader.loadSnapshot(), p2 = reader.loadSnapshot(); b.resolve(response(snapshot(ids.next))); await p2
    a.resolve(response(null, { status: 503 })); await p1
    assert.equal(reader.snapshot.value.id, ids.next); assert.equal(reader.error.value, null)
    scope.stop()
  })
  test('更换规则或服务动作时迟到响应不回填', async () => {
    const { reader, scope } = createReader(); globalThis.fetch = async () => response(snapshot()); await reader.loadSnapshot()
    const oldRule = deferred(); globalThis.fetch = () => oldRule.promise; const p1 = reader.loadRule()
    reader.ruleId.value = ids.rule2; oldRule.resolve(response(rule())); await p1; assert.equal(reader.rule.value, null)
    globalThis.fetch = async () => response(rule(ids.rule2)); await reader.loadRule(); assert.equal(reader.rule.value.id, ids.rule2)
    const oldStatus = deferred(); globalThis.fetch = () => oldStatus.promise; const p2 = reader.checkReadiness()
    reader.action.value = 'START_SIGNING'; oldStatus.resolve(response(status())); await p2; assert.equal(reader.readiness.value, null)
    globalThis.fetch = async () => response(status('START_SIGNING')); await reader.checkReadiness(); assert.equal(reader.readiness.value.action, 'START_SIGNING')
    scope.stop()
  })
  test('权限被撤回、版本错误或读取失败清除整份私有内容', async () => {
    for (const httpStatus of [400, 403, 404, 412, 503]) {
      const { reader, scope } = createReader()
      globalThis.fetch = async () => response(snapshot()); await reader.loadSnapshot()
      globalThis.fetch = async () => response(rule()); await reader.loadRule()
      globalThis.fetch = async () => response(status()); await reader.checkReadiness()
      assert.ok(reader.snapshot.value && reader.rule.value && reader.readiness.value)
      globalThis.fetch = async () => response(null, { status: httpStatus }); await reader.loadRule()
      assert.equal(reader.snapshot.value, null); assert.equal(reader.rule.value, null); assert.equal(reader.readiness.value, null); assert.equal(reader.error.value.status, httpStatus)
      scope.stop()
    }
  })
  test('规则响应须属于合同保留的版本，拒绝当前规则替代历史规则', async () => {
    const { reader, scope } = createReader(); globalThis.fetch = async () => response(snapshot()); await reader.loadSnapshot()
    globalThis.fetch = async () => response({ ...rule(), version: 'v2' }); await reader.loadRule()
    assert.equal(reader.snapshot.value, null); assert.equal(reader.rule.value, null); assert.equal(reader.error.value.code, 'UNEXPECTED_RESPONSE_SHAPE')
    scope.stop()
  })
  test('退出、换账号、离开页面立即清理且阻止旧请求回填', async () => {
    for (const change of [(ctx) => { ctx.token = null }, (ctx) => { ctx.accountId = 'new-account'; ctx.token = 'new-token' }, (ctx) => { ctx.revision++ }]) {
      const { reader, context, scope } = createReader()
      globalThis.fetch = async () => response(snapshot()); await reader.loadSnapshot()
      const late = deferred(); globalThis.fetch = () => late.promise; const pending = reader.checkReadiness()
      change(context); assert.equal(reader.snapshot.value, null); assert.equal(reader.readiness.value, null)
      late.resolve(response(status())); await pending; assert.equal(reader.readiness.value, null); scope.stop()
    }
    const { reader, scope } = createReader(); const late = deferred(); globalThis.fetch = () => late.promise; const pending = reader.loadSnapshot(); scope.stop()
    late.resolve(response(snapshot())); await pending; assert.equal(reader.snapshot.value, null)
  })
  test('401 沿用账号失效处理，旧令牌的401不会清除新会话', async () => {
    const { reader, context, scope } = createReader()
    onUnauthorized(token => { if (token === context.token) context.token = null })
    globalThis.fetch = async () => response(null, { status: 401 }); await reader.loadSnapshot(); assert.equal(context.token, null); assert.equal(reader.snapshot.value, null)
    context.token = identity.token
    const late = deferred(); globalThis.fetch = () => late.promise; const pending = reader.loadSnapshot(); context.token = 'new-token'
    late.resolve(response(null, { status: 401 })); await pending; assert.equal(context.token, 'new-token'); assert.equal(reader.error.value, null)
    scope.stop(); onUnauthorized(() => {})
  })
  test('网络失败、非正文2xx和意外304不能恢复旧正文', async () => {
    for (const make of [() => { throw new TypeError('network failed') }, () => new Response('<h1>gateway</h1>', { status: 200 }), () => new Response(null, { status: 304 })]) {
      const { reader, scope } = createReader(); globalThis.fetch = async () => response(snapshot()); await reader.loadSnapshot()
      globalThis.fetch = async () => make(); await reader.loadSnapshot()
      assert.equal(reader.snapshot.value, null); assert.ok(reader.error.value); scope.stop()
    }
  })
  test('服务端 Retry-After 等待期不会再次读取，无效值不编造倒计时', async () => {
    for (const header of ['60', new Date(Date.now() + 60000).toUTCString()]) {
      const { reader, scope } = createReader(); let calls = 0
      globalThis.fetch = async () => { calls++; const result = response(null, { status: 429 }); result.headers.set('Retry-After', header); return result }
      await reader.loadSnapshot(); assert.ok(reader.retryAt.value > Date.now())
      await reader.loadSnapshot(); assert.equal(calls, 1)
      reader.retryAt.value = Date.now() - 1; globalThis.fetch = async () => { calls++; return response(snapshot()) }; await reader.loadSnapshot()
      assert.equal(calls, 2); assert.ok(reader.snapshot.value); scope.stop()
    }
    const { reader, scope } = createReader()
    globalThis.fetch = async () => { const result = response(null, { status: 429 }); result.headers.set('Retry-After', 'not-a-date'); return result }
    await reader.loadSnapshot(); assert.equal(reader.retryAt.value, 0); scope.stop()
  })
  test('正文组件实际渲染为转义纯文本，完整保留开放结构', async () => {
    const html = await renderToString(createSSRApp({ render: () => h(ContractText, { value: snapshot().commitments, label: '合同原文' }) }))
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;')); assert.ok(!html.includes('<script>'))
    assert.match(html, /<dt[^>]*>zero<\/dt>[\s\S]*?>0<\/pre>/); assert.match(html, /<dt[^>]*>agreed<\/dt>[\s\S]*?>false<\/pre>/); assert.match(html, /<dt[^>]*>empty<\/dt>[\s\S]*?>null<\/pre>/)
    assert.ok(html.indexOf('甲') < html.indexOf('乙')); assert.ok(html.includes('第一行\n第二行'))
    assert.ok(html.includes('tabindex="0"'))
  })
  for (const { name, run } of tests) { await run(); passed++; console.log(`✓ ${name}`) }
  console.log(`\n${passed} contract checks passed.`)
} finally { globalThis.fetch = originalFetch; await server.close() }
