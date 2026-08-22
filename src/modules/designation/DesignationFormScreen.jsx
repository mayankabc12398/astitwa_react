import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../core/auth/AuthContext.js'
import { Button } from '../../core/controls/Button.jsx'
import { TextInput } from '../../core/controls/inputs.jsx'
import { Alert, Card, Loading, PageHeader } from '../../core/controls/layout.jsx'
import { useUi } from '../../core/controls/uiContext.js'
import { useRecordForm } from '../../core/hooks/useRecordForm.js'
import { useScreenHooks } from '../../core/hooks/useScreenHooks.js'
import { invalidateLookup } from '../../core/hooks/useLookup.js'
import { ConfigForm, DynamicField } from '../../config/DynamicField.jsx'
import { useScreenRules } from '../../config/useScreenRules.js'

const SCREEN_KEY = 'hr.designation'

const BLANK = { designationId: 0, desigCode: '', desigName: '', grade: '' }

const FIELDS = [
  { key: 'desigCode', label: 'Code', required: true },
  { key: 'desigName', label: 'Name', required: true },
  { key: 'grade', label: 'Grade' },
]

export default function DesignationFormScreen() {
  const { id } = useParams()
  const navigate = useNavigate()
  const ui = useUi()
  const { has } = useAuth()
  const rules = useScreenRules(SCREEN_KEY)

  const record = useRecordForm({ path: '/hr/designation', id, blank: BLANK })
  const canEdit = has('hr.designation.edit')

  // Every hook slot this screen has. See core/hooks/useScreenHooks.js.
  const hooks = useScreenHooks(SCREEN_KEY, { record, canEdit })

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

    invalidateLookup('/hr/designation/lookup')
    ui.toast('Designation saved.')
    navigate('/hr/designation')
  }

  return (
    <form onSubmit={onSubmit}>
      <PageHeader title={record.isNew ? 'New designation' : 'Designation'} subtitle="Master data" />

      {record.message && <Alert tone="error">{record.message}</Alert>}

      <Card>
        <ConfigForm screenKey={SCREEN_KEY}>
          <DynamicField fieldKey="desigCode" label="Code" required defaultSeq={10} error={record.errors.desigCode}>
            {({ id: fieldId, invalid }) => (
              <TextInput id={fieldId} invalid={invalid} maxLength={40} disabled={hooks.locked('desigCode')} {...hooks.fieldProps('desigCode')} />
            )}
          </DynamicField>

          <DynamicField fieldKey="desigName" label="Name" required defaultSeq={20} error={record.errors.desigName}>
            {({ id: fieldId, invalid }) => (
              <TextInput id={fieldId} invalid={invalid} maxLength={150} disabled={hooks.locked('desigName')} {...hooks.fieldProps('desigName')} />
            )}
          </DynamicField>

          <DynamicField fieldKey="grade" label="Grade" defaultSeq={30} error={record.errors.grade}>
            {({ id: fieldId, invalid }) => (
              <TextInput id={fieldId} invalid={invalid} maxLength={40} disabled={hooks.locked('grade')} {...hooks.fieldProps('grade')} />
            )}
          </DynamicField>
        </ConfigForm>

        <div className="form-actions">
          <Button type="submit" variant="primary" busy={record.saving} disabled={!canEdit}>
            Save
          </Button>
          <Button onClick={() => navigate('/hr/designation')}>Cancel</Button>
        </div>
      </Card>
    </form>
  )
}
