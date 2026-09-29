<script setup lang="ts">
/**
 * 登录页。
 *
 * 对应后端接口（PR #11 / 契约 0.2.0-rc.1）：
 *   POST /api/v1/auth/sms-challenges   申请验证码
 *   POST /api/v1/auth/sessions         手机号 + 验证码换会话令牌
 *   GET  /api/v1/me                    读当前账号（登录后立刻调，验证令牌真的可用）
 *   GET  /api/v1/me/parties            读我的身份列表
 *
 * 页面上的字只干两件事：告诉用户这是什么、告诉他下一步做什么。
 * 不写实现说明、不写免责声明、不放探针——那些在 /dev/status（仅开发构建）。
 *
 * 三条行为约束（注意：约束体现在**行为**里，不是写在页面上的口号）：
 *   1. 不假装成功。没有演示账号，短信没配就返回 503 并如实报错。
 *   2. Idempotency-Key 按语义复用：改了输入就是新操作、换新键；
 *      请求结果未知（网络断开）时沿用原键，换键可能重复发短信或产生第二个会话。
 *   3. 错误如实展示：一句人话 + 错误码 + 请求号，机器值不藏也不摆在脸前。
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ApiError, newIdempotencyKey, outcomeUnknown } from '@/api/client'
import { createSmsChallenge } from '@/api/modules/account'
import type { SmsChallenge } from '@/api/types'
import { useSessionStore } from '@/stores/session'
import { loginRedirect } from '@/router/loginRedirect'
import ApiErrorAlert from '@/components/ApiErrorAlert.vue'

const router = useRouter()
const route = useRoute()
const session = useSessionStore()

const PHONE_RE = /^1[3-9]\d{9}$/
const CODE_RE = /^\d{6}$/

const phone = ref('')
const code = ref('')
const challenge = ref<SmsChallenge | null>(null)
/** 验证码是发给哪个号的——用来判断用户有没有中途改号 */
const challengePhone = ref('')

const sending = ref(false)
const submitting = ref(false)
const error = ref<ApiError | null>(null)

const codeInput = ref<HTMLInputElement | null>(null)

// —— 幂等键记账 ——
// 为什么不用一个自增计数器：键必须跟着"这一次逻辑操作"走，见文件头约束 2。
let sendKey: string | null = null
let sendKeyPhone: string | null = null
const sendOutcomeUnknown = ref(false)

let loginKey: string | null = null
let loginKeySig: string | null = null
const loginOutcomeUnknown = ref(false)

/** 申请验证码用的键：只有"上一次结果未知且手机号没变"才复用 */
function prepareSendKey(currentPhone: string): string {
  if (sendOutcomeUnknown.value && sendKey && sendKeyPhone === currentPhone) return sendKey
  sendKey = newIdempotencyKey()
  sendKeyPhone = currentPhone
  sendOutcomeUnknown.value = false
  return sendKey
}

/** 登录用的键：按 (手机号 + challenge + 验证码) 的签名复用，内容变了就换新键 */
function prepareLoginKey(sig: string): string {
  if (loginOutcomeUnknown.value && loginKey && loginKeySig === sig) return loginKey
  loginKey = newIdempotencyKey()
  loginKeySig = sig
  loginOutcomeUnknown.value = false
  return loginKey
}

// —— 倒计时：用后端给的 resend_after / expires_at，不写死 60 秒 ——
const now = ref(Date.now())
let ticker: number | undefined

onMounted(() => {
  ticker = window.setInterval(() => {
    now.value = Date.now()
  }, 1000)
})

onUnmounted(() => {
  if (ticker) window.clearInterval(ticker)
})

const hasChallenge = computed(() => !!challenge.value)
const resendLeft = computed(() => secondsLeft(challenge.value?.resend_after))
const expireLeft = computed(() => secondsLeft(challenge.value?.expires_at))
const canSend = computed(
  () => !sending.value && !submitting.value && !loginOutcomeUnknown.value && PHONE_RE.test(phone.value) && (!hasChallenge.value || resendLeft.value <= 0),
)
const canSubmit = computed(() => !sending.value && !submitting.value && !sendOutcomeUnknown.value && hasChallenge.value && (expireLeft.value > 0 || loginOutcomeUnknown.value) && CODE_RE.test(code.value))

