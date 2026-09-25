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

  async acquire(email: string, signal?: AbortSignal): Promise<Release> {
    return this.reserve(email, signal)
  }

  /** Reserve synchronously so overload can be rejected before sending SSE headers. */
  reserve(email: string, signal?: AbortSignal): Promise<Release> {
    if (signal?.aborted) throw new DOMException('Request aborted', 'AbortError')
    const key = email.trim().toLowerCase()
    const slot = this.slots.get(key)
    if (!slot) {
      const next: Slot = {}
      this.slots.set(key, next)
      return Promise.resolve(this.releaseFor(key, next))
    }
    if (slot.waiting) throw new QueueFullError()

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

/** Process-wide admission bounds CLI concurrency, including reserved account waiters. */
export class GlobalSemaphore {
  private active = 0
  private readonly waiting: Waiting[] = []

  constructor(private readonly limit = 3, private readonly waitMs = 30_000) {}

  acquire(signal?: AbortSignal): Promise<Release> {
    if (signal?.aborted) return Promise.reject(new DOMException('Request aborted', 'AbortError'))
    if (this.active < this.limit) {
      this.active += 1
      return Promise.resolve(this.releaseFor())
    }
    return new Promise((resolve, reject) => {
      const remove = () => {
        const index = this.waiting.indexOf(waiting)
        if (index !== -1) this.waiting.splice(index, 1)
        waiting.cleanup()
      }
      const onAbort = () => {
        remove()
        reject(new DOMException('Request aborted', 'AbortError'))
      }
      const timer = setTimeout(() => { remove(); reject(new QueueFullError()) }, this.waitMs)
      const waiting: Waiting = {
        resolve,
        cleanup: () => {
          clearTimeout(timer)
          signal?.removeEventListener('abort', onAbort)
        },
      }
      this.waiting.push(waiting)
      signal?.addEventListener('abort', onAbort, { once: true })
    })
  }

  private releaseFor(): Release {
    let released = false
    return () => {
      if (released) return
      released = true
      const next = this.waiting.shift()
      if (next) {
        next.cleanup()
        next.resolve(this.releaseFor())
      } else this.active -= 1
    }
  }
}

/** Sliding window: at most 30 accepted turn attempts per email in ten minutes. */
export class TurnRateLimit {
  private readonly turns = new Map<string, number[]>()
  private nextCleanup = 0

  constructor(private readonly limit = 30, private readonly windowMs = 600_000) {}

  consume(email: string): void {
    const now = Date.now()
    if (now >= this.nextCleanup) {
      for (const [key, times] of this.turns) {
        if (times.at(-1)! <= now - this.windowMs) this.turns.delete(key)
      }
      this.nextCleanup = now + this.windowMs
    }
    const key = email.trim().toLowerCase()
    const recent = (this.turns.get(key) ?? []).filter(time => time > now - this.windowMs)
    if (recent.length >= this.limit) throw new QueueFullError()
    recent.push(now)
    this.turns.set(key, recent)
  }
}

/** Per-account FIFO lock with unbounded waiters: data requests and workspace writes wait their turn, never 429. */
// ponytail: single process only, like UserQueue. Multiple machines need a database advisory lock.
export class KeyedMutex {
  private readonly tails = new Map<string, Promise<void>>()

  async acquire(email: string): Promise<Release> {
    const key = email.trim().toLowerCase()
    const previous = this.tails.get(key) ?? Promise.resolve()
    let open!: () => void
    const tail = previous.then(() => new Promise<void>(resolve => { open = resolve }))
    this.tails.set(key, tail)
    await previous
    return () => { open(); if (this.tails.get(key) === tail) this.tails.delete(key) }
  }
}
