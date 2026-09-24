/** Carry the table selection when opening or closing a payment, dropping obsolete query state. */
export function reconcileQuery(cycleId: string, previous: URLSearchParams, allShifts = false): URLSearchParams {
  const next = new URLSearchParams({ cycle: cycleId })
  for (const key of allShifts ? ['agent'] : ['flag', 'agent']) {
    const value = previous.get(key)
    if (value) next.set(key, value)
  }
  return next
}
