import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client.js'

const EMPTY_PAGE = { items: [], page: 1, pageSize: 25, totalCount: 0, totalPages: 0 }

/**
 * Every list screen uses this, so paging, searching and the busy state behave the same
 * everywhere. There is no unpaged variant on purpose (section 11).
 *
 * `busy` is derived by comparing the query that produced the data in hand against the query
 * currently in effect, rather than kept as a separate flag — that keeps the effect free of
 * synchronous state writes and makes a stale page impossible to render as if it were fresh.
 *
 * @param {string} path e.g. '/hr/employee'
 * @param {object} [extraParams] additional query parameters, merged on every fetch
 */
export function usePagedList(path, extraParams = {}) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [search, setSearch] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState(null)
  const [failure, setFailure] = useState(null)

  const extraKey = JSON.stringify(extraParams ?? {})
  const queryKey = `${path}|${page}|${pageSize}|${search}|${extraKey}|${attempt}`

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false

    api
      .get(path, {
        params: { page, pageSize, search, ...JSON.parse(extraKey) },
        signal: controller.signal,
      })
      .then((result) => {
        if (cancelled) return
        setFailure(null)
        setLoaded({ key: queryKey, data: result ?? EMPTY_PAGE })
      })
      .catch((cause) => {
        if (cancelled || cause?.name === 'AbortError') return
        setFailure({ key: queryKey, error: cause })
        setLoaded({ key: queryKey, data: EMPTY_PAGE })
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [path, page, pageSize, search, extraKey, queryKey])

  const data = loaded?.key === queryKey ? loaded.data : EMPTY_PAGE
  const busy = loaded?.key !== queryKey
  const error = failure?.key === queryKey ? failure.error : null

  const onSearch = useCallback((value) => {
    setSearch(value)
    setPage(1)
  }, [])

  const refresh = useCallback(() => setAttempt((n) => n + 1), [])

  return {
    ...data,
    page,
    pageSize,
    busy,
    error,
    search,
    onSearch,
    setPage,
    setPageSize: useCallback((size) => {
      setPageSize(size)
      setPage(1)
    }, []),
    refresh,
  }
}
