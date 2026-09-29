/** Only supported private entry routes may be resumed after login. */
export function loginRedirect(target: unknown): string {
  if (target === '/workspace' || target === '/contracts') return target
  if (typeof target === 'string' && target.length === 47 && /^\/contracts\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(target)) return target
  if (typeof target === 'string' && target === target.trim() && /^\/supply\/(?:profiles(?:\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})?|works(?:\/new|\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}(?:\/revision)?)?|reviews\/(?:profile|rights|content)(?:\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})?)$/.test(target)) return target
  return '/workspace'
}
