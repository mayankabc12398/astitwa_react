import { api } from '../core/api/client.js'
import { getUi } from '../core/controls/uiContext.js'

const SANDBOX_SRC = '/hook-sandbox.html'
const RUN_TIMEOUT_MS = 5000
const READY_TIMEOUT_MS = 5000

/**
 * Layer 5, client half.
 *
 * Hosts the sandboxed iframe, ships the tenant's client scripts into it once, and services
 * the messages it sends back. Three properties matter:
 *
 *   1. The sandbox never sees the JWT. It runs on an opaque origin (sandbox="allow-scripts"
 *      without allow-same-origin), so it cannot read this page's storage. Every server call a
 *      script makes is a message this file turns into an api.query() with the user's own token.
 *
 *   2. A script cannot hang a screen. Each run is raced against a clock; on expiry the
 *      failure is logged and an empty result is returned, so the screen behaves as if no hook
 *      existed. A frame that stops answering is torn down and rebuilt. The clock measures
 *      what the SCRIPT does — it stops while a ui.confirm or ui.pickList is waiting on a
 *      person, who is allowed to think for longer than the budget.
 *
 *   3. A script cannot draw. ui.pickList and friends are messages serviced by the product's
 *      own components — the script supplies data only (section 10.4).
 */
/**
 * A run's clock, which can be stopped.
 *
 * The limit exists to stop a script hanging a screen: an endless loop, or a frame that stops
 * answering. Time a user spends reading a ui.confirm is not that. The script is blocked on a
 * human, and a human is entitled to take longer than five seconds.
 *
 * Counting that time made ui.confirm and ui.pickList unusable for the one thing they exist to
 * do — the dialog was still open when the sandbox was torn down underneath it, and the hook
 * was logged as a timeout. So the clock stops while any script is waiting on an answer and
 * restarts when the answer arrives. Wall-clock time is still bounded for everything the
 * script does on its own.
 */
class RunClock {
  constructor(budgetMs, onExpire) {
    this.remaining = budgetMs
    this.onExpire = onExpire
    this.timer = null
    this.startedAt = 0
  }

  start() {
    if (this.timer || this.remaining <= 0) return
    this.startedAt = Date.now()
    this.timer = setTimeout(this.onExpire, this.remaining)
  }

  stop() {
    if (!this.timer) return
    clearTimeout(this.timer)
    this.timer = null
    this.remaining -= Date.now() - this.startedAt
  }

  cancel() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }
}

class HookEngine {
  constructor() {
    this.frame = null
    this.ready = null
    this.scripts = []
    this.hookKeys = new Set()
    this.pending = new Map()
    this.nextId = 1
    this.listening = false
    this.clocks = new Set()
    this.waitingOnUser = 0
  }

  /** @param {Array<{hookId:number, hookKey:string, seqNo:number, scriptBody:string, debounceMs:number|null}>} scripts */
  install(scripts) {
    this.scripts = Array.isArray(scripts) ? scripts : []
    this.hookKeys = new Set(this.scripts.map((s) => s.hookKey))
    this.teardown()
  }

  hasScriptFor(hookKey) {
    return this.hookKeys.has(hookKey)
  }

  /**
   * The longest debounce any script on this key asked for, or 0 for none.
   *
   * The longest rather than the shortest: the scripts on one key run as a chain, so the wait
   * has to satisfy every one of them. Honouring the shortest would run a script that asked
   * for a second's quiet after 200ms, which is the setting not working.
   */
  debounceFor(hookKey) {
    let longest = 0
    for (const script of this.scripts) {
      if (script.hookKey !== hookKey) continue
      const ms = Number(script.debounceMs) || 0
      if (ms > longest) longest = ms
    }
    return longest
  }

  async run(hookKey, context = {}) {
    // The common case is no script at all. Do not spin up a frame for it.
    if (!this.hasScriptFor(hookKey)) return {}

    try {
      const frame = await this.ensureFrame()
      const id = `r${this.nextId++}`

      const result = await this.raceWithClock(
        new Promise((resolve, reject) => {
          this.pending.set(id, { resolve, reject })
          frame.contentWindow.postMessage(
            { type: 'run', id, payload: { hookKey, ...context } },
            '*',
          )
        }),
        `Hook ${hookKey} spent more than ${RUN_TIMEOUT_MS}ms running, not counting time spent waiting for an answer.`,
      )

      return result ?? {}
    } catch (cause) {
      await this.log({
        hookKey,
        status: cause?.isTimeout ? 'timeout' : 'error',
        durationMs: RUN_TIMEOUT_MS,
        message: cause?.message ?? String(cause),
      })

      // A frame that timed out may be stuck in a loop; replace it rather than trust it.
      if (cause?.isTimeout) this.teardown()

      return {}
    }
  }

  // ---------------------------------------------------------------
  // Frame lifecycle
  // ---------------------------------------------------------------

