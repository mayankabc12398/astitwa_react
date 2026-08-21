import { useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../core/auth/AuthContext.js'
import { Button } from '../../core/controls/Button.jsx'
import { DateInput, SelectInput, TextInput } from '../../core/controls/inputs.jsx'
import { Alert, Card, Loading, PageHeader } from '../../core/controls/layout.jsx'
import { useUi } from '../../core/controls/uiContext.js'
import { fieldHookKey, runHook } from '../../core/hooks/hookBridge.js'
import { invalidateLookup, useLookup } from '../../core/hooks/useLookup.js'
import { useRecordForm } from '../../core/hooks/useRecordForm.js'
import { ConfigForm, DynamicField } from '../../config/DynamicField.jsx'
import { useScreenRules } from '../../config/useScreenRules.js'

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

  const canEdit = has('hr.employee.edit')
  const onLoadFired = useRef(false)

  // hr.employee.onLoad — fires once, after the record is in hand.
  useEffect(() => {
    if (record.loading || onLoadFired.current) return
    onLoadFired.current = true

    runHook(`${SCREEN_KEY}.onLoad`, { form: record.form }).then((result) => {
      if (result.form) record.setForm((current) => ({ ...current, ...result.form }))
      if (result.message) ui.toast(result.message)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record.loading])

  if (record.loading) return <Loading />
  if (record.loadError) return <Alert tone="error">{record.loadError.message}</Alert>

  // hr.employee.field.<fieldKey>.onBlur
  async function onFieldBlur(fieldKey) {
    const result = await runHook(fieldHookKey(SCREEN_KEY, fieldKey), {
      form: record.form,
      value: record.form[fieldKey],
    })
    if (result.form) record.setForm((current) => ({ ...current, ...result.form }))
    if (result.message) ui.toast(result.message)
  }

  async function onSubmit(e) {
    e.preventDefault()

    const clientErrors = rules.validateRequired(record.form, FIELDS)
    if (Object.keys(clientErrors).length > 0) {
      record.setErrors(clientErrors)
      return
    }

    // hr.employee.beforeSave — a client script may stop the save outright.
    const before = await runHook(`${SCREEN_KEY}.beforeSave`, { form: record.form })
    if (before.cancelSave) {
      if (before.message) ui.error(before.message)
      return
    }

    const payload = {
      ...record.form,
      ...(before.form ?? {}),
      departmentId: Number(record.form.departmentId) || null,
      designationId: Number(record.form.designationId) || null,
      reportingManagerId: Number(record.form.reportingManagerId) || null,
      dob: record.form.dob || null,
      dateOfJoining: record.form.dateOfJoining || null,
    }

    const saved = await record.save(payload)
    if (!saved) return

    invalidateLookup('/hr/employee/lookup')

    // hr.employee.afterSave — the script decides where the user lands next.
    const after = await runHook(`${SCREEN_KEY}.afterSave`, { form: payload, response: saved })
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
                disabled={!canEdit}
                onBlur={() => onFieldBlur('employeeCode')}
                {...record.bind('employeeCode')}
              />
            )}
          </DynamicField>

          <DynamicField fieldKey="fullName" label="Name" required defaultSeq={20} error={record.errors.fullName}>
            {({ id: fieldId, invalid }) => (
              <TextInput
                id={fieldId}
                invalid={invalid}
                maxLength={180}
                disabled={!canEdit}
                onBlur={() => onFieldBlur('fullName')}
                {...record.bind('fullName')}
              />
            )}
          </DynamicField>

          <DynamicField fieldKey="dob" label="Date of birth" defaultSeq={30} error={record.errors.dob}>
            {({ id: fieldId, invalid }) => (
              <DateInput
                id={fieldId}
                invalid={invalid}
                disabled={!canEdit}
                onBlur={() => onFieldBlur('dob')}
                {...record.bind('dob')}
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
                disabled={!canEdit}
                onBlur={() => onFieldBlur('dateOfJoining')}
                {...record.bind('dateOfJoining')}
              />
            )}
          </DynamicField>

          <DynamicField fieldKey="departmentId" label="Department" defaultSeq={50} error={record.errors.departmentId}>
            {({ id: fieldId, invalid }) => (
              <SelectInput
                id={fieldId}
                invalid={invalid}
                disabled={!canEdit || departments.busy}
                options={departments.options}
                onBlur={() => onFieldBlur('departmentId')}
                {...record.bind('departmentId')}
              />
            )}
          </DynamicField>

          <DynamicField fieldKey="designationId" label="Designation" defaultSeq={60} error={record.errors.designationId}>
            {({ id: fieldId, invalid }) => (
              <SelectInput
                id={fieldId}
                invalid={invalid}
                disabled={!canEdit || designations.busy}
                options={designations.options}
                onBlur={() => onFieldBlur('designationId')}
                {...record.bind('designationId')}
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
                disabled={!canEdit || managers.busy}
                options={managers.options.filter((o) => String(o.value) !== String(record.form.employeeId))}
                onBlur={() => onFieldBlur('reportingManagerId')}
                {...record.bind('reportingManagerId')}
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
                disabled={!canEdit}
                onBlur={() => onFieldBlur('mobile')}
                {...record.bind('mobile')}
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
                disabled={!canEdit}
                onBlur={() => onFieldBlur('email')}
                {...record.bind('email')}
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
                disabled={!canEdit}
                options={STATUS_OPTIONS}
                placeholder="— select —"
                onBlur={() => onFieldBlur('employmentStatus')}
                {...record.bind('employmentStatus')}
              />
            )}
          </DynamicField>
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
