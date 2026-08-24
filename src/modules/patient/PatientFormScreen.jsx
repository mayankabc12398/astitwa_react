import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../core/auth/AuthContext.js'
import { Button } from '../../core/controls/Button.jsx'
import { DataTable } from '../../core/controls/DataTable.jsx'
import { CheckboxInput, DateInput, NumberInput, SelectInput, TextInput } from '../../core/controls/inputs.jsx'
import { Alert, Card, Loading, PageHeader } from '../../core/controls/layout.jsx'
import { useUi } from '../../core/controls/uiContext.js'
import { invalidateLookup } from '../../core/hooks/useLookup.js'
import { useRecordForm } from '../../core/hooks/useRecordForm.js'
import { useScreenHooks } from '../../core/hooks/useScreenHooks.js'
import { ConfigForm, DynamicField } from '../../config/DynamicField.jsx'
import { useScreenRules } from '../../config/useScreenRules.js'
import { CustomFieldSection } from '../../config/customFields/CustomFieldSection.jsx'
import { useCustomFields, useCustomValues } from '../../config/customFields/useCustomFields.js'
import { ClearableSelect, PickSelect, PickText } from './components/PickField.jsx'
import { CARRIED_KEYS, FIELDS, PATIENT_FIELDS, SCHEME_DRAFT_KEYS } from './patientFields.js'
import {
  AGE_TYPE,
  COUNTRY,
  GENDER,
  ID_PROOF,
  INSURANCE,
  INSURANCE_GROUP,
  LOOKUP_PATHS,
  MARITAL_STATUS,
  MLC_TYPE,
  NATIONALITY,
  OCCUPATION,
  PANEL,
  PATIENT_TYPE,
  REFERENCE_TYPE,
  RELATION,
  RELIGION,
  SOURCE,
  TITLE,
  YES_NO,
  citiesFor,
  dialCodeFor,
  districtsFor,
  statesFor,
  useOptionList,
} from './patientOptions.js'
import './patient.css'

/**
 * Patient registration.
 *
 * Built on the same three pieces every form screen here is built on, which is what makes it
 * configurable the day it ships rather than the day somebody gets round to it:
 *
 *   DynamicField   — Layer 2 can relabel, reorder, hide or require any of these fields with
 *                    a cfg_field_rule row, per tenant, with no build.
 *   useScreenHooks — Layer 5 slots: hr.patient.onLoad / beforeSave / afterSave, and a
 *                    per-field onBlur and onChange for every field in patientFields.js.
 *   CustomFieldSection — fields this tenant adds in the Field Builder render beside the
 *                    compiled ones and are indistinguishable from them.
 *
 * The field list itself lives in patientFields.js, because the Script Hooks editor needs the
 * same list to offer a slot per field and two copies of it would drift within a release.
 */

const SCREEN_KEY = 'hr.patient'

const META = Object.fromEntries(PATIENT_FIELDS.map((field) => [field.key, field]))

/** yyyy-MM-dd for <input type="date">; the API sends full timestamps. */
const toDateInput = (value) => (value ? String(value).slice(0, 10) : '')

const today = () => new Date().toISOString().slice(0, 10)

/** '' is "not filled in", which a nullable column must hold as NULL rather than as ''. */
const nullable = (value) => (value === '' || value === undefined ? null : value)

