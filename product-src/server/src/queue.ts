export class QueueFullError extends Error {
  readonly status = 429

  constructor() {
    super('A turn is already running and another is waiting.')
    this.name = 'QueueFullError'
  }
}

type Release = () => void
type Waiting = {
  resolve: (release: Release) => void
  cleanup: () => void
}
type Slot = { waiting?: Waiting }

/** One active turn and at most one waiting turn for each account. */
export class UserQueue {
  private readonly slots = new Map<string, Slot>()

  acquire(email: string, signal?: AbortSignal): Promise<Release> {
    if (signal?.aborted) return Promise.reject(new DOMException('Request aborted', 'AbortError'))
    const key = email.trim().toLowerCase()
    const slot = this.slots.get(key)
    if (!slot) {
      const next: Slot = {}
      this.slots.set(key, next)
      return Promise.resolve(this.releaseFor(key, next))
    }
    if (slot.waiting) return Promise.reject(new QueueFullError())

    return new Promise((resolve, reject) => {
      const onAbort = () => {
        if (slot.waiting === waiting) delete slot.waiting
        waiting.cleanup()
        reject(new DOMException('Request aborted', 'AbortError'))
      }
      const waiting: Waiting = {
        resolve,
        cleanup: () => signal?.removeEventListener('abort', onAbort),
      }
      slot.waiting = waiting
      signal?.addEventListener('abort', onAbort, { once: true })
    })
  }

  private releaseFor(key: string, slot: Slot): Release {
    let released = false
    return () => {
      if (released) return
      released = true
      const waiting = slot.waiting
      if (waiting) {
        delete slot.waiting
        waiting.cleanup()
        waiting.resolve(this.releaseFor(key, slot))
      } else {
        this.slots.delete(key)
      }
    }
  }
}
