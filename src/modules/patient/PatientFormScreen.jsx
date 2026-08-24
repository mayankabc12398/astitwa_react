import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../core/auth/AuthContext.js'
import { Button } from '../../core/controls/Button.jsx'
import { DateInput, SelectInput, TextInput } from '../../core/controls/inputs.jsx'
import { Alert, Card, Loading, PageHeader } from '../../core/controls/layout.jsx'
import { useUi } from '../../core/controls/uiContext.js'
import { invalidateLookup } from '../../core/hooks/useLookup.js'
import { useRecordForm } from '../../core/hooks/useRecordForm.js'
import { useScreenHooks } from '../../core/hooks/useScreenHooks.js'
import { ConfigForm, DynamicField } from '../../config/DynamicField.jsx'
import { useScreenRules } from '../../config/useScreenRules.js'
import { CustomFieldSection } from '../../config/customFields/CustomFieldSection.jsx'
import { useCustomFields, useCustomValues } from '../../config/customFields/useCustomFields.js'

/**
 * Patient registration.
 *
 * Built on the same three pieces every form screen here is built on, which is what makes it
 * configurable the day it ships rather than the day somebody gets round to it:
 *
 *   DynamicField   — Layer 2 can relabel, reorder, hide or require any of these fields with
 *                    a cfg_field_rule row, per tenant, with no build.
 *   useScreenHooks — Layer 5 slots: hr.patient.onLoad / beforeSave / afterSave, and a
 *                    per-field onBlur and onChange for each of the ten.
 *   CustomFieldSection — fields this tenant adds in the Field Builder render beside the
 *                    compiled ones and are indistinguishable from them.
 */

const SCREEN_KEY = 'hr.patient'

/** yyyy-MM-dd for <input type="date">; the API sends full timestamps. */
const toDateInput = (value) => (value ? String(value).slice(0, 10) : '')

const today = () => new Date().toISOString().slice(0, 10)

const BLANK = {
  patientId: 0,
  patientCode: '',
  fullName: '',
  title: '',
  gender: '',
  dob: '',
  mobile: '',
  email: '',
  bloodGroup: '',
  address: '',
  city: '',
  registeredOn: '',
}

const FIELDS = [
  // required is decided per record below: blank on a new registration means "issue one".
  { key: 'patientCode', label: 'UHID' },
  { key: 'fullName', label: 'Name', required: true },
  { key: 'title', label: 'Title' },
  { key: 'gender', label: 'Gender' },
  { key: 'dob', label: 'Date of birth' },
  { key: 'mobile', label: 'Mobile', required: true },
  { key: 'email', label: 'Email' },
  { key: 'bloodGroup', label: 'Blood group' },
  { key: 'address', label: 'Address' },
  { key: 'city', label: 'City' },
  { key: 'registeredOn', label: 'Registered on' },
]

/** How long an address may be. The counter under the field and the save check share it. */
const ADDRESS_LIMIT = 50

const GENDER_OPTIONS = [
  { value: 'Male', label: 'Male' },
  { value: 'Female', label: 'Female' },
  // { value: 'Other', label: 'Other' },
]
const TITLE_OPTIONS = [
  { value: 'Mr', label: 'Mr' },
  { value: 'Mrs', label: 'Mrs' },
]

const BLOOD_GROUP_OPTIONS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((group) => ({
  value: group,
  label: group,
}))

