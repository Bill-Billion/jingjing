/** Only supported private entry routes may be resumed after login. */
export function loginRedirect(target: unknown): string {
  if (target === '/workspace' || target === '/contracts') return target
  if (typeof target === 'string' && target.length === 47 && /^\/contracts\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(target)) return target
  return '/workspace'
}
