/**
 * The shape a new custom field starts from.
 *
 * It lives beside the editor rather than inside it because both the editor and the screen
 * that opens it need it, and a component file that also exports a constant loses fast
 * refresh for the component.
 */
export const BLANK_FIELD = {
  fieldId: 0,
  screenKey: '',
  fieldKey: '',
  label: '',
  controlType: 'text',
  isRequired: false,
  defaultValue: '',
  rangeMin: '',
  rangeMax: '',
  maxLength: '',
  regexPattern: '',
  helpText: '',
  placeholder: '',
  sectionKey: '',
  // Above the compiled fields, which is what puts a custom field after them on the form.
  seqNo: 1000,
  width: 'half',

  // None | Static | Lookup | Dynamic
  dataSourceType: 'None',
  lookupKey: '',
  parentFieldKey: '',
  options: [],
  binding: null,

  // Manual | Computed
  valueMode: 'Manual',
  formulaText: '',
  roundTo: '',
  recalcMode: 'Always',

  showInForm: true,
  showInDetail: true,
  showInPrint: true,
}

/** What a dynamic binding starts as once a source has been picked. */
export const BLANK_BINDING = {
  sourceId: 0,
  resultPath: '',
  valueField: '',
  labelField: '',
  labelTemplate: '',
  staticParamsJson: '',
  searchParamName: '',
  parentFieldKey: '',
  parentParamName: '',
  cacheSeconds: 300,
}

export const WIDTHS = [
  { value: 'half', label: 'Half width' },
  { value: 'full', label: 'Full width' },
]

export const DATA_SOURCES = [
  { value: 'Static', label: 'Static — options typed here' },
  { value: 'Lookup', label: 'Built-in list — departments, designations, employees, leave types' },
  { value: 'Dynamic', label: 'Data source — options read from a registered source' },
]

export const LOOKUPS = [
  { value: 'department', label: 'Departments' },
  { value: 'designation', label: 'Designations' },
  { value: 'employee', label: 'Employees' },
  { value: 'leaveType', label: 'Leave types' },
]

export const RECALC_MODES = [
  { value: 'Always', label: 'Always — recalculate on every save, control is read-only' },
  { value: 'Prefill', label: 'Prefill — fill a blank only, the user may type over it' },
]
