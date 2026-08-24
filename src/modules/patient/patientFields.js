/**
 * The patient screen's field list, in one place because three things need the same answer:
 *
 *   PatientFormScreen  — what to render, and what validateRequired must check.
 *   screenFieldCatalog — what the Script Hooks editor offers as a field slot, when the
 *                        server's catalogue has not caught up with a release yet.
 *   BLANK              — every key the form owns, so a control never renders undefined.
 *
 * `required` here is the PRODUCT default. A cfg_field_rule row overrides it per tenant, so
 * nothing in this file is the final word on whether a field is mandatory.
 */

/** @type {Array<{key: string, label: string, required?: boolean, section: 'personal'|'other'|'scheme', seq: number}>} */
export const PATIENT_FIELDS = [
  // ---------- Personal details ----------
  { key: 'barcode', label: 'Barcode', section: 'personal', seq: 10 },
  { key: 'mobileNo', label: 'Mobile Number', required: true, section: 'personal', seq: 20 },
  { key: 'title', label: 'Title', section: 'personal', seq: 30 },
  { key: 'firstName', label: 'First Name', required: true, section: 'personal', seq: 40 },
  { key: 'lastName', label: 'Last Name', required: true, section: 'personal', seq: 50 },
  { key: 'gender', label: 'Gender', required: true, section: 'personal', seq: 60 },
  { key: 'maritalStatus', label: 'Marital Status', required: true, section: 'personal', seq: 70 },
  { key: 'dob', label: 'DOB', required: true, section: 'personal', seq: 80 },
  { key: 'age', label: 'Age', required: true, section: 'personal', seq: 90 },
  { key: 'ageType', label: 'Type', required: true, section: 'personal', seq: 100 },
  { key: 'email', label: 'EMAIL', required: true, section: 'personal', seq: 110 },
  { key: 'localAddress', label: 'Local Address', required: true, section: 'personal', seq: 120 },
  { key: 'sameAsLocalAddress', label: 'Same as local address', section: 'personal', seq: 130 },
  { key: 'permanentAddress', label: 'PERMANENT ADDRESS', required: true, section: 'personal', seq: 140 },
  { key: 'country', label: 'Country', required: true, section: 'personal', seq: 150 },
  { key: 'state', label: 'State', required: true, section: 'personal', seq: 160 },
  { key: 'district', label: 'District', required: true, section: 'personal', seq: 170 },
  { key: 'city', label: 'City', required: true, section: 'personal', seq: 180 },
  { key: 'idProofName', label: 'Id Proof Name', section: 'personal', seq: 190 },
  { key: 'idProofNo', label: 'Id Proof No', section: 'personal', seq: 200 },
  { key: 'kraPin', label: 'KRA PIN', section: 'personal', seq: 210 },
  { key: 'familyNumber', label: 'Family Number', section: 'personal', seq: 220 },
  { key: 'staffId', label: 'STAFF ID', section: 'personal', seq: 230 },
  { key: 'dependentId', label: 'Dependent ID', section: 'personal', seq: 240 },
  { key: 'nationalId', label: 'National ID', section: 'personal', seq: 250 },
  { key: 'pregnancyDays', label: 'PREGNANCY DAYS', section: 'personal', seq: 260 },

  // ---------- Other details ----------
  { key: 'altCountryCode', label: 'Code', section: 'other', seq: 300 },
  { key: 'alternativeNo', label: 'Alternative No', section: 'other', seq: 310 },
  { key: 'occupation', label: 'Occupation', section: 'other', seq: 320 },
  { key: 'birthPlace', label: 'Birth Place', section: 'other', seq: 330 },
  { key: 'religion', label: 'Religion', section: 'other', seq: 340 },
  { key: 'emgFirstName', label: 'Emg First Name', section: 'other', seq: 350 },
  { key: 'emgLastName', label: 'Emg Last Name', section: 'other', seq: 360 },
  { key: 'emgRelation', label: 'Emg Relation', section: 'other', seq: 370 },
  { key: 'emgMobileCode', label: 'Code', section: 'other', seq: 380 },
  { key: 'emgMobileNo', label: 'Emg Mobile No', section: 'other', seq: 390 },
  { key: 'emgResidentNo', label: 'Emg Resident No', section: 'other', seq: 400 },
  { key: 'emgAddress', label: 'Emg Address', section: 'other', seq: 410 },
  { key: 'isInternational', label: 'Is International', section: 'other', seq: 420 },
  { key: 'nationality', label: 'Country', section: 'other', seq: 430 },
  { key: 'passportNumber', label: 'Passport Number', section: 'other', seq: 440 },
  { key: 'internationalNo', label: 'International No', section: 'other', seq: 450 },
  { key: 'locality', label: 'Locality', section: 'other', seq: 460 },
  { key: 'membershipNo', label: 'Membership No', section: 'other', seq: 470 },
  { key: 'patientType', label: 'Patient Type', section: 'other', seq: 480 },
  { key: 'source', label: 'Source', section: 'other', seq: 490 },
  { key: 'empReferenceId', label: 'Emp Reference Id', section: 'other', seq: 500 },
  { key: 'identityMark', label: 'Identity Mark', section: 'other', seq: 510 },
  { key: 'identityMark2', label: 'Identity Mark 2', section: 'other', seq: 520 },
  { key: 'referenceType', label: 'Reference Type', section: 'other', seq: 530 },
  { key: 'mlcType', label: 'Mlc Type', section: 'other', seq: 540 },
  { key: 'mlcNo', label: 'Mlc No', section: 'other', seq: 550 },
  { key: 'relationOf', label: 'Relation Of', section: 'other', seq: 560 },
  { key: 'relationName', label: 'Relation Name', section: 'other', seq: 570 },
  { key: 'relationPhone', label: 'Relation Phone', section: 'other', seq: 580 },

  // ---------- Scheme details ----------
  // These ten are the draft row above the scheme grid rather than columns on the patient:
  // the Add button moves them into schemes[] and empties them again.
  { key: 'insuranceGroup', label: 'Insurance Group', section: 'scheme', seq: 600 },
  { key: 'insurance', label: 'Insurance', section: 'scheme', seq: 610 },
  { key: 'panel', label: 'Panel', section: 'scheme', seq: 620 },
  { key: 'policyNo', label: 'Policy No', section: 'scheme', seq: 630 },
  { key: 'policyCardNo', label: 'Policy Card No', section: 'scheme', seq: 640 },
  { key: 'nameOnCard', label: 'Name On Card', section: 'scheme', seq: 650 },
  { key: 'expireDate', label: 'Expire Date', section: 'scheme', seq: 660 },
  { key: 'cardHolder', label: 'Card Holder', section: 'scheme', seq: 670 },
  { key: 'approvalAmount', label: 'Approval Amount', section: 'scheme', seq: 680 },
  { key: 'approvalRemark', label: 'Approval Remark', section: 'scheme', seq: 690 },
]

