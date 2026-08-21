# HrSuite — frontend

React 19 + Vite, **JSX only, no TypeScript**. The client half of a five-layer product
architecture. The backend lives in a separate tree at `D:\Astitwa\api` and is built,
versioned and deployed independently.

---

## Layout

```
D:\Astitwa\react\
  eslint.config.js                 the layer rule, mechanically enforced
  vite.config.js                   /api proxy, @ alias, per-layer chunking
  public\
    hook-sandbox.html              the layer 5 script sandbox (see below)
  src\
    ── Layer 1 · base code ────────────────────────────────────────────
    core\        api client, auth, routing, design tokens, shared controls,
                 runHook(), the five ui primitives
    modules\     employee\, department\, designation\, leave\, home\

    ── Layer 2 · configuration ────────────────────────────────────────
    config\      ConfigProvider, DynamicField, useScreenRules

    ── Layer 3 · add-ons ──────────────────────────────────────────────
    addons\      payroll\ — lazy, licensed per tenant

    ── Layer 4 · integration ──────────────────────────────────────────
    integrations\ email\ — lazy, enabled per tenant

    ── Layer 5 · extension ────────────────────────────────────────────
    extensions\  hookEngine, adminScreens\

    registerLayers.js              the composition root — the ONLY file that may
                                   name an add-on, an integration or the engine
```

---

## The dependency rule, and how it is enforced

**A lower layer may reference an upper layer. Never the reverse.**

`eslint.config.js` forbids any file under `src/modules/`, `src/core/` or `src/config/`
from importing `src/addons/`, `src/integrations/` or `src/extensions/`. It catches both
spellings — relative (`../../addons/payroll/x`) and aliased (`@/extensions/x`) — and it
also stops an add-on reaching sideways into an integration.

`npm run build` runs the linter first, so a violation fails the build.

To watch it fail, create `src/modules/_probe/Violation.jsx`:

```jsx
import { PayrollWidget } from '../../addons/payroll/PayrollWidget.jsx'
import { runHook } from '@/extensions/hookEngine.js'

export default function Violation() {
  return <PayrollWidget onDone={runHook} />
}
```

```
error  '../../addons/payroll/PayrollWidget.jsx' import is restricted …
       Layer 1 must not import src/addons/ (layer 3).
error  '@/extensions/hookEngine.js' import is restricted …
       Layer 1 must not import src/extensions/ (layer 5).
```

### So how do the upper layers get in?

They push, rather than being pulled.

- **Routes.** `src/core/routing/routeRegistry.js` is a registry. Base screens call
  `registerRoutes()`; so do add-ons, from their own folder. `src/core/` never imports one.
- **The hook engine.** `src/core/hooks/hookBridge.js` exposes `runHook()`, which returns
  `{}` until something calls `setHookEngine()`. `src/extensions/register.js` does that.
  Base screens call `runHook()` at every slot and work unchanged if the Layer 5 bundle
  never loads.
- **The composition root.** `src/registerLayers.js` sits outside `core/` and `modules/`,
  which is why it is allowed to name them. Every import there is dynamic and gated on what
  the tenant is licensed for.

### Nothing a tenant is not licensed for is downloaded

`vite.config.js` puts each add-on and each integration in its own chunk, and keeps the
Layer 5 admin screens (which carry Monaco) out of the always-loaded extensions chunk. A
tenant without Payroll never requests `addon-payroll-*.js`; a user who never opens Script
Hooks never requests the 3.8 MB `monaco-*.js`. Watch the network tab — that is acceptance
scenario 6.

---

## Getting it running

The backend must be running first (see `D:\Astitwa\api\README.md`).

```powershell
npm install
npm run dev          # http://localhost:5173
```

```
npm run dev        vite dev server
npm run build      eslint, then a production build
npm run lint       eslint on its own
npm run preview    serve the built output
```

Components always call **relative** `/api/...` paths. Vite proxies `/api` to Kestrel in
development; production serves both from the same origin. No component ever names
`https://localhost:7272`.

`.env.development` / `.env.production` hold `VITE_API_BASE` (default `/api`) and
`VITE_API_ORIGIN` (the Kestrel origin the dev proxy targets).

