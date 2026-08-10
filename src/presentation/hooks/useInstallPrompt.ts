import { useCallback, useEffect, useState } from 'react'

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export function useInstallPrompt() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(
    null,
  )
  const [isInstalling, setIsInstalling] = useState(false)
  useEffect(() => {
    const handlePrompt = (event: Event) => {
      event.preventDefault()
      setPromptEvent(event as InstallPromptEvent)
    }
    const handleInstalled = () => setPromptEvent(null)
    window.addEventListener('beforeinstallprompt', handlePrompt)
    window.addEventListener('appinstalled', handleInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', handlePrompt)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])
  const install = useCallback(async () => {
    if (!promptEvent || isInstalling) return false
    setIsInstalling(true)
    try {
      await promptEvent.prompt()
      const choice = await promptEvent.userChoice
      return choice.outcome === 'accepted'
    } catch {
      return false
    } finally {
      setPromptEvent(null)
      setIsInstalling(false)
    }
  }, [isInstalling, promptEvent])
  return { canInstall: promptEvent !== null, install, isInstalling }
}
