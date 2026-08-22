import { useEffect, useState } from 'react'
import { Ban, CheckCircle2, FileClock, FileSignature, Printer } from 'lucide-react'
import {
  Avatar, Badge, ConfirmDialog, Drawer, StatusBadge, Timeline, useToast,
} from '../../../config/nhr/ui/index.js'
import { fmtDate } from '../../../config/nhr/format.js'
import { TemplatePreview } from '../../../config/print/TemplatePreview.jsx'
import { contextToData, printTemplate } from '../../../config/print/printDocument.js'
import { useResolvedTemplate } from '../../../config/print/useResolvedTemplate.js'
import { documentsApi } from '../documentsApi.js'
import { hueOf, metaFor } from '../documentModel.js'

function TypePill({ documentType, label }) {
  const meta = metaFor(documentType)
  const Icon = meta.icon

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        whiteSpace: 'nowrap',
        background: `var(--tint-${meta.tint})`,
        color: `var(--tint-${meta.tint}-ink)`,
        borderRadius: 999,
        padding: '3px 10px',
        fontSize: 11.5,
        fontWeight: 650,
      }}
    >
      <Icon size={11} /> {label ?? meta.short}
    </span>
  )
}

/**
 * One document, opened from the register.
 *
 * The body is the letter itself, rendered through the same function the print path calls —
 * so what is on screen is the document, not a drawing of it. The actions along the bottom
 * are only the transitions the server would actually accept from the current status.
 */
