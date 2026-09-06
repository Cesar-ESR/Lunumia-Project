import { useEffect, type ReactNode } from 'react'
import { useApplicationServices } from '../context/ApplicationServicesContext'
import { useOptionalSync } from '../context/SyncContext'
import { useTheme } from '../context/ThemeContext'

export function ThemeSettingsBridge({ children }: { children: ReactNode }) {
  const services = useApplicationServices()
  const sync = useOptionalSync()
  const { setPreference } = useTheme()
  const lastSuccessfulSyncAt = sync?.lastSuccessfulSyncAt ?? null

  useEffect(() => {
    let active = true
    void services.settings.getUserSettings
      .execute()
      .then((settings) => {
        if (active) setPreference(settings?.theme ?? 'system')
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [lastSuccessfulSyncAt, services, setPreference])

  return children
}
