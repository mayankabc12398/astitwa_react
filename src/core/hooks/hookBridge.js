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
 * @returns {Promise<{cancelSave?: boolean, cancelNavigation?: boolean, redirectTo?: string, message?: string, form?: object}>}
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

/** hr.employee.field.<fieldKey>.onBlur */
export function fieldHookKey(screenKey, fieldKey) {
  return `${screenKey}.field.${fieldKey}.onBlur`
}
