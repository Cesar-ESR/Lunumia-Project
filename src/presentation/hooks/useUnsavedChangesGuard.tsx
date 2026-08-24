import { useCallback, useEffect, useState } from 'react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import {
  registerDirtyNavigation,
  type GuardedNavigation,
} from '../utils/dirty-navigation'

interface PendingNavigation {
  run: GuardedNavigation
}

export function useUnsavedChangesGuard({
  dirty,
  pending = false,
  onDiscard,
}: {
  dirty: boolean
  pending?: boolean
  onDiscard?(): void
}) {
  const [pendingNavigation, setPendingNavigation] =
    useState<PendingNavigation | null>(null)

  const requestLeave = useCallback(
    (navigation: GuardedNavigation) => {
      if (pending) return
      if (!dirty) {
        navigation()
        return
      }
      setPendingNavigation({ run: navigation })
    },
    [dirty, pending],
  )

  useEffect(() => {
    if (!dirty && !pending) return
    return registerDirtyNavigation(requestLeave)
  }, [dirty, pending, requestLeave])

  useEffect(() => {
    if (!dirty && !pending) return
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [dirty, pending])

  const guardDialog = (
    <ConfirmDialog
      open={pendingNavigation !== null}
      title="¿Salir sin guardar?"
      description="Los cambios que hiciste en este formulario se perderán."
      confirmLabel="Salir"
      onCancel={() => setPendingNavigation(null)}
      onConfirm={() => {
        const navigation = pendingNavigation?.run
        setPendingNavigation(null)
        onDiscard?.()
        navigation?.()
      }}
    />
  )

  return { requestLeave, guardDialog }
}
