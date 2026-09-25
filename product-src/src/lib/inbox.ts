/** Per-account inbox: company slug plus a short hash of the sign-in email so two accounts never collide.
 * Pure so the server can write the same address into the agent's workspace. */
export function inboxAddress(email: string | null): string {
  const slug = (email?.split('@')[1]?.split('.')[0] ?? 'payroll').toLowerCase().replace(/[^a-z0-9]/g, '')
  let h = 5381
  for (const ch of email ?? '') h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0
  return `${slug}-${h.toString(36).slice(0, 4)}@closeout.hypertrack.com`
}
