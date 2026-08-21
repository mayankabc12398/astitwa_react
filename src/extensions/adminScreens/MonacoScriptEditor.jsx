import Editor, { loader } from '@monaco-editor/react'
// Only the editor API and the JavaScript/TypeScript language service are pulled in.
// Importing the whole 'monaco-editor' barrel would drag in the JSON, HTML and CSS
// language workers as well - roughly two megabytes this product has no use for.
import * as monaco from 'monaco-editor/editor/editor.api.js'
// The ESM build does NOT hang the typescript namespace off monaco.languages the way the
// AMD/global build does: the contribution EXPORTS its defaults instead. Reaching for
// monaco.languages.typescript.javascriptDefaults therefore reads undefined and throws.
import { javascriptDefaults } from 'monaco-editor/language/typescript/monaco.contribution.js'
import editorWorker from 'monaco-editor/editor/editor.worker.js?worker'
import jsWorker from 'monaco-editor/language/typescript/ts.worker.js?worker'

/*
 * Monaco is bundled with the app rather than pulled from a CDN, so the editor works on an
 * air-gapped install and no third-party origin is involved.
 */
self.MonacoEnvironment = {
  getWorker(_workerId, label) {
    if (label === 'javascript' || label === 'typescript') return new jsWorker()
    return new editorWorker()
  },
}

loader.config({ monaco })

/**
 * The script editor. The declarations below tell Monaco what a script may reach — the four
 * objects and nothing else — so completion reflects the actual contract (section 10.3).
 */
const CONTRACT = `
/** The record being edited, plus who is editing it. */
declare const ctx: {
  hookKey: string
  form: Record<string, any>
  value: any
  response: any
  user: { id: number, name: string, roles: string[] }
  tenant: { id: number, code: string }
  setForm(key: string | Record<string, any>, value?: any): Record<string, any>
}

/** Registered named queries only. No SQL, no procedure names, no undeclared parameters. */
declare const api: {
  query(queryKey: string, params?: Record<string, any>): Promise<{
    ok: boolean, rows: Array<Record<string, any>>, columns: string[], truncated: boolean, error?: string
  }>
}

/** The five interaction primitives. The product renders them; the script supplies data. */
declare const ui: {
  toast(message: string): void
  error(message: string): void
  confirm(options: string | { title?: string, message: string, confirmLabel?: string, danger?: boolean }): Promise<boolean>
  pickList(options: { title?: string, columns: Array<string | { key: string, label?: string }>, rows: any[], emptyAction?: { label: string, action?: string } }): Promise<any>
  openScreen(route: string, options?: { state?: any, replace?: boolean }): boolean
}

declare const utils: {
  age(dob: string | Date, asOf?: string | Date): number
  formatDate(value: string | Date): string
  round(value: number, digits?: number): number
  isEmpty(value: any): boolean
}
`

let contractInstalled = false

export function MonacoScriptEditor({ value, onChange, height = '360px', readOnly = false }) {
  return (
    <Editor
      height={height}
      defaultLanguage="javascript"
      theme="vs"
      value={value}
      onChange={(next) => onChange?.(next ?? '')}
      onMount={() => {
        if (contractInstalled) return
        contractInstalled = true

        // IntelliSense is a convenience. If the language service is unavailable the editor
        // must still open and still save - onMount runs inside React, so a throw here
        // unmounts the screen rather than degrading it.
        try {
          javascriptDefaults.addExtraLib(CONTRACT, 'hrsuite-script-contract.d.ts')
          javascriptDefaults.setDiagnosticsOptions({
            noSemanticValidation: false,
            noSyntaxValidation: false,
          })
        } catch (cause) {
          console.warn('Script contract IntelliSense is unavailable.', cause)
        }
      }}
      options={{
        readOnly,
        minimap: { enabled: false },
        fontSize: 13,
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
        wordWrap: 'on',
      }}
    />
  )
}
