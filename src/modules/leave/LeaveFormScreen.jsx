import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../core/auth/AuthContext.js'
import { Button } from '../../core/controls/Button.jsx'
import { DateInput, SelectInput, TextArea } from '../../core/controls/inputs.jsx'
import { Alert, Badge, Card, Loading, PageHeader } from '../../core/controls/layout.jsx'
import { useUi } from '../../core/controls/uiContext.js'
import { useLookup } from '../../core/hooks/useLookup.js'
import { useRecordForm } from '../../core/hooks/useRecordForm.js'
import { useScreenHooks } from '../../core/hooks/useScreenHooks.js'
import { ConfigForm, DynamicField } from '../../config/DynamicField.jsx'
import { useScreenRules } from '../../config/useScreenRules.js'
import { inclusiveDays, statusTone } from './leaveShared.jsx'

const SCREEN_KEY = 'hr.leaveRequest'

const BLANK = {
  leaveRequestId: 0,
  employeeId: '',
  leaveTypeId: '',
  fromDate: '',
  toDate: '',
  days: 0,
  reason: '',
  status: 'Pending',
}

const FIELDS = [
  { key: 'employeeId', label: 'Employee', required: true },
  { key: 'leaveTypeId', label: 'Leave type', required: true },
  { key: 'fromDate', label: 'From date', required: true },
  { key: 'toDate', label: 'To date', required: true },
  { key: 'reason', label: 'Reason' },
]

const toDateInput = (value) => (value ? String(value).slice(0, 10) : '')

export default function LeaveFormScreen() {
  const { id } = useParams()
  const navigate = useNavigate()
  const ui = useUi()
  const { has } = useAuth()
  const rules = useScreenRules(SCREEN_KEY)

  const employees = useLookup('/hr/employee/lookup')
  const leaveTypes = useLookup('/hr/leave/types')

  const record = useRecordForm({
    path: '/hr/leave',
    id,
    blank: BLANK,
    map: (row) => ({
      ...BLANK,
      ...row,
      fromDate: toDateInput(row.fromDate),
      toDate: toDateInput(row.toDate),
    }),
  })

  const canEdit = has('hr.leave.edit')

  // Every hook slot this screen has. See core/hooks/useScreenHooks.js.
  const hooks = useScreenHooks(SCREEN_KEY, { record, canEdit })
  const isClosed = record.form.status && record.form.status !== 'Pending'

  // Derived from the range rather than stored, so the shown count can never drift from the
  // dates. The server recomputes it on save regardless.
  const computedDays = inclusiveDays(record.form.fromDate, record.form.toDate)

  if (record.loading) return <Loading />
  if (record.loadError) return <Alert tone="error">{record.loadError.message}</Alert>

  async function onSubmit(e) {
    e.preventDefault()

    const clientErrors = rules.validateRequired(record.form, FIELDS)

    // Layer 1 rule, mirrored client-side for speed of feedback.
    if (record.form.fromDate && record.form.toDate && record.form.toDate < record.form.fromDate) {
      clientErrors.toDate = 'The to-date cannot be earlier than the from-date.'
    }

    if (Object.keys(clientErrors).length > 0) {
      record.setErrors(clientErrors)
      return
    }

    const before = await hooks.beforeSave()
    if (before.cancelSave) {
      if (before.message) ui.error(before.message)
      return
    }

    const payload = {
      ...record.form,
      ...(before.form ?? {}),
      employeeId: Number(record.form.employeeId) || 0,
      leaveTypeId: Number(record.form.leaveTypeId) || 0,
      days: computedDays,
    }

    const saved = await record.save(payload)
    if (!saved) return

    const after = await hooks.afterSave(payload, saved)
    ui.toast(after.message ?? 'Leave request saved.')

    if (after.cancelNavigation) return
    navigate(after.redirectTo ?? '/hr/leave')
  }

  return (
    <form onSubmit={onSubmit}>
      <PageHeader
        title={record.isNew ? 'New leave request' : 'Leave request'}
        subtitle="Transactions"
        actions={record.form.status && <Badge tone={statusTone(record.form.status)}>{record.form.status}</Badge>}
      />

      {record.message && <Alert tone="error">{record.message}</Alert>}
      {isClosed && <Alert tone="info">This request has been decided and can no longer be edited.</Alert>}

      <Card>
        <ConfigForm screenKey={SCREEN_KEY}>
          <DynamicField fieldKey="employeeId" label="Employee" required defaultSeq={10} error={record.errors.employeeId}>
            {({ id: fieldId, invalid }) => (
              <SelectInput
                id={fieldId}
                invalid={invalid}
                options={employees.options}
                disabled={hooks.locked('employeeId') || isClosed || employees.busy}
                {...hooks.fieldProps('employeeId')}
              />
            )}
          </DynamicField>

          <DynamicField
            fieldKey="leaveTypeId"
            label="Leave type"
            required
            defaultSeq={20}
            error={record.errors.leaveTypeId}
          >
            {({ id: fieldId, invalid }) => (
              <SelectInput
                id={fieldId}
                invalid={invalid}
                options={leaveTypes.options}
                disabled={hooks.locked('leaveTypeId') || isClosed || leaveTypes.busy}
                {...hooks.fieldProps('leaveTypeId')}
              />
            )}
          </DynamicField>

          <DynamicField fieldKey="fromDate" label="From date" required defaultSeq={30} error={record.errors.fromDate}>
            {({ id: fieldId, invalid }) => (
              <DateInput
                id={fieldId}
                invalid={invalid}
                disabled={hooks.locked('fromDate') || isClosed}
                {...hooks.fieldProps('fromDate')}
              />
            )}
          </DynamicField>

          <DynamicField fieldKey="toDate" label="To date" required defaultSeq={40} error={record.errors.toDate}>
            {({ id: fieldId, invalid }) => (
              <DateInput
                id={fieldId}
                invalid={invalid}
                disabled={hooks.locked('toDate') || isClosed}
                {...hooks.fieldProps('toDate')}
              />
            )}
          </DynamicField>

          <DynamicField fieldKey="days" label="Days" defaultSeq={50} hint="Calculated from the date range.">
            {({ id: fieldId }) => (
              <input id={fieldId} className="input" value={computedDays} readOnly tabIndex={-1} />
            )}
          </DynamicField>

          <DynamicField fieldKey="reason" label="Reason" defaultSeq={60} span={2} error={record.errors.reason}>
            {({ id: fieldId, invalid }) => (
              <TextArea
                id={fieldId}
                invalid={invalid}
                maxLength={500}
                disabled={hooks.locked('reason') || isClosed}
                {...hooks.fieldProps('reason')}
              />
            )}
          </DynamicField>
        </ConfigForm>

        <div className="form-actions">
          <Button type="submit" variant="primary" busy={record.saving} disabled={!canEdit || isClosed}>
            Save
          </Button>
          <Button onClick={() => navigate('/hr/leave')}>Cancel</Button>
        </div>
      </Card>
    </form>
  )
}