const num = (value) => {
  if (value === '' || value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isNaN(parsed) ? null : parsed
}

const DEFAULT_COUNTRY = 'KENYA'

/**
 * The three columns this screen replaced, and what replaced them.
 *
 * The API still stores fullName, mobile and address and still validates them — "Name is
 * required." comes back from the server, not from this screen, because nothing on the form
 * writes fullName any more. So the save writes both spellings and the load reads whichever
 * the row has, which keeps registration working against today's API and against the one that
 * takes the new columns.
 *
 * DELETE THIS BLOCK once the API drops the three legacy columns and their required rules:
 * the three functions below and the effect that renames server errors are the whole bridge.
 */
const LEGACY_COLUMNS = {
  fullName: 'firstName',
  mobile: 'mobileNo',
  address: 'localAddress',
}

const splitName = (full) => {
  const parts = String(full ?? '').trim().split(/\s+/).filter(Boolean)
  return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') }
}

/** What a row saved under the old columns should show in the new controls. */
function fromLegacy(row) {
  const filled = {}
  if (!row.firstName && !row.lastName && row.fullName) Object.assign(filled, splitName(row.fullName))
  if (!row.mobileNo && row.mobile) filled.mobileNo = row.mobile
  if (!row.localAddress && row.address) filled.localAddress = row.address
  return filled
}

/** The same three values under the names the current API validates. */
function withLegacy(payload) {
  return {
    ...payload,
    fullName: [payload.firstName, payload.lastName].filter(Boolean).join(' ') || null,
    mobile: payload.mobileNo ?? null,
    address: payload.localAddress ?? null,
  }
}

const BLANK = {
  patientId: 0,
  patientCode: '',
  registeredOn: '',
  schemes: [],
  ...Object.fromEntries(PATIENT_FIELDS.map((field) => [field.key, ''])),
  sameAsLocalAddress: false,
  // What the desk sees before it types anything, matching the registration design.
  country: DEFAULT_COUNTRY,
  ageType: 'YRS',
  altCountryCode: dialCodeFor(DEFAULT_COUNTRY),
  emgMobileCode: '+91',
}

/**
 * Age from a date of birth, in the largest unit that still reads as a whole number.
 *
 * A newborn is registered in days and a toddler in months; showing "0 YRS" for both loses
 * the only thing that distinguishes them on a paediatric ward.
 */
function ageFromDob(dob) {
  if (!dob) return { age: '', ageType: 'YRS' }
  const birth = new Date(`${dob}T00:00:00`)
  if (Number.isNaN(birth.getTime())) return { age: '', ageType: 'YRS' }

  const now = new Date()
  const days = Math.floor((now - birth) / 86400000)
  if (days < 0) return { age: '', ageType: 'YRS' }

  let months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth())
  if (now.getDate() < birth.getDate()) months -= 1

  if (months >= 12) return { age: String(Math.floor(months / 12)), ageType: 'YRS' }
  if (months >= 1) return { age: String(months), ageType: 'MTH' }
  return { age: String(days), ageType: 'DAYS' }
}

