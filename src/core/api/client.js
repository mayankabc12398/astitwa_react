import { ApiError } from './ApiError.js'

/**
 * The one place that talks to the server.
 *
 * Paths are always relative — '/hr/employee', never 'https://localhost:7272/...'. Vite
 * proxies /api to Kestrel in development and the same origin serves both in production,
 * so no component ever learns where the API lives.
 */
const BASE = (import.meta.env.VITE_API_BASE ?? '/api').replace(/\/+$/, '')

const TOKEN_KEY = 'demoHospital.token'

let onUnauthorized = null

/** Called by AuthProvider so an expired token can bounce the user to the sign-in screen. */
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler
}

export function getToken() {
  try {
    return window.localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token) {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token)
    else window.localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* private mode: the session simply does not survive a reload */
  }
}

function buildUrl(path, params) {
  const url = `${BASE}${path.startsWith('/') ? path : `/${path}`}`
  if (!params) return url

  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    search.append(key, String(value))
  }
  const query = search.toString()
  return query ? `${url}?${query}` : url
}

async function request(method, path, { body, params, signal } = {}) {
  const headers = { Accept: 'application/json' }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  let response
  try {
    response = await fetch(buildUrl(path, params), {
      method,
      headers,
      signal,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (cause) {
    if (cause?.name === 'AbortError') throw cause
    throw new ApiError({ status: 0, code: 'NETWORK', message: 'The server could not be reached.' })
  }

  if (response.status === 204) return null

  let envelope = null
  const text = await response.text()
  if (text) {
    try {
      envelope = JSON.parse(text)
    } catch {
      envelope = null
    }
  }

  if (response.status === 401) {
    onUnauthorized?.()
  }

  if (!response.ok || envelope?.success === false) {
    throw new ApiError({
      status: response.status,
      code: envelope?.error?.code,
      message: envelope?.error?.message,
      fields: envelope?.error?.fields ?? [],
      traceId: envelope?.traceId ?? '',
    })
  }

  // Unwrap the envelope so screens work with data, not with transport.
  return envelope && Object.prototype.hasOwnProperty.call(envelope, 'data') ? envelope.data : envelope
}

/**
 * A POST whose response is read as it arrives, one server-sent event at a time.
 *
 * Written here rather than in the screen that wanted it so the token, the base path and the
 * 401 handling are the same as every other call — a second place that knows how to reach the
 * server is a second place to forget one of those.
 *
 * fetch rather than EventSource: EventSource cannot carry an Authorization header, and every
 * endpoint in this product is behind one.
 *
 * @param {string} path
 * @param {object} body
 * @param {(event: {type: string, text: string}) => void} onEvent
 */
export async function stream(path, body, onEvent, { signal } = {}) {
  const headers = { Accept: 'text/event-stream', 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`

  let response
  try {
    response = await fetch(buildUrl(path), { method: 'POST', headers, body: JSON.stringify(body), signal })
  } catch (cause) {
    if (cause?.name === 'AbortError') throw cause
    throw new ApiError({ status: 0, code: 'NETWORK', message: 'The server could not be reached.' })
  }

  if (response.status === 401) onUnauthorized?.()

  if (!response.ok || !response.body) {
    // A failure arrives as the ordinary envelope, not as events.
    let envelope = null
    try {
      envelope = JSON.parse(await response.text())
    } catch {
      envelope = null
    }
    throw new ApiError({
      status: response.status,
      code: envelope?.error?.code,
      message: envelope?.error?.message,
      traceId: envelope?.traceId ?? '',
    })
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })

    // Events are separated by a blank line. Anything after the last one is a partial event
    // and stays in the buffer — dispatching it would hand the caller half a word.
    const events = buffer.split(/\n\n/)
    buffer = events.pop() ?? ''

    for (const event of events) {
      const line = event.split(/\n/).find((l) => l.startsWith('data:'))
      if (!line) continue
      try {
        onEvent(JSON.parse(line.slice(5).trim()))
      } catch {
        // A malformed event is skipped rather than ending the stream.
      }
    }
  }
}

export const api = {
  stream,
  get: (path, options) => request('GET', path, options),
  post: (path, body, options) => request('POST', path, { ...options, body }),
  put: (path, body, options) => request('PUT', path, { ...options, body }),
  del: (path, options) => request('DELETE', path, options),
}