const sendLabel = computed(() => {
  if (sending.value) return '发送中'
  if (sendOutcomeUnknown.value) return '重试原申请'
  if (hasChallenge.value && resendLeft.value > 0) return `重发 ${resendLeft.value}s`
  return hasChallenge.value ? '重新获取' : '获取验证码'
})

function secondsLeft(iso: string | undefined): number {
  if (!iso) return 0
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return 0
  return Math.max(0, Math.ceil((t - now.value) / 1000))
}

function fmtSeconds(s: number): string {
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

/** 换号 = 旧验证码作废。用户改一个数字就清掉，别让他拿旧码去登录。 */
function resetChallenge() {
  challenge.value = null
  challengePhone.value = ''
  code.value = ''
  sendOutcomeUnknown.value = false
  loginOutcomeUnknown.value = false
  loginKey = null
  loginKeySig = null
}

watch(phone, (v) => {
  error.value = null
  if (challenge.value && v !== challengePhone.value) resetChallenge()
})

watch(code, () => {
  error.value = null
})

async function sendCode() {
  error.value = null
  if (!PHONE_RE.test(phone.value)) {
    error.value = new ApiError({ status: 400, code: 'CLIENT_PHONE_INVALID', message: '请输入 11 位手机号。' })
    return
  }
  if (sending.value || submitting.value || !canSend.value) return
  const requestedPhone = phone.value
  const key = prepareSendKey(requestedPhone)
  sending.value = true
  try {
    const res = await createSmsChallenge({ phone: requestedPhone }, key)
    if (phone.value !== requestedPhone) return
    challenge.value = res.data
    challengePhone.value = requestedPhone
    sendOutcomeUnknown.value = false
    code.value = ''
    // grouping：连点两次"重新获取"时合并成一条，而不是叠两条一模一样的提示
    ElMessage({ message: '验证码已发送', grouping: true })
    await nextTick()
    codeInput.value?.focus()
  } catch (e) {
    if (phone.value !== requestedPhone) return
    const err = toApiError(e)
    error.value = err
    // 网络失败不能判断是否已到达；重试沿用原键
    // 请求没到达服务器 → 结果未知，下次重试必须沿用同一个键
    sendOutcomeUnknown.value = outcomeUnknown(err) && err.code !== 'SMS_CHALLENGE_UNAVAILABLE'
  } finally {
    sending.value = false
  }
}

async function submitLogin() {
  error.value = null
  if (!challenge.value || !canSubmit.value) return
  if (!CODE_RE.test(code.value)) {
    error.value = new ApiError({ status: 400, code: 'CLIENT_CODE_INVALID', message: '请输入 6 位数字验证码。' })
    return
  }

  const sig = `${phone.value}|${challenge.value.challenge_id}|${code.value}`
  const key = prepareLoginKey(sig)

  submitting.value = true
  try {
    await session.loginByCode({
      phone: phone.value,
      challengeId: challenge.value.challenge_id,
      code: code.value,
      idempotencyKey: key,
    })
    loginOutcomeUnknown.value = false

    // The destination reads its identities; a read failure must not spend the OTP again.
    await router.replace(loginRedirect(route.query.redirect))
  } catch (e) {
    const err = toApiError(e)
    error.value = err
    loginOutcomeUnknown.value = outcomeUnknown(err)
  } finally {
    submitting.value = false
  }
}

function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e
  return new ApiError({
    status: 0,
    code: 'UNEXPECTED_CLIENT_ERROR',
    message: e instanceof Error ? e.message : String(e),
    retryable: true,
  })
}

const year = new Date().getFullYear()
</script>

