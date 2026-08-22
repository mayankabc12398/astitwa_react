import { useEffect, useRef, useState } from 'react'
import { api } from '../../core/api/client.js'
import { Button } from '../../core/controls/Button.jsx'
import { TextArea } from '../../core/controls/inputs.jsx'

/**
 * The assistant that sits beside the editor.
 *
 * It never talks to Google. It posts what is in the editor and a question to this product's
 * own API, which holds the credential — a service-account key in a browser bundle is a key
 * every user of the product holds, and it grants far more than "ask a model a question".
 *
 * The answer is text with fenced code blocks, rendered here without a Markdown library:
 * only fences matter, because only fences are the thing a user wants to press a button on.
 */
const QUICK_ACTIONS = {
  mysql: [
    { label: 'Explain', question: 'Explain what this statement returns, in three sentences.' },
    { label: 'Check rules', question: 'Would the server accept this? Check the one-statement, tenant token, parameter and column-alias rules, and show a corrected version if not.' },
    { label: 'Optimise', question: 'Rewrite this so it reads the same rows with less work. Say which index would help.' },
  ],
  javascript: [
    { label: 'Explain', question: 'Explain what this script does, in three sentences.' },
    { label: 'Review', question: 'Review this script against the sandbox contract. Point out anything that would fail at runtime, and show a corrected version.' },
    { label: 'Add errors', question: 'Rewrite this so every call that can fail is handled and the user is told what happened.' },
  ],
}

/** Splits an answer into prose and fenced code, so the code can carry its own buttons. */
function segments(text) {
  const parts = []
  const fence = /```(\w*)\n([\s\S]*?)```/g
  let last = 0
  let match

  while ((match = fence.exec(text)) !== null) {
    if (match.index > last) parts.push({ kind: 'text', body: text.slice(last, match.index) })
    parts.push({ kind: 'code', body: match[2].replace(/\n$/, '') })
    last = fence.lastIndex
  }

  if (last < text.length) parts.push({ kind: 'text', body: text.slice(last) })
  return parts
}

