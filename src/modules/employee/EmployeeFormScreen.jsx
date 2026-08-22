import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../core/auth/AuthContext.js'
import { Button } from '../../core/controls/Button.jsx'
import { DateInput, NumberInput, SelectInput, TextInput } from '../../core/controls/inputs.jsx'
import { Alert, Card, Loading, PageHeader } from '../../core/controls/layout.jsx'
import { useUi } from '../../core/controls/uiContext.js'
import { invalidateLookup, useLookup } from '../../core/hooks/useLookup.js'
import { useRecordForm } from '../../core/hooks/useRecordForm.js'
import { useScreenHooks } from '../../core/hooks/useScreenHooks.js'
import { ConfigForm, DynamicField } from '../../config/DynamicField.jsx'
import { useScreenRules } from '../../config/useScreenRules.js'
import { CustomFieldSection } from '../../config/customFields/CustomFieldSection.jsx'
import { useCustomFields, useCustomValues } from '../../config/customFields/useCustomFields.js'

const SCREEN_KEY = 'hr.employee'

const BLANK = {
  employeeId: 0,
  employeeCode: '',
  fullName: '',
  dob: '',
  dateOfJoining: '',
  departmentId: '',
  designationId: '',
  reportingManagerId: '',
  mobile: '',
  email: '',
  employmentStatus: 'Active',
  grossCtc: '',
  hra: '',
  tds: '',
  netSalary: '',
}

const FIELDS = [
  { key: 'employeeCode', label: 'Employee code', required: true },
  { key: 'fullName', label: 'Name', required: true },
  { key: 'dob', label: 'Date of birth' },
  { key: 'dateOfJoining', label: 'Date of joining' },
  { key: 'departmentId', label: 'Department' },
  { key: 'designationId', label: 'Designation' },
  { key: 'reportingManagerId', label: 'Reporting manager' },
  { key: 'mobile', label: 'Mobile' },
  { key: 'email', label: 'Email' },
  { key: 'employmentStatus', label: 'Employment status' },
  { key: 'grossCtc', label: 'Gross CTC' },
  { key: 'hra', label: 'HRA' },
  { key: 'tds', label: 'TDS' },
  { key: 'netSalary', label: 'Net salary' },
]

const STATUS_OPTIONS = [
  { value: 'Active', label: 'Active' },
  { value: 'Probation', label: 'Probation' },
  { value: 'Notice', label: 'Notice period' },
  { value: 'Exited', label: 'Exited' },
]

/** yyyy-MM-dd for <input type="date">; the API sends full timestamps. */
const toDateInput = (value) => (value ? String(value).slice(0, 10) : '')