  ensureFrame() {
    if (this.ready) return this.ready

    this.listen()

    this.ready = new Promise((resolve, reject) => {
      const frame = document.createElement('iframe')
      frame.setAttribute('sandbox', 'allow-scripts')
      frame.setAttribute('title', 'Script sandbox')
      frame.setAttribute('aria-hidden', 'true')
      frame.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden'
      frame.src = SANDBOX_SRC

      const timer = setTimeout(() => {
        reject(Object.assign(new Error('The script sandbox did not start.'), { isTimeout: true }))
      }, READY_TIMEOUT_MS)

      this.onReady = () => {
        clearTimeout(timer)
        resolve(frame)
      }

      frame.addEventListener('load', () => {
        frame.contentWindow.postMessage({ type: 'init', scripts: this.scripts }, '*')
      })

      document.body.appendChild(frame)
      this.frame = frame
    }).catch((cause) => {
      this.teardown()
      throw cause
    })

    return this.ready
  }

  teardown() {
    this.pending.forEach(({ reject }) => reject(new Error('The script sandbox was reset.')))
    this.pending.clear()
    if (this.frame?.parentNode) this.frame.parentNode.removeChild(this.frame)
    this.frame = null
    this.ready = null
  }

  listen() {
    if (this.listening) return
    this.listening = true

    window.addEventListener('message', (event) => {
      // The sandbox has an opaque origin, so event.origin is "null". Identity is established
      // by the source window being our own frame, which nothing else can forge.
      if (!this.frame || event.source !== this.frame.contentWindow) return

      const data = event.data
      if (!data || typeof data !== 'object') return

      if (data.type === 'ready') {
        this.onReady?.()
        return
      }

      if (data.type === 'result') {
        const waiter = this.pending.get(data.id)
        if (!waiter) return
        this.pending.delete(data.id)
        waiter.resolve(data.result ?? {})
        return
      }

      if (data.type === 'log') {
        this.log(data)
        return
      }

      if (data.type === 'call') {
        this.serviceCall(data)
      }
    })
  }

  // ---------------------------------------------------------------
  // Servicing what the sandbox asks for
  // ---------------------------------------------------------------

  async serviceCall({ callId, target, args = [] }) {
    const reply = (ok, value, error) =>
      this.frame?.contentWindow?.postMessage({ type: 'callResult', callId, ok, value, error }, '*')

    try {
      const value = await this.dispatch(target, args)
      reply(true, value ?? null, null)
    } catch (cause) {
      reply(false, null, cause?.message ?? 'The call failed.')
    }
  }

  async dispatch(target, args) {
    const ui = getUi()

    switch (target) {
      case 'api.query': {
        // The script names a registered key. The server validates it against
        // ext_named_query, binds only declared parameters and strips undeclared columns.
        const [queryKey, params] = args
        return api.post('/ext/query', { queryKey, params: params ?? {} })
      }
      case 'api.callEndpoint': {
        // An endpoint written in the API Builder. Same rules as api.query: the script names
        // it, the host calls it with the user's own token, and the server decides whether
        // this caller may run it.
        const [slug, params] = args
        return api.post(`/x/${encodeURIComponent(String(slug))}`, { params: params ?? {} })
      }
      case 'ui.toast':
        ui.toast(args[0])
        return true
      case 'ui.error':
        ui.error(args[0])
        return true
      // These two block on a person. The clock stops for them; see RunClock.
      case 'ui.confirm':
        return this.whileWaitingForUser(() => ui.confirm(args[0]))
      case 'ui.pickList':
        return this.whileWaitingForUser(() => ui.pickList(args[0] ?? {}))
      case 'ui.openScreen':
        return ui.openScreen(args[0], args[1])
      default:
        throw new Error(`'${target}' is not something a script may ask for.`)
    }
  }

  /**
   * Client-side failures land in the same ext_hook_log the admin screen reads. The endpoint
   * needs only a signed-in user, because the person whose screen just ran a broken script is
   * rarely an administrator.
   */
  async log({ hookId = null, hookKey, status, durationMs = 0, message = null }) {
    if (status === 'ok') return // success is not worth a round trip from the browser

    try {
      await api.post('/ext/hook-log', {
        hookId,
        hookKey,
        status,
        durationMs,
        message,
        contextJson: null,
      })
    } catch {
      // If even the audit write fails there is nothing further to do; the screen carries on.
    }
  }

  /** Races a run against a clock that can be stopped while a person is being asked something. */
  raceWithClock(promise, message) {
    let clock
    const expiry = new Promise((_, reject) => {
      clock = new RunClock(RUN_TIMEOUT_MS, () =>
        reject(Object.assign(new Error(message), { isTimeout: true })))
      this.clocks.add(clock)
      if (this.waitingOnUser === 0) clock.start()
    })

    return Promise.race([promise, expiry]).finally(() => {
      clock.cancel()
      this.clocks.delete(clock)
    })
  }

  /**
   * Stops every run's clock for the duration of an interactive call.
   *
   * Every clock, not just the calling run's: a ui message carries no run id, so there is
   * nothing to attribute it to. Erring towards not killing a script while a dialog is open is
   * the right way round — the alternative is tearing down the sandbox with a question still
   * on screen.
   */
  async whileWaitingForUser(work) {
    if (this.waitingOnUser++ === 0) this.clocks.forEach((clock) => clock.stop())
    try {
      return await work()
    } finally {
      if (--this.waitingOnUser === 0) this.clocks.forEach((clock) => clock.start())
    }
  }
}

export const hookEngine = new HookEngine()
console.log("hookEngine",hookEngine)
