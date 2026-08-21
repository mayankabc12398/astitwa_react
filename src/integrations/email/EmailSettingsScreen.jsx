import { useEffect, useState } from 'react'
import { api } from '../../core/api/client.js'
import { Button } from '../../core/controls/Button.jsx'
import { Field } from '../../core/controls/Field.jsx'
import { TextInput } from '../../core/controls/inputs.jsx'
import { Alert, Card, Loading, PageHeader } from '../../core/controls/layout.jsx'
import { useUi } from '../../core/controls/uiContext.js'

const INTEGRATION_KEY = 'email.smtp'

const BLANK = { host: '', port: 587, useStartTls: true, fromAddress: '', fromName: '', userName: '', password: '' }

/**
 * Layer 4 settings screen.
 *
 * Switching this off is a row in sys_tenant_integration. Leave approval keeps working either
 * way — the dispatcher reports "skipped" rather than throwing (acceptance scenario 7).
 */
export default function EmailSettingsScreen() {
  const ui = useUi()
  const [settings, setSettings] = useState(null)
  const [enabled, setEnabled] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false

    api
      .get(`/admin/integration/${INTEGRATION_KEY}`, { signal: controller.signal })
      .then((row) => {
        if (cancelled) return
        setEnabled(Boolean(row?.isEnabled))
        setSettings({ ...BLANK, ...(row?.settings ?? {}) })
      })
      .catch((cause) => {
        if (cancelled || cause?.name === 'AbortError') return
        setSettings(BLANK)
        setError(cause?.message ?? 'Settings could not be loaded.')
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [])

  if (!settings) return <Loading />

  const set = (key) => (e) => setSettings((s) => ({ ...s, [key]: e.target.value }))

  async function onSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await api.post('/admin/integration', {
        integrationKey: INTEGRATION_KEY,
        isEnabled: enabled,
        settingsJson: JSON.stringify(settings),
      })
      ui.toast('Email settings saved.')
    } catch (cause) {
      setError(cause?.message ?? 'Settings could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <PageHeader title="Email integration" subtitle="SMTP — layer 4" />

      {error && <Alert tone="error">{error}</Alert>}

      <Card>
        <label style={{ display: 'flex', gap: 'var(--s-2)', alignItems: 'center', marginBottom: 'var(--s-4)' }}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span>Enabled for this tenant</span>
        </label>

        <div className="form-grid">
          <Field label="Host" htmlFor="host">
            <TextInput id="host" value={settings.host} onChange={set('host')} />
          </Field>

          <Field label="Port" htmlFor="port">
            <TextInput id="port" inputMode="numeric" value={settings.port} onChange={set('port')} />
          </Field>

          <Field label="From address" htmlFor="fromAddress">
            <TextInput id="fromAddress" type="email" value={settings.fromAddress} onChange={set('fromAddress')} />
          </Field>

          <Field label="From name" htmlFor="fromName">
            <TextInput id="fromName" value={settings.fromName} onChange={set('fromName')} />
          </Field>

          <Field label="User name" htmlFor="userName">
            <TextInput id="userName" value={settings.userName} onChange={set('userName')} autoComplete="off" />
          </Field>

          <Field label="Password" htmlFor="password" hint="Stored with the tenant's integration settings.">
            <input
              id="password"
              className="input"
              type="password"
              value={settings.password}
              onChange={set('password')}
              autoComplete="new-password"
            />
          </Field>
        </div>

        <div className="form-actions">
          <Button type="submit" variant="primary" busy={saving}>
            Save
          </Button>
        </div>
      </Card>
    </form>
  )
}
