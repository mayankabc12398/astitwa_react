import { useState } from 'react'
import { Button } from '../controls/Button.jsx'
import { Field } from '../controls/Field.jsx'
import { Alert } from '../controls/layout.jsx'
import { TextInput } from '../controls/inputs.jsx'
import { useAuth } from './AuthContext.js'

export function SignInScreen() {
  const { signIn } = useAuth()
  const [form, setForm] = useState({ tenantCode: '', userName: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await signIn(form)
    } catch (cause) {
      setError(cause?.message ?? 'Sign-in failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="signin">
      <form className="signin__card" onSubmit={onSubmit}>
        <div className="signin__brand">Demo Hospital</div>
        <p className="signin__tagline">Sign in to continue.</p>

        {error && <Alert tone="error">{error}</Alert>}

        <Field label="Tenant" required htmlFor="tenantCode">
          <TextInput
            id="tenantCode"
            value={form.tenantCode}
            onChange={set('tenantCode')}
            autoComplete="organization"
            autoFocus
            required
          />
        </Field>

        <Field label="User name" required htmlFor="userName">
          <TextInput
            id="userName"
            value={form.userName}
            onChange={set('userName')}
            autoComplete="username"
            required
          />
        </Field>

        <Field label="Password" required htmlFor="password">
          <input
            id="password"
            className="input"
            type="password"
            value={form.password}
            onChange={set('password')}
            autoComplete="current-password"
            required
          />
        </Field>

        <Button type="submit" variant="primary" busy={busy} style={{ width: '100%' }}>
          Sign in
        </Button>
      </form>
    </div>
  )
}
