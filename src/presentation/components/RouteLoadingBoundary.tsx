import { Suspense, type ReactNode } from 'react'
import { LoadingState } from './LoadingState'

export function RouteLoadingBoundary({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<LoadingState message="Cargando sección…" />}>
      {children}
    </Suspense>
  )
}
