/**
 * The Layer 1 side of the extension boundary (section 10.1).
 *
 * Base screens call runHook() at every compiled-in slot and act on what comes back. With no
 * engine registered — no Layer 5 bundle loaded, or the engine failed to start — this returns
 * an empty object and the screen behaves exactly as written.
 *
 * Nothing in src/core/ or src/modules/ imports the engine. src/extensions/register.js
 * pushes itself in here, which is why the ESLint layer rule can stay absolute.
 */

let engine = null

export function setHookEngine(implementation) {
  engine = implementation
}

export function hasHookEngine() {
  return engine !== null
}

/**
 * @param {string} hookKey e.g. 'hr.employee.beforeSave'
 * @param {object} context { form, value, response }
 * @returns {Promise<{cancelSave?: boolean, cancelNavigation?: boolean, redirectTo?: string, message?: string, form?: object, readOnly?: string[]}>}
 */
export async function runHook(hookKey, context = {}) {
  if (!engine) return {}

  try {
    const result = await engine.run(hookKey, context)
    return result && typeof result === 'object' ? result : {}
  } catch {
    // A failing script is logged by the engine and treated as absent.
    // A broken script must never block a save.
    return {}
  }
}

/**
 * hr.employee.field.<fieldKey>.<event>
 *
 * The event defaults to onBlur, which is the only one screens fired before onChange existed.
 * A key built without one has to keep meaning what it always meant.
 */
export function fieldHookKey(screenKey, fieldKey, event = 'onBlur') {
  return `${screenKey}.field.${fieldKey}.${event}`
}

/**
 * How long a screen should wait before running a hook, from the hook's own debounce_ms.
 *
 * Only onChange slots have any use for this: onBlur already fires once per visit to a field,
 * whereas onChange fires per keystroke, and a script that queries the server on every letter
 * typed is a script nobody can use. 0 means run immediately, which is also what an absent
 * engine returns — a screen with no Layer 5 loaded behaves as it always did.
 */
export function hookDebounceMs(hookKey) {
  return engine?.debounceFor?.(hookKey) ?? 0
}