---

## Layer 2 — configuration

`ConfigProvider` fetches `/api/config/bootstrap` once at start-up: settings, field rules,
the menu, the licensed add-ons and the client-side hook scripts. Screens then read
configuration synchronously.

Every form field renders through `<DynamicField>`:

```jsx
<ConfigForm screenKey="hr.employee">
  <DynamicField fieldKey="reportingManagerId" label="Reporting manager" defaultSeq={70}>
    {({ id, invalid }) => <SelectInput id={id} invalid={invalid} options={managers.options} />}
  </DynamicField>
</ConfigForm>
```

Visibility, required-ness, the caption and the order all come from `cfg_field_rule` for the
signed-in tenant. The `label` and `required` props are the **product default**, not the
tenant's answer — a config row overrides both.

**Hardcoding a caption or a required flag in a form component is a defect.** So is
validating a field the tenant has hidden: `useScreenRules().validateRequired()` skips
invisible fields, which is why hiding one cannot make a form unsubmittable.

---

## Layer 5 — the sandbox

`public/hook-sandbox.html` is loaded into `<iframe sandbox="allow-scripts">`. Because
`allow-same-origin` is deliberately withheld, the frame runs on an **opaque origin**: it
cannot read this page's `localStorage`, cookies or DOM, so **it cannot read the JWT**. It
is served from the frontend root rather than the API, so it shares no origin with the token
either.

Everything crosses as a `postMessage`. The frame's own origin is `"null"`, so identity is
established by `event.source === frame.contentWindow`, which nothing else can forge.

- `api.query(key, params)` becomes a message the host turns into a call to `/api/ext/query`
  with the user's own token. The server validates the key against `ext_named_query`, binds
  only declared parameters and strips undeclared columns.
- `ui.toast | error | confirm | pickList | openScreen` become messages serviced by the
  product's own components. **The script supplies data; it never supplies markup.**
  `PickListDialog` owns the rendering, the filtering, the focus trap and the ARIA.
- Each run is raced against a timeout. On expiry the failure is logged to `ext_hook_log`,
  an empty result is returned, and the frame — which may be stuck in a loop — is torn down
  and rebuilt. **A broken script never blocks a save.**

Client-side failures post to `/api/ext/hook-log`, which needs only a signed-in user: the
person whose screen just ran a broken script is rarely an administrator, and their failure
is exactly the one worth capturing.

### The admin screens

- **Script Hooks** — hook point, run target, Monaco editor with the script contract loaded
  as IntelliSense, *Test with sample data*, version history and rollback, active toggle.
  **Save stays disabled until a test run has passed.**
- **Named Queries** — register a key against a stored procedure, declare parameters and
  output columns, set the row cap.
- **Hook Log** — read-only, filterable by status. Where acceptance scenario 4 is observed.

Monaco is bundled, not pulled from a CDN, so the editor works on an air-gapped install.
Only the editor API and the JavaScript/TypeScript language service are imported; the JSON,
HTML and CSS workers are left out.

---

## Conventions

- **Styling** is a single design-token stylesheet (`core/styles/tokens.css`) plus plain
  class names. No CSS-in-JS anywhere.
- **Every list screen** uses `usePagedList`. There is no unpaged variant.
- **Every form screen** uses `useRecordForm`, which binds server-side field errors from the
  response envelope. Client-side validation exists for speed of feedback only — the server
  checks everything again.
- **Permissions hide controls; they do not grant anything.** The API enforces the same
  permission on every call.
- `busy` states are **derived** by comparing the query that produced the data in hand
  against the query currently in effect, rather than kept as a flag. That keeps effects free
  of synchronous state writes and makes rendering a stale page as though it were fresh
  impossible.

---

## Deviation from the brief

React **19**, not 18 — confirmed with the project owner before Phase 0. Nothing here needs
React-18-only behaviour. ESLint replaced the oxlint config that shipped with the Vite
template, because section 3.2 calls for `no-restricted-imports` specifically.
#   a s t i t w a _ r e a c t  
 