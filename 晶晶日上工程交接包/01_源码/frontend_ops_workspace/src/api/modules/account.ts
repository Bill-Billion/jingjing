import { request } from '../client'
import type { Account, Page, PartyAccess, Party, Session, SmsChallenge, Invitation, Member, CapabilityGrant, AccountCommand } from '../types'

export const createSmsChallenge = (input: { phone: string }, key: string) => request<SmsChallenge>('/auth/sms-challenges', { method: 'POST', idempotencyKey: key, body: { phone: input.phone, purpose: 'LOGIN' } })
export const createSession = (input: { phone: string; challengeId: string; code: string }, key: string) => request<Session>('/auth/sessions', { method: 'POST', idempotencyKey: key, body: { phone: input.phone, challenge_id: input.challengeId, code: input.code } })
export const getCurrentAccount = (token: string) => request<Account>('/me', { token })
function pageQuery(cursor?: string | null, limit = 20) { const p = new URLSearchParams({ limit: String(limit) }); if (cursor) p.set('cursor', cursor); return p.toString() }
export const listMyParties = (token: string, options: { cursor?: string | null; limit?: number } = {}) => request<Page<PartyAccess>>(`/me/parties?${pageQuery(options.cursor, options.limit)}`, { token })
export const getParty = (token: string, party: string) => request<Party>(`/parties/${party}`, { token, actingParty: party })
export const listInvitations = (token: string, cursor?: string | null) => request<Page<Invitation>>(`/me/invitations?${pageQuery(cursor)}`, { token })
export const listMembers = (token: string, party: string, cursor?: string | null) => request<Page<Member>>(`/parties/${party}/members?${pageQuery(cursor)}`, { token, actingParty: party })
export const revokeCurrentSession = (token: string, key: string) => request<{ current_status: string }>('/auth/sessions/current', { method: 'DELETE', token, idempotencyKey: key })

export type CommandResult = Omit<Partial<Party>, 'current_status'> & Omit<Partial<Invitation>, 'current_status'> & { current_status?: string; membership_id?: string; membership_version?: number; code?: CapabilityGrant['code'] }
/** command keeps its original key, body and object version across uncertain retries. */
export function sendCommand(token: string, c: AccountCommand) {
  const o = { token, idempotencyKey: c.key, actingParty: c.party, ifMatch: c.version }
  const base = `/parties/${c.party}`
  switch (c.kind) {
    case 'create': return request<CommandResult>('/organizations', { ...o, method: 'POST', body: { display_name: c.name } })
    case 'rename': return request<CommandResult>(base, { ...o, method: 'PATCH', body: { display_name: c.name } })
    case 'capability': return request<CommandResult>(`${base}/capabilities`, { ...o, method: 'POST', body: { code: c.code } })
    case 'invite': return request<CommandResult>(`${base}/invitations`, { ...o, method: 'POST', body: { invitee_account_id: c.account, expires_at: c.expires } })
    case 'respond': return request<CommandResult>(`${base}/invitations/${c.invitation}/responses`, { ...o, method: 'POST', body: { decision: c.decision } })
    case 'revoke': return request<CommandResult>(`${base}/invitations/${c.invitation}/revocations`, { ...o, method: 'POST' })
    case 'remove': return request<CommandResult>(`${base}/members/${c.account}`, { ...o, method: 'DELETE' })
  }
}
