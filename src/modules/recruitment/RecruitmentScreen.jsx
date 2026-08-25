import { useCallback, useEffect, useMemo, useState } from 'react'
import { NhrScope } from '../../config/nhr/NhrScope.jsx'
import { Badge, Field, Input, Modal, Select, Stepper, Textarea, useToast } from '../../config/nhr/ui/index.js'
import { useAuth } from '../../core/auth/AuthContext.js'
import { Button } from '../../core/controls/Button.jsx'
import { DataTable } from '../../core/controls/DataTable.jsx'
import { Pagination } from '../../core/controls/Pagination.jsx'
import { TextInput } from '../../core/controls/inputs.jsx'
import { Alert, PageHeader } from '../../core/controls/layout.jsx'
import { useLookup } from '../../core/hooks/useLookup.js'
import { usePagedList } from '../../core/hooks/usePagedList.js'
import { ApiError } from '../../core/api/ApiError.js'
import { fieldColumnApi, requisitionApi } from '../screenFields/fieldColumnApi.js'
import '../screenFields/screenFields.css'

/**
 * Recruitment requisitions, raised through a three-step wizard.
 *
 * The wizard draws itself from the screen's registered layout rather than from a hardcoded
 * list: the steps are the screen's steps, and each step renders the fields configured for it,
 * in their configured order. A field the Screen Field Builder adds appears here with no change
 * to this file — which is the entire point of the feature, and the reason this screen reads
 * its own shape at run time instead of knowing it at build time.
 */

const SCREEN_CODE = 'HR_JOB_REQUISITION'

const asDate = (value) => (value ? String(value).slice(0, 10) : '—')

const COLUMNS = [
  { key: 'requisitionCode', label: 'Code', width: '110px' },
  { key: 'jobTitle', label: 'Job title' },
  { key: 'departmentName', label: 'Department', width: '160px' },
  { key: 'openings', label: 'Openings', width: '90px' },
  { key: 'employmentType', label: 'Type', width: '120px' },
  { key: 'priority', label: 'Priority', width: '100px' },
  { key: 'targetDate', label: 'Target', width: '120px', render: (row) => asDate(row.targetDate) },
  { key: 'status', label: 'Status', width: '110px' },
]

/** Every key the requisition owns itself; anything else configured on the screen is a column. */
const SHIPPED_KEYS = new Set([
  'jobTitle', 'departmentId', 'openings', 'experienceRange', 'employmentType', 'priority',
  'keySkills', 'budgetMin', 'budgetMax', 'targetDate', 'notes', 'status',
])

const BLANK = {
  requisitionId: 0,
  jobTitle: '',
  departmentId: '',
  openings: 1,
  experienceRange: '',
  employmentType: '',
  priority: 'Medium',
  keySkills: '',
  budgetMin: '',
  budgetMax: '',
  targetDate: '',
  notes: '',
  status: 'Draft',
  extra: {},
}

