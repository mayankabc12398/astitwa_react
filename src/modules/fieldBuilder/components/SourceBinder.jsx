import { useState } from 'react'
import { AlertCircle, Check, Database, PlayCircle, ShieldCheck } from 'lucide-react'
import { Badge, Field, Input, Select } from '../../../config/nhr/ui/index.js'
import { fieldBuilderApi } from '../fieldBuilderApi.js'

/**
 * Points a dropdown at a registered data source.
 *
 * The source is picked from an allowlist the server seeds — there is no box to type a URL
 * into, because a configuration screen that accepted one would be an SSRF with a form
 * around it. "Test and load" then shows what the source actually returns and fills the
 * value and label pickers from those columns, so the binding is built from reality rather
 * than from somebody's memory of the payload.
 *
 * @param {{
 *   binding: object,
 *   dataSources: Array<object>,
 *   parents: Array<{value: string, label: string}>,
 *   error?: string,
 *   onChange: (binding: object) => void,
 * }} props
 */
export function SourceBinder({ binding, dataSources, parents, error, onChange }) {
  const [probe, setProbe] = useState(null)
  const [probing, setProbing] = useState(false)
  const [sampleParent, setSampleParent] = useState('')

  const source = dataSources.find((s) => s.sourceId === Number(binding.sourceId))
  const set = (patch) => onChange({ ...binding, ...patch })

  async function runProbe() {
    if (!source) return

    setProbing(true)
    try {
      const result = await fieldBuilderApi.probe({
        sourceId: source.sourceId,
        resultPath: binding.resultPath || null,
        parentValue: sampleParent || null,
      })
      setProbe(result)

      // Only fill pickers the author has not already decided, so testing again never
      // silently undoes a deliberate choice.
      const patch = {}
      if (!binding.valueField && result?.suggestedValueField) patch.valueField = result.suggestedValueField
      if (!binding.labelField && result?.suggestedLabelField) patch.labelField = result.suggestedLabelField
      if (!binding.resultPath && result?.resultPath) patch.resultPath = result.resultPath
      if (Object.keys(patch).length > 0) set(patch)
    } catch (cause) {
      setProbe({ error: cause?.message ?? 'The source could not be read.' })
    } finally {
      setProbing(false)
    }
  }

  const columns = probe?.columns ?? []
  const columnOptions = columns.map((c) => ({ value: c, label: c }))

  return (
    <div className="fb-binder">
      {error && (
        <div className="alert alert-danger mb-3">
          <AlertCircle size={15} /> {error}
        </div>
      )}

      <div className="fb-note mb-3">
        <ShieldCheck size={14} />
        <span>
          Sources are registered by the product. A dropdown can pick one, but it can never name an endpoint of its own.
        </span>
      </div>

      <div className="form-grid">
        <div className="span-2">
          <Field label="Source" required>
            <Select
              options={dataSources.map((s) => ({ value: s.sourceId, label: `${s.displayName} — ${s.sourceType}` }))}
              placeholder="— choose a source —"
              value={binding.sourceId || ''}
              onChange={(e) => {
                setProbe(null)
                set({ sourceId: Number(e.target.value), valueField: '', labelField: '', resultPath: '' })
              }}
            />
          </Field>
        </div>

        <Field label="Cache for" help="Seconds. 0 reads every time.">
          <Input
            type="number"
            min={0}
            value={binding.cacheSeconds ?? 300}
            onChange={(e) => set({ cacheSeconds: Number(e.target.value) || 0 })}
          />
        </Field>
      </div>

      {source && (
        <>
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <Badge tone="info">
              <Database size={12} /> {source.sourceType}
            </Badge>
            {source.relativeUrl && <code className="t-xs ink-3">{source.relativeUrl}</code>}
            {source.requiresParent && <Badge tone="warning">Needs a parent value</Badge>}
          </div>

          {source.requiresParent && (
            <Field label="Sample parent value" help="This source returns nothing until it has one.">
              <Input value={sampleParent} onChange={(e) => setSampleParent(e.target.value)} />
            </Field>
          )}

          <button className="btn btn-ghost btn-sm mb-3" onClick={runProbe} disabled={probing}>
            <PlayCircle size={14} /> {probing ? 'Reading…' : 'Test and load fields'}
          </button>

          {probe?.error && (
            <div className="alert alert-danger mb-3">
              <AlertCircle size={15} /> {probe.error}
            </div>
          )}

          {probe && !probe.error && (
            <div className="alert alert-success mb-3">
              <Check size={15} />
              <span>
                {probe.rows?.length ?? 0} sample row(s), {columns.length} column(s).
              </span>
            </div>
          )}

          <div className="form-grid">
            <Field label="Value column" required help="What gets stored.">
              {columnOptions.length > 0 ? (
                <Select
                  options={columnOptions}
                  value={binding.valueField ?? ''}
                  onChange={(e) => set({ valueField: e.target.value })}
                />
              ) : (
                <Input
                  value={binding.valueField ?? ''}
                  placeholder="test the source to list its columns"
                  onChange={(e) => set({ valueField: e.target.value })}
                />
              )}
            </Field>

            <Field label="Label column" required help="What the user reads.">
              {columnOptions.length > 0 ? (
                <Select
                  options={columnOptions}
                  value={binding.labelField ?? ''}
                  onChange={(e) => set({ labelField: e.target.value })}
                />
              ) : (
                <Input
                  value={binding.labelField ?? ''}
                  placeholder="test the source to list its columns"
                  onChange={(e) => set({ labelField: e.target.value })}
                />
              )}
            </Field>

            <Field label="Label template" help="Optional, e.g. {name} — {code}. Overrides the label column.">
              <Input
                value={binding.labelTemplate ?? ''}
                onChange={(e) => set({ labelTemplate: e.target.value })}
              />
            </Field>

            <Field label="Rows live at" help="Path inside the payload, e.g. data.items. Blank means the root.">
              <Input value={binding.resultPath ?? ''} onChange={(e) => set({ resultPath: e.target.value })} />
            </Field>

            <Field label="Search parameter" help="The name this source expects a type-ahead term under.">
              <Input value={binding.searchParamName ?? ''} onChange={(e) => set({ searchParamName: e.target.value })} />
            </Field>

            <Field label="Fixed parameters" help="A JSON object sent with every call.">
              <Input
                value={binding.staticParamsJson ?? ''}
                placeholder='{"isActive":true}'
                onChange={(e) => set({ staticParamsJson: e.target.value })}
              />
            </Field>

            {parents.length > 0 && (
              <>
                <Field label="Filtered by" help="A field whose value narrows this list.">
                  <Select
                    options={parents}
                    placeholder="— nothing —"
                    value={binding.parentFieldKey ?? ''}
                    onChange={(e) => set({ parentFieldKey: e.target.value })}
                  />
                </Field>

                <Field label="Parent parameter" help="The name the parent value travels under.">
                  <Input
                    value={binding.parentParamName ?? ''}
                    placeholder="parentValue"
                    onChange={(e) => set({ parentParamName: e.target.value })}
                  />
                </Field>
              </>
            )}
          </div>

          {probe?.rows?.length > 0 && (
            <div className="fb-probe">
              <div className="t-xs ink-3 mb-2">What the source returned</div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      {columns.map((c) => (
                        <th key={c}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {probe.rows.slice(0, 5).map((row, i) => (
                      <tr key={i}>
                        {columns.map((c) => (
                          <td key={c}>{String(row[c] ?? '—')}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
