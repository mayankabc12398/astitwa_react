import { Drawer, Field, Input, Select, SwitchField, Textarea } from '../../../config/nhr/ui/index.js'
import { ALIGNS, ORIENTATIONS, PAGE_SIZES, STYLE_PRESETS } from '../../../config/print/templateRenderer.js'

const asOptions = (values) => values.map((v) => ({ value: v, label: v }))

const PRESET_HINTS = {
  Ruled: 'Ruled — the statutory form: hairline rules, ruled cells, centred letterhead',
  Letter: 'Letter — the appointment letter: accent rule, split letterhead, justified body',
  Accent: 'Accent — the tabular report: tinted table head, zebra rows',
}

/**
 * Everything about the page rather than about one block: size, margins, type, colour and
 * the letterhead.
 *
 * Separate from the structure drawer because these are set once when a template is created
 * and rarely touched again, while blocks are what an author actually works on.
 */
export function PageSetupDrawer({ open, template, onClose, onChange }) {
  if (!template) return null

  const patch = (changes) => onChange({ ...template, ...changes })

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size="md"
      title="Page setup"
      subtitle={`${template.pageSize} ${template.orientation} · ${template.stylePreset}`}
    >
      <div className="text-xs uppercase tracking-wide opacity-60 mb-2">Look</div>

      <Field label="Style preset" help={PRESET_HINTS[template.stylePreset]}>
        <Select
          options={STYLE_PRESETS.map((p) => ({ value: p, label: p }))}
          value={template.stylePreset}
          onChange={(e) => patch({ stylePreset: e.target.value })}
        />
      </Field>

      <div className="form-grid">
        <Field label="Accent colour">
          <Input value={template.accentColor} onChange={(e) => patch({ accentColor: e.target.value })} />
        </Field>
        <Field label="Text colour">
          <Input value={template.textColor} onChange={(e) => patch({ textColor: e.target.value })} />
        </Field>
        <Field label="Typeface" help="Blank follows the preset.">
          <Input value={template.fontFamily ?? ''} onChange={(e) => patch({ fontFamily: e.target.value })} />
        </Field>
        <Field label="Type size (pt)">
          <Input
            type="number"
            min={6}
            max={24}
            step="0.5"
            value={template.fontSizePt}
            onChange={(e) => patch({ fontSizePt: Number(e.target.value) || 10.5 })}
          />
        </Field>
        <Field label="Line height">
          <Input
            type="number"
            min={1}
            max={3}
            step="0.05"
            value={template.lineHeight}
            onChange={(e) => patch({ lineHeight: Number(e.target.value) || 1.45 })}
          />
        </Field>
      </div>

      <div className="text-xs uppercase tracking-wide opacity-60 mt-4 mb-2">Paper</div>

      <div className="form-grid">
        <Field label="Size">
          <Select options={asOptions(PAGE_SIZES)} value={template.pageSize} onChange={(e) => patch({ pageSize: e.target.value })} />
        </Field>
        <Field label="Orientation">
          <Select
            options={asOptions(ORIENTATIONS)}
            value={template.orientation}
            onChange={(e) => patch({ orientation: e.target.value })}
          />
        </Field>

        {[
          ['marginTop', 'Top'],
          ['marginRight', 'Right'],
          ['marginBottom', 'Bottom'],
          ['marginLeft', 'Left'],
        ].map(([key, label]) => (
          <Field key={key} label={`${label} margin (mm)`}>
            <Input
              type="number"
              min={0}
              max={60}
              step="0.5"
              value={template[key]}
              onChange={(e) => patch({ [key]: Number(e.target.value) || 0 })}
            />
          </Field>
        ))}
      </div>

      <div className="text-xs uppercase tracking-wide opacity-60 mt-4 mb-2">Letterhead</div>

      <Field label="Logo URL" help="Setting one switches the logo on.">
        <Input
          value={template.logoUrl ?? ''}
          onChange={(e) => patch({ logoUrl: e.target.value, showLogo: Boolean(e.target.value) })}
        />
      </Field>

      <div className="form-grid">
        <Field label="Logo height (mm)">
          <Input
            type="number"
            min={0}
            max={60}
            step="0.5"
            value={template.logoHeightMm}
            onChange={(e) => patch({ logoHeightMm: Number(e.target.value) || 14 })}
          />
        </Field>
        <Field label="Logo alignment">
          <Select options={asOptions(ALIGNS)} value={template.logoAlign} onChange={(e) => patch({ logoAlign: e.target.value })} />
        </Field>
        <Field label="Letterhead alignment" help="Blank follows the logo.">
          <Select
            options={asOptions(ALIGNS)}
            placeholder="— follow the logo —"
            value={template.headerAlign ?? ''}
            onChange={(e) => patch({ headerAlign: e.target.value })}
          />
        </Field>
      </div>

      <Field label="Letterhead markup" help="Your own HTML. Blank prints the organisation name.">
        <Textarea rows={3} value={template.headerHtml ?? ''} onChange={(e) => patch({ headerHtml: e.target.value })} />
      </Field>

      <Field label="Footer markup">
        <Textarea rows={2} value={template.footerHtml ?? ''} onChange={(e) => patch({ footerHtml: e.target.value })} />
      </Field>

      <SwitchField
        label="Page numbers"
        desc="Printed bottom right"
        checked={template.showPageNumbers !== false}
        onChange={(v) => patch({ showPageNumbers: v })}
      />

      <Field label="Watermark" help="Blank prints none.">
        <Input
          value={template.watermarkText ?? ''}
          onChange={(e) => patch({ watermarkText: e.target.value, showWatermark: Boolean(e.target.value) })}
        />
      </Field>
    </Drawer>
  )
}
