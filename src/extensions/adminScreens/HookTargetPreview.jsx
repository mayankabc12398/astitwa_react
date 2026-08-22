import { Badge } from '../../core/controls/layout.jsx'

/**
 * What this hook will actually do, in the words of the person who has to answer for it.
 *
 * A hook key like hr.employee.field.mobile.onChange is precise and tells you nothing at a
 * glance: which page is that, which control, and does it fire per keystroke? The author is
 * about to make it live for a tenant, so the screen says it plainly instead — the page, the
 * field, the moment, and whether anything else already runs on the same slot.
 *
 * Everything here is derived from the catalogue the server returned. Nothing is hardcoded,
 * so a screen or a field added to ScreenCatalog is described here without this file changing.
 */

/** hr.employee.field.mobile.onChange -> { screenKey, fieldKey, event } */
function parse(hookKey, screens) {
  const field = /^(.*)\.field\.([^.]+)\.([^.]+)$/.exec(hookKey ?? '')
  if (field) return { screenKey: field[1], fieldKey: field[2], event: field[3] }

  // Longest first, so a screen key that is a prefix of another cannot claim it.
  const match = [...screens]
    .sort((a, b) => b.key.length - a.key.length)
    .find((screen) => hookKey === screen.key || hookKey?.startsWith(`${screen.key}.`))

  return { screenKey: match?.key ?? '', fieldKey: '', event: '' }
}

/**
 * The sentence.
 *
 * Written per slot rather than assembled from parts: "before save" and "on change" differ in
 * what they can DO, not just in when they fire, and that is the half an author needs to read.
 */
function sentence({ hookKey, runOn, screenLabel, fieldLabel, event, debounceMs }) {
  const where = runOn === 'server' ? 'on the server' : 'in the browser'
  const page = screenLabel ? `the ${screenLabel} screen` : 'this screen'

  if (fieldLabel) {
    if (event === 'onChange') {
      const wait = debounceMs
        ? `once typing pauses for ${debounceMs}ms`
        : 'on every keystroke — set a debounce below unless that is intended'
      return `Runs ${where} on ${page}, as ${fieldLabel} is typed into, ${wait}.`
    }
    return `Runs ${where} on ${page}, once, when the user leaves ${fieldLabel}.`
  }

  if (hookKey?.endsWith('.onLoad')) return `Runs ${where} on ${page}, once, after the record has loaded.`
  if (hookKey?.endsWith('.beforeSave'))
    return `Runs ${where} on ${page} when Save is pressed, before anything is written. It can stop the save.`
  if (hookKey?.endsWith('.afterSave'))
    return `Runs ${where} on ${page} after the record is saved. It decides where the user goes next.`

  return `Runs ${where} on ${page}.`
}

export function HookTargetPreview({
  hookKey,
  runOn,
  seqNo,
  debounceMs,
  applyToAllTenants,
  isActive,
  screens = [],
  hookId = 0,
  siblings = [],
  menu = [],
}) {
  if (!hookKey) {
    return (
      <div className="hook-preview hook-preview--empty">
        Choose a hook point above and this will say where the script runs.
      </div>
    )
  }

  const { screenKey, fieldKey, event } = parse(hookKey, screens)
  const screen = screens.find((s) => s.key === screenKey) ?? null
  const field = screen?.fields?.find((f) => f.key === fieldKey) ?? null
  const slot = screen?.slots?.find((s) => s.key === hookKey) ?? null

  // The route comes from the menu the server already sends, so a screen this tenant cannot
  // see is not linked to a page they cannot open.
  const route = menu.find((m) => m.key === screenKey)?.route ?? ''

  // A key nobody fires is indistinguishable from a working one until somebody notices the
  // script never ran. Saying so here is the only cheap moment to catch it.
  const known = Boolean(screen) && (Boolean(slot) || Boolean(field))

  // Everything already registered on this exact slot, in the order they will run.
  const chain = siblings
    .filter((row) => row.hookKey === hookKey && row.hookId !== hookId)
    .sort((a, b) => a.seqNo - b.seqNo)

  const position = chain.filter((row) => row.seqNo < seqNo).length + 1

  return (
    <div className="hook-preview">
      <div className="hook-preview__head">
        <span className="hook-preview__title">Where this runs</span>
        <Badge tone={isActive ? 'ok' : 'muted'}>{isActive ? 'Live once saved' : 'Saved, not live'}</Badge>
        <Badge tone={applyToAllTenants ? 'warn' : 'muted'}>
          {applyToAllTenants ? 'Every tenant' : 'This tenant only'}
        </Badge>
      </div>

      <p className="hook-preview__sentence">
        {sentence({
          hookKey,
          runOn,
          screenLabel: screen?.label,
          fieldLabel: field?.label,
          event,
          debounceMs,
        })}
      </p>

      <dl className="hook-preview__facts">
        <div>
          <dt>Screen</dt>
          <dd>
            {screen?.label ?? '—'}
            {route && <span className="hook-preview__route">{route}</span>}
          </dd>
        </div>
        <div>
          <dt>Field</dt>
          <dd>
            {field ? field.label : '— whole screen —'}
            {field?.source === 'custom' && <span className="hook-preview__route">added by this tenant</span>}
          </dd>
        </div>
        <div>
          <dt>Moment</dt>
          <dd>{slot?.label ?? (event === 'onChange' ? 'On change' : event === 'onBlur' ? 'On blur' : '—')}</dd>
        </div>
        <div>
          <dt>Runs on</dt>
          <dd>{runOn === 'server' ? 'Server' : 'Browser'}</dd>
        </div>
        <div>
          <dt>Order</dt>
          <dd>
            {chain.length === 0
              ? `Seq ${seqNo} — the only script here`
              : `Seq ${seqNo} — ${position} of ${chain.length + 1} on this slot`}
          </dd>
        </div>
        <div>
          <dt>Key</dt>
          <dd>
            <code>{hookKey}</code>
          </dd>
        </div>
      </dl>

      {chain.length > 0 && (
        <div className="hook-preview__chain">
          <span className="hook-preview__title">Already on this slot</span>
          <ol>
            {chain.map((row) => (
              <li key={row.hookId}>
                Seq {row.seqNo} · {row.runOn}
                {!row.isActive && ' · inactive'}
              </li>
            ))}
          </ol>
        </div>
      )}

      {!known && (
        <p className="hook-preview__warn">
          Nothing in the product fires <code>{hookKey}</code>. A key outside the catalogue saves fine and then
          never runs — check the hook point above unless this is deliberate.
        </p>
      )}
    </div>
  )
}