export function AiAssistPanel({ language, code, selection, context, onInsert, onReplace, onClose }) {
  const [available, setAvailable] = useState(null)
  const [model, setModel] = useState('')
  const [turns, setTurns] = useState([])
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const endRef = useRef(null)

  // The answer as it is being written, revealed a few characters at a time.
  const [streaming, setStreaming] = useState('')

  /*
   * Why the text is not simply rendered as it arrives.
   *
   * Vertex sends whole sentences at a time, so painting each event as it lands makes the
   * answer appear in lurches — three words, a pause, a paragraph. `target` holds everything
   * received; `shown` is how much of it the reader has been given, and the frame loop moves
   * the second towards the first at a steady rate. The text arrives exactly as fast as
   * before; it just stops arriving in steps.
   */
  const targetRef = useRef('')
  const shownRef = useRef(0)
  const frameRef = useRef(0)
  const abortRef = useRef(null)

  // Read through refs: the panel is mounted for as long as the editor is open, and a send
  // has to carry what the editor holds NOW, not what it held when this component rendered.
  const codeRef = useRef(code)
  const selectionRef = useRef(selection)
  useEffect(() => {
    codeRef.current = code
  }, [code])
  useEffect(() => {
    selectionRef.current = selection
  }, [selection])

  useEffect(() => {
    const controller = new AbortController()
    api
      .get('/ai/status', { signal: controller.signal })
      .then((data) => {
        setAvailable(Boolean(data?.available))
        setModel(data?.model ?? '')
      })
      .catch(() => setAvailable(false))
    return () => controller.abort()
  }, [])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [turns, busy, streaming])

  // A question asked and left, or a screen closed mid-answer: stop the frame loop and drop
  // the request rather than leave either running against a component nobody is looking at.
  useEffect(
    () => () => {
      cancelAnimationFrame(frameRef.current)
      abortRef.current?.abort()
    },
    [],
  )

  async function ask(text) {
    const asked = (text ?? question).trim()
    if (!asked || busy) return

    setError('')
    setBusy(true)
    // The question joins the thread before the answer arrives, so the panel shows what was
    // asked while it is being answered rather than going blank.
    const history = turns.map((t) => ({ role: t.role, text: t.text }))
    setTurns((current) => [...current, { role: 'user', text: asked }])
    setQuestion('')

    targetRef.current = ''
    shownRef.current = 0
    setStreaming('')

    const controller = new AbortController()
    abortRef.current = controller

    /*
     * The reveal.
     *
     * Each frame moves the shown length a fraction of the way towards what has arrived, with
     * a floor of one character so it never stalls and a ceiling so a large chunk landing at
     * once does not simply appear. The fraction is what makes it settle rather than race: the
     * further behind it is, the faster it catches up.
     */
    const tick = () => {
      const target = targetRef.current.length
      const shown = shownRef.current

      if (shown < target) {
        const step = Math.max(1, Math.min(12, Math.ceil((target - shown) / 8)))
        shownRef.current = shown + step
        setStreaming(targetRef.current.slice(0, shownRef.current))
      }

      frameRef.current = requestAnimationFrame(tick)
    }
    frameRef.current = requestAnimationFrame(tick)

    let failed = null

    try {
      await api.stream(
        '/ai/assist/stream',
        {
          language,
          code: codeRef.current ?? '',
          selection: selectionRef.current ?? '',
          question: asked,
          context: context ?? '',
          history,
        },
        (event) => {
          if (event.type === 'chunk') targetRef.current += event.text
          else if (event.type === 'error') failed = event.text
        },
        { signal: controller.signal },
      )
    } catch (cause) {
      if (cause?.name !== 'AbortError') failed = cause?.message ?? 'The assistant could not be reached.'
    }

    cancelAnimationFrame(frameRef.current)
    abortRef.current = null

    // The thread takes the whole answer, so what stays on screen is not left mid-reveal.
    const answer = targetRef.current
    targetRef.current = ''
    shownRef.current = 0
    setStreaming('')
    setBusy(false)

    if (failed) setError(failed)
    else if (answer) setTurns((current) => [...current, { role: 'model', text: answer }])
  }

  const actions = QUICK_ACTIONS[language] ?? QUICK_ACTIONS.javascript

  return (
    <aside className="ai-panel" aria-label="Assistant">
      <div className="ai-panel__bar">
        <span className="ai-panel__spark" aria-hidden="true">
          ✦
        </span>
        <strong className="ai-panel__title">Assistant</strong>
        {model && <span className="ai-panel__model">{model}</span>}
        <span className="ai-panel__spacer" />
        <button type="button" className="ai-panel__close" onClick={onClose} title="Hide the assistant">
          ✕
        </button>
      </div>

      {available === false && (
        <div className="ai-panel__empty">
          Vertex AI is not configured on this server. Set VertexAi:CredentialsPath and restart the API.
        </div>
      )}

      {available && (
        <>
          <div className="ai-panel__thread">
            {turns.length === 0 && (
              <div className="ai-panel__empty">
                Ask about what is in the editor. It is sent with every question, and the selection too when
                there is one.
              </div>
            )}

            {turns.map((turn, index) => (
              <div key={index} className={`ai-turn ai-turn--${turn.role}`}>
                <span className="ai-turn__who">{turn.role === 'user' ? 'You' : 'Assistant'}</span>
                {turn.role === 'user' ? (
                  <p className="ai-turn__text">{turn.text}</p>
                ) : (
                  segments(turn.text).map((part, i) =>
                    part.kind === 'code' ? (
                      <div className="ai-code" key={i}>
                        <div className="ai-code__bar">
                          <span className="ai-code__lang">{language === 'mysql' ? 'MySQL' : 'JavaScript'}</span>
                          <span className="ai-code__lines">{part.body.split(/\n/).length} lines</span>
                        </div>
                        <pre>{part.body}</pre>
                        <div className="ai-code__actions">
                          <button
                            type="button"
                            className="ai-chip ai-chip--mint"
                            onClick={() => onInsert?.(part.body)}
                            title="Insert at the caret — one undo step"
                          >
                            Insert
                          </button>
                          <button
                            type="button"
                            className="ai-chip ai-chip--peach"
                            onClick={() => onReplace?.(part.body)}
                            title="Replace the whole editor"
                          >
                            Replace all
                          </button>
                          <button
                            type="button"
                            className="ai-chip ai-chip--sky"
                            onClick={() => navigator.clipboard?.writeText(part.body)}
                          >
                            Copy
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="ai-turn__text" key={i}>
                        {part.body.trim()}
                      </p>
                    ),
                  )
                )}
              </div>
            ))}

            {streaming && (
              <div className="ai-turn ai-turn--model">
                <span className="ai-turn__who">Assistant</span>
                {/*
                  Rendered as plain text while it is arriving rather than through segments():
                  a fence that has been opened and not yet closed is not a code block, and
                  showing it as one makes the panel flicker between two layouts on every frame.
                */}
                <p className="ai-turn__text ai-turn__text--live">
                  {streaming}
                  <span className="ai-caret" aria-hidden="true" />
                </p>
              </div>
            )}

            {busy && !streaming && (
              <div className="ai-typing" aria-live="polite">
                <span />
                <span />
                <span />
              </div>
            )}
            {error && <div className="ai-panel__error">{error}</div>}
            <div ref={endRef} />
          </div>

          <div className="ai-panel__actions">
            {actions.map((action, index) => (
              <button
                key={action.label}
                type="button"
                // The tint is positional rather than semantic: three actions, three colours,
                // so the eye can find "the middle one" again without reading the labels.
                className={`ai-chip ${['ai-chip--lav', 'ai-chip--mint', 'ai-chip--peach'][index % 3]}`}
                disabled={busy}
                onClick={() => ask(action.question)}
              >
                {action.label}
              </button>
            ))}
          </div>

          <div className="ai-panel__ask">
            <TextArea
              rows={3}
              value={question}
              placeholder="Ask, or describe what you want written…"
              aria-label="Ask the assistant"
              disabled={busy}
              onChange={(e) => setQuestion(e.target.value)}
              // Enter sends, Shift+Enter is a newline — the way every chat box behaves, and
              // the reason the textarea is not inside a form: a form would submit the screen.
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  ask()
                }
              }}
            />
            <div className="ai-panel__send">
              <span className="ai-panel__hint">Enter sends · Shift+Enter newline</span>
              {busy ? (
                // Stopping keeps what has arrived so far: the stream ends, and the partial
                // answer lands in the thread like any other.
                <Button size="sm" onClick={() => abortRef.current?.abort()}>
                  Stop
                </Button>
              ) : (
                <Button variant="primary" size="sm" onClick={() => ask()}>
                  Send
                </Button>
              )}
            </div>
          </div>
        </>
      )}
    </aside>
  )
}
