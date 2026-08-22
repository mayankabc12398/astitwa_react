import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Editor, { loader } from '@monaco-editor/react'
// Only the editor API and the JavaScript/TypeScript language service are pulled in.
// Importing the whole 'monaco-editor' barrel would drag in the JSON, HTML and CSS
// language workers as well - roughly two megabytes this product has no use for.
import * as monaco from 'monaco-editor/editor/editor.api.js'
// The ESM build does NOT hang the typescript namespace off monaco.languages the way the
// AMD/global build does: the contribution EXPORTS its defaults instead. Reaching for
// monaco.languages.typescript.javascriptDefaults therefore reads undefined and throws.
import { javascriptDefaults } from 'monaco-editor/language/typescript/monaco.contribution.js'
// One basic language, not the barrel. 'monaco-editor/esm/vs/basic-languages/monaco.contribution'
// registers all ninety of them, which is the JavaScript story repeated for languages nothing
// in this product edits. The API Builder writes MySQL and only MySQL.
import 'monaco-editor/languages/definitions/mysql/register.js'
import editorWorker from 'monaco-editor/editor/editor.worker.js?worker'
import jsWorker from 'monaco-editor/language/typescript/ts.worker.js?worker'
import { AiAssistPanel } from './AiAssistPanel.jsx'
import './scriptEditor.css'

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

const LANGUAGE_LABELS = { javascript: 'JavaScript', mysql: 'MySQL' }

export const DARK_THEME = 'hrsuite-dark'
export const LIGHT_THEME = 'vs'

/*
 * The dark theme.
 *
 * vs-dark is a grey wash — keywords, identifiers and calls sit close enough in tone that a
 * script reads as one block of text. These are One Dark's values, which separate the parts of
 * an expression by hue rather than by brightness, so a misplaced brace or an unquoted key is
 * visible without reading the line.
 *
 * `base: 'vs-dark'` with `inherit: true` means only the tokens named here change; anything the
 * JavaScript tokenizer emits that is not listed keeps a sane default rather than turning
 * black-on-black.
 *
 * The editorBracketHighlight entries are what colours the brackets themselves — they are read
 * only when bracketPairColorization is on, which BASE_OPTIONS switches on for both themes.
 */
monaco.editor.defineTheme(DARK_THEME, {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: '', foreground: 'abb2bf' },
    { token: 'comment', foreground: '7f848e', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'c678dd' },
    { token: 'string', foreground: '98c379' },
    { token: 'string.escape', foreground: '56b6c2' },
    { token: 'regexp', foreground: '98c379' },
    { token: 'number', foreground: 'd19a66' },
    { token: 'operator', foreground: '56b6c2' },
    { token: 'delimiter', foreground: 'abb2bf' },
    // Monaco tokenizes JavaScript with a Monarch grammar, not with the type checker: every
    // lowercase name is 'identifier' and every capitalised one is 'type.identifier'. So
    // identifiers stay the plain foreground — colouring them would colour the whole file —
    // and only the capitalised names, which in a script body are constructors and constants,
    // are picked out.
    { token: 'identifier', foreground: 'abb2bf' },
    { token: 'type.identifier', foreground: 'e5c07b' },
    { token: 'type', foreground: 'e5c07b' },
  ],
  colors: {
    'editor.background': '#282c34',
    'editor.foreground': '#abb2bf',
    'editor.lineHighlightBackground': '#2c313a',
    'editor.selectionBackground': '#3e4451',
    'editor.selectionHighlightBackground': '#3e445180',
    'editor.wordHighlightBackground': '#3a3f4b',
    'editorCursor.foreground': '#528bff',
    'editorLineNumber.foreground': '#4b5263',
    'editorLineNumber.activeForeground': '#abb2bf',
    'editorIndentGuide.background': '#3b4048',
    'editorIndentGuide.activeBackground': '#545862',
    'editorGutter.background': '#282c34',
    'editorRuler.foreground': '#3b4048',
    'minimap.background': '#282c34',
    'scrollbarSlider.background': '#4e566080',
    'scrollbarSlider.hoverBackground': '#5a6374a0',
    'editorWidget.background': '#21252b',
    'editorWidget.border': '#181a1f',
    'editorSuggestWidget.background': '#21252b',
    'editorSuggestWidget.border': '#181a1f',
    'editorSuggestWidget.selectedBackground': '#2c313a',
    'editorHoverWidget.background': '#21252b',
    'editorHoverWidget.border': '#181a1f',
    // Nesting depth 1-6, then red for a bracket that closes nothing.
    'editorBracketHighlight.foreground1': '#d19a66',
    'editorBracketHighlight.foreground2': '#c678dd',
    'editorBracketHighlight.foreground3': '#56b6c2',
    'editorBracketHighlight.foreground4': '#e5c07b',
    'editorBracketHighlight.foreground5': '#98c379',
    'editorBracketHighlight.foreground6': '#61afef',
    'editorBracketHighlight.unexpectedBracket.foreground': '#e06c75',
    'editorBracketPairGuide.activeBackground1': '#d19a6660',
    'editorBracketPairGuide.activeBackground2': '#c678dd60',
    'editorBracketPairGuide.activeBackground3': '#56b6c260',
  },
})

