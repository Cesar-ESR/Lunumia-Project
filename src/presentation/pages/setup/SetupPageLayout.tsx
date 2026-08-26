import { useEffect, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { APP_NAME } from '@shared/constants'
import { LunumiaBrandSymbol } from '../../components/LunumiaBrandSymbol'
import { RouteFocus } from '../../components/RouteFocus'
import { useApplicationServices } from '../../context/ApplicationServicesContext'
import { requestDirtyNavigation } from '../../utils/dirty-navigation'

export function SetupPageLayout({
  step,
  wide = false,
  children,
}: {
  step: string
  wide?: boolean
  children: ReactNode
}) {
  const services = useApplicationServices()
  const navigate = useNavigate()

  useEffect(() => {
    let disposed = false
    let remove: (() => Promise<void>) | null = null
    void services.backButton
      .subscribe(({ canGoBack }) => {
        const dialogs = document.querySelectorAll<HTMLElement>(
          '[data-native-back-target]',
        )
        const dialog = dialogs.item(dialogs.length - 1)
        if (dialog) {
          dialog.dispatchEvent(new Event('lunumia:native-back'))
          return
        }
        const leave = () => {
          if (canGoBack) navigate(-1)
          else void services.backButton.exitApp()
        }
        if (!requestDirtyNavigation(leave)) leave()
      })
      .then((unsubscribe) => {
        if (disposed) void unsubscribe()
        else remove = unsubscribe
      })
      .catch(() => undefined)
    return () => {
      disposed = true
      if (remove) void remove()
    }
  }, [navigate, services.backButton])

  return (
    <div className={`ln-setup-shell${wide ? ' ln-setup-shell--wide' : ''}`}>
      <header className="ln-setup-brand">
        <LunumiaBrandSymbol />
        <div>
          <strong>{APP_NAME}</strong>
          <span>{step}</span>
        </div>
      </header>
      <main id="main-content" className="ln-setup-main" tabIndex={-1}>
        <RouteFocus />
        {children}
      </main>
    </div>
  )
}