export default function EmployeeFormScreen() {
  const { id } = useParams()
  const navigate = useNavigate()
  const ui = useUi()
  const { has } = useAuth()
  const rules = useScreenRules(SCREEN_KEY)

  const departments = useLookup('/hr/department/lookup')
  const designations = useLookup('/hr/designation/lookup')
  const managers = useLookup('/hr/employee/lookup')

  // Fields this tenant added to the employee screen. They render beside the compiled ones
  // and are written after the record's own save, because a value needs a record to hang on.
  const custom = useCustomFields(SCREEN_KEY)
  const customValues = useCustomValues(SCREEN_KEY, id)
  const [customErrors, setCustomErrors] = useState({})

  const record = useRecordForm({
    path: '/hr/employee',
    id,
    blank: BLANK,
    map: (row) => ({
      ...BLANK,
      ...row,
      dob: toDateInput(row.dob),
      dateOfJoining: toDateInput(row.dateOfJoining),
      departmentId: row.departmentId ?? '',
      designationId: row.designationId ?? '',
      reportingManagerId: row.reportingManagerId ?? '',
    }),
  })
console.log('record', record)
  const canEdit = has('hr.employee.edit')

  /*
   * Every hook slot this screen has.
   *
   * The plumbing — the debounce timers, which bag a field key belongs to, what a result may
   * carry — is Layer 1 rather than something this file owns, so a slot added there reaches
   * every form screen at once instead of being copied into each.
   */
  const hooks = useScreenHooks(SCREEN_KEY, {
    record,
    customFields: custom.fields,
    customValues,
    canEdit,
  })

  if (record.loading) return <Loading />
  if (record.loadError) return <Alert tone="error">{record.loadError.message}</Alert>

  async function onSubmit(e) {
    e.preventDefault()

    const clientErrors = rules.validateRequired(record.form, FIELDS)
    if (Object.keys(clientErrors).length > 0) {
      record.setErrors(clientErrors)
      return
    }

    // hr.employee.beforeSave — a client script may stop the save outright.
    const before = await hooks.beforeSave()
    if (before.cancelSave) {
      if (before.message) ui.error(before.message)
      return
    }

    // A beforeSave hook may have supplied values, so coerce the MERGED form rather than
    // the raw one — otherwise the conversions below would quietly overwrite whatever the
    // script returned for these keys.
    const merged = { ...record.form, ...(before.form ?? {}) }

    // Blank means "not recorded", which is not the same as zero. Send null so the column
    // stays NULL instead of the record claiming a salary of nought.
    const money = (value) => {
      if (value === '' || value === null || value === undefined) return null
      const parsed = Number(value)
      return Number.isFinite(parsed) ? parsed : null
    }

    const payload = {
      ...merged,
      departmentId: Number(merged.departmentId) || null,
      designationId: Number(merged.designationId) || null,
      reportingManagerId: Number(merged.reportingManagerId) || null,
      dob: merged.dob || null,
      dateOfJoining: merged.dateOfJoining || null,
      grossCtc: money(merged.grossCtc),
      hra: money(merged.hra),
      tds: money(merged.tds),
      netSalary: money(merged.netSalary),
    }

    const saved = await record.save(payload)
    if (!saved) return

    // The record has an id only now, so its custom values are written second. A failure here
    // leaves the employee saved and the user on the form with the offending field marked —
    // rolling the employee back would be worse, because the record itself was accepted.
    const written = await customValues.save(saved.employeeId, custom.fields)
    if (!written.ok) {
      setCustomErrors(written.errors)
      ui.error(written.message ?? 'The employee was saved, but its extra fields were not.')
      return
    }
    setCustomErrors({})

    invalidateLookup('/hr/employee/lookup')

    // hr.employee.afterSave — the script decides where the user lands next.
    const after = await hooks.afterSave(payload, saved)
    if (after.message) ui.toast(after.message)
    else ui.toast('Employee saved.')

    if (after.cancelNavigation) return
    navigate(after.redirectTo ?? '/hr/employee')
  }

  return (
    <form onSubmit={onSubmit}>
      <PageHeader title={record.isNew ? 'New employee' : record.form.fullName || 'Employee'} subtitle="Master data" />

      {record.message && <Alert tone="error">{record.message}</Alert>}

      <Card>
        <ConfigForm screenKey={SCREEN_KEY}>
          <DynamicField
            fieldKey="employeeCode"
            label="Employee code"
            required
            defaultSeq={10}
            error={record.errors.employeeCode}
          >
            {({ id: fieldId, invalid }) => (
              <TextInput
                id={fieldId}
                invalid={invalid}
                maxLength={40}
                disabled={hooks.locked('employeeCode')}
                {...hooks.fieldProps('employeeCode')}
              />
            )}
          </DynamicField>

          <DynamicField fieldKey="fullName" label="Name" required defaultSeq={20} error={record.errors.fullName}>
            {({ id: fieldId, invalid }) => (
              <TextInput
                id={fieldId}
                invalid={invalid}
                maxLength={180}
                disabled={hooks.locked('fullName')}
                {...hooks.fieldProps('fullName')}
              />
            )}
          </DynamicField>

          <DynamicField fieldKey="dob" label="Date of birth" defaultSeq={30} error={record.errors.dob}>
            {({ id: fieldId, invalid }) => (
              <DateInput
                id={fieldId}
                invalid={invalid}
                disabled={hooks.locked('dob')}
                {...hooks.fieldProps('dob')}
              />
            )}
          </DynamicField>

          <DynamicField
            fieldKey="dateOfJoining"
            label="Date of joining"
            defaultSeq={40}
            error={record.errors.dateOfJoining}
          >
            {({ id: fieldId, invalid }) => (
              <DateInput
                id={fieldId}
                invalid={invalid}
                disabled={hooks.locked('dateOfJoining')}
                {...hooks.fieldProps('dateOfJoining')}
              />
            )}
          </DynamicField>

          <DynamicField fieldKey="departmentId" label="Department" defaultSeq={50} error={record.errors.departmentId}>
            {({ id: fieldId, invalid }) => (
              <SelectInput
                id={fieldId}
                invalid={invalid}
                disabled={hooks.locked('departmentId') || departments.busy}
                options={departments.options}
                {...hooks.fieldProps('departmentId')}
              />
            )}
          </DynamicField>

          <DynamicField fieldKey="designationId" label="Designation" defaultSeq={60} error={record.errors.designationId}>
            {({ id: fieldId, invalid }) => (
              <SelectInput
                id={fieldId}
                invalid={invalid}
                disabled={hooks.locked('designationId') || designations.busy}
                options={designations.options}
                {...hooks.fieldProps('designationId')}
              />
            )}
          </DynamicField>

          {/*
            Acceptance scenario 1 hides this for one tenant with a single cfg_field_rule row.
            Nothing in this file changes, and no other tenant is affected.
          */}
          <DynamicField
            fieldKey="reportingManagerId"
            label="Reporting manager"
            defaultSeq={70}
            error={record.errors.reportingManagerId}
          >
            {({ id: fieldId, invalid }) => (
              <SelectInput
                id={fieldId}
                invalid={invalid}
                disabled={hooks.locked('reportingManagerId') || managers.busy}
                options={managers.options.filter((o) => String(o.value) !== String(record.form.employeeId))}
                {...hooks.fieldProps('reportingManagerId')}
              />
            )}
          </DynamicField>

          {/* Acceptance scenario 3 attaches a named-query lookup to this field's onBlur. */}
          <DynamicField fieldKey="mobile" label="Mobile" defaultSeq={80} error={record.errors.mobile}>
            {({ id: fieldId, invalid }) => (
              <TextInput
                id={fieldId}
                invalid={invalid}
                maxLength={30}
                inputMode="tel"
                disabled={hooks.locked('mobile')}
                {...hooks.fieldProps('mobile')}
              />
            )}
          </DynamicField>

          <DynamicField fieldKey="email" label="Email" defaultSeq={90} error={record.errors.email}>
            {({ id: fieldId, invalid }) => (
              <TextInput
                id={fieldId}
                type="email"
                invalid={invalid}
                maxLength={150}
                disabled={hooks.locked('email')}
                {...hooks.fieldProps('email')}
              />
            )}
          </DynamicField>

          <DynamicField
            fieldKey="employmentStatus"
            label="Employment status"
            defaultSeq={100}
            error={record.errors.employmentStatus}
          >
            {({ id: fieldId, invalid }) => (
              <SelectInput
                id={fieldId}
                invalid={invalid}
                disabled={hooks.locked('employmentStatus')}
                options={STATUS_OPTIONS}
                placeholder="— select —"
                {...hooks.fieldProps('employmentStatus')}
              />
            )}
          </DynamicField>

          {/*
            Compensation. Every one of these is a DynamicField like the rest, so a tenant
            that does not want salary on this screen hides them with cfg_field_rule rows —
            no code change, no build. The labels here are the PRODUCT DEFAULT; a config row
            overrides them, which is why none of this is hardcoded anywhere else.
          */}
          <DynamicField fieldKey="grossCtc" label="Gross CTC" defaultSeq={110} error={record.errors.grossCtc}>
            {({ id: fieldId, invalid }) => (
              <NumberInput
                id={fieldId}
                invalid={invalid}
                disabled={hooks.locked('grossCtc')}
                min="0"
                step="0.01"
                inputMode="decimal"
                {...hooks.fieldProps('grossCtc')}
              />
            )}
          </DynamicField>

          <DynamicField fieldKey="hra" label="HRA" defaultSeq={120} error={record.errors.hra}>
            {({ id: fieldId, invalid }) => (
              <NumberInput
                id={fieldId}
                invalid={invalid}
                disabled={hooks.locked('hra')}
                min="0"
                step="0.01"
                inputMode="decimal"
                {...hooks.fieldProps('hra')}
              />
            )}
          </DynamicField>

          <DynamicField fieldKey="tds" label="TDS" defaultSeq={130} error={record.errors.tds}>
            {({ id: fieldId, invalid }) => (
              <NumberInput
                id={fieldId}
                invalid={invalid}
                disabled={hooks.locked('tds')}
                min="0"
                step="0.01"
                inputMode="decimal"
                {...hooks.fieldProps('tds')}
              />
            )}
          </DynamicField>

          <DynamicField fieldKey="netSalary" label="Net salary" defaultSeq={140} error={record.errors.netSalary}>
            {({ id: fieldId, invalid }) => (
              <NumberInput
                id={fieldId}
                invalid={invalid}
                disabled={hooks.locked('netSalary')}
                min="0"
                step="0.01"
                inputMode="decimal"
                {...hooks.fieldProps('netSalary')}
              />
            )}
          </DynamicField>

          {/* Inside the same ConfigForm and using the same controls, so a field this tenant
              added is indistinguishable from one the product shipped with. Its sequence
              numbers start above the compiled ones, which is what puts it last. */}
          <CustomFieldSection
            fields={custom.fields}
            values={customValues.values}
            errors={customErrors}
            disabled={!canEdit}
            onChange={customValues.setValue}
            onFieldBlur={hooks.onFieldBlur}
            onFieldChange={hooks.onFieldChange}
          />
        </ConfigForm>

        <div className="form-actions">
          <Button type="submit" variant="primary" busy={record.saving} disabled={!canEdit}>
            Save
          </Button>
          <Button onClick={() => navigate('/hr/employee')}>Cancel</Button>
        </div>
      </Card>
    </form>
  )
}
