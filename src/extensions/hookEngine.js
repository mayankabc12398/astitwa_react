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
 *   2. A script cannot hang a screen. Each run is raced against a timeout; on expiry the
 *      failure is logged and an empty result is returned, so the screen behaves as if no hook
 *      existed. A frame that stops answering is torn down and rebuilt.
 *
 *   3. A script cannot draw. ui.pickList and friends are messages serviced by the product's
 *      own components — the script supplies data only (section 10.4).
 */
class HookEngine {
  constructor() {
    this.frame = null
    this.ready = null
    this.scripts = []
    this.hookKeys = new Set()
    this.pending = new Map()
    this.nextId = 1
    this.listening = false
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

  async run(hookKey, context = {}) {
    // The common case is no script at all. Do not spin up a frame for it.
    if (!this.hasScriptFor(hookKey)) return {}

    try {
      const frame = await this.ensureFrame()
      const id = `r${this.nextId++}`

      const result = await this.withTimeout(
        new Promise((resolve, reject) => {
          this.pending.set(id, { resolve, reject })
          frame.contentWindow.postMessage(
            { type: 'run', id, payload: { hookKey, ...context } },
            '*',
          )
        }),
        RUN_TIMEOUT_MS,
        `Hook ${hookKey} did not answer within ${RUN_TIMEOUT_MS}ms.`,
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
      case 'ui.toast':
        ui.toast(args[0])
        return true
      case 'ui.error':
        ui.error(args[0])
        return true
      case 'ui.confirm':
        return ui.confirm(args[0])
      case 'ui.pickList':
        return ui.pickList(args[0] ?? {})
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

  withTimeout(promise, ms, message) {
    let timer
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error(message), { isTimeout: true })), ms)
    })
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
  }
}

export const hookEngine = new HookEngine()