export default function RecruitmentScreen() {
  const toast = useToast()
  const { has } = useAuth()
  const list = usePagedList('/hr/job-requisition')
  const departments = useLookup('/hr/department/lookup')

  const [layout, setLayout] = useState(null)
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)
  const [form, setForm] = useState(BLANK)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState('')

  // The layout is fetched once and cached: it changes when an admin edits the screen, not
  // while a recruiter is filling the form in.
  useEffect(() => {
    fieldColumnApi.layout(SCREEN_CODE).then(setLayout).catch(() => setLayout(null))
  }, [])

  const steps = layout?.steps?.length ? layout.steps : ['Details']
  const canEdit = has('hr.jobRequisition.edit')

  const fieldsFor = useCallback(
    (index) =>
      (layout?.fields ?? [])
        .filter((f) => f.stepIndex === index && f.showInForm)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [layout],
  )

  const stepFields = useMemo(() => fieldsFor(step), [fieldsFor, step])

  function openWizard(row) {
    setErrors({})
    setFailure('')
    setStep(0)
    if (!row) {
      setForm(BLANK)
      setOpen(true)
      return
    }
    requisitionApi
      .get(row.requisitionId)
      .then((found) =>
        setForm({
          ...BLANK,
          ...found,
          departmentId: found.departmentId ?? '',
          targetDate: found.targetDate ? String(found.targetDate).slice(0, 10) : '',
          budgetMin: found.budgetMin ?? '',
          budgetMax: found.budgetMax ?? '',
          extra: found.extra ?? {},
        }),
      )
      .then(() => setOpen(true))
      .catch((cause) => toast.error('Could not open the requisition', cause?.message))
  }

  const valueOf = (field) => (SHIPPED_KEYS.has(field.fieldKey) ? form[field.fieldKey] : form.extra[field.fieldKey])

  const setValue = (field, value) => {
    setErrors((current) => ({ ...current, [field.fieldKey]: '' }))
    setForm((current) =>
      SHIPPED_KEYS.has(field.fieldKey)
        ? { ...current, [field.fieldKey]: value }
        : { ...current, extra: { ...current.extra, [field.fieldKey]: value } },
    )
  }

  /** A step is checked before it is left, so a problem is raised beside the field that has it. */
  function stepErrors(index) {
    const found = {}
    for (const field of fieldsFor(index)) {
      if (!field.isRequired) continue
      const value = valueOf(field)
      if (value === null || value === undefined || String(value).trim() === '') {
        found[field.fieldKey] = `${field.label} is required.`
      }
    }
    return found
  }

  function next() {
    const found = stepErrors(step)
    if (Object.keys(found).length > 0) {
      setErrors(found)
      return
    }
    setStep((current) => Math.min(current + 1, steps.length - 1))
  }

  async function submit() {
    const found = steps.reduce((all, _label, index) => ({ ...all, ...stepErrors(index) }), {})
    if (Object.keys(found).length > 0) {
      setErrors(found)
      setStep(steps.findIndex((_l, index) => Object.keys(stepErrors(index)).length > 0))
      return
    }

    setSaving(true)
    setFailure('')
    try {
      const saved = await requisitionApi.save({
        ...form,
        departmentId: form.departmentId === '' ? null : Number(form.departmentId),
        openings: Number(form.openings) || 1,
        budgetMin: form.budgetMin === '' ? null : Number(form.budgetMin),
        budgetMax: form.budgetMax === '' ? null : Number(form.budgetMax),
        targetDate: form.targetDate || null,
      })
      toast.success('Requisition saved', saved.requisitionCode)
      setOpen(false)
      list.refresh()
    } catch (cause) {
      if (cause instanceof ApiError) {
        setErrors(cause.fieldErrors ?? {})
        setFailure(cause.message)
      } else {
        setFailure('The requisition could not be saved.')
      }
    } finally {
      setSaving(false)
    }
  }

  /** One configured field, drawn as whatever its control type says. */
  function renderField(field) {
    const value = valueOf(field) ?? ''
    const error = errors[field.fieldKey]
    const common = {
      value,
      onChange: (e) => setValue(field, e.target.value),
      placeholder: field.placeholder || undefined,
      invalid: Boolean(error),
    }

    let control
    if (field.fieldKey === 'departmentId') {
      control = (
        <Select
          {...common}
          options={departments.options.map((o) => ({ value: String(o.value), label: o.label }))}
          placeholder="Search & select…"
        />
      )
    } else if (field.controlType === 'textarea') {
      control = <Textarea rows={3} {...common} />
    } else if (['dropdown', 'radio', 'multiselect'].includes(field.controlType)) {
      control = (
        <Select
          {...common}
          options={(field.options ?? []).map((o) => ({ value: o.optionValue, label: o.optionLabel }))}
          placeholder={field.placeholder || 'Select…'}
        />
      )
    } else if (field.controlType === 'checkbox') {
      control = (
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => setValue(field, e.target.checked ? 1 : 0)}
        />
      )
    } else if (field.controlType === 'date') {
      control = <Input type="date" {...common} />
    } else if (['number', 'decimal'].includes(field.controlType)) {
      control = <Input type="number" step={field.controlType === 'decimal' ? '0.01' : '1'} {...common} />
    } else {
      control = <Input maxLength={field.maxLength ?? undefined} {...common} />
    }

    return (
      <div key={field.fieldId} className={field.width === 'full' ? 'span-3' : undefined}>
        <Field label={field.label} required={field.isRequired} error={error} help={field.helpText || undefined}>
          {control}
        </Field>
      </div>
    )
  }

  const isReview = step === steps.length - 1 && stepFields.length === 0

  return (
    <NhrScope>
      <PageHeader
        title="Job Requisitions"
        subtitle="Recruitment"
        actions={
          canEdit && (
            <Button variant="primary" onClick={() => openWizard(null)}>
              New requisition
            </Button>
          )
        }
      />

      {list.error && <Alert tone="error">{list.error.message}</Alert>}

      <div className="toolbar">
        <TextInput
          placeholder="Search code, job title or type…"
          defaultValue={list.search}
          onChange={(e) => list.onSearch(e.target.value)}
          aria-label="Search requisitions"
          style={{ maxWidth: '360px' }}
        />
      </div>

      <DataTable
        caption="Job requisitions"
        columns={COLUMNS}
        rows={list.items}
        busy={list.busy}
        rowKey={(row) => row.requisitionId}
        onRowClick={(row) => openWizard(row)}
        emptyMessage="No requisitions raised yet."
      />

      <Pagination
        page={list.page}
        pageSize={list.pageSize}
        totalCount={list.totalCount}
        totalPages={list.totalPages}
        onPageChange={list.setPage}
        onPageSizeChange={list.setPageSize}
      />

      <Modal
        open={open}
        size="lg"
        onClose={() => setOpen(false)}
        title={form.requisitionId ? `Requisition ${form.requisitionCode ?? ''}` : 'New Job Requisition'}
        subtitle="Approved requisitions publish to the career site automatically"
        footer={
          <>
            {step > 0 && (
              <button type="button" className="btn btn-ghost" onClick={() => setStep((c) => c - 1)}>
                Back
              </button>
            )}
            {step < steps.length - 1 ? (
              <button type="button" className="btn btn-primary" onClick={next}>
                Continue
              </button>
            ) : (
              <button type="button" className="btn btn-primary" disabled={saving || !canEdit} onClick={submit}>
                {saving ? 'Saving…' : 'Submit requisition'}
              </button>
            )}
          </>
        }
      >
        {failure && <div className="alert alert-danger mb-3">{failure}</div>}

        <Stepper
          steps={steps.map((title, index) => ({
            title,
            sub: index === 0 ? 'What are we hiring?' : index === 1 ? 'Budget and dates' : 'Confirm & submit',
          }))}
          current={step}
          onStepClick={(index) => setStep(index)}
        />

        <div className="form-grid mt-3">{stepFields.map(renderField)}</div>

        {/* The last step of a wizard is usually a review, and a review step owns no fields —
            so it shows what the earlier steps captured rather than an empty card. */}
        {isReview && (
          <div className="sf-review">
            {steps.map((label, index) =>
              fieldsFor(index).length === 0 ? null : (
                <section key={label}>
                  <h4>{label}</h4>
                  <dl>
                    {fieldsFor(index).map((field) => (
                      <div key={field.fieldId}>
                        <dt>{field.label}</dt>
                        <dd>
                          {String(valueOf(field) ?? '').trim() === '' ? '—' : String(valueOf(field))}
                          {!field.isCustom ? null : <Badge tone="violet">custom</Badge>}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ),
            )}
          </div>
        )}
      </Modal>
    </NhrScope>
  )
}
