import { useCallback, useEffect, useState } from 'react'

export type AsyncDataState<T> =
  | { status: 'loading'; data: T | null; error: null }
  | { status: 'success'; data: T; error: null }
  | { status: 'error'; data: T | null; error: Error }

export function useAsyncData<T>(load: () => Promise<T>) {
  const [version, setVersion] = useState(0)
  const [state, setState] = useState<AsyncDataState<T>>({
    status: 'loading',
    data: null,
    error: null,
  })
  useEffect(() => {
    let active = true
    const timeoutId = window.setTimeout(() => {
      if (!active) return
      setState((current) => ({
        status: 'loading',
        data: current.data,
        error: null,
      }))
      void load().then(
        (data) => {
          if (active) setState({ status: 'success', data, error: null })
        },
        (reason) => {
          if (active)
            setState({
              status: 'error',
              data: null,
              error:
                reason instanceof Error
                  ? reason
                  : new Error('No se pudieron cargar los datos.'),
            })
        },
      )
    }, 0)
    return () => {
      active = false
      window.clearTimeout(timeoutId)
    }
  }, [load, version])
  const refresh = useCallback(() => setVersion((current) => current + 1), [])
  return { ...state, refresh }
}
