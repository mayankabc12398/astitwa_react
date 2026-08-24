import { useLookup } from '../../core/hooks/useLookup.js'

/**
 * The dropdown data this screen needs, seeded statically.
 *
 * Two reasons it lives here rather than only behind /lookup endpoints: registration is the
 * screen a front desk cannot be without, so it has to work with a lookup that has not been
 * populated yet; and a tenant with no insurance masters still has to be able to pick a
 * gender. Where a real lookup answers, it wins — see useOptionList below.
 */

/** ['Male', 'Female'] -> [{value, label}] */
export const toOptions = (values) => values.map((value) => ({ value, label: value }))

export const TITLE = toOptions(['Mr', 'Mrs', 'Ms', 'Miss', 'Dr', 'Master', 'Baby'])
export const GENDER = toOptions(['Male', 'Female', 'Other'])
export const MARITAL_STATUS = toOptions(['Single', 'Married', 'Divorced', 'Widowed', 'Separated'])
export const AGE_TYPE = toOptions(['YRS', 'MTH', 'DAYS'])
export const RELIGION = toOptions([
  'Hinduism',
  'Islam',
  'Christianity',
  'Sikhism',
  'Buddhism',
  'Jainism',
  'Other',
])
export const ID_PROOF = toOptions(['Passport', 'National ID', 'Driving Licence', 'Voter ID'])
export const PATIENT_TYPE = toOptions(['OPD', 'IPD', 'Emergency', 'Day Care', 'Corporate', 'Camp'])
export const SOURCE = toOptions(['Walk-in', 'Referral', 'Camp', 'Online', 'Ambulance', 'Corporate'])
export const RELATION = toOptions([
  'Self',
  'Spouse',
  'Father',
  'Mother',
  'Son',
  'Daughter',
  'Brother',
  'Sister',
  'Guardian',
  'Friend',
  'Other',
])
export const MLC_TYPE = toOptions(['Accident', 'Assault', 'Burn', 'Poisoning', 'Suicide Attempt', 'Other'])
export const REFERENCE_TYPE = toOptions(['Doctor', 'Hospital', 'Employee', 'Agent', 'Self'])
export const INSURANCE_GROUP = toOptions(['Government', 'Corporate', 'Private', 'TPA', 'Cash'])
export const INSURANCE = toOptions(['NHIF', 'AAR', 'Jubilee', 'Britam', 'Madison', 'Star Health'])
export const PANEL = toOptions(['Panel A', 'Panel B', 'Panel C', 'General'])
export const YES_NO = [
  { value: 'Y', label: 'Yes' },
  { value: 'N', label: 'No' },
]
export const OCCUPATION = toOptions([
  'Student',
  'Business',
  'Service',
  'Farmer',
  'Retired',
  'Housewife',
  'Unemployed',
  'Other',
])

/**
 * Country -> state -> district -> city, seeded for Kenya and India and stubbed for the rest.
 *
 * Deliberately shallow: it is here so the cascade is demonstrably wired and a desk can
 * register somebody today, not to be a geography master. A tenant with real data points the
 * lookups at it and this becomes the fallback nobody sees.
 */
export const GEO = {
  KENYA: {
    dialCode: '+254',
    states: {
      Nairobi: {
        'Nairobi Central': ['Nairobi', 'Westlands', 'Karen'],
        Embakasi: ['Embakasi', 'Pipeline', 'Utawala'],
      },
      Mombasa: {
        Mvita: ['Mombasa', 'Tudor'],
        Nyali: ['Nyali', 'Kongowea'],
      },
      Kisumu: { 'Kisumu Central': ['Kisumu', 'Milimani'], Nyando: ['Ahero'] },
      Nakuru: { 'Nakuru Town East': ['Nakuru'], Naivasha: ['Naivasha'] },
      Kiambu: { Thika: ['Thika'], Ruiru: ['Ruiru'], Kikuyu: ['Kikuyu'] },
    },
  },
  INDIA: {
    dialCode: '+91',
    states: {
      Maharashtra: {
        'Mumbai Suburban': ['Mumbai', 'Andheri', 'Borivali'],
        Pune: ['Pune', 'Pimpri-Chinchwad'],
        Nagpur: ['Nagpur'],
      },
      Delhi: { 'New Delhi': ['New Delhi'], 'South Delhi': ['Saket', 'Hauz Khas'] },
      Karnataka: { 'Bengaluru Urban': ['Bengaluru', 'Whitefield'], Mysuru: ['Mysuru'] },
      'Uttar Pradesh': { Lucknow: ['Lucknow'], Kanpur: ['Kanpur'], Noida: ['Noida'] },
    },
  },
  UGANDA: { dialCode: '+256', states: { Central: { Kampala: ['Kampala'] }, Western: { Mbarara: ['Mbarara'] } } },
  TANZANIA: {
    dialCode: '+255',
    states: { 'Dar es Salaam': { Ilala: ['Dar es Salaam'] }, Arusha: { Arusha: ['Arusha'] } },
  },
  'UNITED KINGDOM': {
    dialCode: '+44',
    states: { England: { 'Greater London': ['London'], Manchester: ['Manchester'] } },
  },
  'UNITED STATES': {
    dialCode: '+1',
    states: { 'New York': { 'New York County': ['New York'] }, California: { 'Los Angeles': ['Los Angeles'] } },
  },
}

export const COUNTRY = toOptions(Object.keys(GEO))

/** Nationality reads as a country name too, so it shares the list. */
export const NATIONALITY = COUNTRY

export const dialCodeFor = (country) => GEO[country]?.dialCode ?? ''

export const statesFor = (country) => toOptions(Object.keys(GEO[country]?.states ?? {}))

export const districtsFor = (country, state) => toOptions(Object.keys(GEO[country]?.states?.[state] ?? {}))

export const citiesFor = (country, state, district) => toOptions(GEO[country]?.states?.[state]?.[district] ?? [])

/**
 * A lookup when the server has one, the seed list when it does not.
 *
 * One helper rather than the same three lines beside every select: an endpoint that 404s or
 * comes back empty leaves useLookup with [], and a dropdown with nothing in it is the one
 * thing a registration desk cannot work around.
 *
 * @param {string|null} path e.g. '/hr/insurance/lookup', or null for a purely static list
 * @param {Array<{value: any, label: string}>} fallback
 */
export function useOptionList(path, fallback) {
  const { options, busy } = useLookup(path ?? '', Boolean(path))
  if (!path || busy || options.length === 0) return fallback
  return options
}

/** Lookup paths this screen asks for. A missing one costs one 404 per session, then the seed. */
export const LOOKUP_PATHS = {
  insuranceGroup: '/hr/insurance-group/lookup',
  insurance: '/hr/insurance/lookup',
  panel: '/hr/panel/lookup',
  patientType: '/hr/patient-type/lookup',
  source: '/hr/patient-source/lookup',
  referenceType: '/hr/reference-type/lookup',
}
