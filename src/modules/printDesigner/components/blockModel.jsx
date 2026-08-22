import { LayoutGrid, Layers, PanelTop, Type } from 'lucide-react'

/**
 * The blocks a document can be built from, named the way an author thinks of them.
 *
 * The value of each has to match the vocabulary PrintTemplateService accepts, or a saved
 * block would be dropped on the way in. The label, hint and icon are only for this screen —
 * the renderer knows how to draw a block, not what to call it.
 */
export const SECTION_TYPES = [
  { value: 'Header', label: 'Letterhead', hint: 'Logo and organisation name' },
  { value: 'Title', label: 'Title', hint: 'Document title and reference' },
  { value: 'RefDate', label: 'Reference and date', hint: 'Reference left, date right' },
  { value: 'Addressee', label: 'Addressee', hint: 'To, / name / designation' },
  { value: 'Subject', label: 'Subject line', hint: 'Underlined subject' },
  { value: 'Paragraphs', label: 'Letter body', hint: 'The letter’s paragraphs' },
  { value: 'FieldGrid', label: 'Field grid', hint: 'Labelled values in columns' },
  { value: 'Table', label: 'Table', hint: 'Line items' },
  { value: 'RichText', label: 'Fixed text', hint: 'A block of standing copy, e.g. terms' },
  { value: 'SignOff', label: 'Sign-off', hint: 'Yours sincerely / signatory' },
  { value: 'Signature', label: 'Signature slots', hint: 'Ruled signing lines' },
  { value: 'Spacer', label: 'Spacer', hint: 'Vertical gap' },
  { value: 'PageBreak', label: 'Page break', hint: 'Start a new page' },
  { value: 'QrCode', label: 'Reference stamp', hint: 'The document reference, small' },
  { value: 'Footer', label: 'Footer', hint: 'Printed-on line and footer text' },
]

/** Blocks that hold a curated field list. Everything else is chrome, copy or a spacer. */
export const FIELD_BLOCKS = new Set(['FieldGrid', 'Table'])

/** Blocks whose copy lives in configJson rather than in a field list. */
export const COPY_BLOCKS = new Set(['Paragraphs', 'RichText'])

export const SECTION_ICON = {
  Header: <PanelTop size={13} />,
  Footer: <PanelTop size={13} />,
  Title: <Type size={13} />,
  Subject: <Type size={13} />,
  FieldGrid: <LayoutGrid size={13} />,
  Table: <Layers size={13} />,
}

export const sectionLabel = (type) => SECTION_TYPES.find((c) => c.value === type)?.label ?? type

/** The caption shown for a block in the structure list. */
export const blockLabel = (section) => section?.title || sectionLabel(section?.sectionType)

export const newSection = (type, seqNo) => ({
  sectionType: type,
  seqNo,
  title: '',
  columnCount: 2,
  borderStyle: 'none',
  borderColor: '',
  backgroundColor: '',
  paddingMm: type === 'Spacer' ? 6 : 0,
  isVisible: true,
  configJson: '',
  fields: [],
})

export const newField = (fieldKey = '') => ({
  fieldKey,
  label: '',
  format: 'text',
  align: 'left',
  widthPercent: 50,
  showLabel: true,
  isBold: false,
  staticText: '',
})

/** A blank template, matching the renderer's own built-in layout. */
export const BLANK_TEMPLATE = {
  templateId: 0,
  templateCode: '',
  templateName: '',
  documentType: '',
  isDefault: false,
  isSystem: false,
  stylePreset: 'Letter',
  pageSize: 'A4',
  orientation: 'portrait',
  marginTop: 14,
  marginRight: 14,
  marginBottom: 14,
  marginLeft: 14,
  fontFamily: '',
  fontSizePt: 10.5,
  lineHeight: 1.45,
  accentColor: '#4f46e5',
  textColor: '#1f2937',
  showLogo: false,
  logoUrl: '',
  logoHeightMm: 14,
  logoAlign: 'left',
  headerAlign: '',
  showHeader: true,
  headerHtml: '',
  showFooter: true,
  footerHtml: '',
  showPageNumbers: true,
  showWatermark: false,
  watermarkText: '',
  version: 1,
  sections: [
    newSection('Header', 10),
    newSection('Title', 20),
    newSection('RefDate', 30),
    newSection('Addressee', 40),
    newSection('Subject', 50),
    newSection('Paragraphs', 60),
    newSection('SignOff', 70),
    newSection('Footer', 80),
  ],
}

/**
 * Sample values for the preview.
 *
 * Deliberately obvious placeholders rather than a real employee: this is an administrative
 * screen, and pulling somebody's actual salary onto it to demonstrate a font size would be
 * showing personal data for no reason at all.
 */
export const SAMPLE = {
  refNo: 'OFFERL/2026/0007',
  employeeCode: 'EMP-0142',
  employeeName: 'A. Sample Employee',
  departmentName: 'Cardiology',
  designationName: 'Registrar',
  dateOfJoining: '2026-09-01',
  dob: '1994-03-18',
  mobile: '+00 00000 00000',
  email: 'sample@example.org',
  employmentStatus: 'Active',
  grossCtc: 1450000,
  hra: 320000,
  tds: 96000,
  netSalary: 1080000,
  subject: 'Offer of employment',
  effectiveDate: '2026-09-01',
  validTill: '2026-09-15',
  signedBy: 'R. Menon (Head of Human Resources)',
  issuedOn: '2026-08-21',
  tenantName: 'Your organisation',
  bodyText:
    'We are pleased to offer you the position of {{designationName}} in the {{departmentName}} department, effective {{effectiveDate}}.\n\nYour appointment is subject to the terms and conditions set out in the annexure to this letter. Please sign and return the duplicate copy within seven days of receipt.',
}