/** The ten draft keys the Add button consumes; they are not sent as patient columns. */
export const SCHEME_DRAFT_KEYS = PATIENT_FIELDS.filter((f) => f.section === 'scheme').map((f) => f.key)

/** Keys the form owns but never renders — issued or stamped by the server, preserved on save. */
export const CARRIED_KEYS = ['patientId', 'patientCode', 'registeredOn']

/** What validateRequired runs over: the rendered fields, with the product's own defaults. */
export const FIELDS = PATIENT_FIELDS.map(({ key, label, required }) => ({
  key,
  label,
  required: required === true,
}))

export const REQUIRED_KEYS = new Set(PATIENT_FIELDS.filter((f) => f.required).map((f) => f.key))

/** Numeric columns: sent as numbers or null, never as ''. */
export const NUMERIC_KEYS = ['age', 'pregnancyDays', 'approvalAmount']

/** Date columns: sent as yyyy-MM-dd or null. */
export const DATE_KEYS = ['dob', 'expireDate']

/**
 * The same list in the shape /admin/hooks/slots returns, so the Script Hooks editor can offer
 * hr.patient.field.<key>.onChange / .onBlur for every field on this screen even before the
 * server's ScreenCatalog lists them.
 */
export const PATIENT_SCREEN_FIELDS = PATIENT_FIELDS.map((field) => ({
  key: field.key,
  label: field.label,
  slotBase: `hr.patient.field.${field.key}`,
  source: 'compiled',
}))
