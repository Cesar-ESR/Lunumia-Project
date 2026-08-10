import { useInstallPrompt } from '../hooks/useInstallPrompt'

export function InstallAppButton() {
  const { canInstall, install, isInstalling } = useInstallPrompt()
  if (!canInstall) return null
  return (
    <button
      className="button secondary"
      type="button"
      disabled={isInstalling}
      onClick={() => void install()}
    >
      {isInstalling ? 'Instalando…' : 'Instalar app'}
    </button>
  )
}
