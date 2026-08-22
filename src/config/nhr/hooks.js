import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Fetch with loading and error state.
 * usage: const { data, loading, reload } = useApi(() => api.getLetters(), []);
 *
 * Reworked from the source version on two points its own lint did not catch:
 *
 *  * The fetcher was written to a ref DURING render. A callers passes a fresh arrow every
 *    render, so that was a render-phase mutation; it is now assigned in an effect.
 *  * `loading` was a flag set synchronously at the top of the effect, which forces a second
 *    render before anything has been fetched. It is derived instead, by comparing the
 *    request that produced the data in hand against the one currently in effect — the same
 *    way usePagedList derives its busy flag, and it makes a stale result impossible to
 *    render as though it were fresh.
 */
export function useApi(fetcher, deps = []) {
  const [loaded, setLoaded] = useState(null);
  const [failure, setFailure] = useState(null);
  const [tick, setTick] = useState(0);
  const fetcherRef = useRef(fetcher);

  const key = JSON.stringify([deps, tick]);

  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  useEffect(() => {
    let alive = true;

    fetcherRef.current()
      .then((d) => {
        if (!alive) return;
        setFailure(null);
        setLoaded({ key, data: d });
      })
      .catch((e) => {
        if (!alive) return;
        setFailure({ key, error: e });
        setLoaded({ key, data: null });
      });

    return () => { alive = false; };
  }, [key]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  const setData = useCallback((next) => {
    setLoaded((current) => ({
      key: current?.key ?? key,
      data: typeof next === 'function' ? next(current?.data ?? null) : next,
    }));
  }, [key]);

  return {
    data: loaded?.key === key ? loaded.data : null,
    loading: loaded?.key !== key,
    error: failure?.key === key ? failure.error : null,
    reload,
    setData,
  };
}

// Close on click outside
export function useClickOutside(ref, onClose) {
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [ref, onClose]);
}

// Escape key
export function useEscape(onClose, active = true) {
  useEffect(() => {
    if (!active) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose, active]);
}

// Debounced value
export function useDebounce(value, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

// Lock body scroll while a modal/drawer is open
export function useBodyLock(locked) {
  useEffect(() => {
    if (!locked) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [locked]);
}
