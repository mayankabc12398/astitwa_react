/**
 * Where a tenant's field goes: which section, and which field it follows.
 *
 * The builder used to ask for a section by name and a sequence number by hand. Both are
 * things the author has to already know — the exact spelling of "Personal Details", and that
 * 145 falls between Mobile Number and Title. Neither is knowable from the screen they are
 * looking at, so the field landed at the bottom and somebody dragged it up afterwards.
 *
 * The screen already declares its sections and the position of every compiled field
 * (ScreenCatalog.ScreenField). Given that, the two questions become dropdowns and the
 * sequence number is arithmetic rather than a guess.
 */

/** The marker value for "the author is naming a section that does not exist yet". */
export const NEW_SECTION = '__new__'

/** The marker value for "before everything else in this section". */
export const AT_TOP = '__top__'

/**
 * Every section the author may choose, in the order the form draws them.
 *
 * The screen's own sections come first, then any section a previous field invented, so a
 * second field can join one without the author having to spell it identically.
 *
 * @param {Array<{sectionKey: string, label: string}>} screenSections
 * @param {Array<{sectionKey?: string}>} customFields
 */
export function sectionOptions(screenSections = [], customFields = []) {
  const known = new Map()

  for (const section of screenSections) {
    known.set(section.sectionKey, { value: section.sectionKey, label: section.label })
  }

  for (const field of customFields) {
    const key = (field.sectionKey ?? '').trim()
    if (key && !known.has(key)) known.set(key, { value: key, label: key })
  }

  return [...known.values()]
}

/**
 * The fields already in a section, compiled and custom together, in render order.
 *
 * They are one list because the form renders them as one: a custom field's seqNo is read by
 * the same grid that positions the compiled ones, so "after Mobile Number" and "after the
 * field I added yesterday" are the same kind of answer.
 *
 * @param {string} sectionKey
 * @param {Array<{fieldKey: string, label: string, sectionKey?: string, seqNo: number}>} compiledFields
 * @param {Array<object>} customFields
 * @param {number} [excludeFieldId] the field being edited — it cannot follow itself
 */
export function fieldsInSection(sectionKey, compiledFields = [], customFields = [], excludeFieldId = 0) {
  const key = (sectionKey ?? '').trim()

  const compiled = compiledFields
    .filter((f) => (f.sectionKey ?? '') === key)
    .map((f) => ({ fieldKey: f.fieldKey, label: f.label, seqNo: f.seqNo, isCustom: false }))

  const custom = customFields
    .filter((f) => (f.sectionKey ?? '').trim() === key && f.fieldId !== excludeFieldId)
    .map((f) => ({ fieldKey: f.fieldKey, label: f.label, seqNo: f.seqNo ?? 1000, isCustom: true }))

  return [...compiled, ...custom].sort((a, b) => a.seqNo - b.seqNo)
}

/**
 * The sequence number that puts a field immediately after `afterKey`.
 *
 * Halfway to the next field, so the gaps the screens leave (ten between compiled fields) are
 * consumed one insertion at a time rather than pushing everything below down. Two fields
 * dropped into the same exhausted gap end up sharing a number, and equal numbers render in
 * the order the grid received them — untidy, never wrong, and one drag fixes it.
 *
 * @param {Array<{fieldKey: string, seqNo: number}>} ordered fieldsInSection() output
 * @param {string} afterKey a field key, or AT_TOP
 * @returns {number}
 */
export function seqAfter(ordered = [], afterKey = AT_TOP) {
  if (ordered.length === 0) return 1000

  if (afterKey === AT_TOP) {
    const first = ordered[0].seqNo
    // A section whose first field already sits at 1 leaves nothing above it to take.
    return first > 1 ? first - 1 : 1
  }

  const index = ordered.findIndex((f) => f.fieldKey === afterKey)
  if (index < 0) return ordered[ordered.length - 1].seqNo + 10

  const current = ordered[index].seqNo
  const next = ordered[index + 1]?.seqNo

  if (next === undefined) return current + 10

  const middle = Math.floor((current + next) / 2)
  return middle > current ? middle : current + 1
}

/** Which field a saved one currently follows, so the editor opens showing where it is. */
export function currentAnchor(ordered = [], seqNo) {
  const before = ordered.filter((f) => f.seqNo <= seqNo)
  return before.length === 0 ? AT_TOP : before[before.length - 1].fieldKey
}
