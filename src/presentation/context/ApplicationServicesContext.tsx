import { createContext, useContext, type ReactNode } from 'react'
import type { ApplicationServices } from '../../app/composition-root'

const ApplicationServicesContext = createContext<ApplicationServices | null>(
  null,
)

export function ApplicationServicesProvider({
  services,
  children,
}: {
  services: ApplicationServices
  children: ReactNode
}) {
  return (
    <ApplicationServicesContext.Provider value={services}>
      {children}
    </ApplicationServicesContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useApplicationServices(): ApplicationServices {
  const services = useContext(ApplicationServicesContext)
  if (!services) {
    throw new Error(
      'useApplicationServices debe usarse dentro de ApplicationServicesProvider.',
    )
  }
  return services
}
