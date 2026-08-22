import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Eye, FilePlus2 } from 'lucide-react'
import { Field, Input, Modal, SearchSelect, Select, Textarea } from '../../../config/nhr/ui/index.js'
import { TemplatePreview } from '../../../config/print/TemplatePreview.jsx'
import { documentsApi } from '../documentsApi.js'

/**
 * Issue a document.
 *
 * Two columns: the form on the left, the letter as it will print on the right. The preview
 * is the same render the print path uses, so an author is looking at the document rather
 * than at a description of it, and a wrong template is obvious before anything is saved.
 */
export function IssueDocumentModal({ open, presetType, documentTypes, onClose, onIssued }) {
  const [form, setForm] = useState(() => blank(presetType))
  const [employees, setEmployees] = useState([])
  const [templates, setTemplates] = useState([])
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const set = (patch) => setForm((current) => ({ ...current, ...patch }))

  // Reopening the dialog, or opening it preset to a different document, starts a fresh
  // form. Resetting during render is React's documented way to key state off a prop, and it
  // is what the record forms already do — clearing inside an effect would show the previous
  // draft for a frame.
  const formKey = `${open ? 'open' : 'shut'}|${presetType ?? ''}`
  const [currentKey, setCurrentKey] = useState(formKey)

  if (currentKey !== formKey) {
    setCurrentKey(formKey)
    setForm(blank(presetType))
    setErrors({})
    setMessage('')
  }

  useEffect(() => {
    let alive = true
    documentsApi
      .employees()
      .then((rows) => {
        if (alive) setEmployees((rows ?? []).map((r) => ({ value: r.id, label: r.label })))
      })
      .catch(() => {
        if (alive) setEmployees([])
      })

    return () => {
      alive = false
    }
  }, [])

  // The template list is per document type, so it reloads with it rather than offering a
  // letterhead built for a different kind of letter.
  const documentType = form.documentType
  useEffect(() => {
    if (!documentType) return undefined

    let alive = true
    documentsApi
      .templates(documentType)
      .then((rows) => {
        if (alive) setTemplates((rows ?? []).map((r) => ({ value: r.id, label: r.label })))
      })
      .catch(() => {
        if (alive) setTemplates([])
      })

    return () => {
      alive = false
    }
  }, [documentType])

  const type = documentTypes.find((d) => d.documentType === documentType)

  // Stand-in values so the preview is a letter rather than a row of dashes. The real
  // context is assembled server-side once the document exists.
  const previewData = useMemo(
    () => ({
      refNo: 'will be generated',
      employeeName: employees.find((e) => String(e.value) === String(form.employeeId))?.label ?? 'The employee',
      subject: form.subject,
      documentType: form.documentType,
      documentTitle: type?.defaultTitle ?? '',
      effectiveDate: form.effectiveDate,
      validTill: form.validTill,
      signedBy: form.signedBy,
      bodyText: form.bodyText,
      printedOn: new Date().toLocaleString(),
    }),
    [form, employees, type],
  )

  async function submit() {
    setBusy(true)
    setErrors({})
    setMessage('')

    try {
      const saved = await documentsApi.save({
        ...form,
        documentId: 0,
        employeeId: Number(form.employeeId) || 0,
        templateId: form.templateId ? Number(form.templateId) : null,
        effectiveDate: form.effectiveDate || null,
        validTill: form.validTill || null,
      })

      onIssued?.(saved)
      onClose()
    } catch (cause) {
      setErrors(cause?.fieldErrors ?? {})
      setMessage(cause?.message ?? 'The document could not be created.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="Issue a document"
      subtitle="It is created as a draft — nothing leaves the building until it is signed and issued."
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy} onClick={submit}>
            <FilePlus2 size={14} /> {busy ? 'Creating…' : 'Create draft'}
          </button>
        </>
      }
    >
      {message && (
        <div className="alert alert-danger mb-3">
          <AlertCircle size={15} /> {message}
        </div>
      )}

      <div className="dc-issue">
        <div>
          <div className="form-grid">
            <div className="span-3">
              <Field label="Employee" required error={errors.employeeId}>
                <SearchSelect
                  options={employees}
                  value={form.employeeId}
                  placeholder="Search by name or code…"
                  onChange={(e) => set({ employeeId: e.target.value })}
                />
              </Field>
            </div>

            <div className="span-2">
              <Field label="Document" required error={errors.documentType}>
                <Select
                  options={documentTypes.map((d) => ({ value: d.documentType, label: d.displayName }))}
                  placeholder="— choose —"
                  value={form.documentType}
                  onChange={(e) => set({ documentType: e.target.value, templateId: '' })}
                />
              </Field>
            </div>

            <Field label="Template" help="Blank uses the default.">
              <Select
                options={templates}
                placeholder="— default —"
                value={form.templateId}
                onChange={(e) => set({ templateId: e.target.value })}
              />
            </Field>

            <div className="span-3">
              <Field label="Subject" error={errors.subject}>
                <Input value={form.subject} maxLength={300} onChange={(e) => set({ subject: e.target.value })} />
              </Field>
            </div>

            <Field label="Effective date" error={errors.effectiveDate}>
              <Input type="date" value={form.effectiveDate} onChange={(e) => set({ effectiveDate: e.target.value })} />
            </Field>

            <Field label="Valid till" error={errors.validTill}>
              <Input type="date" value={form.validTill} onChange={(e) => set({ validTill: e.target.value })} />
            </Field>

            <Field label="Signatory" help="Name, or “Name (Role)”.">
              <Input value={form.signedBy} maxLength={150} onChange={(e) => set({ signedBy: e.target.value })} />
            </Field>

            <div className="span-3">
              <Field
                label="Letter body"
                help="One paragraph per blank line. {{employeeName}} and any other field key are filled in when it prints. A template carrying its own copy overrides this."
                error={errors.bodyText}
              >
                <Textarea rows={9} value={form.bodyText} onChange={(e) => set({ bodyText: e.target.value })} />
              </Field>
            </div>
          </div>
        </div>

        <div className="dc-issue-preview">
          <div className="t-sm fw-7 ink-2 mb-2 flex items-center gap-2">
            <Eye size={14} /> As it will print
          </div>
          {form.documentType ? (
            <TemplatePreview documentType={form.documentType} data={previewData} options={{ title: form.subject }} />
          ) : (
            <div className="t-sm ink-3">Choose a document to see it laid out.</div>
          )}
        </div>
      </div>
    </Modal>
  )
}

const blank = (presetType) => ({
  documentType: presetType || '',
  employeeId: '',
  templateId: '',
  subject: '',
  bodyText: '',
  effectiveDate: '',
  validTill: '',
  signedBy: '',
  status: 'Draft',
})