const SCHEME_COLUMNS = (onRemove, canEdit) => [
  { key: 'insuranceGroup', label: 'Insurance Group' },
  { key: 'insurance', label: 'Insurance' },
  { key: 'panel', label: 'Panel' },
  { key: 'policyNo', label: 'Policy No' },
  { key: 'policyCardNo', label: 'Card No' },
  { key: 'nameOnCard', label: 'Name On Card' },
  { key: 'expireDate', label: 'Expires', width: '120px', render: (row) => toDateInput(row.expireDate) || '—' },
  { key: 'cardHolder', label: 'Card Holder' },
  {
    key: 'approvalAmount',
    label: 'Amount',
    width: '110px',
    render: (row) => (row.approvalAmount === null || row.approvalAmount === '' ? '—' : row.approvalAmount),
  },
  { key: 'approvalRemark', label: 'Remark' },
  {
    key: 'actions',
    label: '',
    width: '90px',
    // DataTable hands render() the row and nothing else, so the row carries its own position.
    render: (row) => (
      <Button size="sm" disabled={!canEdit} onClick={() => onRemove(row.__index)}>
        Remove
      </Button>
    ),
  },
]

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
    // A new registration happened today until somebody says otherwise. It is not on the form
    // any more, so it is carried rather than typed.
    blank: { ...BLANK, registeredOn: today() },
    map: (row) => ({
      ...BLANK,
      ...row,
      // Rows written before these columns existed have none of them; every key still has to
      // reach the controls as a string, or React swaps them to uncontrolled mid-edit.
      ...Object.fromEntries(PATIENT_FIELDS.map((field) => [field.key, row[field.key] ?? BLANK[field.key] ?? ''])),
      // The scheme row above the grid is a draft, never something the record carries back.
      ...Object.fromEntries(SCHEME_DRAFT_KEYS.map((key) => [key, ''])),
      // A row written under the old columns still has to fill the new controls.
      ...fromLegacy(row),
      // Last word on the keys that need shaping rather than defaulting.
      dob: toDateInput(row.dob),
      registeredOn: toDateInput(row.registeredOn),
      sameAsLocalAddress: Boolean(row.sameAsLocalAddress),
      schemes: (row.schemes ?? []).map((scheme) => ({ ...scheme, expireDate: toDateInput(scheme.expireDate) })),
    }),
  })

  const canEdit = has('hr.patient.edit')

  const hooks = useScreenHooks(SCREEN_KEY, {
    record,
    customFields: custom.fields,
    customValues,
    canEdit,
  })

  // Lookups first, seed lists behind them: a tenant with insurance masters gets its own,
  // everyone else still gets a usable dropdown.
  const insuranceGroupOptions = useOptionList(LOOKUP_PATHS.insuranceGroup, INSURANCE_GROUP)
  const insuranceOptions = useOptionList(LOOKUP_PATHS.insurance, INSURANCE)
  const panelOptions = useOptionList(LOOKUP_PATHS.panel, PANEL)
  const patientTypeOptions = useOptionList(LOOKUP_PATHS.patientType, PATIENT_TYPE)
  const sourceOptions = useOptionList(LOOKUP_PATHS.source, SOURCE)
  const referenceTypeOptions = useOptionList(LOOKUP_PATHS.referenceType, REFERENCE_TYPE)

  /*
   * A server error against a column this screen no longer renders has nowhere to land, and an
   * error nobody can see is worse than no error: the form looks fine and the save keeps
   * failing. Renaming them puts the red outline on the control the user has to fix.
   */
  const { errors: recordErrors, setErrors: setRecordErrors } = record
  useEffect(() => {
    const stale = Object.keys(recordErrors).filter((key) => LEGACY_COLUMNS[key])
    if (stale.length === 0) return

    setRecordErrors((current) => {
      const next = { ...current }
      for (const key of stale) {
        const target = LEGACY_COLUMNS[key]
        if (!next[target]) next[target] = next[key]
        delete next[key]
      }
      return next
    })
  }, [recordErrors, setRecordErrors])

  if (record.loading) return <Loading />
  if (record.loadError) return <Alert tone="error">{record.loadError.message}</Alert>

  const form = record.form
  const locked = (key) => hooks.locked(key)

  /**
   * Writes several keys at once and tells the field's own hook it changed.
   *
   * record.setField handles one key and clears its error; the cascades below change three or
   * four at a time, and doing that as three setField calls would render three times and let
   * a script see the form half-updated.
   */
  function patch(changes, changedKey) {
    record.setForm((current) => ({ ...current, ...changes }))
    record.setErrors((current) => {
      const next = { ...current }
      for (const key of Object.keys(changes)) delete next[key]
      return next
    })
    if (changedKey) hooks.onFieldChange(changedKey)
  }

  /** Props for a control the screen drives itself, with both field hook slots kept intact. */
  const driven = (key, onValue) => ({
    value: form[key] ?? '',
    onChange: (e) => onValue(e.target.value),
    onBlur: () => hooks.onFieldBlur(key),
  })

  const onCountry = (value) =>
    patch(
      {
        country: value,
        // The old state cannot survive a change of country, and neither can what hangs off it.
        state: '',
        district: '',
        city: '',
        altCountryCode: dialCodeFor(value) || form.altCountryCode,
      },
      'country',
    )

  const onState = (value) => patch({ state: value, district: '', city: '' }, 'state')
  const onDistrict = (value) => patch({ district: value, city: '' }, 'district')
  const onDob = (value) => patch({ dob: value, ...ageFromDob(value) }, 'dob')

  const onGender = (value) =>
    patch(value === 'Female' ? { gender: value } : { gender: value, pregnancyDays: '' }, 'gender')

  const onLocalAddress = (value) =>
    patch(form.sameAsLocalAddress ? { localAddress: value, permanentAddress: value } : { localAddress: value }, 'localAddress')

  const onSameAsLocal = (checked) =>
    patch(
      checked
        ? { sameAsLocalAddress: true, permanentAddress: form.localAddress }
        : { sameAsLocalAddress: false },
      'sameAsLocalAddress',
    )

  // ---------------------------------------------------------------
  // Field renderers. Every one goes through DynamicField, so a cfg_field_rule row can still
  // relabel, reorder, hide or require any of them.
  // ---------------------------------------------------------------

  const field = (key, render, extra = {}) => {
    const meta = META[key]
    return (
      <DynamicField
        key={key}
        fieldKey={key}
        label={extra.label ?? meta.label}
        required={meta.required === true}
        defaultSeq={meta.seq}
        error={record.errors[key]}
        hint={extra.hint}
        span={extra.span}
      >
        {render}
      </DynamicField>
    )
  }

  const text = (key, props = {}, extra = {}) =>
    field(
      key,
      ({ id: fieldId, invalid }) => (
        <TextInput id={fieldId} invalid={invalid} disabled={locked(key)} maxLength={150} {...hooks.fieldProps(key)} {...props} />
      ),
      extra,
    )

  const select = (key, options, extra = {}) =>
    field(
      key,
      ({ id: fieldId, invalid }) => (
        <SelectInput id={fieldId} invalid={invalid} disabled={locked(key)} options={options} {...hooks.fieldProps(key)} />
      ),
      extra,
    )

  const number = (key, props = {}, extra = {}) =>
    field(
      key,
      ({ id: fieldId, invalid }) => (
        <NumberInput id={fieldId} invalid={invalid} disabled={locked(key)} min={0} {...hooks.fieldProps(key)} {...props} />
      ),
      extra,
    )

  const date = (key, extra = {}) =>
    field(
      key,
      ({ id: fieldId, invalid }) => (
        <DateInput id={fieldId} invalid={invalid} disabled={locked(key)} {...hooks.fieldProps(key)} />
      ),
      extra,
    )

  const readOnlyText = (key, extra = {}) =>
    field(
      key,
      ({ id: fieldId }) => (
        <TextInput id={fieldId} className="pf-readonly" readOnly value={form[key] ?? ''} tabIndex={-1} />
      ),
      extra,
    )

  const clearable = (key, options) =>
    field(key, ({ id: fieldId, invalid }) => (
      <ClearableSelect
        id={fieldId}
        invalid={invalid}
        disabled={locked(key)}
        options={options}
        label={META[key].label}
        fieldProps={hooks.fieldProps(key)}
        onClear={() => patch({ [key]: '' }, key)}
      />
    ))

  const pickSelect = (key, options, { lookupPath, onValue } = {}) =>
    field(key, ({ id: fieldId, invalid }) => (
      <PickSelect
        id={fieldId}
        title={META[key].label}
        invalid={invalid}
        disabled={locked(key)}
        options={options}
        lookupPath={lookupPath}
        fieldProps={onValue ? driven(key, onValue) : hooks.fieldProps(key)}
        onPick={(value) => (onValue ? onValue(value) : patch({ [key]: value }, key))}
      />
    ))

  const pickText = (key, { readOnly = false } = {}) =>
    field(key, ({ id: fieldId, invalid }) => (
      <PickText
        id={fieldId}
        title={META[key].label}
        invalid={invalid}
        disabled={locked(key)}
        readOnly={readOnly}
        fieldProps={readOnly ? { value: form[key] ?? '', readOnly: true } : hooks.fieldProps(key)}
        onPick={(value) => patch({ [key]: value }, key)}
      />
    ))

  // ---------------------------------------------------------------
  // Scheme rows
  // ---------------------------------------------------------------

  function addScheme() {
    const draft = Object.fromEntries(SCHEME_DRAFT_KEYS.map((key) => [key, form[key] ?? '']))
    if (SCHEME_DRAFT_KEYS.every((key) => String(draft[key] ?? '').trim() === '')) {
      ui.error('Fill in the scheme row before adding it.')
      return
    }

    patch({
      schemes: [...(form.schemes ?? []), { ...draft, approvalAmount: num(draft.approvalAmount) }],
      ...Object.fromEntries(SCHEME_DRAFT_KEYS.map((key) => [key, ''])),
    })
  }

  const removeScheme = (index) =>
    patch({ schemes: (form.schemes ?? []).filter((_row, i) => i !== index) })

  // ---------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------

  async function onSubmit(e) {
    e.preventDefault()

    const clientErrors = rules.validateRequired(form, FIELDS)
    if (Object.keys(clientErrors).length > 0) {
      record.setErrors(clientErrors)
      ui.error('Some required fields are still empty.')
      return
    }

    // hr.patient.beforeSave — a client script may stop the save outright.
    const before = await hooks.beforeSave()
    if (before.cancelSave) {
      if (before.message) ui.error(before.message)
      return
    }

    // Coerce the MERGED form, not the raw one: a script may have supplied these very keys.
    const merged = { ...form, ...(before.form ?? {}) }

    const payload = {}
    for (const [key, value] of Object.entries(merged)) {
      // The ten scheme keys are the draft row, not columns on the patient.
      if (SCHEME_DRAFT_KEYS.includes(key)) continue
      payload[key] = nullable(value)
    }

    payload.dob = merged.dob || null
    payload.age = num(merged.age)
    payload.pregnancyDays = num(merged.pregnancyDays)
    payload.sameAsLocalAddress = Boolean(merged.sameAsLocalAddress)
    payload.registeredOn = merged.registeredOn || (record.isNew ? today() : null)
    payload.schemes = (merged.schemes ?? []).map((scheme) => ({
      ...scheme,
      expireDate: scheme.expireDate || null,
      approvalAmount: num(scheme.approvalAmount),
    }))
    // Carried, not typed: the server issues the UHID and owns the id.
    for (const key of CARRIED_KEYS) payload[key] = merged[key] ?? null
    payload.patientId = merged.patientId ?? 0

    const saved = await record.save(withLegacy(payload))
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

  const name = [form.firstName, form.lastName].filter(Boolean).join(' ')
  const schemes = form.schemes ?? []

  /*
   * Fields this tenant added, grouped by the section the Field Builder placed them in.
   *
   * One rendered beside the compiled fields of its section is indistinguishable from them —
   * same grid, same controls, and its seqNo positions it between two of them rather than
   * after all of them. A section this screen does not compile becomes a card of its own,
   * which is how a tenant adds "Consent" to registration without a deployment.
   */
  const visibleCustom = (custom.fields ?? []).filter((f) => f.showInForm !== false)

  const customIn = (sectionKey) =>
    visibleCustom.filter((f) => (f.sectionKey ?? '').trim() === sectionKey)

  const customFieldsFor = (sectionKey) => (
    <CustomFieldSection
      fields={customIn(sectionKey)}
      values={customValues.values}
      errors={customErrors}
      disabled={!canEdit}
      onChange={customValues.setValue}
      onFieldBlur={hooks.onFieldBlur}
      onFieldChange={hooks.onFieldChange}
    />
  )

  // Sections the screen itself draws. Anything else a field names gets its own card, in the
  // order the fields declare them; '' is "the author chose no section".
  const extraSections = [
    ...new Set(
      visibleCustom
        .map((f) => (f.sectionKey ?? '').trim())
        .filter((key) => !['personal', 'other', 'scheme'].includes(key)),
    ),
  ]

  return (
    <form onSubmit={onSubmit} className="pf">
      <PageHeader
        title={record.isNew ? 'New patient' : name || 'Patient'}
        subtitle={record.isNew ? 'Registration' : `Registration · ${form.patientCode || 'no UHID yet'}`}
        actions={
          <div className="form-actions form-actions--inline">
            <Button type="submit" variant="primary" busy={record.saving} disabled={!canEdit}>
              Save
            </Button>
            <Button onClick={() => navigate('/hr/patient')}>Cancel</Button>
          </div>
        }
      />

      {record.message && <Alert tone="error">{record.message}</Alert>}

      <Card className="pf-card">
        <h2 className="pf-section">Personal Details</h2>
        <ConfigForm screenKey={SCREEN_KEY} hints={hooks.fieldHints} className="form-grid pf-grid">
          {text('barcode', { maxLength: 40 })}
          {text('mobileNo', { maxLength: 30, inputMode: 'tel' })}
          {select('title', TITLE)}
          {text('firstName', { maxLength: 80 })}
          {text('lastName', { maxLength: 80 })}

          {field('gender', ({ id: fieldId, invalid }) => (
            <SelectInput
              id={fieldId}
              invalid={invalid}
              disabled={locked('gender')}
              options={GENDER}
              {...driven('gender', onGender)}
            />
          ))}

          {select('maritalStatus', MARITAL_STATUS)}

          {field('dob', ({ id: fieldId, invalid }) => (
            <DateInput id={fieldId} invalid={invalid} disabled={locked('dob')} max={today()} {...driven('dob', onDob)} />
          ))}

          {number('age', { max: 200 })}
          {clearable('ageType', AGE_TYPE)}
          {text('email', { type: 'email', maxLength: 150 })}

          {field(
            'localAddress',
            ({ id: fieldId, invalid }) => (
              <TextInput
                id={fieldId}
                invalid={invalid}
                maxLength={250}
                disabled={locked('localAddress')}
                {...driven('localAddress', onLocalAddress)}
              />
            ),
            { span: 2 },
          )}

          {field('sameAsLocalAddress', ({ id: fieldId }) => (
            <CheckboxInput
              id={fieldId}
              checked={Boolean(form.sameAsLocalAddress)}
              disabled={locked('sameAsLocalAddress')}
              onChange={(e) => onSameAsLocal(e.target.checked)}
              onBlur={() => hooks.onFieldBlur('sameAsLocalAddress')}
            />
          ))}

          {text(
            'permanentAddress',
            { maxLength: 250, disabled: locked('permanentAddress') || Boolean(form.sameAsLocalAddress) },
            { span: 2, hint: form.sameAsLocalAddress ? 'Copied from the local address.' : undefined },
          )}

          {field('country', ({ id: fieldId, invalid }) => (
            <ClearableSelect
              id={fieldId}
              invalid={invalid}
              disabled={locked('country')}
              options={COUNTRY}
              label={META.country.label}
              fieldProps={driven('country', onCountry)}
              onClear={() => onCountry('')}
            />
          ))}

          {pickSelect('state', statesFor(form.country), { onValue: onState })}
          {pickSelect('district', districtsFor(form.country, form.state), { onValue: onDistrict })}
          {pickSelect('city', citiesFor(form.country, form.state, form.district))}

          {select('idProofName', ID_PROOF)}
          {text('idProofNo', { maxLength: 60 })}
          {text('kraPin', { maxLength: 40 })}
          {pickText('familyNumber', { readOnly: true })}
          {text('staffId', { maxLength: 40 })}
          {pickText('dependentId')}
          {text('nationalId', { maxLength: 40 })}
          {number(
            'pregnancyDays',
            { max: 320, disabled: locked('pregnancyDays') || form.gender !== 'Female' },
            { hint: form.gender === 'Female' ? undefined : 'Recorded for female patients.' },
          )}

          {customFieldsFor('personal')}
        </ConfigForm>
      </Card>

      <Card className="pf-card">
        <h2 className="pf-section">Other Details</h2>
        <ConfigForm screenKey={SCREEN_KEY} hints={hooks.fieldHints} className="form-grid pf-grid">
          {readOnlyText('altCountryCode')}
          {text('alternativeNo', { maxLength: 30, inputMode: 'tel' })}
          {select('occupation', OCCUPATION)}
          {text('birthPlace', { maxLength: 100 })}
          {clearable('religion', RELIGION)}
          {text('emgFirstName', { maxLength: 80 })}
          {text('emgLastName', { maxLength: 80 })}
          {select('emgRelation', RELATION)}
          {readOnlyText('emgMobileCode')}
          {text('emgMobileNo', { maxLength: 30, inputMode: 'tel' })}
          {text('emgResidentNo', { maxLength: 30, inputMode: 'tel' })}
          {text('emgAddress', { maxLength: 250 }, { span: 2 })}
          {select('isInternational', YES_NO)}
          {select('nationality', NATIONALITY)}
          {text('passportNumber', { maxLength: 40 })}
          {text('internationalNo', { maxLength: 40 })}
          {text('locality', { maxLength: 100 })}
          {text('membershipNo', { maxLength: 60 })}
          {select('patientType', patientTypeOptions)}
          {select('source', sourceOptions)}
          {text('empReferenceId', { maxLength: 40 })}
          {text('identityMark', { maxLength: 120 })}
          {text('identityMark2', { maxLength: 120 })}
          {pickSelect('referenceType', referenceTypeOptions, { lookupPath: LOOKUP_PATHS.referenceType })}
          {select('mlcType', MLC_TYPE)}
          {text('mlcNo', { maxLength: 40 })}
          {select('relationOf', RELATION)}
          {text('relationName', { maxLength: 120 })}
          {pickText('relationPhone')}

          {customFieldsFor('other')}
        </ConfigForm>
      </Card>

      <Card className="pf-card">
        <h2 className="pf-section">Scheme Details</h2>
        <ConfigForm screenKey={SCREEN_KEY} hints={hooks.fieldHints} className="form-grid pf-grid">
          {pickSelect('insuranceGroup', insuranceGroupOptions, { lookupPath: LOOKUP_PATHS.insuranceGroup })}
          {pickSelect('insurance', insuranceOptions, { lookupPath: LOOKUP_PATHS.insurance })}
          {pickSelect('panel', panelOptions, { lookupPath: LOOKUP_PATHS.panel })}
          {text('policyNo', { maxLength: 60 })}
          {text('policyCardNo', { maxLength: 60 })}
          {text('nameOnCard', { maxLength: 120 })}
          {date('expireDate')}
          {text('cardHolder', { maxLength: 120 })}
          {number('approvalAmount', { step: '0.01' })}
          {text('approvalRemark', { maxLength: 250 }, { span: 2 })}

          {customFieldsFor('scheme')}
        </ConfigForm>

        <div className="pf-scheme-actions">
          <Button variant="primary" disabled={!canEdit} onClick={addScheme}>
            Add
          </Button>
          <span className="field__hint">
            {schemes.length === 0 ? 'No scheme added yet.' : `${schemes.length} scheme${schemes.length === 1 ? '' : 's'} on this patient.`}
          </span>
        </div>

        {schemes.length > 0 && (
          <DataTable
            caption="Schemes on this patient"
            columns={SCHEME_COLUMNS(removeScheme, canEdit)}
            rows={schemes.map((scheme, index) => ({ ...scheme, __index: index }))}
            rowKey={(_row, index) => index}
            emptyMessage="No scheme added yet."
          />
        )}
      </Card>

      {/* A section this screen does not compile — one the tenant named in the Field Builder —
          is drawn as a card of its own, after the three the product ships. */}
      {extraSections.map((sectionKey) => (
        <Card className="pf-card" key={sectionKey || 'unsectioned'}>
          <h2 className="pf-section">{sectionKey || 'Additional Details'}</h2>
          <ConfigForm screenKey={SCREEN_KEY} hints={hooks.fieldHints} className="form-grid pf-grid">
            {customFieldsFor(sectionKey)}
          </ConfigForm>
        </Card>
      ))}

      <div className="form-actions">
        <Button type="submit" variant="primary" busy={record.saving} disabled={!canEdit}>
          Save
        </Button>
        <Button onClick={() => navigate('/hr/patient')}>Cancel</Button>
      </div>
    </form>
  )
}
