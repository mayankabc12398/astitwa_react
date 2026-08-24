import { PATIENT_SCREEN_FIELDS } from '../../modules/patient/patientFields.js'

/**
 * The compiled fields this build ships, merged into whatever /admin/hooks/slots returns.
 *
 * The server's ScreenCatalog is the source of truth and stays that way — this only fills the
 * gap between a release that adds fields to a screen and the catalogue row that describes
 * them. Without it, a field added on the client is invisible to the Script Hooks editor and
 * the only way to hang a script on it is to type the hook key by hand.
 *
 * The server always wins on anything it does describe: a field it already lists keeps its
 * label and its slot base, and only keys it has never heard of are appended.
 */

const CLIENT_SCREENS = {
  'hr.patient': { label: 'Patient', fields: PATIENT_SCREEN_FIELDS },
}

/** The three slots every form screen has, for a screen the catalogue does not list at all. */
const screenSlots = (key) => [
  { key: `${key}.onLoad`, label: 'Screen: on load' },
  { key: `${key}.beforeSave`, label: 'Screen: before save' },
  { key: `${key}.afterSave`, label: 'Screen: after save' },
]

/**
 * @param {Array<{key: string, label: string, slots?: Array<object>, fields?: Array<object>}>} screens
 * @returns {Array<object>} the same list, with this build's fields unioned in
 */
export function withClientFields(screens = []) {
  const merged = screens.map((screen) => {
    const extra = CLIENT_SCREENS[screen.key]
    if (!extra) return screen

    const known = new Set((screen.fields ?? []).map((field) => field.key))
    const missing = extra.fields.filter((field) => !known.has(field.key))
    if (missing.length === 0) return screen

    return { ...screen, fields: [...(screen.fields ?? []), ...missing] }
  })

  const listed = new Set(merged.map((screen) => screen.key))
  const absent = Object.entries(CLIENT_SCREENS)
    .filter(([key]) => !listed.has(key))
    .map(([key, screen]) => ({ key, label: screen.label, slots: screenSlots(key), fields: screen.fields }))

  return [...merged, ...absent]
}
