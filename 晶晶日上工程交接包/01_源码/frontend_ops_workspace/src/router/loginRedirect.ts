/** Only supported private entry routes may be resumed after login. */
export function loginRedirect(target: unknown): string {
  if (typeof target === 'string' && target === target.trim() && /^\/trade\/(?:specifications\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\/new|(?:specifications|quotes|payments|refunds|legacy)\/new|(?:specifications|quotes|orders|payments|refunds|legacy)(?:\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})?|reviews\/(?:specifications|quotes|refunds|legacy)(?:\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})?)$/.test(target)) return target
  if (typeof target === 'string' && /^\/supply\/adaptations\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\/new$/.test(target)) return target
  if (typeof target === 'string' && target === target.trim() && /^\/licensing\/(?:products\/new|projects\/new|readings\/new|(?:catalog|products|reservations|evidence|grants|projects|bindings|readings)(?:\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})?|reviews\/(?:products|evidence|readings|activation|grants|projects|bindings)(?:\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})?)$/.test(target)) return target
  if (target === '/workspace' || target === '/contracts') return target
  if (typeof target === 'string' && target.length === 47 && /^\/contracts\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(target)) return target
  if (typeof target === 'string' && target === target.trim() && /^\/supply\/(?:profiles(?:\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})?|works(?:\/new|\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}(?:\/revision)?)?|reviews\/(?:profile|rights|content)(?:\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})?)$/.test(target)) return target
  return '/workspace'
}
