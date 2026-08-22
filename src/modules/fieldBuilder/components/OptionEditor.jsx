import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react'
import { Input } from '../../../config/nhr/ui/index.js'

/**
 * The choice list behind a typed-in dropdown.
 *
 * A blank value row is dropped on save rather than rejected, so an author can leave the
 * trailing empty row they were about to fill and still keep what they already typed.
 *
 * @param {{
 *   options: Array<{optionValue: string, optionLabel: string, parentValue?: string}>,
 *   onChange: (next: Array<object>) => void,
 *   cascading: boolean,
 *   disabled?: boolean,
 * }} props
 */
export function OptionEditor({ options, onChange, cascading, disabled = false }) {
  const rows = options.length > 0 ? options : [{ optionValue: '', optionLabel: '', parentValue: '' }]

  const update = (index, patch) => onChange(rows.map((o, i) => (i === index ? { ...o, ...patch } : o)))

  const remove = (index) => onChange(rows.filter((_, i) => i !== index))

  const move = (index, delta) => {
    const target = index + delta
    if (target < 0 || target >= rows.length) return

    const next = rows.slice()
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  return (
    <div className="fb-options">
      <div className="fb-opt-head">
        <span>Value</span>
        <span>Label</span>
        {cascading && <span>Shown when parent is</span>}
        <span />
      </div>

      {rows.map((option, index) => (
        <div key={index} className={`fb-opt-row${cascading ? ' is-cascading' : ''}`}>
          <Input
            value={option.optionValue ?? ''}
            disabled={disabled}
            aria-label={`Option ${index + 1} value`}
            onChange={(e) => update(index, { optionValue: e.target.value })}
          />
          <Input
            value={option.optionLabel ?? ''}
            disabled={disabled}
            placeholder="same as value"
            aria-label={`Option ${index + 1} label`}
            onChange={(e) => update(index, { optionLabel: e.target.value })}
          />
          {cascading && (
            <Input
              value={option.parentValue ?? ''}
              disabled={disabled}
              placeholder="any"
              aria-label={`Option ${index + 1} parent value`}
              onChange={(e) => update(index, { parentValue: e.target.value })}
            />
          )}
          <div className="fb-opt-actions">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={disabled || index === 0}
              onClick={() => move(index, -1)}
              title="Move up"
            >
              <ArrowUp size={13} />
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={disabled || index === rows.length - 1}
              onClick={() => move(index, 1)}
              title="Move down"
            >
              <ArrowDown size={13} />
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={disabled || rows.length === 1}
              onClick={() => remove(index)}
              title="Remove option"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      ))}

      <button
        type="button"
        className="btn btn-ghost btn-sm mt-2"
        disabled={disabled}
        onClick={() => onChange([...rows, { optionValue: '', optionLabel: '', parentValue: '' }])}
      >
        <Plus size={13} /> Add option
      </button>

      {cascading && (
        <div className="t-xs ink-3 mt-2">
          An option with no parent value is shown whatever the parent field holds — which is how every option behaves
          when nothing cascades.
        </div>
      )}
    </div>
  )
}
