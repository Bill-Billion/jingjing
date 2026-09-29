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

    // Workspace reads the account and identities; a read failure must not spend the OTP again.
    const redirect = typeof route.query.redirect === 'string' && route.query.redirect === '/workspace' ? route.query.redirect : '/workspace'
    await router.replace(redirect)
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
        <h1 class="wordmark">晶选片场</h1>
        <p class="role">运营工作台</p>
      </header>

      <div class="panel">
        <span class="mk tl" /><span class="mk tr" /><span class="mk bl" /><span class="mk br" />

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

    <footer class="foot">© {{ year }} 晶选片场</footer>
  </div>
</template>

<style scoped>
/*
 * 版面：满屏深墨底 + 居中白色面板。
 * 不用圆角、不用投影——白面板压在墨底上，边界本身就是分界，
 * 加了圆角和柔和投影就变成"后台模板卡片套装"了。
 */
.auth {
  position: relative;
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  /*
   * 底部比顶部多留 32px：页脚是绝对定位钉在底边的，不参与居中。
   * 这样"面板居中"和"页脚在底"是两件互不干扰的事——如果页脚也在流里，
   * 居中的就是「面板 + 页脚」这一整块，面板会被页脚的高度顶得偏上。
   */
  padding: 56px 20px 88px;
  background: var(--ops-ink);
  /* 一点极淡的顶光，让整块墨底不是死板的纯色 */
  background-image: radial-gradient(1100px 520px at 50% 20%, rgba(201, 164, 94, 0.09), transparent 62%);
}

.stage {
  width: 100%;
  max-width: 384px;
  /* 一次到位的进场：只此一处动效，不做逐段 fade-slide */
  animation: rise 0.42s cubic-bezier(0.22, 0.61, 0.36, 1) both;
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .stage {
    animation: none;
  }
}

/* —— 品牌区 —— */
.brand {
  text-align: center;
  margin-bottom: 30px;
}

.wordmark {
  /* 宋体只用在品牌名上：像一个机构的名字，而不是一个 App 的名字 */
  font-family: var(--ops-serif);
  font-size: clamp(30px, 4.4vw, 40px);
  font-weight: 600;
  letter-spacing: 0.12em;
  /* 字距会在最后一个字后面留出空白，补一个同宽缩进把视觉重心拉回中间 */
  text-indent: 0.12em;
  color: var(--ops-text-invert);
  margin: 0;
}

.role {
  margin: 12px 0 0;
  font-size: 13px;
  letter-spacing: 0.2em;
  text-indent: 0.2em;
  color: var(--ops-gold);
}

/* —— 面板与四角裁切标记 —— */
.panel {
  position: relative;
  background: var(--ops-surface);
  padding: 42px 38px 36px;
}

/*
 * 四角 L 形细线，借自印厂接触印样/场记单上的裁切标记。
 * 整个页面只在一处用力，就是这里，所以别处一律素着。
 */
.mk {
  position: absolute;
  width: 13px;
  height: 13px;
  border: 0 solid var(--ops-gold);
  pointer-events: none;
}

.mk.tl {
  top: 15px;
  left: 15px;
  border-top-width: 1px;
  border-left-width: 1px;
}

.mk.tr {
  top: 15px;
  right: 15px;
  border-top-width: 1px;
  border-right-width: 1px;
}

.mk.bl {
  bottom: 15px;
  left: 15px;
  border-bottom-width: 1px;
  border-left-width: 1px;
}

.mk.br {
  bottom: 15px;
  right: 15px;
  border-bottom-width: 1px;
  border-right-width: 1px;
}

/* —— 表单 —— */
.field + .field {
  margin-top: 22px;
}

.label {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  font-size: 13px;
  color: var(--ops-text-2);
  margin-bottom: 1px;
}

.hint {
  font-size: 12px;
  color: var(--ops-text-3);
  font-variant-numeric: tabular-nums;
}

/* 下划线式输入行：不用方框，躲开后端模板的长相 */
.row {
  display: flex;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid var(--ops-border-strong);
  transition: border-color 0.15s ease;
}

.row:focus-within {
  border-bottom-color: var(--ops-gold);
  /* 叠一层 1px 阴影，聚焦时看起来是 2px，够显眼但不粗糙 */
  box-shadow: 0 1px 0 0 var(--ops-gold);
}

.row input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: none;
  background: transparent;
  font-family: inherit;
  font-size: 16px;
  color: var(--ops-text);
  padding: 10px 0;
}

/* 焦点指示由整行的金色下划线承担，输入框自己不再画一圈描边 */
.row input:focus-visible {
  outline: none;
}

.row input::placeholder {
  color: var(--ops-text-3);
}

.send {
  flex: none;
  border: 0;
  border-left: 1px solid var(--ops-border);
  background: transparent;
  font-family: inherit;
  font-size: 13px;
  color: var(--ops-ink);
  padding: 4px 0 4px 12px;
  cursor: pointer;
  font-variant-numeric: tabular-nums;
}

.send:hover:not(:disabled) {
  color: var(--ops-gold);
}

.send:disabled {
  color: var(--ops-text-3);
  cursor: default;
}

.submit {
  width: 100%;
  height: 46px;
  margin-top: 28px;
  border: 0;
  background: var(--ops-ink);
  color: var(--ops-text-invert);
  font-family: inherit;
  font-size: 15px;
  font-weight: 500;
  /* 两个汉字的主按钮：拉开字距比堆粗体更有分量 */
  letter-spacing: 0.34em;
  text-indent: 0.34em;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.submit:hover:not(:disabled) {
  background: var(--ops-ink-2);
}

.submit:disabled {
  background: #c6cdda;
  cursor: default;
}

/* —— 页脚：钉在底边，不参与居中 —— */
.foot {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 30px;
  text-align: center;
  font-size: 12px;
  color: rgba(242, 245, 250, 0.4);
}

@media (max-width: 420px) {
  .panel {
    padding: 34px 22px 28px;
  }

  .mk {
    display: none;
  }
}
</style>
