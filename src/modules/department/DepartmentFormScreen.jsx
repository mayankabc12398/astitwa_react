import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../core/auth/AuthContext.js'
import { Button } from '../../core/controls/Button.jsx'
import { TextInput } from '../../core/controls/inputs.jsx'
import { Alert, Card, Loading, PageHeader } from '../../core/controls/layout.jsx'
import { useUi } from '../../core/controls/uiContext.js'
import { useRecordForm } from '../../core/hooks/useRecordForm.js'
import { invalidateLookup } from '../../core/hooks/useLookup.js'
import { ConfigForm, DynamicField } from '../../config/DynamicField.jsx'
import { useScreenRules } from '../../config/useScreenRules.js'

const SCREEN_KEY = 'hr.department'

const BLANK = { departmentId: 0, deptCode: '', deptName: '' }

const FIELDS = [
  { key: 'deptCode', label: 'Code', required: true },
  { key: 'deptName', label: 'Name', required: true },
]

export default function DepartmentFormScreen() {
  const { id } = useParams()
  const navigate = useNavigate()
  const ui = useUi()
  const { has } = useAuth()
  const rules = useScreenRules(SCREEN_KEY)

  const record = useRecordForm({ path: '/hr/department', id, blank: BLANK })
  const canEdit = has('hr.department.edit')

  if (record.loading) return <Loading />
  if (record.loadError) return <Alert tone="error">{record.loadError.message}</Alert>

  async function onSubmit(e) {
    e.preventDefault()

    const clientErrors = rules.validateRequired(record.form, FIELDS)
    if (Object.keys(clientErrors).length > 0) {
      record.setErrors(clientErrors)
      return
    }

    const saved = await record.save()
    if (!saved) return

    invalidateLookup('/hr/department/lookup')
    ui.toast('Department saved.')
    navigate('/hr/department')
  }

  return (
    <form onSubmit={onSubmit}>
      <PageHeader title={record.isNew ? 'New department' : 'Department'} subtitle="Master data" />

      {record.message && <Alert tone="error">{record.message}</Alert>}

      <Card>
        <ConfigForm screenKey={SCREEN_KEY}>
          <DynamicField fieldKey="deptCode" label="Code" required defaultSeq={10} error={record.errors.deptCode}>
            {({ id: fieldId, invalid }) => (
              <TextInput id={fieldId} invalid={invalid} maxLength={40} disabled={!canEdit} {...record.bind('deptCode')} />
            )}
          </DynamicField>

          <DynamicField fieldKey="deptName" label="Name" required defaultSeq={20} error={record.errors.deptName}>
            {({ id: fieldId, invalid }) => (
              <TextInput id={fieldId} invalid={invalid} maxLength={150} disabled={!canEdit} {...record.bind('deptName')} />
            )}
          </DynamicField>
        </ConfigForm>

        <div className="form-actions">
          <Button type="submit" variant="primary" busy={record.saving} disabled={!canEdit}>
            Save
          </Button>
          <Button onClick={() => navigate('/hr/department')}>Cancel</Button>
        </div>
      </Card>
    </form>
  )
}
