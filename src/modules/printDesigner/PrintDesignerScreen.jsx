import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ChevronLeft, ChevronRight, Copy, Eye, FileText, LayoutGrid, Layers, Lock, Plus, Printer,
  RefreshCw, Settings2, Star, Trash2,
} from 'lucide-react'
import { useUi } from '../../core/controls/uiContext.js'
import { NhrScope } from '../../config/nhr/NhrScope.jsx'
import {
  Badge, ConfirmDialog, EmptyState, Field, Input, Modal, PageHeader, Select, SkeletonRows, useToast,
} from '../../config/nhr/ui/index.js'
import {
  pageDimensions, previewCss, renderPreview, SCOPE_CLASS,
} from '../../config/print/templateRenderer.js'
import { printTemplate } from '../../config/print/printDocument.js'
import { printDesignerApi } from './printDesignerApi.js'
import { StructureDrawer } from './components/StructureDrawer.jsx'
import { PageSetupDrawer } from './components/PageSetupDrawer.jsx'
import { BLANK_TEMPLATE, SAMPLE } from './components/blockModel.jsx'

/**
 * The Print / Template Designer.
 *
 * The page below is what prints: the preview goes through the same render the print path
 * calls, so a template cannot look one way here and another on paper. Everything else — the
 * source rail, the structure drawer, page setup — is arranged around giving the paper the
 * width, because the paper is what this screen is for.
 */