/**
 * The script editor. The declarations below tell Monaco what a script may reach — the four
 * objects and nothing else — so completion reflects the actual contract (section 10.3).
 */
const CONTRACT = `
/** The record being edited, plus who is editing it. */
declare const ctx: {
  hookKey: string
  /** The fields the product ships with, keyed as the screen names them. */
  form: Record<string, any>
  /** The fields this tenant added through Field Builder. Kept apart from form so a custom
   *  field named the same as a compiled one cannot shadow it. */
  custom: Record<string, any>
  value: any
  response: any
  user: { id: number, name: string, roles: string[] }
  tenant: { id: number, code: string }
  setForm(key: string | Record<string, any>, value?: any): Record<string, any>
  setCustom(key: string | Record<string, any>, value?: any): Record<string, any>
}

/** Registered named queries and API Builder endpoints. A script never supplies SQL itself. */
declare const api: {
  query(queryKey: string, params?: Record<string, any>): Promise<{
    ok: boolean, rows: Array<Record<string, any>>, columns: string[], truncated: boolean, error?: string
  }>
  /** An endpoint from the API Builder, by its address: callEndpoint('employees-by-department', {...}) */
  callEndpoint(slug: string, params?: Record<string, any>): Promise<{
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

/** Options shared by both sizes. The differences are in EXPANDED below. */
const BASE_OPTIONS = {
  fontSize: 13,
  lineNumbers: 'on',
  scrollBeyondLastLine: false,
  automaticLayout: true,
  tabSize: 2,
  wordWrap: 'on',
  minimap: { enabled: false },
  stickyScroll: { enabled: false },
  // The editor affordances a script author expects: folding, bracket matching and
  // colouring, whitespace shown where it is being selected, a highlighted current line.
  folding: true,
  matchBrackets: 'always',
  bracketPairColorization: { enabled: true, independentColorPoolPerBracketType: true },
  // The coloured vertical rules that tie a closing brace back to the line that opened it.
  guides: {
    bracketPairs: 'active',
    bracketPairsHorizontal: 'active',
    indentation: true,
    highlightActiveIndentation: true,
  },
  autoClosingBrackets: 'languageDefined',
  autoIndent: 'full',
  // No formatOnType or formatOnPaste. `value` is controlled, so a formatter edit has to
  // travel out through onChange and back in as a new value; the round trip lands after the
  // next keystroke and drops the cursor. Ctrl+Shift+I still formats on request.
  renderLineHighlight: 'all',
  renderWhitespace: 'selection',
  smoothScrolling: true,
  // Completion, snippets and multi-cursor as VS Code sets them up by default.
  suggestOnTriggerCharacters: true,
  quickSuggestions: true,
  tabCompletion: 'on',
  snippetSuggestions: 'top',
  multiCursorModifier: 'alt',
  linkedEditing: true,
  occurrencesHighlight: 'singleFile',
  selectionHighlight: true,
  padding: { top: 8, bottom: 8 },
  scrollbar: { useShadows: false },
}

/** Room for the things that only earn their space on a full screen. */
const EXPANDED = {
  fontSize: 14,
  minimap: { enabled: true, renderCharacters: false },
  stickyScroll: { enabled: true },
  // 100 characters is where a script body starts being hard to read in a code review.
  rulers: [100],
}

/**
 * Which theme the author last chose, remembered across sessions.
 *
 * Read through try/catch: storage throws outright when a browser is set to block it, and an
 * editor that will not open because it could not read a colour preference is a poor trade.
 */
const THEME_KEY = 'hrsuite.scriptEditor.theme'

function readStoredDark() {
  try {
    const stored = window.localStorage.getItem(THEME_KEY)
    // 'vs-dark' is what an earlier build wrote; honour it rather than resetting the choice.
    return stored === 'dark' || stored === 'vs-dark'
  } catch {
    return false
  }
}

/**
 * `language` is what the editor is editing, not a cosmetic label: it chooses the tokenizer,
 * and the IntelliSense contract below is installed for JavaScript alone. A SQL editor that
 * offered ctx and api completions would be describing a contract SQL does not have.
 */
export function MonacoScriptEditor({
  value,
  onChange,
  height = '360px',
  readOnly = false,
  language = 'javascript',
  context = '',
}) {
  const [expanded, setExpanded] = useState(false)
  const [assistant, setAssistant] = useState(false)

  // What the user has highlighted, mirrored into state so the panel can send it. Held here
  // rather than read on demand because the editor loses its selection the moment the panel's
  // textarea takes focus, which is exactly when the question gets asked.
  const [selection, setSelection] = useState('')
  const [dark, setDark] = useState(readStoredDark)
  const editorRef = useRef(null)
  const caretRef = useRef(null)

  const theme = dark ? DARK_THEME : LIGHT_THEME

  useEffect(() => {
    try {
      window.localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light')
    } catch {
      // A preference that cannot be stored is still honoured for this session.
    }
  }, [dark])

  /*
   * A new options object on every render makes @monaco-editor/react call updateOptions() on
   * every render, which reconfigures the editor mid-keystroke. Only two things can change it.
   */
  const options = useMemo(
    () => (expanded ? { ...BASE_OPTIONS, ...EXPANDED, readOnly } : { ...BASE_OPTIONS, readOnly }),
    [expanded, readOnly],
  )

  /*
   * @monaco-editor/react keeps onChange in the dependency list of the effect that subscribes
   * to onDidChangeModelContent, so an inline arrow tears the subscription down and rebuilds it
   * on every keystroke. Held behind a ref, the handler is registered once and still calls
   * whatever the parent passed most recently.
   */
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])
  const handleChange = useCallback((next) => onChangeRef.current?.(next ?? ''), [])

  // Read inside the key handler so the listener below never has to be re-registered.
  // Written in an effect rather than during render: a render may be discarded, and a
  // keystroke cannot arrive before the commit that this mirrors.
  const expandedRef = useRef(false)
  useEffect(() => {
    expandedRef.current = expanded
  }, [expanded])

  /**
   * Every toolbar button steals focus to be clicked. Hand it straight back to the editor,
   * after the re-render the click caused — focusing before that would land on the old layout.
   */
  const focusEditorSoon = () => {
    requestAnimationFrame(() => editorRef.current?.focus())
  }

  const toggle = () => {
    setExpanded((was) => !was)
    focusEditorSoon()
  }

  const toggleTheme = () => {
    setDark((was) => !was)
    focusEditorSoon()
  }

  /*
   * Comment or uncomment the selected lines — Monaco's own action, the same one Ctrl+/ runs.
   * The button exists because the shortcut is invisible; both end up here.
   *
   * The editor is focused first: commentLine acts on the current selection, and a selection
   * only exists while the editor holds focus.
   */
  /**
   * Puts what the assistant wrote where the caret is.
   *
   * Through Monaco's own edit stack rather than by rewriting `value`: an executeEdits edit
   * is one undo step, so a wrong suggestion is Ctrl+Z away, and the caret stays where the
   * user left it instead of jumping to the end of the document.
   */
  const insertAtCaret = useCallback((text) => {
    const editor = editorRef.current
    if (!editor || readOnly) return

    const selectionRange = editor.getSelection()
    editor.executeEdits('assistant', [{ range: selectionRange, text, forceMoveMarkers: true }])
    editor.focus()
  }, [readOnly])

  const replaceAll = useCallback((text) => {
    const editor = editorRef.current
    if (!editor || readOnly) return

    const model = editor.getModel()
    if (!model) return

    editor.executeEdits('assistant', [{ range: model.getFullModelRange(), text, forceMoveMarkers: true }])
    editor.focus()
  }, [readOnly])

  const commentSelection = () => {
    const editor = editorRef.current
    if (!editor) return
    editor.focus()
    editor.getAction('editor.action.commentLine')?.run()
  }

  /*
   * Escape leaves full screen instead of closing the dialog underneath it.
   *
   * Modal listens for Escape on the document in the CAPTURE phase, so it sees the key before
   * anything inside it does and would close the whole hook — losing an unsaved script. This
   * listener is registered unconditionally at mount rather than when expanded, because React
   * runs a child's effects before its parent's: registering here first is what puts this
   * handler ahead of Modal's in the capture queue. Registering it lazily would put it behind.
   *
   * When not expanded it does nothing at all, and Escape closes the dialog as it always did.
   */
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key !== 'Escape' || !expandedRef.current) return
      e.preventDefault()
      e.stopImmediatePropagation()
      setExpanded(false)
      requestAnimationFrame(() => editorRef.current?.focus())
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [])

  return (
    <div
      className={[
        'script-editor',
        expanded ? 'script-editor--full' : '',
        dark ? 'script-editor--dark' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="script-editor__bar">
        <span className="script-editor__name">{LANGUAGE_LABELS[language] ?? language}</span>
        {readOnly && <span>read only</span>}
        <span className="script-editor__spacer" />
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={commentSelection}
          disabled={readOnly}
          title="Comment or uncomment the selected lines (Ctrl+/)"
        >
          Comment
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => setAssistant((was) => !was)}
          aria-pressed={assistant}
          title={assistant ? 'Hide the assistant' : 'Ask the assistant about this code'}
        >
          {assistant ? 'Hide AI' : 'AI'}
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={toggleTheme}
          aria-pressed={dark}
          title={dark ? 'Switch to the light theme' : 'Switch to the dark theme'}
        >
          {dark ? 'Light' : 'Dark'}
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={toggle}
          aria-pressed={expanded}
          title={expanded ? 'Exit full screen (Esc or F11)' : 'Full screen (F11)'}
        >
          {expanded ? 'Exit full screen' : 'Full screen'}
        </button>
      </div>

      <div className={`script-editor__body${assistant ? ' script-editor__body--split' : ''}`}>
        {/*
          The editor gets a wrapper of our own because @monaco-editor/react sets width:100%
          inline on the element it renders. An inline width beats any class, so without this
          the editor claims the whole row and pushes the assistant off the edge.
        */}
        <div className="script-editor__pane">
        <Editor
          height={expanded ? '100%' : height}
          language={language}
          theme={theme}
          value={value}
          onChange={handleChange}
          onMount={(editor) => {
            editorRef.current = editor

            // The Ln/Col readout is written straight to its node rather than held in state.
            // The cursor moves on every keystroke, and re-rendering this component that often
            // re-rendered <Editor> with it — enough to make the caret stutter and drop
            // characters. Nothing renders from this value, so nothing needs to know it.
            editor.onDidChangeCursorPosition((e) => {
              const node = caretRef.current
              if (node) node.textContent = `Ln ${e.position.lineNumber}, Col ${e.position.column}`
            })

            // Only the selected text, and only when there is one — an empty selection sent
            // as context would have the assistant answering about nothing.
            editor.onDidChangeCursorSelection((e) => {
              const model = editor.getModel()
              setSelection(model && !e.selection.isEmpty() ? model.getValueInRange(e.selection) : '')
            })

            // F11 is the browser's own full-screen key. Monaco handles it first while the
            // editor has focus and stops it there, so the browser never sees it.
            editor.addCommand(monaco.KeyCode.F11, () => setExpanded((was) => !was))

            /*
             * Comment and uncomment, bound as VS Code binds them.
             *
             * Monaco ships Ctrl+/ already, but its default rule resolves KeyCode.Slash against
             * the US layout — on a layout that puts / behind a modifier the shortcut silently
             * does nothing. Binding it here adds a rule of our own at higher precedence, so
             * both routes reach the same action.
             *
             * commentLine works on whatever is selected: no selection comments the current
             * line, a selection spanning lines comments all of them, and running it again on
             * commented lines uncomments them.
             */
            editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Slash, () =>
              editor.getAction('editor.action.commentLine')?.run(),
            )
            editor.addCommand(monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyA, () =>
              editor.getAction('editor.action.blockComment')?.run(),
            )

            // The contract below describes the four objects a SCRIPT is handed. It has
            // nothing to say about a SELECT statement, and installing it while SQL is open
            // would offer completions that are wrong rather than merely unhelpful.
            if (language !== 'javascript' || contractInstalled) return
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
          options={options}
        />
        </div>

        {assistant && (
          <AiAssistPanel
            language={language}
            code={value}
            selection={selection}
            context={context}
            onInsert={insertAtCaret}
            onReplace={replaceAll}
            onClose={() => setAssistant(false)}
          />
        )}
      </div>

      <div className="script-editor__status">
        <span className="script-editor__spacer" />
        <span className="script-editor__hint" ref={caretRef}>
          Ln 1, Col 1
        </span>
        <span>
          Ctrl+/ comment · Shift+Alt+A block · Ctrl+F find ·{' '}
          {expanded ? 'Esc or F11 to exit' : 'F11 full screen'}
        </span>
      </div>
    </div>
  )
}