<template>
  <div class="auth">
    <main class="stage">
      <header class="brand">
        <h1 class="wordmark">晶晶日上</h1>
        <p class="role">让每次合作<br>都有清晰依据</p><p class="brand-note">从账号、机构到合同，安心推进每一步。</p>
      </header>

      <div class="panel">
        <h2 class="panel-title">登录工作台</h2><p class="panel-intro">使用本人手机号，继续你的合作。</p>

        <p v-if="session.notice" class="hint" role="status">{{ session.notice }}</p>
        <form @submit.prevent="submitLogin">
          <div class="field">
            <label class="label" for="phone">手机号</label>
            <div class="row">
              <input
                id="phone"
                v-model.trim="phone"
                type="tel"
                inputmode="numeric"
                autocomplete="tel"
                maxlength="11"
                placeholder="11 位手机号"
                :disabled="sending || submitting || sendOutcomeUnknown || loginOutcomeUnknown"
                data-testid="phone-input"
              />
              <button type="button" class="send" :disabled="!canSend" data-testid="send-code" @click="sendCode">
                {{ sendLabel }}
              </button>
            </div>
          </div>

          <div v-if="hasChallenge" class="field">
            <div class="label">
              <label for="code">验证码</label>
              <span class="hint">
                {{ expireLeft > 0 ? `${fmtSeconds(expireLeft)} 后失效` : '已失效，请重新获取' }}
              </span>
            </div>
            <div class="row">
              <input
                id="code"
                ref="codeInput"
                v-model.trim="code"
                type="text"
                inputmode="numeric"
                autocomplete="one-time-code"
                maxlength="6"
                placeholder="6 位数字"
                :disabled="sending || submitting || loginOutcomeUnknown"
                data-testid="code-input"
              />
            </div>
          </div>

          <ApiErrorAlert :error="error" testid="login-error" />

          <button
            v-if="hasChallenge"
            type="submit"
            class="submit"
            :disabled="!canSubmit"
            data-testid="submit-login"
          >
            {{ submitting ? '登录中' : '登录' }}
          </button>
        </form>
      </div>
    </main>

    <footer class="foot">© {{ year }} 晶晶日上</footer>
  </div>
</template>

<style scoped>
.auth{position:relative;min-height:100%;display:flex;align-items:center;justify-content:center;padding:80px 32px 110px;background:var(--ops-bg)}.stage{width:100%;max-width:1100px;display:grid;grid-template-columns:1fr 1fr;align-items:center;gap:110px}.brand{text-align:left}.wordmark{font-size:32px;font-weight:650;letter-spacing:.1em;color:var(--ops-ink);margin:0 0 38px}.role{font-size:40px;font-weight:600;line-height:1.55;color:var(--ops-text);margin:0 0 22px;letter-spacing:.03em}.brand-note{font-size:15px;line-height:1.8;color:var(--ops-text-2)}.panel{background:var(--ops-surface);padding:40px;border:1px solid var(--ops-border);border-radius:12px;min-width:0}.panel-title{font-size:26px;font-weight:600;margin:0 0 12px}.panel-intro{color:var(--ops-text-2);font-size:14px;line-height:1.8;margin:0 0 32px}.field+.field{margin-top:24px}.label{display:flex;align-items:baseline;justify-content:space-between;gap:10px;font-size:14px;color:var(--ops-text);margin-bottom:10px}.hint{font-size:12px;color:var(--ops-text-2);line-height:1.6;font-variant-numeric:tabular-nums}.row{display:flex;align-items:center;gap:10px}.row input{flex:1;min-width:0;min-height:48px;border:1px solid var(--ops-border-strong);border-radius:10px;background:var(--ops-surface);font:16px var(--ops-sans);color:var(--ops-text);padding:11px 12px}.row input::placeholder{color:var(--ops-text-3)}.send{flex:none;min-height:48px;border:1px solid var(--ops-border-strong);border-radius:10px;background:var(--ops-surface);font:14px var(--ops-sans);color:var(--ops-ink);padding:10px 12px;cursor:pointer;font-variant-numeric:tabular-nums}.send:hover:not(:disabled){background:var(--ops-accent-soft)}.send:disabled{color:var(--ops-text-3);cursor:default}.submit{width:100%;min-height:48px;margin-top:28px;border:0;border-radius:10px;background:var(--ops-ink);color:white;font:500 16px var(--ops-sans);cursor:pointer}.submit:hover:not(:disabled){background:var(--ops-ink-2)}.submit:disabled{opacity:.45;cursor:default}.foot{position:absolute;left:0;right:0;bottom:30px;text-align:center;font-size:12px;color:var(--ops-text-2)}
@media(max-width:900px){.stage{gap:50px}.panel{padding:32px}.role{font-size:32px}}
@media(max-width:680px){.auth{padding:40px 20px 90px;align-items:flex-start}.stage{grid-template-columns:1fr;max-width:440px;gap:30px}.wordmark{font-size:26px;margin-bottom:20px}.role{font-size:26px;margin-bottom:10px}.role br{display:none}.brand-note{font-size:13px;margin:0}.panel{padding:28px 22px}.panel-title{font-size:24px}.panel-intro{margin-bottom:26px}.foot{bottom:22px}}
</style>