export default function PatientFormScreen() {
  const { id } = useParams()
  const navigate = useNavigate()
  const ui = useUi()
  const { has } = useAuth()
  const rules = useScreenRules(SCREEN_KEY)

  const custom = useCustomFields(SCREEN_KEY)
  const customValues = useCustomValues(SCREEN_KEY, id)
  const [customErrors, setCustomErrors] = useState({})

  const record = useRecordForm({
    path: '/hr/patient',
    id,
    // A new registration happened today until somebody says otherwise. It is still an
    // editable field, because a desk catching up on yesterday's paperwork needs it to be.
    blank: { ...BLANK, registeredOn: today() },
    map: (row) => ({
      ...BLANK,
      ...row,
      dob: toDateInput(row.dob),
      registeredOn: toDateInput(row.registeredOn),
      title: row.title ?? '',
      gender: row.gender ?? '',
      bloodGroup: row.bloodGroup ?? '',
    }),
  })

  const canEdit = has('hr.patient.edit')

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

    // An existing patient must keep its UHID; a new one may leave it blank and take the
    // next number in the tenant's series.
    const checks = record.isNew
      ? FIELDS
      : FIELDS.map((f) => (f.key === 'patientCode' ? { ...f, required: true } : f))

    const clientErrors = rules.validateRequired(record.form, checks)

    // The counter is a signpost; this is the part that actually stops an over-long address.
    const addressLength = (record.form.address ?? '').length
    if (addressLength > ADDRESS_LIMIT) {
      clientErrors.address = `Address is ${addressLength} characters — the limit is ${ADDRESS_LIMIT}.`
    }

    if (Object.keys(clientErrors).length > 0) {
      record.setErrors(clientErrors)
      return
    }

    // hr.patient.beforeSave — a client script may stop the save outright.
    const before = await hooks.beforeSave()
    if (before.cancelSave) {
      if (before.message) ui.error(before.message)
      return
    }

    // Coerce the MERGED form, not the raw one: a script may have supplied these very keys.
    const merged = { ...record.form, ...(before.form ?? {}) }

    const payload = {
      ...merged,
      // Blank is "not recorded", which a date column must hold as NULL rather than as 1970.
      dob: merged.dob || null,
      registeredOn: merged.registeredOn || null,
      title: merged.title || null,
      gender: merged.gender || null,
      bloodGroup: merged.bloodGroup || null,
    }

    const saved = await record.save(payload)
    if (!saved) return

    // The record has an id only now, so its custom values are written second. A failure here
    // leaves the patient registered and the user on the form with the offending field marked.
    const written = await customValues.save(saved.patientId, custom.fields)
    if (!written.ok) {
      setCustomErrors(written.errors)
      ui.error(written.message ?? 'The patient was saved, but their extra fields were not.')
      return
    }
    setCustomErrors({})

    invalidateLookup('/hr/patient/lookup')

    // hr.patient.afterSave — the script decides where the user lands next.
    const after = await hooks.afterSave(payload, saved)
    ui.toast(after.message ?? 'Patient saved.')

    if (after.cancelNavigation) return
    navigate(after.redirectTo ?? '/hr/patient')
  }

  return (
    <form onSubmit={onSubmit}>
      <PageHeader
        title={record.isNew ? 'New patient' : record.form.fullName || 'Patient'}
        subtitle="Registration"
      />

      {record.message && <Alert tone="error">{record.message}</Alert>}

      <Card>
        <ConfigForm screenKey={SCREEN_KEY} hints={hooks.fieldHints}>
          <DynamicField
            fieldKey="patientCode"
            label="UHID"
            required={!record.isNew}
            defaultSeq={10}
            error={record.errors.patientCode}
          >
            {({ id: fieldId, invalid }) => (
              <TextInput
                id={fieldId}
                invalid={invalid}
                maxLength={40}
                // Left blank, the server issues the next UHID for this tenant. Still typeable:
                // a hospital transferring records in has numbers of its own to preserve.
                placeholder={record.isNew ? 'Generated on save' : undefined}
                disabled={hooks.locked('patientCode')}
                {...hooks.fieldProps('patientCode')}
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

          <DynamicField fieldKey="title" label="Title" defaultSeq={30} error={record.errors.title}>
            {({ id: fieldId, invalid }) => (
              <SelectInput
                id={fieldId}
                invalid={invalid}
                disabled={hooks.locked('title')}
                options={TITLE_OPTIONS}
                placeholder="— select —"
                {...hooks.fieldProps('title')}
              />
            )}
          </DynamicField>
          <DynamicField fieldKey="gender" label="Gender" defaultSeq={30} error={record.errors.gender}>
            {({ id: fieldId, invalid }) => (
              <SelectInput
                id={fieldId}
                invalid={invalid}
                disabled={hooks.locked('gender')}
                options={GENDER_OPTIONS}
                placeholder="— select —"
                {...hooks.fieldProps('gender')}
              />
            )}
          </DynamicField>

          <DynamicField fieldKey="dob" label="Date of birth" defaultSeq={40} error={record.errors.dob}>
            {({ id: fieldId, invalid }) => (
              <DateInput id={fieldId} invalid={invalid} disabled={hooks.locked('dob')} {...hooks.fieldProps('dob')} />
            )}
          </DynamicField>

          {/* A hook on this field's onChange is how "this number is already registered"
              gets asked — the same shape as the employee screen's mobile lookup. */}
          <DynamicField fieldKey="mobile" label="Mobile" required defaultSeq={50} error={record.errors.mobile}>
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

          <DynamicField fieldKey="email" label="Email" defaultSeq={60} error={record.errors.email}>
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

          <DynamicField fieldKey="bloodGroup" label="Blood group" defaultSeq={70} error={record.errors.bloodGroup}>
            {({ id: fieldId, invalid }) => (
              <SelectInput
                id={fieldId}
                invalid={invalid}
                disabled={hooks.locked('bloodGroup')}
                options={BLOOD_GROUP_OPTIONS}
                placeholder="— select —"
                {...hooks.fieldProps('bloodGroup')}
              />
            )}
          </DynamicField>

          <DynamicField fieldKey="address" label="Address" defaultSeq={80} error={record.errors.address}>
            {({ id: fieldId, invalid }) => (
              <TextInput
                id={fieldId}
                invalid={invalid}
                maxLength={250}
                disabled={hooks.locked('address')}
                {...hooks.fieldProps('address')}
              />
            )}
          </DynamicField>

          <DynamicField fieldKey="city" label="City" defaultSeq={90} error={record.errors.city}>
            {({ id: fieldId, invalid }) => (
              <TextInput
                id={fieldId}
                invalid={invalid}
                maxLength={100}
                disabled={hooks.locked('city')}
                {...hooks.fieldProps('city')}
              />
            )}
          </DynamicField>

          <DynamicField
            fieldKey="registeredOn"
            label="Registered on"
            defaultSeq={100}
            error={record.errors.registeredOn}
          >
            {({ id: fieldId, invalid }) => (
              <DateInput
                id={fieldId}
                invalid={invalid}
                disabled={hooks.locked('registeredOn')}
                {...hooks.fieldProps('registeredOn')}
              />
            )}
          </DynamicField>

          {/* Field Builder fields for hr.patient. Same controls, same ConfigForm, sequence
              numbers above the compiled ones — so they land last without being told to. */}
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
          <Button onClick={() => navigate('/hr/patient')}>Cancel</Button>
        </div>
      </Card>
    </form>
  )
}
