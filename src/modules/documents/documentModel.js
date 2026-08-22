import {
  Award, BadgeCheck, Briefcase, FileSignature, FileText, RefreshCw, ScrollText, TrendingUp,
  ArrowRightLeft, AlertTriangle,
} from 'lucide-react'

/**
 * How each document type is presented: its icon, its pastel identity and the short name the
 * filter chips use. Keyed by the catalogue code the server seeds.
 *
 * This is presentation only. Which types exist is the server's answer — a type missing from
 * here still renders, with the neutral fallback below, rather than disappearing.
 */
export const TYPE_META = {
  OfferLetter: { icon: Briefcase, tint: 'blue', short: 'Offer' },
  AppointmentLetter: { icon: FileSignature, tint: 'lavender', short: 'Appointment' },
  ConfirmationLetter: { icon: BadgeCheck, tint: 'green', short: 'Confirmation' },
  PromotionLetter: { icon: Award, tint: 'peach', short: 'Promotion' },
  IncrementLetter: { icon: TrendingUp, tint: 'lemon', short: 'Increment' },
  TransferLetter: { icon: ArrowRightLeft, tint: 'sky', short: 'Transfer' },
  ContractRenewal: { icon: RefreshCw, tint: 'mint', short: 'Renewal' },
  ExperienceLetter: { icon: ScrollText, tint: 'pink', short: 'Experience' },
  RelievingLetter: { icon: FileText, tint: 'cyan', short: 'Relieving' },
  WarningLetter: { icon: AlertTriangle, tint: 'rose', short: 'Warning' },
}

export const metaFor = (documentType) =>
  TYPE_META[documentType] ?? { icon: FileText, tint: 'indigo', short: documentType }

/** Mirrors DocumentStatus on the server. A status the API cannot hold is not offered here. */
export const STATUS_OPTIONS = [
  { value: 'Draft', label: 'Draft' },
  { value: 'Pending Signature', label: 'Pending signature' },
  { value: 'Issued', label: 'Issued' },
  { value: 'Acknowledged', label: 'Acknowledged' },
  { value: 'Expired', label: 'Expired' },
  { value: 'Revoked', label: 'Revoked' },
]

/**
 * Which moves each status offers. It mirrors DocumentService.Transitions: the server is
 * authoritative, and offering a button the API would refuse is worse than not offering it.
 */
export const NEXT_STATUS = {
  Draft: ['Pending Signature', 'Issued', 'Revoked'],
  'Pending Signature': ['Draft', 'Issued', 'Revoked'],
  Issued: ['Acknowledged', 'Expired', 'Revoked'],
  Acknowledged: ['Expired', 'Revoked'],
  Expired: ['Revoked'],
  Revoked: [],
}

/** Only a document still being prepared can be edited or deleted. */
export const EDITABLE = ['Draft', 'Pending Signature']

/** A stable colour per employee, so the same person keeps the same avatar everywhere. */
export const hueOf = (id) => Math.abs(Number(id) || 0) % 12

export const BLANK_DOCUMENT = {
  documentId: 0,
  refNo: '',
  employeeId: '',
  documentType: '',
  templateId: '',
  subject: '',
  bodyText: '',
  effectiveDate: '',
  validTill: '',
  signedBy: '',
  status: 'Draft',
}

export const daysUntil = (iso) => {
  if (!iso) return null
  const then = new Date(String(iso).slice(0, 10))
  const today = new Date(new Date().toISOString().slice(0, 10))
  return Math.round((then - today) / 86_400_000)
}
