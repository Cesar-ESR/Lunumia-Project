export type GuardedNavigation = () => void
type DirtyNavigationHandler = (navigation: GuardedNavigation) => void

let activeHandler: DirtyNavigationHandler | null = null

export function registerDirtyNavigation(
  handler: DirtyNavigationHandler,
): () => void {
  activeHandler = handler
  return () => {
    if (activeHandler === handler) activeHandler = null
  }
}

export function requestDirtyNavigation(navigation: GuardedNavigation): boolean {
  if (!activeHandler) return false
  activeHandler(navigation)
  return true
}
