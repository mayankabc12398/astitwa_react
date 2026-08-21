import { ApiError } from './ApiError.js'

/**
 * The one place that talks to the server.
 *
 * Paths are always relative — '/hr/employee', never 'https://localhost:7272/...'. Vite
 * proxies /api to Kestrel in development and the same origin serves both in production,
 * so no component ever learns where the API lives.
 */
const BASE = (import.meta.env.VITE_API_BASE ?? '/api').replace(/\/+$/, '')

const TOKEN_KEY = 'hrsuite.token'

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

export const api = {
  get: (path, options) => request('GET', path, options),
  post: (path, body, options) => request('POST', path, { ...options, body }),
  put: (path, body, options) => request('PUT', path, { ...options, body }),
  del: (path, options) => request('DELETE', path, options),
}