export function DocumentDrawer({ documentId, typeLabel, onClose, onChanged, canManage }) {
  const toast = useToast()

  const [fetched, setFetched] = useState(null)
  const [busy, setBusy] = useState(false)
  const [confirmRevoke, setConfirmRevoke] = useState(false)

  useEffect(() => {
    if (!documentId) return undefined

    let alive = true

    documentsApi
      .printContext(documentId)
      .then((c) => {
        if (alive) setFetched({ documentId, context: c })
      })
      .catch((cause) => {
        if (alive) toast.error('Could not open the document', cause?.message)
      })

    return () => {
      alive = false
    }
    // toast is stable for the life of the provider.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId])

  // Derived rather than blanked in the effect: opening a second document shows the skeleton
  // at once instead of the previous letter until the new one arrives.
  const context = fetched?.documentId === documentId ? fetched.context : null
  const doc = context?.document
  const { template } = useResolvedTemplate(doc?.documentType)

  if (!documentId) return null

  const data = context ? contextToData(context) : {}

  async function moveTo(status) {
    setBusy(true)
    try {
      // The snapshot travels only on the way to Issued, and the server keeps the first one
      // it is given — so what a document said when it went out cannot be rewritten later.
      const extra =
        status === 'Issued'
          ? { deliveredVia: 'Portal', payloadJson: JSON.stringify({ data, templateId: template?.templateId ?? null }) }
          : {}

      await documentsApi.setStatus(documentId, status, extra)
      const refreshed = await documentsApi.printContext(documentId)
      setFetched({ documentId, context: refreshed })
      onChanged?.()
      toast.success(`Document ${status.toLowerCase()}`)
    } catch (cause) {
      toast.error('Could not change the status', cause?.message)
    } finally {
      setBusy(false)
    }
  }

  const trail = doc
    ? [
        { title: 'Created', time: fmtDate(doc.createdOn ?? doc.effectiveDate), color: 'var(--text-3)' },
        doc.issuedOn && { title: `Issued${doc.deliveredVia ? ` · ${doc.deliveredVia}` : ''}`, time: fmtDate(doc.issuedOn), color: 'var(--success)' },
        doc.acknowledgedOn && { title: 'Acknowledged by the employee', time: fmtDate(doc.acknowledgedOn), color: 'var(--primary)' },
        doc.status === 'Revoked' && { title: 'Revoked', time: '', color: 'var(--danger)' },
        doc.status === 'Expired' && { title: 'Term lapsed', time: fmtDate(doc.validTill), color: 'var(--warning)' },
      ].filter(Boolean)
    : []

  return (
    <Drawer
      open
      onClose={onClose}
      size="lg"
      title={typeLabel ?? doc?.documentType ?? 'Document'}
      subtitle={doc ? `${doc.refNo} · ${doc.employeeName}` : ' '}
      footer={
        <>
          <button
            className="btn btn-outline"
            disabled={!context}
            onClick={() => printTemplate(template, data, { title: doc?.subject || doc?.documentType })}
          >
            <Printer size={14} /> Print
          </button>

          {canManage && doc && ['Draft', 'Pending Signature'].includes(doc.status) && (
            <button className="btn btn-primary" disabled={busy} onClick={() => moveTo('Issued')}>
              <FileSignature size={14} /> Sign &amp; issue
            </button>
          )}

          {canManage && doc?.status === 'Issued' && (
            <button className="btn btn-success" disabled={busy} onClick={() => moveTo('Acknowledged')}>
              <CheckCircle2 size={14} /> Mark acknowledged
            </button>
          )}

          {canManage && doc && (
            <button
              className="btn btn-danger-soft"
              disabled={busy || doc.status === 'Revoked'}
              onClick={() => setConfirmRevoke(true)}
            >
              <Ban size={14} /> Revoke
            </button>
          )}
        </>
      }
    >
      {!context && <div className="skeleton" style={{ height: 380, borderRadius: 12 }} />}

      {context && (
        <>
          <div
            className="flex items-center gap-3 mb-4"
            style={{ background: 'linear-gradient(120deg, var(--tint-lavender), var(--tint-blue))', borderRadius: 14, padding: 16 }}
          >
            <Avatar name={doc.employeeName} hue={hueOf(doc.employeeId)} size="lg" ring />
            <div className="flex-1" style={{ minWidth: 0 }}>
              <div className="t-md fw-7 truncate">{doc.employeeName}</div>
              <div className="t-sm ink-2 truncate">
                {[doc.designationName, doc.departmentName].filter(Boolean).join(' · ') || '—'}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
              <StatusBadge status={doc.status} />
              <TypePill documentType={doc.documentType} label={typeLabel} />
            </div>
          </div>

          {/* The letter exactly as it will print — same renderer, same template. */}
          <TemplatePreview
            documentType={doc.documentType}
            data={data}
            options={{ title: doc.subject || doc.documentType, organisation: context.tenantName }}
          />

          <div className="flex gap-2 flex-wrap mt-3">
            {doc.effectiveDate && <Badge tone="info">Effective {fmtDate(doc.effectiveDate)}</Badge>}
            {doc.validTill && <Badge tone="warning">Valid till {fmtDate(doc.validTill)}</Badge>}
            <Badge tone="neutral">Delivery: {doc.deliveredVia || 'not sent yet'}</Badge>
            {doc.signedBy && <Badge tone="neutral">Signed by {doc.signedBy}</Badge>}
          </div>

          {context.customValues?.length > 0 && (
            <div className="detail-list mt-3">
              {context.customValues.map((v) => (
                <div key={v.fieldKey} className="detail-row">
                  <span className="detail-key">{v.label}</span>
                  <span className="detail-val">{v.valueText || '—'}</span>
                </div>
              ))}
            </div>
          )}

          <div className="t-sm fw-7 ink-2 mt-4 mb-2 flex items-center gap-2">
            <FileClock size={14} /> Acknowledgement trail
          </div>
          <Timeline items={trail} />
        </>
      )}

      <ConfirmDialog
        open={confirmRevoke}
        onClose={() => setConfirmRevoke(false)}
        onConfirm={() => moveTo('Revoked')}
        title="Revoke this document?"
        desc={`${doc?.refNo ?? 'This document'} is withdrawn immediately and stops being valid. A revoked document cannot be reinstated from here — issue a new one instead.`}
        confirmText="Revoke document"
        danger
      />
    </Drawer>
  )
}