export default function PrintDesignerScreen() {
  const { id } = useParams()
  const navigate = useNavigate()
  const ui = useUi()
  const toast = useToast()

  const [docTypes, setDocTypes] = useState([])
  const [docType, setDocType] = useState('')
  const [templates, setTemplates] = useState([])
  const [availableFetch, setAvailableFetch] = useState(null)

  const [draft, setDraft] = useState(null)
  const [saved, setSaved] = useState(null)
  const [saving, setSaving] = useState(false)

  const [railed, setRailed] = useState(false)
  const [structureOpen, setStructureOpen] = useState(false)
  const [setupOpen, setSetupOpen] = useState(false)
  const [activeSection, setActiveSection] = useState(0)

  const [cloneName, setCloneName] = useState('')
  const [cloneOpen, setCloneOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const templateId = id && id !== 'new' ? Number(id) : 0

  useEffect(() => {
    let alive = true
    printDesignerApi
      .documentTypes()
      .then((rows) => {
        if (!alive) return
        setDocTypes(rows ?? [])
        setDocType((current) => current || rows?.[0]?.documentType || '')
      })
      .catch(() => {
        if (alive) setDocTypes([])
      })

    return () => {
      alive = false
    }
  }, [])

  const loadTemplates = useCallback((type) => {
    if (!type) return
    printDesignerApi
      .templates(type)
      .then((page) => setTemplates(page?.items ?? []))
      .catch(() => setTemplates([]))
  }, [])

  useEffect(() => loadTemplates(docType), [docType, loadTemplates])

  // The pickable values depend on the document type, so they reload with it rather than
  // offering a key the chosen document cannot fill.
  useEffect(() => {
    if (!docType) return undefined

    let alive = true
    printDesignerApi
      .availableFields(docType)
      .then((rows) => {
        if (alive) setAvailableFetch({ docType, fields: rows ?? [] })
      })
      .catch(() => {
        if (alive) setAvailableFetch({ docType, fields: [] })
      })

    return () => {
      alive = false
    }
  }, [docType])

  const available = availableFetch?.docType === docType ? availableFetch.fields : []

  // Which template is on screen. Resetting during render is React's documented way to key
  // state off a prop, and it is what the record forms already do — clearing inside the
  // effect would show the previous template for a frame.
  const [openedId, setOpenedId] = useState(null)

  if (openedId !== templateId) {
    setOpenedId(templateId)
    setDraft(templateId ? null : { ...BLANK_TEMPLATE, documentType: docType, templateName: 'New template' })
    setSaved(null)
    setActiveSection(0)
  }

  // `saved` keeps what the server last confirmed, so "unsaved changes" is a comparison
  // rather than a flag somebody has to remember to set.
  useEffect(() => {
    if (!templateId) return undefined

    let alive = true

    printDesignerApi
      .template(templateId)
      .then((t) => {
        if (!alive) return
        setDraft(t)
        setSaved(JSON.stringify(t))
        setDocType(t.documentType)
      })
      .catch((cause) => {
        if (!alive) return
        toast.error('Could not open the template', cause?.message)
        setDraft(null)
      })

    return () => {
      alive = false
    }
    // toast is stable for the life of the provider.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId])

  const loading = Boolean(templateId) && draft === null
  const dirty = draft ? JSON.stringify(draft) !== saved : false
  const currentDoc = docTypes.find((d) => d.documentType === docType)
  const defaultCount = templates.filter((t) => t.isDefault).length

  const sample = useMemo(
    () => ({ ...SAMPLE, documentTitle: currentDoc?.defaultTitle ?? '', printedOn: new Date().toLocaleString() }),
    [currentDoc],
  )

  async function save() {
    if (!draft) return

    setSaving(true)
    try {
      const result = await printDesignerApi.save({
        ...draft,
        templateId: Number(draft.templateId) || 0,
        // The order is re-derived from the array, so what is stored is what the author
        // arranged rather than whatever sequence numbers happen to be on the objects.
        sections: (draft.sections ?? []).map((s, i) => ({ ...s, seqNo: (i + 1) * 10 })),
      })

      toast.success('Template saved')
      loadTemplates(docType)

      if (!templateId) navigate(`/hr/print-designer/${result.templateId}`)
      else {
        const reloaded = await printDesignerApi.template(result.templateId)
        setDraft(reloaded)
        setSaved(JSON.stringify(reloaded))
      }
    } catch (cause) {
      toast.error('Could not save the template', cause?.message)
    } finally {
      setSaving(false)
    }
  }

  async function makeDefault() {
    try {
      await printDesignerApi.setDefault(templateId)
      loadTemplates(docType)
      setDraft((d) => ({ ...d, isDefault: true }))
      toast.success('Made the default for this document')
    } catch (cause) {
      toast.error('Could not change the default', cause?.message)
    }
  }

  async function doClone() {
    try {
      const copy = await printDesignerApi.clone(templateId, cloneName.trim())
      setCloneOpen(false)
      loadTemplates(docType)
      navigate(`/hr/print-designer/${copy.templateId}`)
      toast.success('Copy created')
    } catch (cause) {
      toast.error('Could not copy the template', cause?.message)
    }
  }

  async function doDelete() {
    try {
      await printDesignerApi.remove(templateId)
      setDeleting(false)
      loadTemplates(docType)
      navigate('/hr/print-designer')
      toast.success('Template deleted')
    } catch (cause) {
      toast.error('Could not delete the template', cause?.message)
    }
  }

  async function pickTemplate(next) {
    if (dirty && !(await ui.confirm('Discard the unsaved changes to this template?'))) return
    navigate(`/hr/print-designer/${next}`)
  }

  return (
    <NhrScope>
      <PageHeader
        title="Print / Template Designer"
        desc="Design the printed layout of every document. The page below is what prints."
        icon={<Printer size={20} />}
        crumbs={[{ label: 'HR' }, { label: 'Administration' }, { label: 'Print / Template Designer' }]}
        actions={
          <>
            <button className="btn btn-ghost" onClick={() => loadTemplates(docType)} disabled={loading}>
              <RefreshCw size={14} /> Refresh
            </button>
            <button
              className="btn btn-ghost"
              disabled={!draft}
              onClick={() => printTemplate(draft, sample, { title: draft?.templateName })}
            >
              <Eye size={14} /> Test print
            </button>
            <button className="btn btn-primary" onClick={save} disabled={!draft || saving}>
              {saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
            </button>
          </>
        }
      />

      {/* Four counts on one line. As metric cards these took a fifth of the fold for numbers
          nobody designs against — the page is what this screen is for, so the stats are a
          strip and the height goes to the paper. */}
      <div className="pd-stats mb-3">
        <span className="pd-stat" title="Documents that can be templated">
          <span className="pd-stat-ico" style={{ background: 'var(--tint-lavender)', color: 'var(--tint-lavender-ink)' }}>
            <FileText size={13} />
          </span>
          <b className="tabular">{docTypes.length}</b> documents
        </span>

        <span className="pd-stat" title={currentDoc?.displayName ?? ''}>
          <span className="pd-stat-ico" style={{ background: 'var(--tint-blue)', color: 'var(--tint-blue-ink)' }}>
            <Layers size={13} />
          </span>
          <b className="tabular">{templates.length}</b> template{templates.length === 1 ? '' : 's'}
          {currentDoc && <em className="pd-stat-sub">{currentDoc.displayName}</em>}
        </span>

        <span className="pd-stat">
          <span className="pd-stat-ico" style={{ background: 'var(--tint-mint)', color: 'var(--tint-mint-ink)' }}>
            <LayoutGrid size={13} />
          </span>
          <b className="tabular">{draft?.sections?.length ?? 0}</b> blocks
          {draft && <em className="pd-stat-sub">{draft.pageSize} {draft.orientation}</em>}
        </span>

        <span className="pd-stat" title="One default per document type">
          <span className="pd-stat-ico" style={{ background: 'var(--tint-peach)', color: 'var(--tint-peach-ink)' }}>
            <Star size={13} />
          </span>
          default <b>{defaultCount ? 'set' : 'not set'}</b>
        </span>
      </div>

      <div className={`pd-grid${railed ? ' is-railed' : ''}`}>
        {railed ? (
          <div className="card pd-rail">
            <button className="icon-btn" title="Show documents and templates" onClick={() => setRailed(false)}>
              <ChevronRight size={16} />
            </button>
            <span className="pd-rail-sep" />
            <button className="icon-btn" title="Template structure" onClick={() => setStructureOpen(true)} disabled={!draft}>
              <Layers size={16} />
            </button>
            <button className="icon-btn" title="Page setup" onClick={() => setSetupOpen(true)} disabled={!draft}>
              <Settings2 size={16} />
            </button>
            <button className="icon-btn" title="New template" onClick={() => navigate('/hr/print-designer/new')}>
              <Plus size={16} />
            </button>
            <button
              className="icon-btn"
              title="Print"
              disabled={!draft}
              onClick={() => printTemplate(draft, sample, { title: draft?.templateName })}
            >
              <Printer size={16} />
            </button>
          </div>
        ) : (
          <div className="card card-pad">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs uppercase tracking-wide opacity-60">Source</span>
              <button className="icon-btn" title="Collapse — give the page the width" onClick={() => setRailed(true)}>
                <ChevronLeft size={16} />
              </button>
            </div>

            <Field label="Document">
              <Select
                value={docType}
                onChange={(e) => {
                  setDocType(e.target.value)
                  navigate('/hr/print-designer')
                }}
                options={docTypes.map((d) => ({ value: d.documentType, label: d.displayName }))}
              />
            </Field>

            <div className="flex items-center justify-between mt-3 mb-2">
              <span className="text-xs uppercase tracking-wide opacity-60">Templates</span>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/hr/print-designer/new')}>
                <Plus size={13} /> New
              </button>
            </div>

            {loading && templates.length === 0 ? (
              <SkeletonRows rows={4} />
            ) : templates.length === 0 ? (
              <EmptyState title="No templates yet" desc="Create one, or print with the built-in layout." />
            ) : (
              <div className="pd-tpl-list">
                {templates.map((t) => (
                  <button
                    key={t.templateId}
                    className={`pd-tpl${t.templateId === templateId ? ' is-active' : ''}`}
                    onClick={() => pickTemplate(t.templateId)}
                  >
                    <div className="pd-tpl-name" title={t.templateName}>
                      {t.templateName}
                    </div>
                    <div className="pd-tpl-meta">
                      {t.isDefault && <Badge tone="success">Default</Badge>}
                      {t.isSystem && (
                        <Badge tone="neutral">
                          <Lock size={10} /> Standard
                        </Badge>
                      )}
                      <span className="opacity-60">{t.sectionCount} block(s)</span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {draft && (
              <div className="pd-tpl-actions mt-3">
                <button className="btn btn-ghost btn-sm" onClick={() => setStructureOpen(true)}>
                  <Layers size={13} /> Structure
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setSetupOpen(true)}>
                  <Settings2 size={13} /> Page setup
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={!templateId}
                  onClick={() => {
                    setCloneName(`${draft.templateName} (copy)`)
                    setCloneOpen(true)
                  }}
                >
                  <Copy size={13} /> Clone
                </button>
                <button className="btn btn-ghost btn-sm" disabled={!templateId || draft.isDefault} onClick={makeDefault}>
                  <Star size={13} /> Set default
                </button>
                <button
                  className="btn btn-ghost btn-sm text-danger"
                  disabled={!templateId || draft.isSystem}
                  title={draft.isSystem ? 'The standard template for a document cannot be deleted' : undefined}
                  onClick={() => setDeleting(true)}
                >
                  <Trash2 size={13} /> Delete
                </button>
              </div>
            )}
          </div>
        )}

        <div className="pd-preview">
          {!draft ? (
            <div className="card card-pad">
              <EmptyState title="Nothing to show" desc="Pick a template on the left, or create one." />
            </div>
          ) : (
            <>
              <div className="pd-preview-note">
                <span>
                  {draft.isSystem
                    ? 'This is the standard template for its document. It can be edited but not deleted, so every document always has something to print with.'
                    : 'This page is exactly what prints — the preview and the print run the same code.'}
                </span>
                <button className="btn btn-ghost btn-sm" onClick={() => setStructureOpen(true)}>
                  <Layers size={13} /> Edit blocks
                </button>
              </div>

              <Paper template={draft} data={sample} />
            </>
          )}
        </div>
      </div>

      <StructureDrawer
        open={structureOpen}
        template={draft}
        available={available}
        activeIndex={activeSection}
        onSelect={setActiveSection}
        onChange={setDraft}
        onClose={() => setStructureOpen(false)}
        onOpenSetup={() => setSetupOpen(true)}
      />

      <PageSetupDrawer open={setupOpen} template={draft} onChange={setDraft} onClose={() => setSetupOpen(false)} />

      <Modal
        open={cloneOpen}
        onClose={() => setCloneOpen(false)}
        title="Copy this template"
        subtitle="The copy carries every block and value, and starts as a non-default."
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setCloneOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={doClone} disabled={!cloneName.trim()}>
              Create the copy
            </button>
          </>
        }
      >
        <Field label="Name" required>
          <Input value={cloneName} onChange={(e) => setCloneName(e.target.value)} />
        </Field>
      </Modal>

      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        onConfirm={doDelete}
        title="Delete this template?"
        desc="Documents already issued keep what they printed. Anything still in draft falls back to the default for its document type."
        confirmText="Delete template"
        danger
      />
    </NhrScope>
  )
}

/**
 * The page itself: a real page box in millimetres, scaled to fit whatever width it is given.
 *
 * The stylesheet is built in scoped mode and injected once, so the document's own type and
 * colour rules cannot reach the application around it.
 */
function Paper({ template, data }) {
  const [host, setHost] = useState(null)
  const [page, setPage] = useState(null)
  const [scale, setScale] = useState(1)
  const [height, setHeight] = useState(0)

  const css = useMemo(() => previewCss(template), [template])
  const html = useMemo(() => renderPreview(template, data, { standalone: false }), [template, data])

  useEffect(() => {
    const node = document.createElement('style')
    node.setAttribute('data-print-preview', 'true')
    document.head.appendChild(node)
    node.textContent = css
    return () => node.remove()
    // Rewritten below; created once so the document never carries every past version.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const node = document.head.querySelector('style[data-print-preview]')
    if (node) node.textContent = css
  }, [css])

  useEffect(() => {
    if (!host) return undefined

    const dim = pageDimensions(template)
    const widthPx = (dim.width * 96) / 25.4

    const fit = () => {
      if (host.clientWidth > 0) setScale(Math.min(1, host.clientWidth / widthPx))
    }

    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(host)
    return () => observer.disconnect()
  }, [host, template])

  // A transform does not change layout height, so without this the wrapper would reserve
  // the full unscaled page and leave a tall gap below the document.
  useEffect(() => {
    if (!page) return undefined

    const measure = () => setHeight(page.scrollHeight)
    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(page)
    return () => observer.disconnect()
  }, [page, html])

  const scope = SCOPE_CLASS.replace('.', '')

  return (
    <div ref={setHost} className="pd-page" style={{ width: '100%' }}>
      <div style={{ height: Math.round(height * scale), overflow: 'hidden' }}>
        <div
          ref={setPage}
          className={scope}
          style={{ transform: `scale(${scale})`, transformOrigin: 'top left', boxShadow: 'var(--shadow-2)' }}
          // Produced entirely by the renderer from validated template values; the only
          // unescaped parts are the administrator's own header, footer and standing copy.
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  )
}
